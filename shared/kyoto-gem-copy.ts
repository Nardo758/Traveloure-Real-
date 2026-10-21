/**
 * Minimal reword of banned phrases in Kyoto gem copy (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 * The migration's regexp is the writer on stored rows. This function is the same replacement,
 * used by the pin so the two cannot drift in silence: geisha-as-adjective becomes "district",
 * "back alley(s)" becomes "lane(s)", and "hidden gem(s)" is deleted. Nothing is invented.
 * An emptied string becomes null (there is no remaining sentence to show).
 */

const BANNED_WORDING = /\b(?:geishas?|back\s+alleys?|hidden\s+gems?)\b/i;

export function kyotoCopyHasBannedWording(text: string | null | undefined): boolean {
  return typeof text === "string" && BANNED_WORDING.test(text);
}

export function rewordKyotoBannedCopy(input: string | null | undefined): string | null {
  if (input == null) return null;
  let s = input;
  s = s.replace(/\bgeisha\s+district\b/gi, "district");
  s = s.replace(/\b(?:a|an|the)\s+hidden\s+gems?\b/gi, "");
  s = s.replace(/\bhidden\s+gems?\b/gi, "");
  s = s.replace(/\bback\s+alleys\b/gi, "lanes");
  s = s.replace(/\bback\s+alley\b/gi, "lane");
  s = s.replace(/\bgeishas?\b/gi, "");
  s = s.replace(/\s+([.,;:!?])/g, "$1");
  s = s.replace(/\(\s*\)/g, "");
  s = s.replace(/\s{2,}/g, " ");
  s = s.replace(/^[\s,.;:]+/, "");
  s = s.trim();
  if (!s || /^[.,;:!?]+$/.test(s)) return null;
  return s;
}
