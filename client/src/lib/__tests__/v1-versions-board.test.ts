/**
 * V-1 (ledger `2026-10-11-v1-version-sanity`): the versions board's client half.
 *
 *   W1 the free re-time window names its day — "today", "tomorrow", else the date — never a time alone
 *   W2 a Trip Pass holder's re-time is free past the per-version count, and the line shows no count
 *   W3 the run's sanity flags read as one line each, names included
 *   W4 the anchor kind: only a hotel is a stay; a neighbourhood or an activity is a venue
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { retimeLine } from "@shared/version-board";
import {
  retimeGate,
  runChargeLine,
  isBaselineVersion,
  versionAnchorIsStay,
  versionAroundLabel,
  versionFlagLines,
  versionMapAnchor,
  versionMapAnchorKind,
  versionsBuiltAroundOneStay,
  windowEndLabel,
  type VersionsBoardView,
} from "../versions-board";

const fmt = { formatDate: () => "Oct 5", formatTime: () => "3:00 PM" };

test("W1 the window's end carries its day", () => {
  const now = new Date(2026, 9, 3, 9, 0);
  assert.equal(windowEndLabel(new Date(2026, 9, 3, 15, 0).toISOString(), now, fmt), "3:00 PM today");
  assert.equal(windowEndLabel(new Date(2026, 9, 4, 15, 0).toISOString(), now, fmt), "3:00 PM tomorrow");
  assert.equal(windowEndLabel(new Date(2026, 9, 5, 15, 0).toISOString(), now, fmt), "Oct 5, 3:00 PM");
  const paid = { basis: "paid" as const, amountCents: 599, currency: "usd", at: new Date(2026, 9, 3, 15, 0).toISOString() };
  assert.equal(
    runChargeLine(paid, { ...fmt, formatDate: () => "Oct 3", windowEndsAt: new Date(2026, 9, 4, 15, 0).toISOString(), now: new Date(2026, 9, 3, 16, 0) }),
    "Paid Oct 3 · $5.99 · free re-times until 3:00 PM tomorrow",
  );
});

test("W2 unlimited re-times: free past the count, and no count is shown", () => {
  const runAt = new Date(2026, 9, 3, 9, 0);
  const view = (unlimited: boolean): Pick<VersionsBoardView, "plan" | "run" | "retimes"> => ({
    plan: { stops: [{ id: "p1", name: "Gion", dayNumber: 1, sourceVariantId: "vA" } as any] },
    run: { comparisonId: "c", runId: "r", runAt: runAt.toISOString() },
    retimes: { limit: 3, used: { vA: 3 }, windowEndsAt: null, free: {}, unlimited },
  });
  const now = new Date(2026, 9, 3, 12, 0);
  const counted = retimeGate(view(false), 1, now, "$5.99");
  assert.equal(counted.free, false, "without a pass the fourth is paid");
  const pass = retimeGate(view(true), 1, now, "$5.99");
  assert.equal(pass.free, true);
  assert.equal(pass.line, "Re-timing a day is free");
  assert.equal(retimeLine({ free: true, remaining: 0, feeLabel: null, unlimited: true }), "Re-timing a day is free");
  assert.equal(retimeLine({ free: true, remaining: 2, feeLabel: null }), "Re-timing a day is free · 2 left");
});

test("W3 sanity flags read as lines, names included", () => {
  assert.deepEqual(versionFlagLines(undefined), []);
  assert.deepEqual(
    versionFlagLines([
      { key: "untimed_stops", count: 2, stopNames: ["Gion", "Nishiki"] },
      { key: "duplicate_dinner", count: 2, stopNames: ["Pontocho", "Izakaya"] },
      { key: "late_start", count: 1, stopNames: ["Bar crawl"] },
    ]),
    ["2 stops have no time: Gion, Nishiki", "More than one dinner on a day: Pontocho, Izakaya", "Starts late: Bar crawl"],
  );
  assert.deepEqual(versionFlagLines([{ key: "untimed_stops", count: 1, stopNames: ["Gion"] }]), ["1 stop has no time: Gion"]);
});

test("W4 only a hotel anchor is a stay", () => {
  const a = (type: string | null) => ({ name: "X", type, lat: 1, lng: 2 });
  assert.equal(versionMapAnchorKind(a("hotel")), "stay");
  assert.equal(versionMapAnchorKind(a("neighborhood")), "venue");
  assert.equal(versionMapAnchorKind(a("activity")), "venue");
  assert.equal(versionAnchorIsStay(a(null)), false, "an older payload with no type makes no stay claim");
  assert.equal(versionAnchorIsStay(null), false);
});

test("W5 the baseline row never produces an around label, even with anchor columns set", () => {
  const anchor = { name: "Gion", type: "hotel" as const, lat: 35, lng: 135.7 };
  const baseline = {
    variantId: "base",
    label: "Your plan",
    name: "Your Plan",
    source: "user" as const,
    badge: null,
    anchor,
    stops: [],
    days: [],
  };
  assert.equal(isBaselineVersion(baseline), true);
  assert.equal(versionAroundLabel(baseline), "");
  assert.equal(versionMapAnchorKind(anchor, baseline), null);
  assert.equal(versionMapAnchor(baseline), null);
  assert.equal(versionsBuiltAroundOneStay([baseline]), false);
  assert.equal(versionAroundLabel({ name: "Your Plan", anchor: { name: "Gion", type: "neighborhood" } }), "");

  const fixed = { name: "Your plan, fixed", anchor: { name: "Gion", type: "hotel" } };
  assert.equal(isBaselineVersion(fixed), false);
  assert.equal(versionAroundLabel(fixed), " · around Gion");
  assert.equal(versionMapAnchorKind(fixed.anchor, fixed), "stay");
  const neighborhood = {
    ...baseline,
    name: "Neighbourhood days",
    source: undefined,
    anchor: { name: "Gion", type: "neighborhood" as const, lat: 35, lng: 135.7 },
  };
  assert.equal(versionAroundLabel(neighborhood), " · around Gion");
  assert.equal(versionMapAnchorKind(neighborhood.anchor, neighborhood), "venue");
  assert.equal(versionsBuiltAroundOneStay([baseline, { ...neighborhood, name: "Quiet" } as any]), false);
  assert.equal(
    versionsBuiltAroundOneStay([
      baseline,
      { ...baseline, name: "Quiet", source: undefined, variantId: "a" } as any,
    ]),
    true,
  );
});
