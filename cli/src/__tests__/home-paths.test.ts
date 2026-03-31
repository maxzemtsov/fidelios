import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolveFideliOSHomeDir,
  resolveFideliOSInstanceId,
} from "../config/home.js";

const ORIGINAL_ENV = { ...process.env };

describe("home path resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.fidelios and default instance", () => {
    delete process.env.FIDELIOS_HOME;
    delete process.env.FIDELIOS_INSTANCE_ID;

    const paths = describeLocalInstancePaths();
    expect(paths.homeDir).toBe(path.resolve(os.homedir(), ".fidelios"));
    expect(paths.instanceId).toBe("default");
    expect(paths.configPath).toBe(path.resolve(os.homedir(), ".fidelios", "instances", "default", "config.json"));
  });

  it("supports FIDELIOS_HOME and explicit instance ids", () => {
    process.env.FIDELIOS_HOME = "~/fidelios-home";

    const home = resolveFideliOSHomeDir();
    expect(home).toBe(path.resolve(os.homedir(), "fidelios-home"));
    expect(resolveFideliOSInstanceId("dev_1")).toBe("dev_1");
  });

  it("rejects invalid instance ids", () => {
    expect(() => resolveFideliOSInstanceId("bad/id")).toThrow(/Invalid instance id/);
  });

  it("expands ~ prefixes", () => {
    expect(expandHomePrefix("~")).toBe(os.homedir());
    expect(expandHomePrefix("~/x/y")).toBe(path.resolve(os.homedir(), "x/y"));
  });
});
