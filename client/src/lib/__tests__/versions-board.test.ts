/**
 * Surface step 5 — the versions board's client rules (ledger `2026-10-04-surface-step5-map-versions`;
 * spec §2.4; boards 4a/4b/4c; R-ac).
 *   VB1 4a cards: one badge only where the metric wins, per-day summaries, Adopt all
 *   VB2 4b: a day identical to the draft collapses; Take this day; the pick strip; Apply N days
 *   VB3 4c: the DAY drags across columns (and only onto its own day)
 *   VB4 4c: a stop reorders within its day ⇒ re-time; across days ⇒ nothing
 *   VB5 4c: a stop dragged in from a version is a swap-in ⇒ the same re-time
 *   VB6 the free re-time counter, per adopted version, inside the run's 24 hours
 *   VB7 the paid re-time gate copy is said BEFORE anything happens, with the fee
 *   VB8 where you stay follows the version most adopted days come from
 *   VB9 the board's wiring: Apply writes only picked days; no draft delete; no minutes
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { diffVersionDays, versionBadges, type BoardStop } from "@shared/version-board";
import {
  adoptAllPicks,
  applyBody,
  applyLabel,
  chooseCards,
  dayColumns,
  decodeDrag,
  dropOnPlanDay,
  encodeDrag,
  pickStrip,
  releaseDay,
  reorderStop,
  retimeGate,
  stayVersion,
  takeDay,
  type VersionsBoardView,
} from "../versions-board";

const ROOT = path.resolve(import.meta.dirname, "../../../..");

const plan: BoardStop[] = [
  { id: "p1", name: "Kinkaku-ji", dayNumber: 1, startTime: "09:00", endTime: "10:30", durationMinutes: 90, lat: 35.0394, lng: 135.7292 },
  { id: "p2", name: "Nishiki Market", dayNumber: 1, startTime: "12:00", endTime: "13:00", durationMinutes: 60, lat: 35.005, lng: 135.765 },
  { id: "p3", name: "Tenryu-ji", dayNumber: 2, startTime: "09:00", endTime: "10:00", durationMinutes: 60, lat: 35.0158, lng: 135.6737, sourceVariantId: "vB" },
  { id: "p4", name: "Bamboo Grove", dayNumber: 2, startTime: "10:30", endTime: "11:30", durationMinutes: 60, lat: 35.017, lng: 135.672, sourceVariantId: "vB" },
];
const stopsA: BoardStop[] = [
  { id: "a1", sourceItemId: "p1", name: "Kinkaku-ji", dayNumber: 1, startTime: "09:00", endTime: "10:30", durationMinutes: 90, lat: 35.0394, lng: 135.7292 },
  { id: "a2", sourceItemId: "p2", name: "Nishiki Market", dayNumber: 1, startTime: "12:00", endTime: "13:00", durationMinutes: 60, lat: 35.005, lng: 135.765 },
  { id: "a3", sourceItemId: "p3", name: "Tenryu-ji", dayNumber: 2, startTime: "09:00", endTime: "10:00", durationMinutes: 60, lat: 35.0158, lng: 135.6737 },
  { id: "a4", sourceItemId: "p4", name: "Bamboo Grove", dayNumber: 2, startTime: "10:30", endTime: "11:30", durationMinutes: 60, lat: 35.017, lng: 135.672 },
];
const stopsB: BoardStop[] = [
  { id: "b1", sourceItemId: "p2", name: "Nishiki Market", dayNumber: 1, startTime: "09:00", endTime: "10:00", durationMinutes: 60, lat: 35.005, lng: 135.765 },
  { id: "b2", name: "Fushimi Inari", dayNumber: 1, startTime: "11:00", endTime: "13:00", durationMinutes: 120, lat: 34.9671, lng: 135.7727 },
  { id: "b3", sourceItemId: "p3", name: "Tenryu-ji", dayNumber: 2, startTime: "09:00", endTime: "10:00", durationMinutes: 60, lat: 35.0158, lng: 135.6737 },
  { id: "b4", sourceItemId: "p4", name: "Bamboo Grove", dayNumber: 2, startTime: "10:30", endTime: "11:30", durationMinutes: 60, lat: 35.017, lng: 135.672 },
];
const stopsC: BoardStop[] = [
  { id: "c1", sourceItemId: "p1", name: "Kinkaku-ji", dayNumber: 1, startTime: "08:00", endTime: "09:30", durationMinutes: 90, lat: 35.0394, lng: 135.7292 },
  { id: "c2", sourceItemId: "p4", name: "Bamboo Grove", dayNumber: 2, startTime: "08:00", endTime: "09:00", durationMinutes: 60, lat: 35.017, lng: 135.672 },
];

const RUN_AT = "2026-10-04T08:00:00.000Z";
function makeView(used: Record<string, number> = {}): VersionsBoardView {
  const vs = [
    { variantId: "vA", label: "A", stops: stopsA },
    { variantId: "vB", label: "B", stops: stopsB },
    { variantId: "vC", label: "C", stops: stopsC },
  ];
  const badges = versionBadges(vs.map((v) => ({ id: v.variantId, stops: v.stops })));
  return {
    run: { comparisonId: "cmp", runId: "run1", runAt: RUN_AT },
    plan: { stops: plan },
    versions: vs.map((v) => ({
      variantId: v.variantId,
      label: v.label,
      name: `Version ${v.label}`,
      badge: badges.get(v.variantId) ?? null,
      anchor: v.label === "B" ? { name: "Ryokan Gion", lat: 35.003, lng: 135.775 } : null,
      stops: v.stops,
      days: diffVersionDays(plan, v.stops),
    })),
    retimes: { limit: 3, used, windowEndsAt: "2026-10-05T08:00:00.000Z", free: {} },
  };
}
const WITHIN = new Date("2026-10-04T12:00:00.000Z");
const AFTER = new Date("2026-10-05T09:00:00.000Z");

test("VB1 4a cards: a badge only on a winner, the per-day line, and Adopt all takes every day of that version", () => {
  const view = makeView();
  const cards = chooseCards(view);
  assert.equal(cards.length, 3);
  const withBadge = cards.filter((c) => c.badge);
  assert.ok(withBadge.length <= 3);
  for (const c of withBadge) assert.ok(["Least travel", "Most time at stops", "Earliest evenings"].includes(c.badge!), "relative labels only");
  for (const c of cards) assert.ok(!/\d+\s*(min|h\b|hour|km)/.test(JSON.stringify(c)), "no minute, hour or distance leaves");
  const a = cards.find((c) => c.label === "A")!;
  assert.deepEqual(a.days.map((d) => d.summary), ["Same as draft", "Same as draft"]);
  assert.match(cards.find((c) => c.label === "B")!.days[0].summary, /moved|dropped|added/);
  assert.deepEqual(adoptAllPicks(view, "vB"), { 1: "vB", 2: "vB" });
  // A version that drops a whole day still owns that day under Adopt all.
  assert.deepEqual(adoptAllPicks(view, "vC"), { 1: "vC", 2: "vC" });
});

test("VB2 4b: an identical day collapses to 'Same as draft'; Take this day picks it; the strip and Apply N days", () => {
  const view = makeView();
  const day2 = dayColumns(view, 2);
  assert.equal(day2.find((c) => c.label === "A")!.identical, true);
  assert.deepEqual(day2.find((c) => c.label === "A")!.stops, [], "collapsed ⇒ no stop list");
  assert.equal(day2.find((c) => c.label === "C")!.identical, false);
  let picks = takeDay({}, 1, "vB");
  picks = takeDay(picks, 2, "vC");
  assert.deepEqual(pickStrip(view, picks), [{ dayNumber: 1, label: "B" }, { dayNumber: 2, label: "C" }]);
  assert.equal(applyLabel(picks), "Apply 2 days");
  picks = takeDay(picks, 1, "vA");
  assert.equal(picks[1], "vA", "taking the same day again replaces the pick — one version per day");
  picks = releaseDay(picks, 2);
  assert.equal(applyLabel(picks), "Apply 1 day");
  assert.deepEqual(applyBody(picks), { days: [{ day: 1, variantId: "vA" }] });
});

test("VB3 4c: dragging a version's DAY onto Your plan's same day picks it; onto another day does nothing", () => {
  const view = makeView();
  const raw = encodeDrag({ kind: "day", variantId: "vB", dayNumber: 1 });
  const drag = decodeDrag(raw)!;
  const ok = dropOnPlanDay(view, {}, 1, drag, 0);
  assert.equal(ok.action, "pick");
  assert.deepEqual((ok as any).picks, { 1: "vB" });
  assert.equal(dropOnPlanDay(view, {}, 2, drag, 0).action, "none", "the unit is the day — it lands on its own day");
  assert.equal(decodeDrag("not json"), null);
  assert.equal(decodeDrag(JSON.stringify({ kind: "day", variantId: 3 })), null);
});

test("VB4 4c: a stop reorders within its day and re-times; dropping it on another day does nothing", () => {
  const view = makeView();
  assert.deepEqual(reorderStop(["p3", "p4"], "p4", 0), ["p4", "p3"]);
  assert.deepEqual(reorderStop(["p3", "p4"], "zz", 0), ["p3", "p4"]);
  const out = dropOnPlanDay(view, {}, 2, { kind: "stop", dayNumber: 2, id: "p4" }, 0);
  assert.deepEqual(out, { action: "retime", order: ["p4", "p3"], swapIn: null });
  assert.equal(dropOnPlanDay(view, {}, 2, { kind: "stop", dayNumber: 2, id: "p3" }, 0).action, "none", "no move ⇒ no re-time");
  assert.equal(dropOnPlanDay(view, {}, 1, { kind: "stop", dayNumber: 2, id: "p4" }, 0).action, "none");
});

test("VB5 4c: a stop dragged in from a version is a swap-in and triggers the same re-time", () => {
  const view = makeView();
  const out = dropOnPlanDay(view, {}, 1, { kind: "swap", variantId: "vB", dayNumber: 1, variantItemId: "b2" }, 1);
  assert.deepEqual(out, { action: "retime", order: ["p1", "p2"], swapIn: { variantItemId: "b2" } });
});

test("VB6 the free re-time counter: per the day's adopted version, inside 24 h of the run", () => {
  // Day 2 was adopted from B; two of B's three free re-times are used.
  let g = retimeGate(makeView({ vB: 2 }), 2, WITHIN, "$5.00");
  assert.equal(g.free, true);
  assert.equal(g.remaining, 1);
  assert.equal(g.line, "Re-timing a day is free · 1 left");
  // Day 1 was never adopted: it counts under no version, separately.
  assert.equal(retimeGate(makeView({ vB: 3 }), 1, WITHIN, null).free, true);
  g = retimeGate(makeView({ vB: 3 }), 2, WITHIN, "$5.00");
  assert.equal(g.free, false, "the fourth is not free");
  assert.equal(retimeGate(makeView(), 2, AFTER, "$5.00").free, false, "past 24 h of the paid run");
});

test("VB7 the paid re-time gate copy states the paid run and its fee before it happens", () => {
  const paid = retimeGate(makeView({ vB: 3 }), 2, WITHIN, "$5.00");
  assert.equal(paid.line, "Re-timing now is a paid run · Optimize · $5.00");
  assert.equal(retimeGate(makeView({ vB: 3 }), 2, WITHIN, null).line, "Re-timing now is a paid run");
  const board = fs.readFileSync(path.join(ROOT, "client/src/components/plancard/VersionsBoard.tsx"), "utf8");
  // The gate is decided BEFORE the POST: a paid gate opens the notice and never calls the rail.
  assert.match(board, /if \(!gate\.free\) \{\s*setPaidGate\(\{ dayNumber, line: gate\.line \}\);\s*return;\s*\}/);
  assert.match(board, /data-testid="versions-retime-paid"/);
  assert.match(board, /Nothing has been changed\./);
});

test("VB8 where you stay follows the version most adopted days come from", () => {
  const view = makeView();
  assert.equal(stayVersion(view, {}), null);
  assert.equal(stayVersion(view, { 1: "vB", 2: "vB" })!.label, "B");
  assert.equal(stayVersion(view, { 1: "vA", 2: "vB", 3: "vB" })!.label, "B");
  assert.equal(stayVersion(view, { 1: "vA", 2: "vB" })!.label, "A", "ties go to the earlier version");
});

test("VB9 wiring: apply-days sends picked days only; the board shows clock times, never durations", () => {
  const board = fs.readFileSync(path.join(ROOT, "client/src/components/plancard/VersionsBoard.tsx"), "utf8");
  assert.match(board, /\/versions\/apply-days`, applyBody\(p\)/);
  assert.ok(!/DELETE/.test(board), "the board never deletes");
  assert.ok(!/durationMinutes|minutes\}/.test(board), "no minute values are drawn");
  assert.match(board, /Run of \{runDateLabel\(view\.run\.runAt\)\}/, "labelled with the run date");
  assert.match(board, /DESKTOP_QUERY = "\(min-width: 1024px\)"/);
});
