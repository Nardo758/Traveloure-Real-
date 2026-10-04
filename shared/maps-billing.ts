/**
 * THE GOOGLE MAPS PLATFORM CALLER TABLE (R299 — ledger `2026-10-04-maps-billing-audit`).
 *
 * Every server call site that reaches Google Maps Platform is ONE row here: the API it calls, the
 * SKU tier that bills it, WHY it bills at that tier, and the env names that switch it on, cap it per
 * UTC day and record what one call costs. The gate (`server/services/maps-billing.service.ts`) reads
 * this table and nothing else, so a caller cannot be added without naming its tier, and the price
 * test (`server/__tests__/maps-billing-tiers.test.ts`) pins every row.
 *
 * Pure: no env, no I/O. The prices are LIST prices per 1,000 billable events (Google's March 2025
 * SKUs) and are only the DEFAULT of the recorded cost — each is env-overridable, and the operator
 * confirms the billed rate on the Google Cloud invoice. Nothing here is a fee or a rate (§8): it is
 * what a call is RECORDED as costing.
 */

export type MapsApi = "routes" | "route_matrix" | "geocoding" | "places_new";

export type MapsSku =
  | "compute_routes_essentials"
  | "compute_route_matrix_essentials"
  | "compute_route_matrix_pro"
  | "geocoding_essentials"
  | "text_search_ids_only"
  | "text_search_enterprise"
  | "place_details_enterprise"
  | "place_details_enterprise_atmosphere";

export interface MapsCaller {
  key: MapsCallerKey;
  api: MapsApi;
  sku: MapsSku;
  /** The request feature or field mask that puts it in that tier — and why that tier is needed. */
  why: string;
  /** Turns the caller on. OFF unless set to "1" (and `GOOGLE_MAPS_API_KEY` is set). */
  enabledEnv: string;
  /** Billable calls allowed per UTC day across the platform. */
  dailyCapEnv: string;
  defaultDailyCap: number;
  /** What one call (or one matrix element) is recorded as costing, and in which unit. */
  costEnv: string;
  costUnit: "usd_per_1000" | "cents_per_call";
  defaultCost: number;
  /** Where the cost is recorded. `api_usage_logs` unless another table already carries it. */
  costRecordedOn: "api_usage_logs" | "place_facts" | "travel_time_matrix_refreshes";
}

export const MAPS_CALLER_KEYS = [
  "routes_drive",
  "routes_mode",
  "routes_transit",
  "route_matrix",
  "geocode",
  "places_id_lookup",
  "places_details",
  "places_text_search",
] as const;
export type MapsCallerKey = (typeof MAPS_CALLER_KEYS)[number];

export const MAPS_CALLERS: Readonly<Record<MapsCallerKey, MapsCaller>> = {
  routes_drive: {
    key: "routes_drive",
    api: "routes",
    sku: "compute_routes_essentials",
    why:
      "travelMode DRIVE with routingPreference TRAFFIC_UNAWARE. Was TRAFFIC_AWARE (Pro): the leg is computed at planning time, usually with no real departure (it fell back to now+10 min), so live traffic described the moment of planning, not the trip.",
    enabledEnv: "MAPS_ROUTES_DRIVE_ENABLED",
    dailyCapEnv: "MAPS_ROUTES_DRIVE_DAILY_CAP",
    defaultDailyCap: 500,
    costEnv: "MAPS_ROUTES_DRIVE_USD_PER_1000",
    costUnit: "usd_per_1000",
    defaultCost: 5,
    costRecordedOn: "api_usage_logs",
  },
  routes_mode: {
    key: "routes_mode",
    api: "routes",
    sku: "compute_routes_essentials",
    why: "travelMode WALK / BICYCLE / TRANSIT, no routing preference, mask routes.duration,routes.distanceMeters — basic features only.",
    enabledEnv: "MAPS_ROUTES_MODE_ENABLED",
    dailyCapEnv: "MAPS_ROUTES_MODE_DAILY_CAP",
    defaultDailyCap: 500,
    costEnv: "MAPS_ROUTES_MODE_USD_PER_1000",
    costUnit: "usd_per_1000",
    defaultCost: 5,
    costRecordedOn: "api_usage_logs",
  },
  routes_transit: {
    key: "routes_transit",
    api: "routes",
    sku: "compute_routes_essentials",
    why: "travelMode TRANSIT with transitPreferences (not a Pro modifier); the step mask is response shape only — Routes bills by request features, not fields.",
    enabledEnv: "MAPS_ROUTES_TRANSIT_ENABLED",
    dailyCapEnv: "MAPS_ROUTES_TRANSIT_DAILY_CAP",
    defaultDailyCap: 300,
    costEnv: "MAPS_ROUTES_TRANSIT_USD_PER_1000",
    costUnit: "usd_per_1000",
    defaultCost: 5,
    costRecordedOn: "api_usage_logs",
  },
  route_matrix: {
    key: "route_matrix",
    api: "route_matrix",
    sku: "compute_route_matrix_pro",
    why:
      "Billed per element. Walk elements bill Essentials; transit elements bill Pro as ruled in §M4 (R186) — the matrix needs transit times, so the tier is needed. The run row already records elements and both unit prices.",
    enabledEnv: "MAPS_ROUTE_MATRIX_ENABLED",
    /** ELEMENTS per day (a matrix bills per element). Kyoto's full refresh is ~7,200. */
    dailyCapEnv: "MAPS_ROUTE_MATRIX_DAILY_CAP",
    defaultDailyCap: 10000,
    costEnv: "TRAVEL_MATRIX_PRO_PRICE_PER_1000",
    costUnit: "usd_per_1000",
    defaultCost: 10,
    costRecordedOn: "travel_time_matrix_refreshes",
  },
  geocode: {
    key: "geocode",
    api: "geocoding",
    sku: "geocoding_essentials",
    why: "Geocoding API (address → lat/lng) has one tier.",
    enabledEnv: "MAPS_GEOCODE_ENABLED",
    dailyCapEnv: "MAPS_GEOCODE_DAILY_CAP",
    defaultDailyCap: 1000,
    costEnv: "MAPS_GEOCODE_USD_PER_1000",
    costUnit: "usd_per_1000",
    defaultCost: 5,
    costRecordedOn: "api_usage_logs",
  },
  places_id_lookup: {
    key: "places_id_lookup",
    api: "places_new",
    sku: "text_search_ids_only",
    why: "Text Search with field mask places.id only — Google's no-charge IDs Only SKU. The caller only needs the place ID (the cache key).",
    enabledEnv: "PLACE_FACTS_PLACES_ENABLED",
    dailyCapEnv: "MAPS_PLACES_ID_LOOKUP_DAILY_CAP",
    defaultDailyCap: 5000,
    costEnv: "PLACES_ID_LOOKUP_COST_CENTS",
    costUnit: "cents_per_call",
    defaultCost: 0,
    costRecordedOn: "place_facts",
  },
  places_details: {
    key: "places_details",
    api: "places_new",
    sku: "place_details_enterprise",
    why:
      "Place Details by ID. regularOpeningHours puts it in Enterprise (hours are the fact the plan needs); dining adds reservable ⇒ Enterprise + Atmosphere (place_details_enterprise_atmosphere). photos is an Essentials field and does not move the tier.",
    enabledEnv: "PLACE_FACTS_PLACES_ENABLED",
    dailyCapEnv: "MAPS_PLACES_DETAILS_DAILY_CAP",
    defaultDailyCap: 1000,
    costEnv: "PLACES_DETAILS_COST_CENTS",
    costUnit: "cents_per_call",
    defaultCost: 2,
    costRecordedOn: "place_facts",
  },
  places_text_search: {
    key: "places_text_search",
    api: "places_new",
    sku: "text_search_enterprise",
    why:
      "The expert workspace's Google search list shows rating, review count and price band, which are Enterprise fields; the mask asks for exactly those plus id, name, address, location and types. No photos — the list draws no Google image.",
    enabledEnv: "MAPS_PLACES_TEXT_SEARCH_ENABLED",
    dailyCapEnv: "MAPS_PLACES_TEXT_SEARCH_DAILY_CAP",
    defaultDailyCap: 300,
    costEnv: "MAPS_PLACES_TEXT_SEARCH_USD_PER_1000",
    costUnit: "usd_per_1000",
    defaultCost: 35,
    costRecordedOn: "api_usage_logs",
  },
};

/** The `api_usage_logs.provider` every Maps cost/counter row carries. */
export const MAPS_USAGE_PROVIDER = "google_maps";

/** The workspace search list's field mask (Places API New, Text Search). */
export const WORKSPACE_TEXT_SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
] as const;
