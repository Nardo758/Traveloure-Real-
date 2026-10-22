/**
 * SH-1 Launch PR 5, items 13–16 (ledger `2026-10-22-sh1-launch-pr5`). Synthetic fixtures only.
 *
 *   L1 Q13.2: every event row carries a DateBlock and a countdown chip — the strip's cards and "More in <city>"
 *   L2 Q14.3: an ended event's page says "This event has ended", shows no countdown and no "Plan around it"
 *   L3 Q14.3/Q14.1: "Plan around it" carries the event's source id and series key beside the anchor (the anchor is unchanged)
 *   L4 Q15.2: opening the pop-up writes no dates or pending event to the pen; the C6 occasion write stays
 *
 * Run: npx tsx --test client/src/components/__tests__/sh1-launch-pr5.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { EventDetailBody } from "../../pages/event-detail";
import { EventsStripContent, planAroundSource } from "../landing/events-strip";
import { EVENT_ENDED_LINE, type EventPagePayload } from "@shared/event-page";
import type { CalendarEvent } from "@shared/events-calendar";
import type { CityEventCard } from "@shared/city-events";

(globalThis as any).React = React;

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "row-1",
    sourceId: "fixture-show",
    series: null,
    title: "Fixture Show",
    city: "Kyoto",
    marketKey: "kyoto",
    neighbourhood: null,
    venue: "Fixture Hall",
    startsAt: "2027-03-20T10:00:00.000Z",
    endsAt: null,
    nights: 1,
    daysUntil: 9,
    firstDate: "2027-03-20",
    lastDate: "2027-03-20",
    startTime: null,
    ticketUrl: null,
    blurb: null,
    imagePath: null,
    vertical: null,
    venueLocality: null,
    seriesKey: "fixture-series",
    ...over,
  };
}

function page(over: Partial<EventPagePayload> = {}): EventPagePayload {
  return {
    event: event(),
    countdown: "Starts in 9 days",
    organizer: null,
    goodToKnow: [],
    moreInCity: [{ sourceId: "fixture-other", title: "Fixture Other", venue: "Fixture Park", firstDate: "2027-04-02", lastDate: "2027-04-02", daysUntil: 22 }],
    cityLocals: null,
    ...over,
  };
}

const render = (p: EventPagePayload) =>
  renderToString(<Router ssrPath="/events/fixture-show"><EventDetailBody page={p} onPlanAround={() => {}} /></Router>).replace(/<!-- -->/g, "");

describe("SH-1 Launch PR 5", () => {
  it("L1 every event row carries a DateBlock and a countdown chip", () => {
    const html = render(page());
    assert.ok(html.includes('data-testid="event-detail-more-countdown-fixture-other"'), "More row countdown");
    assert.ok(html.includes("In 22 days"));
    assert.ok(html.includes("APR"), "More row DateBlock");
    const cards: CityEventCard[] = [1, 2, 3].map((i) => ({ ...event({ id: `c${i}`, daysUntil: 10 + i }) }));
    const strip = renderToString(<Router ssrPath="/"><EventsStripContent payload={{ windowDays: 180, total: 3, events: cards }} onPlanAround={() => {}} /></Router>);
    for (const i of [1, 2, 3]) {
      assert.ok(strip.includes(`data-testid="city-event-date-c${i}"`), `strip card ${i} DateBlock`);
      assert.ok(strip.includes(`data-testid="city-event-countdown-c${i}"`), `strip card ${i} countdown`);
    }
  });

  it("L2 an ended event says so, with no countdown and no Plan around it", () => {
    const html = render(page({ ended: true }));
    assert.equal(EVENT_ENDED_LINE, "This event has ended");
    assert.ok(html.includes("This event has ended"));
    assert.equal(html.includes('data-testid="event-detail-countdown"'), false);
    assert.equal(html.includes('data-testid="event-detail-plan"'), false);
    assert.equal(html.includes("Plan around it"), false);
    const live = render(page());
    assert.equal(live.includes("This event has ended"), false);
    assert.ok(live.includes('data-testid="event-detail-plan"'));
  });

  it("L3 Plan around it carries the source id and series key beside an unchanged anchor", () => {
    const src = planAroundSource(event(), "event_detail", ["2027-03-14", "2027-03-20"]);
    assert.equal(src.eventSourceId, "fixture-show", "the event's source_id, its public address");
    assert.equal(src.seriesKey, "fixture-series");
    assert.deepEqual(src.showDates, ["2027-03-14", "2027-03-20"]);
    assert.deepEqual(src.anchor, { title: "Fixture Show", firstDate: "2027-03-20", lastDate: "2027-03-20", startTime: null, venue: "Fixture Hall" });
    assert.equal(planAroundSource(event(), "event_detail", ["2027-03-20"]).showDates, undefined, "one show is not a series");
  });

  it("L4 opening the pop-up writes no dates or pending event; the occasion write stays", () => {
    const src = readFileSync(path.join(process.cwd(), "client/src/contexts/PlanningContext.tsx"), "utf8");
    const open = src.slice(src.indexOf("const open = useCallback("), src.indexOf("const close = useCallback("));
    assert.ok(open.length > 0);
    assert.equal(/pendingEvents/.test(open), false, "no pending event on open");
    assert.equal(/startDate:/.test(open), false, "no dates on open");
    assert.match(open, /next\?\.experienceSlug && !getTripContext\(\)\.tripId/, "C6 stays");
  });
});
