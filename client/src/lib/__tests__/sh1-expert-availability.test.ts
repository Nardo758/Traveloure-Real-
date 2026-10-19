/**
 * SH-1 item 11 — the client's one reading of the expert-availability answer (rulings Q11.1–Q11.4).
 *
 *   EA4 a CTA draws only on a settled "yes": loading, error, "no" and no answer all hide it
 *   EA5 a city CTA with no city asks nothing; a city-less CTA asks the any-market question
 *   EA6 useAskExpert's last resort is the directory only on a "yes" — never on a "no"
 *   EX1 /experts: spinner while loading, the empty state only once loaded with nobody
 *   EX2 /experts: "Clear all filters" only when a filter is set; the role filter and "Available now" count
 *   EX3 /experts: clearing restores the page's own default role and turns "Available now" off
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { askFallbackPath, expertAvailabilityUrl, expertCtaVisible, EXPERT_AVAILABILITY_ROUTE } from "../expert-availability";
import { clearedExpertsFilters, expertsFiltersSet, expertsResultState } from "../experts-filters";

test("EA4: only a settled yes draws the CTA", () => {
  assert.equal(expertCtaVisible({ data: { available: true } }), true);
  assert.equal(expertCtaVisible({ isLoading: true, data: { available: true } }), false);
  assert.equal(expertCtaVisible({ isError: true, data: { available: true } }), false);
  assert.equal(expertCtaVisible({ data: { available: false } }), false);
  assert.equal(expertCtaVisible({ data: null }), false);
  assert.equal(expertCtaVisible({ data: { available: "yes" } }), false, "only a real true");
});

test("EA5: the question each CTA asks", () => {
  assert.equal(expertAvailabilityUrl({ city: "Kyoto" }), `${EXPERT_AVAILABILITY_ROUTE}?city=Kyoto`);
  assert.equal(expertAvailabilityUrl({ city: "  " }), null);
  assert.equal(expertAvailabilityUrl({ city: null }), null);
  assert.equal(expertAvailabilityUrl("any"), EXPERT_AVAILABILITY_ROUTE);
});

test("EA6: the directory fallback only on a yes", () => {
  assert.equal(askFallbackPath("Kyoto", false), null);
  assert.equal(askFallbackPath(null, false), null);
  assert.equal(askFallbackPath("Kyoto", true), "/local-experts?location=Kyoto");
  assert.equal(askFallbackPath(null, true), "/local-experts");
  const src = readFileSync("client/src/lib/use-ask-expert.ts", "utf8");
  assert.match(src, /askFallbackPath\(city, await fetchExpertAvailability\(/);
  assert.ok(!/navigate\(city \? `\/local-experts/.test(src), "no unconditional directory fallback");
});

test("EX1: spinner while loading, empty state only once loaded with nobody", () => {
  assert.equal(expertsResultState(true, 0), "loading");
  assert.equal(expertsResultState(true, 5), "loading");
  assert.equal(expertsResultState(false, 0), "empty");
  assert.equal(expertsResultState(false, 3), "results");
  const page = readFileSync("client/src/pages/experts.tsx", "utf8");
  assert.ok(!page.includes("{sortedExperts.length === 0 && ("), "the empty state waits for loading");
  assert.match(page, /expertsResultState\(isLoadingExperts, sortedExperts\.length\) === "empty"/);
});

test("EX2: Clear all filters only when a filter is set", () => {
  const base = clearedExpertsFilters("local_expert");
  assert.equal(expertsFiltersSet(base, "local_expert"), false);
  assert.equal(expertsFiltersSet({ ...base, availableNowOnly: true }, "local_expert"), true);
  assert.equal(expertsFiltersSet({ ...base, selectedRole: "event_planner" }, "local_expert"), true);
  assert.equal(expertsFiltersSet({ ...base, searchQuery: "tea" }, "local_expert"), true);
  assert.equal(expertsFiltersSet({ ...base, selectedSpecialty: "Food" }, "local_expert"), true);
  assert.match(readFileSync("client/src/pages/experts.tsx", "utf8"), /\{filtersSet && \(\s*<button/);
});

test("EX3: clearing restores the default role and turns Available now off", () => {
  const c = clearedExpertsFilters("local_expert");
  assert.equal(c.selectedRole, "local_expert");
  assert.equal(c.availableNowOnly, false);
  const page = readFileSync("client/src/pages/experts.tsx", "utf8");
  assert.match(page, /setSelectedRole\(c\.selectedRole\);\s*setAvailableNowOnly\(c\.availableNowOnly\);/);
});
