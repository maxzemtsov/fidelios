import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPlist, buildServicePath, buildSystemdUnit, resolveDevRepoDir } from "../commands/service.js";

const REPO_ROOT = path.resolve(__dirname, "../../..");

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

describe("service: dev mode plist", () => {
  const plist = buildPlist(
    "/opt/homebrew/bin/node",
    "/opt/homebrew/bin/fidelios",
    "/tmp/fidelios.log",
    { mode: "dev", repoDir: "/Users/alice/fidelios" },
  );

  it("runs dev-runner.mjs instead of the published binary", () => {
    expect(plist).toContain("/Users/alice/fidelios/scripts/dev-runner.mjs");
    expect(plist).toContain("<string>watch</string>");
    expect(plist).not.toContain("/opt/homebrew/bin/fidelios</string>");
  });

  it("sets WorkingDirectory to the repo root", () => {
    expect(plist).toMatch(/<key>WorkingDirectory<\/key>\s*<string>\/Users\/alice\/fidelios<\/string>/);
  });

  it("exposes FIDELIOS_SERVICE_MODE=dev so the running server can introspect it", () => {
    expect(plist).toMatch(/<key>FIDELIOS_SERVICE_MODE<\/key>\s*<string>dev<\/string>/);
    expect(plist).toMatch(/<key>NODE_ENV<\/key>\s*<string>development<\/string>/);
  });

  it("keeps RunAtLoad + KeepAlive true so dev services still survive reboots and crashes", () => {
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
  });

  it("throws without a repoDir (guards against silently installing a broken plist)", () => {
    expect(() => buildPlist("/opt/homebrew/bin/node", "/opt/homebrew/bin/fidelios", "/tmp/log", { mode: "dev" }))
      .toThrow(/dev mode plist requires repoDir/);
  });
});

describe("service: dev mode systemd unit", () => {
  const unit = buildSystemdUnit("/usr/bin/fidelios", "/tmp/fidelios.log", {
    mode: "dev",
    repoDir: "/home/alice/fidelios",
  });

  it("invokes dev-runner.mjs via node", () => {
    expect(unit).toMatch(/ExecStart=.+node \/home\/alice\/fidelios\/scripts\/dev-runner\.mjs watch/);
  });

  it("uses the repo dir as WorkingDirectory and flags mode via env", () => {
    expect(unit).toContain("WorkingDirectory=/home/alice/fidelios");
    expect(unit).toContain("Environment=FIDELIOS_SERVICE_MODE=dev");
    expect(unit).toContain("Environment=NODE_ENV=development");
  });
});

describe("resolveDevRepoDir", () => {
  it("finds the current checkout from the tests' own location", () => {
    const result = resolveDevRepoDir(undefined);
    expect(result).toBe(REPO_ROOT);
  });

  it("validates an explicit --repo argument", () => {
    expect(resolveDevRepoDir(REPO_ROOT)).toBe(REPO_ROOT);
  });

  it("returns null for a path that is not a fidelios checkout", () => {
    expect(resolveDevRepoDir(os.tmpdir())).toBeNull();
  });
});
