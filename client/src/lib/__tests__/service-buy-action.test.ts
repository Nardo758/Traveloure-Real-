/**
 * service-buy-action.test.ts — the service-detail page renders the SHIPPED buy action.
 *
 * Punchlist V-13; ledger `2026-09-13-service-detail-buy-action`. Ruling 9 (register §A4, lane L23)
 * makes `resolveBuyAction` the sole author of the buy button and the landing rule. The page drew
 * three FIXED CTAs for every archetype instead, although `GET /api/services/:id` already shipped
 * the resolver's answer — so the two wrong buttons V-13 records were observed in a browser: a
 * custom-quote listing offered "Book on Traveloure"/"Add to Cart" (both refused by the server) and
 * an `instant` listing with no published calendar offered "Book" where row 11 rules a REQUEST.
 *
 * THE INPUTS HERE ARE THE REAL RESOLVER'S OUTPUT, NOT HAND-WRITTEN DESCRIPTORS. Every case drives
 * `resolveBuyAction` with the row shape the archetype fixtures actually carry and feeds its answer
 * to the mapper — so a change to the decision table shows up here as a changed button rather than
 * as a test that still passes against a stale fixture (§18 rule 1).
 *
 *   V1        the unchanged case — priced, `instant`, published calendar ⇒ Book + Add, no refusal
 *   V2        P5, the custom-quote fixture (`price` NULL, `request`) ⇒ NO Book, NO checkout verb
 *   V3        P1 with no published calendar ⇒ the REQUEST verb and `availability_unknown`
 *   V4        `instant` with no price ⇒ the REQUEST verb and `no_published_price`
 *   V5        a `hidden` listing ⇒ no buy control at all, `not_available`, the message rail named
 *   V6        §13 — an ABSENT descriptor yields no control and says so, never the old fixed buttons
 *   V7        the ask steps: performed ones rendered in order, unperformed ones DECLARED
 *   V8        every refusal reason has a distinct, non-empty sentence
 *   V9        a kind this page cannot render is named, not drawn as silence
 *   V10-V12   V-20 (ledger `2026-09-14-direct-booking-panel-conditioned`): the Direct-Booking
 *             trust panel's payment claim follows the descriptor's landing store, so a REQUEST
 *             listing makes no payment claim and the two adjacent contradictory sentences
 *             production QA found on 2026-09-13 cannot both render
 *   S1-S4     the shipped page: it calls the mapper, authors no buy verb, holds no copy of the
 *             payment claim, and the three OTHER `ld23-buy-action-gap` authors are untouched
 *             (file-SET scan, comments stripped)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveBuyAction,
  type BuyActionBuyer,
  type BuyActionRow,
  type BuyRefusalReason,
} from "@shared/buy-action";
import {
  BUY_ACTION_NOT_STATED_SENTENCE,
  BUY_ACTION_UNRENDERABLE_SENTENCE,
  BUY_REFUSAL_SENTENCE,
  DIRECT_BOOKING_PANEL_CLAIM,
  DIRECT_BOOKING_PANEL_HEADING,
  PROVIDER_DETAILS_PANEL_HEADING,
  SERVICE_DETAIL_ASK_LABEL,
  serviceDetailBuyRender,
  serviceDetailTrustPanel,
} from "../service-buy-action";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = join(HERE, "..", "..");
const readClient = (rel: string) => readFileSync(join(CLIENT_SRC, rel), "utf8");

/** Comments are prose; an ABSENCE pin has to read the CODE, so the prose is removed first. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeClient = (rel: string) => stripComments(readClient(rel));

const GUEST: BuyActionBuyer = { principal: "guest", plans: "none" };
/** Same buyer as `GUEST`, named where the point of the case is that they hold no plan. */
const GUEST_NO_PLANS: BuyActionBuyer = GUEST;
const MEMBER: BuyActionBuyer = { principal: "member", plans: "one" };

/** `archetype-fixture-p1`'s shape: in-person, priced, `instant`, with a published calendar. */
function p1(over: Partial<BuyActionRow> = {}): BuyActionRow {
  return {
    kind: "listing",
    bookability: "native",
    deliveryMethod: "in_person",
    productShape: null,
    bookingMode: "instant",
    hasPrice: true,
    hasPublishedAvailability: true,
    isLive: true,
    ...over,
  };
}

/** `archetype-fixture-p5`: custom quote — `price` NULL, and therefore `request`, never `instant`. */
const P5: BuyActionRow = p1({ bookingMode: "request", hasPrice: false, hasPublishedAvailability: false });

const render = (row: BuyActionRow, buyer: BuyActionBuyer = MEMBER) =>
  serviceDetailBuyRender(resolveBuyAction(row, buyer));

describe("service detail — the buy controls are the resolver's", () => {
  it("V1 a priced, instant listing with a published calendar keeps Book + Add, and no refusal", () => {
    const r = render(p1());
    assert.equal(r.book?.kind, "book");
    assert.equal(r.book?.label, "Book");
    assert.equal(r.add?.kind, "add_to_plan");
    assert.equal(r.add?.label, "Add to plan");
    assert.equal(r.request, null);
    assert.equal(r.refusal, null);
    assert.equal(r.noBuyControl, false);
    // The label is the descriptor's, so the page's old literal is gone from the rendered output.
    assert.notEqual(r.book?.label, "Book on Traveloure");
  });

  it("V2 the custom-quote fixture offers NO Book and NO add-to-cart verb of its own", () => {
    for (const buyer of [GUEST, MEMBER]) {
      const r = render(P5, buyer);
      assert.equal(r.book, null, "a priceless listing must never offer a Book");
      assert.equal(r.request?.kind, "request_to_book");
      assert.equal(r.request?.label, "Request to book");
      // Row 11 still keeps the plan add as its secondary — but it is the RESOLVER's label, and it
      // is never the checkout verb the page used to draw beside it.
      assert.equal(r.add?.label, "Add to plan");
      assert.equal(r.noBuyControl, false);
    }
  });

  it("V3 an instant listing with no published availability shows the REQUEST verb, with the reason", () => {
    const r = render(p1({ hasPublishedAvailability: false }));
    assert.equal(r.book, null);
    assert.equal(r.request?.label, "Request to book");
    assert.equal(r.refusal, BUY_REFUSAL_SENTENCE.availability_unknown);
    assert.match(r.refusal!, /no upcoming availability/);
  });

  it("V4 an instant listing with no price shows the REQUEST verb and says the price is unpublished", () => {
    const r = render(p1({ hasPrice: false }));
    assert.equal(r.book, null);
    assert.equal(r.request?.label, "Request to book");
    assert.equal(r.refusal, BUY_REFUSAL_SENTENCE.no_published_price);
    assert.match(r.refusal!, /publishes no price/);
  });

  it("V5 a hidden listing draws no buy control at all, says why, and names the message rail", () => {
    const r = render(p1({ bookingMode: "hidden", sellerHandle: "kyoto-guide" }));
    assert.equal(r.book, null);
    assert.equal(r.add, null);
    assert.equal(r.request, null);
    assert.equal(r.noBuyControl, true);
    assert.equal(r.namesMessage, true);
    assert.equal(r.refusal, BUY_REFUSAL_SENTENCE.not_available);
  });

  it("V6 §13 — an absent descriptor is NOT a bookable one", () => {
    for (const absent of [undefined, null]) {
      const r = serviceDetailBuyRender(absent);
      assert.equal(r.noBuyControl, true);
      assert.equal(r.book, null);
      assert.equal(r.add, null);
      assert.equal(r.request, null);
      assert.equal(r.refusal, BUY_ACTION_NOT_STATED_SENTENCE);
    }
  });

  it("V7 ask steps: the ones this page performs render in order; the rest are declared, not dropped", () => {
    // Row 12 for a GUEST asks sign_in → slot → party. The page performs the first two.
    const r = render(p1(), GUEST);
    assert.deepEqual(
      r.asks.map((a) => a.step),
      ["sign_in", "slot"],
    );
    assert.deepEqual(
      r.asks.map((a) => a.label),
      ["Sign in", "Pick a time"],
    );
    assert.deepEqual(r.unaskedSteps, ["party"]);
    // The two with no surface here are declared `null` WITH their reason in the module, so a lane
    // that builds either step flips one entry rather than discovering the gap by clicking.
    assert.equal(SERVICE_DETAIL_ASK_LABEL.which_plan, null);
    assert.equal(SERVICE_DETAIL_ASK_LABEL.party, null);
    // A member with several plans and no chip is asked which_plan — which this page never asks.
    const many = render(p1(), { principal: "member", plans: "many" });
    assert.ok(many.unaskedSteps.includes("which_plan"));
    assert.ok(!many.asks.some((a) => a.step === "which_plan"));
  });

  it("V8 every refusal reason the resolver can return has its own sentence", () => {
    const reasons: BuyRefusalReason[] = [
      "not_available",
      "sign_in_and_start_a_plan",
      "booking_affordance_unknown",
      "availability_unknown",
      "no_published_price",
      "delivery_method_unstated",
    ];
    // The map is typed `Record<BuyRefusalReason, string>`, so a reason ADDED to the union fails to
    // compile in the module; this asserts the reverse direction — none of them is blank, and no
    // two reasons share one sentence (which would make two different facts read identically, §13).
    assert.deepEqual(Object.keys(BUY_REFUSAL_SENTENCE).sort(), [...reasons].sort());
    const sentences = reasons.map((r) => BUY_REFUSAL_SENTENCE[r]);
    for (const s of sentences) assert.ok(s.trim().length > 20, `empty or stub sentence: ${s}`);
    assert.equal(new Set(sentences).size, sentences.length);
  });

  it("V9 a kind this page has no control for is NAMED, never drawn as an empty sidebar", () => {
    // Reached by a descriptor this page's own payload cannot produce (its rows are always
    // `listing`) — an advisor row. The mapper must not silently render nothing.
    const advisor = resolveBuyAction(
      { kind: "advisor", bookability: "native", hasPrice: true, isLive: true, sellerName: "Aya" },
      MEMBER,
    );
    const r = serviceDetailBuyRender(advisor);
    assert.equal(r.noBuyControl, true);
    assert.deepEqual(r.unrenderedKinds, ["plan_with"]);
    assert.equal(r.refusal, BUY_ACTION_UNRENDERABLE_SENTENCE);
  });

  // ── V-20: the trust panel's payment claim ───────────────────────────────────────────────────
  // Production QA (2026-09-13) read two adjacent sentences on `/services/:id`: the request note
  // "Nothing is booked and nothing is charged here", and directly beneath it "Payment is processed
  // securely through Traveloure" — the second rendered unconditionally and never reading the
  // resolved action. Every one of production's 67 listings takes the request branch, so the claim
  // was false on all of them. These three pin that the claim now follows the descriptor.

  it("V10 a REQUEST listing makes no payment claim, and does not contradict its own request note", () => {
    for (const row of [P5, p1({ hasPublishedAvailability: false }), p1({ hasPrice: false })]) {
      const r = render(row);
      assert.equal(r.request?.kind, "request_to_book", "fixture must take the request branch");
      assert.equal(r.platformCharge, false);
      const panel = serviceDetailTrustPanel(r);
      assert.equal(panel.claim, null, "a request listing must claim no payment");
      assert.equal(panel.heading, PROVIDER_DETAILS_PANEL_HEADING);
      // §13: the honest branch OMITS the claim — it does not soften it into a second, different
      // assertion about how the provider takes money.
      assert.doesNotMatch(panel.heading, /payment|pay|charge|secure/i);
    }
  });

  it("V11 a listing that really does land on the platform checkout keeps the claim", () => {
    // Row 12 (instant + scheduled + published calendar) and row 13 (instant + pdf) are the only
    // two the resolver lands on `checkout`, and they are exactly the two whose primary is `book`.
    for (const row of [p1(), p1({ deliveryMethod: "pdf", hasPublishedAvailability: null })]) {
      const r = render(row);
      assert.equal(r.book?.kind, "book", "fixture must take a Book branch");
      assert.equal(r.platformCharge, true);
      const panel = serviceDetailTrustPanel(r);
      assert.equal(panel.heading, DIRECT_BOOKING_PANEL_HEADING);
      assert.equal(panel.claim, DIRECT_BOOKING_PANEL_CLAIM);
      assert.match(panel.claim!, /Payment is processed securely/);
    }
  });

  it("V12 §13 — a hidden, an add-only and an ABSENT descriptor all claim no payment", () => {
    // `hidden` (row 1) lands nowhere; `info_only` (row 10) and the fallback (row 14) land on a
    // plan or the guest cart, which is not a charge on this page either; an absent descriptor is
    // NOT STATED, which is never a charge.
    const cases = [
      render(p1({ bookingMode: "hidden" })),
      render(p1({ bookability: "info_only" })),
      render(p1({ bookingMode: null })),
      render(p1(), GUEST_NO_PLANS),
      serviceDetailBuyRender(undefined),
    ];
    for (const r of cases) {
      const panel = serviceDetailTrustPanel(r);
      if (r.platformCharge) {
        // A guest's Book still lands on `checkout`; it is the ADD that lands in the guest cart.
        assert.equal(panel.claim, DIRECT_BOOKING_PANEL_CLAIM);
      } else {
        assert.equal(panel.claim, null);
        assert.equal(panel.heading, PROVIDER_DETAILS_PANEL_HEADING);
      }
    }
    assert.equal(serviceDetailBuyRender(undefined).platformCharge, false);
  });
});

describe("service detail — the shipped page authors no buy verb", () => {
  const PAGE = "pages/service-detail.tsx";

  it("S1 the page maps the shipped descriptor through the one mapper", () => {
    const src = codeClient(PAGE);
    assert.ok(src.includes("serviceDetailBuyRender"), "the page must render the shipped buyAction");
    assert.ok(src.includes("service.buyAction"), "the descriptor must come off the payload");
  });

  it("S2 no buy verb is authored in the page any more", () => {
    const src = codeClient(PAGE);
    // The three literals V-13 recorded, plus the helper that used to author the add label.
    for (const literal of ["Book on Traveloure", "addLabel("]) {
      assert.ok(!src.includes(literal), `the page still authors its own buy label: ${literal}`);
    }
    // Every rendered buy label reads off the descriptor.
    for (const bound of ["buy.book.label", "buy.add.label", "buy.request.label"]) {
      assert.ok(src.includes(bound), `missing descriptor-sourced label: ${bound}`);
    }
  });

  it("S3 the three OTHER recorded buy-button authors still carry their gap markers", () => {
    // FILE SET, comments INTACT — the marker IS a comment. This lane deliberately left all three
    // alone (each has its own recorded reason), so their markers must still be there; and the page
    // this lane fixed must no longer be a candidate for one.
    const gapFiles = [
      "components/OfferingCard.tsx",
      "lib/catalog-preview-presentation.ts",
      "pages/storefront.tsx",
    ];
    for (const f of gapFiles) {
      assert.ok(readClient(f).includes("ld23-buy-action-gap"), `${f} lost its recorded gap marker`);
    }
    assert.ok(
      !readClient(PAGE).includes("ld23-buy-action-gap"),
      "the service detail page is no longer a buy-button author and needs no gap marker",
    );
  });

  it("S4 the page holds no copy of the payment claim and renders the panel through the decider", () => {
    const src = codeClient(PAGE);
    // The claim now lives in `@/lib/service-buy-action` and reaches the page only through
    // `serviceDetailTrustPanel`, so the page CANNOT render it unguarded. A literal left behind
    // here would be a second author of the same sentence (§18 rule 1) and the exact shape of the
    // defect V-20 records.
    for (const literal of ["Payment is processed securely", "Direct Booking"]) {
      assert.ok(!src.includes(literal), `the page still authors the trust panel copy: ${literal}`);
    }
    assert.ok(src.includes("serviceDetailTrustPanel"), "the panel copy must come from the decider");
    assert.ok(src.includes("trustPanel.claim"), "the claim must render only when the decider gives one");
    assert.ok(src.includes("buy.platformCharge"), "the panel must read the descriptor's landing");
    // And the panel keeps its addressable container.
    assert.ok(readClient(PAGE).includes('data-testid="section-direct-booking"'));
  });
});
