import { Command } from "commander";
import { onboard } from "./commands/onboard.js";
import { doctor } from "./commands/doctor.js";
import { envCommand } from "./commands/env.js";
import { configure } from "./commands/configure.js";
import { addAllowedHostname } from "./commands/allowed-hostname.js";
import { heartbeatRun } from "./commands/heartbeat-run.js";
import { runCommand } from "./commands/run.js";
import { bootstrapCeoInvite } from "./commands/auth-bootstrap-ceo.js";
import { dbBackupCommand } from "./commands/db-backup.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { updateCommand } from "./commands/update.js";
import { registerContextCommands } from "./commands/client/context.js";
import { registerCompanyCommands } from "./commands/client/company.js";
import { registerIssueCommands } from "./commands/client/issue.js";
import { registerAgentCommands } from "./commands/client/agent.js";
import { registerApprovalCommands } from "./commands/client/approval.js";
import { registerActivityCommands } from "./commands/client/activity.js";
import { registerDashboardCommands } from "./commands/client/dashboard.js";
import { applyDataDirOverride, type DataDirOptionLike } from "./config/data-dir.js";
import { loadFideliOSEnvFile } from "./config/env.js";
import { registerWorktreeCommands } from "./commands/worktree.js";
import { registerPluginCommands } from "./commands/client/plugin.js";
import { registerClientAuthCommands } from "./commands/client/auth.js";
import { serviceInstall, serviceUninstall, serviceStatus, serviceSwitch } from "./commands/service.js";
import { stopCommand } from "./commands/stop.js";

const program = new Command();
const DATA_DIR_OPTION_HELP =
  "FideliOS data directory root (isolates state from ~/.fidelios)";

program
  .name("fidelios")
  .description("FideliOS CLI — setup, diagnose, and configure your instance")
  .version("0.2.7");

program.hook("preAction", (_thisCommand, actionCommand) => {
  const options = actionCommand.optsWithGlobals() as DataDirOptionLike;
  const optionNames = new Set(actionCommand.options.map((option) => option.attributeName()));
  applyDataDirOverride(options, {
    hasConfigOption: optionNames.has("config"),
    hasContextOption: optionNames.has("context"),
  });
  loadFideliOSEnvFile(options.config);
});

program
  .command("onboard")
  .description("Interactive first-run setup wizard")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-y, --yes", "Accept defaults (quickstart + start immediately)", false)
  .option("--run", "Start FideliOS immediately after saving config", false)
  .action(onboard);

program
  .command("doctor")
  .description("Run diagnostic checks on your FideliOS setup")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--repair", "Attempt to repair issues automatically")
  .alias("--fix")
  .option("-y, --yes", "Skip repair confirmation prompts")
  .action(async (opts) => {
    await doctor(opts);
  });

program
  .command("env")
  .description("Print environment variables for deployment")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(envCommand);

program
  .command("configure")
  .description("Update configuration sections")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-s, --section <section>", "Section to configure (llm, database, logging, server, storage, secrets)")
  .action(configure);

program
  .command("db:backup")
  .description("Create a one-off database backup using current config")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--dir <path>", "Backup output directory (overrides config)")
  .option("--retention-days <days>", "Retention window used for pruning", (value) => Number(value))
  .option("--filename-prefix <prefix>", "Backup filename prefix", "fidelios")
  .option("--json", "Print backup metadata as JSON")
  .action(async (opts) => {
    await dbBackupCommand(opts);
  });

program
  .command("uninstall")
  .description("Uninstall FideliOS and optionally remove all data")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--force", "Remove everything including backups, skip confirmation", false)
  .action(uninstallCommand);

program
  .command("update")
  .description("Check for and install the latest FideliOS version")
  .option("--beta", "Update to latest beta/pre-release version", false)
  .action(updateCommand);

program
  .command("allowed-hostname")
  .description("Allow a hostname for authenticated/private mode access")
  .argument("<host>", "Hostname to allow (for example your-hostname)")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .action(addAllowedHostname);

program
  .command("run")
  .description("Bootstrap local setup (onboard + doctor) and run FideliOS")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("-i, --instance <id>", "Local instance id (default: default)")
  .option("--repair", "Attempt automatic repairs during doctor", true)
  .option("--no-repair", "Disable automatic repairs during doctor")
  .action(runCommand);

program
  .command("stop")
  .description("Stop every running FideliOS process (server, embedded postgres, plugin workers) and clean stale lock files")
  .option("--service", "Also unload the launchd/systemd background service")
  .option("-n, --dry-run", "Show what would be killed without actually killing")
  .action(stopCommand);

const heartbeat = program.command("heartbeat").description("Heartbeat utilities");

heartbeat
  .command("run")
  .description("Run one agent heartbeat and stream live logs")
  .requiredOption("-a, --agent-id <agentId>", "Agent ID to invoke")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--context <path>", "Path to CLI context file")
  .option("--profile <name>", "CLI context profile name")
  .option("--api-base <url>", "Base URL for the FideliOS server API")
  .option("--api-key <token>", "Bearer token for agent-authenticated calls")
  .option(
    "--source <source>",
    "Invocation source (timer | assignment | on_demand | automation)",
    "on_demand",
  )
  .option("--trigger <trigger>", "Trigger detail (manual | ping | callback | system)", "manual")
  .option("--timeout-ms <ms>", "Max time to wait before giving up", "0")
  .option("--json", "Output raw JSON where applicable")
  .option("--debug", "Show raw adapter stdout/stderr JSON chunks")
  .action(heartbeatRun);

registerContextCommands(program);
registerCompanyCommands(program);
registerIssueCommands(program);
registerAgentCommands(program);
registerApprovalCommands(program);
registerActivityCommands(program);
registerDashboardCommands(program);
registerWorktreeCommands(program);
registerPluginCommands(program);

const service = program.command("service").description("Manage the FideliOS background service");

service
  .command("install")
  .description("Register FideliOS with the OS process manager and start it immediately")
  .option("--dev", "Install in dev mode (runs dev-runner.mjs watch from the repo — honours Auto-Restart toggle)", false)
  .option("--release", "Install in release mode (published fidelios binary, default)", false)
  .option("--repo <path>", "Path to the FideliOS monorepo (dev mode only; auto-detected by default)")
  .action((opts) => {
    const mode: "dev" | "release" = opts.dev ? "dev" : "release";
    return serviceInstall({ mode, repoDir: opts.repo });
  });

service
  .command("uninstall")
  .description("Stop and remove the background service (data is preserved)")
  .action(serviceUninstall);

service
  .command("status")
  .description("Report whether the service is installed, running, and accepting connections")
  .action(serviceStatus);

service
  .command("switch")
  .description("Switch the installed service between dev and release mode")
  .argument("<mode>", "'dev' or 'release'")
  .option("--repo <path>", "Path to the FideliOS monorepo (dev mode only)")
  .action((modeArg: string, opts) => {
    if (modeArg !== "dev" && modeArg !== "release") {
      console.error(`Invalid mode "${modeArg}" — expected "dev" or "release".`);
      process.exit(1);
    }
    return serviceSwitch({ mode: modeArg, repoDir: opts.repo });
  });

service
  .command("dev")
  .description("Shortcut for `fidelios service switch dev` — enables hot-reload + Auto-Restart toggle")
  .option("--repo <path>", "Path to the FideliOS monorepo (auto-detected by default)")
  .action((opts) => serviceSwitch({ mode: "dev", repoDir: opts.repo }));

service
  .command("release")
  .description("Shortcut for `fidelios service switch release` — back to the published fidelios binary")
  .action(() => serviceSwitch({ mode: "release" }));

const auth = program.command("auth").description("Authentication and bootstrap utilities");

auth
  .command("bootstrap-ceo")
  .description("Create a one-time bootstrap invite URL for first instance admin")
  .option("-c, --config <path>", "Path to config file")
  .option("-d, --data-dir <path>", DATA_DIR_OPTION_HELP)
  .option("--force", "Create new invite even if admin already exists", false)
  .option("--expires-hours <hours>", "Invite expiration window in hours", (value) => Number(value))
  .option("--base-url <url>", "Public base URL used to print invite link")
  .action(bootstrapCeoInvite);

registerClientAuthCommands(auth);

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
