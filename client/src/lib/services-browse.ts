/**
 * services-browse — THE URL CONTRACT OF THE MARKETPLACE SERVICES BROWSE, STATED ONCE.
 *
 * Ledger `2026-09-06-role-chips-filter`; CLAUDE.md Locked Decision 42 D6, Locked Decision 31
 * (`experience_types.roles_needed` is a pointer into `service_categories.category_key`), §13,
 * §18 rule 1.
 *
 * ── WHY A MODULE FOR THREE STRINGS ────────────────────────────────────────────────────────────
 * `2026-09-06-slip-conformance` shipped the event header's role chips pointing at
 * `/services?categoryKey=…&tripId=…`, and named the param a constant precisely so no surface would
 * invent a second spelling. It named it on the LINK side only: the browse itself still read the
 * param as a bare literal in `client/src/pages/discover.tsx`, so the two ends of one contract were
 * two independent strings that happened to agree. That is the derivation-drift class §18 rule 1
 * names, and its failure mode here is the one nobody notices — a link carrying a param the page
 * ignores renders a perfectly ordinary UNFILTERED browse, with no error, no 404 and no empty
 * state to give it away.
 *
 * So the contract lives here, in ONE module that both ends import: the linking surface builds the
 * href from these names and the browse reads the URL with the same ones.
 *
 * ── NEGATIVE SPACE (§18d, the guard-registry habit applied to a client module) ─────────────────
 *  · Nothing here RESOLVES a key. `service_categories` is the authority on which categories exist
 *    and `/api/service-categories` is how the browse learns them; a `categoryKey → id` (or → slug)
 *    map written on the client would be a second taxonomy beside the one the registry guard
 *    (`scripts/check-category-reachability.cjs`) exists to keep honest.
 *  · Nothing here makes a SUPPLY claim. A link names a DISCIPLINE; whether anyone is listed in it
 *    in this market is the browse's own answer, and this module must not pretend to know it.
 *  · Nothing here fetches, and nothing here authorizes anything. `tripId` is a HANDOFF so an
 *    Add-to-plan lands on that plan's own rail (Locked Decision 39) — every gate on the other side
 *    is unchanged, and a trip the caller may not write to is refused there exactly as it is today.
 */

/** The browse route itself — `/services` in `App.tsx`. */
export const SERVICES_BROWSE_PATH = "/services" as const;

/**
 * The query parameter naming a `service_categories.category_key` to pre-filter the browse by.
 *
 * READ by `client/src/pages/discover.tsx` (the `surface="services"` page `App.tsx` routes
 * `/services` to), resolved against the `/api/service-categories` rows it has already loaded.
 * A key those rows do not carry resolves to NOTHING and the page says so rather than silently
 * showing everything (§13).
 */
export const SERVICES_BROWSE_CATEGORY_PARAM = "categoryKey" as const;

/** The trip handoff the browse already reads, so Add to plan lands on THAT plan (LD 39). */
export const SERVICES_BROWSE_TRIP_PARAM = "tripId" as const;

/**
 * The city the browse pre-fills its "where" filter from.
 *
 * `discover.tsx` already reads this and — since lane L18 — prefers it over the client pen on any
 * trip-scoped browse. It was spelled as a bare literal at every LINKING surface
 * (`slipBrowseServicesHref`, the two upsell navigations), which is the same two-independent-
 * strings shape the categoryKey half of this module was written to end (§18 rule 1). Named here,
 * imported by both ends.
 */
export const SERVICES_BROWSE_LOCATION_PARAM = "location" as const;

// RETIRED (§18c, ledger `2026-09-08-recorded-cleanups`): `SERVICES_BROWSE_UPSELL_SOURCE_PARAM`
// / `upsellSource` was write-only ATTRIBUTION — two doors set it, the builder emitted it, and
// NOTHING in `client/` or `server/` ever read it. The door lane that found it preserved it verbatim
// and recorded it as a §18c candidate rather than deleting it as a side effect; this lane re-proved
// the absence of a reader and deleted it. A param nobody reads is indistinguishable, on the wire,
// from one the page silently ignores — which is the exact shape §18c refuses. Reinstating upsell
// attribution means giving it a READER first (a server-side record), not putting the string back.

/** Trim without inventing: a non-string is not a value. */
function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** What a door may hand the browse. Every field is optional, and ABSENT means "not known". */
export interface ServicesBrowseTarget {
  /** `service_categories.category_key` to pre-filter by. */
  categoryKey?: string | null;
  /** The plan this browse is filling — a HANDOFF, never a grant (LD 39). */
  tripId?: string | null;
  /** The city to pre-fill the "where" filter with — the PLAN's own, never a placeholder. */
  location?: string | null;
}

/**
 * `/services?…` — the EXISTING browse, addressed by whatever the door actually holds.
 *
 * THE ONE BUILDER of that href (§18 rule 1). **§13 — A DOOR PASSES ONLY WHAT IS TRUE** (LD 42
 * **D13**): every field is dropped when it trims to nothing, so an absent param is how the browse
 * is told "not known" and it then leaves that filter empty rather than inventing a value. An empty
 * or placeholder `tripId` would be a handoff to a plan nobody named; a placeholder `location`
 * would be a city nobody chose.
 */
export function buildServicesBrowseHref(target: ServicesBrowseTarget): string {
  const params = new URLSearchParams();
  const pairs: Array<[string, unknown]> = [
    [SERVICES_BROWSE_CATEGORY_PARAM, target.categoryKey],
    [SERVICES_BROWSE_TRIP_PARAM, target.tripId],
    [SERVICES_BROWSE_LOCATION_PARAM, target.location],
  ];
  for (const [name, raw] of pairs) {
    const value = trimmed(raw);
    if (value) params.set(name, value);
  }
  const query = params.toString();
  return query ? `${SERVICES_BROWSE_PATH}?${query}` : SERVICES_BROWSE_PATH;
}

/**
 * `/services?categoryKey=…&tripId=…` — the role-chip shape, kept as its own named call so the
 * slip's chips and their existing pins do not change. It DELEGATES; it does not re-assemble.
 */
export function servicesBrowseHref(categoryKey: string, tripId?: string | null): string {
  return buildServicesBrowseHref({ categoryKey, tripId });
}
