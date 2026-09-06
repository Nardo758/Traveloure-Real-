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

/** Trim without inventing: a non-string is not a value. */
function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * `/services?categoryKey=…&tripId=…` — the EXISTING browse, pre-filtered by one category key.
 *
 * The ONE builder of that href. A caller with no trip in hand passes nothing and the param is
 * simply ABSENT: an empty or placeholder `tripId` would be a handoff to a plan nobody named.
 */
export function servicesBrowseHref(categoryKey: string, tripId?: string | null): string {
  const params = new URLSearchParams();
  params.set(SERVICES_BROWSE_CATEGORY_PARAM, categoryKey);
  const trip = trimmed(tripId);
  if (trip) params.set(SERVICES_BROWSE_TRIP_PARAM, trip);
  return `${SERVICES_BROWSE_PATH}?${params.toString()}`;
}
