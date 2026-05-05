import { z } from "zod";
import { AGENT_ROLES } from "../constants.js";
import { TASK_KINDS } from "../types/model-routing.js";

/**
 * Predicate is a partial match expression. Unknown keys are preserved by
 * `passthrough()` so older configs stay valid when new predicate dimensions
 * (e.g. `fileChangeEstimate`, `labels`) are added in future revisions.
 */
export const modelRoutingPredicateSchema = z
  .object({
    taskKind: z.enum(TASK_KINDS).optional(),
    agentRole: z.enum(AGENT_ROLES).optional(),
  })
  .passthrough();

export const modelRoutingRuleSchema = z.object({
  when: modelRoutingPredicateSchema,
  model: z.string().trim().min(1),
  effort: z.string().trim().min(1).optional(),
});

/**
 * Capped at 20 rules per agent — the table is meant for hand-curated routing,
 * not large rule sets. If we ever need more, raise the cap behind a flag.
 */
export const modelRoutingSchema = z.array(modelRoutingRuleSchema).max(20);

export type ModelRoutingPredicateInput = z.infer<typeof modelRoutingPredicateSchema>;
export type ModelRoutingRuleInput = z.infer<typeof modelRoutingRuleSchema>;
export type ModelRoutingInput = z.infer<typeof modelRoutingSchema>;
