/**
 * IMPACT CLASS — what a listing does to a PLAN, derived from the offering catalogs.
 *
 * Lane L24 of the Console & AI Concierge brief (§11.6); ledger `2026-09-07-impact-class`.
 * CLAUDE.md Locked Decisions 3 (the seven delivery methods), 4 (two catalogs, never merged),
 * 31 (`roles_needed` points into `service_categories`) and 36 (the six planner keys).
 *
 * The delivery method says HOW a thing is fulfilled. The offering catalogs say WHAT the seller
 * does — and that is what decides whether a plan is touched, created, or never involved at all.
 * `impact` is that fourth row fact.
 *
 * DERIVED, NEVER STORED. There is no column and no migration: the class is computed at read time
 * from keys the row already carries, by this single lookup — the one source of truth for the
 * server (payload assembly, the buy-side resolver) and the client (card eyebrows, the listing
 * wizard's own step list), so the buy side and the sell side cannot disagree about what a listing
 * is. That is the `resolveBookability` posture (`shared/bookability.ts`) one axis over. Add
 * consumers by importing `impactClassFor`; never re-derive.
 *
 *   consult             a session, a written brief or a chat — the deliverable attaches to the
 *                       BOOKING, and a plan is optional (ruling 12 of §11.6)
 *   plan_work           paid work done INSIDE the traveler's slip; needs the slip (LD 32)
 *   event_coordination  a coordinator who runs the event; needs a plan AND an event on it
 *   live_trip           in-trip support for a window; there is nothing to support without a plan
 *   on_ground           a dated, placed item — the service, at a time and a place
 *   stay                a stay item spanning nights
 *   partner             affiliate inventory: the agent rail (§16, LD 44), never a platform charge
 *
 * WHAT THIS DOES NOT EMIT. The brief's seventh class, `store_clone`, is a `ready_made_trips`
 * PURCHASE — it has no offering key and no category key, so it is not derivable from this
 * function's inputs and is deliberately absent rather than guessed at. A caller holding a
 * ready-made row knows it is a store clone without asking. `partner` takes the seventh slot
 * because it IS key-derivable (the four `aff_*` category keys).
 *
 * §13 — NULL IS AN ANSWER. A row carrying no key the catalogs recognise resolves to `null`, and
 * every reader must OMIT the eyebrow rather than render a nearest-looking class. A wrong class is
 * worse than no class: it is a claim about what the buyer is about to receive.
 *
 * NO RUNTIME DEPENDENCY ON `shared/schema.ts`. The provider half is pinned to `OccasionRoleKey`
 * by an `import type` (erased at build), so this module stays usable from a pure client bundle —
 * the `shared/occasion-role-nouns.ts` precedent.
 */
import type { OccasionRoleKey } from "./schema";
import { EVENT_PLANNER_OFFERING_KEYS, expertOfferingTier, type ExpertTier } from "./expert-offerings";
import { PLACE_ANCHORED_METHODS } from "./service-fundamentals";

export type ImpactClass =
  | "consult"
  | "plan_work"
  | "event_coordination"
  | "live_trip"
  | "on_ground"
  | "stay"
  | "partner";

/** The keys an `impact` decision reads. All optional — absence is a fact, never a default. */
export interface ImpactClassInput {
  /** `expert_offering_types.offering_type_key` — an EXPERT listing. */
  offeringTypeKey?: string | null;
  /** `service_categories.category_key` — a PROVIDER listing (or an `aff_*` partner source). */
  categoryKey?: string | null;
  /** `provider_services.delivery_method` — one of the canonical 7 (LD 3). */
  deliveryMethod?: string | null;
}

/**
 * The four affiliate SOURCES migration 034 assigns (`aff_activities`, `aff_air_hotel`,
 * `aff_events`, `aff_ground_transport`) share one prefix, and `isAffiliateCategory` in
 * `client/src/lib/earn-roles.ts` already spells the test this way. It is a prefix rather than a
 * list precisely so a fifth partner source needs no edit here: partner inventory is partner
 * inventory whichever partner it comes from.
 */
export const AFFILIATE_CATEGORY_PREFIX = "aff_";

/**
 * Expert TIER → class, for every key that is not one of the six planner keys.
 *
 * `coordination` maps to `plan_work` because the six plan-shaped coordination rows
 * (`done_for_you_booking`, `group_trip_coord`, `reservation_lifeline`, `vendor_wrangler`,
 * `occasion_coordination`, `booking_concierge`) are exactly the coordination tier MINUS the six
 * planner keys — a complement, never a second hand-written list (the `LOCAL_EXPERT_TIERS`
 * precedent in `earn-roles.ts`, and §18 rule 1). The planner keys are removed BEFORE this map is
 * consulted, so a thirteenth coordination row seeded later is plan work by default, which is what
 * the tier already means ("done-for-you execution") — and `impact-class.test.ts` E4 pins the six
 * by name so the naming cannot rot unnoticed.
 *
 * `specialized` is `consult` with the brief's own note (G3): three `specialized` rows
 * (`local_city_itinerary`, `local_perfect_day`, `local_neighbourhood_plan`) are plan-shaped work
 * that renders on the Trip Planner card. Reclassifying them is a catalog decision — a tier move,
 * ratified — not something this lookup may take on itself by special-casing three keys.
 */
const TIER_IMPACT: Readonly<Record<ExpertTier, ImpactClass>> = {
  advisory: "consult",
  specialized: "consult",
  planning: "plan_work",
  coordination: "plan_work",
  live_support: "live_trip",
};

/**
 * PROVIDER discipline → class, one entry per `service_categories.category_key`.
 *
 * The type is `Record<OccasionRoleKey, …>`, so this is a COMPILE-PINNED MIRROR of the discipline
 * set and not a second list: a key added to `OCCASION_ROLE_KEYS` without an entry here is a
 * compile error, and an entry for a key that does not exist is a compile error too — the
 * `OCCASION_ROLE_NOUNS` technique, for the same reason. `OCCASION_ROLE_KEYS` is itself pinned to
 * the TAXONOMY REGISTRY (`scripts/lib/taxonomy-registry.cjs`) by `roles-needed.test.ts` R3, and
 * `impact-class.test.ts` P1 pins this map to the registry directly as well, so the chain has no
 * unguarded link.
 *
 * The split is the brief's G5: lodging is the one discipline whose product is a span of nights.
 * Everything else a provider sells happens at a time and a place.
 */
const PROVIDER_CATEGORY_IMPACT: Readonly<Record<OccasionRoleKey, "stay" | "on_ground">> = {
  accommodation: "stay",
  accessibility_specialist: "on_ground",
  activity_provider: "on_ground",
  av_tech: "on_ground",
  caterer: "on_ground",
  childcare_family: "on_ground",
  concierge_vip: "on_ground",
  dining_venue: "on_ground",
  entertainment: "on_ground",
  event_coordinator: "on_ground",
  florist: "on_ground",
  hair_makeup: "on_ground",
  officiant: "on_ground",
  photography: "on_ground",
  printing_materials: "on_ground",
  private_chef: "on_ground",
  private_transportation: "on_ground",
  rentals: "on_ground",
  tour_guide: "on_ground",
  venue: "on_ground",
  videographer: "on_ground",
};

/**
 * `custom_other` — the "Something else / not listed" catch-all (migrations 189/208).
 *
 * It is deliberately NOT in `PROVIDER_CATEGORY_IMPACT`: it is not a discipline, it is the absence
 * of one, and the TAXONOMY REGISTRY does not assign it (189/208 backfill it by UPDATE, which the
 * registry parser reads as text and skips by design). It carries no discipline signal, so the
 * only honest thing left to read is the LISTING's own delivery method: place-anchored delivery is
 * something that happens on the ground, and everything else is a conversation or an artifact.
 */
export const CUSTOM_CATEGORY_KEY = "custom_other";

/** True for the four `aff_*` partner sources (and any later one). */
export function isAffiliateCategoryKey(categoryKey: string): boolean {
  return categoryKey.startsWith(AFFILIATE_CATEGORY_PREFIX);
}

/**
 * The ONE impact-class lookup. Rules, in order:
 *
 *   1. an `aff_*` category is `partner` and WINS over anything else on the row — partner
 *      inventory is never a platform charge (§16, LD 44), whatever else the row carries;
 *   2. a recognised EXPERT offering key classifies by KEY: the six planner keys are
 *      `event_coordination` (the class is by key, never by tier — migration 283 put them in the
 *      existing `coordination` tier because a sixth tier is a publish trap, and G2 records that
 *      their provider-shaped `delivery_formats` are harmless here for exactly that reason);
 *      otherwise by the key's tier;
 *   3. a recognised PROVIDER category classifies by category, with `custom_other` falling to the
 *      listing's delivery method;
 *   4. anything else is `null`.
 *
 * An UNRECOGNISED offering key falls THROUGH to rule 3 rather than short-circuiting, so a row
 * carrying a stale expert key beside a real category still classifies honestly; when neither
 * resolves the answer is `null`, never a guess (§13).
 */
export function impactClassFor(input: ImpactClassInput | null | undefined): ImpactClass | null {
  if (!input) return null;

  const categoryKey = input.categoryKey?.trim() || null;
  const offeringTypeKey = input.offeringTypeKey?.trim() || null;

  // 1. Partner inventory wins outright.
  if (categoryKey && isAffiliateCategoryKey(categoryKey)) return "partner";

  // 2. The expert catalog, by KEY.
  if (offeringTypeKey) {
    if ((EVENT_PLANNER_OFFERING_KEYS as readonly string[]).includes(offeringTypeKey)) {
      return "event_coordination";
    }
    const tier = expertOfferingTier(offeringTypeKey);
    if (tier) return TIER_IMPACT[tier];
    // Unrecognised key: say nothing on this branch and let the provider branch answer if it can.
  }

  // 3. The provider catalog, by CATEGORY.
  if (categoryKey) {
    if (Object.prototype.hasOwnProperty.call(PROVIDER_CATEGORY_IMPACT, categoryKey)) {
      return PROVIDER_CATEGORY_IMPACT[categoryKey as OccasionRoleKey];
    }
    if (categoryKey === CUSTOM_CATEGORY_KEY) {
      const method = input.deliveryMethod?.trim() || null;
      return method && PLACE_ANCHORED_METHODS.has(method) ? "on_ground" : "consult";
    }
  }

  // 4. Nothing the catalogs recognise.
  return null;
}

/**
 * The eyebrow words for a class, for the surfaces §11.7 draws
 * ("Consult · Plan work · Live support · Coordination · On the ground · Stay").
 *
 * Kept beside the lookup so a surface never spells a class itself (§18 rule 1). `null` has no
 * label on purpose: an unclassified listing renders NO eyebrow, not an empty one.
 */
export const IMPACT_CLASS_LABELS: Readonly<Record<ImpactClass, string>> = {
  consult: "Consult",
  plan_work: "Plan work",
  event_coordination: "Coordination",
  live_trip: "Live support",
  on_ground: "On the ground",
  stay: "Stay",
  partner: "Partner",
};

/** The label for a class, or `null` when there is no class to name (§13). */
export function impactClassLabel(impact: ImpactClass | null | undefined): string | null {
  return impact ? IMPACT_CLASS_LABELS[impact] : null;
}
