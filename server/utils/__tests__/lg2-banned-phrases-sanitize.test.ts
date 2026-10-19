/**
 * LG-2 Ask 9 (ledger `2026-10-18-lg2-banned-phrases`): every drafting path applies the banned-phrase rule at storage
 * time — the item rows (`sanitizeCanonicalItems`), the stored draft JSON (`sanitizeGeneratedPlan`) and the trip generate
 * route, which skips the snapshot writer (`reduceUncoveredEventActivities`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { newBannedCopyDrops, reduceUncoveredEventActivities, sanitizeCanonicalItems, sanitizeGeneratedPlan } from "../ai-draft-sanitize";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const item = (title: string, location: string, description = "") => ({
  dayNumber: 1,
  title,
  name: title,
  description,
  type: "activity",
  time: "10:00",
  durationMinutes: 60,
  estimatedCost: null,
  location,
});

test("LB1 the item rows: the two Gion titles reworded, a description sentence dropped, a placeless empty title not stored", () => {
  const out = sanitizeCanonicalItems(
    [
      item("Gion District Walking & Geisha Spotting", "Gion", "Wander the lanes. Spot a geisha — a hidden gem. Tea after."),
      item("Gion District Stroll & Geisha Spotting", "Gion"),
      item("Hidden Gem", ""),
      item("Fushimi Inari Shrine", "Fushimi"),
    ] as any,
    { noLodging: false, city: "Kyoto, Japan" },
  );
  assert.deepEqual(out.map((i) => i.title), ["Gion District Walk", "Gion District Walk", "Fushimi Inari Shrine"]);
  assert.equal((out[0] as any).name, "Gion District Walk");
  assert.equal(out[0].description, "Wander the lanes. Tea after.");
});

test("LB2 the stored draft JSON takes the same rule", () => {
  const plan = sanitizeGeneratedPlan(
    {
      summary: "Three days in Kyoto. Insider picks throughout.",
      travelTips: ["Carry cash.", "No hidden fees on any booking."],
      itineraryData: [
        { day: 1, theme: "Trending neighbourhoods. Old Kyoto.", activities: [{ name: "Secret Garden Tour", location: "Higashiyama", description: "Verified guides. Quiet garden." }, { name: "Hidden Gems", location: "" }] },
      ],
    },
    { noLodging: false, city: "Kyoto, Japan" },
  );
  assert.equal(plan.summary, "Three days in Kyoto.");
  assert.deepEqual(plan.travelTips, ["Carry cash."]);
  assert.equal(plan.itineraryData[0].theme, "Old Kyoto.");
  assert.deepEqual(plan.itineraryData[0].activities.map((a: any) => a.name), ["Garden Tour"]);
  assert.equal(plan.itineraryData[0].activities[0].description, "Quiet garden.");
});

test("LB3 the trip generate route's own path takes it too", () => {
  const out = reduceUncoveredEventActivities(
    [
      { title: "Geisha Spotting in Gion", locationName: "Gion", description: "" },
      { title: "Hidden Gem", locationName: "", description: "" },
    ],
    [],
  );
  assert.deepEqual(out.map((a) => a.title), ["Gion District Walk"]);
  const routes = readFileSync(path.join(repo, "server/routes.ts"), "utf8");
  assert.match(routes, /reduceUncoveredEventActivities\(d\.activities, coveringEvents, bannedDrops\)/, "the route still calls it, counting its drops");
});

test("LB5 the drop counter: one per item not stored for an emptied title with no place name, and nothing else", () => {
  const drops = newBannedCopyDrops();
  sanitizeCanonicalItems(
    [item("Hidden Gem", ""), item("Secret", ""), item("Hidden Gem", "Arashiyama"), item("Gion District Walking & Geisha Spotting", "Gion")] as any,
    { noLodging: false, city: "Kyoto, Japan", drops },
  );
  assert.equal(drops.bannedTitleNoPlace, 2, "the placeless two; the place-name fallback and the reworded title are kept");
  const routeDrops = newBannedCopyDrops();
  reduceUncoveredEventActivities([{ title: "Hidden Gems", locationName: "" }], [], routeDrops);
  assert.equal(routeDrops.bannedTitleNoPlace, 1);
  for (const f of ["server/services/content-query.service.ts", "server/routes/content.routes.ts", "server/routes.ts"]) {
    assert.match(readFileSync(path.join(repo, f), "utf8"), /logBannedCopyDrops\(/, `${f} logs its count`);
  }
});

test("LB4 the prompt no longer asks for hidden gems or feeds the trending score", () => {
  const src = readFileSync(path.join(repo, "server/services/ai-generation.service.ts"), "utf8");
  assert.doesNotMatch(src, /Mix popular attractions with hidden gems/);
  assert.doesNotMatch(src, /Trending Score:/);
});
