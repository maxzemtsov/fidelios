import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";
const toolsetsHint =
  "Comma-separated Hermes toolsets to enable (e.g. file,terminal,web). Leave empty for automatic LLM-driven triage — the configured model picks a relevant subset for each prompt.";
const triageModelHint =
  "Optional override for the triage router model. Defaults to the agent's `model`. Use a smaller/faster model here to reduce per-run latency.";

export function HermesLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field label="Toolsets (whitelist)" hint={toolsetsHint}>
        <DraftInput
          value={
            isCreate
              ? values!.toolsets ?? ""
              : eff("adapterConfig", "toolsets", String(config.toolsets ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ toolsets: v || undefined })
              : mark("adapterConfig", "toolsets", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="empty = auto-triage; or e.g. file,terminal,web"
        />
      </Field>
      <Field label="Triage model (optional)" hint={triageModelHint}>
        <DraftInput
          value={
            isCreate
              ? values!.triageModel ?? ""
              : eff(
                  "adapterConfig",
                  "triageModel",
                  String(config.triageModel ?? ""),
                )
          }
          onCommit={(v) =>
            isCreate
              ? set!({ triageModel: v || undefined })
              : mark("adapterConfig", "triageModel", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="e.g. qwen3:0.6b — defaults to the agent's model"
        />
      </Field>
      {!hideInstructionsFile && (
        <Field label="Agent instructions file" hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
    </>
  );
}
