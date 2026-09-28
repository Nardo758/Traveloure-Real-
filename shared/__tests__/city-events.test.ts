/**
 * city_events pure rules (ledger `2026-09-28-city-events`; landing reorder, item 6).
 *
 * E1 strip absent below three events; present at three.
 * E2 nights and countdown derived correctly across a DST boundary (Europe/London, Oct 2026).
 * E3 affiliate-host ticket links are refused; an organiser's own link is not.
 * E4 no event renders without a venue and a start date, nor once withdrawn.
 * E5 the neighbourhood is the nearest SAME-city row with coordinates, else null — never a guess.
 * E6 the per-event Moments/Trips split comes from nights.
 * E7 a city's fallback photo is its own; a city with none gets no photo.
 *
 * Run: npx tsx --test shared/__tests__/city-events.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
  showCityEventsStrip,
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

  it("E3 an affiliate-host ticket link is refused; the organiser's own is accepted", () => {
    assert.equal(isAcceptableTicketUrl("https://www.viator.com/tours/x"), false);
    assert.equal(isAcceptableTicketUrl("https://tp.media/r?campaign=1"), false);
    assert.equal(isAcceptableTicketUrl("https://c137.travelpayouts.com/click"), false);
    assert.equal(isAcceptableTicketUrl("https://www.stubhub.com/event/1"), false);
    assert.equal(isAcceptableTicketUrl("https://www.edfringe.com/tickets"), true);
    // A host that merely CONTAINS an affiliate word is not a match (exact-suffix rule).
    assert.equal(isAcceptableTicketUrl("https://notviator.com.example.org/"), true);
    assert.equal(isAcceptableTicketUrl("javascript:alert(1)"), false);
    assert.equal(isAcceptableTicketUrl("not a url"), false);
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
