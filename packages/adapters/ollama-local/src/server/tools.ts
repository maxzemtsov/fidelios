/**
 * FideliOS-native tool implementations for the ollama_local in-process agent harness.
 *
 * Tool format: OpenAI-style { type: "function", function: { name, description, parameters } }
 * — identical to what Ollama native tool-calling expects in the chat request.
 *
 * Tools: read, write, bash, grep, edit
 */

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Tool schema definitions (OpenAI-compatible)
// ---------------------------------------------------------------------------

export interface OllamaToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export const FIDELIOS_TOOLS: OllamaToolDef[] = [
  {
    type: "function",
    function: {
      name: "read",
      description:
        "Read the full content of a file. Returns the file content as a string, or an error message if the file cannot be read.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative file path to read.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write",
      description:
        "Write content to a file, creating it or overwriting it if it exists. Returns 'ok' on success or an error message.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative file path to write.",
          },
          content: {
            type: "string",
            description: "The content to write into the file.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Execute a shell command and return its combined stdout+stderr output. Use for running scripts, git commands, npm, etc. Commands are run in the workspace directory.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute.",
          },
          timeout: {
            type: "number",
            description: "Timeout in seconds (default: 30, max: 120).",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "Search for a regular expression pattern in files or a directory. Returns matching lines with file:line context.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regular expression pattern to search for.",
          },
          path: {
            type: "string",
            description:
              "File or directory path to search in. Defaults to the workspace root.",
          },
          flags: {
            type: "string",
            description:
              "Optional grep flags as a single string, e.g. '-i' for case-insensitive or '-l' to list file names only.",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit",
      description:
        "Replace an exact string in a file with a new string. The old_string must match exactly (including whitespace). Returns 'ok' on success, or an error if the string is not found or is ambiguous.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative file path to edit.",
          },
          old_string: {
            type: "string",
            description: "The exact substring to replace.",
          },
          new_string: {
            type: "string",
            description: "The replacement string.",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Ollama tool_calls shape (from the SDK stream)
// ---------------------------------------------------------------------------

export interface OllamaToolCall {
  function: {
    name: string;
    /** The Ollama SDK already parses arguments into an object. */
    arguments: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Tool execution context
// ---------------------------------------------------------------------------

export interface ToolExecContext {
  /** Working directory for bash commands and relative path resolution. */
  cwd: string;
  /** Max output size in bytes before truncation (default: 65536). */
  maxOutputBytes?: number;
}

// ---------------------------------------------------------------------------
// Individual tool implementations
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 65_536; // 64 KiB

function truncate(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  const truncated = buf.slice(0, maxBytes).toString("utf8");
  return `${truncated}\n... [output truncated at ${maxBytes} bytes]`;
}

function resolvePath(rawPath: string, cwd: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);
}

async function toolRead(
  args: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<string> {
  const rawPath = typeof args.path === "string" ? args.path.trim() : "";
  if (!rawPath) return "Error: `path` argument is required.";
  const resolved = resolvePath(rawPath, ctx.cwd);
  try {
    const content = await fs.readFile(resolved, "utf8");
    return truncate(content, ctx.maxOutputBytes ?? DEFAULT_MAX_BYTES);
  } catch (err) {
    return `Error reading ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolWrite(
  args: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<string> {
  const rawPath = typeof args.path === "string" ? args.path.trim() : "";
  const content = typeof args.content === "string" ? args.content : "";
  if (!rawPath) return "Error: `path` argument is required.";
  const resolved = resolvePath(rawPath, ctx.cwd);
  try {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf8");
    return "ok";
  } catch (err) {
    return `Error writing ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolBash(
  args: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<string> {
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (!command) return "Error: `command` argument is required.";

  const rawTimeout = typeof args.timeout === "number" ? args.timeout : 30;
  const timeoutSec = Math.min(120, Math.max(1, rawTimeout));

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: ctx.cwd,
      timeout: timeoutSec * 1000,
      maxBuffer: (ctx.maxOutputBytes ?? DEFAULT_MAX_BYTES) * 2,
      shell: "/bin/bash",
    });
    const combined = [stdout, stderr].filter(Boolean).join("\n").trimEnd();
    return truncate(combined || "(no output)", ctx.maxOutputBytes ?? DEFAULT_MAX_BYTES);
  } catch (err) {
    if (typeof err === "object" && err !== null) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
      const combined = [execErr.stdout ?? "", execErr.stderr ?? ""]
        .filter(Boolean)
        .join("\n")
        .trimEnd();
      const prefix = execErr.killed ? "Command timed out." : `Command failed.`;
      const fallback = execErr.message ?? String(err);
      return `${prefix}\n${combined || fallback}`.trim();
    }
    return `Error: ${String(err)}`;
  }
}

async function toolGrep(
  args: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<string> {
  const pattern = typeof args.pattern === "string" ? args.pattern.trim() : "";
  if (!pattern) return "Error: `pattern` argument is required.";

  const rawPath = typeof args.path === "string" ? args.path.trim() : ctx.cwd;
  const searchPath = rawPath ? resolvePath(rawPath, ctx.cwd) : ctx.cwd;
  const rawFlags = typeof args.flags === "string" ? args.flags.trim() : "";

  // Build a safe grep command: -r for directories, -n for line numbers,
  // plus any user-supplied flags (filtered to safe options).
  const safeFlags = rawFlags
    .split(/\s+/)
    .filter((f) => /^-[A-Za-z0-9]+$/.test(f))
    .join(" ");

  // Detect if searchPath is a file or directory to set -r appropriately.
  let isDir = false;
  try {
    const stat = await fs.stat(searchPath);
    isDir = stat.isDirectory();
  } catch {
    isDir = false;
  }

  const recurseFlag = isDir ? "-r" : "";
  const grepCmd = `grep -n ${recurseFlag} ${safeFlags} -e ${shellEscape(pattern)} ${shellEscape(searchPath)} 2>&1 || true`;

  try {
    const { stdout } = await execAsync(grepCmd, {
      cwd: ctx.cwd,
      timeout: 15_000,
      maxBuffer: (ctx.maxOutputBytes ?? DEFAULT_MAX_BYTES) * 2,
      shell: "/bin/bash",
    });
    const result = stdout.trimEnd();
    if (!result) return "(no matches)";
    return truncate(result, ctx.maxOutputBytes ?? DEFAULT_MAX_BYTES);
  } catch (err) {
    return `Error running grep: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolEdit(
  args: Record<string, unknown>,
  ctx: ToolExecContext,
): Promise<string> {
  const rawPath = typeof args.path === "string" ? args.path.trim() : "";
  const oldString = typeof args.old_string === "string" ? args.old_string : "";
  const newString = typeof args.new_string === "string" ? args.new_string : "";

  if (!rawPath) return "Error: `path` argument is required.";
  if (!oldString) return "Error: `old_string` argument is required.";

  const resolved = resolvePath(rawPath, ctx.cwd);

  let content: string;
  try {
    content = await fs.readFile(resolved, "utf8");
  } catch (err) {
    return `Error reading ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }

  const occurrences = countOccurrences(content, oldString);
  if (occurrences === 0) {
    return `Error: old_string not found in ${resolved}.`;
  }
  if (occurrences > 1) {
    return `Error: old_string appears ${occurrences} times in ${resolved}. Provide more context to make it unique.`;
  }

  const updated = content.replace(oldString, newString);
  try {
    await fs.writeFile(resolved, updated, "utf8");
    return "ok";
  } catch (err) {
    return `Error writing ${resolved}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/** Minimal POSIX shell escaping: wrap in single quotes, escape embedded single quotes. */
function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a single tool call from the model.
 * Returns the string result to send back as a `{role: "tool"}` message.
 */
export async function executeTool(
  call: OllamaToolCall,
  ctx: ToolExecContext,
): Promise<string> {
  const { name, arguments: args } = call.function;
  switch (name) {
    case "read":
      return toolRead(args, ctx);
    case "write":
      return toolWrite(args, ctx);
    case "bash":
      return toolBash(args, ctx);
    case "grep":
      return toolGrep(args, ctx);
    case "edit":
      return toolEdit(args, ctx);
    default:
      return `Error: unknown tool "${name}".`;
  }
}
