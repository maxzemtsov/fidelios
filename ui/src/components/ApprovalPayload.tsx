import { UserPlus, Lightbulb, ShieldAlert, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "../lib/utils";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";

export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
  budget_override_required: "Budget Override",
};

/** Build a contextual label for an approval, e.g. "Hire Agent: Designer" */
export function approvalLabel(type: string, payload?: Record<string, unknown> | null): string {
  const base = typeLabel[type] ?? type;
  if (type === "hire_agent" && payload?.name) {
    return `${base}: ${String(payload.name)}`;
  }
  return base;
}

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  budget_override_required: ShieldAlert,
};

export const defaultTypeIcon = ShieldCheck;

function PayloadField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

function SkillList({ values }: { values: unknown }) {
  if (!Array.isArray(values)) return null;
  const items = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Skills</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Name</span>
        <span className="font-medium">{String(payload.name ?? "—")}</span>
      </div>
      <PayloadField label="Role" value={payload.role} />
      <PayloadField label="Title" value={payload.title} />
      <PayloadField label="Icon" value={payload.icon} />
      {!!payload.capabilities && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Capabilities</span>
          <span className="text-muted-foreground">{String(payload.capabilities)}</span>
        </div>
      )}
      {!!payload.adapterType && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Adapter</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {String(payload.adapterType)}
          </span>
        </div>
      )}
      <SkillList values={payload.desiredSkills} />
    </div>
  );
}

const INSTRUCTION_FILE_ORDER = ["AGENTS.md", "SOUL.md", "HEARTBEAT.md", "TOOLS.md"];

function formatInstructionSize(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  return `${(chars / 1024).toFixed(1)} KB`;
}

/**
 * Shows a hired agent's full four-file instruction package (AGENTS / SOUL /
 * HEARTBEAT / TOOLS) so the reviewer sees the complete scope before deciding.
 * Detail-page only — fetches the materialized bundle live and stays silent if
 * the agent or bundle is gone (e.g. a rejected hire).
 */
export function HireInstructionPackage({ agentId }: { agentId: string }) {
  const query = useQuery({
    queryKey: queryKeys.agents.instructionsBundleFiles(agentId),
    queryFn: () => agentsApi.instructionsBundleFiles(agentId),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">
          Instructions
        </span>
        <span className="text-xs text-muted-foreground">Loading instruction package…</span>
      </div>
    );
  }

  const files = query.data?.files ?? {};
  const entryFile = query.data?.entryFile ?? "AGENTS.md";
  const names = [
    ...INSTRUCTION_FILE_ORDER.filter((name) => name in files),
    ...Object.keys(files).filter((name) => !INSTRUCTION_FILE_ORDER.includes(name)),
  ];
  if (names.length === 0) return null;

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">
        Instructions
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {names.map((name) => {
          const content = files[name] ?? "";
          return (
            <details
              key={name}
              open={name === entryFile}
              className="rounded border border-border/70 bg-muted/30"
            >
              <summary className="cursor-pointer px-2 py-1 font-mono text-[11px] text-muted-foreground">
                {name} · {formatInstructionSize(content.length)}
              </summary>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 px-2 py-1.5 text-[11px] text-foreground">
                {content.trim() || "(empty)"}
              </pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const plan = payload.plan ?? payload.description ?? payload.strategy ?? payload.text;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Title" value={payload.title} />
      {!!plan && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">
          {String(plan)}
        </div>
      )}
      {!plan && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function BudgetOverridePayload({ payload }: { payload: Record<string, unknown> }) {
  const budgetAmount = typeof payload.budgetAmount === "number" ? payload.budgetAmount : null;
  const observedAmount = typeof payload.observedAmount === "number" ? payload.observedAmount : null;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Scope" value={payload.scopeName ?? payload.scopeType} />
      <PayloadField label="Window" value={payload.windowKind} />
      <PayloadField label="Metric" value={payload.metric} />
      {(budgetAmount !== null || observedAmount !== null) ? (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Limit {budgetAmount !== null ? formatCents(budgetAmount) : "—"} · Observed {observedAmount !== null ? formatCents(observedAmount) : "—"}
        </div>
      ) : null}
      {!!payload.guidance && (
        <p className="text-muted-foreground">{String(payload.guidance)}</p>
      )}
    </div>
  );
}

export function ApprovalPayloadRenderer({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "budget_override_required") return <BudgetOverridePayload payload={payload} />;
  return <CeoStrategyPayload payload={payload} />;
}
