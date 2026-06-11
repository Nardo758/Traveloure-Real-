/**
 * Demand-type → service-type synonym map.
 *
 * Built for v2 spec §5.5: when a demand signal (from
 * `service_demand_signals.service_type`) doesn't have an exact provider
 * match in a sparse market, expand the query through this map so a
 * `fine_dining` demand can still be satisfied by a `private_chef` listing.
 *
 * Keys are canonical demand-type strings as written by the recommendation
 * engine. Values are arrays of equivalent / satisfying service-type strings
 * that may appear in `provider_services.service_type` or as keywords on
 * provider categories (see `shared/constants/providerCategories.ts`).
 */
export const DEMAND_SERVICE_SYNONYMS: Record<string, readonly string[]> = {
  // ── Food & drink ──────────────────────────────────────────────────────
  fine_dining: ["private_chef", "restaurant", "tasting_menu", "cafe"],
  food_tour: ["restaurant", "private_chef", "cooking_class", "market_tour"],
  cooking_class: ["private_chef", "food_tour", "culinary_experience"],
  dining: ["fine_dining", "private_chef", "restaurant"],
  food: ["food_tour", "cooking_class", "private_chef"],
  market: ["food_tour", "market_tour", "tour_guide"],
  bar: ["nightlife", "bar_tour"],

  // ── Photography & creative ─────────────────────────────────────────────
  photography: ["photographer", "photoshoot", "portrait", "videography"],
  videography: ["photographer", "videography", "content_creator"],
  scenic: ["photographer", "photoshoot"],
  viewpoint: ["photographer", "photoshoot"],
  lookout: ["photographer", "photoshoot"],

  // ── Guides & culture ──────────────────────────────────────────────────
  tour_guide: ["local_guide", "cultural_guide", "museum_guide", "walking_tour"],
  cultural_guide: ["tour_guide", "local_guide", "historian"],
  cultural: ["tour_guide", "cultural_guide", "historian"],
  temple: ["tour_guide", "cultural_guide", "walking_tour"],
  shrine: ["tour_guide", "cultural_guide", "walking_tour"],
  landmark: ["tour_guide", "cultural_guide"],
  museum: ["tour_guide", "museum_guide", "cultural_guide"],
  gallery: ["tour_guide", "cultural_guide"],

  // ── Nature & outdoors ─────────────────────────────────────────────────
  adventure: ["outdoor_activity", "hiking_guide", "rafting", "climbing", "extreme_sport"],
  nature: ["hiking_guide", "outdoor_activity", "tour_guide"],
  park: ["outdoor_activity", "hiking_guide", "walking_tour"],
  garden: ["tour_guide", "walking_tour"],
  activity: ["tour_guide", "activity_provider"],

  // ── Transport ─────────────────────────────────────────────────────────
  airport_transfer: ["driver", "private_driver", "chauffeur", "transportation"],
  transportation: ["driver", "private_driver", "chauffeur", "airport_transfer", "tour_driver"],

  // ── Wellness ──────────────────────────────────────────────────────────
  wellness: ["spa", "yoga", "meditation", "retreat", "massage"],
  spa: ["wellness", "massage", "therapy", "facial"],

  // ── Nightlife ─────────────────────────────────────────────────────────
  nightlife: ["bar_tour", "club_concierge", "vip_access", "speakeasy"],

  // ── Family & events ───────────────────────────────────────────────────
  childcare: ["babysitter", "family_concierge", "kids_activity"],
  proposal: ["proposal_planner", "private_chef", "photographer", "florist"],
  wedding: ["wedding_planner", "florist", "photographer", "private_chef"],
} as const;

export type DemandType = keyof typeof DEMAND_SERVICE_SYNONYMS;

/** Expand a demand-type into the set of service-type strings that may satisfy it. */
export function expandDemandType(demandType: string): string[] {
  const normalized = demandType.trim().toLowerCase();
  const synonyms = DEMAND_SERVICE_SYNONYMS[normalized];
  // Always include the original term so exact matches still win.
  return synonyms ? [normalized, ...synonyms] : [normalized];
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-type → service-type synonym map (Discover by Date surface)
//
// Keyed on `destination_events.eventType` and `happening_now.eventType`
// values found in the real DB data. These are intentionally separate from
// DEMAND_SERVICE_SYNONYMS because events have their own vocabulary — reusing
// place_type entries would produce incorrect matches.
//
// holiday / popup / special return empty arrays by design (no forced match).
// ─────────────────────────────────────────────────────────────────────────────
export const EVENT_SERVICE_SYNONYMS: Record<string, readonly string[]> = {
  festival: ["photographer", "entertainment", "transportation", "tour_guide"],
  performance: ["photographer", "entertainment", "transportation"],
  season: ["photographer", "tour_guide"],
  religious: ["tour_guide", "cultural_guide"],
  sporting: ["transportation", "tour_guide"],
  market: ["tour_guide", "food_tour"],
  cultural: ["tour_guide", "cultural_guide", "activity_provider"],
  // Deliberately no forced match:
  holiday: [],
  popup: [],
  special: [],
};

/**
 * Expand an event type into service-type strings that may be relevant.
 * Returns empty array for types with no forced match (holiday, popup, special)
 * or for unknown event types.
 */
export function expandEventType(eventType: string): string[] {
  const normalized = eventType.trim().toLowerCase();
  const synonyms = EVENT_SERVICE_SYNONYMS[normalized];
  if (!synonyms || synonyms.length === 0) return [];
  return [...synonyms];
}
