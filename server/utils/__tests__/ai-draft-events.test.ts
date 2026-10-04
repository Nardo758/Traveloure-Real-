/**
 * Smoke 9 S9-8 (extends R-w; ledger `2026-10-04-smoke9-addendum`) — the STORAGE pass reduces an
 * uncovered event title on the rows AND in the stored draft JSON, by the same rule.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCanonicalItems, sanitizeGeneratedPlan } from "../ai-draft-sanitize";
import { SUPPLY_SLOT_EVENT_TITLE } from "@shared/ai-place-text";

const item = (title: string, location = "Higashiyama Ward, Kyoto", description = "") => ({
  dayNumber: 2,
  title,
  name: title,
  description,
  type: "attraction",
  time: "10:00",
  durationMinutes: 90,
  estimatedCost: null,
  location,
});

test("D1 the stored-fixture title reduces to its fallback; its event sentence goes with it", () => {
  const [row] = sanitizeCanonicalItems(
    [item("Gion Matsuri Festival grounds or Gion walking tour", "Gion, Higashiyama Ward, Kyoto", "The Gion Matsuri festival fills these streets. Old teahouses line Hanamikoji.")],
    { noLodging: false, city: "Kyoto, Japan" },
  );
  assert.equal(row.title, "Gion walking tour");
  assert.equal(row.name, "Gion walking tour");
  assert.equal(row.description, "Old teahouses line Hanamikoji.");
  assert.notEqual(row.location, "", "a fallback stop keeps its area");
});

test("D2 no fallback ⇒ a supply slot: no event name, no place, no prose", () => {
  const [row] = sanitizeCanonicalItems([item("Jidai Matsuri Festival Parade", "Kyoto Imperial Palace, Kamigyo Ward", "A costume parade.")], { noLodging: false, city: "Kyoto" });
  assert.equal(row.title, SUPPLY_SLOT_EVENT_TITLE);
  assert.equal(row.location, "");
  assert.equal(row.description, "");
});

test("D3 a covering event keeps the title; the stored draft JSON is reduced by the same rule", () => {
  const covered = sanitizeCanonicalItems([item("Gion Matsuri Festival grounds or Gion walking tour")], { noLodging: false, coveringEvents: [{ name: "Gion Matsuri" }] });
  assert.equal(covered[0].title, "Gion Matsuri Festival grounds or Gion walking tour");
  const plan = sanitizeGeneratedPlan(
    { itineraryData: [{ day: 2, activities: [{ name: "Gion Matsuri Festival grounds or Gion walking tour", location: "Gion" }] }] },
    { noLodging: false },
  );
  assert.equal(plan.itineraryData[0].activities[0].name, "Gion walking tour");
  assert.equal("title" in plan.itineraryData[0].activities[0], false, "no key the model did not write");
});
