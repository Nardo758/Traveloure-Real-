/**
 * GET /api/affiliate/products/:id still answers once `/by-location` is gone (ledger `2026-10-18-by-location-deleted`).
 *
 *   I1 an approved partner's product reads 200 with that product
 *   I2 an unknown id reads 404
 *   I3 `by-location` is now an ordinary unknown id: 404 "Product not found", never a location list
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test --test-force-exit server/__tests__/affiliate-product-by-id.db.test.ts
 */
import crypto from "node:crypto";
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
  throw new Error(`[affiliate-product-by-id] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { default: contentRoutes, registerDiscoveryRoutes } = await import("../routes/content.routes");

const RUN = crypto.randomUUID().slice(0, 8);
const PARTNER = `apid-${RUN}-partner`;
const PRODUCT = `apid-${RUN}-product`;

before(async () => {
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category, approval_status, is_active)
    VALUES (${PARTNER}, ${`By-id partner ${RUN}`}, 'https://partner.example.test', 'activity', 'approved', true)`);
  await db.execute(sql`INSERT INTO affiliate_products (id, partner_id, name, product_url, city, is_active, booking_type)
    VALUES (${PRODUCT}, ${PARTNER}, 'Kyoto walk', 'https://partner.example.test/p', 'Kyoto', true, 'affiliate_bookable')`);
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

test("I1 an approved partner's product reads 200", async () => {
  await withRouter(async (base) => {
    const res = await fetch(`${base}/api/affiliate/products/${PRODUCT}`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.product.id, PRODUCT);
    assert.equal(body.product.name, "Kyoto walk");
  });
});

test("I2 an unknown id reads 404", async () => {
  await withRouter(async (base) => {
    const res = await fetch(`${base}/api/affiliate/products/apid-${RUN}-missing`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as any).message, "Product not found");
  });
});

test("I3 by-location is an ordinary unknown id now", async () => {
  await withRouter(async (base) => {
    const res = await fetch(`${base}/api/affiliate/products/by-location?city=Kyoto`);
    assert.equal(res.status, 404);
    const body: any = await res.json();
    assert.equal(body.message, "Product not found");
    assert.ok(!("products" in body), "no location list is served");
  });
});
