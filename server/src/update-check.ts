import { logger as baseLogger } from "./middleware/logger.js";

const logger = baseLogger.child({ module: "update-check" });

export interface UpdateCheckResult {
  latestVersion: string | null;
  updateAvailable: boolean;
  checkedAt: string | null;
}

interface UpdateCheckerOpts {
  currentVersion: string;
  enabled: boolean;
  intervalMs?: number;
  packageName?: string;
  registryUrl?: string;
}

const DEFAULT_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const FETCH_TIMEOUT_MS = 10_000;

const DISABLED_RESULT: UpdateCheckResult = Object.freeze({
  latestVersion: null,
  updateAvailable: false,
  checkedAt: null,
});

/**
 * Compare two semver strings (major.minor.patch).
 * Returns true when `latest` is strictly newer than `current`.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const cur = current.split(".").map(Number);
  const lat = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((lat[i] ?? 0) > (cur[i] ?? 0)) return true;
    if ((lat[i] ?? 0) < (cur[i] ?? 0)) return false;
  }
  return false;
}

export function createUpdateChecker(opts: UpdateCheckerOpts) {
  const {
    currentVersion,
    enabled,
    intervalMs = DEFAULT_INTERVAL_MS,
    packageName = "fidelios",
    registryUrl = "https://registry.npmjs.org",
  } = opts;

  let cached: UpdateCheckResult = { ...DISABLED_RESULT };
  let timer: ReturnType<typeof setInterval> | null = null;

  async function check(): Promise<void> {
    try {
      const res = await fetch(`${registryUrl}/${packageName}/latest`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        logger.debug({ status: res.status }, "npm registry returned non-200");
        return;
      }
      const data = (await res.json()) as { version?: string };
      const latest = data.version;
      if (!latest || typeof latest !== "string") {
        logger.debug("npm registry response missing version field");
        return;
      }
      cached = {
        latestVersion: latest,
        updateAvailable: isNewerVersion(currentVersion, latest),
        checkedAt: new Date().toISOString(),
      };
      if (cached.updateAvailable) {
        logger.info(
          { current: currentVersion, latest },
          `Update available: ${currentVersion} → ${latest}`,
        );
      }
    } catch (err) {
      // Network error, timeout, JSON parse failure — all silent
      logger.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "update check failed (non-critical)",
      );
    }
  }

  return {
    getStatus(): UpdateCheckResult {
      if (!enabled) return DISABLED_RESULT;
      return cached;
    },

    start(): void {
      if (!enabled) return;
      // Immediate first check (fire-and-forget)
      void check();
      timer = setInterval(() => void check(), intervalMs);
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
