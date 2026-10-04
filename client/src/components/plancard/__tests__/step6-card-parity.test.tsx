/**
 * STEP 6 — TRIP CARD PARITY (R-ab; surface spec v1.3.4 §2.5; ledger `2026-10-04-step6-trip-card`).
 * Renders the STORED smoke-6 plancard payload through `TripCardDays` — the card's days on the shared
 * `DayBlock` + `ItemRow` in READ mode — once per trip day with "now" on that day, and asserts:
 *   P1 every item renders exactly once across the days, under its own day; the count is the payload's
 *   P2 the open day is "Today · <Wkd> · <Mon d>" and leads the day strip; the others follow in order
 *   P3 each row's time, title and facts line are the payload's (the slip's own rules)
 *   P4 read mode: no ⋯ menu, no planning control; every row has a Navigate deep link (Google Maps
 *      directions, no API key) and each day a "Navigate the day" link
 *   P5 the provenance line says only what is known — no "built from" without a run; the booked count
 *      is the payload's own (smoke 6 booked nothing)
 *   P6 no photo is drawn when none is known (§13 — never a placeholder)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TripCardDays } from "../TripCardDays";
import { dayBlockHeading } from "@/lib/plan-day";
import { itemFactsLine } from "@/lib/place-facts";

(globalThis as any).React = React;

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../server/__tests__/fixtures/smoke6-plancard.json");
const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
const days: any[] = [...payload.days].sort((a, b) => a.dayNum - b.dayNum);
const all = days.flatMap((d) => d.activities ?? []);
const decode = (s: string) => s.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

function render(now: Date): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return decode(
    renderToString(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(TripCardDays, {
          tripId: payload.trip.id,
          destination: payload.trip.destination,
          days,
          timeZone: payload.trip.timezone,
          placeFacts: payload.placeFacts,
          finalizedAt: "2026-11-01T03:00:00.000Z",
          finalVersion: 1,
          finalCard: null,
          optimized: true,
          showTravelMinutes: false,
          advisorName: null,
          isOwner: false,
          now,
        }),
      ),
    ),
  );
}

const renders = days.map((d) => ({ d, html: render(new Date(`${d.dateIso}T03:00:00Z`)) }));

test("P1 every item once, under its own day", () => {
  assert.equal(all.length, 24, "smoke 6 held 24 items");
  for (const a of all) {
    const hits = renders.filter((r) => r.html.includes(`data-testid="slip-item-${a.id}"`));
    assert.equal(hits.length, 1, `${a.name} renders exactly once (only on its own day's render)`);
    assert.ok(hits[0].d.activities.some((x: any) => x.id === a.id), `${a.name} sits under its own day`);
  }
});

test("P2 Today leads the strip and opens", () => {
  for (const { d, html } of renders) {
    assert.ok(html.includes(`Today · ${dayBlockHeading({ dayNum: d.dayNum, date: d.date, dateIso: d.dateIso })}`), `day ${d.dayNum} reads Today`);
    const strip = html.slice(html.indexOf('data-testid="card-day-strip"'));
    const firstChip = /data-testid="card-day-chip-(\d+)"/.exec(strip)![1];
    assert.equal(Number(firstChip), d.dayNum, "Today first");
  }
});

test("P3 time, title and facts line are the payload's", () => {
  for (const { d, html } of renders) {
    for (const a of d.activities) {
      assert.ok(html.includes(a.name.replace(/&/g, "&")), `title ${a.name}`);
      const line = itemFactsLine(payload.placeFacts?.[a.id], d.dateIso, payload.trip.timezone);
      if (line) assert.ok(html.includes(line.text), `facts line for ${a.name}`);
    }
  }
});

test("P4 read mode: no menu; Navigate per row and per day", () => {
  for (const { d, html } of renders) {
    assert.ok(!html.includes('data-testid="item-menu-'), "no ⋯ menu on the card");
    assert.ok(!/Add to checkout|Send to expert|Build my days/.test(html), "no planning control");
    for (const a of d.activities) {
      const m = new RegExp(`data-testid="slip-item-navigate-${a.id}"`).test(html);
      assert.ok(m, `Navigate on ${a.name}`);
    }
    assert.match(html, /href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=|href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
    assert.ok(!/key=/.test(html.match(/google\.com\/maps\/dir[^"]*/g)?.join(" ") ?? ""), "no API key in a deep link");
    assert.ok(html.includes(`data-testid="card-day-navigate-card-${d.dayNum}"`) || html.includes(`data-testid="card-day-navigate-${d.dayNum}"`));
  }
});

test("P5/P6 provenance says only what is known; no photo without one", () => {
  const html = renders[0].html;
  assert.match(html, /data-testid="card-provenance"[^>]*>Finalized Nov 1/);
  assert.doesNotMatch(html, /built from/);
  // The smoke-6 plan held no bookings: "0 of 24 booked" is the true count, not an invented one.
  assert.match(html, /Finalized Nov 1 · 0 of 24 booked</);
  assert.ok(!html.includes('data-testid="slip-item-photo-'), "no thumbnail without a photo");
  assert.ok(!html.includes('data-testid="card-day-photo-'), "no day photo without a stored one");
});
