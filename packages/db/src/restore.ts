import { cpSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDatabaseBackup, runDatabaseRestore } from "./backup-lib.js";

type PartialConfig = {
  database?: {
    mode?: "embedded-postgres" | "postgres";
    connectionString?: string;
    embeddedPostgresPort?: number;
    backup?: {
      dir?: string;
      retentionDays?: number;
    };
  };
};

function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

function resolveFideliOSHomeDir(): string {
  const envHome = (process.env.FIDELIOS_HOME ?? process.env.PAPERCLIP_HOME)?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".fidelios");
}

function resolveFideliOSInstanceId(): string {
  const raw = (process.env.FIDELIOS_INSTANCE_ID ?? process.env.PAPERCLIP_INSTANCE_ID)?.trim() || "default";
  if (!/^[a-zA-Z0-9_-]+$/.test(raw)) {
    throw new Error(`Invalid instance ID '${raw}'.`);
  }
  return raw;
}

function resolveDefaultConfigPath(): string {
  return path.resolve(resolveFideliOSHomeDir(), "instances", resolveFideliOSInstanceId(), "config.json");
}

function readConfig(configPath: string): PartialConfig | null {
  if (!existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return typeof parsed === "object" && parsed ? (parsed as PartialConfig) : null;
  } catch {
    return null;
  }
}

function resolveEmbeddedPort(config: PartialConfig | null): number {
  const val = config?.database?.embeddedPostgresPort;
  if (typeof val === "number" && Number.isFinite(val) && Math.trunc(val) > 0) return Math.trunc(val);
  return 54329;
}

function resolveConnectionString(config: PartialConfig | null): string {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;
  if (config?.database?.mode === "postgres" && typeof config.database.connectionString === "string") {
    const trimmed = config.database.connectionString.trim();
    if (trimmed) return trimmed;
  }
  const port = resolveEmbeddedPort(config);
  return `postgres://paperclip:paperclip@127.0.0.1:${port}/fidelios`;
}

function resolveBackupDir(config: PartialConfig | null): string {
  const raw = config?.database?.backup?.dir;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return path.resolve(expandHomePrefix(raw.trim()));
  }
  return path.resolve(resolveFideliOSHomeDir(), "instances", resolveFideliOSInstanceId(), "data", "backups");
}

type BackupInfo = {
  name: string;
  path: string;
  size: number;
  mtime: Date;
};

function listBackups(backupDir: string): BackupInfo[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((name) => name.endsWith(".sql") || name.endsWith(".sql.gz"))
    .map((name) => {
      const fullPath = path.resolve(backupDir, name);
      const stat = statSync(fullPath);
      return { name, path: fullPath, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // newest first
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function timestamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function main() {
  const args = process.argv.slice(2);
  const configPath = resolveDefaultConfigPath();
  const config = readConfig(configPath);
  const connectionString = resolveConnectionString(config);
  const backupDir = resolveBackupDir(config);

  // Parse arguments
  const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1]
    ?? (args.indexOf("--file") >= 0 ? args[args.indexOf("--file") + 1] : undefined);
  const isLatest = args.includes("--latest");
  const isForce = args.includes("--force");
  const isList = args.includes("--list");

  // List mode
  if (isList) {
    const backups = listBackups(backupDir);
    if (backups.length === 0) {
      console.log(`No backups found in ${backupDir}`);
      return;
    }
    console.log(`Available backups (${backupDir}):\n`);
    for (const backup of backups) {
      console.log(`  ${backup.name}  ${formatSize(backup.size)}  ${timestamp(backup.mtime)}`);
    }
    console.log(`\nTotal: ${backups.length} backup(s)`);
    return;
  }

  // Determine which file to restore
  let restoreFile: string;
  if (fileArg) {
    restoreFile = path.resolve(fileArg);
    if (!existsSync(restoreFile)) {
      console.error(`Backup file not found: ${restoreFile}`);
      process.exit(1);
    }
  } else if (isLatest) {
    const backups = listBackups(backupDir);
    if (backups.length === 0) {
      console.error(`No backups found in ${backupDir}`);
      process.exit(1);
    }
    restoreFile = backups[0]!.path;
  } else {
    console.log("FideliOS Database Restore\n");
    console.log("Usage:");
    console.log("  pnpm restore --list              List available backups");
    console.log("  pnpm restore --latest             Restore most recent backup");
    console.log("  pnpm restore --file <path>        Restore specific backup file");
    console.log("  pnpm restore --latest --force     Skip confirmation prompt");
    console.log("");
    const backups = listBackups(backupDir);
    if (backups.length > 0) {
      console.log(`${backups.length} backup(s) available. Latest: ${backups[0]!.name}`);
    } else {
      console.log(`No backups found in ${backupDir}`);
    }
    return;
  }

  const stat = statSync(restoreFile);
  console.log(`Restore target: ${path.basename(restoreFile)}`);
  console.log(`  Size: ${formatSize(stat.size)}`);
  console.log(`  Date: ${timestamp(stat.mtime)}`);
  console.log(`  Connection: ${connectionString.replace(/\/\/[^@]+@/, "//***:***@")}`);
  console.log("");

  // Confirmation
  if (!isForce) {
    console.log("WARNING: This will DROP and RECREATE all tables in the database.");
    console.log("A safety backup will be created first.");
    console.log("Run with --force to skip this prompt.\n");

    // In non-interactive mode (CI/scripts), require --force
    if (!process.stdin.isTTY) {
      console.error("Non-interactive mode detected. Use --force to proceed.");
      process.exit(1);
    }

    // Simple confirmation
    process.stdout.write("Continue? [y/N] ");
    const answer = await new Promise<string>((resolve) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (data) => resolve(String(data).trim().toLowerCase()));
      // Timeout after 30 seconds
      setTimeout(() => resolve(""), 30000);
    });
    if (answer !== "y" && answer !== "yes") {
      console.log("Aborted.");
      return;
    }
  }

  // Create safety backup before restore
  console.log("\nCreating safety backup of current database state...");
  try {
    const safetyResult = await runDatabaseBackup({
      connectionString,
      backupDir,
      retentionDays: 365, // don't prune safety backups quickly
      filenamePrefix: "fidelios-pre-restore",
    });
    console.log(`  Safety backup: ${path.basename(safetyResult.backupFile)} (${formatSize(safetyResult.sizeBytes)})`);
  } catch (err) {
    console.warn(`  Warning: could not create safety backup: ${err instanceof Error ? err.message : String(err)}`);
    console.warn("  Proceeding with restore anyway (the backup file remains unchanged).");
  }

  // Execute restore
  console.log(`\nRestoring from ${path.basename(restoreFile)}...`);
  try {
    await runDatabaseRestore({
      connectionString,
      backupFile: restoreFile,
    });
    console.log("Restore completed successfully.");
  } catch (err) {
    console.error("\nRestore failed!");
    console.error(err instanceof Error ? err.message : String(err));
    console.error("\nThe database may be in an inconsistent state.");
    console.error("You can restore from the safety backup created above.");
    process.exit(1);
  }
}

await main();
