import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeTool, FIDELIOS_TOOLS } from "./tools.js";
import type { ToolExecContext } from "./tools.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ollama-tools-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function ctx(overrides?: Partial<ToolExecContext>): ToolExecContext {
  return { cwd: tmpDir, ...overrides };
}

// ---------------------------------------------------------------------------
// Tool schema sanity
// ---------------------------------------------------------------------------

describe("FIDELIOS_TOOLS", () => {
  it("exports 5 tools with unique names", () => {
    expect(FIDELIOS_TOOLS).toHaveLength(5);
    const names = FIDELIOS_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(5);
    expect(names).toEqual(expect.arrayContaining(["read", "write", "bash", "grep", "edit"]));
  });

  it("all tools are OpenAI-compatible type:function", () => {
    for (const tool of FIDELIOS_TOOLS) {
      expect(tool.type).toBe("function");
      expect(typeof tool.function.name).toBe("string");
      expect(typeof tool.function.description).toBe("string");
      expect(tool.function.parameters.type).toBe("object");
    }
  });
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------

describe("executeTool(read)", () => {
  it("reads an existing file", async () => {
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "hello world", "utf8");
    const result = await executeTool(
      { function: { name: "read", arguments: { path: "hello.txt" } } },
      ctx(),
    );
    expect(result).toBe("hello world");
  });

  it("reads an absolute path", async () => {
    const abs = path.join(tmpDir, "abs.txt");
    await fs.writeFile(abs, "abs content", "utf8");
    const result = await executeTool(
      { function: { name: "read", arguments: { path: abs } } },
      ctx(),
    );
    expect(result).toBe("abs content");
  });

  it("returns error message for missing file", async () => {
    const result = await executeTool(
      { function: { name: "read", arguments: { path: "missing.txt" } } },
      ctx(),
    );
    expect(result).toMatch(/error/i);
  });

  it("returns error when path is missing", async () => {
    const result = await executeTool(
      { function: { name: "read", arguments: {} } },
      ctx(),
    );
    expect(result).toMatch(/path.*required/i);
  });

  it("truncates large files", async () => {
    const big = "x".repeat(200_000);
    await fs.writeFile(path.join(tmpDir, "big.txt"), big, "utf8");
    const result = await executeTool(
      { function: { name: "read", arguments: { path: "big.txt" } } },
      ctx({ maxOutputBytes: 100 }),
    );
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(200_000);
  });
});

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

describe("executeTool(write)", () => {
  it("writes a new file and returns ok", async () => {
    const result = await executeTool(
      { function: { name: "write", arguments: { path: "out.txt", content: "written" } } },
      ctx(),
    );
    expect(result).toBe("ok");
    const content = await fs.readFile(path.join(tmpDir, "out.txt"), "utf8");
    expect(content).toBe("written");
  });

  it("creates parent directories automatically", async () => {
    const result = await executeTool(
      {
        function: {
          name: "write",
          arguments: { path: "sub/dir/file.txt", content: "nested" },
        },
      },
      ctx(),
    );
    expect(result).toBe("ok");
    const content = await fs.readFile(path.join(tmpDir, "sub/dir/file.txt"), "utf8");
    expect(content).toBe("nested");
  });

  it("overwrites an existing file", async () => {
    await fs.writeFile(path.join(tmpDir, "existing.txt"), "old", "utf8");
    await executeTool(
      { function: { name: "write", arguments: { path: "existing.txt", content: "new" } } },
      ctx(),
    );
    const content = await fs.readFile(path.join(tmpDir, "existing.txt"), "utf8");
    expect(content).toBe("new");
  });

  it("returns error when path is missing", async () => {
    const result = await executeTool(
      { function: { name: "write", arguments: { content: "oops" } } },
      ctx(),
    );
    expect(result).toMatch(/path.*required/i);
  });
});

// ---------------------------------------------------------------------------
// bash
// ---------------------------------------------------------------------------

describe("executeTool(bash)", () => {
  it("executes a simple command and returns stdout", async () => {
    const result = await executeTool(
      { function: { name: "bash", arguments: { command: "echo hello" } } },
      ctx(),
    );
    expect(result.trim()).toBe("hello");
  });

  it("executes in the workspace cwd", async () => {
    await fs.writeFile(path.join(tmpDir, "marker.txt"), "", "utf8");
    const result = await executeTool(
      { function: { name: "bash", arguments: { command: "ls marker.txt" } } },
      ctx(),
    );
    expect(result.trim()).toBe("marker.txt");
  });

  it("captures stderr in combined output on failure", async () => {
    const result = await executeTool(
      { function: { name: "bash", arguments: { command: "ls no_such_file_xyz" } } },
      ctx(),
    );
    expect(result).toMatch(/no such file|not found|cannot access/i);
  });

  it("returns error when command is missing", async () => {
    const result = await executeTool(
      { function: { name: "bash", arguments: {} } },
      ctx(),
    );
    expect(result).toMatch(/command.*required/i);
  });

  it("caps timeout at 120s", async () => {
    // Just verify it doesn't crash with a very large value.
    const result = await executeTool(
      { function: { name: "bash", arguments: { command: "echo ok", timeout: 9999 } } },
      ctx(),
    );
    expect(result.trim()).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

describe("executeTool(grep)", () => {
  it("finds matches in a directory", async () => {
    await fs.writeFile(path.join(tmpDir, "a.txt"), "foo bar\nbaz", "utf8");
    await fs.writeFile(path.join(tmpDir, "b.txt"), "nothing", "utf8");
    const result = await executeTool(
      { function: { name: "grep", arguments: { pattern: "foo" } } },
      ctx(),
    );
    expect(result).toContain("a.txt");
    expect(result).toContain("foo");
  });

  it("returns (no matches) when nothing found", async () => {
    await fs.writeFile(path.join(tmpDir, "empty.txt"), "nope", "utf8");
    const result = await executeTool(
      { function: { name: "grep", arguments: { pattern: "zzznomatch" } } },
      ctx(),
    );
    expect(result).toBe("(no matches)");
  });

  it("searches a specific file when path provided", async () => {
    await fs.writeFile(path.join(tmpDir, "specific.txt"), "needle in here", "utf8");
    const result = await executeTool(
      {
        function: {
          name: "grep",
          arguments: { pattern: "needle", path: "specific.txt" },
        },
      },
      ctx(),
    );
    expect(result).toContain("needle");
  });

  it("returns error when pattern is missing", async () => {
    const result = await executeTool(
      { function: { name: "grep", arguments: {} } },
      ctx(),
    );
    expect(result).toMatch(/pattern.*required/i);
  });
});

// ---------------------------------------------------------------------------
// edit
// ---------------------------------------------------------------------------

describe("executeTool(edit)", () => {
  it("replaces an exact string in a file", async () => {
    await fs.writeFile(path.join(tmpDir, "edit.txt"), "hello world", "utf8");
    const result = await executeTool(
      {
        function: {
          name: "edit",
          arguments: { path: "edit.txt", old_string: "world", new_string: "there" },
        },
      },
      ctx(),
    );
    expect(result).toBe("ok");
    const content = await fs.readFile(path.join(tmpDir, "edit.txt"), "utf8");
    expect(content).toBe("hello there");
  });

  it("returns error if old_string not found", async () => {
    await fs.writeFile(path.join(tmpDir, "edit.txt"), "hello world", "utf8");
    const result = await executeTool(
      {
        function: {
          name: "edit",
          arguments: { path: "edit.txt", old_string: "missing", new_string: "x" },
        },
      },
      ctx(),
    );
    expect(result).toMatch(/not found/i);
  });

  it("returns error if old_string appears more than once", async () => {
    await fs.writeFile(path.join(tmpDir, "edit.txt"), "foo foo", "utf8");
    const result = await executeTool(
      {
        function: {
          name: "edit",
          arguments: { path: "edit.txt", old_string: "foo", new_string: "bar" },
        },
      },
      ctx(),
    );
    expect(result).toMatch(/appears.*times|ambiguous/i);
  });

  it("returns error when path is missing", async () => {
    const result = await executeTool(
      { function: { name: "edit", arguments: { old_string: "x", new_string: "y" } } },
      ctx(),
    );
    expect(result).toMatch(/path.*required/i);
  });

  it("returns error when old_string is missing", async () => {
    const result = await executeTool(
      { function: { name: "edit", arguments: { path: "f.txt", new_string: "y" } } },
      ctx(),
    );
    expect(result).toMatch(/old_string.*required/i);
  });
});

// ---------------------------------------------------------------------------
// Unknown tool
// ---------------------------------------------------------------------------

describe("executeTool(unknown)", () => {
  it("returns error for unknown tool name", async () => {
    const result = await executeTool(
      { function: { name: "explode", arguments: {} } },
      ctx(),
    );
    expect(result).toMatch(/unknown tool/i);
  });
});
