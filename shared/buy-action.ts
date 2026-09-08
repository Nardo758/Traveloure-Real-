/**
 * BUY ACTION — the ONE author of a buy button and the landing rule.
 *
 * Lane L23 of the Console & AI Concierge brief (§11.5); ledger `2026-09-07-buy-action-resolver`.
 * Register §A4 (2026-09-07) ratified **ruling 9** — one resolver is the sole author of the buy
 * button and the landing rule; a listing carries no CTA of its own — and **ruling 10** — untimed
 * items render as their own group on the implicit event, never hidden and never given a time
 * (this module only has to make `landing.timed` honest so that group can exist).
 *
 * DERIVED, NEVER STORED, AND PURE. No `db`, no `storage`, no router, no fetch, no clock. The
 * server computes the descriptor once and ships it on the payload; the client renders it and
 * never re-derives — the `optimizer-run-authorization` posture (the predicate decides, the caller
 * obeys), and `resolveBookability` / `impactClassFor` one axis over.
 *
 * IT COMPOSES, IT NEVER RE-DERIVES (§18 rule 1). The three decisions that already exist stay
 * where they are and are CALLED:
 *   • `resolveBookability`  (shared/bookability.ts)        — native / deeplink / info_only
 *   • `resolveContentCTA`   (shared/content-cta.ts)        — the content-type → button map
 *   • the service fundamentals (shared/service-fundamentals.ts) — `needsScheduling`,
 *     `isPlaceAnchored`, `isArtifactDelivery`
 * A second copy of any of them here would be the drift class §18 rule 1 names. What this module
 * adds is exactly the two things those three lack: the listing's BOOKING MODE
 * (`instant | request | hidden`, resolved by `resolveBookingMode` before it reaches here) and the
 * BUYER'S STATE.
 *
 * WHAT IT REFUSES TO KNOW (§11.5, and §14 binds the first): prices and fees (the checkout derives
 * them — this module sees only a `hasPrice` boolean and never a number), the seller's console, the
 * market or the city (the mismatch guard runs after the landing, on the plan), and anything about
 * the AI (the AI proposes onto the plan through its own rail, never through a card).
 *
 * WHAT IT REFUSES TO DO. It computes a DESCRIPTOR and never a side effect: no cart, no fee, no
 * charge, no money path is touched here (register §A3 is still open). A partner row never mints a
 * platform charge at all (LD 43(c), §16) — its landing is the agent rail.
 *
 * DEFERRED, DELIBERATELY ABSENT. Rulings 11 (plan work sold as a listing at checkout) and 12 (a
 * consult never requires a plan) are NOT ratified. Nothing here decides either: a listing whose
 * impact class would need one of those answers takes the ordinary listing rows below, and
 * `impactClassFor` is deliberately not consulted — see the note above `resolveBuyAction`.
 *
 * §13 IS THE LOAD-BEARING HALF. A refusal is a SENTENCE, never a disabled button with no
 * explanation, so `refusal.reason` carries WHY no booking verb is offered. Nothing is invented: no
 * price, no slot, no availability, no seller name. A fact the caller does not know is ABSENT
 * (`undefined`), and an absent fact never resolves to a booking verb — it falls to the last row,
 * which adds to the plan (a claim about nothing) and states what is missing.
 */
import { resolveBookability, type Bookability } from "./bookability";
import { resolveContentCTA, type CtaResolvableItem } from "./content-cta";
import {
  isArtifactDelivery,
  isClassifiable,
  isPlaceAnchored,
  needsScheduling,
  PROVIDER_DECLARED_METHODS,
  type FundamentalsShape,
} from "./service-fundamentals";

// ─── Vocabularies ────────────────────────────────────────────────────────────────────────────

/** The four kinds a buyable row can be (§11.5 Q1). Who SELLS is not one of them. */
export type BuyRowKind = "listing" | "advisor" | "ready_made" | "partner";

/** Per-listing booking affordance — `resolveBookingMode` (shared/schema.ts) resolves the null. */
export type BuyBookingMode = "instant" | "request" | "hidden";

export type BuyActionKind =
  | "add_to_plan"
  | "book"
  | "request_to_book"
  | "plan_with"
  | "buy_ready_made"
  | "agent_rail"
  | "tracked_view"
  | "message"
  | "none";

/** Steps the one sheet walks, IN ORDER. Empty = nothing to ask. */
export type BuyAsk = "sign_in" | "which_plan" | "slot" | "party";

export type BuyLandingStore =
  | "plan"
  | "guest_cart"
  | "checkout"
  | "booking_request"
  | "advisor_request"
  | "clone"
  | "partner_request"
  | "none";

/**
 * WHY no booking verb is offered, or why the primary cannot complete as pressed. Machine-readable
 * so a surface can say it out loud in its own words rather than re-deriving the condition (§13 —
 * a refusal is a sentence, never a greyed-out button).
 */
export type BuyRefusalReason =
  | "not_available" // isLive false, or the provider chose `hidden` — nothing is bookable
  | "sign_in_and_start_a_plan" // an advisor is hired ONTO a plan (LD 32); a guest has neither
  | "booking_affordance_unknown" // the payload could not state a bookingMode
  | "availability_unknown" // instant + scheduled, but the payload could not state availability
  | "no_published_price" // nothing to charge, so never a checkout (§14 — no price is invented)
  | "delivery_method_unstated"; // unclassifiable row (§13) — how it is fulfilled is not knowable

// ─── Inputs ──────────────────────────────────────────────────────────────────────────────────

/**
 * The row half. Every optional field is optional because a real payload may not know it, and an
 * absent fact is a FACT (§13) — never a default. `productShape` is NOT in the brief's input list;
 * it is here because `FundamentalsShape` needs it, and calling the existing fundamentals with the
 * shape they actually take is the whole point of §18 rule 1 (a method-only copy of them would be
 * the second derivation this module exists to avoid).
 */
export interface BuyActionRow {
  kind: BuyRowKind;
  /** One of the canonical 7 (LD 3). Absent ⇒ unclassifiable, never guessed. */
  deliveryMethod?: string | null;
  /** `provider_services.product_shape` — property/property_room/bundle outrank the method. */
  productShape?: string | null;
  /** `instant | request | hidden`, already resolved from the account flag by `resolveBookingMode`. */
  bookingMode?: BuyBookingMode | null;
  bookability: Bookability;
  hasPrice: boolean;
  /** The listing publishes a calendar. Absent = NOT KNOWN by this payload, never "no". */
  hasPublishedAvailability?: boolean | null;
  isLive: boolean;
  /** For "Plan with {name}". Absent ⇒ a generic phrase; a name is never invented. */
  sellerName?: string | null;
  /** LD 40: the earner's public identity. Row 1's Contact needs one; a listing's does not. */
  sellerHandle?: string | null;
  /**
   * The content-type half, for a PARTNER row. `resolveContentCTA` is already declared "the ONLY
   * place the content-type→button mapping lives", so the partner branch DELEGATES to it rather
   * than re-testing `booking_type` here (§18 rule 1). Absent ⇒ the branch falls back to the
   * bookability axis, which is then the only partner fact this module holds.
   */
  content?: CtaResolvableItem;
}

/** The buyer half (§11.5 Q3). */
export interface BuyActionBuyer {
  principal: "guest" | "member";
  plans: "none" | "one" | "many";
  /**
   * The plan chip. CLIENT state — a server payload leaves it unset, which is why a surface that
   * HOLDS a chip calls this same resolver with it rather than authoring its own button (that is
   * calling the one author with a fact the server lacks, not re-deriving the decision).
   */
  chipTripId?: string | null;
  chipPlanIsFinal?: boolean;
}

// ─── Output ──────────────────────────────────────────────────────────────────────────────────

export interface BuyActionButton {
  kind: BuyActionKind;
  label: string;
}

export interface BuyLanding {
  store: BuyLandingStore;
  /** The row gets a start time (a slot) or is flagged "pick a time" — never a default hour. */
  timed: boolean;
  /** The row carries a place. */
  placeAnchored: boolean;
  /** The chip's plan is final and the landing is a plan: the row joins the forked version. */
  forksFinal: boolean;
}

export interface BuyAction {
  primary: BuyActionButton;
  secondary?: BuyActionButton;
  ask: BuyAsk[];
  landing: BuyLanding;
  refusal?: { reason: BuyRefusalReason };
}

// ─── Helpers (the two halves; they never consult each other) ──────────────────────────────────

const MESSAGE: BuyActionButton = { kind: "message", label: "Message" };

/** `sign_in?` — present when the principal is a guest (§11.5's own definition). */
function signInAsk(buyer: BuyActionBuyer): BuyAsk[] {
  return buyer.principal === "guest" ? ["sign_in"] : [];
}

/**
 * `which_plan?` — when `plans` is many and no chip, or `plans` is none (then the only option is
 * New plan). A GUEST is never asked: a guest has no plans and their add lands in the guest cart.
 * `plans: "one"` with no chip is deliberately NOT asked — there is one plan and it is that one.
 */
function whichPlanAsk(buyer: BuyActionBuyer): BuyAsk[] {
  if (buyer.principal !== "member") return [];
  if (buyer.plans === "none") return ["which_plan"];
  if (buyer.plans === "many" && !buyer.chipTripId) return ["which_plan"];
  return [];
}

/** A guest's add lands in the guest cart — the sanctioned fallback until G2 (LD 39). */
function planStore(buyer: BuyActionBuyer): BuyLandingStore {
  return buyer.principal === "guest" ? "guest_cart" : "plan";
}

const NO_LANDING: BuyLanding = { store: "none", timed: false, placeAnchored: false, forksFinal: false };

function shapeOf(row: BuyActionRow): FundamentalsShape {
  return { deliveryMethod: row.deliveryMethod, productShape: row.productShape };
}

/**
 * `forksFinal` is true whenever the landing is a PLAN and the chip's plan is final; the row is
 * added to the forked version and the copy says "Add to the next version".
 */
function landOnPlan(row: BuyActionRow, buyer: BuyActionBuyer): BuyLanding {
  const store = planStore(buyer);
  return {
    store,
    timed: needsScheduling(shapeOf(row)),
    placeAnchored: isPlaceAnchored(shapeOf(row)),
    forksFinal: store === "plan" && Boolean(buyer.chipTripId) && buyer.chipPlanIsFinal === true,
  };
}

/** `async_messaging` / `voice_notes` — the provider declares completion; nothing is scheduled. */
function isProviderDeclared(row: BuyActionRow): boolean {
  return !!row.deliveryMethod && PROVIDER_DECLARED_METHODS.has(row.deliveryMethod);
}

// ─── The decision table ──────────────────────────────────────────────────────────────────────

/**
 * Resolve the buy action for a row and a buyer. FIRST MATCH WINS, in the order §11.5 gives.
 *
 * `impactClassFor` (shared/impact-class.ts) is available and is deliberately NOT consulted: the
 * two classes that would change a landing — `plan_work` (does the checkout sell plan work?) and
 * `consult` (does a consult require a plan?) — are exactly rulings 11 and 12, which register §A4
 * DEFERRED. Reading the class and acting on it would be deciding them here. When they are
 * ratified, this is where they land.
 */
export function resolveBuyAction(row: BuyActionRow, buyer: BuyActionBuyer): BuyAction {
  // ── 1 · Not live, or the provider hid the CTA. No booking verb of any kind. ────────────────
  // §11.5 gives this row no `ask`, so a guest's Contact is left to the message rail's own
  // sign-in gate rather than pre-empted here; the table is followed verbatim.
  if (!row.isLive || row.bookingMode === "hidden") {
    return {
      primary: row.sellerHandle ? { kind: "message", label: "Contact" } : { kind: "none", label: "" },
      ask: [],
      landing: NO_LANDING,
      refusal: { reason: "not_available" },
    };
  }

  // ── Advisor (LD 32: hiring needs a slip; LD 40/42 D22: messaging does not) ─────────────────
  const advisorLabel = `Plan with ${row.sellerName?.trim() || "this expert"}`;

  // 2 · advisor + guest — no principal, so no plan and no hire.
  if (row.kind === "advisor" && buyer.principal === "guest") {
    return {
      primary: { kind: "plan_with", label: advisorLabel },
      ask: ["sign_in"],
      landing: NO_LANDING,
      refusal: { reason: "sign_in_and_start_a_plan" },
    };
  }

  // 3 · advisor + member with no plans — the planner first; the request returns via `returnTo`.
  if (row.kind === "advisor" && buyer.plans === "none") {
    return {
      primary: { kind: "plan_with", label: advisorLabel },
      ask: whichPlanAsk(buyer),
      landing: { store: "advisor_request", timed: false, placeAnchored: false, forksFinal: false },
    };
  }

  // 4 · advisor + member with a chip — the request carries that `tripId`.
  // 5 · advisor + member, no chip — `whichPlanAsk` adds the step for `many` and, per §11.5's own
  //     definition, adds nothing for `one` (there is one plan and it is that one).
  if (row.kind === "advisor") {
    return {
      primary: { kind: "plan_with", label: advisorLabel },
      secondary: MESSAGE,
      ask: whichPlanAsk(buyer),
      landing: { store: "advisor_request", timed: false, placeAnchored: false, forksFinal: false },
    };
  }

  // ── Ready-made (6 guest, 7 member) — the clone lands on a NEW slip, never merged into one. ──
  if (row.kind === "ready_made") {
    return {
      primary: { kind: "buy_ready_made", label: "Get this trip" },
      ask: signInAsk(buyer),
      landing: { store: "clone", timed: false, placeAnchored: false, forksFinal: false },
    };
  }

  // ── Partner (§16, LD 44) — NEVER a platform charge, in either row (LD 43(c)). ──────────────
  if (row.kind === "partner") {
    // §11.5's migration path: "the affiliate and curated branches (rows 8-9) pass through
    // unchanged" — so the content-type decision stays with `resolveContentCTA`, which owns the
    // `booking_type` → button map, and this WRAPS it. Only when the caller holds no content shape
    // does the bookability axis stand in.
    const contentKind = row.content ? resolveContentCTA(row.content).kind : null;
    const informational = contentKind !== null ? contentKind === "tracked_view" : row.bookability === "info_only";
    // 9 · info-only partner content: the TRACKED redirect, and never a booking verb (§16).
    if (informational) {
      return {
        primary: { kind: "tracked_view", label: "View details" },
        ask: [],
        landing: NO_LANDING,
      };
    }
    // 8 · anything else partner-shaped: the agent rail. §11.5 names `deeplink`; a partner row
    // carrying a native signal takes the same rail rather than a platform checkout, because §16
    // prohibits us completing a partner purchase ourselves whichever signal the row carries.
    return {
      primary: { kind: "agent_rail", label: "Request booking" },
      ask: signInAsk(buyer),
      landing: { store: "partner_request", timed: false, placeAnchored: false, forksFinal: false },
    };
  }

  // ── Listing rows (10–13) ───────────────────────────────────────────────────────────────────
  const planAsks: BuyAsk[] = [...signInAsk(buyer), ...whichPlanAsk(buyer)];

  // 10 · info-only listing: nothing to book, but it can still be planned around.
  if (row.bookability === "info_only") {
    return {
      primary: { kind: "add_to_plan", label: "Add to plan" },
      secondary: MESSAGE,
      ask: planAsks,
      landing: landOnPlan(row, buyer),
    };
  }

  const scheduled = needsScheduling(shapeOf(row));
  const artifactOrAsync = isArtifactDelivery(shapeOf(row)) || isProviderDeclared(row);

  // 11 · `request` mode, or `instant` with no published availability, or `instant` with no price
  //      to charge. A `pending` booking on the plan's row — NEVER a charge (§14: the resolver
  //      never invents a price, so a priceless listing can only ever be REQUESTED).
  const requestMode = row.bookingMode === "request";
  const instantNoAvailability =
    row.bookingMode === "instant" && scheduled && row.hasPublishedAvailability === false;
  const instantNoPrice = row.bookingMode === "instant" && !row.hasPrice;
  if (requestMode || instantNoAvailability || instantNoPrice) {
    return {
      primary: { kind: "request_to_book", label: "Request to book" },
      secondary: { kind: "add_to_plan", label: "Add to plan" },
      ask: [...planAsks, "party"],
      landing: {
        store: "booking_request",
        timed: scheduled,
        placeAnchored: isPlaceAnchored(shapeOf(row)),
        forksFinal: false,
      },
      // §13: say WHY this is a request and not a Book, when the reason is a missing fact rather
      // than the provider's own `request` choice.
      refusal: instantNoPrice
        ? { reason: "no_published_price" }
        : instantNoAvailability
          ? { reason: "availability_unknown" }
          : undefined,
    };
  }

  // 12 · instant + scheduled + a published calendar: Book, with the slot picked in the sheet.
  if (row.bookingMode === "instant" && scheduled && row.hasPublishedAvailability === true) {
    return {
      primary: { kind: "book", label: "Book" },
      secondary: { kind: "add_to_plan", label: "Add to plan" },
      ask: [...planAsks, "slot", "party"],
      landing: {
        store: "checkout",
        timed: true,
        placeAnchored: isPlaceAnchored(shapeOf(row)),
        forksFinal: false,
      },
    };
  }

  // 13 · instant + artifact (pdf) or provider-declared (async_messaging / voice_notes): Book,
  //      and the row is UNTIMED — ruling 10 puts it in the plan's "Services without a time"
  //      group on the implicit event, never hidden and never given a time.
  if (row.bookingMode === "instant" && artifactOrAsync) {
    return {
      primary: { kind: "book", label: "Book" },
      secondary: { kind: "add_to_plan", label: "Add to plan" },
      ask: planAsks,
      landing: { store: "checkout", timed: false, placeAnchored: false, forksFinal: false },
    };
  }

  // 14 · §13 FALLBACK — a fact the payload could not state. This is NOT in §11.5's thirteen rows
  //      and is deliberately not a guess at one of them: adding to a plan claims nothing about
  //      how the row is fulfilled, which is exactly right for a row we cannot classify. The
  //      reason is carried so the surface can say it out loud.
  //      Reached by: no bookingMode at all (the payload does not know the affordance); an
  //      `instant` scheduled listing whose availability the payload could not state; and an
  //      unclassifiable row (no delivery method and no product shape).
  return {
    primary: { kind: "add_to_plan", label: "Add to plan" },
    secondary: MESSAGE,
    ask: planAsks,
    landing: landOnPlan(row, buyer),
    refusal: {
      reason: !row.bookingMode
        ? "booking_affordance_unknown"
        : !isClassifiable(shapeOf(row))
          ? "delivery_method_unstated"
          : "availability_unknown",
    },
  };
}

/**
 * The row half for a PLATFORM listing, in one place: a `provider_services` row is bookable
 * in-app, so its bookability comes from `resolveBookability` with the row's own id rather than a
 * hardcoded `"native"` (§18 rule 1 — the existing resolver stays the author of that axis).
 */
export function platformListingBookability(serviceId: string): Bookability {
  return resolveBookability({ providerServiceId: serviceId });
}
