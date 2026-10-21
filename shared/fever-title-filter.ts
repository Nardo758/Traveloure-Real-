/**
 * Fever title filter (ledger `2026-10-20-kyoto-feed-cleanup`).
 *
 * A traveler-facing Fever event whose TITLE contains one of these marketing phrases is dropped.
 * Descriptions are not read. Matching is a case-insensitive substring: "hidden gem" matches
 * "hidden gems", and "back alley" matches "back alleys". Hero and seasonal copy that says
 * "illuminations" is a different surface and is not this filter.
 */

const FEVER_TITLE_BLOCKED: readonly RegExp[] = [
  /geisha/i,
  /hidden\s+gems?/i,
  /back\s+alleys?/i,
  /trending/i,
  /illuminations/i,
];

/** True when this title must not be shown to a traveler. A missing title is not a match. */
export function feverTitleBlocked(title: string | null | undefined): boolean {
  if (!title) return false;
  return FEVER_TITLE_BLOCKED.some((re) => re.test(title));
}
