/**
 * Audit RC-6 — a selected plan meeting a different city (ledger `2026-09-25-rc6-bound-plan-city`).
 *
 * C1–C4 pin the ONE city rule; B1–B4 when the plan modal must ask; W1–W6 the AI paths' identity-safe
 * write; S1–S7 are source pins on the surfaces, each of which fails on the pre-RC-6 code.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  boundPlanCityChanged,
  identitySafeWrite,
  sameCity,
  SELECTED_PLAN_KEEPS_ITS_BASICS_NOTE,
} from "../plan-city";

const code = (rel: string) =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

test("C1: the same city in two spellings is one city", () => {
  assert.equal(sameCity("Kyoto", "Kyoto, Japan"), true);
  assert.equal(sameCity("kyoto", "Kyoto"), true);
  assert.equal(sameCity("  Kyoto ", "Kyoto"), true);
});

test("C2: different cities are different", () => {
  assert.equal(sameCity("Kyoto", "Osaka"), false);
  assert.equal(sameCity("Kyoto, Japan", "Osaka, Japan"), false);
});

test("C3: both empty is the same; one empty is not", () => {
  assert.equal(sameCity("", undefined), true);
  assert.equal(sameCity("Kyoto", ""), false);
});

test("C4: the rule is the mismatch dialog's own, not a second comparison (§18 rule 1)", () => {
  assert.match(code("lib/plan-city.ts"), /import \{ locationsAgree \} from "\.\/location-mismatch"/);
});

test("B1: a selected plan + a different city ⇒ ask", () => {
  assert.equal(boundPlanCityChanged({ boundTripId: "t1", liveDestination: "Kyoto", destination: "Osaka" }), true);
});

test("B2: no selected plan ⇒ nothing to ask", () => {
  assert.equal(boundPlanCityChanged({ boundTripId: null, liveDestination: "Kyoto", destination: "Osaka" }), false);
});

test("B3: the same city ⇒ nothing to ask", () => {
  assert.equal(
    boundPlanCityChanged({ boundTripId: "t1", liveDestination: "Kyoto", destination: "Kyoto, Japan" }),
    false,
  );
});

test("B4: no city named ⇒ nothing to ask", () => {
  assert.equal(boundPlanCityChanged({ boundTripId: "t1", liveDestination: "Kyoto", destination: "  " }), false);
});

test("W1: no selected plan ⇒ the same merge as before, nothing withheld", () => {
  const w = identitySafeWrite({}, { destination: "Osaka", startDate: "2026-10-01", travelers: 2 });
  assert.equal(w.kind, "merge");
  assert.deepEqual(w.kind === "merge" && w.withheld, []);
  assert.equal(w.patch.destination, "Osaka");
});

test("W2: a selected plan + a different city ⇒ switch (the pen describes a new plan)", () => {
  const w = identitySafeWrite({ tripId: "t1", destination: "Kyoto" }, { destination: "Osaka", startDate: "2026-10-01" });
  assert.equal(w.kind, "switch");
});

test("W3: a selected plan + the same city ⇒ city and dates are NOT written onto it", () => {
  const w = identitySafeWrite(
    { tripId: "t1", destination: "Kyoto", startDate: "2026-10-01", endDate: "2026-10-05" },
    { destination: "Kyoto, Japan", startDate: "2026-11-01", endDate: "2026-11-04", travelers: 3 },
  );
  assert.equal(w.kind, "merge");
  assert.equal("destination" in w.patch, false);
  assert.equal("startDate" in w.patch, false);
  assert.equal("endDate" in w.patch, false);
  assert.equal(w.patch.travelers, 3, "non-identity details still fill in");
});

test("W4: what differed is reported as withheld; the same city and an unchanged date are not", () => {
  const w = identitySafeWrite(
    { tripId: "t1", destination: "Kyoto", startDate: "2026-10-01", endDate: "2026-10-05" },
    { destination: "Kyoto", startDate: "2026-10-01", endDate: "2026-11-04" },
  );
  assert.deepEqual(w.kind === "merge" && w.withheld, ["endDate"]);
});

test("W5: a selected plan + no city heard ⇒ dates still withheld from it", () => {
  const w = identitySafeWrite({ tripId: "t1", destination: "Kyoto" }, { startDate: "2026-11-01" });
  assert.equal(w.kind, "merge");
  assert.deepEqual(w.kind === "merge" && w.withheld, ["startDate"]);
});

test("W6: the withheld note says where those basics are changed", () => {
  assert.match(SELECTED_PLAN_KEEPS_ITS_BASICS_NOTE, /plan itself/);
});

test("S1: the modal asks instead of guessing, and offers both answers", () => {
  const src = code("components/trip/plan-modal.tsx");
  assert.match(src, /boundPlanCityChanged\(/);
  assert.match(src, /data-testid="button-plan-city-change"/);
  assert.match(src, /data-testid="button-plan-city-new"/);
});

test("S2: 'change this plan's city' writes through the owning rails and keeps the plan", () => {
  const modal = code("components/trip/plan-modal.tsx");
  assert.match(modal, /changeBoundPlanCity\(selected, destination\)/);
  assert.match(modal, /return \{ ok: true, keep: selected \}/);
  const writer = code("lib/plan-city-writer.ts");
  assert.match(writer, /savePlanStops\(tripId, renamed\)/, "a plan with stops renames stop 0");
  assert.match(writer, /apiRequest\("PATCH", `\/api\/trips\/\$\{tripId\}`, \{ destination: next \}\)/);
  assert.match(writer, /apiRequest\("GET", `\/api\/trips\/\$\{tripId\}`\)/, "the replace-list is read first");
});

test("S3: a kept plan is not treated as freshly minted (its stops are never replaced unread)", () => {
  const src = code("components/trip/plan-modal.tsx");
  assert.match(src, /async function commitPlan\(boundTripId\?: string, keepTripId\?: string\)/);
  assert.match(src, /const canReplaceStops = !tripId \|\| !!boundTripId \|\| stopsReadOk\.current;/);
});

test("S4: 'start a new plan' mints through the ONE mint step", () => {
  const src = code("components/trip/plan-modal.tsx");
  const resolver = src.slice(src.indexOf("const resolveCityChoice"), src.indexOf("const save = async"));
  assert.match(resolver, /await mintThisPlan\(\)/);
});

test("S5: the occasion finish is never asked (it creates no plan)", () => {
  const src = code("components/trip/plan-modal.tsx");
  assert.match(src, /BRANCHES_THAT_MINT\.includes\(branch\) && needsCityChoice\(\)/);
});

test("S6: IntakePanel and the AI extraction write identity-safely, never a plain merge", () => {
  const intake = code("components/intake-panel.tsx");
  assert.match(intake, /updateTripContextIdentitySafe\(\{/);
  assert.doesNotMatch(intake, /\bupdateTripContext\(\{/);
  const panel = code("components/ai-planner-draft-panel.tsx");
  assert.match(panel, /updateTripContextIdentitySafe\(fields\)/);
  assert.doesNotMatch(panel, /updateContext\(fields\)/);
  assert.match(panel, /data-testid="text-selected-plan-withheld-note"/);
});

test("S7: the pen's own 'preserving id' switch reads the same city rule", () => {
  const src = code("lib/trip-context.ts");
  assert.match(src, /const destinationChanged = !sameCity\(live\.destination, trimmedDestination\);/);
  assert.match(src, /export function updateTripContextIdentitySafe/);
});
