/**
 * An expert's "HH:MM" edit to an itinerary item's start time (R319, ledger
 * `2026-10-05-expert-item-time-wall-clock`). One rule, no Date parsing, no machine zone (§18 rule 1).
 *
 * `itinerary_variant_items.start_time` is a varchar holding the plan's WALL-CLOCK — in practice a bare
 * "HH:MM" (LD 30: times are wall-clock strings read in the plan's zone, never converted). The old route
 * helper ran it through `new Date(...)` + `setHours`: a bare time is an Invalid Date, so the expert's
 * edit was silently DROPPED, and a full date-time would have been shifted by the SERVER's zone.
 *
 *   - a bare original → the edit, "HH:MM"
 *   - an original with a date ("YYYY-MM-DD[T ]HH:MM…") → the same string with only its HH:MM replaced,
 *     so its date and any zone suffix stay exactly as written
 *   - no original → the edit (the expert stated it; nothing is guessed)
 *   - an unreadable edit, or an original in neither shape → the original, unchanged (§13)
 */
export function mergeExpertTimeEdit(
  original: string | null | undefined,
  edit: string | null | undefined,
): string | null | undefined {
  const e = /^(\d{1,2}):(\d{2})$/.exec(String(edit ?? "").trim());
  if (!e) return original;
  const hh = Number(e[1]);
  const mm = Number(e[2]);
  if (hh > 23 || mm > 59) return original;
  const hhmm = `${String(hh).padStart(2, "0")}:${e[2]}`;

  const o = String(original ?? "").trim();
  if (!o) return hhmm;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(o)) return hhmm;
  const dated = /^(\d{4}-\d{2}-\d{2}[T ])\d{2}:\d{2}(.*)$/.exec(o);
  if (dated) return `${dated[1]}${hhmm}${dated[2]}`;
  return original;
}
