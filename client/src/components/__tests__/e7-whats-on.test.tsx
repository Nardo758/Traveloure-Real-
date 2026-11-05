/**
 * E-7 — one "What's on" set for the landing strip and the date-step picker (ruling, Nov 5, 2026; ledger
 * `2026-11-05-e7-whats-on`).
 *
 *   W1  The strip's event set EQUALS the picker's set (same events, same order); the strip draws its first four.
 *   W2  F1 is the only Kyoto event and the launch setting is unset: the marquee falls back to Kyoto, and the strip
 *       renders F1 with its outside-city label ("In Suzuka").
 *   W3  The ONE launch-market resolver: candidates in order, an unknown slug skipped; with the fallback it is never null,
 *       without it an unresolved setting is null (claim surfaces stay silent).
 *   W4  Events are de-duplicated on (name, city, start).
 *   W5  The picker: a Kyoto section first, then other cities grouped by month, by date.
 *   W6  A leading or trailing city name is stripped from a title before "{title} in {City}".
 *   W7  The server orders the payload with the same resolver and fallback; both surfaces read it.
 *
 * Run: npx tsx --test client/src/components/__tests__/e7-whats-on.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { EventsStripContent, stripCards, stripEvents } from "../landing/events-strip";
import { dedupeEvents, eventPickerGroups, whatsOnEvents } from "@/lib/plan-entry";
import { planTitle, titleWithoutCity } from "@/lib/trip-slip";
import { resolveLaunchMarket } from "@shared/ticker";
import type { CityEventCard, CityEventsPayload } from "@shared/city-events";

(globalThis as any).React = React;

function card(id: string, over: Partial<CityEventCard>): CityEventCard {
  return {
    id, series: null, title: id, city: "Kyoto", marketKey: "kyoto", neighbourhood: null, venue: `Venue ${id}`,
    startsAt: "2026-12-01T10:00:00.000Z", endsAt: null, nights: 1, daysUntil: 20, firstDate: "2026-12-01",
    lastDate: "2026-12-01", startTime: null, ticketUrl: null, blurb: null, imagePath: null, vertical: null,
    venueLocality: null, ...over,
  };
}

const F1 = card("f1", {
  title: "F1 Japanese Grand Prix 2027", venue: "Suzuka Circuit", venueLocality: "Suzuka", outsideCity: true,
  venueCity: "Suzuka", startsAt: "2027-04-08T15:00:00.000Z", firstDate: "2027-04-09", lastDate: "2027-04-11", nights: 2,
});
const GOA = card("goa", { title: "Goa Carnival", city: "Goa", marketKey: "goa", firstDate: "2027-02-14", startsAt: "2027-02-14T05:00:00.000Z" });
const PORTO = card("porto", { title: "São João", city: "Porto", marketKey: "porto", firstDate: "2026-12-10", startsAt: "2026-12-10T20:00:00.000Z" });
const LIGHT = card("light", { title: "Autumn Light-up", firstDate: "2026-11-20", startsAt: "2026-11-20T09:00:00.000Z" });
const LIGHT_DUP = card("light-dup", { title: "  autumn light-up ", firstDate: "2026-11-20", startsAt: "2026-11-20T09:00:00.000Z" });
const LISBON = card("lisbon", { title: "Fado night", city: "Lisbon", marketKey: "lisbon", firstDate: "2026-12-12", startsAt: "2026-12-12T20:00:00.000Z" });

const payload = (events: CityEventCard[]): CityEventsPayload => ({ windowDays: 180, total: events.length, events });
const render = (p: CityEventsPayload, market: string, cityName: string) =>
  renderToString(<Router ssrPath="/"><EventsStripContent payload={p} market={market} cityName={cityName} onPlanAround={() => {}} /></Router>).replace(/<!-- -->/g, "");

describe("E-7 What's on", () => {
  it("W1 the strip's event set equals the picker's set", () => {
    const events = [GOA, F1, PORTO, LIGHT, LIGHT_DUP, LISBON];
    const picker = eventPickerGroups(events, "kyoto").flatMap((g) => g.events);
    assert.deepEqual(stripEvents(events, "kyoto").map((e) => e.id), picker.map((e) => e.id));
    assert.deepEqual(picker.map((e) => e.id), ["light", "f1", "porto", "lisbon", "goa"]);
    const cards = stripCards(payload(events), "kyoto")!;
    assert.deepEqual(cards.map((e) => e.id), picker.slice(0, 4).map((e) => e.id), "the strip draws the first four of that set");
    // The same holds with no marquee at all.
    assert.deepEqual(stripEvents(events, null).map((e) => e.id), eventPickerGroups(events, null).flatMap((g) => g.events).map((e) => e.id));
  });

  it("W2 F1 the only Kyoto event, launch setting unset: the strip shows F1 with its outside-city label", () => {
    const marquee = resolveLaunchMarket([null, undefined], { fallbackToMarquee: true })!;
    assert.deepEqual(marquee, { slug: "kyoto", cityName: "Kyoto" });
    const html = render(payload([F1]), marquee.slug, marquee.cityName);
    assert.ok(html.includes('data-testid="section-city-events"'), "the strip renders");
    assert.ok(html.includes("F1 Japanese Grand Prix 2027"));
    assert.ok(html.includes("In Suzuka"), "the existing outside-city label");
    assert.ok(html.includes("What&#x27;s on in Kyoto") || html.includes("What's on in Kyoto"));
    // Mixed cities on the strip: the heading does not claim one city.
    const mixed = render(payload([F1, GOA]), "kyoto", "Kyoto");
    assert.ok(!mixed.includes("on in Kyoto") && (mixed.includes("What&#x27;s on<") || mixed.includes("What's on<")));
  });

  it("W3 the one launch-market resolver", () => {
    assert.deepEqual(resolveLaunchMarket(["goa", "kyoto"], { fallbackToMarquee: false }), { slug: "goa", cityName: "Goa" });
    assert.deepEqual(resolveLaunchMarket(["atlantis", " KYOTO "], { fallbackToMarquee: false }), { slug: "kyoto", cityName: "Kyoto" });
    assert.equal(resolveLaunchMarket([null, "atlantis"], { fallbackToMarquee: false }), null, "a claim surface stays silent");
    assert.deepEqual(resolveLaunchMarket(["atlantis"], { fallbackToMarquee: true }), { slug: "kyoto", cityName: "Kyoto" });
    const signup = fs.readFileSync("client/src/lib/signup-mode.ts", "utf8");
    assert.match(signup, /resolveLaunchMarket\(\[settings\.launch, data\?\.launchMarketSlug\], \{ fallbackToMarquee: false \}\)/);
    assert.match(signup, /resolveLaunchMarket\(\[settings\.launch, data\?\.launchMarketSlug\], \{ fallbackToMarquee: true \}\)!/);
  });

  it("W4 events are de-duplicated on name, city and start", () => {
    assert.deepEqual(dedupeEvents([LIGHT, LIGHT_DUP]).map((e) => e.id), ["light"]);
    const otherStart = card("light-later", { title: "Autumn Light-up", firstDate: "2026-11-21", startsAt: "2026-11-21T09:00:00.000Z" });
    const otherCity = card("light-osaka", { title: "Autumn Light-up", city: "Osaka", firstDate: "2026-11-20", startsAt: "2026-11-20T09:00:00.000Z" });
    assert.deepEqual(dedupeEvents([LIGHT, otherStart, otherCity]).map((e) => e.id), ["light", "light-later", "light-osaka"]);
  });

  it("W5 the picker: a Kyoto section first, then other cities by month", () => {
    const groups = eventPickerGroups([GOA, F1, PORTO, LIGHT, LISBON], "kyoto");
    assert.deepEqual(groups.map((g) => [g.city, g.month, g.events.map((e) => e.id)]), [
      ["Kyoto", null, ["light", "f1"]],
      [null, "2026-12", ["porto", "lisbon"]],
      [null, "2027-02", ["goa"]],
    ]);
    const pe = fs.readFileSync("client/src/components/plan/PlanEntry.tsx", "utf8");
    assert.equal((pe.match(/eventPickerGroups\(events, whatsOnMarquee\)/g) ?? []).length, 2, "both picker lists");
    assert.match(pe, /const whatsOnMarquee = useMarqueeMarket\(\)\.slug;/);
    assert.equal(whatsOnEvents([F1], "kyoto")[0].id, "f1");
  });

  it("W6 a leading or trailing city name is stripped before the title is composed", () => {
    assert.equal(titleWithoutCity("Kyoto Autumn Light-up", "Kyoto"), "Autumn Light-up");
    assert.equal(titleWithoutCity("Jazz Weekend, Kyoto", "Kyoto"), "Jazz Weekend");
    assert.equal(titleWithoutCity("Jazz Weekend in Kyoto", "Kyoto"), "Jazz Weekend");
    assert.equal(titleWithoutCity("KYOTO – Gion Matsuri", "Kyoto"), "Gion Matsuri");
    assert.equal(titleWithoutCity("Kyotoite Fest", "Kyoto"), "Kyotoite Fest", "whole words only");
    assert.equal(titleWithoutCity("Tokyo Kyoto Line", "Kyoto"), "Tokyo Kyoto Line", "a city mid-title stays");
    assert.equal(titleWithoutCity("Kyoto", "Kyoto"), "Kyoto", "never emptied");
    assert.equal(planTitle({ city: "Kyoto", occasionName: "Kyoto Autumn Light-up" }), "Autumn Light-up in Kyoto");
    assert.equal(planTitle({ city: "Kyoto", occasionName: "F1 Japanese Grand Prix 2027" }), "F1 Japanese Grand Prix 2027 in Kyoto");
  });

  it("W7 the server orders the payload with the same resolver and fallback", () => {
    const svc = fs.readFileSync("server/services/city-events.service.ts", "utf8");
    assert.match(svc, /resolveLaunchMarket\(\[await getLaunchMarketSlug\(\)\], \{ fallbackToMarquee: true \}\)/);
    const strip = fs.readFileSync("client/src/components/landing/events-strip.tsx", "utf8");
    assert.doesNotMatch(strip, /outsideCity !== true/, "no outside-city filter on the strip");
  });
});
