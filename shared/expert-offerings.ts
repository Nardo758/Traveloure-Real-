/**
 * THE EXPERT OFFERING CATALOG, AS A COMMITTED KEY → TIER MAP.
 * Lane L24 of the Console & AI Concierge brief (§11.6); ledger `2026-09-07-impact-class`.
 * CLAUDE.md Locked Decisions 4 (the two catalogs are never merged) and 36 (the planner keys).
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `expert_offering_types` is a DATABASE table, and its `service_tier` is what classifies an
 * expert listing. Nothing in `shared/` can read that table synchronously, so any pure lookup over
 * the expert catalog (the impact class, the buy-side resolver, the listing wizard's step list)
 * needs the key → tier mapping in code. This is that mapping, written down ONCE.
 *
 * It is NOT a second catalog and it introduces NO key of its own: every row below is seeded by a
 * committed migration — 039 (the original 39), 062 (9 gap rows), 065 (`booking_concierge`) and
 * 283 (the six planner rows). `shared/__tests__/impact-class.test.ts` (E1–E3) parses those four
 * migrations and asserts this map is EXACTLY what they seed, in both directions, so a seventh
 * planner row or a renamed key fails in CI rather than on a traveler's screen. That is the
 * `check-earn-planner-keys.cjs` posture (Locked Decision 36) applied to the whole catalog.
 *
 * NO RUNTIME DEPENDENCIES. This module imports nothing, so it is usable from the client bundle,
 * from a server route and from a `node:test` unit alike — the same constraint
 * `shared/occasion-role-nouns.ts` keeps, for the same reason: a value import of
 * `shared/schema.ts` drags drizzle into every consumer.
 *
 * NEGATIVE SPACE (§18d). This map says which TIER a key belongs to. It says nothing about whether
 * a row is `is_active` in a given database, whether any expert has applied for that role, or
 * whether the migration has been APPLIED anywhere. Those are ops facts, not taxonomy facts.
 */

/** The five values `expert_offering_types.service_tier` carries a DB CHECK over. */
export const EXPERT_TIERS = [
  "advisory",
  "planning",
  "coordination",
  "live_support",
  "specialized",
] as const;
export type ExpertTier = (typeof EXPERT_TIERS)[number];

/**
 * Expert offering KEYS that belong to the Event Planner track, checked BEFORE any tier mapping
 * (ledger `2026-09-04-earn-planner-roles`; CLAUDE.md Locked Decision 36). These are the six
 * `expert_offering_types` rows migration 283 seeds into the EXISTING `coordination` tier — a
 * planner who RUNS the event, as distinct from the event VENDORS the provider catalog lists.
 *
 * THE LIST LIVES HERE, NOT IN `client/src/lib/earn-roles.ts`, because both the /earn role
 * partition and the impact class need it and `shared/` cannot import from `client/` — a second
 * copy is the derivation-drift class §18 rule 1 names. `earn-roles.ts` re-exports it verbatim,
 * and `scripts/check-earn-planner-keys.cjs` now reads THIS file.
 *
 * `service_tier` carries a DB CHECK over five values, so a sixth tier would be the publish-time
 * drizzle-push failure the Coordination Prevention rules warn about: no tier can separate a
 * wedding planner from a Reservation Lifeline, and this explicit list is what does.
 *
 * Keys are UNSUFFIXED on purpose: `expert_offering_types` and `service_offering_types` are
 * separate tables with separate UNIQUE(offering_type_key) constraints, so `proposal_planner`,
 * `party_planner` and `date_night_designer` exist in both — and /start/events forwards
 * `?offeringTypeKey=` to BOTH doors, so a shared key resolves in whichever catalog the chosen
 * door reads.
 */
export const EVENT_PLANNER_OFFERING_KEYS = [
  "wedding_planner",
  "wedding_day_of_coordinator",
  "proposal_planner",
  "party_planner",
  "corporate_event_coordinator",
  "date_night_designer",
] as const;
export type EventPlannerOfferingKey = (typeof EVENT_PLANNER_OFFERING_KEYS)[number];

/**
 * EVERY `expert_offering_types` row, keyed to its seeded `service_tier` (55 as of migration 283).
 *
 * Sources, in apply order — and the test pins the union of exactly these four:
 *   039  12 advisory · 8 planning · 5 coordination · 6 live_support · 8 specialized
 *   062  3 planning · 6 specialized                      (the June 2026 gap-fill audit)
 *   065  1 coordination (`booking_concierge`)
 *   283  6 coordination (the planner rows above)
 */
export const EXPERT_OFFERING_TIERS: Readonly<Record<string, ExpertTier>> = {
  // ── advisory (12) — migration 039 ───────────────────────────────────────────────────────────
  ask_me_anything: "advisory",
  reality_check: "advisory",
  itinerary_2nd_opinion: "advisory",
  ai_plan_polish: "advisory",
  neighborhood_picker: "advisory",
  budget_optimizer: "advisory",
  restaurant_hitlist: "advisory",
  hidden_gems_shortlist: "advisory",
  tourist_trap_audit: "advisory",
  packing_brief: "advisory",
  practicalities_brief: "advisory",
  first_timer_orient: "advisory",

  // ── planning (11) — 8 from 039, 3 from 062 ──────────────────────────────────────────────────
  full_itinerary: "planning",
  perfect_day: "planning",
  multicity_route: "planning",
  family_plan: "planning",
  accessibility_plan: "planning",
  solo_plan: "planning",
  nomad_plan: "planning",
  special_occasion_trip: "planning",
  corporate_travel_plan: "planning",
  sports_event_travel: "planning",
  retreat_planning: "planning",

  // ── coordination (12) — 5 from 039, 1 from 065, 6 from 283 ──────────────────────────────────
  done_for_you_booking: "coordination",
  group_trip_coord: "coordination",
  reservation_lifeline: "coordination",
  vendor_wrangler: "coordination",
  occasion_coordination: "coordination",
  booking_concierge: "coordination",
  wedding_planner: "coordination",
  wedding_day_of_coordinator: "coordination",
  proposal_planner: "coordination",
  party_planner: "coordination",
  corporate_event_coordinator: "coordination",
  date_night_designer: "coordination",

  // ── live_support (6) — migration 039 ────────────────────────────────────────────────────────
  text_a_local: "live_support",
  same_day_rescue: "live_support",
  what_now_suggestions: "live_support",
  realtime_translation: "live_support",
  reservation_on_fly: "live_support",
  trip_emergency: "live_support",

  // ── specialized (14) — 8 from 039, 6 from 062 ───────────────────────────────────────────────
  themed_deep_dive: "specialized",
  relocation_consult: "specialized",
  content_scout: "specialized",
  corporate_consult: "specialized",
  location_scout: "specialized",
  culture_crash_course: "specialized",
  personal_shopper: "specialized",
  pet_travel_consult: "specialized",
  local_city_itinerary: "specialized",
  local_perfect_day: "specialized",
  local_neighbourhood_plan: "specialized",
  sustainable_travel_consult: "specialized",
  lgbtq_travel_consult: "specialized",
  slow_travel_consult: "specialized",
};

/** True iff this expert-catalog key is one of the six planner roles (migration 283). */
export function isEventPlannerOfferingKey(offeringTypeKey: string): boolean {
  return (EVENT_PLANNER_OFFERING_KEYS as readonly string[]).includes(offeringTypeKey);
}

/**
 * The tier a seeded expert offering key belongs to, or `null` for a key no migration seeds.
 *
 * NULL IS AN ANSWER, NOT A FALLBACK (§13): an unrecognised key is one the catalog does not carry,
 * and a caller must say nothing rather than file it under a nearest-looking tier.
 */
export function expertOfferingTier(offeringTypeKey: string | null | undefined): ExpertTier | null {
  if (!offeringTypeKey) return null;
  return Object.prototype.hasOwnProperty.call(EXPERT_OFFERING_TIERS, offeringTypeKey)
    ? EXPERT_OFFERING_TIERS[offeringTypeKey]
    : null;
}
