/**
 * CAP-2 Phase 1 (ledger `2026-11-05-cap2-plan-item-ref`) — the client half of the PlanItemRef contract.
 *
 *   P1  the ONE card mapping (`planItemRefFromFeedItem`): each kind, a listing by providerServiceId, Viator and a
 *       recommendation category name no row (null), a chosen day only when given.
 *   P2  a day-filtered feed's day becomes the chosen day only inside a plan's dates (`guestChosenDay`).
 *   P3  the signed-in add dialog sends the card's ref and says the approved sentence on a refusal; the browse save
 *       hook sends the city and the feed's day; the map's Browse add sends a ref and no coordinate.
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/cap2-phase1.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAN_ITEM_KINDS, dayNumberForDate, planItemRefFromFeedItem } from "@shared/plan-item-ref";
import { guestChosenDay } from "../waitlist-guest-plan";
import { browseAddBody } from "../browse-supply";

const read = (p: string) => readFileSync(p, "utf8");

describe("CAP-2 Phase 1 (client)", () => {
  it("P1 one mapping from a card to its PlanItemRef", () => {
    assert.deepEqual([...PLAN_ITEM_KINDS], ["gem", "event", "city_event", "listing", "affiliate_product", "hotel", "activity"]);
    for (const type of ["gem", "event", "city_event", "hotel", "activity", "affiliate_product"]) {
      assert.deepEqual(planItemRefFromFeedItem({ type, sourceContentId: "x1" }, "Kyoto"), { kind: type, source_id: "x1", city: "Kyoto" });
    }
    assert.equal(planItemRefFromFeedItem({ type: "service", sourceContentId: "s1" }, "Kyoto")?.kind, "listing");
    assert.deepEqual(planItemRefFromFeedItem({ type: "activity", providerServiceId: "p1" }, "Kyoto", 3), { kind: "listing", source_id: "p1", city: "Kyoto", placement: { day_number: 3 } });
    assert.equal(planItemRefFromFeedItem({ type: "activity", viatorProductCode: "V1" }, "Kyoto"), null, "Viator is not a kind");
    assert.equal(planItemRefFromFeedItem({ type: "recommendation" }, "Kyoto"), null);
    assert.equal(planItemRefFromFeedItem({ type: "gem", sourceContentId: "g" }, ""), null, "no city ⇒ nothing");
  });

  it("P2 a feed's day is the chosen day only inside the plan's dates", () => {
    assert.equal(dayNumberForDate("2026-12-11", "2026-12-10"), 2);
    assert.equal(guestChosenDay("2026-12-12", "2026-12-10", "2026-12-12"), 3);
    assert.equal(guestChosenDay("2026-12-13", "2026-12-10", "2026-12-12"), null, "after the plan ⇒ Day 1");
    assert.equal(guestChosenDay("2026-12-09", "2026-12-10", "2026-12-12"), null, "before the plan ⇒ Day 1");
  });

  it("P3 the callers send a ref, never a coordinate", () => {
    const dialog = read("client/src/components/add-to-experience-dialog.tsx");
    assert.match(dialog, /const ref = planItemRefFromFeedItem\(item,/);
    assert.match(dialog, /\.\.\.\(ref \? \{ ref \} : \{\}\),/);
    // R4b-1: the approved sentence stays the fallback; only the dated out-of-dates refusal names its day.
    assert.match(dialog, /toast\(\{ title: planSaveRefusalMessage\(err\) \?\? GUEST_PLAN_COPY\.saveFailed, variant: "destructive" \}\);/);
    const save = read("client/src/lib/browse-save.ts");
    // Cut-list #1 slice C: the ref is built the same way and the write is the one add runner over saveToGuestPlan.
    assert.match(save, /const ref = city \? guestItemFromFeedItem\(item as any, city\) : null;/);
    assert.match(save, /void runGuestAdd\(job\)/);
    assert.match(read("client/src/lib/plan-add-runner.ts"), /saveToGuestPlan\(job\.ref, job\.city, job\.chosenDate\)/);
    const body = browseAddBody({ id: "g1", kind: "gem", name: "Garden", lat: 35, lng: 135.7 } as any, 2, "Kyoto, Japan") as any;
    assert.deepEqual(body.ref, { kind: "gem", source_id: "g1", city: "Kyoto", placement: { day_number: 2 } });
    assert.ok(!("latitude" in body) && !("longitude" in body));
    assert.match(read("client/src/components/plancard/MapControlCenter.tsx"), /browseAddBody\(place, dayNumber \?\? 1, tripDestination\)/);
  });
});
