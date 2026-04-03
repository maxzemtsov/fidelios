/**
 * Strips unpaired Unicode surrogates from strings before they reach PostgreSQL jsonb columns.
 *
 * PostgreSQL's json/jsonb parser rejects lone surrogates (\uD800-\uDFFF) that are not part
 * of a valid surrogate pair. These can appear in LLM output (e.g. Claude sometimes emits
 * partial emoji surrogates in markdown). JavaScript strings allow lone surrogates, but
 * PostgreSQL does not.
 *
 * This function recursively walks any value and replaces lone surrogates with U+FFFD
 * (Unicode replacement character) in all string leaves.
 */

// Matches a high surrogate NOT followed by a low surrogate, or a low surrogate NOT preceded by a high surrogate.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function sanitizeString(s: string): string {
  return s.replace(LONE_SURROGATE_RE, "\uFFFD");
}

/**
 * Deep-sanitize a value for safe insertion into PostgreSQL jsonb.
 * Returns a new value with all lone surrogates replaced.
 * Safe to call on any JSON-serializable value (string, number, boolean, null, object, array).
 */
export function sanitizeForJsonb<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return sanitizeString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJsonb(item)) as T;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[sanitizeString(key)] = sanitizeForJsonb(val);
    }
    return result as T;
  }

  // number, boolean — pass through
  return value;
}
