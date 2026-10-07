/**
 * Step 9c — a routed leg's mode options, the pure half (ledger `2026-10-07-step9c-leg-options`; D1–D3).
 *   L1 the candidates: at most three, the leg's current mode first, walk only within 1.2 km, transit only
 *      where the market has coverage, drive always — no chauffeured pseudo-modes
 *   L2 only what the leg does not already hold is asked (≤2 calls)
 *   L3 the stored set: entry 0 kept and stamped asked, new options de-duplicated, capped at three
 *   L4 the options a leg shows: current first, each with its own provenance; not an engine leg ⇒ null
 *   L5 a pick rotates the chosen option to entry 0 (the marker travels with it); an unknown mode ⇒ null
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LEG_OPTIONS,
  legOptionCandidates,
  legOptionsChecked,
  legOptionsToAsk,
  pickLegOption,
  routedLegOptions,
  storedLegOption,
  withLegOptions,
} from "../leg-options";

const route = (min: number, src = "stub") => ({ durationMin: min, distanceM: min * 80, line: null, fare: null, provenance: { source: src, checkedAt: "2026-10-07T01:00:00.000Z" } });
const head = { mode: "transit", durationMinutes: 14, costUsd: null, energyCost: 0, reason: "stub", line: "Stub Line", fare: { amount: 220, currency: "JPY" }, legKey: "k|transit", hourBucket: 10 };
const row = { source: "stub", calculatedAt: "2026-10-07T00:00:00.000Z", distanceMeters: 3600 };

test("L1: at most three candidates, current first, per L4's rules", () => {
  assert.deepEqual(legOptionCandidates({ current: "walk", straightLineMeters: 300, hasTransitCoverage: true }), ["walk", "transit", "drive"]);
  assert.deepEqual(legOptionCandidates({ current: "transit", straightLineMeters: 3600, hasTransitCoverage: true }), ["transit", "drive"]);
  assert.deepEqual(legOptionCandidates({ current: "drive", straightLineMeters: 3600, hasTransitCoverage: false }), ["drive"]);
  assert.deepEqual(legOptionCandidates({ current: "drive", straightLineMeters: 900, hasTransitCoverage: true }), ["drive", "walk", "transit"]);
  for (const c of [
    legOptionCandidates({ current: "cycle", straightLineMeters: 100, hasTransitCoverage: true }),
    legOptionCandidates({ current: "walk", straightLineMeters: 100, hasTransitCoverage: true }),
  ]) {
    assert.ok(c.length <= MAX_LEG_OPTIONS);
    assert.ok(c.every((m) => ["walk", "cycle", "transit", "drive"].includes(m)));
  }
});

test("L2: only the modes the leg does not hold are asked — never more than two", () => {
  assert.deepEqual(legOptionsToAsk(["walk", "transit", "drive"], ["walk"]), ["transit", "drive"]);
  assert.deepEqual(legOptionsToAsk(["transit", "drive"], ["transit", "drive"]), []);
});

test("L3: the stored set keeps entry 0, stamps it asked, adds de-duplicated options, caps at three", () => {
  const drive = storedLegOption("drive", route(9), "k|drive", 10);
  const walk = storedLegOption("walk", route(40), "k|walk", 10);
  const extra = storedLegOption("transit", route(5), "k|transit2", 10);
  assert.equal(legOptionsChecked([head]), false);
  const next = withLegOptions([head], row, [drive, walk, extra], "2026-10-07T02:00:00.000Z");
  assert.equal(next.length, 3);
  assert.equal(next[0].mode, "transit");
  assert.equal(next[0].checkedAt, "2026-10-07T00:00:00.000Z", "entry 0 takes the row's own time");
  assert.equal(next[0].distanceMeters, 3600);
  assert.ok(legOptionsChecked(next));
  assert.deepEqual(next.map((e) => e.mode), ["transit", "driving", "walking"]);
});

test("L4: the options a leg shows — current first, own provenance; not an engine leg ⇒ null", () => {
  const stored = withLegOptions([head], row, [storedLegOption("drive", route(9, "google_routes"), "k|drive", 10)], "2026-10-07T02:00:00.000Z");
  const opts = routedLegOptions({ ...row, alternativeModes: stored })!;
  assert.deepEqual(opts.map((o) => [o.mode, o.current]), [["transit", true], ["drive", false]]);
  assert.equal(opts[0].route.fare?.currency, "JPY");
  assert.equal(opts[1].route.provenance.source, "google_routes");
  assert.equal(routedLegOptions({ source: null, calculatedAt: row.calculatedAt, alternativeModes: stored }), null);
  assert.deepEqual(routedLegOptions({ ...row, alternativeModes: [head] })!.map((o) => o.mode), ["transit"], "unasked: the current mode only");
});

test("L5: a pick rotates the chosen option first, with its own facts; unknown or current ⇒ null", () => {
  const stored = withLegOptions([head], row, [storedLegOption("drive", route(9), "k|drive", 10)], "2026-10-07T02:00:00.000Z");
  const p = pickLegOption(stored, "driving")!;
  assert.deepEqual(p.entries.map((e) => e.mode), ["driving", "transit"]);
  assert.ok(legOptionsChecked(p.entries), "the asked marker travels with entry 0");
  assert.equal(p.entries[1].optionsCheckedAt, undefined);
  assert.equal(p.row.estimatedDurationMinutes, 9);
  assert.equal(p.row.recommendedMode, "driving");
  assert.equal(p.row.calculatedAt.toISOString(), "2026-10-07T01:00:00.000Z");
  assert.equal(pickLegOption(stored, "transit"), null, "already current");
  assert.equal(pickLegOption(stored, "walking"), null, "not an asked option");
  assert.equal(pickLegOption(stored, "chauffeur"), null);
  // And back again: no call, the original facts return.
  const back = pickLegOption(p.entries, "transit")!;
  assert.equal(back.row.estimatedDurationMinutes, 14);
  assert.equal(back.entries[0].line, "Stub Line");
});
