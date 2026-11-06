/**
 * CAP-2 Phase 2 (ledger `2026-11-05-cap2-phase2-cards`) — cards emit their own PlanItemRef.
 *
 *   Q1  an event card's add payload carries its own start and end (`eventPlacementHints`) and the mapping puts them in
 *       the placement (events and city events only).
 *   Q2  "Plan around it": the guest plan replays the city event as an item after the plan is made.
 *   Q3  a Viator result offers no "Add to plan" on the map; its partner link stays (More info).
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/cap2-phase2.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventPlacementHints, planItemRefFromFeedItem } from "@shared/plan-item-ref";

const read = (p: string) => readFileSync(p, "utf8");

describe("CAP-2 Phase 2 (client)", () => {
  it("Q1 an event's start and end ride as placement hints", () => {
    const fever = { id: "e1", dates: { startDate: "2026-12-11T09:00:00Z", endDate: "2026-12-11T12:00:00Z" } };
    assert.deepEqual(eventPlacementHints(fever), { startsAt: "2026-12-11T09:00:00Z", endsAt: "2026-12-11T12:00:00Z" });
    assert.deepEqual(eventPlacementHints({ id: "e2" }), {}, "no dates ⇒ nothing");
    assert.deepEqual(eventPlacementHints({ dates: { startDate: "not a date" } }), {});
    const ref = planItemRefFromFeedItem({ type: "event", sourceContentId: "e1", ...eventPlacementHints(fever) }, "Kyoto", 2);
    assert.deepEqual(ref, { kind: "event", source_id: "e1", city: "Kyoto", placement: { day_number: 2, starts_at: "2026-12-11T09:00:00Z", ends_at: "2026-12-11T12:00:00Z" } });
    // Only an event carries times.
    assert.deepEqual(planItemRefFromFeedItem({ type: "gem", sourceContentId: "g1", startsAt: "2026-12-11T09:00:00Z" }, "Kyoto"), { kind: "gem", source_id: "g1", city: "Kyoto" });
    const card = read("client/src/components/city-feed-card.tsx");
    // CAP-2 Phase 3 (sanctioned edit): the three event adds share ONE payload builder (`eventAddPayload`), read by
    // PlanActions on the compact card, the full card and the drawer.
    // R4-1 (round 4, sanctioned edit): a partner event's hints ride as before; a city event's row is re-read by the
    // resolver, so it sends none.
    assert.equal((card.match(/\.\.\.\(isCityEvent \? \{\} : eventPlacementHints\(event\)\),/g) ?? []).length, 1, "the one event add payload");
    assert.equal((card.match(/onAdd\?\.\(eventAddPayload\(\)\)|onAdd\(eventAddPayload\(\)\)/g) ?? []).length, 3, "all three event adds read it");
  });

  it("Q2 Plan around it lands the city event on the guest plan", () => {
    const page = read("client/src/pages/guest-plan-map.tsx");
    assert.match(page, /\{ kind: "city_event" as const, source_id: record\.source\.eventSourceId, city: destination\.split\(","\)\[0\]\.trim\(\) \}/);
    assert.match(page, /await saveToGuestPlan\(aroundEvent, destination\)/);
    const routes = read("server/routes.ts");
    assert.match(routes, /await landRefOnNewPlan\(trip as any, \{ kind: "city_event", source_id: mintEntry\.eventSourceId,/);
  });

  it("Q3 a Viator result offers no Add to plan; its partner link stays", () => {
    const mcc = read("client/src/components/plancard/MapControlCenter.tsx");
    assert.doesNotMatch(mcc, /map-browse-viator-add-/);
    assert.doesNotMatch(mcc, /viatorAddBody/);
    assert.match(mcc, /data-testid="map-browse-viator-link"/);
    // The catalogue never had one: a Viator result is a book-on-site link only.
    assert.match(read("server/services/catalogue-search.service.ts"), /kind: "partner_viator" as const,[\s\S]{0,200}action: \{ type: "book_on_site" as const/);
  });
});
