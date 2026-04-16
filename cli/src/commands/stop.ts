import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, execSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { resolveFideliOSInstanceRoot } from "../config/home.js";

interface StopOptions {
  service?: boolean;
  dryRun?: boolean;
}

const FIDELIOS_PORTS = [
  3100, 3101, 3102, 3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110,
  5173, 5174,
  54331,
];

// Patterns matched against `ps -eo pid,command` output. A process is a candidate
// for termination if ANY pattern matches its command line.
const PROCESS_PATTERNS: RegExp[] = [
  // The CLI itself
  /\bfidelios\s+run(?:\s|$)/,
  /\bfidelios\s+heartbeat\b/,
  // pnpm / node dev runners inside the fidelios repo
  /\/fidelios(?:-[^/ ]+)?\/(?:scripts|server|ui|packages|cli)\/.*(?:node|tsx)/,
  /scripts\/dev-runner\.mjs\b/,
  // Embedded PostgreSQL spawned by the embedded-postgres npm package
  /@embedded-postgres\/[^/ ]+\/.+\/postgres\b/,
  // Plugin workers
  /fidelios-plugin-[^/ ]+\/dist\/worker\.js\b/,
  /\bfidelios.*plugin.*worker\b/,
];

interface PsEntry {
  pid: number;
  ppid: number;
  command: string;
}

function listProcesses(): PsEntry[] {
  let raw: string;
  try {
    raw = execSync("ps -eo pid=,ppid=,args=", { encoding: "utf8" });
  } catch {
    return [];
  }
  const entries: PsEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trimStart();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    if (pid === process.pid) continue;
    entries.push({ pid, ppid, command: match[3] });
  }
  return entries;
}

function findMatchingPids(entries: PsEntry[]): Set<number> {
  const matched = new Set<number>();
  for (const entry of entries) {
    if (PROCESS_PATTERNS.some((re) => re.test(entry.command))) {
      matched.add(entry.pid);
    }
  }
  // Walk children so plugin workers / postgres spawned by matched parents are included.
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (!matched.has(entry.pid) && matched.has(entry.ppid)) {
        matched.add(entry.pid);
        changed = true;
      }
    }
  }
  return matched;
}

function pidsListeningOnFideliosPorts(): Set<number> {
  const pids = new Set<number>();
  try {
    const raw = execSync(`lsof -nP -iTCP -sTCP:LISTEN ${FIDELIOS_PORTS.map((p) => `-i:${p}`).join(" ")}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const line of raw.split("\n").slice(1)) {
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) pids.add(pid);
    }
  } catch {
    // lsof returns non-zero when nothing is listening — that's fine.
  }
  return pids;
}

function killPid(pid: number, signal: "SIGTERM" | "SIGKILL"): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function removeStaleLocks(): string[] {
  const removed: string[] = [];
  const instancesRoot = path.resolve(
    process.env.FIDELIOS_HOME ?? path.join(os.homedir(), ".fidelios"),
    "instances",
  );
  if (!fs.existsSync(instancesRoot)) return removed;
  for (const entry of fs.readdirSync(instancesRoot)) {
    const instanceDir = path.join(instancesRoot, entry);
    const candidates = [
      path.join(instanceDir, "db", "postmaster.pid"),
      path.join(instanceDir, ".lock"),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          fs.rmSync(file, { force: true });
          removed.push(file);
        } catch {
          // best-effort
        }
      }
    }
  }
  // Also ensure instance root fidelios.log handle is released (no-op, but list it)
  void resolveFideliOSInstanceRoot;
  return removed;
}

function tryUnloadLaunchdService(): void {
  if (process.platform !== "darwin") return;
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", "nl.fidelios.server.plist");
  if (!fs.existsSync(plist)) return;
  try {
    execFileSync("launchctl", ["unload", plist], { stdio: "ignore" });
  } catch {
    // fine — not loaded
  }
}

export async function stopCommand(options: StopOptions = {}): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" fidelios stop ")));

  const dryRun = options.dryRun === true;

  const entries = listProcesses();
  const matched = findMatchingPids(entries);
  for (const pid of pidsListeningOnFideliosPorts()) matched.add(pid);

  const byPid = new Map<number, PsEntry>(entries.map((e) => [e.pid, e]));

  if (matched.size === 0) {
    p.log.success("No FideliOS processes running.");
  } else {
    p.log.step(`Found ${matched.size} process(es):`);
    for (const pid of matched) {
      const entry = byPid.get(pid);
      const cmd = entry ? entry.command.slice(0, 120) : "(process ended)";
      p.log.message(pc.dim(`  PID ${pid}  ${cmd}`));
    }

    if (dryRun) {
      p.outro("Dry run — nothing killed.");
      return;
    }

    const spinner = p.spinner();
    spinner.start("Sending SIGTERM...");
    for (const pid of matched) killPid(pid, "SIGTERM");
    await sleep(3000);
    const stragglers = [...matched].filter(isAlive);
    if (stragglers.length > 0) {
      spinner.message(`Force-killing ${stragglers.length} straggler(s)...`);
      for (const pid of stragglers) killPid(pid, "SIGKILL");
      await sleep(500);
    }
    spinner.stop(pc.green("Processes terminated."));
  }

  if (!dryRun) {
    const removed = removeStaleLocks();
    if (removed.length > 0) {
      p.log.success(`Cleaned ${removed.length} stale lock file(s).`);
      for (const file of removed) p.log.message(pc.dim(`  ${file}`));
    }

    if (options.service) {
      tryUnloadLaunchdService();
      p.log.success("Launchd service unloaded (if it was loaded).");
    }
  }

  p.outro(pc.green("Done."));
}
