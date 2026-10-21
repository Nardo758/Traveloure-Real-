/**
 * Fever area match (ledger `2026-10-21-blog-checks-fever-area`).
 *
 * Nominatim is mocked. A present Fever coordinate is kept. A missing coordinate with an address is
 * looked up at most once a second, cached permanently (a miss included, a failure not), and the
 * public card carries the Kyoto area name and the ODbL credit — never the street or the point.
 *
 *   npx tsx --test --test-force-exit server/services/__tests__/fever-area.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import type { NeighborhoodRow } from "@shared/neighborhood-placement";
import { FEVER_OSM_CREDIT } from "@shared/fever-area";
import { db } from "../../db";
import { feverAddressGeocodes } from "@shared/schema";
import type { FeverEvent } from "../fever.service";
import {
  FEVER_NOMINATIM_USER_AGENT,
  NOMINATIM_MIN_INTERVAL_MS,
  dbFeverGeocodeCache,
  resolveFeverAreas,
  type CachedGeocode,
  type FeverGeocodeCache,
} from "../fever-area";
import { toPublicFeverEvents } from "../fever-public";
import { PUBLIC_NOMINATIM_BASE_URL } from "../../config/geocoder.config";

const GION: NeighborhoodRow = {
  id: "gion", city: "Kyoto", name: "Gion", slug: "gion",
  centroidLat: "35.0036", centroidLng: "135.7750", radiusKm: "1.5",
};

function event(over: Partial<FeverEvent> = {}): FeverEvent {
  return {
    id: "fx",
    title: "A night out",
    slug: "a-night-out",
    category: "music",
    city: "Kyoto",
    cityCode: "KYO",
    country: "Japan",
    venue: { name: "Hall One", address: "1 Test Street" },
    dates: { startDate: "2026-11-01T10:00:00Z" },
    pricing: { currency: "JPY" },
    isFree: false,
    isSoldOut: false,
    bookingUrl: "",
    ...over,
  };
}

function memoryCache(): { cache: FeverGeocodeCache; rows: Map<string, CachedGeocode> } {
  const rows = new Map<string, CachedGeocode>();
  return {
    rows,
    cache: {
      async get(addressKey) { return rows.get(addressKey) ?? null; },
      async put(row) { if (!rows.has(row.addressKey)) rows.set(row.addressKey, row); },
    },
  };
}

function clock() {
  let t = 10_000_000;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
  };
}

test("FA1: Fever's own coordinates are kept and Nominatim is not called", async () => {
  let calls = 0;
  const [area] = await resolveFeverAreas(
    [event({ venue: { name: "Hall One", address: "1 Test Street", coordinates: { lat: 35.0036, lng: 135.775 } } })],
    {
      neighborhoods: async () => [GION],
      fetchImpl: async () => { calls++; return { ok: true, json: async () => [] }; },
    },
  );
  assert.equal(calls, 0);
  assert.equal(area.areaName, "Gion");
  assert.equal(area.osmCredit, FEVER_OSM_CREDIT);
});

test("FA2: a missing point is geocoded once, with the User-Agent, and the second read is the cache", async () => {
  const seen: { url: string; ua: string }[] = [];
  const { cache } = memoryCache();
  const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, ua: init.headers["User-Agent"] });
    return { ok: true, json: async () => [{ lat: "35.0036", lon: "135.7750" }] };
  };
  const deps = { neighborhoods: async () => [GION], cache, fetchImpl, ...clock() };
  const [first] = await resolveFeverAreas([event()], deps);
  const [second] = await resolveFeverAreas([event()], deps);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].ua, FEVER_NOMINATIM_USER_AGENT);
  assert.ok(seen[0].url.startsWith(`${PUBLIC_NOMINATIM_BASE_URL}/search?`));
  const q = new URL(seen[0].url).searchParams.get("q");
  assert.equal(q, "1 Test Street, Kyoto, Japan");
  assert.equal(first.areaName, "Gion");
  assert.equal(second.areaName, "Gion");
  assert.equal(first.osmCredit, FEVER_OSM_CREDIT);
});

test("FA3: two lookups in one pass wait out the one-request-a-second interval", async () => {
  const c = clock();
  let calls = 0;
  const { cache } = memoryCache();
  await resolveFeverAreas(
    [
      event({ id: "a", venue: { name: "Hall", address: "1 Test Street" } }),
      event({ id: "b", venue: { name: "Hall", address: "2 Test Street" } }),
    ],
    {
      neighborhoods: async () => [GION],
      cache,
      ...c,
      fetchImpl: async () => { calls++; return { ok: true, json: async () => [{ lat: "35.0036", lon: "135.7750" }] }; },
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(c.sleeps, [NOMINATIM_MIN_INTERVAL_MS]);
  assert.ok(NOMINATIM_MIN_INTERVAL_MS >= 1000);
});

test("FA4: a miss is cached and a failure is not", async () => {
  const { cache, rows } = memoryCache();
  let calls = 0;
  const miss = async () => { calls++; return { ok: true, json: async () => [] }; };
  const deps = { neighborhoods: async () => [GION], cache, fetchImpl: miss, ...clock() };
  const [first] = await resolveFeverAreas([event()], deps);
  const [second] = await resolveFeverAreas([event()], deps);
  assert.equal(calls, 1, "a cached miss is not asked again");
  assert.equal(first.areaName, null);
  assert.equal(first.osmCredit, null);
  assert.equal(second.areaName, null);
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].latitude, null);

  const flaky = memoryCache();
  let flaps = 0;
  const fetchImpl = async () => {
    flaps++;
    if (flaps === 1) return { ok: false, json: async () => [] };
    return { ok: true, json: async () => [{ lat: "35.0036", lon: "135.7750" }] };
  };
  const again = { neighborhoods: async () => [GION], cache: flaky.cache, fetchImpl, ...clock() };
  const [down] = await resolveFeverAreas([event()], again);
  const [up] = await resolveFeverAreas([event()], again);
  assert.equal(flaps, 2, "an unreachable lookup is not cached");
  assert.equal(down.areaName, null);
  assert.equal(up.areaName, "Gion");
  assert.equal(flaky.rows.size, 1);
});

test("FA5: the public payload names the area and carries no street and no point", async () => {
  const { cache } = memoryCache();
  const [p] = await toPublicFeverEvents([event()], {
    neighborhoods: async () => [GION],
    cache,
    ...clock(),
    fetchImpl: async () => ({ ok: true, json: async () => [{ lat: "35.0036", lon: "135.7750" }] }),
  });
  assert.equal(p.areaName, "Gion");
  assert.equal(p.osmCredit, FEVER_OSM_CREDIT);
  assert.equal(p.venueName, "Hall One");
  const json = JSON.stringify(p);
  assert.equal(json.includes("1 Test Street"), false);
  assert.equal(json.includes("35.0036"), false);
  assert.equal(json.includes("135.775"), false);
  assert.equal("venueAddress" in p, false);

  const [outside] = await resolveFeverAreas(
    [event({ venue: { name: "Hall", coordinates: { lat: 35.68, lng: 139.76 } } })],
    { neighborhoods: async () => [GION], fetchImpl: async () => { throw new Error("should not geocode"); } },
  );
  assert.equal(outside.areaName, null);
  assert.equal(outside.osmCredit, null);
});

test("FA6: the table keeps the first answer, including a miss", async () => {
  const key = `fa-fixture-${Date.now()}`;
  try {
    await dbFeverGeocodeCache.put({ addressKey: key, latitude: null, longitude: null, attribution: null });
    const miss = await dbFeverGeocodeCache.get(key);
    assert.ok(miss);
    assert.equal(miss.latitude, null);
    assert.equal(miss.longitude, null);
    await dbFeverGeocodeCache.put({ addressKey: key, latitude: 35.0036, longitude: 135.775, attribution: FEVER_OSM_CREDIT });
    const still = await dbFeverGeocodeCache.get(key);
    assert.equal(still?.latitude, null, "a second write does not replace the stored answer");
  } finally {
    await db.delete(feverAddressGeocodes).where(eq(feverAddressGeocodes.addressKey, key));
  }
});
