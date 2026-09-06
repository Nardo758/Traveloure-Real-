/**
 * slip-event-roles — D6's EVENT-level role question, and the browse it opens.
 *
 * Ledger `2026-09-06-slip-conformance`; CLAUDE.md Locked Decision 42 D6, Locked Decision 31
 * (`experience_types.roles_needed`), Locked Decision 39 (every add surface is a view of
 * `itinerary_items`), §13, §18 rule 1.
 *
 * ── THE TWO ROLE QUESTIONS ARE NOT THE SAME QUESTION (D6) ─────────────────────────────────────
 * "Who plans this WITH me" is PLAN-level, and its answer is the EXPERT picker — `HireExpertDialog`,
 * reading `expert_offering_types`, mounted in exactly one place (the rail's Build card). "Who do I
 * HIRE for this event" is EVENT-level, and its answer is `experience_types.roles_needed`, which
 * Locked Decision 31 defines as a pointer into `service_categories.category_key` — the PROVIDER
 * catalog. So it resolves to a PROVIDER BROWSE pre-filtered by that category, ending in Add to plan
 * on the Locked Decision 39 rail. Two questions, two existing catalogs, two existing rails, and §4
 * still forbids merging the catalogs: a florist is not an advisor.
 *
 * This module is the second question's derivation. It deliberately does NOT live in
 * `hire-from-slip.ts`, which owns the FIRST one: putting both in one module is how the two
 * catalogs start being read as one list.
 *
 * ── WHAT IT MAY NOT DO (§13) ──────────────────────────────────────────────────────────────────
 *  · `roles_needed` NULL / absent / empty ⇒ NO CHIPS AT ALL. Locked Decision 31 spells out that
 *    NULL means NOT SET and is never "this occasion needs nobody" — a claim only a planner can
 *    make — and it deliberately declined to make the empty array a second empty state, so both
 *    arrive here as the same answer and produce the same nothing.
 *  · it never RECONSTRUCTS a role list from an occasion slug, a title or a keyword. The SERVER
 *    resolves `rolesNeeded` and ships it on the event row (the plancard projection); a client that
 *    guessed one would be inventing the taxonomy the registry guard exists to keep honest.
 *  · it makes NO SUPPLY CLAIM. A chip names a DISCIPLINE, not a provider: whether anyone is
 *    actually listed in that category in this market is the browse's own answer, and this module
 *    must not pretend to know it.
 *
 * NEGATIVE SPACE: nothing here labels a key — that is `roleLabel` in `hire-from-slip.ts`, the ONE
 * place a `service_categories.category_key` is turned into words, and both role surfaces read it
 * (§18 rule 1). Nothing here fetches, and nothing here authorizes anything.
 */

/**
 * The query parameter the marketplace browse actually reads for a category key
 * (`client/src/pages/discover.tsx` — the upsell deep-link, `?categoryKey=<category_key>`, resolved
 * against the loaded `/api/service-categories` rows). Named as a constant so no surface invents a
 * second spelling of a param the page would silently ignore: a link with the wrong key renders a
 * perfectly normal unfiltered browse, which is exactly the failure nobody notices.
 */
export const SERVICES_BROWSE_CATEGORY_PARAM = "categoryKey" as const;

/** The trip handoff the browse already reads, so Add to plan lands on THIS plan (LD 39). */
export const SERVICES_BROWSE_TRIP_PARAM = "tripId" as const;

/** The browse route itself — `/services` in `App.tsx`. Stated once. */
export const SERVICES_BROWSE_PATH = "/services" as const;

/** One chip: the raw category key, and where pressing it goes. */
export interface SlipEventRoleChip {
  /** `service_categories.category_key`, exactly as the server shipped it. */
  key: string;
  /** `/services?categoryKey=…&tripId=…` — the EXISTING browse, pre-filtered. */
  href: string;
}

/** Trim without inventing: a non-string is not a role. */
function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The PROVIDER browse for one role on one plan.
 *
 * `tripId` rides so the browse's Add-to-plan writes to THIS plan through the rail it already uses
 * (`POST /api/trips/:tripId/itinerary-items`) rather than the trip-less guest cart. It is a
 * HANDOFF, not a grant: every gate on the other side is unchanged, and a trip the caller may not
 * write to is refused there exactly as it is today.
 */
export function serviceBrowseHrefForRole(categoryKey: string, tripId?: string | null): string {
  const params = new URLSearchParams();
  params.set(SERVICES_BROWSE_CATEGORY_PARAM, categoryKey);
  const trip = trimmed(tripId);
  if (trip) params.set(SERVICES_BROWSE_TRIP_PARAM, trip);
  return `${SERVICES_BROWSE_PATH}?${params.toString()}`;
}

/**
 * The chips an event header draws for its occasion's roles, or an EMPTY LIST.
 *
 * An empty list is the answer for every one of NULL, absent, `[]` and a list of blanks, and the
 * caller must then render NOTHING — not a heading with no chips under it, and not a sentence about
 * an occasion that "needs nobody" (§13, Locked Decision 31).
 *
 * Order is the SERVER's, unchanged: `roles_needed` is a `text[]` whose order the seeder wrote, and
 * re-sorting it here would be this surface inventing a priority among disciplines.
 */
export function slipEventRoleChips(
  rolesNeeded: readonly string[] | null | undefined,
  tripId?: string | null,
): SlipEventRoleChip[] {
  if (!Array.isArray(rolesNeeded)) return [];
  const seen = new Set<string>();
  const chips: SlipEventRoleChip[] = [];
  for (const raw of rolesNeeded) {
    const key = trimmed(raw);
    // A duplicate key would draw the same chip twice pointing at the same browse. Dropping the
    // repeat is not a claim about the data — both chips would have been the same fact.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chips.push({ key, href: serviceBrowseHrefForRole(key, tripId) });
  }
  return chips;
}
