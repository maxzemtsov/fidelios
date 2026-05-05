import type { ModelRoutingRule } from "@fideliosai/shared";

/**
 * Read routing rules from an arbitrary `adapterConfig.modelRouting` value.
 *
 * The server validates the shape via `modelRoutingSchema`, but in the UI we
 * may briefly see legacy or partially-typed values. Anything that is not a
 * valid array is normalized to an empty list so the editor never crashes.
 */
export function rulesFromConfig(value: unknown): ModelRoutingRule[] {
  if (!Array.isArray(value)) return [];
  const rules: ModelRoutingRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const whenRaw = rec.when;
    const when =
      whenRaw && typeof whenRaw === "object"
        ? (whenRaw as Record<string, unknown>)
        : {};
    const taskKind = typeof when.taskKind === "string" ? when.taskKind : undefined;
    const agentRole = typeof when.agentRole === "string" ? when.agentRole : undefined;
    const model = typeof rec.model === "string" ? rec.model : "";
    const effort =
      typeof rec.effort === "string" && rec.effort.length > 0
        ? rec.effort
        : undefined;
    const normalized: ModelRoutingRule = {
      when: {
        ...(taskKind ? { taskKind: taskKind as ModelRoutingRule["when"]["taskKind"] } : {}),
        ...(agentRole ? { agentRole: agentRole as ModelRoutingRule["when"]["agentRole"] } : {}),
      },
      model,
      ...(effort ? { effort } : {}),
    };
    rules.push(normalized);
  }
  return rules;
}

/**
 * Convert the editor's working list back to the `adapterConfig.modelRouting`
 * value. Returns `undefined` for an empty list so we don't write an empty
 * array into adapter config (matches the "no routing" baseline).
 */
export function rulesToConfig(rules: ModelRoutingRule[]): ModelRoutingRule[] | undefined {
  if (rules.length === 0) return undefined;
  return rules.map((rule) => ({
    when: { ...rule.when },
    model: rule.model,
    ...(rule.effort ? { effort: rule.effort } : {}),
  }));
}

export function emptyRule(): ModelRoutingRule {
  return { when: {}, model: "" };
}

export function addRule(rules: ModelRoutingRule[]): ModelRoutingRule[] {
  return [...rules, emptyRule()];
}

export function removeRule(
  rules: ModelRoutingRule[],
  index: number,
): ModelRoutingRule[] {
  if (index < 0 || index >= rules.length) return rules;
  const next = rules.slice();
  next.splice(index, 1);
  return next;
}

export function moveRule(
  rules: ModelRoutingRule[],
  index: number,
  direction: "up" | "down",
): ModelRoutingRule[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= rules.length) return rules;
  if (target < 0 || target >= rules.length) return rules;
  const next = rules.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updateRule(
  rules: ModelRoutingRule[],
  index: number,
  patch: Partial<{
    taskKind: string | undefined;
    agentRole: string | undefined;
    model: string;
    effort: string | undefined;
  }>,
): ModelRoutingRule[] {
  if (index < 0 || index >= rules.length) return rules;
  const next = rules.slice();
  const current = next[index]!;
  const when = { ...current.when };
  if ("taskKind" in patch) {
    if (patch.taskKind) {
      when.taskKind = patch.taskKind as ModelRoutingRule["when"]["taskKind"];
    } else {
      delete when.taskKind;
    }
  }
  if ("agentRole" in patch) {
    if (patch.agentRole) {
      when.agentRole = patch.agentRole as ModelRoutingRule["when"]["agentRole"];
    } else {
      delete when.agentRole;
    }
  }
  next[index] = {
    when,
    model: patch.model !== undefined ? patch.model : current.model,
    ...(patch.effort !== undefined
      ? patch.effort
        ? { effort: patch.effort }
        : {}
      : current.effort
        ? { effort: current.effort }
        : {}),
  };
  return next;
}

export function isRuleInvalid(rule: ModelRoutingRule): boolean {
  return rule.model.trim().length === 0;
}
