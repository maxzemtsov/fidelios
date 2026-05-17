import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@fideliosai/db";
import { issues, projectWorkspaces } from "@fideliosai/db";
import { badRequest, notFound } from "../errors.js";

const execFileAsync = promisify(execFile);

/** Maximum bytes returned inline for a text file; larger files are truncated. */
const MAX_FILE_BYTES = 512 * 1024;

/** Directories skipped by the non-git fallback filesystem search. */
const SEARCH_SKIP_DIRECTORIES = new Set([
  ".git", "node_modules", "dist", "ui-dist", ".next", "coverage", ".turbo", ".vite",
]);
const SEARCH_MAX_DEPTH = 8;
const SEARCH_MAX_ENTRIES = 200_000;

/** Extensions always treated as binary — downloaded, never previewed inline. */
const BINARY_EXTENSIONS = new Set([
  "pdf", "xlsx", "xls", "xlsm", "docx", "doc", "pptx", "ppt", "odt", "ods", "odp",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "tif", "heic", "avif",
  "zip", "tar", "gz", "tgz", "bz2", "rar", "7z",
  "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "ogg", "flac", "m4a",
  "woff", "woff2", "ttf", "otf", "eot",
  "exe", "dll", "so", "dylib", "bin", "dat", "wasm", "class",
  "sqlite", "sqlite3", "db",
]);

export interface IssueFileResult {
  path: string;
  /** `text` carries inline content; `binary` must be downloaded; `missing` was not found. */
  kind: "text" | "binary" | "missing";
  content: string;
  size: number;
  truncated: boolean;
  multipleMatches: boolean;
  /** For `missing`: the workspace directory that was searched. */
  workspaceDir?: string;
  /** For `missing`: the project's git remote URL, when known. */
  repoUrl?: string | null;
}

/** A file resolved within a workspace, ready to read or stream. */
export interface ResolvedWorkspaceFile {
  absolutePath: string;
  relativePath: string;
  multipleMatches: boolean;
}

interface WorkspaceContext {
  root: string;
  repoUrl: string | null;
}

/** Strip `..`/`.`/leading-`/` segments so a path can never escape the workspace root. */
function normalizePortablePath(input: string) {
  const parts: string[] = [];
  for (const segment of input.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

/** True when `candidate` is `root` itself or lives strictly inside it. */
function isInside(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function toWorkspaceRelative(root: string, absolutePath: string) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

/** List tracked + untracked-non-ignored files in a git workspace; null when not a git repo. */
async function gitListWorkspaceFiles(root: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

/** Pick workspace files matching a requested path: exact, then path-suffix, then basename. */
function matchWorkspacePaths(files: string[], normalized: string): string[] {
  const exact = files.filter((file) => file === normalized);
  if (exact.length > 0) return exact;
  if (normalized.includes("/")) {
    return files.filter((file) => file.endsWith(`/${normalized}`));
  }
  return files.filter((file) => path.posix.basename(file) === normalized);
}

type BareFilenameMatch = { absolutePath: string; matchCount: number };

/** Bounded filesystem search — fallback for workspaces that are not git repos. */
async function findByBasename(root: string, targetBasename: string): Promise<BareFilenameMatch | null> {
  let scanned = 0;
  let firstMatch: string | null = null;
  let matchCount = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > SEARCH_MAX_DEPTH || scanned >= SEARCH_MAX_ENTRIES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (scanned >= SEARCH_MAX_ENTRIES) return;
      scanned += 1;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SEARCH_SKIP_DIRECTORIES.has(entry.name)) continue;
        await walk(entryPath, depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name === targetBasename && isInside(root, entryPath)) {
        matchCount += 1;
        if (!firstMatch) firstMatch = entryPath;
      }
    }
  }

  await walk(root, 0);
  return firstMatch ? { absolutePath: firstMatch, matchCount } : null;
}

/** Resolve a requested path to a concrete file under `root`; null when not found. */
async function findFileInWorkspace(
  root: string,
  normalized: string,
): Promise<ResolvedWorkspaceFile | null> {
  const direct = path.resolve(root, normalized);
  if (isInside(root, direct)) {
    const directStat = await fs.stat(direct).catch(() => null);
    if (directStat?.isFile()) {
      return { absolutePath: direct, relativePath: toWorkspaceRelative(root, direct), multipleMatches: false };
    }
  }

  // Git-aware search: fast, unbounded, and naturally excludes node_modules/build dirs.
  const gitFiles = await gitListWorkspaceFiles(root);
  if (gitFiles) {
    const matches = matchWorkspacePaths(gitFiles, normalized);
    for (const match of matches) {
      const absolutePath = path.resolve(root, match);
      if (!isInside(root, absolutePath)) continue;
      const matchStat = await fs.stat(absolutePath).catch(() => null);
      if (matchStat?.isFile()) {
        return { absolutePath, relativePath: match, multipleMatches: matches.length > 1 };
      }
    }
    return null;
  }

  // Non-git workspace: bounded filesystem walk (bare filename only).
  if (!normalized.includes("/")) {
    const match = await findByBasename(root, normalized);
    if (match) {
      return {
        absolutePath: match.absolutePath,
        relativePath: toWorkspaceRelative(root, match.absolutePath),
        multipleMatches: match.matchCount > 1,
      };
    }
  }
  return null;
}

export function issueFileService(db: Db) {
  /** Resolve the issue's on-disk workspace; throws 404 when the issue/workspace is missing. */
  async function resolveWorkspaceContext(companyId: string, issueId: string): Promise<WorkspaceContext> {
    const issue = await db
      .select({ companyId: issues.companyId, projectWorkspaceId: issues.projectWorkspaceId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
    if (!issue || issue.companyId !== companyId) {
      throw notFound("Issue not found");
    }
    if (!issue.projectWorkspaceId) {
      throw notFound("No workspace is configured for this issue");
    }

    const workspace = await db
      .select({ cwd: projectWorkspaces.cwd, repoUrl: projectWorkspaces.repoUrl })
      .from(projectWorkspaces)
      .where(eq(projectWorkspaces.id, issue.projectWorkspaceId))
      .then((rows) => rows[0] ?? null);
    const cwd = workspace?.cwd?.trim() ?? "";
    if (!workspace || !cwd) {
      throw notFound("No workspace is configured for this issue");
    }
    return { root: path.resolve(cwd), repoUrl: workspace.repoUrl ?? null };
  }

  function normalizeRequest(requestedPath: string): string {
    const normalized = normalizePortablePath(requestedPath ?? "");
    if (!normalized) {
      throw badRequest("A file path is required");
    }
    return normalized;
  }

  /** Resolve a file for streaming; throws 404 when it cannot be found. */
  async function resolveWorkspaceFile(
    companyId: string,
    issueId: string,
    requestedPath: string,
  ): Promise<ResolvedWorkspaceFile> {
    const ctx = await resolveWorkspaceContext(companyId, issueId);
    const found = await findFileInWorkspace(ctx.root, normalizeRequest(requestedPath));
    if (!found) {
      throw notFound("File not found in this issue's workspace");
    }
    return found;
  }

  /** Read a workspace file: text (inline content), binary (download), or missing (with context). */
  async function readWorkspaceFile(
    companyId: string,
    issueId: string,
    requestedPath: string,
  ): Promise<IssueFileResult> {
    const ctx = await resolveWorkspaceContext(companyId, issueId);
    const normalized = normalizeRequest(requestedPath);
    const found = await findFileInWorkspace(ctx.root, normalized);
    if (!found) {
      return {
        path: normalized,
        kind: "missing",
        content: "",
        size: 0,
        truncated: false,
        multipleMatches: false,
        workspaceDir: ctx.root,
        repoUrl: ctx.repoUrl,
      };
    }

    const stat = await fs.stat(found.absolutePath);
    const extension = path.extname(found.absolutePath).slice(1).toLowerCase();
    const base = {
      path: found.relativePath,
      size: stat.size,
      multipleMatches: found.multipleMatches,
    };

    if (BINARY_EXTENSIONS.has(extension)) {
      return { ...base, kind: "binary", content: "", truncated: false };
    }

    const buffer = await fs.readFile(found.absolutePath);
    const slice = buffer.length > MAX_FILE_BYTES ? buffer.subarray(0, MAX_FILE_BYTES) : buffer;
    if (slice.includes(0)) {
      return { ...base, kind: "binary", content: "", truncated: false };
    }
    return {
      ...base,
      kind: "text",
      content: slice.toString("utf8"),
      truncated: buffer.length > MAX_FILE_BYTES,
    };
  }

  return { resolveWorkspaceFile, readWorkspaceFile };
}
