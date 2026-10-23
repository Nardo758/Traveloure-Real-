/**
 * SH-1 item 8 (ledger `2026-10-19-sh1-destination-page`): the destination header's season line.
 *
 * R-07 drops those city fields from every traveler payload, so the header shows the city name only.
 * `SEASONAL_WRITER_LIVE` stays false: the hero season line, the date strip, and the highlight-keyed
 * add-on do not turn on to read fields the API no longer sends.
 */
export const SEASONAL_WRITER_LIVE = false;

/**
 * Pure. A rating as the header may print it: a number from 0 to 10 (or a numeric string) ⇒ "N/10"; a word
 * ("excellent") ⇒ the word, capitalised — never "{word}/10"; anything else ⇒ null.
 */
export function seasonRatingFragment(rating: unknown): string | null {
  if (typeof rating === "number" || (typeof rating === "string" && rating.trim() !== "" && !Number.isNaN(Number(rating)))) {
    const n = Number(rating);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? `${n}/10` : null;
  }
  if (typeof rating === "string" && /^[a-z][a-z\s-]*$/i.test(rating.trim())) {
    const w = rating.trim();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }
  return null;
}

/** Pure. "<rating> in <Month> · <highlight>", any missing part omitted; null when nothing is left. */
export function buildSeasonLine(entry: { rating?: unknown; highlight?: string | null } | null, monthName: string | null): string | null {
  if (!entry) return null;
  const rating = seasonRatingFragment(entry.rating);
  const head = rating && monthName ? `${rating} in ${monthName}` : rating;
  const highlight = entry.highlight?.trim() || null;
  const parts = [head, highlight].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}
