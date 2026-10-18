/**
 * PX-2 — no public partner-product response carries a price (ledger `2026-10-18-public-partner-price-strip`;
 * decision-maker, Oct 18, 2026).
 *
 *   P1 GET /api/affiliate/products (public): no product carries price, currency, original price, discount,
 *      the scrape time, a partner URL, or any price-shaped key inside its metadata
 *   P2 GET /api/affiliate/products/:id (public): the same
 *   P3 the projector keeps every other field; the admin branch is the only one that skips it
 *
 * (The route's `minPrice`/`maxPrice` query params reach `getProducts`, which declares and never applies
 * them, so they cannot disclose a stored price; nothing is changed there.)
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/px2-public-partner-price.db.test.ts
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    return "<none>";
  }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[px2] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { default: contentRoutes, registerDiscoveryRoutes } = await import("../routes/content.routes");
const { toPublicPartnerProduct, PRICE_SHAPED_KEY } = await import("../services/public-partner-product");

const RUN = crypto.randomUUID().slice(0, 8);
const PARTNER = `px2-${RUN}-partner`;
const PRODUCT = `px2-${RUN}-product`;
const CITY = `Px2City${RUN}`;

before(async () => {
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category, approval_status, is_active)
    VALUES (${PARTNER}, ${`PX-2 partner ${RUN}`}, 'https://partner.example.test', 'activity', 'approved', true)`);
  await db.execute(sql`INSERT INTO affiliate_products
      (id, partner_id, name, product_url, affiliate_url, city, is_active, booking_type, price, currency, original_price,
       discount_percent, last_scraped_at, rating, metadata)
    VALUES (${PRODUCT}, ${PARTNER}, 'Kyoto walk', 'https://partner.example.test/p', 'https://partner.example.test/p?ref=x',
      ${CITY}, true, 'affiliate_bookable', 45.50, 'JPY', 60.00, 25, now(), 4.7,
      '{"priceRange":"40-60","nested":{"fromAmount":45,"label":"kept"},"duration":"3h"}'::jsonb)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM affiliate_products WHERE id = ${PRODUCT}`);
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${PARTNER}`);
  } finally {
    await pool.end();
  }
});

let registered = false;
async function withRouter<T>(fn: (base: string) => Promise<T>): Promise<T> {
  if (!registered) {
    await registerDiscoveryRoutes();
    registered = true;
  }
  const app = express();
  app.use(express.json());
  app.use(contentRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const FORBIDDEN = ["price", "currency", "originalPrice", "discountPercent", "lastScrapedAt", "affiliateUrl", "productUrl"];

function assertNoPrice(product: any, where: string) {
  for (const k of FORBIDDEN) assert.ok(!(k in product), `${where} carries ${k}`);
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        assert.ok(!PRICE_SHAPED_KEY.test(k), `${where} carries a price-shaped key at ${path}.${k}`);
        walk(x, `${path}.${k}`);
      }
    }
  };
  walk(product, "product");
}

test("P1 the public list carries no price", async () => {
  await withRouter(async (base) => {
    const res = await fetch(`${base}/api/affiliate/products?city=${CITY}`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    const mine = body.products.find((p: any) => p.id === PRODUCT);
    assert.ok(mine, "the product is listed");
    assertNoPrice(mine, "list row");
    assert.equal(mine.name, "Kyoto walk");
    assert.equal(mine.metadata.nested.label, "kept", "non-price metadata is kept");
    assert.equal(mine.metadata.duration, "3h");
  });
});

test("P2 the public single read carries no price", async () => {
  await withRouter(async (base) => {
    const res = await fetch(`${base}/api/affiliate/products/${PRODUCT}`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assertNoPrice(body.product, "single product");
  });
});

test("P3 the projector keeps every other field; only the admin branch skips it", () => {
  const row = { id: "x", name: "n", rating: "4.5", price: "10", currency: "USD", originalPrice: "12", discountPercent: 5, lastScrapedAt: new Date(), metadata: null };
  assert.deepEqual(toPublicPartnerProduct(row), { id: "x", name: "n", rating: "4.5", metadata: null });
  const src = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  for (const route of ['router.get("/api/affiliate/products",', 'router.get("/api/affiliate/products/:id",']) {
    const at = src.indexOf(route);
    assert.ok(at > 0, `${route} exists`);
    const body = src.slice(at, at + 3000);
    assert.match(body, /isAdmin \? (result|product) : /, `${route} projects every non-admin response`);
  }
});
