/**
 * R-w — AI place and description text is sanitised AT STORAGE (ledger `2026-10-03-rw-ai-place-text`;
 * decision-maker Oct 3, 2026). Tested against smoke 6's own text.
 *
 *   W1  smoke 6's stored items: every location is ward/area only, no brand survives anywhere, and the
 *       two venue-less items ("Cooking Class in Kyoto Home", "Uji Green Tea Experience") store NO
 *       location — they are supply slots, never the city
 *   W2  a "Draft without a place to stay" PAYLOAD (the stored draft JSON) carries no lodging entity:
 *       no "Hotel Gracery Kyoto Sanjo", no "Mitsui Garden Hotel", no "Hotel breakfast", no
 *       accommodation suggestions — asserted over the serialized JSON, not just a field
 *   W3  with a place to stay, generic hotel words survive but a NAMED hotel never does
 *   W4  prose: a sentence naming a brand or a hotel is dropped; the rest is kept verbatim
 *   W5  the pass is idempotent (the route and the snapshot writer both run it)
 *   W6  the supply-slot predicate: venue-less AI rows only — never a located, linked or human row
 *   W7  wiring: the snapshot writer runs the pass for every caller, stores NO city fallback, and the
 *       prompt carries the place rule and the tightened no-lodging line
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeCanonicalItems, sanitizeGeneratedPlan } from "../ai-draft-sanitize";
import {
  AI_PLACE_PROMPT_LINE,
  THIRD_PARTY_BRANDS,
  isSupplySlot,
  sanitizeAiLocation,
  sanitizeAiProse,
} from "@shared/ai-place-text";
import { NO_HOTEL_PROMPT_LINE } from "@shared/draft-basis";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const smoke6 = JSON.parse(readFileSync(path.join(repo, "server/__tests__/fixtures/smoke6-plancard.json"), "utf8"));
const smoke6Items = smoke6.days.flatMap((d: any) =>
  d.activities.map((a: any) => ({
    dayNumber: d.dayNum,
    title: a.name,
    name: a.name,
    description: "",
    type: a.type,
    time: a.time,
    durationMinutes: 60,
    estimatedCost: null,
    location: a.location,
  })),
);

const noBrand = (s: string) => THIRD_PARTY_BRANDS.every((b) => !s.toLowerCase().includes(b));

test("W1: smoke 6's locations are ward/area only; the venue-less two store nothing", () => {
  const out = sanitizeCanonicalItems(smoke6Items, { noLodging: false, city: "Kyoto, Japan" });
  assert.equal(out.length, 24, "no smoke-6 item is a hotel item");
  const byTitle = new Map(out.map((i) => [i.title, i.location]));
  assert.equal(byTitle.get("Cooking Class in Kyoto Home"), "", "\"Various locations arranged through Airbnb Experiences or Cookly\"");
  assert.equal(byTitle.get("Uji Green Tea Experience"), "", "\"Uji, Uji City (30 min south of Kyoto)\" names no venue and no ward");
  assert.equal(byTitle.get("Kiyomizu-dera"), "Higashiyama Ward, Kyoto");
  assert.equal(byTitle.get("Kinkaku-ji"), "Kita Ward, Kyoto");
  for (const i of out) {
    assert.ok(noBrand(i.location), `${i.title}: no brand`);
    assert.ok(!/\d/.test(i.location), `${i.title}: no street number (${i.location})`);
  }
});

const noLodgingPayload = {
  itineraryData: [
    {
      day: 1,
      theme: "Arrive and settle in near Hotel Gracery Kyoto Sanjo.",
      activities: [
        { name: "Arrival in Kyoto", location: "Kyoto", description: "Arrive and get your bearings." },
        { name: "Cooking Class in Kyoto Home", location: "Various locations arranged through Airbnb Experiences or Cookly", description: "Learn home cooking with a local family. Book on Airbnb Experiences." },
        { name: "Check in at Mitsui Garden Hotel", location: "Mitsui Garden Hotel Kyoto Shijo, Shimogyo Ward, Kyoto", description: "" },
      ],
      meals: [
        { time: "08:00", type: "breakfast", suggestion: "Hotel breakfast", cuisine: "Japanese" },
        { time: "12:30", type: "lunch", suggestion: "Nishiki Market street food", cuisine: "Japanese" },
      ],
      transportation: [
        { from: "Hotel Gracery Kyoto Sanjo", to: "Nishiki Market", mode: "walk" },
        { from: "Nishiki Market", to: "Gion", mode: "walk" },
      ],
    },
  ],
  summary: "Five days in Kyoto. You'll stay at Hotel Gracery Kyoto Sanjo, steps from Pontocho.",
  travelTips: ["Buy an ICOCA card.", "Ask your hotel to hold luggage."],
  accommodationSuggestions: [{ name: "Hotel Gracery Kyoto Sanjo" }, { name: "Mitsui Garden Hotel Kyoto Shijo" }],
};

test("W2: a no-lodging draft payload carries no lodging entity (serialized JSON)", () => {
  const out = sanitizeGeneratedPlan(noLodgingPayload, { noLodging: true });
  const json = JSON.stringify(out);
  for (const banned of ["Gracery", "Mitsui Garden", "Hotel breakfast", "hotel", "Hotel", "Airbnb", "Cookly"]) {
    assert.ok(!json.includes(banned), `payload still contains "${banned}": ${json}`);
  }
  assert.deepEqual(out.accommodationSuggestions, []);
  const day = (out.itineraryData as any[])[0];
  assert.deepEqual(day.activities.map((a: any) => a.name), ["Arrival in Kyoto", "Cooking Class in Kyoto Home"]);
  assert.equal(day.activities[1].location, "", "venue-less ⇒ no location");
  assert.equal(day.activities[1].description, "Learn home cooking with a local family.");
  assert.deepEqual(day.meals.map((m: any) => m.suggestion), ["Nishiki Market street food"]);
  assert.deepEqual(day.transportation.map((l: any) => l.from), ["Nishiki Market"]);
  assert.equal(out.summary, "Five days in Kyoto.");
  assert.deepEqual(out.travelTips, ["Buy an ICOCA card."]);
});

test("W3: with a place to stay, generic hotel words survive; a named hotel never does", () => {
  const out = sanitizeGeneratedPlan(noLodgingPayload, { noLodging: false });
  const json = JSON.stringify(out);
  assert.ok(!json.includes("Gracery") || json.includes("accommodationSuggestions"), "named hotel only where suggestions are kept");
  const day = (out.itineraryData as any[])[0];
  assert.ok(day.meals.some((m: any) => m.suggestion === "Hotel breakfast"), "a generic hotel breakfast is not a named hotel");
  assert.ok(!day.activities.some((a: any) => /Mitsui Garden/.test(a.name)), "a named hotel item is dropped");
  assert.deepEqual(out.travelTips, ["Buy an ICOCA card.", "Ask your hotel to hold luggage."]);
  assert.equal(out.summary, "Five days in Kyoto.");
});

test("W4: prose — sentences naming a brand or a hotel are dropped, the rest kept", () => {
  assert.equal(sanitizeAiProse("Walk the lanes. Book it on Klook for a discount. Go early."), "Walk the lanes. Go early.");
  assert.equal(sanitizeAiProse("Breakfast at the Hotel Granvia Kyoto."), null);
  assert.equal(sanitizeAiProse("Fushimi Inari opens at dawn."), "Fushimi Inari opens at dawn.", "'Inari' is not an inn");
  assert.equal(sanitizeAiLocation("Gion, Higashiyama Ward, Kyoto"), "Higashiyama Ward, Kyoto");
  assert.equal(sanitizeAiLocation("Gion"), "Gion");
  assert.equal(sanitizeAiLocation("Booked through Viator"), null);
  // The plan's city is an area wherever it sits: "Kyoto, Japan" is never cut to "Japan".
  assert.equal(sanitizeAiLocation("Kyoto, Japan", "Kyoto, Japan"), "Kyoto, Japan");
  assert.equal(sanitizeAiLocation("Kyoto, Japan"), "Japan", "without the plan's city the first segment reads as a venue");
});

test("W5: idempotent", () => {
  const once = sanitizeGeneratedPlan(noLodgingPayload, { noLodging: true });
  assert.deepEqual(sanitizeGeneratedPlan(once, { noLodging: true }), once);
  const items = sanitizeCanonicalItems(smoke6Items, { noLodging: true });
  assert.deepEqual(sanitizeCanonicalItems(items, { noLodging: true }), items);
});

test("W6: the supply-slot predicate", () => {
  assert.equal(isSupplySlot({ origin: "ai", locationName: null }), true);
  assert.equal(isSupplySlot({ origin: "ai", locationName: "  " }), true);
  assert.equal(isSupplySlot({ origin: "ai", locationName: "Higashiyama Ward, Kyoto" }), false);
  assert.equal(isSupplySlot({ origin: "ai", locationName: null, latitude: "35.0", longitude: "135.7" }), false);
  assert.equal(isSupplySlot({ origin: "ai", locationName: null, providerServiceId: "svc" }), false);
  assert.equal(isSupplySlot({ origin: "traveler", locationName: null }), false, "a person's own item is theirs, not a slot");
  assert.equal(isSupplySlot({ origin: null, locationName: null }), false);
});

test("W7: wiring — every snapshot caller is sanitised, no city fallback, prompt lines", () => {
  const writer = readFileSync(path.join(repo, "server/services/content-query.service.ts"), "utf8");
  assert.match(writer, /city: input\.trip\.destination \}/);
  assert.match(writer, /canonicalItems: sanitizeCanonicalItems\(input\.canonicalItems, sanitizeOptions\)/);
  assert.match(writer, /generatedPlan: sanitizeGeneratedPlan\(input\.generatedPlan, sanitizeOptions\)/);
  assert.match(writer, /locationName: activity\.location \|\| null,/);
  assert.doesNotMatch(writer, /locationName: activity\.location \|\| input\.trip\.destination/);
  const route = readFileSync(path.join(repo, "server/routes/content.routes.ts"), "utf8");
  assert.match(route, /const noLodging = draftBasis\.kind === "none_asked";/);
  assert.match(route, /noLodging,\n\s+trip: \{/);
  const gen = readFileSync(path.join(repo, "server/services/ai-generation.service.ts"), "utf8");
  assert.match(gen, /\$\{AI_PLACE_PROMPT_LINE\}/);
  assert.match(AI_PLACE_PROMPT_LINE, /never name a hotel/);
  assert.match(NO_HOTEL_PROMPT_LINE, /no \\?"hotel breakfast\\?"/);
  assert.match(NO_HOTEL_PROMPT_LINE, /accommodationSuggestions as an empty list/);
});
