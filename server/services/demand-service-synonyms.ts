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
 *
 * Wiring target (deferred to Phase 3/4):
 *   - the catalog search and recommendation lookups should expand a
 *     demand-type into its synonyms before querying provider inventory.
 */
export const DEMAND_SERVICE_SYNONYMS: Record<string, readonly string[]> = {
  fine_dining: ["private_chef", "restaurant", "tasting_menu", "cafe"],
  food_tour: ["restaurant", "private_chef", "cooking_class", "market_tour"],
  cooking_class: ["private_chef", "food_tour", "culinary_experience"],
  photography: ["photographer", "photoshoot", "portrait", "videography"],
  videography: ["photographer", "videography", "content_creator"],
  airport_transfer: ["driver", "private_driver", "chauffeur", "transportation"],
  transportation: ["driver", "private_driver", "chauffeur", "airport_transfer", "tour_driver"],
  tour_guide: ["local_guide", "cultural_guide", "museum_guide", "walking_tour"],
  cultural_guide: ["tour_guide", "local_guide", "historian"],
  adventure: ["outdoor_activity", "hiking_guide", "rafting", "climbing", "extreme_sport"],
  wellness: ["spa", "yoga", "meditation", "retreat", "massage"],
  spa: ["wellness", "massage", "therapy", "facial"],
  nightlife: ["bar_tour", "club_concierge", "vip_access", "speakeasy"],
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
