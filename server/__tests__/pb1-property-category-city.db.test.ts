/**
 * PB-1 — A PROPERTY IS LODGING BY CONSTRUCTION, AND ITS NEIGHBOURHOOD GIVES IT A CITY
 * (rulings R1/R2, ledger `2026-10-10-pb1-property-category-city`). HTTP against the real dev
 * server, the fp1-console-defects / s8-property-builder harness.
 *
 * Why: a builder-created property was born with no category and (with no neighbourhood) no city,
 * so the stay pool (`where-to-stay.service.ts` cityHotels: category_key='accommodation' + a city
 * match) could never pick it up.
 *
 *   C1  POST /api/provider/properties sets category = accommodation; a body `categoryId` naming
 *       another category is IGNORED (R1 — the client never sends it, and a crafted one is dropped).
 *   C2  the rooms are born in the same category, and inherit the neighbourhood and the city.
 *   C3  the neighbourhood is resolved to its city by `deriveCityPatch` (the ONE rule).
 *   C4  no neighbourhood ⇒ city NULL (R2's honest "not listed yet" path) — the property still saves
 *       and is still accommodation.
 *   C5  the generic POST /api/provider/services clamps the category for productShape 'property'
 *       too, and leaves a non-property listing's chosen category alone.
 *
 * DISPOSABLE DB ONLY — every row created here is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 server/__tests__/pb1-property-category-city.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const createdEmails: string[] = [];
const createdServiceIds: string[] = [];

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[pb1] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

let provider = { id: "", cookie: "" };
let accommodationId = "";
let otherCategoryId = "";
// A RUN-UNIQUE city + neighbourhood, so no other suite's rows can satisfy these proofs.
const NB_CITY = `PB1City-${RUN}`;
const NB_SLUG = `pb1-nb-${RUN}`;
const NB_ID = `pb1-nb-${RUN}-id`;

async function row(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM provider_services WHERE id = ${id} LIMIT 1`);
  const found = (r.rows as any[])[0];
  assert.ok(found, `provider_services row ${id} must exist`);
  return found;
}

async function createProperty(extra: Record<string, unknown>) {
  const res = await readOnce(await api("/api/provider/properties", provider.cookie, "POST", {
    serviceName: `PB1 Property ${RUN} ${crypto.randomUUID().slice(0, 6)}`,
    description: "PB-1 property fixture",
    rooms: [{ roomName: "PB1 Room A", price: "120.00", units: 1 }],
    ...extra,
  }));
  if (res.status === 201 && res.body?.id) {
    createdServiceIds.push(res.body.id);
    for (const r of res.body.rooms ?? []) createdServiceIds.push(r.id);
  }
  return res;
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const email = `pb1-${RUN}@t.test`;
  const reg = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "PB", lastName: "One",
  }));
  assert.equal(reg.status, 201, `register failed (${reg.status}): ${reg.text}`);
  createdEmails.push(email);
  const id = reg.body.user.id as string;
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${id}`);
  await db.execute(sql`
    INSERT INTO service_provider_forms
      (id, user_id, business_name, name, email, mobile, country, address, business_type,
       identity_verification_status, business_verification_status, status)
    VALUES
      (${crypto.randomUUID()}, ${id}, ${"PB1 Test Biz"}, ${"PB1 Test"}, ${email},
       ${"+10000000000"}, ${"Japan"}, ${"1 Test Street"}, ${"tour_operator"},
       ${"verified"}, ${"verified"}, ${"approved"})
  `);
  const cookie = (await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD }))
    .headers.get("set-cookie")!.split(";")[0];
  provider = { id, cookie };

  const a = await db.execute(sql`SELECT id FROM service_categories WHERE category_key = 'accommodation' LIMIT 1`);
  accommodationId = ((a.rows as any[])[0]?.id as string) ?? "";
  assert.ok(accommodationId, "the bench must carry the accommodation category (migration 034)");
  const o = await db.execute(sql`
    SELECT id FROM service_categories WHERE category_key IS NOT NULL AND category_key <> 'accommodation' ORDER BY category_key LIMIT 1
  `);
  otherCategoryId = ((o.rows as any[])[0]?.id as string) ?? "";
  assert.ok(otherCategoryId, "the bench must carry a non-accommodation category");

  await db.execute(sql`
    INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng, radius_km)
    VALUES (${NB_ID}, ${NB_CITY}, 'Japan', ${`PB1 Neighbourhood ${RUN}`}, ${NB_SLUG},
            '35.0100000', '135.7600000', '1.50')
  `);
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of [...createdServiceIds].reverse()) {
      await db.execute(sql`DELETE FROM provider_services WHERE parent_service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    await db.execute(sql`DELETE FROM city_neighborhoods WHERE id = ${NB_ID}`).catch(() => {});
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM provider_services WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

test("C1–C3: a property is accommodation, a body categoryId is ignored, the neighbourhood gives it a city, rooms inherit", async () => {
  const res = await createProperty({ neighborhood: NB_SLUG, categoryId: otherCategoryId });
  assert.equal(res.status, 201, `property create failed (${res.status}): ${res.text}`);

  const property = await row(res.body.id);
  assert.equal(property.category_id, accommodationId, "C1: the category is server-set to accommodation");
  assert.notEqual(property.category_id, otherCategoryId, "C1: a client-sent category never reaches the row");
  assert.equal(property.neighborhood, NB_SLUG);
  assert.equal(property.city, NB_CITY, "C3: the city is derived from the neighbourhood");

  assert.ok((res.body.rooms ?? []).length >= 1, "the property was created with its room");
  for (const r of res.body.rooms) {
    const roomRow = await row(r.id);
    assert.equal(roomRow.category_id, accommodationId, "C2: a room is accommodation too");
    assert.equal(roomRow.neighborhood, NB_SLUG, "C2: a room inherits the neighbourhood");
    assert.equal(roomRow.city, NB_CITY, "C2: a room inherits the city");
  }
});

test("C4: no neighbourhood ⇒ city NULL, never guessed — the property still saves as accommodation", async () => {
  const res = await createProperty({});
  assert.equal(res.status, 201, `property create failed (${res.status}): ${res.text}`);
  const property = await row(res.body.id);
  assert.equal(property.category_id, accommodationId);
  assert.equal(property.city, null, "no neighbourhood ⇒ no city (R2: honest, not blocking)");
  assert.equal(property.neighborhood, null);
});

test("C5: the generic listing rail clamps a property's category, and leaves a non-property's alone", async () => {
  const prop = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `PB1 Generic Property ${RUN}`,
    description: "PB-1 generic-rail property fixture",
    price: "90.00",
    productShape: "property",
    deliveryMethod: "in_person",
    categoryId: otherCategoryId,
    saveIntent: "draft",
  }));
  assert.equal(prop.status, 201, `generic property create failed (${prop.status}): ${prop.text}`);
  createdServiceIds.push(prop.body.id);
  assert.equal((await row(prop.body.id)).category_id, accommodationId, "a property is accommodation on this rail too");

  const plain = await readOnce(await api("/api/provider/services", provider.cookie, "POST", {
    serviceName: `PB1 Generic Plain ${RUN}`,
    description: "PB-1 generic-rail non-property fixture",
    price: "90.00",
    deliveryMethod: "in_person",
    categoryId: otherCategoryId,
    saveIntent: "draft",
  }));
  assert.equal(plain.status, 201, `generic plain create failed (${plain.status}): ${plain.text}`);
  createdServiceIds.push(plain.body.id);
  assert.equal((await row(plain.body.id)).category_id, otherCategoryId, "a non-property keeps the category it chose");
});
