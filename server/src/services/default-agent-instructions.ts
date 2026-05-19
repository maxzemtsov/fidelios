import fs from "node:fs/promises";

// Every role gets the full four-file managed bundle. Founding agents created
// during company onboarding already received all four; agents hired later must
// get the same complete scaffold so the CEO can author a full instruction
// package and the human reviewer can see it before approving.
const DEFAULT_AGENT_BUNDLE_FILES = {
  default: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
  ceo: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
  code_reviewer: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
} as const;

type DefaultAgentBundleRole = keyof typeof DEFAULT_AGENT_BUNDLE_FILES;

function resolveDefaultAgentBundleUrl(role: DefaultAgentBundleRole, fileName: string) {
  return new URL(`../onboarding-assets/${role}/${fileName}`, import.meta.url);
}

export async function loadDefaultAgentInstructionsBundle(role: DefaultAgentBundleRole): Promise<Record<string, string>> {
  const fileNames = DEFAULT_AGENT_BUNDLE_FILES[role];
  const entries = await Promise.all(
    fileNames.map(async (fileName) => {
      const content = await fs.readFile(resolveDefaultAgentBundleUrl(role, fileName), "utf8");
      return [fileName, content] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function resolveDefaultAgentInstructionsBundleRole(role: string): DefaultAgentBundleRole {
  if (role === "ceo") return "ceo";
  if (role === "code_reviewer") return "code_reviewer";
  return "default";
}

/**
 * Merge a CEO-authored instruction package over the scaffolded role bundle.
 * Files the CEO provides win; files omitted keep the scaffold. A legacy
 * `promptTemplate` becomes `AGENTS.md` without suppressing the other files.
 * Empty / whitespace-only overrides are ignored so they cannot blank a file.
 */
export function mergeAgentInstructionBundle(
  scaffold: Record<string, string>,
  options: { promptTemplate?: string; overrideFiles?: Record<string, unknown> } = {},
): Record<string, string> {
  const files: Record<string, string> = { ...scaffold };
  const promptTemplate = options.promptTemplate ?? "";
  if (promptTemplate.trim().length > 0) {
    files["AGENTS.md"] = promptTemplate;
  }
  for (const [name, content] of Object.entries(options.overrideFiles ?? {})) {
    if (typeof content === "string" && content.trim().length > 0) {
      files[name] = content;
    }
  }
  return files;
}
