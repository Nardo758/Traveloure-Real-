/**
 * ONE CORRECTLY-AUTHORED LISTING PER AUTHORABLE ARCHETYPE — the executable answer to
 * "what must a seller get right for this to sell as what it is?"
 *
 * Ledger `2026-09-12-archetype-fixtures`. Reads the §9 master treatment matrix of
 * `docs/superpowers/specs/2026-09-08-offering-commerce-trip-slip-contract-design.md`.
 *
 * SCOPE — THE THIRTEEN THAT ARE `provider_services` ROWS A SELLER AUTHORS. E1/E2/E3/E4/E6 (expert-
 * owned) and P1–P8 (provider-owned). **T1 (ready-made), T2 (optimizer), X1 (affiliate) and N1
 * (unpriced content) are NOT listings** — they are `ready_made_trips`, a Traveloure fee, partner
 * inventory and information respectively, and `resolveOfferingCommerceContract` answers each of
 * them from a FIXED contract with no listing input at all (`FIXED_PRODUCTS`). There is nothing for
 * a seller to author and no `provider_services` row to create, so they are out of scope here and
 * nothing below pretends otherwise. **E5 is deliberately absent from the resolver's archetype
 * union** (§9.1: "`specialized` is not itself a checkout archetype") and is not reintroduced.
 *
 * MINIMAL MEANS LOAD-BEARING. Each fixture names only the columns that CHANGE an axis:
 * `service_type` (must be inside the declared six or the listing is refused), `delivery_method`
 * and `product_shape` (the service fundamentals — fulfilment and completion), `price_type`
 * (price authority, and P5), `booking_mode` (commitment and its provenance), `deposit_enabled`
 * (charge mode), `meeting_point` (§11's artifact contradiction) and the category key the offering
 * catalogs are read by. Nothing decorative: a photo, a description, a radius or a language moves
 * no axis and is not here.
 *
 * WHAT `expect` DOES NOT RESTATE (§18 rule 1). `requiredContext`, `allowsTripLevelProjection`,
 * `requiresItemLink` and `requiresFulfillmentEvidence` are DERIVED inside the resolver from the
 * archetype, the slip effect and the completion rule by three maps the pure suite
 * (`offering-commerce-contract.test.ts`) already pins. Copying them here would be a second
 * statement of the same decision, drifting the day one of those maps moves.
 *
 * THE FINDING THIS MODULE MADE, AND THE RULING THAT CLOSED IT. When these fixtures landed,
 * `provider_services` had NO expert offering key: `expert_offering_types` was reachable only from
 * `local_expert_forms.offering_type_key` — the expert's ACCOUNT-level role, which the OC-A4 gate
 * deliberately refuses to file their listings under (§13: it is a claim the row does not make) —
 * so `loadOfferingListingInput` could never populate that field from a listing, and E2/E3/E4/E6
 * resolved `catalog_keys_unrecognised` off a real row. That is warn-not-block, so those listings
 * published live and bookable with the refusal recorded in their OC-B1 contract snapshot and the
 * seller never told (punchlist V-12). Four of the thirteen fixtures asserted the break.
 * **Migration 292 (ledger `2026-09-12-listing-names-its-expert-offering`) gives the LISTING its
 * own key** — `provider_services.expert_offering_type_key`, the third FK of migration 107's shape
 * — so `offeringTypeKey` below is now a REAL COLUMN on the row each fixture creates, written from
 * the same field the pure input uses, and all thirteen walk the whole rail. `listingRow` survives
 * as the record of that: it is where a future break would be asserted rather than hidden.
 *
 * NEGATIVE SPACE (§18d). These are the facts a CONTRACT reads. A fixture says nothing about
 * whether the listing is discoverable, priced sensibly, has availability, or would pass any other
 * publish gate (attestation, F2 approval, verification) — only that its commerce contract resolves
 * to the archetype it is named for and that OC-A4 lets it go live.
 */
import type {
  ChargeMode,
  CommerceArchetype,
  CommitmentMode,
  CommitmentModeSource,
  CompletionRuleAxis,
  ContractFinding,
  FulfillmentMode,
  InventoryAuthority,
  OfferingListingInput,
  PriceAuthority,
  SlipEffect,
  UnresolvableReason,
} from "../services/offering-commerce-contract";

/** The thirteen §9 archetypes that are a `provider_services` row someone authored. */
export type AuthorableArchetype = Extract<
  CommerceArchetype,
  "E1" | "E2" | "E3" | "E4" | "E6" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8"
>;

/**
 * The §9 ids this module deliberately does NOT cover, with the reason each one is not a listing.
 * Exported so the suite can assert the split is exactly the resolver's own archetype union minus
 * these — a hand-kept list of thirteen would drift the day a fourteenth archetype is ratified.
 */
export const NON_LISTING_ARCHETYPES: Readonly<Record<string, string>> = {
  T1: "a `ready_made_trips` purchase — no provider_services row, no seller-authored listing input",
  T2: "a Traveloure optimization fee — a platform product, not a seller's offering",
  X1: "partner inventory — the partner charges the traveler and we mint no PaymentIntent (LD 43(c), §16)",
  N1: "a gem / neighbourhood / unpriced recommendation — saved, never bought",
};

/** The `provider_services` columns a seller authors that move a commerce axis. */
export interface ArchetypeFixtureRow {
  serviceType: string;
  deliveryMethod: string | null;
  productShape?: string | null;
  priceType: string;
  bookingMode: string | null;
  depositEnabled?: boolean;
  meetingPoint?: string | null;
  /** `provider_services.price`. NULL is the honest state for a custom quote (see P5). */
  price: string | null;
  /** `service_categories.category_key` the row's `category_id` must point at. */
  categoryKey: string | null;
}

/** The axes the fixture must produce. Derived booleans are NOT restated — see the header. */
export interface ArchetypeFixtureExpectation {
  commitmentMode: CommitmentMode;
  commitmentModeSource: CommitmentModeSource;
  fulfillmentMode: FulfillmentMode;
  inventoryAuthority: InventoryAuthority;
  priceAuthority: PriceAuthority;
  chargeMode: ChargeMode;
  completionRule: CompletionRuleAxis;
  slipEffect: SlipEffect;
  /** §14-amendment rule 4 disagreements this fixture is EXPECTED to raise. Usually none. */
  findings: readonly ContractFinding["code"][];
}

/** What the SAME listing resolves to when it is read back off a real `provider_services` row. */
export type ListingRowOutcome =
  | { reachable: true }
  | { reachable: false; reason: UnresolvableReason; note: string };

export interface ArchetypeFixture {
  archetype: AuthorableArchetype;
  /** What the seller is selling, in the matrix's own words. */
  sells: string;
  ownerRole: "expert" | "provider";
  row: ArchetypeFixtureRow;
  /**
   * `expert_offering_types.offering_type_key` — and, since migration 292, the value written to
   * `provider_services.expert_offering_type_key` on the row this fixture creates. ONE field, used
   * by both `contractInputFor` (the pure input) and the listing create, so the fixture's claim
   * "correctly authored" and the row's own content cannot drift apart.
   * NULL for every provider archetype: a provider listing states a `service_categories.category_key`
   * and never a blended vocabulary (§4).
   */
  offeringTypeKey: string | null;
  expect: ArchetypeFixtureExpectation;
  listingRow: ListingRowOutcome;
  /**
   * Whether the generic checkout spine may sell this. §9.2 rules P5 out by name: "do not send this
   * through generic checkout until that rail exists" (register D-8). The suite proves the refusal
   * rather than assuming it — and as of punchlist V-11 (ledger `2026-09-12-booking-birth-holes`)
   * the refusal is REAL: `POST /api/bookings` consults the one price predicate before deriving an
   * amount, so a priceless listing is refused instead of committed at `0.00`.
   */
  genericCheckout: "bookable" | "refused_by_ruling";
}

export const ARCHETYPE_FIXTURES: readonly ArchetypeFixture[] = [
  // ── Expert-led (§9.1) ───────────────────────────────────────────────────────────────────────
  {
    archetype: "E1",
    sells: "an advisory session — AMA, reality check, second opinion",
    ownerRole: "expert",
    // THE ONE ARCHETYPE A LISTING ROW COULD REACH BEFORE MIGRATION 292 — and it reached it by
    // accident rather than by expression: `custom_other` is the "Something else / not listed"
    // catch-all, and `impactClassFor`'s rule 3 gives a non-place-anchored catch-all row `consult`.
    // The seller did not say "advisory session"; the catch-all rule said it for them. The row now
    // carries `ask_me_anything` in its own column and reaches E1 BY EXPRESSION, through rule 2 —
    // the same answer, now for the seller's own stated reason. The category key STAYS: it is what
    // the catch-all route looked like, and N2 below still proves what that route does to an E6.
    row: {
      serviceType: "consultation",
      deliveryMethod: "video",
      priceType: "fixed",
      bookingMode: "request",
      price: "120.00",
      categoryKey: "custom_other",
    },
    offeringTypeKey: "ask_me_anything",
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "live_remote",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "session_end",
      slipEffect: "attach_support",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "E2",
    sells: "a planning artifact — a full itinerary, a perfect day, an accessibility plan",
    ownerRole: "expert",
    row: {
      serviceType: "planning",
      deliveryMethod: "pdf",
      priceType: "fixed",
      bookingMode: "request",
      price: "350.00",
      // DELIBERATELY NULL: §4 — experts are NOT a `service_category`, so no category key expresses
      // "full itinerary". Filing it under a provider discipline would merge the two catalogs.
      categoryKey: null,
    },
    offeringTypeKey: "full_itinerary",
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "async_artifact",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "artifact_accepted",
      slipEffect: "modify_plan",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "E3",
    sells: "a coordination engagement — wedding planning, vendor wrangling, group coordination",
    ownerRole: "expert",
    row: {
      serviceType: "concierge",
      deliveryMethod: "async_messaging",
      priceType: "fixed",
      bookingMode: "request",
      price: "1200.00",
      categoryKey: null,
    },
    offeringTypeKey: "wedding_planner",
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "async_messaging",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "seller_declared",
      slipEffect: "attach_support",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "E4",
    sells: "a live support window — text a local, same-day rescue, trip emergency",
    ownerRole: "expert",
    row: {
      serviceType: "concierge",
      deliveryMethod: "async_messaging",
      priceType: "fixed",
      bookingMode: "request",
      price: "80.00",
      categoryKey: null,
    },
    offeringTypeKey: "text_a_local",
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "async_messaging",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      // §9.1 says E4 completes at support-window end; ruling 63's per-method table gives
      // `provider_declared` for async_messaging. THE FUNDAMENTALS WIN and the disagreement is a
      // FINDING (§14 amendment, rule 4) — not an override, and not a fixture bug.
      completionRule: "seller_declared",
      slipEffect: "attach_support",
      findings: ["completion_rule_disagrees_with_archetype"],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "E6",
    sells: "an expert physical action — personal shopping, location scouting",
    ownerRole: "expert",
    row: {
      serviceType: "action",
      deliveryMethod: "in_person",
      priceType: "fixed",
      bookingMode: "request",
      meetingPoint: "Nishiki Market, north entrance",
      price: "200.00",
      categoryKey: null,
    },
    offeringTypeKey: "personal_shopper",
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "in_person",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "service_date",
      slipEffect: "attach_support",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },

  // ── Native provider (§9.2) ──────────────────────────────────────────────────────────────────
  {
    archetype: "P1",
    sells: "a scheduled place service — a tour, a photography session, a dining experience",
    ownerRole: "provider",
    row: {
      serviceType: "experience",
      deliveryMethod: "in_person",
      priceType: "fixed",
      // The one fixture that declares `instant`, so the native-slot inventory authority is
      // exercised at least once: `instant` plus a scheduled shape is the only route to it.
      bookingMode: "instant",
      meetingPoint: "Fushimi Inari, main torii",
      price: "90.00",
      categoryKey: "tour_guide",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "instant",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "in_person",
      inventoryAuthority: "native_slot",
      priceAuthority: "listing",
      chargeMode: "full",
      completionRule: "service_date",
      slipEffect: "add_obligation",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "P2",
    sells: "a live remote service — a video consultation, a live translation call",
    ownerRole: "provider",
    row: {
      serviceType: "consultation",
      deliveryMethod: "video",
      priceType: "fixed",
      bookingMode: "request",
      price: "60.00",
      categoryKey: "concierge_vip",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "live_remote",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "session_end",
      slipEffect: "add_obligation",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "P3",
    sells: "an asynchronous artifact — a PDF guide, a research brief, edited media",
    ownerRole: "provider",
    // NO `meetingPoint`: §11's second invalid combination is `pdf` + a mandatory physical meeting
    // point, and OC-A4 BLOCKS on it. Its absence here is the authoring rule, not an omission.
    row: {
      serviceType: "planning",
      deliveryMethod: "pdf",
      priceType: "fixed",
      bookingMode: "request",
      price: "45.00",
      categoryKey: "photography",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "async_artifact",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "artifact_accepted",
      slipEffect: "add_obligation",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "P4",
    sells: "an asynchronous messaging service — ongoing chat advice, async translation",
    ownerRole: "provider",
    row: {
      serviceType: "concierge",
      deliveryMethod: "async_messaging",
      priceType: "fixed",
      bookingMode: "request",
      price: "150.00",
      categoryKey: "concierge_vip",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "async_messaging",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      // Same §14-amendment rule 4 disagreement as E4, from the other side of the marketplace.
      completionRule: "seller_declared",
      slipEffect: "add_obligation",
      findings: ["completion_rule_disagrees_with_archetype"],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "P5",
    sells: "a custom-quote service — a complex event vendor, bespoke production work",
    ownerRole: "provider",
    row: {
      serviceType: "action",
      deliveryMethod: "in_person",
      priceType: "custom_quote",
      // MUST NOT be `instant`: §11's first invalid combination is `instant` + `custom_quote`, and
      // OC-A4 BLOCKS on it — a quote has to exist before anything can be committed to instantly.
      bookingMode: "request",
      meetingPoint: "Kyoto International Conference Centre, dock 2",
      // NULL is the HONEST state for a custom quote: the price is not the listing's to state
      // (`priceAuthority: server_quote`). It is also what makes the generic checkout unsafe — see
      // `genericCheckout` below and the suite's P5 negative.
      price: null,
      categoryKey: "av_tech",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "quote_approve",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "in_person",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "server_quote",
      chargeMode: "after_quote",
      completionRule: "service_date",
      slipEffect: "add_obligation",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "refused_by_ruling",
  },
  {
    archetype: "P6",
    sells: "a stay — a hotel, a villa, a room",
    ownerRole: "provider",
    row: {
      serviceType: "experience",
      // A stay's delivery method is meaningless (the fundamentals classify it by `product_shape`),
      // but the column DEFAULTS to `pdf`, and `pdf` plus a meeting point is §11's artifact
      // contradiction. Declaring `in_person` keeps the row honest and out of that trap.
      deliveryMethod: "in_person",
      productShape: "property",
      priceType: "fixed",
      bookingMode: "request",
      price: "240.00",
      categoryKey: "accommodation",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "reserve_then_pay",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "stay",
      inventoryAuthority: "property_inventory",
      priceAuthority: "property_rate",
      // `deposit_enabled` is off, so the whole amount is due at commitment. §9.2's "reserve then
      // pay" names the COMMITMENT shape, not a second charge mode — the resolver keeps them apart.
      chargeMode: "full",
      completionRule: "checkout_date",
      slipEffect: "add_obligation",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "P7",
    sells: "a bundle — a multi-service experience or package",
    ownerRole: "provider",
    row: {
      serviceType: "experience",
      deliveryMethod: "in_person",
      productShape: "bundle",
      priceType: "fixed",
      bookingMode: "request",
      price: "400.00",
      categoryKey: "tour_guide",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "bundle",
      inventoryAuthority: "component_inventory",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "all_components",
      slipEffect: "add_obligation",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
  {
    archetype: "P8",
    sells: "native transport — a chauffeur, a transfer, a driver service",
    ownerRole: "provider",
    row: {
      serviceType: "action",
      deliveryMethod: "in_person",
      priceType: "fixed",
      bookingMode: "request",
      meetingPoint: "Kansai International Airport, Terminal 1 arrivals",
      price: "130.00",
      // THE ONE COLUMN THAT MAKES THIS P8 AND NOT P1: `archetypeForListing` reads the category key
      // by name. A transfer filed under any other discipline is a scheduled place service.
      categoryKey: "private_transportation",
    },
    offeringTypeKey: null,
    expect: {
      commitmentMode: "request_accept",
      commitmentModeSource: "listing_declared",
      fulfillmentMode: "in_person",
      inventoryAuthority: "seller_acceptance",
      priceAuthority: "listing",
      chargeMode: "after_acceptance",
      completionRule: "service_date",
      slipEffect: "add_obligation",
      findings: [],
    },
    listingRow: { reachable: true },
    genericCheckout: "bookable",
  },
];

/**
 * The fixture as `resolveOfferingCommerceContract` reads it when EVERY fact is available —
 * including the expert offering key no listing row can carry. This is the "correctly authored"
 * claim: the fixture resolves to its archetype when nothing is missing.
 */
export function contractInputFor(fx: ArchetypeFixture): OfferingListingInput {
  return {
    kind: "listing",
    sellerClass: fx.ownerRole,
    serviceType: fx.row.serviceType,
    deliveryMethod: fx.row.deliveryMethod,
    productShape: fx.row.productShape ?? null,
    priceType: fx.row.priceType,
    bookingMode: fx.row.bookingMode,
    // The fixture owner has no `service_provider_forms` row, so no account flag is known. UNCOERCED
    // (§13): `undefined` is "nobody answered", a different fact from an explicit `false`.
    ownerInstantBooking: undefined,
    categoryKey: fx.row.categoryKey,
    offeringTypeKey: fx.offeringTypeKey,
    depositEnabled: fx.row.depositEnabled ?? false,
    hasMeetingPoint: !!(fx.row.meetingPoint ?? "").trim(),
  };
}

/** The `OfferingListingOverrides` shape the two `/api/provider/services` rails hand the gate. */
export function activationOverridesFor(
  fx: ArchetypeFixture,
  categoryId: string | null,
): {
  serviceType: string;
  deliveryMethod: string | null;
  productShape: string | null;
  priceType: string;
  bookingMode: string | null;
  categoryId: string | null;
  depositEnabled: boolean;
  meetingPoint: string | null;
  expertOfferingTypeKey: string | null;
} {
  return {
    // Migration 292: the create rail hands the gate the offering the seller just named, so the
    // gate judges the contract the listing will actually have.
    expertOfferingTypeKey: fx.offeringTypeKey,
    serviceType: fx.row.serviceType,
    deliveryMethod: fx.row.deliveryMethod,
    productShape: fx.row.productShape ?? null,
    priceType: fx.row.priceType,
    bookingMode: fx.row.bookingMode,
    categoryId,
    depositEnabled: fx.row.depositEnabled ?? false,
    meetingPoint: fx.row.meetingPoint ?? null,
  };
}

/** Every distinct `service_categories.category_key` the fixtures need resolved to an id. */
export function fixtureCategoryKeys(): string[] {
  return Array.from(
    new Set(ARCHETYPE_FIXTURES.map((f) => f.row.categoryKey).filter((k): k is string => !!k)),
  ).sort();
}

/**
 * THE ONE OWNER MARKER, so seeded fixture rows form a SINGLE-OWNER CLUSTER —
 * `scripts/audit-offering-classification.ts` already reports the largest single-owner cluster
 * separately from the remainder (plan §0 constraint 2), so one owner is all the tagging that
 * discount needs. The visible name prefix is for a human reading the catalog, never for a machine.
 */
export const ARCHETYPE_FIXTURE_OWNER_ID = "archetype-fixture-owner";
export const ARCHETYPE_FIXTURE_NAME_PREFIX = "[archetype-fixture]";
export const archetypeFixtureServiceId = (archetype: AuthorableArchetype): string =>
  `archetype-fixture-${archetype.toLowerCase()}`;
