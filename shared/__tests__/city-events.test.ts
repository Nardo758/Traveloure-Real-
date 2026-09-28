/**
 * city_events pure rules (ledger `2026-09-28-city-events`; landing reorder, item 6).
 *
 * E1 strip absent below three events; present at three.
 * E2 nights and countdown derived correctly across a DST boundary (Europe/London, Oct 2026).
 * E3 a ticket link on a partner's domain (the registry's hosts, passed in) is refused; an organiser's
 *    own link is not. E3b: city-events and the blog share ONE rule and ONE loader, no second list.
 * E4 no event renders without a venue and a start date, nor once withdrawn.
 * E5 the neighbourhood is the nearest SAME-city row with coordinates, else null — never a guess.
 * E6 the per-event Moments/Trips split comes from nights.
 * E7 a city's fallback photo is its own; a city with none gets no photo.
 *
 * Run: npx tsx --test shared/__tests__/city-events.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CITY_EVENTS_STRIP_MIN,
  cityEventPhoto,
  cityEventPlanShape,
  cityEventTag,
  countdownLabel,
  daysUntil,
  deriveNights,
  isAcceptableTicketUrl,
  isRenderableCityEvent,
  localDate,
  localTime,
  nearestNeighbourhoodId,
  RESALE_TICKET_HOSTS,
  showCityEventsStrip,
  ticketUrlRefusal,
} from "../city-events";

describe("city events", () => {
  it("E1 the strip is absent below three events and present at three", () => {
    assert.equal(CITY_EVENTS_STRIP_MIN, 3);
    assert.equal(showCityEventsStrip(0), false);
    assert.equal(showCityEventsStrip(2), false);
    assert.equal(showCityEventsStrip(3), true);
    assert.equal(showCityEventsStrip(4), true);
  });

  it("E2 nights and countdown are local calendar days, correct across a DST change", () => {
    const tz = "Europe/London"; // BST ends 02:00 on Sun 25 Oct 2026.
    // Fri 23 Oct 19:00 BST -> Sun 25 Oct 23:00 GMT: three local nights (Fri, Sat, Sun).
    const start = new Date("2026-10-23T19:00:00+01:00");
    const end = new Date("2026-10-25T23:00:00+00:00");
    assert.equal(deriveNights(start, end, tz), 3);
    assert.equal(cityEventTag(deriveNights(start, end, tz)), "Festival · 3 nights");
    // An evening that ends after local midnight on the change night is still ONE event day to the
    // countdown, and its start date is the Saturday.
    assert.equal(localDate(new Date("2026-10-24T20:00:00+01:00"), tz), "2026-10-24");
    // Countdown from Thu 22 Oct 23:30 BST to Sun 25 Oct 20:00 GMT: 3 local days, not 2.99 or 4.
    const now = new Date("2026-10-22T23:30:00+01:00");
    const sunday = new Date("2026-10-25T20:00:00+00:00");
    assert.equal(daysUntil(sunday, now, tz), 3);
    assert.equal(countdownLabel(3), "In 3 days");
    // And the spring change: Sat 28 Mar 2026 20:00 GMT -> Sun 29 Mar 23:00 BST = 2 nights.
    assert.equal(deriveNights(new Date("2026-03-28T20:00:00Z"), new Date("2026-03-29T23:00:00+01:00"), tz), 2);
    // One evening, no end: one night.
    assert.equal(deriveNights(start, null, tz), 1);
    assert.equal(cityEventTag(1), "One night");
    assert.equal(localTime(new Date("2026-10-25T20:00:00Z"), tz), "20:00");
    assert.equal(localTime(new Date("2026-10-24T19:00:00Z"), tz), "20:00");
  });

  it("E2b countdown words never show a negative number", () => {
    assert.equal(countdownLabel(0), "Today");
    assert.equal(countdownLabel(1), "Tomorrow");
    assert.equal(countdownLabel(-2), "On now");
  });

  it("E3 a ticket link on a partner's domain is refused; the organiser's own is accepted", () => {
    // The hosts are the registry's (loadPartnerHosts), passed in — this module types none.
    const partners = ["viator.com", "travelpayouts.com", "stubhub.com"];
    assert.equal(isAcceptableTicketUrl("https://www.viator.com/tours/x", partners), false);
    assert.equal(isAcceptableTicketUrl("https://c137.travelpayouts.com/click", partners), false);
    assert.equal(isAcceptableTicketUrl("https://www.stubhub.com/event/1", partners), false);
    assert.equal(isAcceptableTicketUrl("https://www.edfringe.com/tickets", partners), true);
    // A host that merely CONTAINS a partner's name is not a match (exact-suffix rule).
    assert.equal(isAcceptableTicketUrl("https://notviator.com.example.org/", partners), true);
    assert.equal(isAcceptableTicketUrl("javascript:alert(1)", partners), false);
    assert.equal(isAcceptableTicketUrl("not a url", partners), false);
    // With an empty registry nothing is refused on partner grounds — only malformed links are.
    assert.equal(isAcceptableTicketUrl("https://www.viator.com/tours/x", []), true);
  });

  it("E3c a ticket link on a resale marketplace is refused whatever the registry holds; the primary seller's is accepted", () => {
    // Resale is our policy, typed here, so it refuses with an EMPTY partner registry too.
    for (const url of [
      "https://www.stubhub.com/event/1",
      "https://www.stubhub.co.uk/event/1",
      "https://www.viagogo.com/x",
      "https://www.vividseats.com/x",
      "https://seatgeek.com/x",
      "https://www.tickpick.com/x",
      "https://gametime.co/x",
      "https://resale.ticketmaster.com/x",
      "https://www.ticketexchangebyticketmaster.com/x",
    ]) {
      assert.equal(ticketUrlRefusal(url, []), "resale_ticket_url", url);
      assert.equal(isAcceptableTicketUrl(url, []), false, url);
    }
    // Ticketmaster's primary pages and an organiser's own page are allowed.
    assert.equal(ticketUrlRefusal("https://www.ticketmaster.com/event/abc", []), null);
    assert.equal(ticketUrlRefusal("https://www.edfringe.com/tickets", []), null);
    // Exact-suffix: a host that only CONTAINS a resale name is not refused.
    assert.equal(ticketUrlRefusal("https://notstubhub.example.org/", []), null);
    // Resale is named before partner, and malformed stays malformed.
    assert.equal(ticketUrlRefusal("https://www.stubhub.com/event/1", ["stubhub.com"]), "resale_ticket_url");
    assert.equal(ticketUrlRefusal("https://www.viator.com/x", ["viator.com"]), "affiliate_ticket_url");
    assert.equal(ticketUrlRefusal("not a url", []), "bad_ticket_url");
    assert.ok(RESALE_TICKET_HOSTS.length > 0);
  });

  it("E3b the partner rule is the blog's rule: one module, and no hand-typed PARTNER list in city-events", () => {
    const src = readFileSync(join(process.cwd(), "shared/city-events.ts"), "utf8");
    assert.match(src, /from "\.\/partner-hosts"/, "city-events reads the shared partner-host rule");
    assert.doesNotMatch(src, /AFFILIATE_TICKET_HOSTS|"viator\.com"|"tp\.media"/, "no second affiliate list");
    const blog = readFileSync(join(process.cwd(), "server/services/blog-posts.service.ts"), "utf8");
    assert.match(blog, /isOnPartnerHost/, "the blog calls the same rule");
    const svc = readFileSync(join(process.cwd(), "server/services/city-events.service.ts"), "utf8");
    assert.match(svc, /from "\.\/partner-hosts\.service"/, "city events load the same hosts as the blog");
  });

  it("E4 no event renders without a venue and a start date, or once withdrawn", () => {
    assert.equal(isRenderableCityEvent({ venue: "Kyoto Concert Hall", startsAt: "2026-11-01T19:00:00+09:00" }), true);
    assert.equal(isRenderableCityEvent({ venue: "", startsAt: "2026-11-01T19:00:00+09:00" }), false);
    assert.equal(isRenderableCityEvent({ venue: "   ", startsAt: "2026-11-01T19:00:00+09:00" }), false);
    assert.equal(isRenderableCityEvent({ venue: "Hall", startsAt: null }), false);
    assert.equal(
      isRenderableCityEvent({ venue: "Hall", startsAt: "2026-11-01T19:00:00+09:00", withdrawnAt: "2026-09-30T00:00:00Z" }),
      false,
    );
  });

  it("E5 the neighbourhood is the nearest same-city row with coordinates, else null", () => {
    const hoods = [
      { id: "gion", city: "Kyoto", lat: 35.0037, lng: 135.7788 },
      { id: "arashiyama", city: "Kyoto", lat: 35.0094, lng: 135.6668 },
      { id: "no-coords", city: "Kyoto", lat: null, lng: null },
      { id: "shibuya", city: "Tokyo", lat: 35.0036, lng: 135.7787 }, // same point, other city
    ];
    // A venue a few hundred metres from Gion resolves to Gion, never to the other city's row.
    assert.equal(nearestNeighbourhoodId({ city: "Kyoto", lat: 35.0045, lng: 135.7760 }, hoods), "gion");
    assert.equal(nearestNeighbourhoodId({ city: "kyoto", lat: 35.01, lng: 135.67 }, hoods), "arashiyama");
    // No venue coordinates: null, never a guess.
    assert.equal(nearestNeighbourhoodId({ city: "Kyoto", lat: null, lng: null }, hoods), null);
    // A city with no located rows: null.
    assert.equal(nearestNeighbourhoodId({ city: "Porto", lat: 41.15, lng: -8.61 }, hoods), null);
  });

  it("E6 one night plans as a Moment, two or more as a Trip", () => {
    assert.equal(cityEventPlanShape(1), "moment");
    assert.equal(cityEventPlanShape(2), "trip");
    assert.equal(cityEventPlanShape(5), "trip");
  });

  it("E7 a card uses the event's photo, else its OWN city's fallback, else none", () => {
    assert.deepEqual(cityEventPhoto("/images/events/x.jpg", "kyoto"), { src: "/images/events/x.jpg", fallback: false });
    assert.deepEqual(cityEventPhoto(null, "kyoto"), { src: "/images/landing/hero-kyoto-temple.jpg", fallback: true });
    assert.deepEqual(cityEventPhoto(null, "bogota"), { src: "/images/landing/hero-bogota.jpg", fallback: true });
    assert.equal(cityEventPhoto(null, "porto"), null);
    assert.equal(cityEventPhoto(null, null), null);
  });
});
