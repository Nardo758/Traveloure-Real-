/**
 * 9b-c (Leon's ruling, Oct 17, 2026): a routed drive leg the traveler did not choose has no leave-by, and it
 * KEEPS its duration line. The leave-by is omitted; the leg line between the two stops is unchanged.
 *   DL1 the core answers `ineligible_mode` with no line for that stop
 *   DL2 the card's leave-by line draws nothing for it
 *   DL3 the leg's own line still draws its minutes and provenance
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/leave-by-drive-leg.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { getUpNextInfo } from "../plancard-temporal";
import { LeaveByLine, LegLine } from "../TripCardDays";

(globalThis as any).React = React;

const day = {
  dayNum: 1,
  date: "Wed, Nov 4",
  dateIso: "2026-11-04",
  label: "Day 1",
  activities: [
    { id: "a", name: "A", time: "09:00", endTime: "10:00", lat: 35.0, lng: 135.77 },
    { id: "b", name: "B", time: "14:00", lat: 35.01, lng: 135.78 },
  ],
};
const driveLeg = {
  id: "L",
  legOrder: 1,
  fromName: "A",
  toName: "B",
  fromActivityId: "a",
  toActivityId: "b",
  recommendedMode: "driving",
  userSelectedMode: null,
  distanceDisplay: "6 km",
  estimatedDurationMinutes: 18,
  estimatedCostUsd: null,
  routed: { line: null, fare: null, provenance: { source: "osrm", checkedAt: "2026-11-01T00:00:00Z" } },
};

describe("a routed drive leg the traveler did not choose", () => {
  const now = new Date("2026-11-04T03:00:00Z"); // 12:00 in Tokyo
  const info = getUpNextInfo(day as any, [driveLeg] as any, now, new Set(), "Asia/Tokyo");
  const row = info.leaveByRows.find((r) => r.stopId === "b") ?? null;

  it("DL1: no leave-by, and no reason line", () => {
    assert.deepEqual(row, { kind: "none", stopId: "b", reason: "ineligible_mode", line: null });
  });

  it("DL2: the card's leave-by line draws nothing", () => {
    assert.equal(renderToString(<LeaveByLine row={row} rows={info.leaveByRows} nowMinute={info.nowMinute} stopName="B" stopId="b" />), "");
  });

  it("DL3: the leg keeps its duration line", () => {
    const html = renderToString(<LegLine leg={driveLeg as any} showMinutes={true} timeZone="Asia/Tokyo" />);
    assert.match(html, /data-testid="card-leg-L"/);
    assert.match(html, /18 min/);
  });
});
