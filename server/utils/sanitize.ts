/**
 * Shared stored-XSS input sanitizer — the ONE copy (board #1318).
 *
 * Six identical private copies of this function (routes.ts and the payments / content / experts /
 * admin / trips route modules) now import it from here (§18 rule 1).
 *
 * What it does: strips HTML tags outright, then entity-escapes any remaining angle brackets.
 *
 * QUOTES ARE NO LONGER ENCODED (board #1318). This used to also turn `'` into `&#39;` and `"` into
 * `&quot;` on write, on the theory that React would render the entity as the character. It does
 * not: JSX renders a text node, so every apostrophe in a bio, headline or note showed on screen as
 * the six characters `&#39;`, and every escaping renderer (emails, OG previews) showed `&amp;#39;`.
 * A quote is only dangerous inside an HTML ATTRIBUTE built by string concatenation, and the job of
 * escaping it belongs to THAT renderer, at render time: emails use `escHtml`, the storefront /
 * service / ready-made / SEO pages use their own escapers, and the shared-itinerary OG page now
 * escapes too (it was the one attribute sink that did not). Rows written before this change still
 * hold the encoded form; nothing rewrites them here.
 *
 * NOT for rich-text fields: this destroys markup by design.
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return input;
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, (char) => (char === "<" ? "&lt;" : "&gt;"))
    .trim();
}
