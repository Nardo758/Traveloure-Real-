/**
 * Smoke 10 drafting fixtures (ledger `2026-10-04-smoke10-fixes`).
 *   D1 S10-1(b) a stop ending 08:30 before a 10:10 INTERNATIONAL departure is never drafted; nothing
 *      before arrival + buffer on the arrival day; the AI's own travel rows are kept
 *   D2 S10-7 the drafting prompt carries the meal windows, and the CI draft (the E2E stub, through the
 *      real normalizer) has no "Breakfast" starting after 10:00
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { withinFlightWindows } from "../../services/smart-sequencing.service";
import { buildStubItinerary } from "../../services/ai-draft-stub";
import { normalizeGeneratedItineraryPayload } from "../generated-itinerary";
import { AI_MEAL_PROMPT_LINE, AI_MEAL_WINDOWS } from "@shared/ai-place-text";
import { travelItemKind } from "@shared/getting-there";

const anchors = [
  { anchorType: "flight_arrival", anchorDatetime: "2026-11-11T09:05:00", bufferBefore: 0, bufferAfter: 120, location: "KIX", isImmovable: true },
  { anchorType: "flight_departure", anchorDatetime: "2026-11-15T10:10:00", bufferBefore: 150, bufferAfter: 0, location: "KIX", isImmovable: true },
];
const item = (dayNumber: number, title: string, time: string, durationMinutes: number) => ({ dayNumber, title, time, durationMinutes, location: "Kyoto" });

test("D1 S10-1(b): nothing past the 07:40 cut-off on the departure day, nothing before 11:05 on arrival", () => {
  const items = [
    item(1, "Arrive at Kansai International Airport", "09:05", 60),
    item(1, "Fushimi Inari", "10:30", 90),
    item(1, "Nishiki lunch", "12:00", 60),
    item(3, "Kinkaku-ji", "07:00", 90),
    item(5, "Nishiki Market", "07:00", 90),
    item(5, "Early walk", "06:00", 60),
    item(5, "Depart for Airport", "07:40", 60),
  ];
  const { kept, dropped } = withinFlightWindows(items, anchors, "2026-11-11", {
    day: (it) => it.dayNumber,
    time: (it) => it.time,
    duration: (it) => it.durationMinutes,
    isTravelRow: (it) => travelItemKind({ name: it.title, location: it.location, origin: "ai" }) !== null,
  });
  assert.deepEqual(dropped.map((d) => d.title).sort(), ["Fushimi Inari", "Nishiki Market"]);
  assert.ok(kept.some((k) => k.title === "Early walk"), "06:00–07:00 ends before the cut-off");
  assert.ok(kept.some((k) => k.title === "Kinkaku-ji"), "another day is untouched");
  assert.ok(kept.some((k) => k.title === "Depart for Airport") && kept.some((k) => k.title === "Arrive at Kansai International Airport"), "the travel rows stay");
  // No flight anchors ⇒ nothing is touched (a hotel check-in is not a reason to empty a morning).
  const hotelOnly = withinFlightWindows(items, [{ ...anchors[0], anchorType: "hotel_checkin" }], "2026-11-11", {
    day: (it) => it.dayNumber, time: (it) => it.time, duration: (it) => it.durationMinutes, isTravelRow: () => false,
  });
  assert.equal(hotelOnly.dropped.length, 0);
  // The free-draft route runs it on the rows AND the stored plan.
  const route = fs.readFileSync(path.resolve(import.meta.dirname, "../../routes/content.routes.ts"), "utf8");
  assert.match(route, /const cut = withinFlightWindows\(normalizedResult\.canonicalItems, tripAnchors/);
  assert.match(route, /activities: withinFlightWindows\(Array\.isArray\(d\.activities\)/);
});

test("D2 S10-7: the meal windows are in the prompt, and the CI draft has no breakfast after 10:00", () => {
  assert.deepEqual(AI_MEAL_WINDOWS, { breakfast: { before: "09:30" }, lunch: { from: "11:30", to: "14:30" }, dinner: { from: "17:30" } });
  assert.match(AI_MEAL_PROMPT_LINE, /breakfast starts before 09:30, lunch between 11:30 and 14:30, dinner from 17:30/);
  const gen = fs.readFileSync(path.resolve(import.meta.dirname, "../../services/ai-generation.service.ts"), "utf8");
  assert.match(gen, /8\. Meals at meal times - \$\{AI_MEAL_PROMPT_LINE\}/);
  const draft = buildStubItinerary({ destination: "Kyoto, Japan", dates: { start: "2026-11-11", end: "2026-11-15" }, interests: [] });
  const normalized = normalizeGeneratedItineraryPayload(draft as any, 5);
  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(t.trim());
    if (!m) return null;
    let h = Number(m[1]);
    if (m[3]?.toUpperCase() === "PM" && h < 12) h += 12;
    if (m[3]?.toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + Number(m[2]);
  };
  const breakfasts: string[] = [];
  for (const d of normalized.dailyItinerary as any[]) {
    for (const m of d.meals ?? []) if (/breakfast/i.test(`${m.type} ${m.suggestion}`)) breakfasts.push(m.time);
    for (const a of d.activities ?? []) if (/breakfast/i.test(String(a.name))) breakfasts.push(a.time);
  }
  for (const it of normalized.canonicalItems) if (/breakfast/i.test(it.title)) breakfasts.push(it.time);
  assert.ok(breakfasts.length > 0, "the fixture draft has a breakfast to check");
  for (const t of breakfasts) assert.ok((toMin(t) ?? 0) <= 10 * 60, `breakfast at ${t} starts after 10:00`);
});
