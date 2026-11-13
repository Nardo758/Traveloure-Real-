/**
 * The admin OFFERING-TYPE writes — the two families that were live 500s.
 *
 *   L1 service: POST 201 (a row, not undefined) → PATCH 200 → DELETE 200
 *   L2 service: unknown key is 404 on PATCH and DELETE; a duplicate key is 409
 *   L3 expert: POST 201 → PATCH 200 → DELETE 200
 *   L4 expert: unknown key is 404 on PATCH; a duplicate key is 409
 *   L5 a non-admin is 403 on both families
 *
 * Why these exist: the three service calls named helpers that did not exist
 * (`createServiceOfferingType` …) — `undefined` at runtime, so every write answered 500 —
 * and all six calls array-destructured a value the helper already unwrapped to ONE row
 * (`[created]` over an object throws). Both are silent to types on the expert side and
 * loud only here, so the route is exercised through its own handler, the way
 * `admin-bookings-list.db.test.ts` does: no server, no port.
 *
 * Writes only its own rows (keys carry the pid) and removes them in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? process.env.STRIPE_SECRET_KEY
  : "sk_test_dummy";

const { db } = await import("../db");
const { sql } = await import("drizzle-orm");
const adminRouter = (await import("../routes/admin.routes")).default;

const SUFFIX = `otw-${process.pid}`;
let adminId: string;
let memberId: string;
const serviceKeys = [`${SUFFIX}-svc-a`, `${SUFFIX}-svc-b`];
const expertKeys = [`${SUFFIX}-exp-a`, `${SUFFIX}-exp-b`];

function handlerFor(path: string, method: "post" | "patch" | "delete") {
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} is registered`);
  return layer.route.stack.at(-1).handle;
}

function capture() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function reqFor(who: string, body: unknown = {}, params: Record<string, string> = {}) {
  // `auditOfferingWrite` reads the request headers through `req.get`, so the stub carries one.
  return {
    params,
    body,
    user: { claims: { sub: who } },
    headers: { "user-agent": "route-test" },
    get(header: string) { return header === "user-agent" ? "route-test" : undefined; },
    ip: "127.0.0.1",
  } as any;
}

async function call(path: string, method: "post" | "patch" | "delete", who: string, body: unknown = {}, params: Record<string, string> = {}) {
  const res = capture();
  await handlerFor(path, method)(reqFor(who, body, params), res as any);
  return res;
}

before(async () => {
  const a = await db.execute(sql`INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`${SUFFIX}-admin@traveloure.test`}, 'admin') RETURNING id`);
  adminId = String((a.rows[0] as any).id);
  const m = await db.execute(sql`INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`${SUFFIX}-member@traveloure.test`}, 'user') RETURNING id`);
  memberId = String((m.rows[0] as any).id);
});

after(async () => {
  await db.execute(sql`DELETE FROM service_offering_types WHERE offering_type_key LIKE ${`${SUFFIX}%`}`);
  await db.execute(sql`DELETE FROM expert_offering_types WHERE offering_type_key LIKE ${`${SUFFIX}%`}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${adminId}, ${memberId})`);
});

test("L1: service offering type — POST 201, PATCH 200, DELETE 200", async () => {
  const created = await call("/api/admin/service-offering-types", "post", adminId, {
    offeringTypeKey: serviceKeys[0],
    categoryKey: "food_drink",
    displayName: "Offering-type write test",
    tagline: "created by a route test",
    sortOrder: 9100,
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.ok(created.body, "a row came back — the old destructure handed this back as undefined");
  assert.equal(created.body.offeringTypeKey, serviceKeys[0]);
  assert.equal(created.body.displayName, "Offering-type write test");

  const patched = await call("/api/admin/service-offering-types/:key", "patch", adminId, { displayName: "Renamed by the test" }, { key: serviceKeys[0] });
  assert.equal(patched.statusCode, 200, JSON.stringify(patched.body));
  assert.equal(patched.body.displayName, "Renamed by the test");

  const deleted = await call("/api/admin/service-offering-types/:key", "delete", adminId, {}, { key: serviceKeys[0] });
  assert.equal(deleted.statusCode, 200, JSON.stringify(deleted.body));
  assert.deepEqual(deleted.body, { ok: true, key: serviceKeys[0] });
});

test("L2: service offering type — 404 for an unknown key, 409 for a duplicate", async () => {
  const missing = await call("/api/admin/service-offering-types/:key", "patch", adminId, { displayName: "x" }, { key: `${SUFFIX}-nope` });
  assert.equal(missing.statusCode, 404, JSON.stringify(missing.body));
  const missingDelete = await call("/api/admin/service-offering-types/:key", "delete", adminId, {}, { key: `${SUFFIX}-nope` });
  assert.equal(missingDelete.statusCode, 404);

  const first = await call("/api/admin/service-offering-types", "post", adminId, {
    offeringTypeKey: serviceKeys[1], categoryKey: "food_drink", displayName: "Duplicate guard",
  });
  assert.equal(first.statusCode, 201, JSON.stringify(first.body));
  const dup = await call("/api/admin/service-offering-types", "post", adminId, {
    offeringTypeKey: serviceKeys[1], categoryKey: "food_drink", displayName: "Duplicate guard",
  });
  assert.equal(dup.statusCode, 409, JSON.stringify(dup.body));
  await call("/api/admin/service-offering-types/:key", "delete", adminId, {}, { key: serviceKeys[1] });
});

test("L3: expert offering type — POST 201, PATCH 200, DELETE 200", async () => {
  const created = await call("/api/admin/expert-offering-types", "post", adminId, {
    offeringTypeKey: expertKeys[0],
    serviceTier: "advisory",
    displayName: "Expert offering-type write test",
    tagline: "created by a route test",
    sortOrder: 9101,
  });
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.ok(created.body, "the expert writes had the same destructure bug");
  assert.equal(created.body.offeringTypeKey, expertKeys[0]);

  const patched = await call("/api/admin/expert-offering-types/:key", "patch", adminId, { displayName: "Renamed by the test" }, { key: expertKeys[0] });
  assert.equal(patched.statusCode, 200, JSON.stringify(patched.body));
  assert.equal(patched.body.displayName, "Renamed by the test");

  const deleted = await call("/api/admin/expert-offering-types/:key", "delete", adminId, {}, { key: expertKeys[0] });
  assert.equal(deleted.statusCode, 200, JSON.stringify(deleted.body));
  assert.deepEqual(deleted.body, { ok: true, key: expertKeys[0] });
});

test("L4: expert offering type — 404 for an unknown key, 409 for a duplicate", async () => {
  const missing = await call("/api/admin/expert-offering-types/:key", "patch", adminId, { displayName: "x" }, { key: `${SUFFIX}-nope` });
  assert.equal(missing.statusCode, 404, JSON.stringify(missing.body));

  const first = await call("/api/admin/expert-offering-types", "post", adminId, {
    offeringTypeKey: expertKeys[1], serviceTier: "advisory", displayName: "Duplicate guard",
  });
  assert.equal(first.statusCode, 201, JSON.stringify(first.body));
  const dup = await call("/api/admin/expert-offering-types", "post", adminId, {
    offeringTypeKey: expertKeys[1], serviceTier: "advisory", displayName: "Duplicate guard",
  });
  assert.equal(dup.statusCode, 409, JSON.stringify(dup.body));
  await call("/api/admin/expert-offering-types/:key", "delete", adminId, {}, { key: expertKeys[1] });
});

test("L5: a non-admin is 403 on both families", async () => {
  const svc = await call("/api/admin/service-offering-types", "post", memberId, {
    offeringTypeKey: `${SUFFIX}-denied`, categoryKey: "food_drink", displayName: "nope",
  });
  assert.equal(svc.statusCode, 403, JSON.stringify(svc.body));

  const exp = await call("/api/admin/expert-offering-types", "post", memberId, {
    offeringTypeKey: `${SUFFIX}-denied`, serviceTier: "advisory", displayName: "nope",
  });
  assert.equal(exp.statusCode, 403, JSON.stringify(exp.body));
});
