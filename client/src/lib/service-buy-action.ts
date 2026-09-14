/**
 * SERVICE DETAIL — RENDERING THE SHIPPED BUY ACTION.
 *
 * Punchlist V-13; ledger `2026-09-13-service-detail-buy-action`. Ruling 9 (register §A4, lane L23)
 * makes `resolveBuyAction` (`shared/buy-action.ts`) the SOLE author of the buy button and the
 * landing rule — a listing carries no CTA of its own — and `GET /api/services/:id` has shipped
 * that answer as `buyAction` since lane L23. `client/src/pages/service-detail.tsx` nevertheless
 * drew the SAME three fixed CTAs for every archetype and never read the field, so a custom-quote
 * listing (`price` NULL) was offered "Book on Traveloure" and "Add to Cart" — both of which the
 * server refuses (`2026-09-12-booking-birth-holes`, `2026-09-13-cart-priceless-gap`) — and an
 * `instant` listing with no published calendar was offered "Book" where row 11 rules it a REQUEST.
 *
 * THIS MODULE DECIDES NOTHING ABOUT WHICH ACTION APPLIES. That decision is the resolver's, taken
 * on the server and shipped whole. All this does is MAP a resolved descriptor onto the concrete
 * controls this one page has, so the page itself carries no `switch` over the resolver's
 * vocabulary and no label of its own. A second opinion about which verb to show is the
 * derivation-drift class §18 rule 1 names, and it is how the page came to promise purchases the
 * server refuses.
 *
 * PURE — no React, no DOM, no fetch, no clock. Every import is `import type`, so nothing from
 * `shared/` is pulled into the client bundle at runtime by this file.
 *
 * §13 IS THE LOAD-BEARING HALF, in three places:
 *   · A REFUSAL IS A SENTENCE. `BUY_REFUSAL_SENTENCE` is keyed on the resolver's OWN
 *     `BuyRefusalReason` union — so a rename there fails to compile here rather than leaving a
 *     stale string behind — and the page prints it instead of greying out a button. A disabled
 *     "Book" that the server would refuse is still a promise.
 *   · AN ABSENT DESCRIPTOR IS NOT A BOOKABLE ONE. `buyAction` undefined means the payload did not
 *     state a buy action; the answer is NO buy control and a sentence saying so, never a fallback
 *     to the page's old fixed buttons (that fallback IS the defect).
 *   · AN ASK WITH NO SURFACE IS NOT PROMISED. The resolver names four steps; this page performs
 *     two of them. The other two are declared below as `null` with the reason, and reported on
 *     `unaskedSteps` rather than dropped silently, so the omission is a stated fact and a lane
 *     that builds the step has one entry to flip.
 *   · A PAYMENT CLAIM IS NOT MADE WHERE NO PAYMENT HAPPENS. Ledger
 *     `2026-09-14-direct-booking-panel-conditioned`, punchlist V-20: the page's Direct-Booking
 *     trust panel asserted "Payment is processed securely through Traveloure" UNCONDITIONALLY,
 *     directly beneath the request note that says nothing is charged — two adjacent contradictory
 *     sentences on every request listing, which is all 67 of production's. `platformCharge` and
 *     `serviceDetailTrustPanel` below put that claim behind the descriptor's own landing store,
 *     and the non-charge branch makes NO payment claim at all rather than a softer one (a third
 *     claim about how a provider takes money is one nobody here is in a position to make).
 *
 * NEGATIVE SPACE (§18d). It maps a descriptor to controls; it never fetches one, never builds one,
 * and never decides whether a control is ENABLED — vacation mode (`away`) and a room's stay
 * availability are page-level facts the descriptor does not hold (`buildListingBuyActions` is
 * called with `isLive: true` for every approved+active listing), and the page keeps its own
 * disabling for both. It says nothing about the three OTHER recorded `ld23-buy-action-gap`
 * authors (`OfferingCard`, the storefront card, the catalog preview), which are out of this lane.
 */
import type {
  BuyAction,
  BuyActionButton,
  BuyActionKind,
  BuyAsk,
  BuyRefusalReason,
} from "@shared/buy-action";

/**
 * The page's own words for each of the resolver's refusal reasons.
 *
 * NOT A SECOND AUTHOR OF THE RULE. The rule is the `reason` the resolver already decided; this is
 * the surface saying it out loud, which is exactly what §13 asks a surface to do. It is
 * deliberately separate from `PRICELESS_LISTING_REFUSAL.message`
 * (`server/services/buy-action-payload.ts`): that one is the BODY of an HTTP refusal for a rail a
 * caller already committed to, this one is pre-emptive copy for a traveler who has pressed
 * nothing. They cannot drift on WHICH condition they describe, because both key on the same
 * `BuyRefusalReason` union.
 */
export const BUY_REFUSAL_SENTENCE: Record<BuyRefusalReason, string> = {
  not_available:
    "This listing is not open for booking right now. You can still message the provider about it.",
  // Advisor-only (resolver rows 2/3). Unreachable from this page, whose payload always describes a
  // `listing` row — carried because the union carries it, never because the page can show it.
  sign_in_and_start_a_plan:
    "Sign in and start a plan first — an expert joins a plan rather than being booked on their own.",
  booking_affordance_unknown:
    "This listing does not say how it takes bookings, so no booking option is offered here. Message the provider to ask.",
  availability_unknown:
    "This listing publishes no upcoming availability, so it is booked by request rather than instantly.",
  no_published_price:
    "This listing publishes no price, so it cannot be checked out here. It is requested and quoted before anything is committed.",
  delivery_method_unstated:
    "This listing does not state how it is delivered, so no booking option is offered here. Message the provider to ask.",
};

/** The payload carried no descriptor at all — a fact, and not a licence to guess a button (§13). */
export const BUY_ACTION_NOT_STATED_SENTENCE =
  "Booking options could not be loaded for this listing. Nothing is offered here rather than a guess.";

/** A resolved action this page has no control for — said out loud rather than drawn as silence. */
export const BUY_ACTION_UNRENDERABLE_SENTENCE =
  "This listing's booking option is not one this page can offer. Message the provider to ask about it.";

/**
 * WHICH OF THE RESOLVER'S ASK STEPS THIS PAGE ACTUALLY PERFORMS.
 *
 * `null` = there is NO surface for it here, so it is never printed as something the traveler
 * "will be asked" — promising a question nobody asks is the same class of §13 lie as a button the
 * server refuses. The entries and their reasons:
 *   · `sign_in`    — REAL. `beginAdd` opens the sign-in modal before any write.
 *   · `which_plan` — NONE. The target plan is resolved from the URL / TripContext
 *                    (`resolveTargetTripId`); the page never asks which plan. The "Which event?"
 *                    dialog is a different question (migration 277) on an already-chosen plan.
 *   · `slot`       — REAL. The Availability card picks one (`selectedSlot`).
 *   · `party`      — NONE. The page renders party SIZE as a "Good to know" fact and has no step
 *                    that asks for one. Building it flips this entry.
 */
export const SERVICE_DETAIL_ASK_LABEL: Record<BuyAsk, string | null> = {
  sign_in: "Sign in",
  which_plan: null,
  slot: "Pick a time",
  party: null,
};

/** One ask step this page performs, in the order the resolver listed it. */
export interface RenderedAsk {
  step: BuyAsk;
  label: string;
}

export interface ServiceDetailBuyRender {
  /**
   * The control that adds and moves on — the page's existing `button-book-now`. Present only when
   * the resolver named `book`; its LABEL is the resolver's, never the page's.
   */
  book: BuyActionButton | null;
  /** The control that adds and stays — the page's existing `button-add-to-cart`. */
  add: BuyActionButton | null;
  /**
   * The by-request control. It is NOT an add: the resolver lands row 11 on `booking_request`, so
   * this control opens the provider conversation rail and writes nothing to a plan or a cart.
   */
  request: BuyActionButton | null;
  /**
   * The descriptor named the message rail in `primary` or `secondary`. The page renders that with
   * its EXISTING Contact control rather than a second message button — Contact is the LD 40
   * contact rail, not a buy button, and ruling 9 does not author it.
   */
  namesMessage: boolean;
  /** The §13 sentence for this state, or `null` when there is nothing to explain. */
  refusal: string | null;
  /** Ask steps this page performs, in the resolver's order. */
  asks: RenderedAsk[];
  /** Ask steps the descriptor named that this page does NOT perform — declared, not dropped. */
  unaskedSteps: BuyAsk[];
  /** Resolved kinds this page has no control for (never reachable for a `listing` row). */
  unrenderedKinds: BuyActionKind[];
  /** True when no buy control renders at all. */
  noBuyControl: boolean;
  /**
   * THIS ACTION PUTS A PLATFORM CHARGE IN ITS PATH — read off the descriptor's OWN money
   * statement, `landing.store === "checkout"`, and never re-derived from `bookingMode` or a price
   * on the page (§18 rule 1; a second "is this instant?" test is exactly the drift this whole
   * module exists to stop). It is coincident with the `book` control today by the resolver's own
   * table — rows 12 and 13 are the only ones that land on `checkout`, and they are the only ones
   * whose primary is `book` — but the LANDING is what the trust panel's sentence is about, so the
   * landing is what it reads. An absent descriptor yields `false`: NOT STATED is never a charge.
   */
  platformCharge: boolean;
}

const EMPTY: Omit<ServiceDetailBuyRender, "refusal"> = {
  book: null,
  add: null,
  request: null,
  namesMessage: false,
  asks: [],
  unaskedSteps: [],
  unrenderedKinds: [],
  noBuyControl: true,
  platformCharge: false,
};

/**
 * Map a shipped `buyAction` onto this page's controls.
 *
 * FIRST-MATCH-WINS IS THE RESOLVER'S JOB, NOT THIS ONE. Both slots are read and placed by KIND, so
 * a row whose secondary is `add_to_plan` (rows 11/12/13) and a row whose primary is `add_to_plan`
 * (rows 10/14) both put that button in the same place with the same label — which is what stops
 * the page having an opinion about slot order.
 */
export function serviceDetailBuyRender(action: BuyAction | undefined | null): ServiceDetailBuyRender {
  if (!action) return { ...EMPTY, refusal: BUY_ACTION_NOT_STATED_SENTENCE };

  let book: BuyActionButton | null = null;
  let add: BuyActionButton | null = null;
  let request: BuyActionButton | null = null;
  let namesMessage = false;
  const unrenderedKinds: BuyActionKind[] = [];

  for (const button of [action.primary, action.secondary]) {
    if (!button) continue;
    switch (button.kind) {
      case "book":
        book = button;
        break;
      case "add_to_plan":
        add = button;
        break;
      case "request_to_book":
        request = button;
        break;
      case "message":
        namesMessage = true;
        break;
      case "none":
        // The resolver's explicit "no button" — an answer, not an omission. Nothing renders.
        break;
      default:
        // `plan_with` / `buy_ready_made` / `agent_rail` / `tracked_view` belong to the advisor,
        // ready-made and partner rows. This page's payload always describes a `listing`, so none of
        // them is reachable here — recorded rather than silently dropped, so the day one arrives it
        // is a visible sentence and not a blank sidebar.
        unrenderedKinds.push(button.kind);
        break;
    }
  }

  const asks: RenderedAsk[] = [];
  const unaskedSteps: BuyAsk[] = [];
  for (const step of action.ask) {
    const label = SERVICE_DETAIL_ASK_LABEL[step];
    if (label) asks.push({ step, label });
    else unaskedSteps.push(step);
  }

  const noBuyControl = !book && !add && !request;
  const refusal = action.refusal
    ? BUY_REFUSAL_SENTENCE[action.refusal.reason]
    : noBuyControl && unrenderedKinds.length > 0
      ? BUY_ACTION_UNRENDERABLE_SENTENCE
      : null;

  return {
    book,
    add,
    request,
    namesMessage,
    refusal,
    asks,
    unaskedSteps,
    unrenderedKinds,
    noBuyControl,
    platformCharge: action.landing.store === "checkout",
  };
}

// ─── The trust panel's heading and its one claim ──────────────────────────────────────────────

/** The panel's words when the action really does land on a platform checkout. */
export const DIRECT_BOOKING_PANEL_HEADING = "Direct Booking";
export const DIRECT_BOOKING_PANEL_CLAIM =
  "You're booking directly with the provider. Payment is processed securely through Traveloure.";

/**
 * The panel's heading when it makes no payment claim. It names only what the panel then still
 * carries — the provider's verification lines, the meeting point, the pickup address, the
 * transport signal — all of which are true of a request listing as much as a bookable one.
 */
export const PROVIDER_DETAILS_PANEL_HEADING = "Provider details";

export interface ServiceDetailTrustPanel {
  heading: string;
  /**
   * The platform-payment sentence, or `null` when this action mints no platform charge. §13: the
   * non-charge branch omits the claim, it does NOT replace it with a gentler one — what a provider
   * does about money outside our checkout is not a fact this page holds.
   */
  claim: string | null;
}

/**
 * Decide the trust panel's heading and whether it may state the payment claim.
 *
 * ONE DECISION, TAKEN HERE. The page renders the result and holds neither the condition nor the
 * copy, so the panel cannot drift back into asserting a charge on a listing the resolver routes to
 * a conversation. It reads `platformCharge` and nothing else — no price, no `bookingMode`, no
 * product shape.
 */
export function serviceDetailTrustPanel(
  render: Pick<ServiceDetailBuyRender, "platformCharge">,
): ServiceDetailTrustPanel {
  return render.platformCharge
    ? { heading: DIRECT_BOOKING_PANEL_HEADING, claim: DIRECT_BOOKING_PANEL_CLAIM }
    : { heading: PROVIDER_DETAILS_PANEL_HEADING, claim: null };
}
