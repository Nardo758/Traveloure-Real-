/**
 * CN-1c: `serviceType=concierge` on GET /api/services and on the city-page payload
 * (GET /api/discover/location/:city, the data behind /city/:slug).
 *
 * The filter returns approved, active concierge listings. A draft concierge listing
 * and a rejected concierge listing never appear. The bookings order on /api/services
 * and the featured-adjusted order on the city page stay the ones those reads already
 * had. The payload adds no ranking claim and no "top" claim.
 *
 * Run: npx tsx --test --test-concurrency=1 server/__tests__/cn1c-service-type-filter.db.test.ts
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

const RUN = crypto.randomUUID().slice(0, 8);
const id = (key: string) => `cn1c-${RUN}-${key}`;
const CITY = `Cn1c${RUN}`;
const BASE = process.env.JOURNEY_BASE_URL ?? "http://127.0.0.1:5000";
const ROOT = path.resolve(import.meta.dirname, "../..");

const HIDDEN = ["draft", "rejected", "paused", "submitted"] as const;
const LIVE_CONCIERGE = ["hi", "lo"] as const;

const BANNED = [
  /paypal/i,
  /traveler fee/i,
  /\bcrowd\b/i,
  /trending/i,
  /\bfounding\b/i,
  /\bbest\b/i,
  /\btop\b/i,
  /ultimate/i,
  /premier/i,
  /world-class/i,
  /#1/,
  /most popular/i,
  /ranking/i,
];

function stringLiterals(src: string): string[] {
  return [...src.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g)].map((match) => match[0]);
}

function assertNoClaim(label: string, text: string) {
  for (const banned of BANNED) assert.doesNotMatch(text, banned, `${label} matches ${banned}`);
}

async function api(pathname: string) {
  const res = await fetch(`${BASE}${pathname}`);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const health = await fetch(`${BASE}/api/health`);
  assert.equal(health.status, 200, "dev server must be running on :5000");
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${id("owner")}, ${`${id("owner")}@cn1c.invalid`}, 'CN', 'One', 'local_expert')
  `);
  const rows: Array<[string, string, string, string, number, number, string | null]> = [
    ["hi", "concierge", "active", "approved", 3, 10, "5.00"],
    ["lo", "concierge", "active", "approved", 1, 10, "4.00"],
    ["plan", "planning", "active", "approved", 9, 0, null],
    ["draft", "concierge", "draft", "submitted", 0, 0, null],
    ["rejected", "concierge", "active", "rejected", 0, 0, null],
    ["paused", "concierge", "paused", "approved", 0, 0, null],
    ["submitted", "concierge", "active", "submitted", 0, 0, null],
  ];
  for (const [key, serviceType, status, approval, bookings, reviews, rating] of rows) {
    await db.execute(sql`
      INSERT INTO provider_services (
        id, user_id, service_name, description, price, status, approval_status,
        delivery_method, city, service_type, bookings_count, review_count, average_rating
      ) VALUES (
        ${id(key)}, ${id("owner")}, ${`Listing ${key}`}, 'fixture', '40.00',
        ${status}, ${approval}, 'in_person', ${CITY}, ${serviceType}, ${bookings}, ${reviews}, ${rating}
      )
    `);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${`cn1c-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`cn1c-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

function idsOf(rows: Array<{ id?: string }>): string[] {
  return rows.map((row) => String(row.id));
}

test("GET /api/services?serviceType=concierge returns approved active concierge listings only", async () => {
  const filtered = await api(`/api/services?location=${encodeURIComponent(CITY)}&serviceType=concierge`);
  assert.equal(filtered.status, 200);
  const rows = filtered.json as Array<{ id: string; serviceType: string; status: string; approvalStatus: string }>;
  assert.deepEqual(idsOf(rows), [id("hi"), id("lo")]);
  for (const row of rows) {
    assert.equal(row.serviceType, "concierge");
    assert.equal(row.status, "active");
    assert.equal(row.approvalStatus, "approved");
  }
  for (const key of HIDDEN) assert.equal(idsOf(rows).includes(id(key)), false, key);
  assert.equal(idsOf(rows).includes(id("plan")), false);
  assertNoClaim("filtered browse", JSON.stringify(rows));

  const open = await api(`/api/services?location=${encodeURIComponent(CITY)}`);
  assert.equal(open.status, 200);
  assert.deepEqual(idsOf(open.json as Array<{ id: string }>), [id("plan"), id("hi"), id("lo")]);

  const blank = await api(`/api/services?location=${encodeURIComponent(CITY)}&serviceType=`);
  assert.equal(blank.status, 200);
  assert.deepEqual(idsOf(blank.json as Array<{ id: string }>), [id("plan"), id("hi"), id("lo")]);

  const refused = await api(`/api/services?location=${encodeURIComponent(CITY)}&serviceType=top`);
  assert.equal(refused.status, 400);
  assert.equal((refused.json as { message?: string }).message, "Unknown service type.");
});

test("the city page payload filters concierge the same way", async () => {
  const filtered = await api(`/api/discover/location/${encodeURIComponent(CITY)}?serviceType=concierge`);
  assert.equal(filtered.status, 200);
  const body = filtered.json as { services?: { error: string | null; data: Array<{ id: string; serviceType: string; approvalStatus: string }> } };
  assert.equal(body.services?.error, null);
  const rows = body.services?.data ?? [];
  assert.deepEqual(idsOf(rows), [id("hi"), id("lo")]);
  for (const row of rows) {
    assert.equal(row.serviceType, "concierge");
    assert.equal(row.approvalStatus, "approved");
  }
  for (const key of [...HIDDEN, "plan"] as const) assert.equal(idsOf(rows).includes(id(key)), false, key);
  assertNoClaim("filtered city services", JSON.stringify(rows));

  const open = await api(`/api/discover/location/${encodeURIComponent(CITY)}`);
  assert.equal(open.status, 200);
  const openRows = (open.json as { services?: { data: Array<{ id: string }> } }).services?.data ?? [];
  assert.deepEqual(idsOf(openRows).sort(), [id("plan"), id("hi"), id("lo")].sort());
  const openOrder = idsOf(openRows).filter((rowId) => LIVE_CONCIERGE.some((key) => id(key) === rowId));
  const filteredOrder = idsOf(rows).filter((rowId) => openOrder.includes(rowId));
  assert.deepEqual(filteredOrder, openOrder);

  const refused = await api(`/api/discover/location/${encodeURIComponent(CITY)}?serviceType=best`);
  assert.equal(refused.status, 400);
});

test("the same reads through storage and the location view keep the approved active gate", async () => {
  const browse = await storage.getAllActiveServices(undefined, CITY, "concierge");
  assert.deepEqual(browse.map((row) => row.id), [id("hi"), id("lo")]);
  const view = await locationViewService.getLocationView(CITY, null, { serviceType: "concierge" });
  assert.equal(view.services.error, null);
  const got = (view.services.data ?? []).map((row: { id: string }) => row.id).sort();
  assert.deepEqual(got, [id("hi"), id("lo")].sort());
  for (const key of HIDDEN) assert.equal(got.includes(id(key)), false, key);
});

test("the filter adds no ranking or top claim, and leaves the existing order in place", () => {
  const querySrc = fs.readFileSync(path.join(ROOT, "shared/service-type-query.ts"), "utf8");
  for (const literal of stringLiterals(querySrc)) assertNoClaim("service-type-query", literal);
  assert.doesNotMatch(querySrc, /orderBy|sortByFeaturedAdjusted|isFeatured/);

  const routes = fs.readFileSync(path.join(ROOT, "server/routes/content.routes.ts"), "utf8");
  const servicesHandler = routes.slice(routes.indexOf('router.get("/api/services"'), routes.indexOf('router.get("/api/discover"'));
  assert.match(servicesHandler, /parseServiceTypeQuery\(req\.query\.serviceType\)/);
  assert.match(servicesHandler, /getAllActiveServices\(categoryId, location, parsedType\.serviceType/);
  for (const literal of stringLiterals(servicesHandler)) assertNoClaim("GET /api/services", literal);

  const cityHandler = routes.slice(
    routes.indexOf('router.get("/api/discover/location/:city"'),
    routes.indexOf('router.get("/api/discover/tiles/:tileId/panel"'),
  );
  assert.match(cityHandler, /serviceType: parsedType\.serviceType/);
  for (const literal of stringLiterals(cityHandler)) assertNoClaim("city payload", literal);

  const storageSrc = fs.readFileSync(path.join(ROOT, "server/storage.ts"), "utf8");
  const reader = storageSrc.slice(storageSrc.indexOf("async getAllActiveServices"), storageSrc.indexOf("async toggleServiceStatus"));
  assert.match(reader, /eq\(providerServices\.status, "active"\)/);
  assert.match(reader, /eq\(providerServices\.approvalStatus, "approved"\)/);
  assert.match(reader, /orderBy\(desc\(providerServices\.bookingsCount\)\)/);
  assert.match(reader, /eq\(providerServices\.serviceType, serviceType\)/);

  const citySrc = fs.readFileSync(path.join(ROOT, "server/services/location-view.service.ts"), "utf8");
  assert.equal((citySrc.match(/sortByFeaturedAdjusted\(/g) ?? []).length, 1);
  assert.match(citySrc, /eq\(providerServices\.status, "active"\)/);
  assert.match(citySrc, /eq\(providerServices\.approvalStatus, "approved"\)/);
  assert.match(citySrc, /eq\(providerServices\.serviceType, opts\.serviceType\)/);
});
