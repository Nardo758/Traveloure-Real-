/**
 * ai-json.ts — ONE robust "parse the JSON object a model returned" helper.
 *
 * Ledger `2026-09-05-draft-cost-tracking-and-tier` (CLAUDE.md Locked Decision 41 (c)).
 *
 * WHY THIS EXISTS
 * ───────────────
 * The free draft's model tier is now a COST decision (see `ai-draft-model.ts`), and a cheaper tier
 * is marginally likelier to wrap its JSON in a code fence or a sentence of preamble. Three draft
 * call sites each had their own one-line recovery — a greedy `/\{[\s\S]*\}/` in `server/routes.ts`,
 * a fence strip in `grok.service.ts`, a fence-strip-then-greedy-match in `trip-context.routes.ts` —
 * and each failed on the shapes the others handled. §18 rule 1: one implementation, N callers.
 *
 * WHAT IT DOES
 * ────────────
 * Strips a leading/trailing markdown code fence; tries the whole response first (and REFUSES an
 * outright JSON array rather than digging an object out of it — a model that answered with a list
 * did not answer with the object the draft contract asks for); otherwise finds the first `{` and
 * walks the string BRACE-MATCHING while respecting string literals and backslash escapes, parsing
 * exactly that span. Brace matching is why it beats the greedy regex: greedy runs to the LAST `}` in the
 * response, so a valid object followed by prose containing a brace ("...}. Enjoy!") fails to
 * parse, while the first-to-matching span succeeds. When brace matching finds nothing parseable it
 * falls back to the greedy span, so it is never worse than what it replaces.
 *
 * §13 — IT NEVER INVENTS. There is no repair step that inserts a missing brace, closes an
 * unterminated string, strips a trailing comma or guesses at a truncated array: a model response
 * that was cut off mid-object is an INCOMPLETE answer, and completing it here would hand a caller
 * a plan the model never produced. Unparseable input returns `null` (or throws, for the
 * `orThrow` caller shape) and the caller degrades honestly.
 */

/** Remove a wrapping ```json … ``` (or bare ```) fence, if present. */
function stripCodeFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * The span from the first `{` to ITS matching `}` — string-literal and escape aware.
 * Returns null when there is no `{`, or when the braces never balance (a truncated response).
 */
function firstBalancedObjectSpan(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      // Only meaningful inside a string, but harmless outside one: JSON has no other backslash.
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse the JSON OBJECT out of a model response. Returns null when nothing parseable is present —
 * never a partial or repaired object.
 */
export function parseAiJsonObject<T = Record<string, unknown>>(raw: string | null | undefined): T | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const cleaned = stripCodeFence(raw);

  // The whole response FIRST — and an outright ARRAY is refused here rather than dug into. A model
  // that answered with a list did not answer with the object the draft contract asks for, and
  // plucking its first element would be this module inventing an interpretation (§13), which is
  // exactly what the brace scan below would otherwise do.
  try {
    const whole = JSON.parse(cleaned);
    if (whole && typeof whole === "object" && !Array.isArray(whole)) return whole as T;
    if (Array.isArray(whole)) return null;
  } catch {
    // not bare JSON — recover a span below
  }

  const balanced = firstBalancedObjectSpan(cleaned);
  if (balanced) {
    try {
      const parsed = JSON.parse(balanced);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    } catch {
      // fall through to the greedy span below — never worse than the call sites this replaces
    }
  }

  // Greedy first-`{`-to-last-`}` fallback: the exact predicate the previous call sites used.
  const greedy = cleaned.match(/\{[\s\S]*\}/);
  if (greedy) {
    try {
      const parsed = JSON.parse(greedy[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Same parse, but throws with a stated reason instead of returning null — for the call sites whose
 * existing contract is "a bad response is an error", so this lane changes recovery and not
 * behaviour on failure.
 */
export function parseAiJsonObjectOrThrow<T = Record<string, unknown>>(
  raw: string | null | undefined,
  what: string,
): T {
  const parsed = parseAiJsonObject<T>(raw);
  if (parsed === null) {
    throw new Error(`${what}: the model response contained no parseable JSON object`);
  }
  return parsed;
}
