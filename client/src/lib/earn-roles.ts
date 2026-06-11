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
 *   • Expert tiers partition the same way — a tier is trip_planner iff in
 *     TRIP_PLANNER_TIERS, otherwise local_expert. LOCAL_EXPERT_TIERS is
 *     derived as the complement, never hand-listed.
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
] as const;

/**
 * Expert tiers that belong to the Trip Planner card (planning the trip,
 * done-for-you coordination). The remaining tiers — advisory, live_support,
 * specialized — belong to Local Expert (sell what you know, be reachable).
 */
export const TRIP_PLANNER_TIERS: readonly ExpertTier[] = ["planning", "coordination"] as const;

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
    signupPath: "/become-provider",
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

/** Total function: every expert tier resolves to exactly one role. */
export function roleForExpertTier(tier: ExpertTier): RoleKey {
  return TRIP_PLANNER_TIERS.includes(tier) ? "trip_planner" : "local_expert";
}
