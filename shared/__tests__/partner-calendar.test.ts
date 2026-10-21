/**
 * Dated partner events on the calendar (ledger `2026-10-21-event-card-partner-area`).
 * The date is the catalog prefix. A long expiration is one day. Unknown is omitted.
 * The row carries no price and no partner URL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventPlace, windowMonths } from "../events-calendar";
import { composePartnerCalendarEvents, partnerRunDays, statedCalendarDay, type PartnerCalendarSource } from "../partner-calendar";

const MONTHS = windowMonths("2026-10");

function row(over: Partial<PartnerCalendarSource> = {}): PartnerCalendarSource {
  return {
    id: "evt-1",
    title: "Kyoto Making Wagyu Sushi experience",
    city: "Kyoto",
    marketKey: "kyoto",
    date: "2026-10-22T17:00:00-07:00",
    endDate: "2027-04-17T17:00:00-07:00",
    dateStated: true,
    areaName: "Gion",
    imageUrl: "https://images.example.test/a.jpg",
    partnerName: "Fever",
    today: "2026-10-21",
    ...over,
  };
}

test("PC1: the calendar day is the date prefix, and a long listing window is the start day", () => {
  assert.equal(statedCalendarDay("2026-10-22T17:00:00-07:00"), "2026-10-22");
  assert.equal(statedCalendarDay("not-a-date"), null);
  assert.equal(statedCalendarDay("2026-02-31"), null);
  assert.deepEqual(partnerRunDays("2026-10-22", "2027-04-17"), { firstDate: "2026-10-22", lastDate: "2026-10-22", nights: 1 });
  assert.deepEqual(partnerRunDays("2026-10-21", "2026-10-23"), { firstDate: "2026-10-21", lastDate: "2026-10-23", nights: 3 });
  assert.deepEqual(partnerRunDays("2026-10-21", "2026-10-27"), { firstDate: "2026-10-21", lastDate: "2026-10-27", nights: 7 });
  assert.deepEqual(partnerRunDays("2026-10-21", "2026-10-28"), { firstDate: "2026-10-21", lastDate: "2026-10-21", nights: 1 });
});

test("PC2: a dated partner event is listed, with the area and the partner, and without a price or a link", () => {
  const [event] = composePartnerCalendarEvents([row()], MONTHS);
  assert.equal(event.firstDate, "2026-10-22");
  assert.equal(event.lastDate, "2026-10-22");
  assert.equal(event.nights, 1);
  assert.equal(event.startTime, null);
  assert.equal(event.ticketUrl, null);
  assert.equal(event.partner, true);
  assert.equal(event.partnerName, "Fever");
  assert.equal(event.neighbourhood, "Gion");
  assert.equal(event.outsideCity, false);
  assert.equal(event.marketKey, "kyoto");
  assert.equal(event.imagePath, "https://images.example.test/a.jpg");
  assert.equal(eventPlace(event), "Gion · Kyoto");
  const json = JSON.stringify(event);
  for (const key of ["price", "currency", "originalPrice", "discountPercent", "lastScrapedAt", "bookingToken", "bookingUrl", "minPrice"]) {
    assert.equal(json.includes(`"${key}"`), false, key);
  }
});

test("PC3: an unstated date, a past day, an unknown area, and a blocked title are omitted", () => {
  const events = composePartnerCalendarEvents([
    row({ id: "unstated", dateStated: false }),
    row({ id: "past", date: "2026-10-01T17:00:00-07:00", endDate: "2026-10-01T17:00:00-07:00" }),
    row({ id: "blank", title: "  " }),
    row({ id: "blocked", title: "Hidden gems of Kyoto" }),
    row({ id: "area", areaName: "Unknown", imageUrl: "http://images.example.test/a.jpg", partnerName: "Unknown" }),
  ], MONTHS);
  assert.deepEqual(events.map((e) => e.sourceId), ["area"]);
  assert.equal(events[0].neighbourhood, null);
  assert.equal(events[0].partnerName, null);
  assert.equal(events[0].imagePath, null);
  assert.equal(eventPlace(events[0]), "Kyoto");
});

test("PC4: a blank or unknown venue is the city alone; a stored outside-city venue is unchanged", () => {
  assert.equal(eventPlace({ venue: "", city: "Kyoto", venueLocality: null, outsideCity: false, venueCity: null }), "Kyoto");
  assert.equal(eventPlace({ venue: "Unknown", city: "Kyoto", venueLocality: null, outsideCity: false, venueCity: null }), "Kyoto");
  assert.equal(eventPlace({ venue: "Kyoto Concert Hall", city: "Kyoto", venueLocality: null, outsideCity: false, venueCity: null }), "Kyoto Concert Hall · Kyoto");
  assert.equal(
    eventPlace({ venue: "Kyocera Dome Osaka", city: "Kyoto", venueLocality: "Osaka", outsideCity: true, venueCity: "Osaka" }),
    "Kyocera Dome Osaka, Osaka · Outside the city, planned from Kyoto",
  );
});
