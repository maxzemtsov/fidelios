import { describe, expect, it } from "vitest";
import { buildWindowsCmdSpawn, quoteForCmd } from "./server-utils.js";

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
