/**
 * Text sanitizer for provider-authored free-text fields.
 *
 * Applied on WRITE by provider routes (task 1135) so that HTML/script
 * payloads cannot reach emails, exports, or AI prompts. The same
 * function is run by the backfill script (scripts/backfill-provider-text-sanitize.ts)
 * to clean rows written before the write-path guard existed.
 *
 * Strategy:
 *   1. Strip all HTML/XML tags (removes <script>, <img onerror=…>, etc.)
 *   2. HTML-encode any stray angle-brackets and quote characters that
 *      remain after stripping, so they cannot be reassembled into tags
 *      by an email client or template renderer.
 *   3. Trim surrounding whitespace.
 *
 * Null / undefined values are returned unchanged so callers don't need
 * to guard nullable columns.
 */

const TAG_RE = /<[^>]*>/g;

const ENTITY_MAP: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#39;",
  '"': "&quot;",
};

/**
 * Sanitize a single provider free-text value, returning null/undefined
 * unchanged.
 */
export function sanitizeText(input: string | null | undefined): typeof input {
  if (input == null) return input;
  if (typeof input !== "string") return input;

  return input
    .replace(TAG_RE, "")
    .replace(/[<>'"]/g, (ch) => ENTITY_MAP[ch] ?? ch)
    .trim();
}

/**
 * Return a shallow copy of `obj` with every string value passed through
 * `sanitizeText`. Non-string values are left untouched.
 */
export function sanitizeStringFields<T extends Record<string, unknown>>(
  obj: T,
): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v === "string") {
      out[key] = sanitizeText(v);
    }
  }
  return out as T;
}
