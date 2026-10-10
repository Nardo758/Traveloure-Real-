/**
 * S1-d-2 — live rates on the stay card (ledger `2026-10-10-s1-d2-liteapi-rates`). Test ids carry the
 * `stay-rates-` prefix so the card's other pins (SC5 counts, SC6, CL4) hold.
 *
 *   SRC1 before a tap: only LiteAPI stays get "See rates"; no price, currency or "per night" anywhere
 *   SRC2 after a tap: "Checking rates…" while loading; the three asks and "Rates unavailable right now"
 *        as plain lines — never an error
 *   SRC3 an offer: the server's price and party, the board, pay-at-property lines, children not priced
 *   SRC4 the deadline: local date-time + abbreviation with a plan zone; relative to check-in without one;
 *        never a bare UTC stamp
 *   SRC5 the ranked list draws no rates control (card only in d-2)
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/stay-rates.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import type { StayHotel, WhereToStayView } from "@shared/where-to-stay";
import type { StayRateOffer } from "@shared/liteapi-rates";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";
import { STAY_RATES_DATES_NEEDED, STAY_RATES_PARTY_NEEDED, STAY_RATES_UNAVAILABLE, stayDeadlineLocal, type StayRatesView } from "../../../lib/stay-card";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(React.createElement(AnchorPanelView, { stage: "drafted", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps));
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const hotel = (id: string, name: string, kind: StayHotel["kind"] = "liteapi"): StayHotel => ({ kind, id, name, starRating: 4 });
const free = (hotels: StayHotel[]): WhereToStayView => ({
  eligible: true,
  city: "Kyoto",
  basis: "straight_line",
  hotelsAvailable: true,
  neighborhoods: [{ slug: "gion", name: "Gion", reason: "closest to 3 of your 5 days", hotels, oneLiner: null }],
  stay: { tier: "straight_line", hotels },
});
const offer = (over: Partial<StayRateOffer> = {}): StayRateOffer => ({
  amountCents: 30000,
  currency: "USD",
  boardName: "Breakfast Included",
  refundable: true,
  cancelDeadline: "2027-05-08T03:00:00.000Z",
  payAtProperty: [{ label: "City tax", amountCents: 40000, currency: "JPY" }],
  adults: 2,
  childrenNotPriced: false,
  ...over,
});
const withRates = (rates: Record<string, StayRatesView>) => render({ view: free([hotel("lt1", "Hotel Kanra"), hotel("p1", "Our Inn", "platform")]), stayRates: rates });

describe("stay rates on the card", () => {
  it("SRC1 before a tap: See rates on LiteAPI stays only, no price anywhere", () => {
    const html = render({ view: free([hotel("lt1", "Hotel Kanra"), hotel("p1", "Our Inn", "platform"), hotel("h1", "Cache Inn", "hotel_cache")]) });
    assert.match(html, /data-testid="stay-rates-open-lt1"/);
    assert.doesNotMatch(html, /stay-rates-open-p1|stay-rates-open-h1/);
    assert.doesNotMatch(text(html), /\$|¥|per night|total for/i);
  });

  it("SRC2 loading and the four plain messages", () => {
    assert.match(text(withRates({ lt1: { state: "loading" } })), /Checking rates…/);
    for (const [v, line] of [
      [{ state: "unavailable" }, STAY_RATES_UNAVAILABLE],
      [{ state: "dates_needed" }, STAY_RATES_DATES_NEEDED],
      [{ state: "party_needed" }, STAY_RATES_PARTY_NEEDED],
    ] as const) {
      const html = withRates({ lt1: v as StayRatesView });
      assert.match(html, /data-testid="stay-rates-message-lt1"/);
      assert.match(text(html), new RegExp(line));
      assert.doesNotMatch(text(html), /\$/);
    }
  });

  it("SRC3 an offer: price, party, board, pay at property, children", () => {
    const html = withRates({ lt1: { state: "ok", offer: offer({ childrenNotPriced: true }), checkin: "2027-05-10", timezone: null } });
    const t = text(html);
    assert.match(html, /data-testid="stay-rates-price-lt1"/);
    assert.match(t, /\$300\.00 total for 2 adults/);
    assert.match(t, /Breakfast Included/);
    assert.match(t, /Plus ¥400 payable at the property \(City tax\)/);
    assert.match(t, /Children are not included in this price/);
    assert.doesNotMatch(t, /per night/i);
  });

  it("SRC4 the deadline: local with a zone, relative without, never bare UTC", () => {
    const local = text(withRates({ lt1: { state: "ok", offer: offer(), checkin: "2027-05-10", timezone: "Asia/Tokyo" } }));
    assert.match(local, /Free cancellation until May 8, 12:00 (JST|GMT\+9)/);
    assert.equal(stayDeadlineLocal("2027-05-08T03:00:00.000Z", "Asia/Tokyo")?.startsWith("May 8, 12:00"), true);
    const rel = text(withRates({ lt1: { state: "ok", offer: offer(), checkin: "2027-05-10", timezone: null } }));
    assert.match(rel, /Free cancellation until 2 days before check-in/);
    assert.doesNotMatch(rel, /UTC|GMT|03:00/);
  });

  it("SRC5 the ranked list draws no rates control", () => {
    const html = render({ view: { ...free([hotel("lt9", "Ranked Lite")]), stay: undefined } as WhereToStayView });
    assert.match(html, /where-to-stay-hotel-liteapi-lt9/);
    assert.doesNotMatch(html, /stay-rates-/);
  });
});
