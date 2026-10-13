/**
 * PF-1 (decision-maker rulings 1–4, Oct 11, 2026 — ledger `2026-10-11-pf1-lookup-outcomes`): what happened to
 * each plan item in one Places lookup run. ONE value set, read by the log lines AND `place_lookup_outcomes`
 * (ruling 4: the same enum in both), so a log line and a row can never name an outcome two ways.
 *
 * Why it is stored: the Oct 6 lookups for two items on one plan returned nothing, the logs were gone, and
 * "the gate skipped it" could not be told from "Google answered somewhere else". A row says which.
 *
 * Ids only — no title, no query text (the log lines' own posture). App-enforced; the table has no CHECK.
 */

export const PLACE_LOOKUP_OUTCOMES = ["attached", "unmatched", "capped", "skipped", "no_place", "error"] as const;
export type PlaceLookupOutcome = (typeof PLACE_LOOKUP_OUTCOMES)[number];

/**
 * Why an item was SKIPPED (never looked up). Ruling 4 split the old `unnamed` in two:
 *   no_named_tokens — the title and location name no specific place (`namedPlaceTokens` is empty)
 *   area_title      — the title names an area ("… District", "… Walk"), which is never looked up
 *   no_adapter      — no source covers the item's need here (Places switched off, or the need is not covered)
 *   official_fact   — AP-1: a hand-added stop whose place already has a stored official hours fact; the billed
 *                     Details call is not made (the official fact is what the checks read)
 */
export const PLACE_LOOKUP_SKIP_REASONS = ["no_named_tokens", "area_title", "no_adapter", "official_fact"] as const;
export type PlaceLookupSkipReason = (typeof PLACE_LOOKUP_SKIP_REASONS)[number];

/**
 * Why an item was CAPPED (a lookup was due but not made). Ruling 4 split the old `cap` in three:
 *   draft_cap       — `placesLookupsPerDraft()` billed lookups already spent this run
 *   maps_id_lookup  — the Maps billing gate refused the no-charge IDs-only search
 *   maps_details    — the Maps billing gate refused the billed Place Details call
 *   plan_day_cap    — AP-1: this plan's hand-added stops already spent `placesLookupsPerDraft()` billed lookups
 *                     today (UTC), counted from these rows
 */
export const PLACE_LOOKUP_CAP_REASONS = ["draft_cap", "maps_id_lookup", "maps_details", "plan_day_cap"] as const;
export type PlaceLookupCapReason = (typeof PLACE_LOOKUP_CAP_REASONS)[number];

/** Which caller started the run. NULL on a row = not stated (a caller that names none). */
/** `hand_add` (AP-1): the one lookup run after a traveler adds a stop on the slip. */
export const PLACE_LOOKUP_TRIGGERS = ["draft", "facts_recheck", "leg_coords", "where_to_stay", "hand_add"] as const;
export type PlaceLookupTrigger = (typeof PLACE_LOOKUP_TRIGGERS)[number];

export interface PlaceLookupOutcomeRow {
  tripId: string;
  itemId: string;
  day: number;
  outcome: PlaceLookupOutcome;
  /** Skip or cap reason; for `error`, a short error code — never the message, which may carry query text. */
  reason: string | null;
  placeId: string | null;
  cache: "hit" | "miss" | null;
  costCents: number | null;
  latencyMs: number | null;
}

/** Pure. The short code stored for a failed lookup: the error's own code or name, never its message. */
export function lookupErrorCode(err: unknown): string {
  const e = err as { code?: unknown; name?: unknown } | null;
  const raw = (typeof e?.code === "string" && e.code) || (typeof e?.name === "string" && e.name) || "error";
  return raw.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 64);
}

/** Pure. One line of the plan-id view: the LATEST row per item (by run start, then insert time). */
export function latestOutcomePerItem<T extends { itemId: string; runStartedAt: Date | string; createdAt: Date | string }>(rows: readonly T[]): T[] {
  const best = new Map<string, T>();
  const key = (r: T) => [new Date(r.runStartedAt).getTime(), new Date(r.createdAt).getTime()] as const;
  for (const r of rows) {
    const cur = best.get(r.itemId);
    if (!cur) {
      best.set(r.itemId, r);
      continue;
    }
    const [a1, a2] = key(r);
    const [b1, b2] = key(cur);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) best.set(r.itemId, r);
  }
  return Array.from(best.values());
}
