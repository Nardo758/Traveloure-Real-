/**
 * VD-1 — the direct Viator Partner API, live only (ledger `2026-10-18-viator-direct-live`; decision-maker,
 * Oct 18, 2026).
 *
 *   V1 the API key is sent in the `exp-api-key` header only: no request URL, no log line and no result
 *      carries it — on success, on a Viator error answer and on a thrown fetch
 *   V2 a product link is the API's `productUrl` with only `campaign` appended; no link carries a secret
 *   V3 a Viator answer causes no write: affiliate_products, content_registry, activity_cache,
 *      travelpayouts_cache and api_usage_logs are unchanged, and the module imports no database client;
 *      with the switch on, the `activity_cache` path makes no Viator call and deletes nothing
 *   V4 off unless `VIATOR_DIRECT_ENABLED=1`; Kyoto only; production base URL with `VIATOR_API_KEY`,
 *      sandbox with `VIATOR_SANDBOX_API_KEY`; no review text is returned
 *   V5 stored Viator rows are hidden from traveler reads (the GetYourGuide pattern) and kept
 *
 * Secret env names are set to random values AT TEST TIME — never literals.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/vd1-viator-live.db.test.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const KEY_PROD = `vd1-prod-${crypto.randomUUID()}`;
const KEY_SANDBOX = `vd1-sbx-${crypto.randomUUID()}`;
process.env.VIATOR_API_KEY = KEY_PROD;
process.env.VIATOR_SANDBOX_API_KEY = KEY_SANDBOX;
delete process.env.VIATOR_DIRECT_ENABLED;

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[vd1] REFUSING to write fixtures to '${host}'.`);
}

const { searchViatorLive, withCampaign, toViatorLiveItem } = await import("../services/viator-live.service");
const cfg = await import("../config/viator.config");
const { installConsoleRedaction } = await import("../infrastructure/logger");
const { db, pool } = await import("../db");

const ON = { VIATOR_DIRECT_ENABLED: "1", VIATOR_API_KEY: KEY_PROD, VIATOR_SANDBOX_API_KEY: KEY_SANDBOX, NODE_ENV: "test" };
const PRODUCT = {
  productCode: "5678KYO",
  title: "Fushimi Inari early walk",
  description: "A walk.",
  images: [{ isCover: true, variants: [{ url: "https://hare-media-cdn.tripadvisor.com/x/480.jpg", width: 480, height: 320 }, { url: "https://hare-media-cdn.tripadvisor.com/x/1200.jpg", width: 1200, height: 800 }] }],
  reviews: { totalReviews: 120, combinedAverageRating: 4.8, reviews: [{ text: "REVIEW_TEXT_MUST_NOT_APPEAR" }] },
  viatorUniqueContent: "UNIQUE_CONTENT_MUST_NOT_APPEAR",
  duration: { fixedDurationInMinutes: 180 },
  pricing: { summary: { fromPrice: 45.5 }, currency: "USD" },
  productUrl: "https://www.viator.com/tours/Kyoto/Fushimi/d332-5678KYO?mcid=42383&pid=P00123&medium=api&api_version=2.0",
};

type Req = { url: string; init: RequestInit };
function stub(status = 200, body: unknown = { products: [PRODUCT], totalCount: 1 }) {
  const calls: Req[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fn };
}

// Console capture UNDER the boot redaction, as the server runs.
const captured: string[] = [];
const fake = {} as Console;
for (const m of ["log", "info", "warn", "error", "debug"] as const) {
  (fake as any)[m] = (...args: unknown[]) => captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
}
installConsoleRedaction(fake);
function withConsole<T>(run: () => Promise<T>): Promise<T> {
  const real = { ...console };
  for (const m of ["log", "info", "warn", "error", "debug"] as const) (console as any)[m] = (fake as any)[m];
  return run().finally(() => Object.assign(console, real));
}

after(async () => {
  await pool.end();
});

test("V1 the key is in the exp-api-key header only — never in a URL, a log line or a result", async () => {
  captured.length = 0;
  const ok = stub();
  const res = await withConsole(() => searchViatorLive({ city: "Kyoto, Japan", surface: "browse" }, { env: ON, fetch: ok.fn }));
  assert.equal(res.status, "ok");
  assert.equal(ok.calls.length, 1);
  const { url, init } = ok.calls[0];
  assert.equal(url, `${cfg.VIATOR_SANDBOX_BASE_URL}/products/search`, "non-production calls the sandbox");
  assert.equal((init.headers as Record<string, string>)["exp-api-key"], KEY_SANDBOX);
  for (const k of [KEY_PROD, KEY_SANDBOX]) {
    assert.ok(!url.includes(k), "no key in the URL");
    assert.ok(!String(init.body).includes(k), "no key in the body");
    assert.ok(!JSON.stringify(res).includes(k), "no key in the result");
  }
  const bad = stub(401, { message: `bad key ${KEY_SANDBOX}` });
  assert.equal((await withConsole(() => searchViatorLive({ city: "Kyoto", surface: "browse" }, { env: ON, fetch: bad.fn }))).status, "error");
  const thrown = async (u: string) => {
    throw new Error(`request to ${u}?k=${KEY_SANDBOX} failed`);
  };
  assert.equal((await withConsole(() => searchViatorLive({ city: "Kyoto", surface: "browse" }, { env: ON, fetch: thrown as any }))).status, "error");
  for (const k of [KEY_PROD, KEY_SANDBOX]) assert.ok(!captured.join("\n").includes(k), "no key in any log line");
  // Static: the service never puts the key into a URL.
  const src = fs.readFileSync(path.join(process.cwd(), "server/services/viator-live.service.ts"), "utf8");
  assert.ok(!/\?[^"'`]*(api[-_]?key|key=)/i.test(src), "no key query parameter in the service");
});

test("V2 the link is productUrl as returned with only a campaign appended; no secret in it", async () => {
  const item = toViatorLiveItem(PRODUCT, "browse")!;
  assert.equal(item.productUrl, `${PRODUCT.productUrl}&campaign=traveloure_browse`);
  const u = new URL(item.productUrl!);
  assert.equal(u.searchParams.get("pid"), "P00123");
  assert.equal(u.searchParams.get("mcid"), "42383");
  assert.equal(u.searchParams.get("medium"), "api");
  assert.equal(withCampaign("https://www.viator.com/tours/x", "expert_picker"), "https://www.viator.com/tours/x?campaign=traveloure_expert_picker");
  assert.equal(withCampaign("https://www.viator.com/tours/x?campaign=theirs", "browse"), "https://www.viator.com/tours/x?campaign=theirs", "an existing campaign is left as is");
  assert.equal(withCampaign("http://www.viator.com/x", "browse"), null, "not https ⇒ no link");
  assert.equal(withCampaign(null, "browse"), null, "no link from Viator ⇒ no link");
  for (const k of [KEY_PROD, KEY_SANDBOX]) assert.ok(!item.productUrl!.includes(k));
});

async function counts() {
  const q = async (t: string) => Number(((await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`))).rows[0] as any).n);
  return {
    affiliate_products: await q("affiliate_products"),
    content_registry: await q("content_registry"),
    activity_cache: await q("activity_cache"),
    travelpayouts_cache: await q("travelpayouts_cache"),
    api_usage_logs: await q("api_usage_logs"),
  };
}

test("V3 a Viator answer causes no write; the activity_cache path is inert under the switch", async () => {
  const before = await counts();
  const ok = stub();
  const res = await searchViatorLive({ city: "Kyoto", surface: "expert_picker", count: 5 }, { env: ON, fetch: ok.fn });
  assert.equal(res.items.length, 1);
  assert.deepEqual(await counts(), before, "nothing was written");
  const src = fs.readFileSync(path.join(process.cwd(), "server/services/viator-live.service.ts"), "utf8");
  assert.ok(!/from\s+["'](\.\.\/db|@shared\/schema|drizzle-orm)["']/.test(src), "the live service imports no database client");

  // With the switch on, the old activity_cache path neither calls Viator nor deletes rows.
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (u: any) => {
    calls.push(String(u));
    return new Response("{}", { status: 200 });
  }) as any;
  process.env.VIATOR_DIRECT_ENABLED = "1";
  try {
    const { cacheService } = await import("../services/cache.service");
    const r = await cacheService.getActivitiesWithCache("Kyoto");
    assert.deepEqual(r.data, []);
    assert.equal((await cacheService.verifyActivityAvailability("5678KYO")).available, false);
    const code = `vd1-${crypto.randomUUID().slice(0, 8)}`;
    await db.execute(sql`INSERT INTO activity_cache (id, product_code, title, destination, expires_at) VALUES (${code}, ${code}, 'x', 'vd1-city', now() - interval '1 day')`);
    const cleaned = await cacheService.cleanupExpiredCache();
    assert.equal(cleaned.activities, 0);
    const left = await db.execute(sql`SELECT count(*)::int AS n FROM activity_cache WHERE product_code = ${code}`);
    assert.equal((left.rows[0] as any).n, 1, "expired activity rows are kept");
    await db.execute(sql`DELETE FROM activity_cache WHERE product_code = ${code}`);
    assert.equal(calls.filter((u) => u.includes("viator")).length, 0, "no Viator call");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.VIATOR_DIRECT_ENABLED;
  }
});

test("V4 the switch, the city, the environment, and no review text", async () => {
  const s = stub();
  assert.equal((await searchViatorLive({ city: "Kyoto", surface: "browse" }, { env: { ...ON, VIATOR_DIRECT_ENABLED: undefined }, fetch: s.fn })).status, "disabled");
  assert.equal((await searchViatorLive({ city: "Tokyo", surface: "browse" }, { env: ON, fetch: s.fn })).status, "unsupported_city");
  assert.equal((await searchViatorLive({ city: "Kyoto", surface: "browse" }, { env: { ...ON, VIATOR_SANDBOX_API_KEY: undefined }, fetch: s.fn })).status, "unconfigured");
  assert.equal(s.calls.length, 0, "none of those made a request");

  const prod = stub();
  await searchViatorLive({ city: "Kyoto", surface: "browse" }, { env: { ...ON, NODE_ENV: "production" }, fetch: prod.fn });
  assert.equal(prod.calls[0].url, "https://api.viator.com/partner/products/search");
  assert.equal((prod.calls[0].init.headers as Record<string, string>)["exp-api-key"], KEY_PROD);
  assert.equal(cfg.viatorEndpoint({ NODE_ENV: "production", VIATOR_ENV: "sandbox" }).keyEnvName, "VIATOR_SANDBOX_API_KEY");
  assert.deepEqual(JSON.parse(String(prod.calls[0].init.body)).filtering, { destination: "332" });

  const out = JSON.stringify(await searchViatorLive({ city: "Kyoto", surface: "browse" }, { env: ON, fetch: stub().fn, now: () => new Date("2026-10-18T06:00:00Z") }));
  assert.ok(!out.includes("REVIEW_TEXT_MUST_NOT_APPEAR") && !out.includes("UNIQUE_CONTENT_MUST_NOT_APPEAR"));
  assert.match(out, /"asOf":"2026-10-18T06:00:00.000Z"/);
  assert.match(out, /"attribution":"Viator"/);
});

test("V5 stored Viator rows are hidden from traveler reads and kept", async () => {
  const { isPausedPartnerProduct } = await import("../services/partner-pause.service");
  assert.equal(isPausedPartnerProduct({ partnerName: "Viator" }), true);
  assert.equal(isPausedPartnerProduct({ productUrl: "https://www.viator.com/tours/x" }), true);
  assert.equal(isPausedPartnerProduct({ partnerName: "Viator" }, { GETYOURGUIDE_ENABLED: "1" }), true, "no switch brings stored Viator rows back");
  assert.equal(isPausedPartnerProduct({ partnerName: "Tiqets", productUrl: "https://www.tiqets.com/x" }), false);

  const RUN = crypto.randomUUID().slice(0, 8);
  const partner = `vd1-${RUN}-viator`;
  const product = `vd1-${RUN}-product`;
  const city = `Vd1City${RUN}`;
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category, approval_status, is_active)
    VALUES (${partner}, ${`VD-1 viator ${RUN}`}, 'https://www.viator.com', 'activity', 'approved', true)`);
  await db.execute(sql`INSERT INTO affiliate_products (id, partner_id, name, product_url, affiliate_url, city, is_active, booking_type, coordinates)
    VALUES (${product}, ${partner}, 'Stored Viator tour', 'https://www.viator.com/tours/k', 'https://www.viator.com/tours/k?mcid=1', ${city}, true, 'affiliate_bookable', '{"lat":35,"lng":135}'::jsonb)`);
  try {
    const { affiliateScraperService } = await import("../services/affiliate-scraper.service");
    const list = await affiliateScraperService.getProducts({ city, approvedOnly: true, limit: 50 });
    assert.ok(!list.products.some((p) => p.id === product), "Browse's read omits it");
    const grounding = await import("../services/affiliate-grounding.service");
    assert.ok(!(await grounding.getAffiliateProductsForMarket(city)).some((p) => p.id === product), "planner grounding omits it");
    const left = await db.execute(sql`SELECT count(*)::int AS n FROM affiliate_products WHERE id = ${product}`);
    assert.equal((left.rows[0] as any).n, 1, "nothing deleted");
  } finally {
    await db.execute(sql`DELETE FROM affiliate_products WHERE id = ${product}`);
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${partner}`);
  }
});
