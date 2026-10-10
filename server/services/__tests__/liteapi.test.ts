/**
 * S1-d-1 — LiteAPI, the pure halves (ledger `2026-10-10-s1-d1-liteapi`).
 *
 *   LA1 config: OFF without a key or without a known LITEAPI_ENV; the two base URLs default and override
 *       (https only); the rate ceiling defaults to 5/s
 *   LA2 the kind is derived from the provider (no column): liteapi ⇔ provider 'liteapi'
 *   LA3 the row: provenance carries the env; an unlocated or nameless hotel is refused; a half star is not
 *       rounded; the image must be https (hot-linked URL only); no review, rate or price field is written
 *   LA4 the client: `X-API-Key` header (never the URL), paced to maxRps, backs off on 429 / code 4290
 *       three times from 1 s, then throws; another failure throws at once
 *
 * Run: npx tsx --test server/services/__tests__/liteapi.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { liteapiConfig, LITEAPI_BOOK_BASE_URL_DEFAULT, LITEAPI_DATA_BASE_URL_DEFAULT } from "../../config/liteapi.config";
import { LITEAPI_PROVIDER, stayKindForCacheProvider } from "@shared/liteapi";
import { liteapiCityCode, liteapiHotelRow } from "../liteapi-rows";
import { createLiteapiClient, LiteapiError } from "../liteapi-client";

test("LA1 config is off without a key or a known env; URLs default and override", () => {
  assert.equal(liteapiConfig({}), null);
  assert.equal(liteapiConfig({ LITEAPI_API_KEY: "k" }), null);
  assert.equal(liteapiConfig({ LITEAPI_API_KEY: "k", LITEAPI_ENV: "staging" }), null);
  assert.equal(liteapiConfig({ LITEAPI_ENV: "sandbox" }), null);
  const c = liteapiConfig({ LITEAPI_API_KEY: "k", LITEAPI_ENV: "Sandbox" })!;
  assert.equal(c.env, "sandbox");
  assert.equal(c.dataBaseUrl, LITEAPI_DATA_BASE_URL_DEFAULT);
  assert.equal(c.bookBaseUrl, LITEAPI_BOOK_BASE_URL_DEFAULT);
  assert.equal(c.maxRps, 5);
  const o = liteapiConfig({ LITEAPI_API_KEY: "k", LITEAPI_ENV: "production", LITEAPI_DATA_BASE_URL: "https://x.test/v3/", LITEAPI_BOOK_BASE_URL: "http://insecure.test", LITEAPI_MAX_RPS: "2" })!;
  assert.equal(o.dataBaseUrl, "https://x.test/v3");
  assert.equal(o.bookBaseUrl, LITEAPI_BOOK_BASE_URL_DEFAULT);
  assert.equal(o.maxRps, 2);
});

test("LA2 the kind follows the provider", () => {
  assert.equal(stayKindForCacheProvider(LITEAPI_PROVIDER), "liteapi");
  assert.equal(stayKindForCacheProvider("booking_com"), "hotel_cache");
  assert.equal(stayKindForCacheProvider(null), "hotel_cache");
});

test("LA3 the row: provenance, refusals, no rounding, https image, no review/rate field", () => {
  const ctx = { cityName: "Kyoto", countryCode: "JP", env: "sandbox" as const, runStartedAt: new Date("2026-10-10T09:00:00Z") };
  const row = liteapiHotelRow(
    { id: "lp1", name: " Hotel Kanra ", latitude: 35.0, longitude: 135.76, stars: 4, rating: 8.7, hotelTypeId: 204, main_photo: "https://static.cupid.travel/h.jpg", hotelDescription: "Quiet", address: "190 Kitamachi" },
    ctx,
  )!;
  assert.equal(row.provider, "liteapi");
  assert.equal(row.providerHotelId, "lp1");
  assert.equal(row.hotelId, "liteapi_lp1");
  assert.equal(row.cityCode, liteapiCityCode("Kyoto"));
  assert.equal(row.name, "Hotel Kanra");
  assert.equal(row.starRating, 4);
  assert.equal(row.guestRating, "8.70");
  assert.equal(row.hotelTypeId, 204);
  assert.equal(row.mainImageUrl, "https://static.cupid.travel/h.jpg");
  assert.deepEqual(row.rawData.provenance, { source: "liteapi", env: "sandbox", fetchedAt: "2026-10-10T09:00:00.000Z" });
  assert.equal(row.expiresAt.getTime(), ctx.runStartedAt.getTime(), "born lapsed until a completed pass");
  const keys = JSON.stringify(row).toLowerCase();
  assert.doesNotMatch(keys, /review|sentiment|price|rate"|currency|commission|margin/);
  assert.equal(liteapiHotelRow({ id: "x", name: "No pin" }, ctx), null);
  assert.equal(liteapiHotelRow({ id: "", name: "A", latitude: 1, longitude: 1 }, ctx), null);
  assert.equal(liteapiHotelRow({ id: "z", name: "Null island", latitude: 0, longitude: 0 }, ctx), null);
  const half = liteapiHotelRow({ id: "h", name: "Half", latitude: 35, longitude: 135, stars: 3.5, main_photo: "http://x/y.jpg" }, ctx)!;
  assert.equal(half.starRating, null);
  assert.equal(half.rawData.content.stars, 3.5);
  assert.equal(half.mainImageUrl, null);
});

const cfg = { apiKey: "secret-key", env: "sandbox" as const, dataBaseUrl: "https://api.test/v3.0", bookBaseUrl: "https://book.test/v3.0", maxRps: 5, staleAfterDays: 2 };
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

test("LA4 the client: header, pacing, back-off, refusal", async () => {
  let clock = 0;
  const sleeps: number[] = [];
  const calls: Array<{ url: string; key: string | undefined }> = [];
  const answers = [res(429, null), res(200, { error: { code: 4290 } }), res(200, { data: [{ id: "a", name: "A" }], total: 1 })];
  const client = createLiteapiClient(cfg, {
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    fetch: (async (url: string, init: any) => {
      calls.push({ url, key: init.headers["X-API-Key"] });
      return answers.shift()!;
    }) as any,
  });
  const page = await client.listHotels({ countryCode: "JP", cityName: "Kyoto", offset: 0, limit: 500, lastUpdatedAt: "2026-10-09T00:00:00Z" });
  assert.equal(page.data.length, 1);
  assert.equal(page.total, 1);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.key === "secret-key" && !c.url.includes("secret-key")));
  assert.match(calls[0].url, /^https:\/\/api\.test\/v3\.0\/data\/hotels\?countryCode=JP&cityName=Kyoto&offset=0&limit=500&lastUpdatedAt=/);
  assert.deepEqual(sleeps.filter((s) => s >= 1000), [1000, 2000], "back-off from 1 s");
  // Pacing: consecutive calls are at least 200 ms apart (5/s).
  const c2 = createLiteapiClient(cfg, { now: () => clock, sleep: async (ms) => { sleeps.push(ms); clock += ms; }, fetch: (async () => res(200, { data: [] })) as any });
  sleeps.length = 0;
  await c2.listHotels({ countryCode: "JP", cityName: "Kyoto", offset: 0, limit: 1 });
  await c2.listHotels({ countryCode: "JP", cityName: "Kyoto", offset: 1, limit: 1 });
  assert.deepEqual(sleeps, [200]);
  // Four rate limits in a row: three retries, then it throws.
  const c3 = createLiteapiClient(cfg, { now: () => clock, sleep: async (ms) => { clock += ms; }, fetch: (async () => res(429, null)) as any });
  await assert.rejects(c3.listHotels({ countryCode: "JP", cityName: "Kyoto", offset: 0, limit: 1 }), (e: any) => e instanceof LiteapiError && e.status === 429);
  // A 401 throws at once.
  let n = 0;
  const c4 = createLiteapiClient(cfg, { now: () => clock, sleep: async (ms) => { clock += ms; }, fetch: (async () => { n++; return res(401, { error: "bad key" }); }) as any });
  await assert.rejects(c4.listHotels({ countryCode: "JP", cityName: "Kyoto", offset: 0, limit: 1 }), (e: any) => e.status === 401);
  assert.equal(n, 1);
});
