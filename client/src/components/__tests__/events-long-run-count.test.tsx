/**
 * Row 67 (ledger `2026-10-24-events-long-run-count`): long runs are counted, and a multi-day event shows its start time.
 *   LR1  a multi-day event with a published start time: "Tue 3 Nov · 19:00 – Thu 5 Nov"; without one, no time
 *   LR2  a long run (11+ days) counts on every day it covers, like a short run, and keeps its underline flag
 *   LR3  the month grid's per-day total equals the day's count (a long run is counted once per covered day)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { dayMarks, eventWhen, LONG_RUN_MIN_DAYS, type CalendarEvent } from "@shared/events-calendar";
import { MonthGrid } from "../events/MonthGrid";

(globalThis as any).React = React;

function ev(id: string, firstDate: string, lastDate: string, over: Partial<CalendarEvent> = {}): CalendarEvent {
  const nights = Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86_400_000) + 1;
  return {
    id, series: null, title: `Synthetic ${id}`, city: "Kyoto", marketKey: "kyoto", neighbourhood: null, venue: "Hall",
    startsAt: `${firstDate}T10:00:00.000Z`, endsAt: null, nights, daysUntil: 3, firstDate, lastDate, startTime: null,
    ticketUrl: null, blurb: null, imagePath: null, vertical: null, venueLocality: null, sourceId: `s-${id}`,
    ...over,
  } as CalendarEvent;
}

test("LR1 — a multi-day event's start time follows the first date, and is never invented", () => {
  assert.equal(eventWhen(ev("a", "2026-11-03", "2026-11-05", { startTime: "19:00" })), "Tue 3 Nov · 19:00 – Thu 5 Nov");
  assert.equal(eventWhen(ev("b", "2026-11-03", "2026-11-05")), "Tue 3 Nov – Thu 5 Nov");
  assert.equal(eventWhen(ev("c", "2026-11-03", "2026-11-03", { startTime: "19:00" })), "Tue 3 Nov · 19:00");
});

test("LR2 — a long run counts on every day it covers", () => {
  const run = ev("r", "2026-10-14", "2026-11-05");
  assert.ok(run.nights >= LONG_RUN_MIN_DAYS);
  const short = ev("s", "2026-10-20", "2026-10-20");
  const marks = dayMarks([run, short], "2026-10");
  const d20 = marks.find((m) => m.date === "2026-10-20")!;
  assert.equal(d20.count, 2);
  assert.equal(d20.longRun, true);
  for (const m of marks.filter((x) => x.date >= "2026-10-14")) assert.ok(m.count >= 1, m.date);
  assert.equal(marks.find((m) => m.date === "2026-10-13")!.count, 0);
});

test("LR3 — the grid's total equals the day count", () => {
  const run = ev("r", "2026-10-14", "2026-11-05");
  const short = ev("s", "2026-10-20", "2026-10-20");
  const html = renderToString(
    <MonthGrid ym="2026-10" events={[run, short]} mode="month" selectedDay={null} selectedWeek={null} today="2026-01-01" onPickDay={() => {}} testIdPrefix="d" />,
  );
  assert.match(html, /aria-label="[^"]*20 Oct 2026, 2 events"/);
  assert.match(html, /aria-label="[^"]*15 Oct 2026, 1 event"/);
  assert.match(html, /data-testid="d-2026-10-20"[^>]*data-marks="2"/);
  assert.match(html, /data-testid="d-2026-10-15"[^>]*data-marks="1"[^>]*data-long-run="true"/);
});
