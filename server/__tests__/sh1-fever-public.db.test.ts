/**
 * SH-1 item 7 — no Fever amount or partner URL reaches a traveler (architect's rulings Q7.1–Q7.5, Oct 19, 2026).
 *
 *   FP1  the projection is an allowlist: no pricing, "Free", URL or coordinates
 *   FP2  the partner URL becomes an opaque token that resolves server-side to it, as a Fever token
 *   FP3  an event with no partner URL gets no token
 *   FP4  the booking_token redirect answers the URL and records the click; other providers and unknown tokens 404
 *   FP5  every traveler-reachable Fever route projects (Q7.4); the admin cache routes are not changed
 *   FP6  the experience catalog drops the Fever price and "Free", and a chosen band leaves events out (Q7.3)
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { toPublicFeverEvents, FEVER_PROVIDER } from "../services/fever-public";
import { mintBookingTokens, resolveBookingToken } from "../services/affiliate-url-vault.service";
import type { FeverEvent } from "../services/fever.service";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

function fixture(over: Partial<FeverEvent> = {}): FeverEvent {
  return {
    id: "fx-1",
    title: "Candlelight concert",
    slug: "candlelight-concert",
    description: "A concert by candlelight.",
    shortDescription: "By candlelight.",
    imageUrl: "https://images.example.test/a.jpg",
    category: "music",
    city: "Testville",
    cityCode: "TST",
    country: "Testland",
    venue: { name: "Hall One", address: "1 Test Street", coordinates: { lat: 0, lng: 0 } },
    dates: { startDate: "2026-11-01T19:00:00Z", endDate: "2026-11-01T21:00:00Z" },
    pricing: { currency: "USD", minPrice: 30, maxPrice: 45, priceRange: "$30 - $45" },
    rating: 4.5,
    reviewCount: 10,
    isFree: false,
    isSoldOut: false,
    bookingUrl: "https://partner.example.test/e/1",
    affiliateUrl: "https://partner.example.test/e/1?aff=fixture",
    ...over,
  };
}

after(async () => {
  await pool.end().catch(() => {});
});

test("FP1: the projection is an allowlist — no pricing, Free, URL or coordinates", async () => {
  const [p] = await toPublicFeverEvents([fixture({ isFree: true, pricing: { currency: "USD", minPrice: 0 } })]);
  assert.deepEqual(Object.keys(p).sort(), [
    "bookingToken", "category", "date", "description", "endDate", "id", "imageUrl", "isSoldOut", "priceSource",
    "provider", "shortDescription", "subcategory", "title", "venueAddress", "venueName",
  ].sort());
  const json = JSON.stringify(p);
  for (const banned of ["pricing", "priceRange", "minPrice", "isFree", "Free", "currency", "bookingUrl", "affiliateUrl", "partner.example.test", "coordinates", "rating"]) {
    assert.ok(!json.includes(banned), `projection carries "${banned}"`);
  }
  assert.equal(p.priceSource, "partner");
  assert.equal(p.provider, FEVER_PROVIDER);
  assert.equal(p.venueName, "Hall One");
  assert.equal(p.date, "2026-11-01T19:00:00Z");
});

test("FP2: the token resolves server-side to the affiliate URL, as a Fever token", async () => {
  const [p] = await toPublicFeverEvents([fixture()]);
  assert.ok(p.bookingToken);
  const entry = await resolveBookingToken(p.bookingToken!);
  assert.equal(entry?.url, "https://partner.example.test/e/1?aff=fixture");
  assert.equal(entry?.provider, FEVER_PROVIDER);
});

test("FP3: an event with no partner URL gets no token", async () => {
  const [p] = await toPublicFeverEvents([fixture({ bookingUrl: "", affiliateUrl: undefined })]);
  assert.equal(p.bookingToken, undefined);
});

test("FP4: the booking_token redirect answers the URL and records the click; others are one 404", async () => {
  const { default: router, registerDiscoveryRoutes } = await import("../routes/content.routes");
  await registerDiscoveryRoutes(); // the redirect is registered here, on the same router
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (body: unknown) =>
      fetch(`${base}/api/content/affiliate-redirect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "sh1-fp4-probe" },
        body: JSON.stringify(body),
      });
    const count = async () =>
      Number(((await db.execute(sql`SELECT count(*)::int AS n FROM affiliate_clicks WHERE user_agent = 'sh1-fp4-probe'`)) as any).rows[0].n);

    const [p] = await toPublicFeverEvents([fixture()]);
    const before = await count();
    const ok = await post({ itemId: p.bookingToken, itemType: "booking_token" });
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal((await ok.json()).url, "https://partner.example.test/e/1?aff=fixture");
    assert.equal(await count(), before + 1, "the click is recorded");

    const [other] = await mintBookingTokens([{ url: "https://other.example.test/x", name: "x", provider: "travelpayouts" }]);
    assert.equal((await post({ itemId: other, itemType: "booking_token" })).status, 404, "another provider's token");
    assert.equal((await post({ itemId: "not-a-token.0", itemType: "booking_token" })).status, 404, "an unknown token");
    await db.execute(sql`DELETE FROM affiliate_clicks WHERE user_agent = 'sh1-fp4-probe'`);
  } finally {
    server.close();
  }
});

test("FP5: every traveler-reachable Fever route projects; the admin cache routes are unchanged", () => {
  const src = read("server/routes/content.routes.ts");
  const block = src.slice(src.indexOf("// FEVER PARTNER API ROUTES"), src.indexOf('router.post("/api/fever/cache/refresh/:cityCode"'));
  for (const route of [
    '"/api/fever/events"',
    '"/api/fever/events/:eventId"',
    '"/api/fever/cities/:cityCode/upcoming"',
    '"/api/fever/cities/:cityCode/dates"',
    '"/api/fever/cache/events/:cityCode"',
  ]) {
    const at = block.indexOf(`router.get(${route}`);
    assert.ok(at >= 0, `${route} is registered`);
    const body = block.slice(at, block.indexOf("router.", at + 10));
    assert.match(body, /toPublicFeverEvents?\(/, `${route} projects its events`);
  }
  const free = block.slice(block.indexOf('"/api/fever/cities/:cityCode/free"'));
  assert.match(free.slice(0, 400), /events: \[\]/, "the free list is always empty");
  const tp = block.slice(block.indexOf('"/api/travelpulse/fever-events/:cityName"'));
  const tpBody = tp.slice(0, tp.indexOf("router."));
  assert.match(tpBody, /toPublicFeverEvents\(/);
  assert.ok(!/pricing: event\.pricing|bookingUrl: event\.|isFree: event\.isFree/.test(tpBody), "no amount, Free or URL on the TravelPulse merge");
  assert.match(read("server/services/location-view.service.ts"), /events: await toPublicFeverEvents\(result\.events\)/);
});

test("FP6: the experience catalog drops the Fever price and Free; a chosen band leaves events out", () => {
  const src = read("server/services/experience-catalog.service.ts");
  const search = src.slice(src.indexOf("private async searchEvents"), src.indexOf("private async searchHotels"));
  assert.match(search, /if \(params\.priceMin !== undefined \|\| params\.priceMax !== undefined\) return \[\];/);
  assert.match(search, /price: null,/);
  assert.match(search, /isFree: false,/);
  assert.ok(!/feverEventCache\.minPrice|e\.minPrice/.test(search), "no Fever price is read");
  const single = src.slice(src.indexOf('if (type === "event")'));
  assert.match(single.slice(0, 1500), /price: null,/);
  assert.match(single.slice(0, 1500), /isFree: false,/);
});
