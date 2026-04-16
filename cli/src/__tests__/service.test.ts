import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPlist, buildServicePath, buildSystemdUnit } from "../commands/service.js";

describe("service: buildServicePath", () => {
  it("includes node dir, common adapter locations, and system dirs", () => {
    const pathStr = buildServicePath("/opt/homebrew/bin/node");
    const parts = pathStr.split(":");
    const homeDir = os.homedir();

    // Node dir first
    expect(parts[0]).toBe("/opt/homebrew/bin");
    // Common adapter homes
    expect(parts).toContain(path.join(homeDir, ".claude", "local", "bin"));
    expect(parts).toContain(path.join(homeDir, ".codex", "bin"));
    expect(parts).toContain(path.join(homeDir, ".cargo", "bin"));
    expect(parts).toContain(path.join(homeDir, ".npm-global", "bin"));
    // System dirs
    expect(parts).toContain("/opt/homebrew/bin");
    expect(parts).toContain("/usr/local/bin");
    expect(parts).toContain("/usr/bin");
    expect(parts).toContain("/bin");
  });

  it("deduplicates entries (e.g. when nodeBin is already in /opt/homebrew/bin)", () => {
    const pathStr = buildServicePath("/opt/homebrew/bin/node");
    const parts = pathStr.split(":");
    const occurrences = parts.filter((p) => p === "/opt/homebrew/bin").length;
    expect(occurrences).toBe(1);
  });
});

describe("service: buildPlist (macOS launchd)", () => {
  const plist = buildPlist("/opt/homebrew/bin/node", "/opt/homebrew/bin/fidelios", "/tmp/fidelios.log");

  it("sets RunAtLoad=true so the service runs at login", () => {
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
  });

  it("sets KeepAlive=true so launchd restarts the process on any exit", () => {
    // Must NOT be the old conditional `<dict><key>SuccessfulExit</key><false/></dict>`
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).not.toMatch(/<key>SuccessfulExit<\/key>/);
  });

  it("includes adapter CLI paths in the plist PATH env var", () => {
    expect(plist).toContain("/.claude/local/bin");
    expect(plist).toContain("/.codex/bin");
    expect(plist).toContain("/opt/homebrew/bin");
    expect(plist).toContain("/usr/local/bin");
  });

  it("carries ThrottleInterval so restart storms don't melt the CPU", () => {
    expect(plist).toMatch(/<key>ThrottleInterval<\/key>\s*<integer>10<\/integer>/);
  });
});

describe("service: buildSystemdUnit (Linux)", () => {
  const unit = buildSystemdUnit("/usr/bin/fidelios", "/tmp/fidelios.log");

  it("restarts unconditionally (Restart=always)", () => {
    expect(unit).toContain("Restart=always");
  });

  it("seeds PATH so adapter CLIs resolve", () => {
    const pathLine = unit.split("\n").find((line) => line.startsWith("Environment=PATH="));
    expect(pathLine).toBeDefined();
    expect(pathLine!).toContain("/opt/homebrew/bin");
    expect(pathLine!).toContain("/.claude/local/bin");
  });
});
