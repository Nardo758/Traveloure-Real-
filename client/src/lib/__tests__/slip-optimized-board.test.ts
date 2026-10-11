/**
 * THE OPTIMIZED BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-optimized-board`). The
 * card totals are read off the shared day diffs; nothing is re-derived and nothing is invented.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { boardDayLabel, optimizedHeadline, versionTotalChips, versionTotals } from "../versions-board";

const day = (n: number, o: Partial<{ moved: number; dropped: number; added: number; identical: boolean }> = {}) => ({
  dayNumber: n,
  kept: [],
  moved: Array.from({ length: o.moved ?? 0 }, (_, i) => ({ versionStopId: `v${n}${i}`, planItemId: `p${n}${i}` })),
  dropped: Array.from({ length: o.dropped ?? 0 }, (_, i) => `d${n}${i}`),
  added: Array.from({ length: o.added ?? 0 }, (_, i) => `a${n}${i}`),
  identical: !!o.identical,
  matchedByName: false,
}) as any;

test("O1: totals sum the diffs; unchanged counts identical days", () => {
  const t = versionTotals([day(1, { identical: true }), day(2, { moved: 2 }), day(3, { dropped: 1, added: 1 })]);
  assert.deepEqual(t, { unchanged: 1, moved: 2, dropped: 1, added: 1 });
});

test("O2: chips say each count as the board does; 'added' only when any; a drop is flagged", () => {
  assert.deepEqual(versionTotalChips({ unchanged: 4, moved: 2, dropped: 0, added: 0 }), [
    { key: "unchanged", text: "4 days unchanged" },
    { key: "moved", text: "2 stops moved" },
    { key: "dropped", text: "0 dropped", warn: false },
  ]);
  const c = versionTotalChips({ unchanged: 1, moved: 1, dropped: 1, added: 2 });
  assert.equal(c[0].text, "1 day unchanged");
  assert.equal(c[1].text, "1 stop moved");
  assert.equal(c[2].warn, true);
  assert.deepEqual(c[3], { key: "added", text: "2 added" });
});

test("O3: a day is its weekday only from a machine date, else 'Day N'", () => {
  assert.equal(boardDayLabel(1, "2027-11-11"), "Thu");
  assert.equal(boardDayLabel(2, null), "Day 2");
  assert.equal(boardDayLabel(3, "Nov 13"), "Day 3");
});

test("O4: the headline counts the run's versions and the plan's days", () => {
  assert.equal(optimizedHeadline(3, 5), "Three ways to spend these five days");
  assert.equal(optimizedHeadline(2, 1), "Two ways to spend this day");
  assert.equal(optimizedHeadline(3, 14), "Three ways to spend these 14 days");
});

test("O5: every choose-mode testid stays; 'around <place>' is said only from the version's own anchor", () => {
  const src = readFileSync(new URL("../../components/plancard/VersionsBoard.tsx", import.meta.url), "utf8");
  for (const id of ["versions-card-${c.label}", "versions-card-day-${c.label}-${d.dayNumber}", "versions-adopt-all-${c.label}", "versions-by-day-${c.label}", "versions-badge-${c.label}", "versions-run-date"]) {
    assert.ok(src.includes(id), id);
  }
  assert.match(src, /v\?\.anchor\?\.name \? ` · around \$\{v\.anchor\.name\}` : ""/);
  assert.match(src, /allAnchored \? "Each version is built around one place to stay\. " : ""/);
});
