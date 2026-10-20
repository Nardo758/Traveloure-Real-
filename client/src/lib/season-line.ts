/**
 * SH-1 item 8 (ledger `2026-10-19-sh1-destination-page`): the destination header's season line.
 *
 * `travel_pulse_cities.ai_seasonal_highlights` and `current_highlight` have NO live writer (the refresh was removed —
 * server/index.ts), so the header shows the city name only and every reader of those fields sits behind
 * `SEASONAL_WRITER_LIVE`: the hero's season and highlight lines, the date strip, and the strip's highlight-keyed
 * add-on. Turn it on only when a refresh writer exists again.
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
