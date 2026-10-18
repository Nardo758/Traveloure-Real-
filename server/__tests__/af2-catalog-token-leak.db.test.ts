/**
 * AF-2 — the Travelpayouts API token never leaves the server from the catalog services either (ledger
 * `2026-10-12-af2-catalog-token-leak`).
 *
 *   C1 the seven catalog services build their booking links with the marker — no link line carries the token
 *   C2 Kiwitaxi's fallback link (a live result with no booking_url) carries the marker, never the token
 *   C3 a link stored before the fix leaves through the one outbound builder (the agent's /open, the request
 *      create, the concierge hand-off) with the marker in place of the token
 *   C4 a vaulted link minted before the fix resolves without the token (the booking request it seeds is clean)
 *   C5 the click route's stored product link is returned without the token
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/af2-catalog-token-leak.db.test.ts
 */
const TOKEN = "tp-secret-AF2-fixture-41d8b0";
const MARKER = "405110";
process.env.TRAVELPAYOUTS_TOKEN = TOKEN;
process.env.TRAVELPAYOUTS_MARKER = MARKER;
process.env.STRIPE_SECRET_KEY ||= "sk_test_af2";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[af2] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { searchKiwiTaxi } = await import("../services/travelpayouts/kiwitaxi.service");
const { buildAttributedAffiliateUrl } = await import("../services/affiliate-attribution.service");
const { mintBookingTokens, resolveBookingToken } = await import("../services/affiliate-url-vault.service");
const { affiliateScraperService } = await import("../services/affiliate-scraper.service");

const RUN = crypto.randomUUID().slice(0, 8);
const PARTNER = `af2-${RUN}-partner`;
const PRODUCT = `af2-${RUN}-product`;
const SEVEN = ["airalo", "busbud", "discovercars", "getyourguide", "kiwitaxi", "omio", "tiqets"];

before(async () => {
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category, approval_status, is_active)
    VALUES (${PARTNER}, ${`AF-2 partner ${RUN}`}, 'https://partner.example.test', 'transportation', 'approved', true)`);
  await db.execute(sql`INSERT INTO affiliate_products (id, partner_id, name, product_url, affiliate_url)
    VALUES (${PRODUCT}, ${PARTNER}, 'AF-2 product', 'https://www.tiqets.com/kyoto/', ${`https://www.tiqets.com/kyoto/?partner_id=${TOKEN}`})`);
  // PX-1: the fixture is no longer a GetYourGuide link — GetYourGuide is paused and its rows are hidden.
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM affiliate_clicks WHERE product_id = ${PRODUCT} OR partner_id = ${PARTNER}`);
    await db.execute(sql`DELETE FROM affiliate_products WHERE id = ${PRODUCT}`);
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${PARTNER}`);
  } finally {
    await pool.end();
  }
});

test("C1 the seven builders put no token in a booking link", () => {
  for (const name of SEVEN) {
    const src = fs.readFileSync(path.join(process.cwd(), `server/services/travelpayouts/${name}.service.ts`), "utf8");
    const linkLines = src.split("\n").filter((l) => /(bookingUrl|affiliateUrl)\s*:/.test(l));
    assert.ok(linkLines.length > 0, `${name} builds a link`);
    for (const l of linkLines) assert.ok(!l.includes("${token}"), `${name}: ${l.trim()}`);
  }
});

test("C2 Kiwitaxi's fallback link carries the marker, never the token", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ transfers: [{ id: 7, vehicle: { class: "Economy" }, price: null }] }), { status: 200 })) as any;
  try {
    const items = await searchKiwiTaxi({ from: "KIX", to: "Kyoto Station" });
    assert.equal(items.length, 1);
    const json = JSON.stringify(items);
    assert.ok(!json.includes(TOKEN));
    assert.ok(String(items[0].bookingUrl).includes(MARKER));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("C3 a stored pre-fix link leaves the outbound builder with the marker", () => {
  const out = buildAttributedAffiliateUrl({ affiliateUrl: `https://www.omio.com/results/kyoto/osaka?ref=${TOKEN}`, requestId: "req-1" });
  assert.ok(!out.url.includes(TOKEN));
  assert.ok(out.url.includes(`ref=${MARKER}`));
});

test("C4 a vaulted pre-fix link resolves without the token", async () => {
  const [tok] = await mintBookingTokens([{ url: `https://kiwitaxi.com/transfer/KIX/Kyoto?api_key=${TOKEN}`, name: "x", provider: "kiwitaxi" }]);
  const entry = await resolveBookingToken(tok);
  assert.ok(entry);
  assert.ok(!entry!.url.includes(TOKEN));
  assert.ok(entry!.url.includes(`api_key=${MARKER}`));
});

test("C5 the click route's stored product link comes back without the token", async () => {
  const { affiliateUrl } = await affiliateScraperService.trackClick({ productId: PRODUCT } as any);
  assert.ok(!affiliateUrl.includes(TOKEN));
  assert.ok(affiliateUrl.includes(`partner_id=${MARKER}`));
});
