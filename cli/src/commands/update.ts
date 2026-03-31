import { execSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { printFideliOSCliBanner } from "../utils/banner.js";

type UpdateOptions = {
  beta?: boolean;
};

function getCurrentVersion(): string {
  try {
    const pkg = execSync("npm ls -g fidelios --json --depth=0", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(pkg);
    return parsed.dependencies?.fidelios?.version ?? "unknown";
  } catch {
    // Fallback: read from package.json embedded in bundle
    try {
      return execSync("fidelios --version", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "unknown";
    }
  }
}

function getLatestVersion(tag: string): string | null {
  try {
    return execSync(`npm view fidelios@${tag} version`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export async function updateCommand(opts: UpdateOptions): Promise<void> {
  printFideliOSCliBanner();
  p.intro(pc.bgCyan(pc.black(" fidelios update ")));

  const current = getCurrentVersion();
  const tag = opts.beta ? "next" : "latest";
  const label = opts.beta ? "beta" : "stable";

  p.log.message(`Current version: ${pc.cyan(current)}`);

  const spinner = p.spinner();
  spinner.start(`Checking for ${label} updates...`);
  const latest = getLatestVersion(tag);

  if (!latest) {
    spinner.stop(pc.yellow(`Could not reach npm registry.`));
    p.outro("Try again later.");
    return;
  }

  if (latest === current) {
    spinner.stop(pc.green(`Already on latest ${label} version: ${current}`));
    p.outro("No update needed.");
    return;
  }

  spinner.stop(`New ${label} version available: ${pc.green(latest)} (current: ${pc.dim(current)})`);

  const confirm = await p.confirm({
    message: `Update fidelios ${current} → ${latest}?`,
  });

  if (p.isCancel(confirm) || !confirm) {
    p.outro("Cancelled.");
    return;
  }

  const installSpinner = p.spinner();
  installSpinner.start(`Installing fidelios@${latest}...`);
  try {
    execSync(`npm install -g fidelios@${latest}`, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    installSpinner.stop(pc.green(`Updated to fidelios@${latest}`));
    p.outro("Restart FideliOS to use the new version.");
  } catch (err) {
    installSpinner.stop(pc.red("Update failed."));
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
    p.outro("Try manually: npm install -g fidelios@latest");
  }
}

/**
 * Check for updates silently during `fidelios run`.
 * Returns a message string if update is available, null otherwise.
 * Never throws — swallows all errors.
 */
export function checkForUpdateSilently(currentVersion: string): string | null {
  try {
    const latest = execSync("npm view fidelios@latest version", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();

    if (!latest || latest === currentVersion) return null;

    // Compare semver: only notify for higher versions
    const cur = currentVersion.split(".").map(Number);
    const lat = latest.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((lat[i] ?? 0) > (cur[i] ?? 0)) {
        return `Update available: ${currentVersion} → ${latest}. Run ${pc.cyan("fidelios update")} to upgrade.`;
      }
      if ((lat[i] ?? 0) < (cur[i] ?? 0)) return null;
    }
    return null;
  } catch {
    return null;
  }
}
