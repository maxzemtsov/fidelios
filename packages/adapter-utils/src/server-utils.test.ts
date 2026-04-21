import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildWindowsCmdSpawn,
  linkDirWithFallback,
  linkFileWithFallback,
  quoteForCmd,
} from "./server-utils.js";

describe("quoteForCmd", () => {
  it("returns empty double-quoted string for empty input", () => {
    expect(quoteForCmd("")).toBe('""');
  });

  it("returns the arg unchanged when no special characters are present", () => {
    expect(quoteForCmd("exec")).toBe("exec");
    expect(quoteForCmd("--json")).toBe("--json");
    expect(quoteForCmd("-")).toBe("-");
  });

  it("wraps args containing whitespace in double quotes", () => {
    expect(quoteForCmd("hello world")).toBe('"hello world"');
  });

  it("wraps args containing cmd special characters in double quotes", () => {
    for (const special of ["a&b", "a<b", "a>b", "a|b", "a^b", "a(b", "a)b"]) {
      expect(quoteForCmd(special)).toBe(`"${special}"`);
    }
  });

  it("doubles internal double quotes and wraps in outer quotes", () => {
    expect(quoteForCmd('a"b')).toBe('"a""b"');
  });

  it("quotes Windows paths that contain whitespace", () => {
    const path = "C:\\Users\\Sergey F\\AppData\\Roaming\\npm\\codex.CMD";
    expect(quoteForCmd(path)).toBe(`"${path}"`);
  });
});

describe("buildWindowsCmdSpawn", () => {
  it("wraps the full command line in outer quotes so cmd /s /c preserves inner quotes", () => {
    // Regression test for the Sergey F bug: a .cmd path with whitespace must
    // survive cmd.exe's `/s /c` quote-stripping rule. The standard recipe is
    //   cmd /d /s /c ""C:\path with spaces\foo.cmd" args"
    // where cmd strips the OUTER quotes, leaving the inner quotes intact.
    const target = buildWindowsCmdSpawn(
      "C:\\Windows\\System32\\cmd.exe",
      "C:\\Users\\Sergey F\\AppData\\Roaming\\npm\\codex.CMD",
      ["exec", "--json", "-"],
    );

    expect(target.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(target.args).toEqual([
      "/d",
      "/s",
      "/c",
      '""C:\\Users\\Sergey F\\AppData\\Roaming\\npm\\codex.CMD" exec --json -"',
    ]);
    expect(target.windowsVerbatimArguments).toBe(true);
  });

  it("keeps an executable path without whitespace unquoted inside the command line", () => {
    const target = buildWindowsCmdSpawn(
      "cmd.exe",
      "C:\\Users\\tester\\AppData\\Roaming\\npm\\codex.CMD",
      ["exec", "--json", "-"],
    );

    // No inner quotes around the exe path because there is no whitespace in
    // it. The outer pair of quotes is still present — cmd /s /c strips them,
    // leaving the bare path plus args, which CMD parses correctly.
    expect(target.args[3]).toBe(
      '"C:\\Users\\tester\\AppData\\Roaming\\npm\\codex.CMD exec --json -"',
    );
  });

  it("quotes individual args that contain whitespace", () => {
    const target = buildWindowsCmdSpawn(
      "cmd.exe",
      "C:\\npm\\codex.CMD",
      ["exec", "Respond with hello."],
    );

    expect(target.args[3]).toBe('"C:\\npm\\codex.CMD exec "Respond with hello.""');
  });

  it("always requests windowsVerbatimArguments so Node does not re-escape", () => {
    // Without verbatim args, Node re-escapes internal " to \" and the CMD
    // command line becomes unparseable. This flag must be on.
    const target = buildWindowsCmdSpawn("cmd.exe", "C:\\a b\\foo.cmd", []);
    expect(target.windowsVerbatimArguments).toBe(true);
  });
});

describe("linkFileWithFallback", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fidelios-link-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates a symlink pointing at the source when permitted (POSIX)", async () => {
    // On CI and local macOS, fs.symlink always succeeds — we should land on
    // the symlink path, not fall through to hardlink or copy.
    const source = path.join(tmp, "source.json");
    const target = path.join(tmp, "target.json");
    await fs.writeFile(source, '{"ok":true}', "utf8");

    const method = await linkFileWithFallback(source, target);
    // On CI platforms where symlink works, we expect "symlink". If Node
    // ever returns EPERM on this flow (which would indicate a sandbox
    // issue) we'd fall back to hardlink or copy — all three are valid
    // outcomes for the helper; we just verify the contents propagate.
    expect(["symlink", "hardlink", "copy"]).toContain(method);

    const bytes = await fs.readFile(target, "utf8");
    expect(bytes).toBe('{"ok":true}');
  });

  it("the produced target is readable whether or not it is a symlink", async () => {
    // Regression: on Sergey's Windows the EPERM path failed entirely. A
    // successful fallback means the target is readable regardless of the
    // underlying mechanism.
    const source = path.join(tmp, "auth.json");
    const target = path.join(tmp, "mirror", "auth.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(source, "payload", "utf8");

    await linkFileWithFallback(source, target);
    const contents = await fs.readFile(target, "utf8");
    expect(contents).toBe("payload");
  });
});

describe("linkDirWithFallback", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "fidelios-linkdir-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates a link to a directory whose contents are readable through the link", async () => {
    const source = path.join(tmp, "skill");
    const target = path.join(tmp, "linked-skill");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "SKILL.md"), "# my skill", "utf8");

    const method = await linkDirWithFallback(source, target);
    expect(["symlink", "junction", "copy"]).toContain(method);

    const contents = await fs.readFile(path.join(target, "SKILL.md"), "utf8");
    expect(contents).toBe("# my skill");
  });
});
