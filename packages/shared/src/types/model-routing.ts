import type { AgentRole } from "../constants.js";

/**
 * Task kinds for model routing.
 *
 * The set is intentionally small in v1; new kinds may be added later
 * without breaking existing configs because routing rules use
 * passthrough-style validation on the `when` predicate.
 */
export const TASK_KINDS = [
  "comment",
  "code",
  "triage",
  "plan",
  "research",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/**
 * Predicate vocabulary v1.
 *
 * All fields are optional; an empty `when` matches every run (useful as a
 * catch-all default at the end of the rules list).
 *
 * Forwards-compatible: unknown predicate keys are preserved by the validator
 * but ignored by the resolver, so older configs keep working when new keys
 * are added.
 */
export interface ModelRoutingPredicate {
  taskKind?: TaskKind;
  agentRole?: AgentRole;
}

export interface ModelRoutingRule {
  when: ModelRoutingPredicate;
  model: string;
  effort?: string;
}

/**
 * Result of resolving a routing decision for a single run.
 *
 * `matchedRuleIndex` is `null` when no rule matched (caller should keep the
 * default `model`/`effort` from `adapterConfig`). It is `-1` when the
 * decision came from an explicit `forceModel` override rather than the
 * routing table.
 */
export interface ModelRoutingDecision {
  model: string;
  effort?: string;
  matchedRuleIndex: number | null;
  source: "default" | "rule" | "forceModel";
  taskKind: TaskKind | null;
}
