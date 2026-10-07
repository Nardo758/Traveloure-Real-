/**
 * Step 9b (ledger `2026-10-07-step9b-optimizer-and-rechecks`) — the card's "leave by" (D7) and the
 * slip's one delayed refetch (D8, FU-9A-4).
 *   V1 leaveByTime: start − leg minutes as "HH:MM"; unknown or before midnight ⇒ null (never guessed)
 *   V2 getUpNextInfo carries `leaveBy` on the live day, from the leg INTO the up-next stop (by pair)
 *   V3 not the live day ⇒ no leaveBy
 *   V4 the refetch delay exists only for a plan whose payload says `routedLegs`, and it is the
 *      server's own debounce plus the recompute
 *   V5 the card's leg-finding line reads the one helper
 *   V6 FU-9A-2: a flight anchor carrying a routed airport leg measures the day against buffer + leg;
 *      one without keeps its stored buffer; the airport row shows the minutes only when given
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/step9b-leave-by-refetch.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getUpNextInfo, leaveByTime } from "../plancard-temporal";
import { legRefetchDelayMs } from "@/lib/slip-legs";
import { PLAN_LEG_DEBOUNCE_MS, PLAN_LEG_REFETCH_DELAY_MS } from "@shared/plan-routed-legs";
import { legRecheckLine } from "@shared/leg-recheck";
import React from "react";
import { renderToString } from "react-dom/server";
import { flightAnchorFor } from "../../plan/AnchorRow";
import { LegRow } from "../../plan/LegRow";

(globalThis as any).React = React;

describe("V1 leaveByTime", () => {
  it("subtracts the leg's minutes; refuses the unknown", () => {
    assert.equal(leaveByTime("14:00", 25), "13:35");
    assert.equal(leaveByTime("2:00 PM", 25), "13:35");
    assert.equal(leaveByTime("00:10", 25), null, "never before midnight");
    assert.equal(leaveByTime(null, 25), null);
    assert.equal(leaveByTime("14:00", null), null);
    assert.equal(leaveByTime("14:00", 0), null);
  });
});

const day = (dateIso: string) => ({
  dayNum: 1,
  date: "Wed, Nov 4",
  dateIso,
  label: "Day 1",
  activities: [
    { id: "a", name: "A", time: "09:00", endTime: "10:00" },
    { id: "b", name: "B", time: "14:00" },
  ],
});
const legs = [{ id: "L", legOrder: 1, fromName: "A", toName: "B", recommendedMode: "transit", userSelectedMode: null, distanceDisplay: "3 km", estimatedDurationMinutes: 25, estimatedCostUsd: null, toActivityId: "b" }];

describe("V2/V3 getUpNextInfo.leaveBy", () => {
  it("the live day's up-next stop carries leave-by from the leg into it", () => {
    const now = new Date("2026-11-04T03:00:00Z"); // 12:00 in Tokyo
    const info = getUpNextInfo(day("2026-11-04") as any, legs as any, now, new Set(), "Asia/Tokyo");
    assert.equal(info.upNextActivity?.id, "b");
    assert.equal(info.leaveBy, "13:35");
  });
  it("another day ⇒ no leave-by", () => {
    const now = new Date("2026-11-04T03:00:00Z");
    assert.equal(getUpNextInfo(day("2026-11-05") as any, legs as any, now, new Set(), "Asia/Tokyo").leaveBy, null);
  });
});

describe("V4 the one delayed refetch", () => {
  it("only on a routed plan, after the server's debounce", () => {
    assert.equal(legRefetchDelayMs({ routedLegs: true }), PLAN_LEG_REFETCH_DELAY_MS);
    assert.ok(PLAN_LEG_REFETCH_DELAY_MS > PLAN_LEG_DEBOUNCE_MS);
    assert.equal(legRefetchDelayMs({}), null);
    assert.equal(legRefetchDelayMs(undefined), null);
  });
});

describe("V5 the card's leg finding", () => {
  it("reads the one line", () => {
    assert.equal(legRecheckLine({ toName: "B", mode: "transit", wasMin: 18, nowMin: 31, status: "changed" }, "4 Nov"), "Travel to B now 31 min (was 18) · re-checked 4 Nov");
  });
});

describe("V6 the routed airport leg", () => {
  it("adds the leg's minutes to the buffer; none ⇒ unchanged; the row shows minutes only when given", () => {
    const anchors = [
      { anchorType: "flight_arrival", anchorDatetime: "2026-11-04T14:00:00", location: "KIX", bufferAfter: 60, routedLeg: { minutes: 75 } },
      { anchorType: "flight_departure", anchorDatetime: "2026-11-06T18:00:00", location: "Kansai airport", bufferBefore: 90 },
    ];
    const arr = flightAnchorFor(anchors, "flight_arrival")!;
    assert.equal(arr.bufferMinutes, 135);
    assert.equal(arr.airportLegMinutes, 75);
    const dep = flightAnchorFor(anchors, "flight_departure")!;
    assert.equal(dep.bufferMinutes, 90);
    assert.equal("airportLegMinutes" in dep, false);
    const base = { direction: "arrival" as const, stayName: "Granvia", airport: "KIX", modes: [], canBook: false };
    assert.match(renderToString(<LegRow {...base} routedMinutes={75} />), /slip-leg-airport-arrival-minutes/);
    assert.doesNotMatch(renderToString(<LegRow {...base} />), /slip-leg-airport-arrival-minutes/);
  });
});
