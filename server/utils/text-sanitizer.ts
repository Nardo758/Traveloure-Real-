/**
 * Text sanitizer for provider-authored free-text fields.
 *
 * Applied on WRITE by provider routes (task 1135) so that HTML/script
 * payloads cannot reach emails, exports, or AI prompts. The same
 * function is used by the backfill script (scripts/backfill-provider-text-sanitize.ts)
 * to clean rows written before the write-path guard existed.
 *
 * Strategy:
 *   1. Strip ACTUAL HTML/XML tags — sequences that begin with `<`, start with a
 *      letter, `/`, or `!` (marking a tag name, closing tag, comment, or DOCTYPE),
 *      and end with `>`. Plain angle-brackets in prose ("price < $50", "3 < x < 10")
 *      are NOT matched and are preserved as-is.
 *   2. HTML-encode any bare `<` or `>` that remains after stripping, so they cannot
 *      be reassembled into tags by an email client or template renderer.
 *   3. Trim surrounding whitespace.
 *
 * Null / undefined values are returned unchanged so callers don't need to guard
 * nullable columns.
 *
 * What this is NOT:
 *   - A general-purpose HTML parser. It neutralises the common stored-XSS patterns
 *     (<script>, <img onerror=…>, <a href="javascript:…">, event-attribute injections)
 *     without corrupting legitimate free text that happens to contain angle brackets.
 *   - A reversible transformation. Do not apply it to content that must survive a
 *     round-trip with real HTML preserved (use a dedicated HTML sanitizer library for
 *     that use-case).
 */

/**
 * Matches real HTML/XML tags:
 *   <tagName …>          — opening / self-closing
 *   </tagName …>         — closing
 *   <!-- … -->           — HTML comment (non-greedy across newlines)
 *   <!DOCTYPE …>         — DOCTYPE declaration
 *   <?…?>                — XML processing instruction
 *
 * Does NOT match bare `<` followed by whitespace, digits, or punctuation,
 * so text like "price < $50" or "option a < option b" is left intact.
 */
const TAG_RE =
  /<(?:\/[A-Za-z][^>]*|[A-Za-z][^>]*|!--[\s\S]*?--|![A-Za-z][^>]*|\?[^>]*\?)>/g;

const ENTITY_MAP: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
};

/**
 * Sanitize a single provider free-text value.
 * Returns null / undefined unchanged.
 */
export function sanitizeText(input: string | null | undefined): typeof input {
  if (input == null) return input;
  if (typeof input !== "string") return input;

  return input
    .replace(TAG_RE, "")                          // step 1 — strip real HTML tags
    .replace(/[<>]/g, (ch) => ENTITY_MAP[ch])     // step 2 — encode stray angle brackets
    .trim();                                       // step 3 — trim whitespace
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

/**
 * Recursively sanitize any JSON-safe value before storage.
 *
 * - Strings are passed through `sanitizeText` (HTML tags stripped, stray angle
 *   brackets entity-encoded).
 * - Arrays are mapped element-by-element with the same recursion, so nested
 *   arrays (e.g. [[tag]], arrays-of-objects) are fully covered.
 * - Plain objects are copied with every value recursed.
 * - All other values (numbers, booleans, null, undefined) are returned as-is.
 *
 * Use this on free-text form payloads (e.g. expert application bodies) before
 * writing them to the database so that stored-XSS payloads cannot reach any
 * surface that renders these fields as HTML.
 */
export function sanitizeDeep(val: unknown): unknown {
  if (typeof val === "string") return sanitizeText(val);
  if (Array.isArray(val)) return val.map(sanitizeDeep);
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(val as object)) {
      out[key] = sanitizeDeep((val as Record<string, unknown>)[key]);
    }
    return out;
  }
  return val;
}
