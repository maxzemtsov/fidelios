/**
 * Per-task model routing resolver (FID-14).
 *
 * Reads `adapterConfig.modelRouting` (validated upstream by the agent
 * schema), walks the rules in order, and returns the first match. Falls
 * back to the agent's default `model`/`effort` when no rule fires. An
 * explicit `forceModel` override always wins.
 *
 * Adapter-agnostic: every adapter that already reads `config.model` /
 * `config.effort` benefits without per-adapter changes.
 */

import {
  modelRoutingSchema,
  type ModelRoutingDecision,
  type ModelRoutingRule,
  type TaskKind,
  type AgentRole,
} from "@fideliosai/shared";

export interface ResolveModelRoutingInput {
  /** The merged adapter config that would otherwise go to the adapter. */
  config: Record<string, unknown> | null | undefined;
  /** Task kind for this run, if known (from wake payload or inference). */
  taskKind?: TaskKind | null;
  /** Agent role from the agent record. */
  agentRole?: AgentRole | null;
  /** Explicit per-run override; bypasses the routing table when set. */
  forceModel?: string | null;
  /** Explicit per-run effort override (paired with forceModel). */
  forceEffort?: string | null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Test whether a single routing rule matches the current run context.
 *
 * Each predicate key is ANDed: a rule with `{ taskKind: 'comment', agentRole:
 * 'ceo' }` only fires when both match. A predicate key set to `undefined` is
 * a wildcard. Unknown predicate keys (forwards-compat) are ignored.
 */
function ruleMatches(
  rule: ModelRoutingRule,
  ctx: { taskKind: TaskKind | null; agentRole: AgentRole | null },
): boolean {
  const { when } = rule;
  if (when.taskKind !== undefined && when.taskKind !== ctx.taskKind) {
    return false;
  }
  if (when.agentRole !== undefined && when.agentRole !== ctx.agentRole) {
    return false;
  }
  return true;
}

/**
 * Resolve the model+effort to use for this run.
 *
 * Returns:
 *  - `{ source: 'forceModel' }` when `forceModel` is set
 *  - `{ source: 'rule', matchedRuleIndex: i }` when a routing rule fires
 *  - `{ source: 'default', matchedRuleIndex: null }` when nothing matched
 *    (caller can keep the existing config.model/config.effort untouched)
 *
 * Returns `null` only when the input config has no usable default model AND
 * no forceModel/rule fires — signalling the caller to leave config alone.
 */
export function resolveModelRouting(input: ResolveModelRoutingInput): ModelRoutingDecision | null {
  const config = (input.config ?? {}) as Record<string, unknown>;
  const taskKind = input.taskKind ?? null;
  const agentRole = input.agentRole ?? null;
  const defaultModel = readString(config.model);
  const defaultEffort = readString(config.effort);

  // Highest precedence: explicit per-run override.
  const forceModel = readString(input.forceModel);
  if (forceModel) {
    const forceEffort = readString(input.forceEffort) ?? defaultEffort ?? undefined;
    return {
      model: forceModel,
      effort: forceEffort,
      matchedRuleIndex: -1,
      source: "forceModel",
      taskKind,
    };
  }

  // Walk routing table. We re-validate here so a malformed config in the
  // database (e.g. one written before the schema existed) can't blow up the
  // resolver — it just falls through to the default.
  const rawRules = config.modelRouting;
  if (rawRules !== undefined) {
    const parsed = modelRoutingSchema.safeParse(rawRules);
    if (parsed.success) {
      for (let i = 0; i < parsed.data.length; i += 1) {
        const rule = parsed.data[i];
        if (ruleMatches(rule, { taskKind, agentRole })) {
          return {
            model: rule.model,
            effort: rule.effort ?? defaultEffort ?? undefined,
            matchedRuleIndex: i,
            source: "rule",
            taskKind,
          };
        }
      }
    }
  }

  // No override, no matching rule. Leave the caller free to keep the
  // existing default — but still return a decision so telemetry can record
  // that routing ran and produced "no change".
  if (!defaultModel) {
    return null;
  }
  return {
    model: defaultModel,
    effort: defaultEffort ?? undefined,
    matchedRuleIndex: null,
    source: "default",
    taskKind,
  };
}

/**
 * Apply a routing decision in place to a config object. Used by the
 * heartbeat to override `model`/`effort` before the adapter sees the
 * config. Returns the same object for chaining.
 */
export function applyModelRoutingDecision<T extends Record<string, unknown>>(
  config: T,
  decision: ModelRoutingDecision | null,
): T {
  if (!decision) return config;
  const target = config as Record<string, unknown>;
  target.model = decision.model;
  if (decision.effort !== undefined) {
    target.effort = decision.effort;
  }
  return config;
}
