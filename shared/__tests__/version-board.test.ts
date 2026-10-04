/**
 * The versions board's pure rules (surface step 5; ledger `2026-10-04-surface-step5-map-versions`).
 *
 *   V1 diff by item id: moved (another day / position / start), dropped (held nowhere), added (no plan
 *      item), identical (nothing changed)
 *   V2 parity on the STORED smoke-6 fixture: a version carrying source_item_id diffs by id; the same
 *      version without ids (an older run) diffs by listing/title and the day says "matched by name";
 *      a title collision says so even with ids
 *   V3 badge rule: one badge per card, only a strict winner, none where any version lacks the data;
 *      the labels are relative, never a value
 *   V4 the change summary line; "Same as draft"
 *   V5 R-ac: free inside 24 h and under the limit, paid after either
 *
 * Run: npx tsx --test shared/__tests__/version-board.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BADGE_LABELS,
  daySummary,
  diffVersionDays,
  retimeIsFree,
  retimeLine,
  versionBadges,
  versionLabel,
  type BoardStop,
} from "../version-board";

const plan: BoardStop[] = [
  { id: "p1", name: "Kiyomizu-dera", dayNumber: 1, startTime: "09:00" },
  { id: "p2", name: "Gion", dayNumber: 1, startTime: "11:00" },
  { id: "p3", name: "Kinkaku-ji", dayNumber: 2, startTime: "09:00" },
  { id: "p4", name: "Ryoan-ji", dayNumber: 2, startTime: "11:00" },
];

test("V1 moved / dropped / added / identical, by item id", () => {
  const version: BoardStop[] = [
    { id: "v1", sourceItemId: "p1", name: "Kiyomizu-dera", dayNumber: 1, startTime: "09:00" },
    { id: "v2", sourceItemId: "p2", name: "Gion", dayNumber: 1, startTime: "11:00" },
    // day 2: Ryoan-ji moved first, Kinkaku-ji dropped, a new stop added
    { id: "v3", sourceItemId: "p4", name: "Ryoan-ji", dayNumber: 2, startTime: "09:00" },
    { id: "v4", sourceItemId: null, name: "Nishiki Market", dayNumber: 2, startTime: "12:00" },
  ];
  const [d1, d2] = diffVersionDays(plan, version);
  assert.equal(d1.identical, true);
  assert.deepEqual(d1.kept.map((k) => k.planItemId), ["p1", "p2"]);
  assert.equal(d2.identical, false);
  assert.deepEqual(d2.moved, [{ versionStopId: "v3", planItemId: "p4" }]);
  assert.deepEqual(d2.dropped, ["p3"]);
  assert.deepEqual(d2.added, ["v4"]);
  assert.equal(d2.matchedByName, false);
  // A stop moved to ANOTHER day is moved on its new day and not dropped from the old one's count.
  const across = diffVersionDays(plan, [{ id: "x", sourceItemId: "p3", name: "Kinkaku-ji", dayNumber: 1, startTime: "15:00" }]);
  assert.deepEqual(across[0].moved, [{ versionStopId: "x", planItemId: "p3" }]);
  assert.ok(!across[1].dropped.includes("p3"));
});

test("V2 parity on the stored smoke-6 fixture: by id, by name for an older run, and a title collision", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fx = JSON.parse(readFileSync(path.resolve(here, "../../server/__tests__/fixtures/smoke6-plancard.json"), "utf8"));
  const planStops: BoardStop[] = fx.days.flatMap((d: any, i: number) =>
    d.activities.map((a: any) => ({ id: a.id, name: a.name ?? a.title, dayNumber: i + 1, startTime: a.startTime ?? a.time ?? null })),
  );
  assert.ok(planStops.length >= 20);
  // A version that keeps every stop but swaps the first two of day 1.
  const day1 = planStops.filter((s) => s.dayNumber === 1);
  const withIds: BoardStop[] = planStops.map((s, i) => ({ ...s, id: `v${i}`, sourceItemId: s.id }));
  const swap = (arr: BoardStop[]) => {
    const a = arr.slice();
    const i0 = a.findIndex((s) => s.dayNumber === 1);
    [a[i0], a[i0 + 1]] = [a[i0 + 1], a[i0]];
    return a;
  };
  const byId = diffVersionDays(planStops, swap(withIds));
  assert.equal(byId[0].moved.length, 2, "the two swapped stops moved");
  assert.equal(byId[0].matchedByName, false);
  for (const d of byId.slice(1)) assert.equal(d.identical, true, `day ${d.dayNumber} is the draft`);
  // The same version from an OLDER run (no source ids): the same answer, matched by name.
  const noIds = swap(withIds.map((s) => ({ ...s, sourceItemId: null })));
  const byName = diffVersionDays(planStops, noIds);
  assert.equal(byName[0].moved.length, 2);
  assert.equal(byName[0].matchedByName, true);
  assert.equal(byName[1].matchedByName, true, "every day matched by title says so");
  assert.equal(byName[1].identical, true);
  // A title collision says "matched by name" even with ids.
  const dup = withIds.map((s) => (s.id === `v${planStops.indexOf(day1[1])}` ? { ...s, name: day1[0].name } : s));
  const collided = diffVersionDays(planStops, dup);
  assert.equal(collided[0].matchedByName, true);
});

test("V3 one badge per card, strict winners only, relative labels", () => {
  const mk = (id: string, gap: number, dur: number, end: string): { id: string; stops: BoardStop[] } => ({
    id,
    stops: [
      { id: `${id}a`, name: "a", dayNumber: 1, startTime: "09:00", endTime: "10:00", durationMinutes: dur, lat: 35, lng: 135.7 },
      { id: `${id}b`, name: "b", dayNumber: 1, startTime: "10:30", endTime: end, durationMinutes: dur, lat: 35 + gap, lng: 135.7 },
    ],
  });
  const badges = versionBadges([mk("A", 0.01, 60, "17:00"), mk("B", 0.05, 120, "19:00"), mk("C", 0.03, 60, "16:00")]);
  assert.equal(badges.get("A"), "least_travel");
  assert.equal(badges.get("B"), "most_time_at_stops");
  assert.equal(badges.get("C"), "earliest_evenings");
  // A tie badges nobody; missing data badges nobody.
  const tie = versionBadges([mk("A", 0.01, 60, "17:00"), mk("B", 0.01, 60, "17:00")]);
  assert.equal(tie.size, 0);
  const missing = versionBadges([
    mk("A", 0.01, 60, "17:00"),
    { id: "B", stops: [{ id: "x", name: "x", dayNumber: 1 }] },
  ]);
  assert.equal(missing.has("A"), false);
  // One card wins everything ⇒ still ONE badge.
  const sweep = versionBadges([mk("A", 0.01, 120, "16:00"), mk("B", 0.05, 60, "19:00")]);
  assert.deepEqual(Array.from(sweep.entries()), [["A", "least_travel"]]);
  for (const label of Object.values(BADGE_LABELS)) assert.doesNotMatch(label, /\d/);
});

test("V4 the per-day line", () => {
  const [, d2] = diffVersionDays(plan, [
    { id: "v1", sourceItemId: "p1", name: "Kiyomizu-dera", dayNumber: 1, startTime: "09:00" },
    { id: "v2", sourceItemId: "p2", name: "Gion", dayNumber: 1, startTime: "11:00" },
    { id: "v3", sourceItemId: "p4", name: "Ryoan-ji", dayNumber: 2, startTime: "09:00" },
    { id: "v4", name: "Nishiki", dayNumber: 2 },
  ]);
  assert.equal(daySummary(d2), "1 moved · 1 dropped · 1 added");
  assert.equal(daySummary({ dayNumber: 1, moved: [], dropped: [], added: [], kept: [], identical: true, matchedByName: false }), "Same as draft");
  assert.deepEqual([0, 1, 2].map(versionLabel), ["A", "B", "C"]);
});

test("V5 R-ac free re-times", () => {
  const runAt = new Date("2026-10-04T00:00:00Z");
  const at = (h: number) => new Date(runAt.getTime() + h * 3600_000);
  assert.equal(retimeIsFree({ runAt, now: at(1), used: 0, limit: 3 }), true);
  assert.equal(retimeIsFree({ runAt, now: at(1), used: 2, limit: 3 }), true);
  assert.equal(retimeIsFree({ runAt, now: at(1), used: 3, limit: 3 }), false, "the fourth is paid");
  assert.equal(retimeIsFree({ runAt, now: at(25), used: 0, limit: 3 }), false, "after 24 h it is paid");
  assert.equal(retimeIsFree({ runAt: null, now: at(1), used: 0, limit: 3 }), false);
  assert.equal(retimeLine({ free: true, remaining: 2, feeLabel: "<fee>" }), "Re-timing a day is free · 2 left");
  assert.equal(retimeLine({ free: false, remaining: 0, feeLabel: "<fee>" }), "Re-timing now is a paid run · Optimize · <fee>");
});
