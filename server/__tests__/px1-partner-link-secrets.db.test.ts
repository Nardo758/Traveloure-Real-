/**
 * PX-1 — no generated partner link carries a configured secret, and GetYourGuide is paused
 * (ledger `2026-10-18-px1-partner-links`; decision-maker, Oct 17, 2026).
 *
 *   S1 every secret-named env var the server reads is set to a random value AT TEST TIME (never a
 *      literal); every partner search builder runs against a fetch stub, and no link it returns
 *      contains any of those values
 *   S2 the Viator feed: links and the feed request carry the public marker as `mcid` — no secret in
 *      the request's URL and none in any link
 *   S3 static second layer: no link-building line in `server/` interpolates the Travelpayouts token or
 *      a secret-named env var
 *   S4 GetYourGuide paused: the search makes NO request (the token is never sent), the sync skips it,
 *      and the hide rule matches its rows by partner name, partner host and link host; un-paused it
 *      hides nothing
 *   S5 a stored row of a paused partner is never returned by the public product reads or grounding,
 *      and stays in the table
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/px1-partner-link-secrets.db.test.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|API_KEY|_KEY)$/;

function serverFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      out.push(...serverFiles(p));
    } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const SERVER_FILES = serverFiles(path.join(ROOT, "server"));

// Every env NAME the server reads that names a secret — found from the source, so a new key is covered.
const SECRET_ENV_NAMES = Array.from(
  new Set(
    SERVER_FILES.flatMap((f) =>
      Array.from(fs.readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g)).map(
        (m) => m[1] ?? m[2],
      ),
    ),
  ),
).filter((n) => SECRET_NAME.test(n));
for (const name of SECRET_ENV_NAMES) process.env[name] = `px1-${crypto.randomUUID()}`;
process.env.TRAVELPAYOUTS_MARKER = `m${crypto.randomInt(100000, 999999)}`;
delete process.env.GETYOURGUIDE_ENABLED;

const secretValues = () => SECRET_ENV_NAMES.map((n) => process.env[n]!).filter(Boolean);

import { test, before, after } from "node:test";
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
  throw new Error(`[px1] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");

// A generic partner payload: every array key a builder might read, every link-ish field set.
const ITEM = {
  id: 7, productCode: "P7", tour_id: 7, title: "Kyoto walk", name: "Kyoto walk", description: "d",
  productUrl: "https://partner.example/p/7", url: "https://partner.example/p/7", booking_url: "https://partner.example/b/7",
  link: "https://partner.example/l/7", deeplink: "https://partner.example/d/7", product_url: "https://partner.example/p/7",
  price: { amount: "10", currency: "USD", values: { amount: 10 } }, destinationName: "Kyoto", city: "Kyoto",
  latitude: "35", longitude: "135", origin: "KIX", destination: "Kyoto",
};
const PAYLOAD = {
  products: [ITEM], tours: [ITEM], data: [ITEM], activities: [ITEM], transfers: [ITEM], results: [ITEM],
  items: [ITEM], offers: [ITEM], cars: [ITEM], plans: [ITEM], destinations: [ITEM], routes: [ITEM],
  packages: [ITEM], cities: [ITEM], departures: [ITEM],
};
const requests: string[] = [];
const realFetch = globalThis.fetch;
function stubFetch() {
  requests.length = 0;
  globalThis.fetch = (async (input: any) => {
    requests.push(typeof input === "string" ? input : input?.url ?? String(input));
    return new Response(JSON.stringify(PAYLOAD), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as any;
}

function linkStrings(value: unknown, key = "", out: string[] = []): string[] {
  if (typeof value === "string") {
    if (/url|link|href/i.test(key) || /^https?:\/\//i.test(value)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) linkStrings(v, key, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) linkStrings(v, k, out);
  }
  return out;
}

const RUN = crypto.randomUUID().slice(0, 8);
const GYG_PARTNER = `px1-${RUN}-gyg`;
const GYG_PRODUCT = `px1-${RUN}-gyg-product`;
const OK_PARTNER = `px1-${RUN}-ok`;
const OK_PRODUCT = `px1-${RUN}-ok-product`;
const CITY = `Px1City${RUN}`;

before(async () => {
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category, approval_status, is_active)
    VALUES (${GYG_PARTNER}, ${`GetYourGuide`}, 'https://www.getyourguide.com', 'activity', 'approved', true),
           (${OK_PARTNER}, ${`PX-1 partner ${RUN}`}, 'https://partner.example.test', 'activity', 'approved', true)`)
    .catch(async () => {
      // A partner named GetYourGuide may already exist; the host alone still marks this one.
      await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category, approval_status, is_active)
        VALUES (${GYG_PARTNER}, ${`PX-1 gyg ${RUN}`}, 'https://www.getyourguide.com', 'activity', 'approved', true),
               (${OK_PARTNER}, ${`PX-1 partner ${RUN}`}, 'https://partner.example.test', 'activity', 'approved', true)`);
    });
  await db.execute(sql`INSERT INTO affiliate_products (id, partner_id, name, product_url, affiliate_url, city, is_active, booking_type, coordinates)
    VALUES (${GYG_PRODUCT}, ${GYG_PARTNER}, 'GYG tour', 'https://www.getyourguide.com/kyoto/', 'https://www.getyourguide.com/kyoto/?partner_id=x', ${CITY}, true, 'affiliate_bookable', '{"lat":35,"lng":135}'::jsonb),
           (${OK_PRODUCT}, ${OK_PARTNER}, 'Other tour', 'https://partner.example.test/t', 'https://partner.example.test/t?ref=x', ${CITY}, true, 'affiliate_bookable', '{"lat":35,"lng":135}'::jsonb)`);
});

after(async () => {
  globalThis.fetch = realFetch;
  try {
    await db.execute(sql`DELETE FROM affiliate_products WHERE id IN (${GYG_PRODUCT}, ${OK_PRODUCT})`);
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id IN (${GYG_PARTNER}, ${OK_PARTNER})`);
  } finally {
    await pool.end();
  }
});

const ARGS = { destination: "Kyoto", city: "Kyoto", origin: "KIX", from: "KIX", to: "Kyoto", pickupLocation: "Kyoto", country: "JP", limit: 5 };

test("S1 no partner search builder returns a link containing a configured secret", async () => {
  assert.ok(SECRET_ENV_NAMES.includes("TRAVELPAYOUTS_TOKEN"), "the Travelpayouts token is among the names read");
  const dir = path.join(ROOT, "server/services/travelpayouts");
  let ran = 0;
  const ranFiles = new Set<string>();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".service.ts"))) {
    const mod = await import(path.join(dir, f));
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== "function" || !/^search/.test(name)) continue;
      stubFetch();
      let out: unknown;
      try {
        out = await (fn as any)({ ...ARGS });
      } catch {
        continue; // a builder that throws returned nothing to leak
      }
      ran++;
      ranFiles.add(f.replace(/\.service\.ts$/, ""));
      for (const link of linkStrings(out)) {
        for (const v of secretValues()) assert.ok(!link.includes(v), `${f} ${name} put a secret in a link`);
      }
    }
  }
  assert.ok(ran >= 15, `the partner builders ran (${ran})`);
  // PX-1b (decision-maker, Oct 18, 2026): the eight integrations whose API keeps its partner-required
  // auth are each among the builders this check ran (aviasales is `tpFetch`'s caller).
  for (const name of ["airalo", "omio", "kiwitaxi", "discovercars", "tiqets", "stasher", "busbud", "aviasales"]) {
    assert.ok(ranFiles.has(name), `${name}'s builder is covered`);
  }
  const { affiliateService } = await import("../services/affiliate.service");
  for (const p of ["viator", "booking", "twelvego"]) {
    const link = await affiliateService.getDeepLink(p, "P7").catch(() => null);
    for (const v of secretValues()) assert.ok(!(link ?? "").includes(v), `${p} deep link carries no secret`);
  }
  for (const link of [affiliateService.buildTwelveGoDeepLink({ origin: "Kyoto", destination: "Osaka" }), affiliateService.buildFeverDeepLink()]) {
    for (const v of secretValues()) assert.ok(!link.includes(v));
  }
});

test("S2 the Viator feed: marker as mcid on the request and every link; no secret in the request URL", async () => {
  await db.execute(sql`DELETE FROM travelpayouts_cache WHERE cache_key LIKE ${"%viator-feed%"}`).catch(() => {});
  stubFetch();
  const { searchViatorFeedProducts } = await import("../services/travelpayouts/viator-feed.service");
  const items = await searchViatorFeedProducts({ destination: "Kyoto", limit: 5 });
  assert.ok(items.length > 0, "the stub feed mapped");
  for (const it of items) assert.equal(new URL(it.affiliateUrl!).searchParams.get("mcid"), process.env.TRAVELPAYOUTS_MARKER);
  const feedRequests = requests.filter((u) => u.includes("viator.com"));
  assert.ok(feedRequests.length >= 1, "the feed was requested");
  for (const u of feedRequests) {
    assert.equal(new URL(u).searchParams.get("mcid"), process.env.TRAVELPAYOUTS_MARKER);
    for (const v of secretValues()) assert.ok(!u.includes(v), "no secret in the feed request URL");
  }
});

test("S3 no link-building line in server/ interpolates the token or a secret-named env var", () => {
  const LINK_LINE = /(bookingUrl|affiliateUrl|affiliate_url|booking_url|deep[lL]ink|href|productUrl)\s*[:=]/;
  const SECRET_REF = new RegExp(`getTravelpayoutsToken\\(\\)|\\$\\{token\\}|process\\.env\\.(${SECRET_ENV_NAMES.join("|")})\\b`);
  const hits: string[] = [];
  for (const f of SERVER_FILES) {
    fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => {
      if (LINK_LINE.test(l) && SECRET_REF.test(l)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test("S4 GetYourGuide paused: no request, the sync skips it, and the hide rule names its rows", async () => {
  const { getYourGuidePaused, isPausedPartnerProduct } = await import("../services/partner-pause.service");
  assert.equal(getYourGuidePaused({}), true, "unset ⇒ paused");
  assert.equal(getYourGuidePaused({ GETYOURGUIDE_ENABLED: "1" }), false);
  stubFetch();
  const { searchGetYourGuide } = await import("../services/travelpayouts/getyourguide.service");
  assert.deepEqual(await searchGetYourGuide({ destination: "Kyoto" }), []);
  assert.equal(requests.length, 0, "no GetYourGuide request — the token is never sent");
  const { ingestNetwork } = await import("../services/catalog-ingest.service");
  const r = await ingestNetwork("getyourguide", "Kyoto");
  assert.equal(r.paused, true);
  assert.equal(requests.length, 0);
  assert.equal(isPausedPartnerProduct({ partnerName: "GetYourGuide" }), true);
  assert.equal(isPausedPartnerProduct({ partnerWebsiteUrl: "https://www.getyourguide.com" }), true);
  assert.equal(isPausedPartnerProduct({ productUrl: "https://www.GetYourGuide.com/x" }), true);
  assert.equal(isPausedPartnerProduct({ partnerName: "Tiqets", productUrl: "https://www.tiqets.com/x" }), false);
  assert.equal(isPausedPartnerProduct({ partnerName: "GetYourGuide" }, { GETYOURGUIDE_ENABLED: "1" }), false, "un-paused ⇒ nothing hidden");
});

test("S5 a paused partner's stored row is never returned by the public reads, and stays in the table", async () => {
  const { affiliateScraperService } = await import("../services/affiliate-scraper.service");
  const list = await affiliateScraperService.getProducts({ city: CITY, approvedOnly: true, limit: 50 });
  const ids = list.products.map((p) => p.id);
  assert.ok(ids.includes(OK_PRODUCT));
  assert.ok(!ids.includes(GYG_PRODUCT), "Browse's read omits it");
  assert.equal(await affiliateScraperService.getProductById(GYG_PRODUCT, { approvedOnly: true }), null);
  const admin = await affiliateScraperService.getProducts({ city: CITY, approvedOnly: false, limit: 50 });
  assert.ok(admin.products.some((p) => p.id === GYG_PRODUCT), "the admin console still lists it");

  const grounding = await import("../services/affiliate-grounding.service");
  const market = await grounding.getAffiliateProductsForMarket(CITY);
  assert.ok(market.some((p) => p.id === OK_PRODUCT) && !market.some((p) => p.id === GYG_PRODUCT), "the planner's grounding omits it");
  assert.equal(await grounding.getAffiliateProductById(GYG_PRODUCT), null);
  assert.ok(!(await grounding.getAffiliateProductsByIds([GYG_PRODUCT])).has(GYG_PRODUCT));

  const cq = await import("../services/content-query.service");
  assert.deepEqual((await cq.getAffiliateProductsByIds([GYG_PRODUCT])).length, 0, "Discover omits it");
  const byLoc = await cq.getAffiliateProductsByLocation({ city: CITY, country: "zz-none" });
  assert.ok(!byLoc.some((p: any) => p.id === GYG_PRODUCT));

  const left = await db.execute(sql`SELECT count(*)::int AS n FROM affiliate_products WHERE id = ${GYG_PRODUCT}`);
  assert.equal((left.rows[0] as any).n, 1, "nothing deleted");
});
