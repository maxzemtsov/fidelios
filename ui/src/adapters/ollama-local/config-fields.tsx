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
const hostHint =
  "Ollama daemon URL. Use https://ollama.com for Ollama Cloud (requires OLLAMA_API_KEY env var). Defaults to http://localhost:11434.";
const tierHint =
  "Optional Ollama Cloud tier label (e.g. pro). Sent as a request hint when calling cloud-hosted models.";
const advancedHint =
  "Advanced knobs (keepAlive, numCtx, think, timeoutSec) can be set via Extra args below as key=value lines, e.g. `keepAlive=10m`.";

export function OllamaLocalConfigFields({
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
      <Field label="Host" hint={hostHint}>
        <DraftInput
          value={
            isCreate
              ? values!.ollamaHost ?? ""
              : eff("adapterConfig", "host", String(config.host ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ ollamaHost: v || undefined })
              : mark("adapterConfig", "host", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="http://localhost:11434"
        />
      </Field>
      <Field label="Cloud tier" hint={tierHint}>
        <DraftInput
          value={
            isCreate
              ? values!.ollamaTier ?? ""
              : eff("adapterConfig", "ollamaTier", String(config.ollamaTier ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ ollamaTier: v || undefined })
              : mark("adapterConfig", "ollamaTier", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="e.g. pro"
        />
      </Field>
      <p className="text-xs text-muted-foreground">{advancedHint}</p>
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
