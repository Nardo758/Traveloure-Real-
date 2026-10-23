/**
 * FB-1 step 5 — prompt cleanup (decision-maker, Oct 19, 2026; ledger `2026-10-19-fb1-prompt-cleanup`).
 *
 *   PC1 the free draft's prompt: no hidden-gems feed, no "trending", no crowd-level input or instruction; "must-see attractions"
 *       kept; the never-say line present
 *   PC2 the paid run's prompt: no empty-day fill, placeholder example times, the never-say line present
 *   PC3 the trip-generate and blueprint prompts: placeholder example times, the never-say line present
 *   PC4 the never-say line is built from banned-copy's ONE list at runtime: it names every phrase the rule rewords,
 *       and no prompt retypes the list
 *   PC5 the trip-generate route stores no canned fallback: a provider failure is answered by aiFailureResponse,
 *       the free draft is released, nothing is written
 *   PC6 POST /api/ai/generate-optimized-itineraries is still 410 unless its flag is set (R515)
 *   PC7 the paid optimizer prompt carries no instruction to rank TravelPulse trending spots first
 *       (ledger `2026-10-21-optimizer-no-trending-preference`). The city-intelligence block still
 *       names the spots, the season and the local events.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bannedCopyPromptLine, containsBannedCopy } from "@shared/banned-copy";
import { optimizedItinerariesGate } from "../config/optimized-itineraries.config";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f: string) => readFileSync(path.join(repo, f), "utf8");
const NEVER_SAY = /\$\{bannedCopyPromptLine\(\)\}/;

function routeHandler(src: string, marker: string): string {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${marker} not found`);
  const next = src.indexOf("\n  app.", start + marker.length);
  return src.slice(start, next > 0 ? next : undefined);
}

test("PC1 the free draft's prompt", () => {
  const src = read("server/services/ai-generation.service.ts");
  // R-07 moved the TravelPulse block, wording unchanged, into the shared formatter.
  const pulse = read("server/services/travelpulse-traveler-projection.ts");
  for (const body of [src, pulse]) {
    assert.doesNotMatch(body, /Hidden Gems to Consider/);
    assert.doesNotMatch(body, /Prioritize trending/i);
    assert.doesNotMatch(body, /Factor in crowd levels/i);
    assert.doesNotMatch(body, /Current Crowd Level/, "no crowd data feeds the model");
    assert.doesNotMatch(body, /Include hidden gems/i);
  }
  assert.match(pulse, /Prioritize must-see attractions\./);
  assert.match(src, NEVER_SAY);
});

test("PC2 the paid run's prompt: empty days stay empty, placeholder times, the never-say line", () => {
  const src = read("server/itinerary-optimizer.ts");
  assert.doesNotMatch(src, /EMPTY DAYS TO FILL|auto-filling any empty days|emptyDaySection/);
  assert.match(src, /"startTime": "<HH:MM>",\n\s*"endTime": "<HH:MM>",/);
  assert.doesNotMatch(src, /"startTime": "\d{2}:\d{2}"/);
  assert.match(src, /6\. \$\{bannedCopyPromptLine\(\)\}/);
});

test("PC3 the trip-generate and blueprint prompts", () => {
  const routes = read("server/routes.ts");
  const trip = routeHandler(routes, "app.post(api.trips.generateItinerary.path");
  assert.match(trip, /"time": "<HH:MM AM\/PM>"/);
  assert.doesNotMatch(trip, /"time": "\d/);
  assert.match(trip, NEVER_SAY);
  const content = read("server/routes/content.routes.ts");
  const bp = content.slice(content.indexOf('router.post("/api/ai/generate-blueprint"'), content.indexOf('router.post("/api/ai/chat"'));
  assert.match(bp, /"time": "<HH:MM AM\/PM>"/);
  assert.doesNotMatch(bp, /"time": "\d/);
  assert.match(bp, NEVER_SAY);
});

test("PC4 the never-say line comes from the ONE list, and no prompt retypes it", () => {
  const line = bannedCopyPromptLine();
  for (const w of ["geisha spotting", "hidden gem", "secret", "insider", "no hidden fees", "no markup", "vetted", "verified", "certified", "licensed", "authenticated", "trending"]) {
    assert.ok(line.includes(w), `names ${w}`);
  }
  // Every quoted phrase in the line is one the storage rule catches.
  for (const q of line.match(/"([^"]+)"/g) ?? []) assert.ok(containsBannedCopy(q.replace(/[()"]/g, "").replace(/gem s$/, "gems")), q);
  for (const f of ["server/services/ai-generation.service.ts", "server/itinerary-optimizer.ts", "server/routes.ts", "server/routes/content.routes.ts"]) {
    assert.doesNotMatch(read(f), /"vetted"|'vetted'|\bvetted, verified\b/, `${f} retypes no list`);
  }
});

test("PC5 the trip-generate route stores no canned fallback", () => {
  const trip = routeHandler(read("server/routes.ts"), "app.post(api.trips.generateItinerary.path");
  assert.doesNotMatch(trip, /Local Lunch|Morning in \$\{destination\}|Exploration Day|Cultural Experience|Local Restaurant/);
  assert.doesNotMatch(trip, /freeDraftProviderFailed/);
  const fail = trip.slice(trip.indexOf("FB-1 step 5"), trip.indexOf("FB-1 step 5") + 1200);
  assert.match(fail, /await aiFailureResponse\(aiErr/);
  assert.match(fail, /releaseFreeDraft\(freeDraftRunId\)/);
  assert.match(fail, /return res\.status\(failure\.status\)\.json\(failure\.body\)/);
});

/** Preference wording that would tell the model to rank TravelPulse trending spots first.
 * Whitespace is required between the words, so a ledger slug on one line is not a hit.
 */
const TRENDING_PREFERENCE = /prefer(?:\s+\w+){0,6}\s+trending|trending(?:\s+\w+){0,6}\s+prefer|prefer these when selecting/i;

test("PC7 the paid optimizer prompt does not prefer trending spots", () => {
  const src = read("server/itinerary-optimizer.ts");
  const start = src.indexOf("function buildCityIntelligenceSection");
  const end = src.indexOf("function weightTrendingServices");
  assert.ok(start > 0 && end > start, "city-intelligence section builder");
  const section = src.slice(start, end);
  assert.doesNotMatch(section, TRENDING_PREFERENCE);
  assert.match(section, /TRENDING SPOTS:/);
  assert.match(section, /trend score \$\{t\.trendScore\}/);
  assert.match(section, /SEASONAL CONTEXT:/);
  assert.match(section, /LOCAL EVENTS DURING TRIP/);
  assert.match(section, /peak crowd hours/);
  assert.match(section, /1\. Do NOT schedule crowd-heavy activities during peak crowd hours listed above\./);
  assert.match(section, /2\. If a local event causes extreme crowd impact/);

  const promptStart = src.indexOf("const prompt = `You are a travel optimization AI");
  const promptEnd = src.indexOf("recordOptimizerRun", promptStart);
  assert.ok(promptStart > 0 && promptEnd > promptStart, "paid optimizer prompt");
  const prompt = src.slice(promptStart, promptEnd);
  assert.match(prompt, /\$\{cityIntelligenceSection\}/);
  assert.doesNotMatch(prompt, TRENDING_PREFERENCE);
  assert.doesNotMatch(src, TRENDING_PREFERENCE);
});

test("PC6 POST /api/ai/generate-optimized-itineraries is 410 unless its flag is set", () => {
  assert.equal(optimizedItinerariesGate({} as any)?.status, 410);
  assert.equal(optimizedItinerariesGate({ AI_GENERATE_OPTIMIZED_ITINERARIES_ENABLED: "1" } as any), null);
  assert.match(read("server/routes/content.routes.ts"), /router\.post\("\/api\/ai\/generate-optimized-itineraries", isAuthenticated, async \(req, res\) => \{\n\s*\/\/ FB-1 step 0[^\n]*\n\s*const retired = optimizedItinerariesGate\(\);\n\s*if \(retired\) return/);
});
