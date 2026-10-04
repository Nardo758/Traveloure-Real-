/**
 * Smoke 9 (plan 2b7d07be) — pure rules and source pins (ledger `2026-10-04-smoke9-fixes`).
 *
 *   A1 S9-1 lodging anchor types are not items; the slip reads the server's draft count
 *   A2 S9-4 the optimizer card renders under the tools tray at every width (a portal slot right
 *      after the tray), and reads "Draft first" until the plan is drafted
 *   A3 S9-5 the amber line counts stops before an arrival / past a departure, no minute values
 *
 * Run: npx tsx --test client/src/lib/__tests__/smoke9-fixes.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPlanAnchorItemType } from "@shared/draft-basis";
import { flightTimeConflictLine } from "@shared/getting-there";
import { slipBuildAiAction, slipDraftItemCount } from "../slip-rail";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(path.resolve(here, "..", "..", rel), "utf8");

test("A1 S9-1: a lodging anchor is not an item; the slip reads the server's count", () => {
  for (const t of ["accommodation", "Hotel", " ryokan "]) assert.equal(isPlanAnchorItemType(t), true, t);
  for (const t of ["attraction", "dining", "transport", null, ""]) assert.equal(isPlanAnchorItemType(t), false, String(t));
  // A plan holding only its stay: the server answers 0 ⇒ "Draft it with AI".
  assert.equal(slipBuildAiAction(slipDraftItemCount(0, 1)), "draft");
  assert.equal(slipBuildAiAction(slipDraftItemCount(1, 1)), "optimize");
  // Before the plancard answers, the plain count stands in.
  assert.equal(slipDraftItemCount(undefined, 3), 3);
});

test("A2 S9-4: the optimizer card sits directly under the tray, and says Draft first before a draft", () => {
  const view = src("components/plancard/SlipView.tsx");
  const tray = view.indexOf("onOpenToolChange={setOpenTool}");
  const slot = view.indexOf('data-testid="slip-optimizer-slot"');
  assert.ok(tray > 0 && slot > tray, "the slot follows the tray");
  const between = view.slice(tray, slot);
  assert.doesNotMatch(between, /<(AnchorPanel|DayBlock|Card)\b/, "nothing renders between the tray and the optimizer");
  const rail = src("components/plancard/SlipRail.tsx");
  assert.match(rail, /createPortal\(optimizerBlock, optimizerSlot\)/);
  assert.match(rail, /drafted=\{aiAction === "optimize"\}/);
  assert.doesNotMatch(rail, /isOwner && aiAction === "optimize" && \(/, "the card no longer hides on an undrafted plan");
});

test("A3 S9-5: stops outside the flight, counted, never a minute value", () => {
  const stops = [
    { id: "arr", startTime: "08:30" },
    { id: "a", startTime: "08:00" },
    { id: "b", startTime: "10:00", endTime: "11:00" },
    { id: "c", startTime: "TBD" },
  ];
  assert.equal(flightTimeConflictLine("arrival", "09:05", stops, "arr"), "1 stop on this day starts before your flight lands");
  assert.equal(flightTimeConflictLine("arrival", "09:05", stops, null), "2 stops on this day start before your flight lands");
  assert.equal(flightTimeConflictLine("arrival", "07:00", stops, null), null);
  assert.equal(flightTimeConflictLine("departure", "10:30", stops, null), "1 stop on this day runs past your flight's departure");
  assert.equal(flightTimeConflictLine("departure", "10:00", [{ id: "x", startTime: "10:00" }], null), "1 stop on this day runs past your flight's departure");
  assert.equal(flightTimeConflictLine("arrival", null, stops, null), null, "no flight time ⇒ nothing claimed");
  for (const line of [flightTimeConflictLine("arrival", "09:05", stops, null), flightTimeConflictLine("departure", "10:30", stops, null)]) {
    assert.doesNotMatch(line!, /\d{1,2}:\d{2}|min|hour/i);
  }
});
