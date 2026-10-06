/**
 * The event page's render rules (ledger `2026-10-06-event-page`, events-page brief 2b).
 *
 *   ED1  every stated fact renders: vertical, title, dates, venue and the "outside the city" line,
 *        the countdown, the organizer link, the attributed fact with its source line, More in <city>
 *   ED2  absent stays absent: no vertical, no organizer, no Good to know, no More in, no verified line
 *        — never an empty section, never "0 verified"
 *   ED3  no locals' notes and no traveler comments section, whatever the payload holds (2c)
 *   ED4  the missing page says so; it is not an empty shell
 *   ED5  "Plan around it" sends the `event_detail` door with the event as the anchor (E3)
 *
 * Run: npx tsx --test client/src/components/__tests__/event-detail-page.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { EventDetailBody, Missing } from "../../pages/event-detail";
import { planAroundSource } from "../landing/events-strip";
import type { EventPagePayload } from "@shared/event-page";
import type { CalendarEvent } from "@shared/events-calendar";

(globalThis as any).React = React;

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev1",
    sourceId: "kyoto-jazz-2026",
    series: null,
    title: "Kyoto Jazz Weekend",
    city: "Kyoto",
    marketKey: "kyoto",
    neighbourhood: null,
    venue: "Expo Commemorative Park",
    startsAt: "2026-11-20T10:00:00.000Z",
    endsAt: "2026-11-22T14:00:00.000Z",
    nights: 3,
    daysUntil: 12,
    firstDate: "2026-11-20",
    lastDate: "2026-11-22",
    startTime: null,
    ticketUrl: null,
    blurb: null,
    imagePath: null,
    vertical: "music",
    venueLocality: "Suita",
    ...over,
  };
}

function page(over: Partial<EventPagePayload> = {}): EventPagePayload {
  return {
    event: event(),
    countdown: "Starts in 12 days",
    organizer: { url: "https://kyotojazz.example/tickets", host: "kyotojazz.example" },
    goodToKnow: [
      { factType: "hours", text: "Gates open at 11:00.", label: "from Kyoto Official", sourceUrl: "https://kyoto.example/hours", checked: "checked 2 Oct 2026" },
    ],
    moreInCity: [{ sourceId: "gion-matsuri-2027", title: "Gion Matsuri", venue: "Gion", firstDate: "2027-07-01", lastDate: "2027-07-31" }],
    verifiedLocals: 3,
    ...over,
  };
}

// React marks text-node boundaries with <!-- -->; the assertions read the text as a person would.
const render = (p: EventPagePayload, onPlanAround = () => {}) =>
  renderToString(<Router ssrPath="/events/kyoto-jazz-2026"><EventDetailBody page={p} onPlanAround={onPlanAround} /></Router>).replace(/<!-- -->/g, "");

describe("event page", () => {
  it("ED1 every stated fact renders", () => {
    const html = render(page());
    for (const s of ["Kyoto Jazz Weekend", "Music", "Expo Commemorative Park", "Suita", "outside the city", "Starts in 12 days", "kyotojazz.example", "Gates open at 11:00.", "from Kyoto Official", "checked 2 Oct 2026", "More in Kyoto", "Gion Matsuri", "/events/gion-matsuri-2027", "3 verified locals in Kyoto"]) {
      assert.ok(html.includes(s), s);
    }
    assert.ok(html.includes('rel="nofollow noopener noreferrer"'));
  });

  it("ED2 absent stays absent", () => {
    const html = render(page({ event: event({ vertical: null, venueLocality: null }), organizer: null, goodToKnow: [], moreInCity: [], verifiedLocals: null }));
    for (const id of ["event-detail-vertical", "event-detail-organizer", "event-detail-good-to-know", "event-detail-more", "event-detail-verified"]) {
      assert.equal(html.includes(id), false, id);
    }
    assert.equal(html.includes("Good to know"), false);
    assert.equal(html.includes("verified"), false);
    assert.equal(html.includes("outside the city"), false);
  });

  it("ED3 no notes or comments section", () => {
    const html = render(page()).toLowerCase();
    for (const s of ["comment", "notes from", "locals' notes", "local notes"]) assert.equal(html.includes(s), false, s);
  });

  it("ED4 the missing page says so", () => {
    const html = renderToString(<Router ssrPath="/events/kyoto-jazz-2026"><Missing /></Router>);
    assert.ok(html.includes("This event is not on our calendar"));
    assert.ok(html.includes('href="/events"'));
  });

  it("ED5 Plan around it sends the event_detail door with the event as the anchor", () => {
    const src = planAroundSource(event(), "event_detail");
    assert.equal(src.door, "event_detail");
    assert.equal(src.city, "Kyoto");
    assert.deepEqual(src.anchor, { title: "Kyoto Jazz Weekend", firstDate: "2026-11-20", lastDate: "2026-11-22", startTime: null, venue: "Expo Commemorative Park" });
  });
});
