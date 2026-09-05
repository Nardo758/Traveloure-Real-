/**
 * /earn role config — the single source of truth for the role→offering mapping
 * (earn-page role-to-offering redesign brief).
 *
 * The role NAMES are a presentation layer over the two delivery tracks:
 *   in-person = provider (service_offering_types, keyed by category_key)
 *   remote    = expert  (expert_offering_types,  keyed by service_tier)
 *
 * Completeness is BY CONSTRUCTION:
 *   • Provider categories partition via complement — a category is
 *     event_planner iff it's in EVENT_CATEGORY_KEYS, otherwise
 *     service_provider. No category can be orphaned or double-shown.
 *   • Expert offerings partition in TWO steps (ledger
 *     `2026-09-04-earn-planner-roles`, CLAUDE.md Locked Decision 36): an
 *     offering is event_planner iff its KEY is in EVENT_PLANNER_OFFERING_KEYS
 *     — checked FIRST, and by key rather than by tier — otherwise its TIER
 *     decides, trip_planner iff in TRIP_PLANNER_TIERS and local_expert
 *     otherwise. LOCAL_EXPERT_TIERS is derived as the complement, never
 *     hand-listed.
 *
 * WHY THE EXPERT SIDE IS KEYED, NOT TIERED. The six planner rows
 * (migration 283) live in the EXISTING `coordination` tier: that column
 * carries a DB CHECK over five values and a sixth would be the publish-time
 * drizzle-push failure the Coordination Prevention rules warn about. A tier
 * therefore cannot separate a wedding planner from a Reservation Lifeline,
 * and an explicit key list is what does. The Event Planner card is the one
 * card fed by BOTH catalogs — provider categories for the event VENDORS,
 * expert keys for the event PLANNERS — and they are still never merged (§4).
 *
 * The companion test (__tests__/earn-roles.test.ts) asserts the partition
 * properties — the brief's hard gate.
 *
 * This is a typed module for v1 (not DB-backed): the mapping is pure
 * presentation, has no transactional consumers, and changes with design
 * review rather than ops cadence. If roles ever need admin editing, lift
 * EVENT_CATEGORY_KEYS / TRIP_PLANNER_TIERS into platform_settings then.
 *
 * Earning indicators are NOT defined here — they resolve at runtime from
 * /api/service-categories (commissionBandKey per category) and
 * /api/fee-bands/:bandKey (live rates), so admin band edits propagate
 * without a deploy and no percentage is hardcoded.
 */

export const EXPERT_TIERS = [
  "advisory",
  "planning",
  "coordination",
  "live_support",
  "specialized",
] as const;
export type ExpertTier = (typeof EXPERT_TIERS)[number];

export type RoleKey = "service_provider" | "event_planner" | "trip_planner" | "local_expert";
export type Track = "in-person" | "remote";

/**
 * Provider categories that belong to the Event Planner card. Everything else
 * in service_offering_types belongs to Service Provider (complement rule).
 */
export const EVENT_CATEGORY_KEYS = [
  "event_coordinator",
  "caterer",
  "florist",
  "officiant",
  "videographer",
  "hair_makeup",
  "av_tech",
  "rentals",
  "entertainment",
  "printing_materials",
  // `venue` (migration 285, ledger `2026-09-04-venue-category`) — the place itself is an event
  // VENDOR, and the most-booked one: a wedding, a corporate event and a reunion all hire it. It
  // belongs on the Event Planner card beside the caterer and the florist, not on Service Provider
  // via the complement rule, which is where it would land if this list stayed silent.
  "venue",
] as const;

/**
 * Expert offering KEYS that belong to the Event Planner card, checked BEFORE
 * the tier mapping below (ledger `2026-09-04-earn-planner-roles`). These are
 * the six `expert_offering_types` rows migration 283 seeds into the EXISTING
 * `coordination` tier — a planner who RUNS the event, as distinct from the
 * event VENDORS the same card lists out of the provider catalog.
 *
 * This list is the partition rule, and `scripts/check-earn-planner-keys.cjs`
 * fails CI if it and migration 283 ever disagree in either direction.
 *
 * Keys are UNSUFFIXED on purpose: `expert_offering_types` and
 * `service_offering_types` are separate tables with separate
 * UNIQUE(offering_type_key) constraints, so `proposal_planner`,
 * `party_planner` and `date_night_designer` exist in both — and because
 * /start/events forwards `?offeringTypeKey=` to BOTH doors, a shared key
 * resolves in whichever catalog the chosen door reads.
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
 * Expert tiers that belong to the Trip Planner card (planning the trip,
 * done-for-you coordination, and the specialist consults). The remaining
 * tiers — advisory, live_support — belong to Local Expert (sell what you
 * know, be reachable).
 *
 * `specialized` moved here by the same ruling: relocation consults, pet-travel
 * planning, content-creator location scouting and corporate/incentive advice
 * are paid planning engagements for people who may have no claim on the city
 * at all, and routing them to Local Expert put them in front of a wizard whose
 * required steps are a locality proof, a born-and-raised claim and a
 * three-answer knowledge test. That was a funnel hole, not a taxonomy nicety.
 */
export const TRIP_PLANNER_TIERS: readonly ExpertTier[] = ["planning", "coordination", "specialized"] as const;

/** Derived complement — never hand-listed, so the partition cannot drift. */
export const LOCAL_EXPERT_TIERS: readonly ExpertTier[] = EXPERT_TIERS.filter(
  (t) => !TRIP_PLANNER_TIERS.includes(t)
);

export interface EarnRole {
  key: RoleKey;
  label: string;
  track: Track;
  /** Card blurb — folded from the /partner-with-us role copy. */
  blurb: string;
  /** Where "I do this →" lands, carrying ?offeringTypeKey=… */
  signupPath: string;
}

export const EARN_ROLES: EarnRole[] = [
  {
    key: "service_provider",
    label: "Service Provider",
    track: "in-person",
    blurb: "List your hotel, restaurant, tour, or experience on our platform",
    signupPath: "/become-provider",
  },
  {
    key: "event_planner",
    label: "Event Planner",
    track: "in-person",
    blurb: "Specialise in weddings, proposals, and group celebrations — bringing unforgettable moments to life",
    // Build 2 fork: "Event Planner" is two businesses (event VENDOR → provider track vs
    // event PLANNER → expert track). Entry points used to disagree — this card sent people
    // into the provider form while the nav sent them into the expert application. All
    // Event Planner entries now land on the chooser.
    signupPath: "/start/events",
  },
  {
    key: "trip_planner",
    label: "Trip Planner",
    track: "remote",
    blurb: "Design personalised itineraries and guide travellers through every step of their journey",
    signupPath: "/become-expert?type=travel_expert",
  },
  {
    key: "local_expert",
    label: "Local Expert",
    track: "remote",
    blurb: "Guide travelers through your city with personalized tours and insider tips",
    signupPath: "/become-expert?type=local_expert",
  },
];

/** Executive Assistant — real signup, no offering backing yet (deferred 5th card). */
export const EA_SIGNUP = {
  label: "Executive Assistant",
  blurb: "Manage travel and events for high-net-worth clients",
  signupPath: "/become-expert?type=executive_assistant",
};

/**
 * Affiliate-sourced categories (the aff_* join keys; service_categories
 * sourceType='affiliate', seeded by migration 061) are partner inventory —
 * bookable through Viator/Fever/etc., not something a person signs up to
 * offer. They are excluded from the role mapping entirely: the completeness
 * rule ("every offering maps to exactly one card") applies to SUPPLY-side
 * (platform_provider) offerings only.
 */
export function isAffiliateCategory(categoryKey: string): boolean {
  return categoryKey.startsWith("aff_");
}

/** Total function: every supply-side provider category resolves to exactly one role. */
export function roleForProviderCategory(categoryKey: string): RoleKey {
  return (EVENT_CATEGORY_KEYS as readonly string[]).includes(categoryKey)
    ? "event_planner"
    : "service_provider";
}

/** True iff this expert-catalog key is one of the six planner roles (migration 283). */
export function isEventPlannerOfferingKey(offeringTypeKey: string): boolean {
  return (EVENT_PLANNER_OFFERING_KEYS as readonly string[]).includes(offeringTypeKey);
}

/**
 * Total function: every expert offering resolves to exactly one role.
 *
 * The KEY is checked first and wins — the six planner keys sit inside the
 * `coordination` tier, which otherwise maps to Trip Planner. Callers that hold
 * only a tier (no key) may omit the second argument and get the tier answer,
 * which is the pre-planner behaviour verbatim.
 */
export function roleForExpertOffering(tier: ExpertTier, offeringTypeKey?: string): RoleKey {
  if (offeringTypeKey && isEventPlannerOfferingKey(offeringTypeKey)) return "event_planner";
  return TRIP_PLANNER_TIERS.includes(tier) ? "trip_planner" : "local_expert";
}

/**
 * Tier-only resolver, kept as the narrow question it always was: "which of the
 * two REMOTE cards does this tier belong to?" It cannot answer event_planner
 * (that is a key-level fact), so a caller holding a key must use
 * `roleForExpertOffering` instead.
 */
export function roleForExpertTier(tier: ExpertTier): RoleKey {
  return TRIP_PLANNER_TIERS.includes(tier) ? "trip_planner" : "local_expert";
}
