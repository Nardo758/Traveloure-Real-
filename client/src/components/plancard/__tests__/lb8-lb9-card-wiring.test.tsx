/**
 * 9b follow-up (ledger `2026-10-18-lb8-lb9-card-wiring`): the Trip Card's leave-by now reads a stop's last entry
 * (else closing time) and the day's flight departures — the two inputs R504 named as unwired. Parity with the slip
 * on the STORED smoke-6 payload (`server/__tests__/fixtures/smoke6-plancard.json`, day 1, Wed 11 Nov 2026, Kyoto):
 * the card's LB9 note is the slip's own closing-warning lead for the same stop, from the same fact.
 *
 * Test-only additions over the stored payload, named so they are not mistaken for the fixture: Sannenzaka's
 * end time, a last-admission fact for Kodai-ji, routed legs, and one departure anchor stop (smoke 6 held none of
 * these). Everything else — stops, times, coordinates, Kiyomizu-dera's hours — is the payload as stored.
 *
 *   LW1 LB9 last entry: the leave-by measures against it and names it; the note equals the slip's warning lead
 *   LW2 LB9 closing: Kiyomizu-dera's stored hours give "Closes 6:00 PM" to both the card and the slip; in hours ⇒ none
 *   LW3 a stop with no fact keeps its plain leave-by (no note)
 *   LW4 LB8 departure: measured against the buffered time with no mode buffer, sorted among the stops
 *   LW5 LB8 missed: a passed departure leave-by is the conflict banner, never a soft strike
 *   LW6 LB8 unlocated departure reads "Not on the map yet"
 *   LW7 the one flight-anchor clock: departure − buffer, arrival + buffer, midnight crossing ⇒ null
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/lb8-lb9-card-wiring.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { getUpNextInfo } from "../plancard-temporal";
import { LeaveByLine } from "../TripCardDays";
import { itemClosingWarning, stopEntryLimit } from "@/lib/place-facts";
import { LEAVE_BY_COPY } from "@shared/leave-by";
import { flightAnchorClock } from "../../../../../server/services/routing/plan-legs";

(globalThis as any).React = React;

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../server/__tests__/fixtures/smoke6-plancard.json");
const payload = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const TZ = payload.trip.timezone as string;
const stored = payload.days[0];
const DATE = stored.dateIso as string;
const byName = (n: string) => stored.activities.find((a: any) => a.name === n);
const KIYOMIZU = byName("Kiyomizu-dera");
const SANNENZAKA = byName("Sannenzaka Street");
const KODAIJI = byName("Kodai-ji Temple");
const GION = byName("Gion District Walking Tour");
const YASAKA = byName("Yasaka Pagoda (Hokanji Temple)");

// Test-only additions (see header).
const ROUTED = { line: null, fare: null, provenance: { source: "osrm", checkedAt: "2026-11-10T00:00:00Z" } };
const walk = (id: string, from: any, to: string, minutes: number) => ({
  id, legOrder: 1, fromActivityId: from.id, toActivityId: to, recommendedMode: "walk", userSelectedMode: null,
  estimatedDurationMinutes: minutes, routed: ROUTED,
});
const LAST_ENTRY_FACT = {
  id: "test-last-admission", factType: "last_admission", need: "stop.hours", value: { byWeekday: { "3": "11:30" } },
  origin: "crawled", sourceUrl: "https://www.kodaiji.com/", provenance: "Kodai-ji · checked 9 Nov 2026",
  checkedAt: "2026-11-09T01:00:00Z", stale: false, publishable: true,
};

function day(extra: Record<string, unknown> = {}) {
  return {
    ...stored,
    activities: stored.activities.map((a: any) =>
      a.id === SANNENZAKA.id ? { ...a, endTime: "11:00" } : a.id === KODAIJI.id ? { ...a, endTime: "13:30" } : a.id === YASAKA.id ? { ...a, endTime: "18:00" } : a,
    ),
    ...extra,
  };
}
const legs = [walk("L-kodaiji", SANNENZAKA, KODAIJI.id, 12), walk("L-gion", KODAIJI, GION.id, 15)];
const facts = { ...payload.placeFacts, [KODAIJI.id]: [LAST_ENTRY_FACT] };
const morning = new Date(`${DATE}T00:30:00Z`); // 09:30 in Kyoto

describe("LB9 — a stop's last entry, else its closing time", () => {
  const info = getUpNextInfo(day() as any, legs as any, morning, new Set(), TZ, facts as any);
  const row = info.leaveByRows.find((r) => r.stopId === KODAIJI.id)!;

  it("LW1: measures against the last entry and names it; the slip's warning says the same", () => {
    assert.equal(row.kind, "leave_by");
    if (row.kind !== "leave_by") return;
    assert.equal(row.time, "11:15", "11:30 − 12 min walk, floored to 5");
    assert.equal(row.lastEntryNote, "Last entry 11:30 AM");
    const slip = itemClosingWarning([LAST_ENTRY_FACT] as any, DATE, { time: KODAIJI.time }, TZ);
    assert.ok(slip && slip.text.startsWith(`${row.lastEntryNote} · `), `slip: ${slip?.text}`);
    assert.match(row.line, /· Last entry 11:30 AM$/);
  });

  it("LW2: the stored Kiyomizu-dera hours give the same closing time to card and slip; inside hours ⇒ none", () => {
    const kf = payload.placeFacts[KIYOMIZU.id];
    assert.deepEqual(stopEntryLimit(kf, DATE, "18:30"), { time: "18:00", kind: "closing" });
    assert.ok(itemClosingWarning(kf, DATE, { time: "18:30" }, TZ)?.text.startsWith("Closes 6:00 PM · "));
    assert.equal(stopEntryLimit(kf, DATE, KIYOMIZU.time), null, "09:00 is inside 6 AM–6 PM");
    assert.equal(stopEntryLimit(kf, null, "18:30"), null, "no date, no weekday, no limit");
  });

  it("LW3: a stop with no fact keeps its plain leave-by", () => {
    const g = info.leaveByRows.find((r) => r.stopId === GION.id)!;
    assert.equal(g.kind, "leave_by");
    if (g.kind === "leave_by") {
      assert.equal(g.time, "14:15", "14:30 − 15 min walk");
      assert.equal(g.lastEntryNote, null);
    }
  });
});

describe("LB8 — the day's flight departure", () => {
  const departure = { id: "anchor:test-dep", name: "KIX", bufferedTime: "19:30", located: true };
  const driveIn = {
    id: "L-kix", legOrder: 9, fromActivityId: YASAKA.id, toActivityId: departure.id, recommendedMode: "driving",
    userSelectedMode: null, estimatedDurationMinutes: 75, routed: ROUTED,
  };
  const withAnchor = day({ anchorStops: [departure] });

  it("LW4: buffered time − leg minutes, no mode buffer, after the last stop", () => {
    const info = getUpNextInfo(withAnchor as any, [...legs, driveIn] as any, morning, new Set(), TZ, facts as any);
    const ids = info.leaveByRows.map((r) => r.stopId);
    assert.equal(ids[ids.length - 1], departure.id, "sorted by its buffered time, after Yasaka 17:00");
    const row = info.leaveByRows.find((r) => r.stopId === departure.id)!;
    assert.deepEqual(
      row.kind === "leave_by" ? { time: row.time, anchor: row.anchor } : row,
      { time: "18:15", anchor: true },
      "a routed drive the traveler did not choose still measures an anchor — only the R-i buffer applies",
    );
  });

  it("LW5: once passed, the departure's line is the conflict banner", () => {
    const late = new Date(`${DATE}T09:20:00Z`); // 18:20 in Kyoto
    const info = getUpNextInfo(withAnchor as any, [...legs, driveIn] as any, late, new Set(), TZ, facts as any);
    const row = info.leaveByRows.find((r) => r.stopId === departure.id) ?? null;
    const html = renderToString(<LeaveByLine row={row} rows={info.leaveByRows} nowMinute={info.nowMinute} stopName="KIX" stopId={departure.id} />);
    assert.match(html, /card-leave-by-anchor-missed-anchor:test-dep/);
    assert.match(html, /You may miss KIX/);
  });

  it("LW6: a departure with no airport point reads not-on-the-map", () => {
    const info = getUpNextInfo(day({ anchorStops: [{ ...departure, located: false }] }) as any, legs as any, morning, new Set(), TZ, facts as any);
    const row = info.leaveByRows.find((r) => r.stopId === departure.id)!;
    assert.deepEqual(row, { kind: "none", stopId: departure.id, reason: "not_on_map", line: LEAVE_BY_COPY.notOnMap });
  });

  it("LW7: the one flight-anchor clock", () => {
    assert.deepEqual(
      flightAnchorClock({ anchorType: "flight_departure", anchorDatetime: "2026-11-15T21:00:00Z", bufferBefore: 150 }, "2026-11-11"),
      { dayNumber: 5, direction: "departure", wallClock: "18:30" },
    );
    assert.deepEqual(
      flightAnchorClock({ anchorType: "flight_arrival", anchorDatetime: "2026-11-11T08:00:00Z", bufferAfter: 120 }, "2026-11-11"),
      { dayNumber: 1, direction: "arrival", wallClock: "10:00" },
    );
    assert.equal(flightAnchorClock({ anchorType: "flight_departure", anchorDatetime: "2026-11-15T01:00:00Z", bufferBefore: 150 }, "2026-11-11").wallClock, null);
  });
});
