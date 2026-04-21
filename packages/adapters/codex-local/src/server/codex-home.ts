import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AdapterExecutionContext } from "@fideliosai/adapter-utils";
import { linkFileWithFallback } from "@fideliosai/adapter-utils/server-utils";

const TRUTHY_ENV_RE = /^(1|true|yes|on)$/i;
const COPIED_SHARED_FILES = ["config.json", "config.toml", "instructions.md"] as const;
const SYMLINKED_SHARED_FILES = ["auth.json"] as const;
const DEFAULT_FIDELIOS_INSTANCE_ID = "default";

function nonEmpty(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function pathExists(candidate: string): Promise<boolean> {
  return fs.access(candidate).then(() => true).catch(() => false);
}

export function resolveSharedCodexHomeDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = nonEmpty(env.CODEX_HOME);
  return fromEnv ? path.resolve(fromEnv) : path.join(os.homedir(), ".codex");
}

function isWorktreeMode(env: NodeJS.ProcessEnv): boolean {
  return TRUTHY_ENV_RE.test(env.FIDELIOS_IN_WORKTREE ?? "");
}

export function resolveManagedCodexHomeDir(
  env: NodeJS.ProcessEnv,
  companyId?: string,
): string {
  const fideliosHome = nonEmpty(env.FIDELIOS_HOME) ?? path.resolve(os.homedir(), ".fidelios");
  const instanceId = nonEmpty(env.FIDELIOS_INSTANCE_ID) ?? DEFAULT_FIDELIOS_INSTANCE_ID;
  return companyId
    ? path.resolve(fideliosHome, "instances", instanceId, "companies", companyId, "codex-home")
    : path.resolve(fideliosHome, "instances", instanceId, "codex-home");
}

async function ensureParentDir(target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
}

async function ensureSymlink(
  target: string,
  source: string,
  onLog: AdapterExecutionContext["onLog"],
): Promise<void> {
  const existing = await fs.lstat(target).catch(() => null);
  if (!existing) {
    await ensureParentDir(target);
    const method = await linkFileWithFallback(source, target);
    if (method === "copy") {
      await onLog(
        "stdout",
        `[fidelios] Windows symlink/hardlink permission denied; copied "${path.basename(target)}" instead. If Codex rotates the token, re-run the agent to refresh the copy.\n`,
      );
    }
    return;
  }

  // Existing regular file/hardlink/copy — leave it in place. On Windows
  // where we fell back to a copy on first seed, we don't aggressively
  // refresh it here; users can re-run if the token rotates. This matches
  // the previous behaviour for POSIX symlinks that already point at source.
  if (!existing.isSymbolicLink()) {
    return;
  }

  const linkedPath = await fs.readlink(target).catch(() => null);
  if (!linkedPath) return;

  const resolvedLinkedPath = path.resolve(path.dirname(target), linkedPath);
  if (resolvedLinkedPath === source) return;

  await fs.unlink(target);
  const method = await linkFileWithFallback(source, target);
  if (method === "copy") {
    await onLog(
      "stdout",
      `[fidelios] Windows symlink/hardlink permission denied; copied "${path.basename(target)}" instead.\n`,
    );
  }
}

async function ensureCopiedFile(target: string, source: string): Promise<void> {
  const existing = await fs.lstat(target).catch(() => null);
  if (existing) return;
  await ensureParentDir(target);
  await fs.copyFile(source, target);
}

export async function prepareManagedCodexHome(
  env: NodeJS.ProcessEnv,
  onLog: AdapterExecutionContext["onLog"],
  companyId?: string,
): Promise<string> {
  const targetHome = resolveManagedCodexHomeDir(env, companyId);

  const sourceHome = resolveSharedCodexHomeDir(env);
  if (path.resolve(sourceHome) === path.resolve(targetHome)) return targetHome;

  await fs.mkdir(targetHome, { recursive: true });

  for (const name of SYMLINKED_SHARED_FILES) {
    const source = path.join(sourceHome, name);
    if (!(await pathExists(source))) continue;
    await ensureSymlink(path.join(targetHome, name), source, onLog);
  }

  for (const name of COPIED_SHARED_FILES) {
    const source = path.join(sourceHome, name);
    if (!(await pathExists(source))) continue;
    await ensureCopiedFile(path.join(targetHome, name), source);
  }

  await onLog(
    "stdout",
    `[fidelios] Using ${isWorktreeMode(env) ? "worktree-isolated" : "FideliOS-managed"} Codex home "${targetHome}" (seeded from "${sourceHome}").\n`,
  );
  return targetHome;
}
