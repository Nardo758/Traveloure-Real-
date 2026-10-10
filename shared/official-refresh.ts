/**
 * SS-1b — THE MARKET-LEVEL OFFICIAL REFRESH, the pure half (decision-maker SS-1 ruling 1, Oct 10, 2026; ledger
 * `2026-10-10-ss1b-official-refresh`; entry sheet docs/planning/ss-1-entry-sheet.md).
 *
 * A scheduled job reads each ACTIVE, OFFICIAL, TERMS-CHECKED source that states a `refresh_interval_days`, on
 * that interval, within its `cost_ceiling_cents_per_day`, OUTSIDE ANY PLAN. What it fetches is the targets
 * config (`server/config/content-source-targets.config.ts`, SS-1a). Every rule the job, the writer and the
 * tests read is stated here ONCE (§18 rule 1). No db, no clock: every date is passed in.
 *
 *   · `refreshEligibleSource` — which registry rows the job may read at all.
 *   · `refreshDue`            — a target is due when nothing was read from it, or its last read is a full
 *                               interval old.
 *   · `refreshExpiresAt`      — ruling 1: `expires_at = verified_at + refresh_interval_days`, exactly.
 *   · `refreshBudgetCents`    — what is left of the source's daily ceiling; an unreadable meter is SPENT
 *                               and an unstated ceiling is ZERO (fail closed — the ruling says "within" a
 *                               ceiling, and no ceiling is no permission to spend).
 *   · `admitRefreshFact`      — the writer's refusal: a refresh fact without its source id, its official
 *                               https URL, an official license or a verbatim quote is never stored.
 */

export const REFRESH_ORIGIN = "official_refresh" as const;

/** The adapters the refresh can drive today. Only page extraction is built; an `api` source waits for its adapter. */
export const REFRESH_ADAPTERS = ["tavily_extract"] as const;

export interface RefreshSourceRow {
  id: string;
  active: boolean | null;
  licenseClass: string | null;
  termsCheckedAt: Date | string | null;
  refreshIntervalDays: number | null;
  costCeilingCentsPerDay: number | null;
  adapter: string | null;
}

export type RefreshIneligible = "inactive" | "not_official" | "terms_unchecked" | "no_interval" | "no_ceiling" | "adapter_not_built";

const ms = (v: Date | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/** Pure. Ruling 1's four conditions, plus the two the job needs to act: a ceiling and an adapter it can drive. */
export function refreshEligibleSource(s: RefreshSourceRow): { ok: true } | { ok: false; reason: RefreshIneligible } {
  if (s.active !== true) return { ok: false, reason: "inactive" };
  if (s.licenseClass !== "official") return { ok: false, reason: "not_official" };
  if (ms(s.termsCheckedAt) === null) return { ok: false, reason: "terms_unchecked" };
  if (!Number.isInteger(s.refreshIntervalDays) || (s.refreshIntervalDays as number) <= 0) return { ok: false, reason: "no_interval" };
  if (!Number.isInteger(s.costCeilingCentsPerDay) || (s.costCeilingCentsPerDay as number) <= 0) return { ok: false, reason: "no_ceiling" };
  if (!(REFRESH_ADAPTERS as readonly string[]).includes(s.adapter ?? "")) return { ok: false, reason: "adapter_not_built" };
  return { ok: true };
}

const DAY_MS = 86_400_000;

/** Pure. Due when nothing has been read from the target yet, or the last read is at least one interval old. */
export function refreshDue(lastReadAt: Date | string | null | undefined, intervalDays: number, now: Date): boolean {
  const last = ms(lastReadAt);
  if (last === null) return true;
  return now.getTime() - last >= intervalDays * DAY_MS;
}

/** Pure. Ruling 1: the fact expires exactly one refresh interval after it was verified. */
export function refreshExpiresAt(verifiedAt: Date, intervalDays: number): Date {
  return new Date(verifiedAt.getTime() + intervalDays * DAY_MS);
}

/** Pure. Cents left under the source's daily ceiling. null spent (unreadable) or a missing ceiling ⇒ 0. */
export function refreshBudgetCents(ceilingCents: number | null | undefined, spentTodayCents: number | null): number {
  if (spentTodayCents == null || !Number.isFinite(spentTodayCents)) return 0;
  if (ceilingCents == null || !(ceilingCents > 0)) return 0;
  return Math.max(0, ceilingCents - spentTodayCents);
}

export type RefreshRefusal = "not_refresh_origin" | "no_source" | "no_official_url" | "not_official" | "no_quote" | "off_target";

/**
 * Pure. May the writer store this refresh fact? The ruling's provenance, every part required: the source id,
 * the official https URL the target names (the page actually read — never another page on the host), an
 * official license, and a verbatim quote. Feasibility facts additionally pass `admitFeasibilityFact` in the writer.
 */
export function admitRefreshFact(
  d: { origin: string; sourceId: string | null; sourceUrl: string | null; license: string | null; value: unknown },
  target?: { sourceId: string; url: string },
): { ok: true } | { ok: false; reason: RefreshRefusal } {
  if (d.origin !== REFRESH_ORIGIN) return { ok: false, reason: "not_refresh_origin" };
  if (!d.sourceId) return { ok: false, reason: "no_source" };
  if (typeof d.sourceUrl !== "string" || !/^https:\/\/\S+$/i.test(d.sourceUrl)) return { ok: false, reason: "no_official_url" };
  if (d.license !== "official") return { ok: false, reason: "not_official" };
  const quote = (d.value as any)?.quote;
  if (typeof quote !== "string" || !quote.trim()) return { ok: false, reason: "no_quote" };
  if (target && (target.sourceId !== d.sourceId || target.url !== d.sourceUrl)) return { ok: false, reason: "off_target" };
  return { ok: true };
}

/**
 * Where a refresh fact attaches. A stop's page anchors on its Google `place_id` (the key FD-3's cross-plan read
 * matches a plan's stop on; LD 57 allows a place ID outside a plan). A station page anchors on its slug, and
 * carries NO coordinate: how a station slug becomes a point is not ruled, and none is guessed (§13) — so a
 * last-service fact written today is stored and dated but not yet placed on any ride (FD-3 reads only placed ones).
 */
export function refreshPlaceRef(anchor: { kind: "station"; slug: string } | { kind: "place"; placeId: string }): {
  placeRefKind: "place_id" | "free_text";
  placeRef: string;
  placeLat: null;
  placeLng: null;
} {
  return anchor.kind === "place"
    ? { placeRefKind: "place_id", placeRef: anchor.placeId, placeLat: null, placeLng: null }
    : { placeRefKind: "free_text", placeRef: `station:${anchor.slug}`, placeLat: null, placeLng: null };
}
