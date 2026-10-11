/**
 * The traveler-profile value sets, stated ONCE (§18 rule 1). Moved here from
 * server/services/traveler-profile.service.ts (which re-exports them unchanged) so the trip-level profile
 * overlay (shared/trip-profile-overlay.ts, TC-3b) validates against the same lists without importing the server.
 */
export const TRANSPORT_PREFERENCE_VALUES = ["time", "cost", "comfort", "scenic"] as const;
export type TransportPreference = (typeof TRANSPORT_PREFERENCE_VALUES)[number];

export const PACE_VALUES = ["relaxed", "moderate", "packed"] as const;
export type Pace = (typeof PACE_VALUES)[number];

export const BUDGET_BAND_VALUES = ["budget", "moderate", "luxury"] as const;
export type BudgetBand = (typeof BUDGET_BAND_VALUES)[number];

export const MOBILITY_VALUES = ["standard", "limited", "wheelchair"] as const;
export type Mobility = (typeof MOBILITY_VALUES)[number];
