/**
 * The fee-band contract owned by the pricing and booking resolvers.
 *
 * Keep this module free of database imports. CI and startup checks can import the
 * contract without booting the application, while the resolver modules can use
 * the same names instead of maintaining a second list for validation.
 */

export type FeeBandRateType = "percent" | "flat" | "flat_cents" | "count" | "rule";

export interface FeeBandRequirement {
  bandKey: string;
  expectedType: FeeBandRateType;
  /**
   * Required rows fail the gate when absent or inactive. Optional rows are
   * documented fallback paths: absence/inactivity is allowed, but an active row
   * with the wrong type still fails because the resolver would ignore it.
   */
  required: boolean;
  owner: string;
  requiresMaxAmount?: boolean;
}

export const TRAVELER_SERVICE_FEE_BAND = "traveler_service_fee";
export const PROVIDER_RAILS_BAND = "provider_rails";
export const PROVIDER_LIMITED_BAND = "limited";
export const PROVIDER_MODERATE_BAND = "moderate";
export const PROVIDER_COMMERCIAL_BAND = "commercial";
export const PROVIDER_PREMIUM_BAND = "premium";

export const CONCIERGE_AI_TASK_BAND = "concierge:ai_task";
export const CONCIERGE_BOOKING_PERCENT_BAND = "concierge:booking_pct";
export const CONCIERGE_BOOKING_CAP_BAND = "concierge:booking_cap_cents";
export const CONCIERGE_DONE_FOR_YOU_DEPOSIT_BAND = "concierge:done_for_you_deposit_pct";
export const PROVIDER_PRO_BAND_STEP = "provider:pro_band_step";
export const PLUS_TASK_ALLOWANCE_BAND = "plans:plus_task_allowance";
export const READY_MADE_PLATFORM_BAND = "ready_made:platform_band";

export const CONCIERGE_BOOKING_FEE_BAND_KEY = "expert_concierge_booking";
export const EXPERIENCE_CART_BAND_KEY = "experience_cart_checkout";
export const PLATFORM_DEPOSIT_BAND = "platform_deposit";
export const AFFILIATE_STANDARD_BAND = "affiliate_standard";
export const EXPERT_STANDARD_BAND = "expert_standard";
export const TIP_HANDLING_BAND = "tip_handling";
export const COORDINATION_FLOOR_BAND = "coordination_floor";
export const COORDINATION_PERCENT_BAND = "coordination_percent";

/** Explicit categories that the resolver can receive on known booking paths. */
export const COMMISSION_CATEGORY_BAND_KEYS = [
  "activities",
  "transport",
  "accommodation",
  "food",
  "dining",
  "entertainment",
  "shopping",
  "sightseeing",
  "culture",
  "transportation",
  "flights",
  "car_rental",
  "insurance",
] as const;

/**
 * Named reads in the strict resolvers, plus fallback-backed reads whose active
 * rows must still be correctly typed if an administrator has configured them.
 *
 * The values/rates are deliberately not part of this contract: admin-edited
 * rates are valid and must never be overwritten or rejected by the gate.
 */
export const RESOLVER_FEE_BAND_REQUIREMENTS: readonly FeeBandRequirement[] = [
  {
    bandKey: TRAVELER_SERVICE_FEE_BAND,
    expectedType: "percent",
    required: true,
    owner: "fee-resolution.service / pricing.routes",
    requiresMaxAmount: true,
  },
  {
    bandKey: PROVIDER_RAILS_BAND,
    expectedType: "percent",
    required: true,
    owner: "fee-resolution.service / pricing.routes",
  },
  ...([
    PROVIDER_LIMITED_BAND,
    PROVIDER_MODERATE_BAND,
    PROVIDER_COMMERCIAL_BAND,
    PROVIDER_PREMIUM_BAND,
  ] as const).map((bandKey) => ({
    bandKey,
    expectedType: "percent" as const,
    required: true,
    owner: "fee-resolution.service provider category / pricing.routes",
  })),
  {
    bandKey: CONCIERGE_AI_TASK_BAND,
    expectedType: "flat_cents",
    required: true,
    owner: "pricing.routes",
  },
  {
    bandKey: CONCIERGE_DONE_FOR_YOU_DEPOSIT_BAND,
    expectedType: "percent",
    required: true,
    owner: "pricing.routes",
  },
  {
    bandKey: PROVIDER_PRO_BAND_STEP,
    expectedType: "count",
    required: true,
    owner: "pricing.routes",
  },
  {
    bandKey: EXPERT_STANDARD_BAND,
    expectedType: "percent",
    required: true,
    owner: "commission resolver",
  },
  {
    bandKey: CONCIERGE_BOOKING_FEE_BAND_KEY,
    expectedType: "percent",
    required: true,
    owner: "commission checkout resolver",
  },
  {
    bandKey: EXPERIENCE_CART_BAND_KEY,
    expectedType: "percent",
    required: true,
    owner: "commission experience-cart resolver",
  },
  {
    bandKey: TIP_HANDLING_BAND,
    expectedType: "percent",
    required: true,
    owner: "commission category resolver",
  },
  ...COMMISSION_CATEGORY_BAND_KEYS.map((bandKey) => ({
    bandKey,
    expectedType: "percent" as const,
    required: true,
    owner: "commission category resolver",
  })),
  {
    bandKey: PLATFORM_DEPOSIT_BAND,
    expectedType: "percent",
    required: false,
    owner: "pricing.service fallback resolver",
  },
  {
    bandKey: AFFILIATE_STANDARD_BAND,
    expectedType: "percent",
    required: false,
    owner: "commission affiliate fallback resolver",
  },
  {
    bandKey: COORDINATION_FLOOR_BAND,
    expectedType: "flat",
    required: false,
    owner: "optimization-fee coordination fallback resolver",
  },
  {
    bandKey: COORDINATION_PERCENT_BAND,
    expectedType: "percent",
    required: false,
    owner: "optimization-fee coordination fallback resolver",
  },
];

/** `getFee` has one active row for each event type and each tier default. */
export const OPTIMIZATION_EVENT_TYPES = [
  "vacation",
  "adventure",
  "honeymoon",
  "anniversary",
  "proposal",
  "birthday",
  "wedding",
  "corporate",
] as const;

export const OPTIMIZATION_COMPLEXITY_TIERS = ["simple", "standard", "complex"] as const;