/**
 * The fee-band contract owned by the pricing and booking resolvers.
 *
 * Keep this module free of database imports. CI and startup checks can import the
 * contract without booting the application, while the resolver modules can use
 * the same names instead of maintaining a second list for validation.
 *
 * IT IS ALSO THE HOME OF EVERY DOCUMENTED FALLBACK DEFAULT (punchlist V-5, ledger
 * `2026-09-12-fee-band-admin-gaps`). §8 records that some band readers have a deliberate,
 * safe failure mode — `resolveCoordinationFee` keeps charging its ratified floor when the
 * row is gone, because a fee floor that breaks is worse than a fee floor that is stale —
 * while others are fail-loud by design. That split is what decides whether an operator may
 * deactivate a band, so it is declared HERE, beside the band it belongs to, and the
 * resolvers READ their fallback from this module rather than declaring their own copy.
 * One home: the sentence the admin panel shows an operator and the number the resolver
 * actually charges cannot disagree (§18 rule 1).
 *
 * WHY DECLARED AND NOT DERIVED. A band key reaches a resolver in three shapes: a constant
 * (statically visible), a string literal, and — for the commission path, the ready-made
 * listing path and the expert-review path — a value read out of a DATABASE COLUMN
 * (`service_categories.commission_band_key`, `ready_made_trips.fee_band_key`). No static
 * analysis can enumerate the third. What CAN be derived, and is, is the direction that
 * matters: every band reached through a FAIL-LOUD accessor with a statically visible key
 * must be declared `required: true` here. That derivation is the CI pin in
 * `server/__tests__/fee-band-admin-guards.test.ts` (D5), and its negative space is stated
 * there: a dynamically keyed read is invisible to it.
 */

import type { FeeBandRateType } from "../../shared/fee-band-display";

export type { FeeBandRateType };

/** The unit a documented fallback default is expressed in — the band's OWN unit. */
export type FeeBandFallbackUnit = "fraction" | "usd" | "cents" | "count";

/**
 * What happens to the charge path when this band is absent or inactive.
 *
 *  · `none`          — the reader is fail-loud (`requireBand` and friends, or an explicit
 *                      throw). There is no fallback: the charge path raises instead of
 *                      pricing. Deactivating such a band is REFUSED by the admin panel.
 *  · `code_constant` — a documented constant in the named resolver takes over, at `value`.
 *  · `other_band`    — another `fee_bands` row takes over.
 */
export type FeeBandFallback =
  | { kind: "none"; reader: string }
  | { kind: "code_constant"; resolver: string; value: number; unit: FeeBandFallbackUnit }
  | { kind: "other_band"; resolver: string; bandKey: string };

export interface FeeBandRequirement {
  bandKey: string;
  expectedType: FeeBandRateType;
  /**
   * Required rows fail the gate when absent or inactive. Optional rows are
   * documented fallback paths: absence/inactivity is allowed, but an active row
   * with the wrong type still fails because the resolver would ignore it.
   *
   * INVARIANT, pinned by fee-band-admin-guards D3: `required === (fallback.kind === "none")`.
   * The two fields say the same thing from opposite ends and must never drift.
   */
  required: boolean;
  owner: string;
  requiresMaxAmount?: boolean;
  fallback: FeeBandFallback;
}

export const TRAVELER_SERVICE_FEE_BAND = "traveler_service_fee";
export const PROVIDER_RAILS_BAND = "provider_rails";
/** Governs provider commission while active_provider_commission_policy is beta_flat. */
export const BETA_FLAT_BAND = "beta_flat";
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
/**
 * Locked Decision 51 (ledger `2026-09-18-concierge-fee-cap-split`, migration 311): the expert's
 * share of the Booking Concierge facilitation fee, minted at completion. Platform-set only — no
 * expertId/listing parameter reaches it anywhere (the "never expert-settable" rule).
 */
export const CONCIERGE_BOOKING_EXPERT_SHARE_BAND = "expert_concierge_booking_expert_share";
export const EXPERIENCE_CART_BAND_KEY = "experience_cart_checkout";
export const PLATFORM_DEPOSIT_BAND = "platform_deposit";
export const AFFILIATE_STANDARD_BAND = "affiliate_standard";
export const EXPERT_STANDARD_BAND = "expert_standard";
export const TIP_HANDLING_BAND = "tip_handling";
export const COORDINATION_FLOOR_BAND = "coordination_floor";
export const COORDINATION_PERCENT_BAND = "coordination_percent";

/** Ready-made sale take (migration 133). Falls back to the expert_standard band, never to a literal. */
export const READY_MADE_TRIP_BAND = "ready_made_trip";

/** Expert-review service tiers (migration 137). Each is fallback-backed by a documented constant. */
export const EXPERT_REVIEW_FLAT_BAND = "expert_review_flat";
export const EXPERT_REVIEW_BOOK_FLAT_BAND = "expert_review_book_flat";
export const EXPERT_REVIEW_BOOK_PERCENT_BAND = "expert_review_book_percent";
export const FULL_CONCIERGE_FLAT_BAND = "full_concierge_flat";
export const FULL_CONCIERGE_PERCENT_BAND = "full_concierge_percent";

/** The reviewing expert's share of an expert-review fee (migration 142). Fallback-backed. */
export const EXPERT_REVIEW_EXPERT_SHARE_BAND = "expert_review_expert_share";
// R324 (step 7b, migration 354): the handoff's three bands — two withdrawal shares (R-t) and the
// on-trip support price (§12 step 6). Declared so the Fees screen states what turning each off does.
export const HANDOFF_WITHDRAWAL_ACCEPTED_BAND = "handoff_withdrawal_accepted";
export const HANDOFF_WITHDRAWAL_DELIVERED_BAND = "handoff_withdrawal_delivered";
export const ON_TRIP_SUPPORT_BAND = "on_trip_support";

// TC-0 (ledger `2026-10-10-tc0-transport-commission-band`; LD 8): the platform's commission on a
// platform-booked transport leg. Optional: absent ⇒ 0 — no commission is claimed (the rate is shown on
// a leg's booking options as metadata; no charge path reads it).
export const TRANSPORT_PLATFORM_COMMISSION_BAND = "transport_platform_commission";
// TC-0: the margin shown on the route-search affiliate partners (12Go, Omio, DiscoverCars, Kiwi) — ONE
// band. Optional: absent ⇒ 0 (no margin claimed). Display metadata only.
export const AFFILIATE_TRANSPORT_MARGIN_BAND = "affiliate_transport_margin";

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

/** Shorthand for the fail-loud entries below — every one of them names the reader that throws. */
const failLoud = (reader: string): FeeBandFallback => ({ kind: "none", reader });

/**
 * Named reads in the strict resolvers, plus fallback-backed reads whose active
 * rows must still be correctly typed if an administrator has configured them.
 *
 * The values/rates are deliberately not part of this contract EXCEPT as the documented
 * FALLBACK default of a fallback-backed row: admin-edited rates are valid and must never
 * be overwritten or rejected by the gate. Every fallback literal below carries its
 * `fee-literal-ok` annotation and is READ BY the resolver it names — it is the constant
 * that resolver used to declare inline, moved here so there is one of it.
 */
export const RESOLVER_FEE_BAND_REQUIREMENTS: readonly FeeBandRequirement[] = [
  {
    bandKey: TRAVELER_SERVICE_FEE_BAND,
    expectedType: "percent",
    required: true,
    owner: "fee-resolution.service / pricing.routes",
    requiresMaxAmount: true,
    fallback: failLoud("resolveTravelerServiceFee (fee-resolution.service) and GET /api/pricing"),
  },
  {
    bandKey: PROVIDER_RAILS_BAND,
    expectedType: "percent",
    required: true,
    owner: "fee-resolution.service / pricing.routes",
    fallback: failLoud("resolveProviderRate rails branch (fee-resolution.service) and GET /api/pricing"),
  },
  {
    bandKey: BETA_FLAT_BAND,
    expectedType: "percent",
    required: true,
    owner: "fee-resolution.service provider beta policy",
    fallback: failLoud("resolveProviderRate when active_provider_commission_policy is beta_flat"),
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
    fallback: failLoud("resolveProviderRate category branch (fee-resolution.service)"),
  })),
  {
    bandKey: CONCIERGE_AI_TASK_BAND,
    expectedType: "flat_cents",
    required: true,
    // AMENDED by punchlist **D-20** = A (ledger `2026-09-15-d20-d21-proposal-charge`): this band
    // stopped being display-only the moment the AI-proposal apply became a charge point. Its
    // `owner` named only `pricing.routes` while the real consequence of deactivating it is now
    // that a TRAVELER CANNOT APPLY A PROPOSAL — `resolveAiTaskChargeCents`
    // (`proposal-charge.service.ts`) reads it through the same fail-loud accessor, so the charge
    // path refuses rather than pricing itself. V-5's deactivation warning is generated from this
    // entry, so leaving it stale would have told an operator that turning the band off changes a
    // number on the pricing page (§13 — the warning has to name what actually breaks).
    owner: "pricing.routes / proposal-charge.service (the AI-proposal apply charge)",
    fallback: failLoud(
      "GET /api/pricing (requireFlatCentsBand) and resolveAiTaskChargeCents (proposal-charge.service) — the apply charge",
    ),
  },
  {
    bandKey: CONCIERGE_DONE_FOR_YOU_DEPOSIT_BAND,
    expectedType: "percent",
    required: true,
    owner: "pricing.routes",
    fallback: failLoud("GET /api/pricing (requireBandType)"),
  },
  {
    bandKey: PROVIDER_PRO_BAND_STEP,
    expectedType: "count",
    required: true,
    owner: "pricing.routes",
    fallback: failLoud("GET /api/pricing (requireCountBand)"),
  },
  {
    bandKey: EXPERT_STANDARD_BAND,
    expectedType: "percent",
    required: true,
    owner: "commission resolver",
    fallback: failLoud("getExpertSplitRates (commission) — the ruling-25 split backstop"),
  },
  {
    bandKey: CONCIERGE_BOOKING_FEE_BAND_KEY,
    expectedType: "percent",
    required: true,
    owner: "commission checkout resolver",
    // Locked Decision 51: the panel already edits this band's `max_amount` cap, but nothing
    // applied it — `resolveConciergeBookingFee` now refuses to charge past it, so clearing the
    // cap is refused exactly as `traveler_service_fee`'s is (fee-band-admin.service V-4c).
    requiresMaxAmount: true,
    fallback: failLoud("resolveCommissionRates (commission)"),
  },
  {
    bandKey: CONCIERGE_BOOKING_EXPERT_SHARE_BAND,
    expectedType: "percent",
    // R6 posture (migration 142 precedent): admin-editable with a documented code-constant
    // fallback, never fail-loud — a misconfigured/absent row keeps splitting at the ratified
    // default rather than blocking a completion mint.
    required: false,
    owner: "commission concierge split resolver / mintCompletionEarningsForBooking (storage.ts)",
    fallback: {
      kind: "code_constant",
      resolver: "resolveConciergeExpertShareRate (commission)",
      value: 0.75, // fee-literal-ok: documented fallback default (R6 posture), read by commission.ts
      unit: "fraction",
    },
  },
  {
    bandKey: EXPERIENCE_CART_BAND_KEY,
    expectedType: "percent",
    required: true,
    owner: "commission experience-cart resolver",
    fallback: failLoud("resolveCommissionRates experience-cart branch (commission)"),
  },
  {
    bandKey: TIP_HANDLING_BAND,
    expectedType: "percent",
    required: true,
    owner: "commission category resolver",
    fallback: failLoud("resolveCommissionRates (commission)"),
  },
  ...COMMISSION_CATEGORY_BAND_KEYS.map((bandKey) => ({
    bandKey,
    expectedType: "percent" as const,
    required: true,
    owner: "commission category resolver",
    fallback: failLoud("resolveCommissionRates category branch (commission) — throws on a missing band"),
  })),
  {
    bandKey: PLATFORM_DEPOSIT_BAND,
    expectedType: "percent",
    required: false,
    owner: "pricing.service fallback resolver",
    fallback: {
      kind: "code_constant",
      resolver: "PricingService.loadDepositRate (pricing.service)",
      value: 0.25, // fee-literal-ok: documented fallback default, read by pricing.service
      unit: "fraction",
    },
  },
  {
    bandKey: AFFILIATE_STANDARD_BAND,
    expectedType: "percent",
    required: false,
    owner: "commission affiliate fallback resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveCommissionRates affiliate branch (commission)",
      value: 0.70, // fee-literal-ok: documented fallback default (platform take), read by commission.ts
      unit: "fraction",
    },
  },
  {
    bandKey: COORDINATION_FLOOR_BAND,
    expectedType: "flat",
    required: false,
    owner: "optimization-fee coordination fallback resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveCoordinationFee (optimization-fee.service)",
      value: 499, // fee-literal-ok: documented fallback default, read by optimization-fee.service
      unit: "usd",
    },
  },
  {
    bandKey: COORDINATION_PERCENT_BAND,
    expectedType: "percent",
    required: false,
    owner: "optimization-fee coordination fallback resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveCoordinationFee (optimization-fee.service)",
      value: 0.08, // fee-literal-ok: documented fallback default, read by optimization-fee.service
      unit: "fraction",
    },
  },
  // ── Fallback-backed rows that were live in code and undeclared here until V-5 ──────────
  // Each is read by a resolver that SURVIVES the band's absence. They were absent from this
  // manifest, so the deployment gate never type-checked them and the admin panel could not
  // say what deactivating one would do. Declaring them changes no gate outcome for an absent
  // or inactive row (optional rows may be either) — it adds the type check and the sentence.
  {
    bandKey: READY_MADE_TRIP_BAND,
    expectedType: "percent",
    required: false,
    owner: "ready-made-purchase.service take-rate resolver",
    fallback: {
      kind: "other_band",
      resolver: "resolveReadyMadeTakeRate (ready-made-purchase.service)",
      bandKey: EXPERT_STANDARD_BAND,
    },
  },
  {
    bandKey: EXPERT_REVIEW_FLAT_BAND,
    expectedType: "flat",
    required: false,
    owner: "booking-actions expert-review resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveExpertReviewAmount (booking-actions.service)",
      value: 50, // fee-literal-ok: documented fallback default, read by booking-actions.service
      unit: "usd",
    },
  },
  {
    bandKey: EXPERT_REVIEW_BOOK_FLAT_BAND,
    expectedType: "flat",
    required: false,
    owner: "booking-actions expert-review resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveExpertReviewAmount (booking-actions.service)",
      value: 50, // fee-literal-ok: documented fallback default, read by booking-actions.service
      unit: "usd",
    },
  },
  {
    bandKey: EXPERT_REVIEW_BOOK_PERCENT_BAND,
    expectedType: "percent",
    required: false,
    owner: "booking-actions expert-review resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveExpertReviewAmount (booking-actions.service)",
      value: 0.05, // fee-literal-ok: documented fallback default, read by booking-actions.service
      unit: "fraction",
    },
  },
  {
    bandKey: FULL_CONCIERGE_FLAT_BAND,
    expectedType: "flat",
    required: false,
    owner: "booking-actions expert-review resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveExpertReviewAmount (booking-actions.service)",
      value: 100, // fee-literal-ok: documented fallback default, read by booking-actions.service
      unit: "usd",
    },
  },
  {
    bandKey: FULL_CONCIERGE_PERCENT_BAND,
    expectedType: "percent",
    required: false,
    owner: "booking-actions expert-review resolver",
    fallback: {
      kind: "code_constant",
      resolver: "resolveExpertReviewAmount (booking-actions.service)",
      value: 0.08, // fee-literal-ok: documented fallback default, read by booking-actions.service
      unit: "fraction",
    },
  },
  {
    bandKey: EXPERT_REVIEW_EXPERT_SHARE_BAND,
    expectedType: "percent",
    required: false,
    owner: "booking-actions expert-review split (migration 142)",
    fallback: {
      kind: "code_constant",
      resolver: "creditExpertReviewSplit (booking-actions.service)",
      value: 0.75, // fee-literal-ok: documented fallback default, read by booking-actions.service
      unit: "fraction",
    },
  },
  // R324 (step 7b, R-t): the share of a captured handoff fee KEPT when the traveler withdraws.
  // Absent ⇒ the withdrawal keeps NOTHING and refunds the whole fee — the traveler-safe answer.
  {
    bandKey: HANDOFF_WITHDRAWAL_ACCEPTED_BAND,
    expectedType: "percent",
    required: false,
    owner: "handoff withdrawal after accept (handoff.service, R-t)",
    fallback: {
      kind: "code_constant",
      resolver: "withdrawHandoff (handoff.service)",
      value: 0, // fee-literal-ok: documented fallback default — keep nothing, refund all
      unit: "fraction",
    },
  },
  {
    bandKey: HANDOFF_WITHDRAWAL_DELIVERED_BAND,
    expectedType: "percent",
    required: false,
    owner: "handoff withdrawal after delivery (handoff.service, R-t)",
    fallback: {
      kind: "code_constant",
      resolver: "withdrawHandoff (handoff.service)",
      value: 0, // fee-literal-ok: documented fallback default — keep nothing, refund all
      unit: "fraction",
    },
  },
  // TC-0: the transport platform commission. Absent ⇒ 0 — no commission claimed on a platform leg.
  {
    bandKey: TRANSPORT_PLATFORM_COMMISSION_BAND,
    expectedType: "percent",
    required: false,
    owner: "transport booking options — platform commission (transport-booking-options.service, TC-0)",
    fallback: {
      kind: "code_constant",
      resolver: "resolveTransportCommissionRate (transport-booking-options.service)",
      value: 0, // fee-literal-ok: documented fallback — no commission claimed
      unit: "fraction",
    },
  },
  // TC-0: the route-search partners' margin. Absent ⇒ 0 — no margin claimed on an affiliate option.
  {
    bandKey: AFFILIATE_TRANSPORT_MARGIN_BAND,
    expectedType: "percent",
    required: false,
    owner: "transport booking options — affiliate route-search margin (transport-booking-options.service, TC-0)",
    fallback: {
      kind: "code_constant",
      resolver: "resolveAffiliateTransportMargin (transport-booking-options.service)",
      value: 0, // fee-literal-ok: documented fallback — no margin claimed
      unit: "fraction",
    },
  },
  // R324 (step 7b, §12 step 6): on-trip support has NO price without this band, so it is not
  // offered at all while the band is absent — there is no number to fall back to.
  {
    bandKey: ON_TRIP_SUPPORT_BAND,
    expectedType: "flat",
    required: true,
    owner: "handoff on-trip support (handoff.service, §12 step 6)",
    fallback: { kind: "none", reader: "onTripSupportCents (handoff.service) — on-trip support is not offered without it" },
  },
];

/** The manifest entry for a band key, or null when no resolver declares a dependency on it. */
export function feeBandRequirement(bandKey: string): FeeBandRequirement | null {
  return RESOLVER_FEE_BAND_REQUIREMENTS.find((r) => r.bandKey === bandKey) ?? null;
}

/**
 * The documented fallback default for a band, in the band's OWN unit.
 *
 * This is the accessor the RESOLVERS call, so the number a resolver charges when a row is
 * gone is literally the number the admin panel told the operator it would charge. It throws
 * for a band with no declared code-constant fallback rather than answering 0 — a fabricated
 * zero here is a free charge (§13).
 */
export function declaredFallbackValue(bandKey: string): number {
  const requirement = feeBandRequirement(bandKey);
  if (!requirement || requirement.fallback.kind !== "code_constant") {
    throw new Error(
      `no declared code-constant fallback for fee band '${bandKey}' — ` +
        `RESOLVER_FEE_BAND_REQUIREMENTS is the single home for documented fallback defaults (§8).`,
    );
  }
  return requirement.fallback.value;
}

/**
 * Locked Decision 51 (ledger `2026-09-18-concierge-fee-cap-split`, migration 311): the Booking
 * Concierge facilitation fee for ONE LINE — fee = min(price × rate, capAmount ?? ∞), rounded to
 * cents.
 *
 * PURE: no db, no expertId, no listing/serviceId parameter — the rate and the cap are platform
 * bands only (§18), resolved ONCE per checkout by `getConciergeBookingRate` /
 * `requireConciergeBookingRate` and `getConciergeBookingCap` (`commission.ts`) and passed in here,
 * never re-resolved per line from a listing. Every quote/charge/preview surface calls this SAME
 * function so the amount quoted and the amount charged can never disagree about the cap (§18 rule 1).
 *
 * DECLARED HERE, not in `commission.ts` (which re-exports it) — this module's own header requires
 * it stay free of database imports, which is what lets `traveler-charge-composition.test.ts`'s
 * dedicated CI job (no DATABASE_URL; the file is documented and proven DB-free) import it directly.
 */
export function resolveConciergeBookingFee(
  price: number,
  rate: number,
  capAmount: number | null,
): { fee: number; rate: number; capApplied: boolean } {
  const uncapped = Math.round(price * rate * 100) / 100;
  const capped = capAmount !== null && uncapped > capAmount ? capAmount : uncapped;
  return { fee: capped, rate, capApplied: capped !== uncapped };
}

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
