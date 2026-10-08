/**
 * THE DRAFT STORES OUR OWN TRAVEL-LINE WORDING (ledger `2026-10-08-arrival-title-normalized`;
 * decision-maker, Oct 8, 2026). Smoke 5 item 10 accepts a station-naming line as a valid arrival
 * basis; storage normalizes its title so every reader of the stored title agrees.
 *
 *   A1  the item rows: "Arrive at Kyoto Station and drop bags" on day 1 stores as "Arrival in Kyoto"
 *       (title AND name); the last day's "Depart from Kyoto Station…" as "Departure from Kyoto"
 *   A2  the stored draft JSON (`sanitizeGeneratedPlan`) carries the same titles as the rows
 *   A3  the trip generate route's day list (`withNormalizedTravelTitles`, activity `title`)
 *   A5  the slip still reads the stored wording as the travel row (one arrival row, one departure row)
 *   A4  only the plan's own travel rows: a mid-trip station arrival, a hotel line, an ordinary stop
 *       and a plan with no city keep their titles; the pass is idempotent
 *
 * Run: npx tsx --test server/utils/__tests__/arrival-title-normalized.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { absorbedTravelItemId, travelItemKind } from "@shared/getting-there";
import { sanitizeCanonicalItems, sanitizeGeneratedPlan, withNormalizedTravelTitles } from "../ai-draft-sanitize";

const o = { noLodging: false, city: "Kyoto, Japan" };
const item = (dayNumber: number, title: string) => ({
  dayNumber, title, name: title, description: "", type: "activity", time: "10:00", durationMinutes: 60, estimatedCost: null, location: "",
});

test("A1 the rows: the station arrival stores as 'Arrival in Kyoto', the departure as 'Departure from Kyoto'", () => {
  const out = sanitizeCanonicalItems(
    [item(1, "Arrive at Kyoto Station and drop bags"), item(1, "Nishiki Market"), item(3, "Depart from Kyoto Station on the Shinkansen")],
    o,
  );
  assert.deepEqual(out.map((i) => i.title), ["Arrival in Kyoto", "Nishiki Market", "Departure from Kyoto"]);
  assert.deepEqual(out.map((i) => i.name), ["Arrival in Kyoto", "Nishiki Market", "Departure from Kyoto"]);
  assert.ok(!JSON.stringify(out).includes("Arrive at Kyoto Station"));
});

test("A2 the stored draft JSON says the same as the rows", () => {
  const plan = sanitizeGeneratedPlan(
    {
      itineraryData: [
        { day: 1, activities: [{ name: "Arrive at Kyoto Station and drop bags", location: "Kyoto" }, { name: "Gion walk", location: "Gion" }] },
        { day: 2, activities: [{ name: "Depart from Kyoto Station", location: "Kyoto" }] },
      ],
    },
    o,
  );
  assert.deepEqual((plan.itineraryData as any[]).map((d) => d.activities.map((a: any) => a.name)), [["Arrival in Kyoto", "Gion walk"], ["Departure from Kyoto"]]);
});

test("A3 the trip generate route's day list (activity title)", () => {
  const days = withNormalizedTravelTitles(
    [
      { day: 1, activities: [{ title: "Arrive at Kyoto Station and drop bags" }] },
      { day: 2, activities: [{ title: "Fushimi Inari" }, { title: "Depart from Kyoto Station" }] },
    ],
    "Kyoto, Japan",
  );
  assert.deepEqual(days.map((d) => d.activities.map((a: any) => a.title)), [["Arrival in Kyoto"], ["Fushimi Inari", "Departure from Kyoto"]]);
});

test("A4 only the plan's own travel rows, never a guess; idempotent", () => {
  const out = sanitizeCanonicalItems(
    [
      item(1, "Arrive at Kyoto Station and drop bags"),
      item(2, "Arrive at Osaka Station for the day"),
      item(2, "Kyoto Station shopping"),
      item(3, "Arrive at your ryokan near Kyoto Station"),
      item(4, "Depart from Kyoto Station"),
    ],
    o,
  );
  assert.deepEqual(out.map((i) => i.title), [
    "Arrival in Kyoto",
    "Arrive at Osaka Station for the day",
    "Kyoto Station shopping",
    "Arrive at your ryokan near Kyoto Station",
    "Departure from Kyoto",
  ]);
  assert.deepEqual(sanitizeCanonicalItems(out, o).map((i) => i.title), out.map((i) => i.title), "idempotent");
  const noCity = sanitizeCanonicalItems([item(1, "Arrive at Kyoto Station")], { noLodging: false, city: null });
  assert.equal(noCity[0].title, "Arrive at Kyoto Station", "no city ⇒ nothing to name ⇒ unchanged");
});

test("A5 the stored wording is still the slip's travel row", () => {
  assert.equal(travelItemKind({ name: "Arrival in Kyoto", location: "", origin: "ai" }), "arrival");
  assert.equal(travelItemKind({ name: "Departure from Kyoto", location: "", origin: "ai" }), "departure");
  assert.equal(travelItemKind({ name: "Arrival in Kyoto", origin: "traveler" }), null, "a traveler's row is theirs");
  const rows = sanitizeCanonicalItems([item(1, "Arrive at Kyoto Station and drop bags"), item(1, "Nishiki Market")], o).map((r, i) => ({
    id: String(i), name: r.name, location: r.location, origin: "ai",
  }));
  assert.equal(absorbedTravelItemId(rows, "arrival"), "0", "the stored arrival absorbs the placeholder");
});
