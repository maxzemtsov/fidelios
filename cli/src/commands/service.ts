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

type Platform = "macos" | "linux" | "unsupported";

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

function buildPlist(nodeBin: string, fideliosBin: string, logPath: string): string {
  const homeDir = os.homedir();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${nodeBin}</string>
        <string>${fideliosBin}</string>
        <string>run</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${path.dirname(nodeBin)}:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${homeDir}</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>${homeDir}</string>

    <key>RunAtLoad</key>
    <false/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
</dict>
</plist>
`;
}

function buildSystemdUnit(fideliosBin: string, logPath: string): string {
  const homeDir = os.homedir();
  const nodeBin = resolveBinary("node");
  return `[Unit]
Description=FideliOS Server
After=network.target

[Service]
Type=simple
ExecStart=${nodeBin} ${fideliosBin} run
WorkingDirectory=${homeDir}
Environment=NODE_ENV=production
Environment=HOME=${homeDir}
Restart=on-failure
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

export async function serviceInstall(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" fidelios service install ")));

  const platform = detectPlatform();
  if (platform === "unsupported") {
    p.log.error("Service mode is only supported on macOS and Linux.");
    process.exit(1);
  }

  const nodeBin = resolveBinary("node");
  const fideliosBin = resolveBinary("fidelios");
  const logPath = resolveLogPath();

  if (platform === "macos") {
    await installMacOS(nodeBin, fideliosBin, logPath);
  } else {
    await installLinux(fideliosBin, logPath);
  }
}

async function installMacOS(nodeBin: string, fideliosBin: string, logPath: string): Promise<void> {
  p.log.step(`Installing launchd service: ${LAUNCHD_LABEL}`);

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

  const plist = buildPlist(nodeBin, fideliosBin, logPath);
  await fsp.writeFile(PLIST_PATH, plist, "utf8");
  p.log.message(pc.dim(`Plist written: ${PLIST_PATH}`));

  const spinner = p.spinner();
  spinner.start("Loading service with launchctl...");
  try {
    execFileSync("launchctl", ["load", PLIST_PATH]);
    spinner.stop(pc.green("Service registered and starting."));
  } catch (err) {
    spinner.stop(pc.red("launchctl load failed."));
    p.log.error(String(err));
    process.exit(1);
  }

  p.log.message(pc.dim(`Logs: tail -f ${logPath}`));
  p.outro(pc.green("FideliOS service installed. It will restart automatically on crash."));
}

async function installLinux(fideliosBin: string, logPath: string): Promise<void> {
  p.log.step(`Installing systemd user unit: fidelios.service`);

  await fsp.mkdir(path.dirname(logPath), { recursive: true });
  await fsp.mkdir(SYSTEMD_UNIT_DIR, { recursive: true });

  const unit = buildSystemdUnit(fideliosBin, logPath);
  await fsp.writeFile(SYSTEMD_UNIT_PATH, unit, "utf8");
  p.log.message(pc.dim(`Unit written: ${SYSTEMD_UNIT_PATH}`));

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
