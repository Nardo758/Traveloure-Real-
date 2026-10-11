/**
 * PB-2 — A PROPERTY'S NEIGHBORHOOD CHANGE CARRIES TO ITS ROOMS (ruling R3, ledger
 * `2026-10-10-pb2-property-patch-rooms`). HTTP against the real dev server, the
 * fp1-console-defects / s8-property-builder harness.
 *
 * Rooms inherit the property's neighborhood and city at creation; until this lane a later
 * PATCH /api/provider/properties/:id moved only the property, so its rooms stayed filed under the
 * old city (or none) and the stay pool read them there.
 *
 *   P1  changing the neighborhood moves the property AND every room to the new neighborhood and
 *       its derived city.
 *   P2  clearing it clears both on the property and the rooms (city NULL — never the old one).
 *   P3  a PATCH that does not name the neighborhood leaves the rooms' placement untouched.
 *   P4  another property's rooms are never touched.
 *
 * DISPOSABLE DB ONLY — every row created here is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 server/__tests__/pb2-property-category-city.db.test.ts
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
  if (!ok) throw new Error(`[pb2] REFUSING to write: '${host ?? "<none>"}' is not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
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
// RUN-UNIQUE cities + neighborhoods, so no other suite's rows can satisfy these proofs.
const A = { id: `pb2-a-${RUN}-id`, slug: `pb2-a-${RUN}`, city: `PB2CityA-${RUN}` };
const B = { id: `pb2-b-${RUN}-id`, slug: `pb2-b-${RUN}`, city: `PB2CityB-${RUN}` };

async function row(id: string): Promise<any> {
  const r = await db.execute(sql`SELECT * FROM provider_services WHERE id = ${id} LIMIT 1`);
  const found = (r.rows as any[])[0];
  assert.ok(found, `provider_services row ${id} must exist`);
  return found;
}

async function createProperty(neighborhood: string): Promise<{ id: string; roomIds: string[] }> {
  const res = await readOnce(await api("/api/provider/properties", provider.cookie, "POST", {
    serviceName: `PB2 Property ${RUN} ${crypto.randomUUID().slice(0, 6)}`,
    description: "PB-2 property fixture",
    neighborhood,
    rooms: [
      { roomName: "PB2 Room A", price: "120.00", units: 1 },
      { roomName: "PB2 Room B", price: "140.00", units: 1 },
    ],
  }));
  assert.equal(res.status, 201, `property create failed (${res.status}): ${res.text}`);
  createdServiceIds.push(res.body.id);
  const roomIds = (res.body.rooms ?? []).map((r: any) => r.id as string);
  createdServiceIds.push(...roomIds);
  assert.equal(roomIds.length, 2, "the property was created with both rooms");
  return { id: res.body.id, roomIds };
}

async function patchProperty(id: string, body: Record<string, unknown>) {
  const res = await readOnce(await api(`/api/provider/properties/${id}`, provider.cookie, "PATCH", body));
  assert.equal(res.status, 200, `property patch failed (${res.status}): ${res.text}`);
  return res;
}

async function placements(ids: string[]): Promise<Array<{ neighborhood: string | null; city: string | null }>> {
  const out = [];
  for (const id of ids) {
    const r = await row(id);
    out.push({ neighborhood: r.neighborhood ?? null, city: r.city ?? null });
  }
  return out;
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  const email = `pb2-${RUN}@t.test`;
  const reg = await readOnce(await api("/api/auth/register", undefined, "POST", {
    email, password: PASSWORD, firstName: "PB", lastName: "Two",
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
      (${crypto.randomUUID()}, ${id}, ${"PB2 Test Biz"}, ${"PB2 Test"}, ${email},
       ${"+10000000000"}, ${"Japan"}, ${"1 Test Street"}, ${"tour_operator"},
       ${"verified"}, ${"verified"}, ${"approved"})
  `);
  const cookie = (await api("/api/auth/login", undefined, "POST", { email, password: PASSWORD }))
    .headers.get("set-cookie")!.split(";")[0];
  provider = { id, cookie };

  for (const nb of [A, B]) {
    await db.execute(sql`
      INSERT INTO city_neighborhoods (id, city, country, name, slug, centroid_lat, centroid_lng, radius_km)
      VALUES (${nb.id}, ${nb.city}, 'Japan', ${`PB2 Neighborhood ${nb.slug}`}, ${nb.slug},
              '35.0100000', '135.7600000', '1.50')
    `);
  }
});

after(async () => {
  try {
    await assertDisposableDb();
    for (const id of [...createdServiceIds].reverse()) {
      await db.execute(sql`DELETE FROM provider_services WHERE parent_service_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
    }
    for (const nb of [A, B]) await db.execute(sql`DELETE FROM city_neighborhoods WHERE id = ${nb.id}`).catch(() => {});
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM provider_services WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

test("P1 + P4: a neighborhood change moves the property and its rooms — and only its rooms", async () => {
  const moved = await createProperty(A.slug);
  const bystander = await createProperty(A.slug);

  await patchProperty(moved.id, { neighborhood: B.slug });

  for (const p of await placements([moved.id, ...moved.roomIds])) {
    assert.deepEqual(p, { neighborhood: B.slug, city: B.city }, "P1: the property and every room carry the new place");
  }
  for (const p of await placements([bystander.id, ...bystander.roomIds])) {
    assert.deepEqual(p, { neighborhood: A.slug, city: A.city }, "P4: another property's rooms are never touched");
  }
});

test("P2: clearing the neighborhood clears the city on the property and its rooms — never the old one", async () => {
  const prop = await createProperty(A.slug);
  await patchProperty(prop.id, { neighborhood: "" });
  for (const p of await placements([prop.id, ...prop.roomIds])) {
    assert.equal(p.city, null, "no neighborhood ⇒ no city, on the rooms too");
    assert.notEqual(p.neighborhood, A.slug);
  }
});

test("P3: a PATCH that does not name the neighborhood leaves the rooms' placement alone", async () => {
  const prop = await createProperty(A.slug);
  await patchProperty(prop.id, { serviceName: `PB2 Renamed ${RUN}` });
  for (const p of await placements([prop.id, ...prop.roomIds])) {
    assert.deepEqual(p, { neighborhood: A.slug, city: A.city });
  }
});
