/**
 * CN-1c-UI: the /services browse reads GET /api/discover, so the "Local concierge" filter needs the same optional
 * `serviceType` there that #1826 gave GET /api/services. One parser, one refusal ("Unknown service type."), the same
 * approved-and-active gate, and no new sort key.
 *
 *   D1  ?serviceType=concierge returns approved active concierge listings only, in the unfiltered read's order
 *   D2  no param and a blank param return every type
 *   D3  an unknown type is a 400 with the approved message
 *   D4  the profile payload names each listing's type (storefront select), and the new code carries no ranking claim
 *
 * Run: npx tsx --test --test-concurrency=1 server/__tests__/cn1c-ui-discover-service-type.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (key: string) => `cn1cui-${RUN}-${key}`;
const CITY = `Cnui${RUN}`;
const BASE = process.env.JOURNEY_BASE_URL ?? "http://127.0.0.1:5000";
const ROOT = path.resolve(import.meta.dirname, "../..");

const BANNED = [/paypal/i, /traveler fee/i, /\bcrowd\b/i, /trending/i, /\bbest\b/i, /\btop\b/i, /most popular/i, /ranking/i];

async function api(pathname: string) {
  const res = await fetch(`${BASE}${pathname}`);
  const text = await res.text();
  let json: any = null;
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
    VALUES (${id("owner")}, ${`${id("owner")}@cn1cui.invalid`}, 'CN', 'Ui', 'local_expert')
  `);
  const rows: Array<[string, string, string, string, number]> = [
    ["hi", "concierge", "active", "approved", 3],
    ["lo", "concierge", "active", "approved", 1],
    ["plan", "planning", "active", "approved", 9],
    ["draft", "concierge", "draft", "submitted", 0],
    ["rejected", "concierge", "active", "rejected", 0],
  ];
  for (const [key, serviceType, status, approval, bookings] of rows) {
    await db.execute(sql`
      INSERT INTO provider_services (
        id, user_id, service_name, description, price, status, approval_status,
        delivery_method, city, service_type, bookings_count
      ) VALUES (
        ${id(key)}, ${id("owner")}, ${`Listing ${key}`}, 'fixture', '40.00',
        ${status}, ${approval}, 'in_person', ${CITY}, ${serviceType}, ${bookings}
      )
    `);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM provider_services WHERE id LIKE ${`cn1cui-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`cn1cui-${RUN}-%`}`).catch(() => {});
  await pool.end();
});

const ids = (body: any): string[] => ((body?.services ?? []) as Array<{ id: string }>).map((row) => String(row.id));
const discover = (qs: string) => api(`/api/discover?location=${encodeURIComponent(CITY)}&limit=50${qs}`);

test("D1 ?serviceType=concierge returns approved active concierge listings only, in the unfiltered order", async () => {
  const open = await discover("");
  assert.equal(open.status, 200);
  const filtered = await discover("&serviceType=concierge");
  assert.equal(filtered.status, 200);
  assert.deepEqual(ids(filtered.json).sort(), [id("hi"), id("lo")].sort());
  for (const key of ["plan", "draft", "rejected"]) assert.equal(ids(filtered.json).includes(id(key)), false, key);
  const openOrder = ids(open.json).filter((rowId) => rowId === id("hi") || rowId === id("lo"));
  assert.deepEqual(ids(filtered.json), openOrder);
  assert.equal(filtered.json.total, 2);
});

test("D2 no param and a blank param return every live type", async () => {
  for (const qs of ["", "&serviceType=", "&serviceType=%20"]) {
    const res = await discover(qs);
    assert.equal(res.status, 200, qs);
    assert.deepEqual(ids(res.json).sort(), [id("hi"), id("lo"), id("plan")].sort(), qs);
  }
  const planning = await discover("&serviceType=planning");
  assert.deepEqual(ids(planning.json), [id("plan")]);
});

test("D3 an unknown type is a 400 with the approved message", async () => {
  for (const bad of ["top", "Concierge", "concierge,planning"]) {
    const res = await discover(`&serviceType=${encodeURIComponent(bad)}`);
    assert.equal(res.status, 400, bad);
    assert.equal(res.json?.message, "Unknown service type.", bad);
  }
});

test("D4 the storefront names each listing's type, and the new code adds no sort key or claim", () => {
  const storefront = fs.readFileSync(path.join(ROOT, "server/routes/storefront.routes.ts"), "utf8");
  assert.match(storefront, /serviceType: providerServices\.serviceType,/);

  const routes = fs.readFileSync(path.join(ROOT, "server/routes/content.routes.ts"), "utf8");
  const handler = routes.slice(routes.indexOf('router.get("/api/discover"'), routes.indexOf("const result = await storage.unifiedSearch(filters);"));
  assert.match(handler, /parseServiceTypeQuery\(req\.query\.serviceType\)/);
  assert.match(handler, /UNKNOWN_SERVICE_TYPE_MESSAGE/);

  const storageSrc = fs.readFileSync(path.join(ROOT, "server/storage.ts"), "utf8");
  const reader = storageSrc.slice(storageSrc.indexOf("async unifiedSearch("), storageSrc.indexOf("const limit = Math.min(filters.limit || 20, 200);"));
  assert.match(reader, /eq\(providerServices\.serviceType, filters\.serviceType\)/);
  assert.match(reader, /eq\(providerServices\.approvalStatus, "approved"\)/);

  const files = [
    "client/src/lib/service-type-filter.ts",
    "client/src/components/service-type-filter.tsx",
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const literal of src.match(/"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g) ?? []) {
      for (const banned of BANNED) assert.doesNotMatch(literal, banned, `${file}: ${literal}`);
    }
  }
});
