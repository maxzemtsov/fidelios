import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@fideliosai/db";
import { issues, projectWorkspaces } from "@fideliosai/db";
import { badRequest, notFound } from "../errors.js";

/** Maximum bytes returned inline for a text file; larger files are truncated. */
const MAX_FILE_BYTES = 512 * 1024;

/** Directories skipped while searching for a bare filename. */
const SEARCH_SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "ui-dist",
  ".next",
  "coverage",
  ".turbo",
  ".vite",
]);

/** Bounds for the recursive bare-filename search. */
const SEARCH_MAX_DEPTH = 6;
const SEARCH_MAX_ENTRIES = 20000;

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
  /** `text` files carry inline `content`; `binary` files must be downloaded. */
  kind: "text" | "binary";
  /** UTF-8 content for text files; empty string for binary files. */
  content: string;
  /** Full size of the file on disk, in bytes. */
  size: number;
  truncated: boolean;
  multipleMatches: boolean;
}

/** A file resolved within a workspace, ready to read or stream. */
export interface ResolvedWorkspaceFile {
  absolutePath: string;
  /** Workspace-relative path, POSIX separators. */
  relativePath: string;
  multipleMatches: boolean;
}

/**
 * Strip `..`/`.`/leading-`/` segments so a caller-supplied path can never
 * escape the workspace root. Mirrors `normalizePortablePath` in company-skills.
 */
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

type BareFilenameMatch = {
  absolutePath: string;
  matchCount: number;
};

/** Bounded recursive search under `root` for a file whose basename matches. */
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

export function issueFileService(db: Db) {
  /** Resolve a caller-supplied path to a concrete file in the issue's workspace. */
  async function resolveWorkspaceFile(
    companyId: string,
    issueId: string,
    requestedPath: string,
  ): Promise<ResolvedWorkspaceFile> {
    const issue = await db
      .select({
        companyId: issues.companyId,
        projectWorkspaceId: issues.projectWorkspaceId,
      })
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
      .select({ cwd: projectWorkspaces.cwd })
      .from(projectWorkspaces)
      .where(eq(projectWorkspaces.id, issue.projectWorkspaceId))
      .then((rows) => rows[0] ?? null);
    const cwd = workspace?.cwd?.trim() ?? "";
    if (!workspace || !cwd) {
      throw notFound("No workspace is configured for this issue");
    }

    const normalized = normalizePortablePath(requestedPath ?? "");
    if (!normalized) {
      throw badRequest("A file path is required");
    }

    const root = path.resolve(cwd);
    const candidate = path.resolve(root, normalized);
    if (!isInside(root, candidate)) {
      throw badRequest("Resolved path escapes the workspace");
    }

    let resolvedAbsolute: string | null = null;
    let multipleMatches = false;

    const candidateStat = await fs.stat(candidate).catch(() => null);
    if (candidateStat?.isFile()) {
      resolvedAbsolute = candidate;
    } else if (!normalized.includes("/")) {
      // Bare filename: search the workspace tree for a matching basename.
      const match = await findByBasename(root, normalized);
      if (match) {
        resolvedAbsolute = match.absolutePath;
        multipleMatches = match.matchCount > 1;
      }
    }

    if (!resolvedAbsolute) {
      throw notFound("File not found in this issue's workspace");
    }

    return {
      absolutePath: resolvedAbsolute,
      relativePath: path.relative(root, resolvedAbsolute).split(path.sep).join("/"),
      multipleMatches,
    };
  }

  /**
   * Resolve and read a workspace file. Text files carry their UTF-8 `content`
   * inline (truncated past `MAX_FILE_BYTES`); binary files carry no content and
   * are expected to be fetched via the route's `?download=1` mode.
   */
  async function readWorkspaceFile(
    companyId: string,
    issueId: string,
    requestedPath: string,
  ): Promise<IssueFileResult> {
    const resolved = await resolveWorkspaceFile(companyId, issueId, requestedPath);
    const stat = await fs.stat(resolved.absolutePath);
    const extension = path.extname(resolved.absolutePath).slice(1).toLowerCase();
    const base = {
      path: resolved.relativePath,
      size: stat.size,
      multipleMatches: resolved.multipleMatches,
    };

    if (BINARY_EXTENSIONS.has(extension)) {
      return { ...base, kind: "binary", content: "", truncated: false };
    }

    const buffer = await fs.readFile(resolved.absolutePath);
    const slice = buffer.length > MAX_FILE_BYTES ? buffer.subarray(0, MAX_FILE_BYTES) : buffer;
    // A NUL byte means the file is not safe to render as text — treat as binary.
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
