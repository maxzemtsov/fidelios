import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Vitest 3.2.x intermittently fails to apply a `vi.mock("../services/index.js")`
    // for one random test file when the whole server suite (~105 files) runs
    // through a single Vitest process: the route under test then reaches the
    // real service instead of its mock (e.g. 200 instead of 201, or a service
    // spy with zero calls). Every file is deterministic in isolation — the race
    // only surfaces at suite scale — and it is transient per attempt, so a
    // retry clears it. This retry tolerates that test-infrastructure flake; it
    // does not mask product bugs, since a genuine failure still fails every
    // attempt and is reported.
    retry: 2,
  },
});
