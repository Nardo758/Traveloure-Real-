/**
 * THE REORDER ROUTE'S BODY RULE (Leon, Nov 20, 2026): only this plan's stops on the day sent.
 *
 *   B1-B4  the pure rule (`shared/itinerary-reorder.ts`)
 *   W1     the route applies it AFTER authorization and BEFORE either write (the owner's reorder and the
 *          advisor's filed suggestion), from the plan's own rows
 *   W2     the service never writes an id that is not this plan's stop on that day
 *
 * The refusal over HTTP, against a real second user's stop, is held in
 * `mutation-auth/mutation-auth.http.test.ts`. Pure + static source pins here: no DB, no server.
 * Run: npx tsx --test server/__tests__/reorder-body-rule.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REORDER_BODY_ERROR, REORDER_MAX_ITEMS, reorderDayNumber, reorderRefused } from "@shared/itinerary-reorder";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const day = ["a", "b", "c"];

describe("the reorder body rule", () => {
  it("B1 accepts the day's own stops, in any order, whole or partial", () => {
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: ["c", "a", "b"], dayItemIds: day }), false);
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: ["b"], dayItemIds: day }), false);
    assert.equal(reorderRefused({ dayNumber: "2", itemIds: [], dayItemIds: day }), false);
  });

  it("B2 refuses an id that is not one of the day's stops - another plan's, or another day's", () => {
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: ["a", "foreign"], dayItemIds: day }), true);
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: ["a"], dayItemIds: [] }), true);
  });

  it("B3 refuses a repeated id, a non-string id, a non-list and a list over the bound", () => {
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: ["a", "a"], dayItemIds: day }), true);
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: ["a", 7], dayItemIds: day }), true);
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: "a", dayItemIds: day }), true);
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: undefined, dayItemIds: day }), true);
    const many = Array.from({ length: REORDER_MAX_ITEMS + 1 }, (_, i) => `s${i}`);
    assert.equal(reorderRefused({ dayNumber: 1, itemIds: many, dayItemIds: many }), true);
  });

  it("B4 refuses a body with no integer day", () => {
    for (const bad of [undefined, null, "", " ", "two", 1.5, {}, []]) {
      assert.equal(reorderDayNumber(bad), null, JSON.stringify(bad));
      assert.equal(reorderRefused({ dayNumber: bad, itemIds: ["a"], dayItemIds: day }), true);
    }
    assert.equal(reorderDayNumber("3"), 3);
    assert.equal(reorderDayNumber(0), 0);
  });
});

describe("where the rule is applied", () => {
  const routes = read("server/routes.ts");
  const start = routes.indexOf('app.post("/api/trips/:tripId/itinerary/reorder"');
  const handler = routes.slice(start, routes.indexOf('app.post("/api/trips/:tripId/itinerary/optimize-order"'));

  it("W1 the route refuses after authorization and before both writes, from the plan's own rows", () => {
    assert.ok(start > 0, "the reorder handler is present");
    const auth = handler.indexOf("authorizeTripLogistics(");
    const rule = handler.indexOf("reorderRefused(");
    const suggestion = handler.indexOf("fileExpertSuggestion({");
    const write = handler.indexOf("itineraryIntelligenceService.reorderItems(");
    assert.ok(auth > 0 && rule > auth, "authorization is asked first");
    assert.ok(suggestion > rule, "the advisor's suggestion is filed only after the rule");
    assert.ok(write > rule, "the owner's reorder is written only after the rule");
    assert.match(handler, /storage\.getItineraryItems\(req\.params\.tripId\)\)\.filter\(\(i\) => i\.dayNumber === dayNumber\)/);
    assert.match(handler, /return res\.status\(400\)\.json\(\{ message: REORDER_BODY_ERROR \}\);/);
    assert.equal(REORDER_BODY_ERROR, "Send a day and its stops in order");
  });

  it("W2 the service writes only this plan's stops on that day", () => {
    const service = read("server/services/itinerary-intelligence.service.ts");
    const body = service.slice(service.indexOf("async reorderItems("), service.indexOf("export const itineraryIntelligenceService"));
    assert.match(body, /and\(eq\(itineraryItems\.tripId, tripId\), eq\(itineraryItems\.dayNumber, dayNumber\)\)/);
    assert.match(body, /if \(!onDay\.has\(itemIds\[i\]\)\) continue;/);
  });
});
