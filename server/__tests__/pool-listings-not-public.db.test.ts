/**
 * The concierge pool account's listings never appear on a public surface (ledger
 * `2026-10-06-pool-listings-not-public`). One pool account with an approved, active listing, and
 * one ordinary provider listing in the same unique city, read through each public reader.
 *
 *   PL1  Services tab — `/api/discover` (`storage.unifiedSearch`): by city and by the listing's own
 *        name; the did-you-mean suggestion never names it
 *   PL2  `/api/services` (`storage.getAllActiveServices`)
 *   PL3  Destinations' city page — `/api/discover/location/:city` (`locationViewService`)
 *   PL4  `/api/provider-services` — the route drops it through `withoutConciergePoolListings`
 *   PL5  the directory and the billboard: the pool account is not a directory expert and not a
 *        verified local, although it is approved, verified and payable
 *   PL6  with no pool configured nothing is excluded (the gate is the pool test, not a name match)
 *
 * DISPOSABLE DB ONLY: rows keyed by a per-run prefix, deleted afterwards; the pool setting is
 * restored to what it was.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { storage } from "../storage";
import { locationViewService } from "../services/location-view.service";
import { directoryExperts, withoutConciergePoolListings } from "../services/expert-routability";
import { verifiedLocalIds } from "../services/landing-billboard.service";
import { invalidatePlatformConciergeCache, PLATFORM_CONCIERGE_USER_ID_SETTING_KEY } from "../services/platform-concierge.service";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (k: string) => `poolpub-${RUN}-${k}`;
const CITY = `Pooltown${RUN}`;
const POOL_NAME = `Booking Concierge ${RUN}`;
let priorPool: string | null = null;
let priorDemo: string | undefined;

async function setPool(v: string | null) {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
  if (v !== null) await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}, ${v})`);
  invalidatePlatformConciergeCache();
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  priorDemo = process.env.SHOW_DEMO_EXPERTS;
  delete process.env.SHOW_DEMO_EXPERTS;
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${PLATFORM_CONCIERGE_USER_ID_SETTING_KEY}`);
  priorPool = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  for (const [k, role] of [["pool", "local_expert"], ["ok", "local_expert"], ["prov", "service_provider"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id(k)}, ${`${id(k)}@routable.invalid`}, 'PL', ${k}, ${role})`);
  }
  for (const k of ["pool", "ok"]) {
    await db.execute(sql`
      INSERT INTO local_expert_forms (id, user_id, first_name, last_name, email, status, destinations, specialties,
                                      identity_verification_status, stripe_connect_status)
      VALUES (${`${id(k)}-form`}, ${id(k)}, 'PL', 'Fixture', ${`${id(k)}@form.invalid`}, 'approved', ${JSON.stringify([CITY])}::jsonb, '[]'::jsonb, 'verified', 'complete')
    `);
  }
  for (const [svc, owner, name] of [["pool-svc", "pool", POOL_NAME], ["prov-svc", "prov", `Harbour walk ${RUN}`]] as const) {
    await db.execute(sql`
      INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, city)
      VALUES (${id(svc)}, ${id(owner)}, ${name}, 'fixture', '35.00', 'active', 'approved', 'in_person', ${CITY})
    `);
  }
  await setPool(id("pool"));
});

after(async () => {
  await setPool(priorPool).catch(() => {});
  if (priorDemo === undefined) delete process.env.SHOW_DEMO_EXPERTS;
  else process.env.SHOW_DEMO_EXPERTS = priorDemo;
  await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${`poolpub-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id LIKE ${`poolpub-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`poolpub-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);

test("PL1 the Services tab's search never returns the pool listing", async () => {
  const byCity = await storage.unifiedSearch({ location: CITY, limit: 50 });
  assert.ok(ids(byCity.services).includes(id("prov-svc")), "an ordinary listing in the city is found");
  assert.equal(ids(byCity.services).includes(id("pool-svc")), false);
  assert.equal(byCity.total, 1);
  const byName = await storage.unifiedSearch({ query: POOL_NAME, limit: 50 });
  assert.equal(ids(byName.services).includes(id("pool-svc")), false, "not even by its own name");
  assert.notEqual(byName.suggestion, POOL_NAME, "the did-you-mean never names it");
});

test("PL2 /api/services never returns the pool listing", async () => {
  const rows = await storage.getAllActiveServices(undefined, CITY);
  assert.deepEqual(ids(rows), [id("prov-svc")]);
});

test("PL3 the Destinations city page never returns the pool listing", async () => {
  const view = await locationViewService.getLocationView(CITY, null);
  assert.equal(view.services.error, null);
  const got = ids(view.services.data ?? []);
  assert.ok(got.includes(id("prov-svc")));
  assert.equal(got.includes(id("pool-svc")), false);
});

test("PL4 /api/provider-services drops the pool account's rows", async () => {
  const rows = [{ id: "a", userId: id("pool") }, { id: "b", userId: id("prov") }, { id: "c", userId: null }];
  assert.deepEqual(ids(await withoutConciergePoolListings(rows, (r) => r.userId)), ["b", "c"]);
  const src = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
  const handler = src.slice(src.indexOf('app.get("/api/provider-services"'), src.indexOf('app.get("/api/provider-services"') + 3000);
  assert.match(handler, /withoutConciergePoolListings\(/, "the public browse route applies the exclusion");
});

test("PL5 the directory and the billboard never carry the pool account", async () => {
  const listed = await directoryExperts([{ id: id("pool") }, { id: id("ok") }]);
  assert.deepEqual(listed.map((e) => e.id), [id("ok")], "approved, verified and payable — still not in the directory");
  assert.deepEqual(await verifiedLocalIds("x", { candidates: async () => [id("pool"), id("ok")] }), [id("ok")], "never a billboard local");
});

test("PL6 with no pool configured nothing is excluded", async () => {
  await setPool(null);
  try {
    assert.deepEqual(ids(await storage.getAllActiveServices(undefined, CITY)).sort(), [id("pool-svc"), id("prov-svc")].sort());
  } finally {
    await setPool(id("pool"));
  }
});
