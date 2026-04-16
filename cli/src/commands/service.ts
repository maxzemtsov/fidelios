import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execSync, execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { resolveFideliOSInstanceRoot } from "../config/home.js";

const LAUNCHD_LABEL = "nl.fidelios.server";
const PLIST_PATH = path.resolve(os.homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
const SYSTEMD_UNIT_DIR = path.resolve(os.homedir(), ".config", "systemd", "user");
const SYSTEMD_UNIT_PATH = path.resolve(SYSTEMD_UNIT_DIR, "fidelios.service");
const PRODUCTION_PORT = 3100;

export type ServiceMode = "release" | "dev";

type Platform = "macos" | "linux" | "unsupported";

interface ServiceModeState {
  mode: ServiceMode;
  repoDir?: string;
}

function detectPlatform(): Platform {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "linux") return "linux";
  return "unsupported";
}

function resolveBinary(name: string): string {
  try {
    return execSync(`which ${name}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return name;
  }
}

function resolveLogPath(): string {
  const instanceRoot = resolveFideliOSInstanceRoot("default");
  return path.resolve(instanceRoot, "fidelios.log");
}

function serviceModeStatePath(): string {
  return path.resolve(resolveFideliOSInstanceRoot("default"), "service-mode.json");
}

function readServiceModeState(): ServiceModeState | null {
  const statePath = serviceModeStatePath();
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (raw && typeof raw === "object") {
      const mode = raw.mode === "dev" ? "dev" : "release";
      const repoDir = typeof raw.repoDir === "string" ? raw.repoDir : undefined;
      return { mode, repoDir };
    }
  } catch {
    // corrupt state file — ignore
  }
  return null;
}

async function writeServiceModeState(state: ServiceModeState): Promise<void> {
  const statePath = serviceModeStatePath();
  await fsp.mkdir(path.dirname(statePath), { recursive: true });
  await fsp.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

// Walks up from `startDir` looking for a FideliOS monorepo root: package.json
// with `"name": "fidelios"` that owns scripts/dev-runner.mjs. Returns null when
// the starting dir is not inside a checkout.
function findFideliosRepoRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;
  while (current !== root) {
    const pkgPath = path.join(current, "package.json");
    const devRunnerPath = path.join(current, "scripts", "dev-runner.mjs");
    if (fs.existsSync(pkgPath) && fs.existsSync(devRunnerPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg?.name === "fidelios") return current;
      } catch {
        // not a JSON file we can read — continue walking
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function resolveDevRepoDir(providedPath: string | undefined): string | null {
  if (providedPath) {
    const absolute = path.resolve(providedPath);
    const validated = findFideliosRepoRoot(absolute);
    if (validated) return validated;
    return null;
  }
  const fromCwd = findFideliosRepoRoot(process.cwd());
  if (fromCwd) return fromCwd;
  const defaultGuess = path.join(os.homedir(), "fidelios");
  const validatedGuess = findFideliosRepoRoot(defaultGuess);
  return validatedGuess;
}

export function buildServicePath(nodeBin: string): string {
  const homeDir = os.homedir();
  const nodeBinDir = path.dirname(nodeBin);
  // Order matters: node first, then common adapter CLI locations, then system dirs.
  // launchd/systemd start with an empty PATH, so anything the server shells out to
  // (claude, codex, gh, git, brew, ...) must resolve via this list.
  const candidates = [
    nodeBinDir,
    path.join(homeDir, ".claude", "local", "bin"),
    path.join(homeDir, ".codex", "bin"),
    path.join(homeDir, ".cargo", "bin"),
    path.join(homeDir, ".npm-global", "bin"),
    path.join(homeDir, ".nvm", "versions", "node", "current", "bin"),
    path.join(homeDir, "bin"),
    path.join(homeDir, ".local", "bin"),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/usr/sbin",
    "/bin",
    "/sbin",
  ];
  // Dedupe while preserving order.
  const seen = new Set<string>();
  return candidates.filter((dir) => (seen.has(dir) ? false : (seen.add(dir), true))).join(":");
}

interface PlistOptions {
  mode?: ServiceMode;
  repoDir?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPlistProgramArgs(nodeBin: string, fideliosBin: string, opts: PlistOptions): string[] {
  if (opts.mode === "dev") {
    if (!opts.repoDir) {
      throw new Error("dev mode plist requires repoDir");
    }
    const devRunner = path.join(opts.repoDir, "scripts", "dev-runner.mjs");
    return [nodeBin, devRunner, "watch"];
  }
  return [nodeBin, fideliosBin, "run"];
}

export function buildPlist(
  nodeBin: string,
  fideliosBin: string,
  logPath: string,
  opts: PlistOptions = {},
): string {
  const homeDir = os.homedir();
  const mode = opts.mode ?? "release";
  const servicePath = buildServicePath(nodeBin);
  const workingDir = mode === "dev" && opts.repoDir ? opts.repoDir : homeDir;
  const programArgs = renderPlistProgramArgs(nodeBin, fideliosBin, { mode, repoDir: opts.repoDir });
  const nodeEnvValue = mode === "dev" ? "development" : "production";
  const programArgsXml = programArgs
    .map((arg) => `        <string>${escapeXml(arg)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
${programArgsXml}
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${escapeXml(servicePath)}</string>
        <key>HOME</key>
        <string>${escapeXml(homeDir)}</string>
        <key>NODE_ENV</key>
        <string>${nodeEnvValue}</string>
        <key>FIDELIOS_SERVICE_MODE</key>
        <string>${mode}</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>${escapeXml(workingDir)}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>${escapeXml(logPath)}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(logPath)}</string>
</dict>
</plist>
`;
}

interface SystemdOptions {
  mode?: ServiceMode;
  repoDir?: string;
}

export function buildSystemdUnit(fideliosBin: string, logPath: string, opts: SystemdOptions = {}): string {
  const homeDir = os.homedir();
  const nodeBin = resolveBinary("node");
  const servicePath = buildServicePath(nodeBin);
  const mode = opts.mode ?? "release";
  const execStart = mode === "dev" && opts.repoDir
    ? `${nodeBin} ${path.join(opts.repoDir, "scripts", "dev-runner.mjs")} watch`
    : `${nodeBin} ${fideliosBin} run`;
  const workingDir = mode === "dev" && opts.repoDir ? opts.repoDir : homeDir;
  const nodeEnvValue = mode === "dev" ? "development" : "production";
  return `[Unit]
Description=FideliOS Server (${mode})
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
WorkingDirectory=${workingDir}
Environment=NODE_ENV=${nodeEnvValue}
Environment=FIDELIOS_SERVICE_MODE=${mode}
Environment=HOME=${homeDir}
Environment=PATH=${servicePath}
Restart=always
RestartSec=10
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket
      .on("connect", () => {
        socket.destroy();
        resolve(true);
      })
      .on("timeout", () => {
        socket.destroy();
        resolve(false);
      })
      .on("error", () => {
        resolve(false);
      })
      .connect(port, "127.0.0.1");
  });
}

// ── install ──────────────────────────────────────────────────────────────────

interface ServiceInstallOptions {
  mode?: ServiceMode;
  repoDir?: string;
}

function resolveModeAndRepo(options: ServiceInstallOptions): { mode: ServiceMode; repoDir?: string } {
  const mode = options.mode ?? "release";
  if (mode !== "dev") return { mode };
  const repoDir = resolveDevRepoDir(options.repoDir);
  if (!repoDir) {
    p.log.error(
      `Could not locate a FideliOS monorepo. Pass --repo <path> or cd into the repo and re-run.\n` +
        `Looked for scripts/dev-runner.mjs next to package.json with "name": "fidelios".`,
    );
    process.exit(1);
  }
  return { mode, repoDir };
}

export async function serviceInstall(options: ServiceInstallOptions = {}): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" fidelios service install ")));

  const platform = detectPlatform();
  if (platform === "unsupported") {
    p.log.error("Service mode is only supported on macOS and Linux.");
    process.exit(1);
  }

  const { mode, repoDir } = resolveModeAndRepo(options);
  const nodeBin = resolveBinary("node");
  const fideliosBin = resolveBinary("fidelios");
  const logPath = resolveLogPath();

  if (platform === "macos") {
    await installMacOS(nodeBin, fideliosBin, logPath, mode, repoDir);
  } else {
    await installLinux(fideliosBin, logPath, mode, repoDir);
  }

  await writeServiceModeState({ mode, ...(repoDir ? { repoDir } : {}) });
}

async function installMacOS(
  nodeBin: string,
  fideliosBin: string,
  logPath: string,
  mode: ServiceMode,
  repoDir: string | undefined,
): Promise<void> {
  p.log.step(`Installing launchd service: ${LAUNCHD_LABEL} (${mode} mode)`);

  // Ensure log directory exists
  await fsp.mkdir(path.dirname(logPath), { recursive: true });

  // Ensure LaunchAgents dir exists
  await fsp.mkdir(path.dirname(PLIST_PATH), { recursive: true });

  // Unload first if already loaded (ignore errors)
  try {
    execFileSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
  } catch {
    // not loaded yet — fine
  }

  const plist = buildPlist(nodeBin, fideliosBin, logPath, { mode, repoDir });
  await fsp.writeFile(PLIST_PATH, plist, "utf8");
  p.log.message(pc.dim(`Plist written: ${PLIST_PATH}`));
  if (mode === "dev") {
    p.log.message(pc.dim(`Dev-mode repo:  ${repoDir}`));
  }

  const spinner = p.spinner();
  spinner.start("Loading service with launchctl...");
  try {
    execFileSync("launchctl", ["load", PLIST_PATH]);
    spinner.stop(pc.green("Service registered."));
  } catch (err) {
    spinner.stop(pc.red("launchctl load failed."));
    p.log.error(String(err));
    process.exit(1);
  }

  // RunAtLoad=true should start the service on `load`, but that only fires once per
  // user session. `kickstart -k` force-restarts it to guarantee it runs right now
  // even when the user previously uninstalled a stale copy in the same session.
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (uid !== null) {
    const target = `gui/${uid}/${LAUNCHD_LABEL}`;
    try {
      execFileSync("launchctl", ["kickstart", "-k", target], { stdio: "ignore" });
      p.log.success(pc.green("Service started."));
    } catch {
      p.log.warn(pc.yellow("Could not force-start the service — check `fidelios service status`."));
    }
  }

  p.log.message(pc.dim(`Logs: tail -f ${logPath}`));
  p.outro(pc.green("FideliOS service installed. It will restart automatically on crash and at login."));
}

async function installLinux(
  fideliosBin: string,
  logPath: string,
  mode: ServiceMode,
  repoDir: string | undefined,
): Promise<void> {
  p.log.step(`Installing systemd user unit: fidelios.service (${mode} mode)`);

  await fsp.mkdir(path.dirname(logPath), { recursive: true });
  await fsp.mkdir(SYSTEMD_UNIT_DIR, { recursive: true });

  const unit = buildSystemdUnit(fideliosBin, logPath, { mode, repoDir });
  await fsp.writeFile(SYSTEMD_UNIT_PATH, unit, "utf8");
  p.log.message(pc.dim(`Unit written: ${SYSTEMD_UNIT_PATH}`));
  if (mode === "dev") {
    p.log.message(pc.dim(`Dev-mode repo: ${repoDir}`));
  }

  const spinner = p.spinner();
  spinner.start("Enabling and starting service...");
  try {
    execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
    execFileSync("systemctl", ["--user", "enable", "--now", "fidelios"], { stdio: "ignore" });
    spinner.stop(pc.green("Service enabled and started."));
  } catch (err) {
    spinner.stop(pc.red("systemctl failed."));
    p.log.error(String(err));
    process.exit(1);
  }

  p.log.message(pc.dim(`Logs: tail -f ${logPath}`));
  p.outro(pc.green("FideliOS service installed. It will start automatically on login."));
}

// ── switch ───────────────────────────────────────────────────────────────────

export async function serviceSwitch(options: { mode: ServiceMode; repoDir?: string }): Promise<void> {
  p.intro(pc.bgCyan(pc.black(` fidelios service switch → ${options.mode} `)));

  const platform = detectPlatform();
  if (platform === "unsupported") {
    p.log.error("Service mode is only supported on macOS and Linux.");
    process.exit(1);
  }

  const platformArtifactExists = platform === "macos" ? fs.existsSync(PLIST_PATH) : fs.existsSync(SYSTEMD_UNIT_PATH);
  if (!platformArtifactExists) {
    p.log.warn("No service currently installed — running `fidelios service install` instead.");
    await serviceInstall(options);
    return;
  }

  const previous = readServiceModeState();
  let resolvedRepoDir: string | undefined;
  if (options.mode === "dev") {
    const found = resolveDevRepoDir(options.repoDir ?? previous?.repoDir);
    if (!found) {
      p.log.error(
        `Could not locate a FideliOS monorepo. Pass --repo <path> or cd into the repo and re-run.`,
      );
      process.exit(1);
    }
    resolvedRepoDir = found;
  }

  const nodeBin = resolveBinary("node");
  const fideliosBin = resolveBinary("fidelios");
  const logPath = resolveLogPath();

  if (platform === "macos") {
    // Rewrite plist, reload, kickstart.
    try {
      execFileSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
    } catch {
      // not loaded — fine
    }
    const plist = buildPlist(nodeBin, fideliosBin, logPath, {
      mode: options.mode,
      repoDir: resolvedRepoDir,
    });
    await fsp.writeFile(PLIST_PATH, plist, "utf8");
    p.log.message(pc.dim(`Rewrote ${PLIST_PATH}`));
    try {
      execFileSync("launchctl", ["load", PLIST_PATH]);
    } catch (err) {
      p.log.error(`launchctl load failed: ${String(err)}`);
      process.exit(1);
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (uid !== null) {
      try {
        execFileSync("launchctl", ["kickstart", "-k", `gui/${uid}/${LAUNCHD_LABEL}`], { stdio: "ignore" });
      } catch {
        p.log.warn("Could not kickstart — check `fidelios service status`.");
      }
    }
  } else {
    const unit = buildSystemdUnit(fideliosBin, logPath, {
      mode: options.mode,
      repoDir: resolvedRepoDir,
    });
    await fsp.writeFile(SYSTEMD_UNIT_PATH, unit, "utf8");
    p.log.message(pc.dim(`Rewrote ${SYSTEMD_UNIT_PATH}`));
    try {
      execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
      execFileSync("systemctl", ["--user", "restart", "fidelios"], { stdio: "ignore" });
    } catch (err) {
      p.log.error(`systemctl restart failed: ${String(err)}`);
      process.exit(1);
    }
  }

  await writeServiceModeState({
    mode: options.mode,
    ...(resolvedRepoDir ? { repoDir: resolvedRepoDir } : {}),
  });

  if (options.mode === "dev") {
    p.log.success(pc.green(`Switched to dev mode. Server runs via ${resolvedRepoDir}/scripts/dev-runner.mjs watch.`));
    p.log.message(pc.dim("The Auto-Restart Dev Server When Idle toggle in Settings → Experimental now applies."));
  } else {
    p.log.success(pc.green(`Switched to release mode (published fidelios binary).`));
  }
  p.outro("Done.");
}

// ── uninstall ────────────────────────────────────────────────────────────────

export async function serviceUninstall(): Promise<void> {
  p.intro(pc.bgYellow(pc.black(" fidelios service uninstall ")));

  const platform = detectPlatform();
  if (platform === "unsupported") {
    p.log.error("Service mode is only supported on macOS and Linux.");
    process.exit(1);
  }

  if (platform === "macos") {
    await uninstallMacOS();
  } else {
    await uninstallLinux();
  }
}

async function uninstallMacOS(): Promise<void> {
  const plistExists = fs.existsSync(PLIST_PATH);

  if (!plistExists) {
    p.log.warn("No service plist found. Nothing to uninstall.");
    p.outro("Done.");
    return;
  }

  const spinner = p.spinner();
  spinner.start("Stopping and unloading service...");
  try {
    execFileSync("launchctl", ["unload", PLIST_PATH], { stdio: "ignore" });
  } catch {
    // already unloaded — fine
  }
  spinner.stop("Service stopped.");

  await fsp.rm(PLIST_PATH, { force: true });
  p.log.message(pc.dim(`Removed: ${PLIST_PATH}`));
  p.log.message(pc.dim("Your data in ~/.fidelios/ is untouched."));
  p.outro(pc.green("FideliOS service uninstalled."));
}

async function uninstallLinux(): Promise<void> {
  const unitExists = fs.existsSync(SYSTEMD_UNIT_PATH);

  if (!unitExists) {
    p.log.warn("No systemd unit found. Nothing to uninstall.");
    p.outro("Done.");
    return;
  }

  const spinner = p.spinner();
  spinner.start("Stopping and disabling service...");
  try {
    execFileSync("systemctl", ["--user", "disable", "--now", "fidelios"], { stdio: "ignore" });
    execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
  } catch {
    // ignore — unit may already be stopped
  }
  spinner.stop("Service stopped.");

  await fsp.rm(SYSTEMD_UNIT_PATH, { force: true });
  p.log.message(pc.dim(`Removed: ${SYSTEMD_UNIT_PATH}`));
  p.log.message(pc.dim("Your data in ~/.fidelios/ is untouched."));
  p.outro(pc.green("FideliOS service uninstalled."));
}

// ── status ───────────────────────────────────────────────────────────────────

export async function serviceStatus(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" fidelios service status ")));

  const platform = detectPlatform();
  if (platform === "unsupported") {
    p.log.error("Service mode is only supported on macOS and Linux.");
    process.exit(1);
  }

  if (platform === "macos") {
    await statusMacOS();
  } else {
    await statusLinux();
  }

  const modeState = readServiceModeState();
  if (modeState) {
    const modeLabel = modeState.mode === "dev" ? pc.yellow("dev (hot-reload)") : pc.cyan("release");
    p.log.success(`Mode: ${modeLabel}`);
    if (modeState.mode === "dev" && modeState.repoDir) {
      p.log.message(pc.dim(`Dev-mode repo: ${modeState.repoDir}`));
    }
    p.log.message(pc.dim("Switch with: fidelios service dev | fidelios service release"));
  }

  // Check port connectivity
  const portOpen = await isPortOpen(PRODUCTION_PORT);
  if (portOpen) {
    p.log.success(pc.green(`Port ${PRODUCTION_PORT}: accepting connections`));
  } else {
    p.log.warn(pc.yellow(`Port ${PRODUCTION_PORT}: not reachable`));
  }

  p.outro("Done.");
}

async function statusMacOS(): Promise<void> {
  const plistExists = fs.existsSync(PLIST_PATH);
  if (plistExists) {
    p.log.success(`Service file: ${pc.cyan(PLIST_PATH)}`);
  } else {
    p.log.warn(`Service file: ${pc.dim("not installed")} (run ${pc.cyan("fidelios service install")})`);
  }

  try {
    const output = execSync(`launchctl list ${LAUNCHD_LABEL} 2>&1`, { encoding: "utf8" });
    const pidMatch = output.match(/"PID"\s*=\s*(\d+)/);
    const pid = pidMatch?.[1];
    if (pid) {
      p.log.success(`Service: ${pc.green("running")} (PID ${pid})`);
    } else {
      p.log.warn(`Service: ${pc.yellow("loaded but not running")}`);
    }
  } catch {
    p.log.warn(`Service: ${pc.dim("not loaded")}`);
  }
}

async function statusLinux(): Promise<void> {
  const unitExists = fs.existsSync(SYSTEMD_UNIT_PATH);
  if (unitExists) {
    p.log.success(`Unit file: ${pc.cyan(SYSTEMD_UNIT_PATH)}`);
  } else {
    p.log.warn(`Unit file: ${pc.dim("not installed")} (run ${pc.cyan("fidelios service install")})`);
  }

  try {
    execFileSync("systemctl", ["--user", "is-active", "fidelios"], { stdio: "ignore" });
    p.log.success(`Service: ${pc.green("running")}`);
  } catch {
    p.log.warn(`Service: ${pc.dim("not running")}`);
  }
}
