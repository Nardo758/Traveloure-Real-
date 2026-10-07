/**
 * Three public-read fixes (ledger `2026-10-07-public-service-ids`).
 *
 *   PS1  `GET /api/services` never sends a listing owner's `users.id` (LD 40): an ordinary
 *        approved listing comes back with every field it had, and no `userId`; the projector is pure
 *   PS2  `GET /api/services/:id` answers the concierge pool account's listing with the SAME 404 as an
 *        absent id (R353's rule, extended to the by-id read); an ordinary listing still reads, with no
 *        `userId`
 *   PS3  `GET /api/affiliate/products` caps `limit` at the shared public bound (MAX_PAGE_LIMIT): the route
 *        reads its page only through `affiliateProductsPage`, and a huge `limit` is answered, not refused
 *
 * Runs against a live server (JOURNEY_BASE_URL, default 127.0.0.1:5000) on a disposable database. The
 * pool account and its approved `Booking Concierge` listing are migration 313's own rows, read from
 * `platform_settings` — never set here, so the server's cached pool id is the same one this reads.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { toPublicServiceListing } from "../utils/public-service-listing";
import { affiliateProductsPage, MAX_PAGE_LIMIT } from "../utils/pagination";
import { PLATFORM_CONCIERGE_USER_ID_SETTING_KEY } from "../services/platform-concierge.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const ids = { owner: `psid-${RUN}-owner`, svc: `psid-${RUN}-svc` };
const CITY = `Psidtown${RUN}`;

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${ids.owner}, ${`${ids.owner}@t.test`}, 'PS', 'Owner', 'service_provider')`);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, city)
    VALUES (${ids.svc}, ${ids.owner}, ${`Harbour walk ${RUN}`}, 'fixture', '40.00', 'active', 'approved', 'in_person', ${CITY})
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.svc}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.owner}`).catch(() => {});
  await pool.end();
});

test("PS1 /api/services never sends the owner's users.id", async () => {
  assert.deepEqual(toPublicServiceListing({ id: "s", userId: "u", serviceName: "x", price: "1" }), { id: "s", serviceName: "x", price: "1" });
  const res = await fetch(`${BASE_URL}/api/services?location=${encodeURIComponent(CITY)}`);
  assert.equal(res.status, 200);
  const rows: any[] = await res.json();
  const mine = rows.find((r) => r.id === ids.svc);
  assert.ok(mine, "the ordinary listing is listed");
  assert.equal(mine.serviceName, `Harbour walk ${RUN}`);
  for (const r of rows) assert.equal("userId" in r, false, `row ${r.id} carries no userId`);
  const all: any[] = await (await fetch(`${BASE_URL}/api/services`)).json();
  assert.equal(all.some((r) => "userId" in r), false, "not on the unfiltered list either");
});

test("PS2 /api/services/:id is one 404 for the pool account's listing", async () => {
  const r = await db.execute(sql`
    SELECT ps.id FROM provider_services ps
      JOIN platform_settings s ON s.setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY} AND ps.user_id = s.setting_value
     WHERE ps.status = 'active' AND ps.approval_status = 'approved' LIMIT 1`);
  const poolListing = (r.rows[0] as any)?.id as string | undefined;
  assert.ok(poolListing, "migration 313's approved pool listing is present on this database");
  const poolRes = await fetch(`${BASE_URL}/api/services/${poolListing}`);
  const absentRes = await fetch(`${BASE_URL}/api/services/psid-${RUN}-absent`);
  assert.equal(poolRes.status, 404);
  assert.deepEqual(await poolRes.json(), await absentRes.json(), "the same answer as an id that does not exist");
  const ok = await fetch(`${BASE_URL}/api/services/${ids.svc}`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.id, ids.svc);
  assert.equal("userId" in body, false);
});

test("PS3 /api/affiliate/products bounds its page like every other public list", async () => {
  assert.deepEqual(affiliateProductsPage({ limit: "100000", offset: "5" }), { limit: MAX_PAGE_LIMIT, offset: 5 });
  assert.deepEqual(affiliateProductsPage({}), { limit: 50, offset: 0 }, "the default is unchanged");
  assert.deepEqual(affiliateProductsPage({ limit: "100" }), { limit: 100, offset: 0 }, "the map's own 100 is untouched");
  assert.deepEqual(affiliateProductsPage({ limit: "-3", offset: "x" }), { limit: 50, offset: 0 });
  // The route reads its page through that helper and nowhere else (a disposable DB holds too few
  // products for the HTTP answer alone to show the cap).
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes/content.routes.ts"), "utf8");
  const at = src.indexOf('router.get("/api/affiliate/products",');
  const handler = src.slice(at, src.indexOf("router.get(", at + 10));
  assert.match(handler, /affiliateProductsPage\(req\.query\)/);
  assert.doesNotMatch(handler, /parseInt\(limit/, "no unbounded limit parse is left");
  const res = await fetch(`${BASE_URL}/api/affiliate/products?limit=100000`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.products) && body.products.length <= MAX_PAGE_LIMIT);
});
