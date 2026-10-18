/**
 * VD-1 (ledger `2026-10-18-viator-direct-live`) — the client half of the live Viator row.
 *
 *   K1 only an `ok` answer draws cards; a price is shown only with its as-of time; no review text
 *   K2 a link is drawn only when Viator gave an https one
 *   K3 an add from a live source (Viator) carries no partner price and no partner description
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { viatorLiveCards, VIATOR_ATTRIBUTION_LINE } from "../browse-supply";
import { PARTNER_NETWORKS, partnerAddFields } from "../partner-source";

const ITEM = { id: "viator-K1", productCode: "K1", title: "Gion night walk", price: 45, currency: "USD", rating: 4.8, reviewCount: 120, productUrl: "https://www.viator.com/tours/x?campaign=traveloure_browse" };

test("K1 only ok draws cards; price only with its as-of time", () => {
  assert.deepEqual(viatorLiveCards({ status: "disabled", items: [ITEM] }), []);
  assert.deepEqual(viatorLiveCards({ status: "error", items: [] }), []);
  assert.deepEqual(viatorLiveCards(null), []);
  const [c] = viatorLiveCards({ status: "ok", asOf: "2026-10-18T06:00:00Z", items: [ITEM] }, "en-GB");
  assert.match(c.priceLine!, /^From USD 45 · price as of \d{2}:\d{2}$/);
  assert.equal(c.ratingLine, "4.8 rating · 120 reviews on Viator");
  const [noTime] = viatorLiveCards({ status: "ok", asOf: null, items: [ITEM] });
  assert.equal(noTime.priceLine, null, "no read time ⇒ no price");
  assert.equal(VIATOR_ATTRIBUTION_LINE, "From Viator");
});

test("K2 a link only when Viator gave an https one", () => {
  const [a, b] = viatorLiveCards({ status: "ok", asOf: "2026-10-18T06:00:00Z", items: [ITEM, { ...ITEM, productCode: "K2", productUrl: "http://x" }] });
  assert.equal(a.url, ITEM.productUrl);
  assert.equal(b.url, null);
});

test("K3 an add from Viator stores no partner price or description", () => {
  const viator = PARTNER_NETWORKS.find((n) => n.key === "viator")!;
  assert.equal(viator.live, true);
  assert.equal(viator.path, "/api/viator/live/products");
  assert.deepEqual(partnerAddFields(viator, { description: "Viator text", price: 45 }), { description: "Partner: Viator" });
  const tiqets = PARTNER_NETWORKS.find((n) => n.key === "tiqets")!;
  assert.deepEqual(partnerAddFields(tiqets, { description: "d", price: 10 }), { description: "Partner: Tiqets — d", estimatedCost: "10" });
  assert.ok(!PARTNER_NETWORKS.some((n) => n.key === "viator-feed"), "the retired feed is not a source");
});
