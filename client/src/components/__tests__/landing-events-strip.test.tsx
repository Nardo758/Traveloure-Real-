/**
 * "Coming up in our cities" render rules (ledger `2026-09-28-city-events`).
 *
 * S1 absent below three events — nothing rendered, no heading, no placeholder.
 * S2 present at three, every value from the payload: tag, countdown, city · neighbourhood, venue.
 * S3 a NULL neighbourhood is omitted, never "undefined" or a guess.
 * S4 "Plan around it" passes occasion `show`, the market, the event as the anchor, and its funnel
 *    door (`event_strip` on landing, `events_page` on /events — slip-funnel-events.md §3.1).
 * S5 a card for a city with no fallback photo renders no photo, never another city's.
 *
 * Run: npx tsx --test client/src/components/__tests__/landing-events-strip.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { EventsStripContent, planAroundSource } from "../landing/events-strip";
import type { CityEventCard, CityEventsPayload } from "@shared/city-events";

(globalThis as any).React = React;

function card(i: number, over: Partial<CityEventCard> = {}): CityEventCard {
  return {
    id: `e${i}`,
    series: i === 1 ? "Kyoto Jazz Weekend" : null,
    title: `Show ${i}`,
    city: "Kyoto",
    marketKey: "kyoto",
    neighbourhood: i === 1 ? "Gion" : null,
    venue: `Hall ${i}`,
    startsAt: "2026-11-20T10:00:00.000Z",
    endsAt: i === 1 ? "2026-11-22T14:00:00.000Z" : null,
    nights: i === 1 ? 3 : 1,
    daysUntil: 10 + i,
    firstDate: "2026-11-20",
    lastDate: i === 1 ? "2026-11-22" : "2026-11-20",
    startTime: "19:00",
    ticketUrl: null,
    blurb: i === 1 ? "Three nights of jazz in the old town." : null,
    imagePath: null,
    vertical: null,
    venueLocality: null,
    ...over,
  };
}

function payload(n: number, over: (i: number) => Partial<CityEventCard> = () => ({})): CityEventsPayload {
  const events = Array.from({ length: n }, (_, k) => card(k + 1, over(k + 1)));
  return { windowDays: 180, total: n, events };
}

function render(p: CityEventsPayload | null): string {
  return renderToString(
    <Router ssrPath="/">
      <EventsStripContent payload={p} onPlanAround={() => {}} />
    </Router>,
  ).replace(/<!--.*?-->/g, "");
}

describe("city events strip", () => {
  it("S1 absent below three events", () => {
    assert.equal(render(null), "");
    assert.equal(render(payload(0)), "");
    assert.equal(render(payload(2)), "");
  });

  it("S2 present at three, every value from the payload", () => {
    const html = render(payload(3));
    assert.ok(html.includes('data-testid="section-city-events"'));
    assert.ok(html.includes("Coming up in our cities"));
    assert.ok(html.includes("Next 180 days"));
    assert.ok(html.includes('href="/events"'));
    assert.ok(html.includes("Festival · 3 nights"));
    assert.ok(html.includes("One night"));
    assert.ok(html.includes("In 11 days"));
    assert.ok(html.includes("Kyoto · Gion"));
    assert.ok(html.includes("Kyoto Jazz Weekend"));
    assert.ok(html.includes("20 Nov – 22 Nov · Hall 1"));
    assert.ok(html.includes("Three nights of jazz in the old town."));
    assert.equal((html.match(/Plan around it/g) ?? []).length, 3);
  });

  it("S2b at most four cards", () => {
    const html = render(payload(6));
    assert.equal((html.match(/Plan around it/g) ?? []).length, 4);
  });

  it("S3 a NULL neighbourhood is omitted", () => {
    const html = render(payload(3));
    assert.ok(!html.includes("undefined"));
    assert.ok(!html.includes("null"));
  });

  it("S4 Plan around it passes show, the market, the event as the anchor, and its door", () => {
    const src = planAroundSource(card(1), "event_strip");
    assert.equal(src.door, "event_strip");
    assert.equal(planAroundSource(card(1), "events_page").door, "events_page");
    assert.equal(src.experienceSlug, "show");
    assert.equal(src.city, "Kyoto");
    assert.equal(src.country, "Japan");
    assert.deepEqual(src.anchor, {
      title: "Kyoto Jazz Weekend",
      firstDate: "2026-11-20",
      lastDate: "2026-11-22",
      startTime: "19:00",
      venue: "Hall 1",
    });
  });

  it("S6 each surface sends its own door", () => {
    const src = fs.readFileSync("client/src/components/landing/events-strip.tsx", "utf8");
    assert.match(src, /<CityEventCards events=\{cards\} door="event_strip"/, "the landing strip is event_strip");
    assert.match(src, /<CityEventCards events=\{data\.events\} door="events_page"/, "the /events block is events_page");
  });

  it("S5 a city with no fallback photo renders no photo", () => {
    const html = render(payload(3, () => ({ city: "Porto", marketKey: "porto" })));
    assert.ok(!html.includes("<img"), "no photo for Porto — never another city's image");
    const kyoto = render(payload(3));
    assert.ok(kyoto.includes("/images/landing/hero-kyoto-temple.jpg"), "Kyoto uses its own fallback");
    assert.ok(kyoto.includes("Photo: Alec Doualetas · Pexels"), "and credits it");
  });
});
