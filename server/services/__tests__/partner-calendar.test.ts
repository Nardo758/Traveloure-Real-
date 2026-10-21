/**
 * Partner calendar loader (ledger `2026-10-21-event-card-partner-area`).
 * The live catalog gate stays closed in this test. Injected rows prove the date, the area,
 * and the absence of price keys. A timeout does not throw and is not required to return rows.
 *
 *   npx tsx --test --test-force-exit server/services/__tests__/partner-calendar.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { windowMonths } from "@shared/events-calendar";
import type { FeverEvent } from "../fever.service";
import { catalogPlace, streetAddress } from "../fever-catalog-place";
import { loadDatedPartnerEvents, type PartnerCalendarDeps } from "../partner-calendar.service";

const NOW = new Date("2026-10-21T03:00:00Z");
const MONTHS = windowMonths("2026-10");

function fever(over: Partial<FeverEvent> = {}): FeverEvent {
  return {
    id: "cat-1",
    title: "Discover Kyoto at Night by Bike",
    slug: "discover-kyoto-at-night-by-bike",
    category: "tours",
    city: "Kyoto",
    cityCode: "KYO",
    country: "Japan",
    dates: {
      startDate: "2026-10-22T17:00:00-07:00",
      endDate: "2027-04-17T17:00:00-07:00",
      stated: true,
    },
    pricing: { currency: "USD", minPrice: 40, priceRange: "hidden" },
    isFree: false,
    isSoldOut: false,
    bookingUrl: "https://partner.example.test/secret",
    imageUrl: "https://images.example.test/bike.jpg",
    ...over,
  };
}

function deps(over: Partial<PartnerCalendarDeps> = {}): PartnerCalendarDeps {
  return {
    catalogReady: () => true,
    cities: [{ name: "Kyoto", marketKey: "kyoto" }],
    search: async () => [fever()],
    areas: async () => [{ areaName: "Gion", osmCredit: null }],
    partnerName: async () => "Fever",
    nowMs: () => NOW.getTime(),
    deadlineMs: 8000,
    ...over,
  };
}

test("PK1: a catalog that is not ready contributes nothing and is not searched", async () => {
  let calls = 0;
  const events = await loadDatedPartnerEvents(NOW, MONTHS, deps({
    catalogReady: () => false,
    search: async () => { calls++; return [fever()]; },
  }));
  assert.deepEqual(events, []);
  assert.equal(calls, 0);
});

test("PK2: a dated catalog event lands on its start day, with the partner and the area, and no price keys", async () => {
  const [short] = await loadDatedPartnerEvents(NOW, MONTHS, deps({
    search: async () => [
      fever(),
      fever({
        id: "cat-2",
        title: "A three day class",
        dates: { startDate: "2026-10-21T17:00:00-07:00", endDate: "2026-10-23T17:00:00-07:00", stated: true },
      }),
      fever({ id: "cat-3", title: "No launch date", dates: { startDate: "2026-10-21T17:00:00-07:00", stated: false } }),
    ],
    areas: async () => [
      { areaName: "Unknown", osmCredit: null },
      { areaName: "Arashiyama", osmCredit: null },
      { areaName: "Gion", osmCredit: null },
    ],
  }));
  const events = await loadDatedPartnerEvents(NOW, MONTHS, deps({
    search: async () => [
      fever(),
      fever({
        id: "cat-2",
        title: "A three day class",
        dates: { startDate: "2026-10-21T17:00:00-07:00", endDate: "2026-10-23T17:00:00-07:00", stated: true },
      }),
      fever({ id: "cat-3", title: "No launch date", dates: { startDate: "2026-10-21T17:00:00-07:00", stated: false } }),
    ],
    areas: async () => [
      { areaName: "Unknown", osmCredit: null },
      { areaName: "Arashiyama", osmCredit: null },
      { areaName: "Gion", osmCredit: null },
    ],
  }));
  assert.equal(short.sourceId, events[0].sourceId);
  assert.deepEqual(events.map((e) => e.sourceId), ["cat-2", "cat-1"]);
  assert.equal(events[0].firstDate, "2026-10-21");
  assert.equal(events[0].lastDate, "2026-10-23");
  assert.equal(events[0].nights, 3);
  assert.equal(events[0].neighbourhood, "Arashiyama");
  assert.equal(events[1].firstDate, "2026-10-22");
  assert.equal(events[1].lastDate, "2026-10-22");
  assert.equal(events[1].neighbourhood, null);
  assert.equal(events[1].partnerName, "Fever");
  assert.equal(events[1].startTime, null);
  assert.equal(events[1].ticketUrl, null);
  const json = JSON.stringify(events);
  for (const key of ["price", "currency", "originalPrice", "discountPercent", "lastScrapedAt", "bookingUrl", "minPrice", "pricing", "partner.example.test"]) {
    assert.equal(json.includes(key), false, key);
  }
});

test("PK3: a search that does not finish is an empty addition, not a thrown calendar", async () => {
  const events = await loadDatedPartnerEvents(NOW, MONTHS, deps({
    deadlineMs: 15,
    search: () => new Promise((resolve) => {
      const timer = setTimeout(() => resolve([fever()]), 5000);
      timer.unref?.();
    }),
  }));
  assert.deepEqual(events, []);
});

test("PK4: a catalog street is read; a city name and a half coordinate are not", () => {
  assert.equal(streetAddress("Kyoto"), null);
  assert.equal(streetAddress("Join us, October twenty one, for a long evening walk around the old town with friends"), null);
  assert.equal(streetAddress("9 Example Road"), "9 Example Road");
  assert.deepEqual(catalogPlace({ Text1: "9 Example Road", Latitude: "35.0" }), { address: "9 Example Road" });
  assert.deepEqual(catalogPlace({ Venue: "Unknown", Location: "Kyoto" }), undefined);
  assert.deepEqual(catalogPlace({ Venue: "Hall One", Latitude: 35.01, Longitude: 135.77 }), {
    name: "Hall One",
    coordinates: { lat: 35.01, lng: 135.77 },
  });
});
