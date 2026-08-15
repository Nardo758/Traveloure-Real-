/**
 * Shared stored-XSS input sanitizer (canonical copy).
 *
 * Identical to the per-file copies in experts.routes.ts / admin.routes.ts /
 * content.routes.ts (extracted so new call sites — e.g. the private
 * trips.expertNotes PATCH — don't grow a fourth duplicate). Strips HTML tags
 * outright, then entity-escapes any remaining angle brackets/quotes.
 *
 * NOT for rich-text fields: this destroys markup by design.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return input;
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>'"]/g, (char) => {
      const entities: Record<string, string> = { "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" };
      return entities[char] || char;
    })
    .trim();
}
