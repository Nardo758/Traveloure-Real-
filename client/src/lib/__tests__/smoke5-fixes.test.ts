/**
 * Smoke 5 (production f01311a; ledger `2026-10-03-smoke5-fixes`).
 *
 *   S1 item 2 — the legacy inline lodging card is gone from the slip and from the code: the
 *      Where-to-stay panel is the one lodging surface, so nothing can render it back after Skip
 *   S2 item 4 — "Plan with AI" lands on the plan it minted before the AI form opens, and the AI form
 *      refreshes that slip's reads when the draft lands
 *   S3 item 5 — the coordinate backfill reports items it never tried; tried-and-failed and
 *      unlocatable items are not pending, so the re-read always stops
 *   S4 item 5 — the slip re-reads only while the server says pins are pending
 *   S5 item 5 — the read and the slip are wired to the flag
 *   S6 item 8 — the slip re-reads while lookups are pending and says "checking hours…" on those rows
 *   S7 item 10 — a no-hotel arrival/departure line is ours or a station-specific line, never a hotel
 *
 * Item 1 is `shared/__tests__/where-to-stay.test.ts` W7–W9 + `server/__tests__/where-to-stay.db.test.ts`
 * D6; item 3 is `place-facts.test.ts` A5–A7. Run: npx tsx --test client/src/lib/__tests__/smoke5-fixes.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { coordinatesStillPending } from "../../../../server/services/coordinate-backfill.pure";
import { CHECKING_HOURS_LABEL, PLANCARD_PENDING_REFETCH_MS, plancardRefetchInterval, showsCheckingHours } from "../plancard-refetch";
import { isAcceptableArrivalLine } from "@shared/draft-basis";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/.*$/gm, "");

test("S1 item 2: the legacy lodging card is gone; the panel is the only lodging surface", () => {
  const slip = read("../../components/plancard/SlipView.tsx");
  const sets = read("../../components/plancard/SlipOptionSets.tsx");
  assert.doesNotMatch(slip, /SlipLodgingEntry/);
  assert.doesNotMatch(sets, /SlipLodgingEntry|slip-lodging-entry|Compare places to stay|Suggest places that fit/);
  // Surface step 3: the ONE lodging surface is now `AnchorPanel` (both states).
  assert.match(slip, /<AnchorPanel\b/);
  assert.doesNotMatch(slip, /WhereToStayPanel|SlipAnchorQuestion/);
});

test("S2 item 4: the AI finish lands on the minted plan first; the form refreshes that slip", () => {
  const ctx = read("../../contexts/PlanningContext.tsx");
  const ai = ctx.slice(ctx.indexOf('if (branch === "ai")'), ctx.indexOf('if (branch === "myself")'));
  assert.match(ai, /if \(plan\.tripId\) setLocation\(`\/plans\/\$\{plan\.tripId\}`\);\s*setAiOpen\(true\);/);
  const form = read("../../components/EnhancedPlanningModal.tsx");
  assert.match(form, /\["plancard", "option-sets", "where-to-stay"\]/);
});

const row = (id: string, located: boolean, named = true) => ({
  id,
  latitude: located ? "35" : null,
  longitude: located ? "135" : null,
  locationName: named ? `Place ${id}` : null,
  locationAddress: null,
});

test("S3 item 5: pending means locatable and never tried — and nothing else", () => {
  const items = Array.from({ length: 24 }, (_, i) => row(`i${i}`, i < 12));
  const tried12 = new Set(items.slice(0, 12).map((it) => it.id));
  assert.equal(coordinatesStillPending(items, tried12), true, "12 of 24 pinned, 12 never tried");
  assert.equal(coordinatesStillPending(items, new Set(items.map((it) => it.id))), false, "tried and failed is not pending");
  assert.equal(coordinatesStillPending([row("a", true), row("b", false, false)], new Set()), false, "no place of its own ⇒ never pending");
  assert.equal(coordinatesStillPending([], new Set()), false);
});

test("S4 item 5: the slip re-reads only while pins are pending", () => {
  assert.equal(plancardRefetchInterval({ coordinatesPending: true }), PLANCARD_PENDING_REFETCH_MS);
  assert.equal(plancardRefetchInterval({}), false);
  assert.equal(plancardRefetchInterval(undefined), false);
});

test("S5 item 5: the read reports the flag and the slip polls on it", () => {
  const svc = read("../../../../server/services/trip-plan.service.ts");
  assert.match(svc, /return coordinatesStillPending\(items, attempted\);/);
  assert.match(svc, /coordinatesPending \? \{ coordinatesPending: true as const \}/);
  const route = read("../../../../server/routes/plancard.routes.ts");
  assert.match(route, /coordinatesPending === true \? \{ coordinatesPending: true \}/);
  const page = read("../../pages/slip-view.tsx");
  assert.match(page, /refetchInterval: \(query\) =>\s*plancardRefetchInterval\(/);
});

test("S6 item 8: pending lookups poll the plancard and label their rows until the facts land", () => {
  assert.equal(plancardRefetchInterval({ factsPendingItemIds: ["a"] }), PLANCARD_PENDING_REFETCH_MS);
  assert.equal(plancardRefetchInterval({ factsPendingItemIds: [] }), false);
  assert.equal(showsCheckingHours("a", ["a", "b"], false), true);
  assert.equal(showsCheckingHours("a", ["a"], true), false, "a row with its facts line shows the facts");
  assert.equal(showsCheckingHours("c", ["a"], false), false, "an item not being checked shows nothing");
  assert.equal(showsCheckingHours("a", undefined, false), false);
  assert.equal(CHECKING_HOURS_LABEL, "checking hours…");
  const slip = read("../../components/plancard/SlipView.tsx");
  assert.match(slip, /checkingHours=\{showsCheckingHours\(a\.id, data\.factsPendingItemIds,/);
});

test("S7 item 10: arrival/departure copy is ours or station-specific", () => {
  assert.equal(isAcceptableArrivalLine("Arrival in Kyoto", "Kyoto", "arrival"), true);
  assert.equal(isAcceptableArrivalLine("Arrive at Kyoto Station and drop bags", "Kyoto", "arrival"), true);
  assert.equal(isAcceptableArrivalLine("Departure from Kyoto", "Kyoto", "departure"), true);
  assert.equal(isAcceptableArrivalLine("Depart from Kyoto Station on the Shinkansen", "Kyoto", "departure"), true);
  assert.equal(isAcceptableArrivalLine("Check-in & Hotel Orientation", "Kyoto", "arrival"), false);
  assert.equal(isAcceptableArrivalLine("Arrive at your hotel near Kyoto Station", "Kyoto", "arrival"), false);
  assert.equal(isAcceptableArrivalLine("Explore Kyoto", "Kyoto", "arrival"), false);
});
