/**
 * OFFERING COMMERCE CONTRACT — the FIFTH classifier, and it composes the four that already exist.
 *
 * Lane OC-A2 of `docs/superpowers/specs/2026-09-11-offering-commerce-contract-implementation-plan.md`,
 * implementing §8/§9/§14 of the design (`…/2026-09-08-offering-commerce-trip-slip-contract-design.md`,
 * as amended 2026-09-11). Ledger `2026-09-11-offering-commerce-resolver`.
 *
 * WHAT IT IS. One function — `resolveOfferingCommerceContract` — that answers, for one offering,
 * the nine axes §8 declares: who sells it, which archetype it is, how it is committed to, how it is
 * fulfilled, who may promise availability, who owns the price, how it is charged, what proves
 * completion, and what it does to the plan. It returns EITHER a contract OR a machine-readable
 * reason it cannot be resolved. It never returns a nearest-looking archetype (§13).
 *
 * IT COMPOSES; IT RE-DERIVES NOTHING (§18 rule 1, and the design's own §14 amendment):
 *   · `resolveBookingModeWithProvenance` (shared/schema.ts) — the booking mode is read THROUGH
 *     ruling 75's resolver, never off the `booking_mode` column.
 *   · `impactClassFor` (shared/impact-class.ts) — what the offering does to a plan. `slipEffect`
 *     is DERIVED from it and is never a second opinion about the same row.
 *   · `shared/service-fundamentals.ts` — `isClassifiable` / `isPlaceAnchored` / `needsScheduling` /
 *     `isArtifactDelivery` / `PROVIDER_DECLARED_METHODS` decide `fulfillmentMode`, and
 *     `completionRuleFor` (ruling 63/69) decides `completionRule`. **Where the archetype implies a
 *     different shape than the fundamentals compute, THE FUNDAMENTALS WIN and the disagreement is
 *     emitted as a FINDING** — the design's §14 amendment, rule 4, verbatim.
 *   · `expertOfferingTier` / `isEventPlannerOfferingKey` (shared/expert-offerings.ts) — the expert
 *     tier, §10's non-binding hint, used only to split E2 from E3.
 *
 * WHAT IT IS NOT, and must not become:
 *   · **It never draws a CTA.** `resolveBuyAction` (shared/buy-action.ts) stays the SOLE author of
 *     the buy button and the landing rule (ruling 9). The contract is that resolver's INPUT, never
 *     the reverse, and nothing here returns a label, a verb or a store.
 *   · **It has no caller on any production surface in this lane.** OC-A2 ships the module and its
 *     tests; OC-A4 is the first reader (activation validation). `resolveContentCTA` is untouched.
 *   · **It adds no column and writes nothing.** Phase 1 adds no schema at all; it imports no `db`,
 *     no `storage`, no Stripe client and no clock, so it is provable by a pure test.
 *
 * DELIBERATELY ABSENT FROM THE OUTPUT (§13 — a field nothing can source is not emitted).
 * §14's contract sketch lists `cancellationPolicyId`, `reschedulePolicyId` and `disputePolicyId`.
 * No column holds any of the three today, so they are omitted rather than filled with a default
 * that would read as a policy somebody chose. `contractVersion` is emitted because this module is
 * its own authority for it.
 *
 * THE 61 FIXTURES RESOLVE AS UNCLASSIFIED, AND THAT IS AN ANSWER (plan §0 constraint 1, ledger
 * `2026-09-11-oc-a1-ratified`). `provider_services.service_type` carries a SECOND, category-shaped
 * vocabulary beside the declared six (`storage.getProviderServices` matches category with `ilike`
 * on it; `content-matching.service.ts` does `inArray` on it — punchlist R-7), which is why
 * production's demo corpus holds `florist` / `av-equipment` / `flights` there and why correcting
 * those values would break real readers. A value outside `serviceTypeEnum` therefore makes the row
 * UNRESOLVABLE with that reason. A fixture is not a seller's offering; "unclassified" is honest,
 * not a defect, and callers must not treat it as an error.
 *
 * NEGATIVE SPACE, stated because a green suite means green-within-stated-bounds (§18d):
 *   · It classifies ONE offering from the facts it is handed. It does no joins, so a caller that
 *     hands it a stale `categoryKey` gets a contract about a stale key.
 *   · It does not decide whether the required context is PRESENT — only which facts the archetype
 *     requires. Enforcement is OC-B3.
 *   · It does not price, charge, claim inventory or touch a booking. `chargeMode` names a shape;
 *     it computes no amount (§14).
 *   · A FINDING is a note for a human. It never changes the contract that is returned.
 */
import {
  resolveBookingModeWithProvenance,
  serviceTypeEnum,
  type BookingModeProvenance,
} from "@shared/schema";
import { impactClassFor, type ImpactClass } from "@shared/impact-class";
import {
  completionRuleFor,
  isArtifactDelivery,
  isClassifiable,
  isPlaceAnchored,
  needsScheduling,
  PROVIDER_DECLARED_METHODS,
  type FundamentalsShape,
} from "@shared/service-fundamentals";
import { expertOfferingTier, isEventPlannerOfferingKey } from "@shared/expert-offerings";

// ─── §8's nine axes ──────────────────────────────────────────────────────────────────────────

export const CONTRACT_VERSION = 1 as const;

export type SellerClass = "expert" | "provider" | "traveloure" | "external_partner";

/** §9's master treatment matrix, by its own ids. E5 is deliberately absent — see below. */
export type CommerceArchetype =
  | "E1" | "E2" | "E3" | "E4" | "E6"
  | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8"
  | "T1" | "T2" | "X1" | "N1";

export type CommitmentMode =
  | "instant" | "request_accept" | "quote_approve" | "reserve_then_pay"
  | "external_handoff" | "not_purchasable";

/** Whose answer the commitment mode is. Plan §0 constraint 3: today it is nearly always nobody's. */
export type CommitmentModeSource = BookingModeProvenance;

export type FulfillmentMode =
  | "in_person" | "live_remote" | "async_artifact" | "async_messaging"
  | "coordination" | "stay" | "bundle" | "plan_clone" | "plan_modification" | "external";

export type InventoryAuthority =
  | "native_slot" | "seller_acceptance" | "property_inventory"
  | "component_inventory" | "external_partner" | "none";

export type PriceAuthority =
  | "listing" | "selected_tier" | "server_quote" | "property_rate" | "external_partner" | "no_charge";

export type ChargeMode =
  | "full" | "deposit_balance" | "after_acceptance" | "after_quote"
  | "traveloure_fee_only" | "external" | "none";

export type CompletionRuleAxis =
  | "service_date" | "session_end" | "artifact_accepted" | "seller_declared"
  | "all_components" | "checkout_date" | "plan_delivered" | "support_window_end"
  | "external_reported" | "none";

export type SlipEffect =
  | "add_obligation" | "modify_plan" | "attach_support"
  | "clone_plan" | "record_external" | "planning_reference_only";

/**
 * §18's required-context list, as a closed vocabulary. **Trip dates are NOT a service fulfilment
 * fact** and are deliberately not on it — that distinction is the whole point of §18's own note.
 */
export type RequiredContext =
  | "slot_or_acceptance" | "timezone" | "party_size" | "meeting_point"
  | "delivery_window" | "brief" | "support_window" | "response_sla"
  | "check_in" | "check_out" | "guests"
  | "route_endpoints" | "pickup_time"
  | "component_availability" | "quote_request"
  | "topic" | "scope" | "location" | "constraints" | "expense_policy"
  | "target_plan";

export interface OfferingCommerceContract {
  contractVersion: typeof CONTRACT_VERSION;
  sellerClass: SellerClass;
  commerceArchetype: CommerceArchetype;
  commitmentMode: CommitmentMode;
  /** Seller-declared and platform-default are DIFFERENT FACTS (plan §0 constraint 3). */
  commitmentModeSource: CommitmentModeSource;
  fulfillmentMode: FulfillmentMode;
  inventoryAuthority: InventoryAuthority;
  priceAuthority: PriceAuthority;
  chargeMode: ChargeMode;
  completionRule: CompletionRuleAxis;
  slipEffect: SlipEffect;
  requiredContext: readonly RequiredContext[];
  allowsTripLevelProjection: boolean;
  requiresItemLink: boolean;
  requiresFulfillmentEvidence: boolean;
}

/** A disagreement worth a human's attention. It never changes the contract that is returned. */
export interface ContractFinding {
  code: "fulfillment_mode_disagrees_with_archetype" | "completion_rule_disagrees_with_archetype";
  archetypeImplies: string;
  computed: string;
  note: string;
}

export type UnresolvableReason =
  /** `service_type` outside `serviceTypeEnum` — the second category-shaped vocabulary (R-7). */
  | "service_type_outside_declared_vocabulary"
  /** No delivery method and no product shape: how it is fulfilled is not knowable (§13). */
  | "delivery_shape_unclassifiable"
  /** Neither offering catalog recognises the row's keys, so nothing can say what it does to a plan. */
  | "catalog_keys_unrecognised"
  /** The shape resolves but no §9 archetype covers it. */
  | "archetype_unresolvable"
  /** §11's invalid combination: a quote cannot be instantly committed to. */
  | "instant_commitment_with_custom_quote"
  /** §11's invalid combination: a downloadable artifact with a mandatory physical meeting point. */
  | "artifact_delivery_with_meeting_point";

export type OfferingCommerceResolution =
  | { resolved: true; contract: OfferingCommerceContract; findings: readonly ContractFinding[] }
  | { resolved: false; reason: UnresolvableReason; detail: string };

// ─── Inputs ──────────────────────────────────────────────────────────────────────────────────

/**
 * A `provider_services` row plus the joined facts it cannot state about itself. Every field is
 * optional except the ones the row cannot exist without, and an absent field is ABSENT — never a
 * default (§13).
 */
export interface OfferingListingInput {
  kind: "listing";
  /**
   * The OWNER's role, resolved by the caller. Both sides of the marketplace write to
   * `provider_services` (the canonical table, CLAUDE.md's Service Model), so the row itself cannot
   * say which of them sold it.
   */
  sellerClass: "expert" | "provider";
  serviceType?: string | null;
  deliveryMethod?: string | null;
  productShape?: string | null;
  priceType?: string | null;
  /** RAW `booking_mode`. Read through the resolver, never off the column (§11 amendment). */
  bookingMode?: string | null;
  /** `service_provider_forms.instant_booking`. `undefined`/`null` = no flag known — NOT `false`. */
  ownerInstantBooking?: boolean | null;
  /** `service_categories.category_key`, joined by the caller. An `aff_*` key is a partner source. */
  categoryKey?: string | null;
  /** `expert_offering_types.offering_type_key`, where the caller holds one. */
  offeringTypeKey?: string | null;
  depositEnabled?: boolean | null;
  /** Whether the listing carries a `meeting_point`. Used only for §11's artifact contradiction. */
  hasMeetingPoint?: boolean | null;
}

export type OfferingCommerceInput =
  | OfferingListingInput
  /** `ready_made_trips` — the single store lane (§15A; the `expert_templates` lane is retired). */
  | { kind: "ready_made" }
  /** Plan optimization: a Traveloure fee, not a seller's offering. */
  | { kind: "optimization" }
  /** Affiliate / OTA inventory. The partner charges the traveler; we mint no PaymentIntent (LD 43(c)). */
  | { kind: "external_partner" }
  /** A gem, a neighbourhood, an unpriced recommendation. Saved, never bought. */
  | { kind: "information" };

// ─── Derivations ─────────────────────────────────────────────────────────────────────────────

/**
 * §13, and it is the load-bearing half: `slipEffect` is DERIVED from `impactClassFor` and from
 * nothing else, so the buy side and the plan side cannot disagree about what a listing does.
 *
 * `plan_work → modify_plan` covers §9.1's E3 row, whose prose says "attach a coordination
 * workstream". That prose is NOT re-implemented here: the design's own §14 amendment ruled that
 * `slipEffect` derives from `impactClassFor` rather than being a second opinion about the same
 * row, and `impactClassFor` puts the six done-for-you coordination keys in `plan_work` (they book
 * things INTO the plan). The six PLANNER keys are `event_coordination`, and those do attach.
 */
const IMPACT_TO_SLIP_EFFECT: Readonly<Record<ImpactClass, SlipEffect>> = {
  consult: "attach_support",
  plan_work: "modify_plan",
  event_coordination: "attach_support",
  live_trip: "attach_support",
  on_ground: "add_obligation",
  stay: "add_obligation",
  partner: "record_external",
};

/**
 * What §9 states a given archetype's fulfilment looks like — ONLY where §9 states it without
 * qualification. Expert archetypes are all absent: §10 rules the expert tier a non-binding hint,
 * so an expert row's fulfilment is whatever its delivery method actually is.
 *
 * This map exists to produce FINDINGS. It never overrides the fundamentals.
 */
const ARCHETYPE_IMPLIED_FULFILLMENT: Readonly<Partial<Record<CommerceArchetype, FulfillmentMode>>> = {
  P1: "in_person",
  P2: "live_remote",
  P3: "async_artifact",
  P4: "async_messaging",
  P6: "stay",
  P7: "bundle",
  P8: "in_person",
};

/** Likewise for completion, where §9 names a rule the ruling-63 per-method table does not produce. */
const ARCHETYPE_IMPLIED_COMPLETION: Readonly<Partial<Record<CommerceArchetype, CompletionRuleAxis>>> = {
  P4: "support_window_end",
  E4: "support_window_end",
};

const REQUIRED_CONTEXT: Readonly<Record<CommerceArchetype, readonly RequiredContext[]>> = {
  // §18: P1/P2 need a slot or an explicit request-acceptance path.
  P1: ["slot_or_acceptance", "party_size", "meeting_point"],
  P2: ["slot_or_acceptance", "timezone"],
  // §18: P3 needs a DELIVERY WINDOW rather than a fake appointment.
  P3: ["brief", "delivery_window"],
  P4: ["support_window", "response_sla"],
  P5: ["quote_request"],
  P6: ["check_in", "check_out", "guests"],
  P7: ["component_availability"],
  P8: ["route_endpoints", "pickup_time"],
  E1: ["topic"],
  E2: ["brief", "constraints"],
  E3: ["scope"],
  E4: ["support_window"],
  E6: ["location", "constraints", "expense_policy"],
  T1: [],
  T2: ["target_plan"],
  X1: [],
  N1: [],
};

function shapeOf(input: OfferingListingInput): FundamentalsShape {
  return { deliveryMethod: input.deliveryMethod, productShape: input.productShape };
}

/**
 * `fulfillmentMode` from the SERVICE FUNDAMENTALS, in their own order. The fundamentals are the
 * authority (§14 amendment, rule 4); an archetype that implies something else produces a finding,
 * not an override.
 */
function fulfillmentFromFundamentals(shape: FundamentalsShape): FulfillmentMode | null {
  if (shape.productShape === "bundle") return "bundle";
  if (shape.productShape === "property" || shape.productShape === "property_room") return "stay";
  if (isPlaceAnchored(shape)) return "in_person";
  if (needsScheduling(shape)) return "live_remote";
  if (isArtifactDelivery(shape)) return "async_artifact";
  if (shape.deliveryMethod && PROVIDER_DECLARED_METHODS.has(shape.deliveryMethod)) return "async_messaging";
  return null;
}

/** Ruling 63/69's per-method completion rules, mapped onto §8's completion vocabulary. */
function completionFromFundamentals(shape: FundamentalsShape): CompletionRuleAxis | null {
  switch (completionRuleFor(shape)) {
    case "service_date_timer": return "service_date";
    case "checkout_date": return "checkout_date";
    case "artifact_timer": return "artifact_accepted";
    case "session_end": return "session_end";
    case "provider_declared": return "seller_declared";
    case "bundle_components": return "all_components";
    default: return null;
  }
}

/**
 * §9's archetype, for a listing. Composed: the impact class answers first wherever it can, and the
 * row's own shape refines it.
 *
 * E5 IS NOT AN OUTPUT. §9.1's own text says "`specialized` is not itself a checkout archetype" and
 * must map explicitly to E1/E2/E6/P2/P3/P4 by the DECLARED DELIVERABLE. In this repository the
 * declared deliverable IS the delivery method, which a listing must carry to be classifiable at
 * all — so §10's "a tier that maps to more than one archetype with nothing explicit stored cannot
 * activate" is satisfied structurally: a specialized listing with no delivery method is already
 * `delivery_shape_unclassifiable`, and one with a delivery method has declared its shape.
 */
function archetypeForListing(
  input: OfferingListingInput,
  impact: ImpactClass,
  shape: FundamentalsShape,
): CommerceArchetype | null {
  // Partner inventory wins outright, whichever side listed it (§16, LD 43(c)).
  if (impact === "partner") return "X1";

  if (input.sellerClass === "expert") {
    const key = input.offeringTypeKey?.trim() || null;
    if (key && isEventPlannerOfferingKey(key)) return "E3";
    if (impact === "event_coordination") return "E3";
    if (impact === "live_trip") return "E4";
    if (impact === "plan_work") {
      // §10: coordination defaults to E3, planning to E2. The tier is the only fact that splits
      // them, because `impactClassFor` collapses both into `plan_work` by design.
      return expertOfferingTier(key) === "coordination" ? "E3" : "E2";
    }
    if (impact === "consult") {
      // §9.1 E6: an expert selling a PHYSICAL task (personal shopping, location scouting).
      // Everything else advisory is E1, whose fulfilment §9.1 defines as a live session OR an
      // explicit written response — so an artifact-delivered consult is E1, not a provider P3.
      return isPlaceAnchored(shape) ? "E6" : "E1";
    }
    // `stay` / `on_ground` on an expert-owned row come from a PROVIDER category key; the row is
    // provider-shaped whoever owns it, so it falls through to the provider table below.
  }

  if (shape.productShape === "bundle") return "P7";
  if (shape.productShape === "property" || shape.productShape === "property_room") return "P6";
  // §9.2 P5: a custom quote is a quote whatever it delivers, and §9.2 forbids sending it through
  // generic checkout until the quote rail exists (register D-8).
  if (input.priceType === "custom_quote") return "P5";
  if (input.categoryKey === "private_transportation") return "P8";
  if (isPlaceAnchored(shape)) return "P1";
  if (needsScheduling(shape)) return "P2";
  if (isArtifactDelivery(shape)) return "P3";
  if (shape.deliveryMethod === "voice_notes") return "P3"; // §9.2 names the voice-note package here
  if (shape.deliveryMethod === "async_messaging") return "P4";
  return null;
}

function commitmentForListing(
  input: OfferingListingInput,
  archetype: CommerceArchetype,
  booking: ReturnType<typeof resolveBookingModeWithProvenance>,
): { mode: CommitmentMode; source: CommitmentModeSource } {
  if (archetype === "X1") return { mode: "external_handoff", source: "listing_declared" };
  if (archetype === "N1") return { mode: "not_purchasable", source: "listing_declared" };
  // `hidden` is only ever an explicit per-listing choice (ruling 75), so its source is the row's.
  if (booking.mode === "hidden") return { mode: "not_purchasable", source: booking.provenance };
  if (archetype === "P5") return { mode: "quote_approve", source: "listing_declared" };
  if (archetype === "P6") return { mode: "reserve_then_pay", source: booking.provenance };
  return {
    mode: booking.mode === "instant" ? "instant" : "request_accept",
    source: booking.provenance,
  };
}

function inventoryAuthorityFor(
  archetype: CommerceArchetype,
  commitment: CommitmentMode,
  shape: FundamentalsShape,
): InventoryAuthority {
  if (archetype === "X1") return "external_partner";
  if (archetype === "P6") return "property_inventory";
  if (archetype === "P7") return "component_inventory";
  if (commitment === "not_purchasable") return "none";
  if (commitment === "instant" && needsScheduling(shape)) return "native_slot";
  if (commitment === "instant") return "none"; // an artifact has nothing to reserve
  return "seller_acceptance";
}

function priceAuthorityFor(
  input: OfferingListingInput,
  archetype: CommerceArchetype,
  commitment: CommitmentMode,
): PriceAuthority {
  if (archetype === "X1") return "external_partner";
  if (archetype === "N1" || commitment === "not_purchasable") return "no_charge";
  if (input.priceType === "custom_quote") return "server_quote";
  if (archetype === "P6") return "property_rate";
  if (input.priceType === "package_tiers") return "selected_tier";
  return "listing";
}

function chargeModeFor(
  input: OfferingListingInput,
  archetype: CommerceArchetype,
  commitment: CommitmentMode,
): ChargeMode {
  if (archetype === "X1") return "external";
  if (archetype === "N1" || commitment === "not_purchasable") return "none";
  if (commitment === "quote_approve") return "after_quote";
  if (input.depositEnabled === true) return "deposit_balance";
  if (commitment === "request_accept") return "after_acceptance";
  return "full";
}

/** §15 invariants 3/4: what the projection may and must carry. Derived from the slip effect. */
const SLIP_EFFECT_PROJECTION: Readonly<
  Record<SlipEffect, { allowsTripLevelProjection: boolean; requiresItemLink: boolean }>
> = {
  add_obligation: { allowsTripLevelProjection: false, requiresItemLink: true },
  modify_plan: { allowsTripLevelProjection: true, requiresItemLink: false },
  attach_support: { allowsTripLevelProjection: true, requiresItemLink: false },
  clone_plan: { allowsTripLevelProjection: false, requiresItemLink: false },
  record_external: { allowsTripLevelProjection: true, requiresItemLink: false },
  planning_reference_only: { allowsTripLevelProjection: false, requiresItemLink: false },
};

/**
 * §15 invariant 7: a completed state requires the snapshotted completion rule. A rule a TIMER can
 * fire on its own (ruling 69's `TIMER_DRIVEN_COMPLETION_RULES` shape) needs no evidence beyond the
 * date; every other rule needs somebody to say so.
 */
const COMPLETION_NEEDS_EVIDENCE: Readonly<Record<CompletionRuleAxis, boolean>> = {
  service_date: false,
  checkout_date: false,
  none: false,
  session_end: true,
  artifact_accepted: true,
  seller_declared: true,
  all_components: true,
  plan_delivered: true,
  support_window_end: true,
  external_reported: true,
};

// ─── The resolver ────────────────────────────────────────────────────────────────────────────

/** The non-listing products, whose contracts §9.3 states outright. */
const FIXED_PRODUCTS: Readonly<
  Record<
    "ready_made" | "optimization" | "external_partner" | "information",
    Omit<OfferingCommerceContract, "contractVersion" | "requiredContext">
  >
> = {
  ready_made: {
    sellerClass: "traveloure",
    commerceArchetype: "T1",
    commitmentMode: "instant",
    commitmentModeSource: "listing_declared",
    fulfillmentMode: "plan_clone",
    inventoryAuthority: "none",
    priceAuthority: "listing",
    chargeMode: "full",
    completionRule: "plan_delivered",
    slipEffect: "clone_plan",
    allowsTripLevelProjection: false,
    requiresItemLink: false,
    requiresFulfillmentEvidence: true,
  },
  optimization: {
    sellerClass: "traveloure",
    commerceArchetype: "T2",
    commitmentMode: "instant",
    commitmentModeSource: "listing_declared",
    fulfillmentMode: "plan_modification",
    inventoryAuthority: "none",
    priceAuthority: "listing",
    chargeMode: "traveloure_fee_only",
    completionRule: "plan_delivered",
    slipEffect: "modify_plan",
    allowsTripLevelProjection: true,
    requiresItemLink: false,
    requiresFulfillmentEvidence: true,
  },
  external_partner: {
    sellerClass: "external_partner",
    commerceArchetype: "X1",
    commitmentMode: "external_handoff",
    commitmentModeSource: "listing_declared",
    fulfillmentMode: "external",
    inventoryAuthority: "external_partner",
    priceAuthority: "external_partner",
    chargeMode: "external",
    completionRule: "external_reported",
    slipEffect: "record_external",
    allowsTripLevelProjection: true,
    requiresItemLink: false,
    requiresFulfillmentEvidence: true,
  },
  information: {
    sellerClass: "traveloure",
    commerceArchetype: "N1",
    commitmentMode: "not_purchasable",
    commitmentModeSource: "listing_declared",
    fulfillmentMode: "plan_modification",
    inventoryAuthority: "none",
    priceAuthority: "no_charge",
    chargeMode: "none",
    completionRule: "none",
    slipEffect: "planning_reference_only",
    allowsTripLevelProjection: false,
    requiresItemLink: false,
    requiresFulfillmentEvidence: false,
  },
};

export function resolveOfferingCommerceContract(
  input: OfferingCommerceInput,
): OfferingCommerceResolution {
  if (input.kind !== "listing") {
    const fixed = FIXED_PRODUCTS[input.kind];
    return {
      resolved: true,
      contract: {
        contractVersion: CONTRACT_VERSION,
        ...fixed,
        requiredContext: REQUIRED_CONTEXT[fixed.commerceArchetype],
      },
      findings: [],
    };
  }

  const shape = shapeOf(input);

  // 1 · The second vocabulary (R-7). A `service_type` outside the declared six is not a defect to
  //     correct — real readers depend on those values — but it is not a behavioural discriminator
  //     either, so the row is honestly unclassified rather than forced into an archetype.
  const serviceType = input.serviceType?.trim() || null;
  if (serviceType && !(serviceTypeEnum as readonly string[]).includes(serviceType)) {
    return {
      resolved: false,
      reason: "service_type_outside_declared_vocabulary",
      detail:
        `service_type "${serviceType}" is not one of ${serviceTypeEnum.join(", ")}; that column also ` +
        "carries a category-shaped vocabulary with live readers (punchlist R-7), so the value is left " +
        "alone and the listing is unclassified.",
    };
  }

  // 2 · How it is fulfilled must be knowable at all (§13 — never guessed).
  if (!isClassifiable(shape)) {
    return {
      resolved: false,
      reason: "delivery_shape_unclassifiable",
      detail:
        "the listing states neither a delivery method nor a product shape, so how it is fulfilled is not knowable.",
    };
  }

  // 3 · What it does to a plan comes from `impactClassFor` and from nowhere else. A row neither
  //     catalog recognises has no impact class, and a contract cannot state a slip effect it
  //     cannot derive — so it is unresolvable rather than given a nearest-looking one.
  const impact = impactClassFor({
    offeringTypeKey: input.offeringTypeKey,
    categoryKey: input.categoryKey,
    deliveryMethod: input.deliveryMethod,
  });
  if (!impact) {
    return {
      resolved: false,
      reason: "catalog_keys_unrecognised",
      detail:
        "neither offering catalog recognises this listing's keys, so nothing can say what buying it does to a plan.",
    };
  }

  const archetype = archetypeForListing(input, impact, shape);
  if (!archetype) {
    return {
      resolved: false,
      reason: "archetype_unresolvable",
      detail:
        "no archetype in the master treatment matrix covers this combination of seller class, catalog key and delivery shape.",
    };
  }

  // 4 · §11's activation-time invalid combinations. Both are contradictions between two facts the
  //     listing already carries, not missing facts, so they refuse rather than degrade.
  //
  //     The quote check reads the RESOLVED BOOKING MODE, not the commitment mode the archetype
  //     would produce: P5 maps to `quote_approve` unconditionally, so checking afterwards would
  //     make §11's contradiction unreachable and turn a refusal into a silent correction of the
  //     seller's own answer. An `instant` inherited from the ACCOUNT flag is refused on the same
  //     terms — whoever chose it, the listing as it stands WOULD be committed to instantly, and
  //     that is what contradicts the quote. The refusal names the provenance so the seller is told
  //     which of the two switches to change.
  const booking = resolveBookingModeWithProvenance(input.bookingMode, input.ownerInstantBooking);
  if (booking.mode === "instant" && input.priceType === "custom_quote") {
    return {
      resolved: false,
      reason: "instant_commitment_with_custom_quote",
      detail:
        "a custom-quote listing cannot be committed to instantly — the quote has to exist first. " +
        `The instant mode here is ${booking.provenance}.`,
    };
  }
  if (isArtifactDelivery(shape) && input.hasMeetingPoint === true) {
    return {
      resolved: false,
      reason: "artifact_delivery_with_meeting_point",
      detail: "a downloadable artifact cannot require a physical meeting point.",
    };
  }

  const { mode: commitmentMode, source: commitmentModeSource } = commitmentForListing(
    input,
    archetype,
    booking,
  );

  const findings: ContractFinding[] = [];

  // 5 · THE FUNDAMENTALS WIN, AND THE DISAGREEMENT IS A FINDING (§14 amendment, rule 4).
  const computedFulfillment = fulfillmentFromFundamentals(shape);
  if (!computedFulfillment) {
    return {
      resolved: false,
      reason: "delivery_shape_unclassifiable",
      detail:
        "the delivery method is not one the service fundamentals classify, so the fulfilment mode cannot be stated.",
    };
  }
  const impliedFulfillment = ARCHETYPE_IMPLIED_FULFILLMENT[archetype];
  if (impliedFulfillment && impliedFulfillment !== computedFulfillment) {
    findings.push({
      code: "fulfillment_mode_disagrees_with_archetype",
      archetypeImplies: impliedFulfillment,
      computed: computedFulfillment,
      note:
        `archetype ${archetype} implies ${impliedFulfillment}; the service fundamentals classify ` +
        `delivery method "${shape.deliveryMethod}" as ${computedFulfillment}. The fundamentals win.`,
    });
  }

  const computedCompletion = completionFromFundamentals(shape) ?? "seller_declared";
  const impliedCompletion = ARCHETYPE_IMPLIED_COMPLETION[archetype];
  if (impliedCompletion && impliedCompletion !== computedCompletion) {
    findings.push({
      code: "completion_rule_disagrees_with_archetype",
      archetypeImplies: impliedCompletion,
      computed: computedCompletion,
      note:
        `archetype ${archetype} completes at ${impliedCompletion}; the ruling-63 per-method table ` +
        `gives ${computedCompletion}. The fundamentals win.`,
    });
  }

  const slipEffect = IMPACT_TO_SLIP_EFFECT[impact];
  const projection = SLIP_EFFECT_PROJECTION[slipEffect];

  return {
    resolved: true,
    contract: {
      contractVersion: CONTRACT_VERSION,
      sellerClass: archetype === "X1" ? "external_partner" : input.sellerClass,
      commerceArchetype: archetype,
      commitmentMode,
      commitmentModeSource,
      fulfillmentMode: computedFulfillment,
      inventoryAuthority: inventoryAuthorityFor(archetype, commitmentMode, shape),
      priceAuthority: priceAuthorityFor(input, archetype, commitmentMode),
      chargeMode: chargeModeFor(input, archetype, commitmentMode),
      completionRule: computedCompletion,
      slipEffect,
      requiredContext: REQUIRED_CONTEXT[archetype],
      ...projection,
      requiresFulfillmentEvidence: COMPLETION_NEEDS_EVIDENCE[computedCompletion],
    },
    findings,
  };
}
