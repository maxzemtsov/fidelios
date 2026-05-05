import type { AdapterConfigFieldsProps } from "./types";
import { Field, DraftInput, help } from "../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const selectClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono text-foreground";

/**
 * Model selector rendered inside adapter config forms for local adapters.
 * - When the server returns a non-empty model list: renders a <select> dropdown.
 * - When the model list is empty (e.g. still loading, or adapter has no curated list): renders a free-text input.
 */
export function LocalWorkspaceRuntimeFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  models,
}: AdapterConfigFieldsProps) {
  const currentModel = isCreate
    ? (values!.model ?? "")
    : eff("adapterConfig", "model", String(config.model ?? ""));

  const handleChange = (v: string) => {
    if (isCreate) {
      set!({ model: v || undefined });
    } else {
      mark("adapterConfig", "model", v || undefined);
    }
  };

  return (
    <Field label="Model" hint={help.model}>
      {models.length > 0 ? (
        <select
          className={selectClass}
          value={currentModel}
          onChange={(e) => handleChange(e.target.value)}
        >
          <option value="">— default —</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      ) : (
        <DraftInput
          value={currentModel}
          onCommit={handleChange}
          immediate
          className={inputClass}
          placeholder="e.g. gpt-5.5, claude-sonnet-4-6, openai/gpt-4o"
        />
      )}
    </Field>
  );
}
