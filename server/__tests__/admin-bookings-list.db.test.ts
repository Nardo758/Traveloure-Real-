/**
 * PAY-1c — the /admin/bookings list (`GET /api/admin/bookings?kind=…`).
 *   L1 service rows filter by status (needs_review) and come newest first.
 *   L2 the creation-day range is inclusive at both ends.
 *   L3 the legacy table is read by kind=legacy; kind=liteapi reads its own table.
 *   L4 the route: a bad filter is a 400; without `kind` the original array shape is unchanged.
 * Writes only its own rows and removes them in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? process.env.STRIPE_SECRET_KEY
  : "sk_test_dummy";

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { listAdminBookings } = await import("../services/admin-booking-detail.service");
const adminRouter = (await import("../routes/admin.routes")).default;

const SUFFIX = `pay1c-${process.pid}`;
let travelerId: string;
let adminId: string;
const serviceIds: string[] = [];
let legacyId: string;

before(async () => {
  const t = await db.execute(sql`INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${SUFFIX + "@traveloure.test"}, 'user') RETURNING id`);
  travelerId = String((t.rows[0] as any).id);
  const a = await db.execute(sql`INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${SUFFIX + "-admin@traveloure.test"}, 'admin') RETURNING id`);
  adminId = String((a.rows[0] as any).id);
  for (const [status, createdAt] of [
    ["needs_review", "2026-10-01 08:00:00"],
    ["needs_review", "2026-10-03 23:30:00"],
    ["confirmed", "2026-10-02 12:00:00"],
  ] as const) {
    const id = `${SUFFIX}-${serviceIds.length}`;
    await db.execute(sql`
      INSERT INTO service_bookings (id, traveler_id, total_amount, status, created_at)
      VALUES (${id}, ${travelerId}, 10, ${status}, ${createdAt}::timestamp)
    `);
    serviceIds.push(id);
  }
  const l = await db.execute(sql`
    INSERT INTO bookings (user_id, title, total_amount, status, created_at)
    VALUES (${travelerId}, ${SUFFIX + " legacy"}, 20, 'needs_review', '2026-10-02 09:00:00'::timestamp)
    RETURNING id
  `);
  legacyId = String((l.rows[0] as any).id);
});

after(async () => {
  await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${sql.join(serviceIds.map((id) => sql`${id}`), sql`, `)})`);
  await db.execute(sql`DELETE FROM bookings WHERE id::text = ${legacyId}`);
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id = ${adminId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${travelerId}, ${adminId})`);
  await pool.end();
});

const mine = (rows: Array<{ id: string }>) => rows.filter((r) => serviceIds.includes(r.id) || r.id === legacyId);

test("L1: service rows filter by status and come newest first", async () => {
  const rows = mine(await listAdminBookings({ kind: "service", status: "needs_review", from: null, to: null }));
  assert.deepEqual(rows.map((r) => r.id), [serviceIds[1], serviceIds[0]]);
  assert.equal(rows[0].kind, "service");
  assert.equal(rows[0].travelerEmail, `${SUFFIX}@traveloure.test`);
});

test("L2: the creation-day range is inclusive at both ends", async () => {
  const rows = mine(await listAdminBookings({ kind: "service", status: null, from: "2026-10-02", to: "2026-10-03" }));
  assert.deepEqual(rows.map((r) => r.id).sort(), [serviceIds[1], serviceIds[2]].sort());
  assert.deepEqual(mine(await listAdminBookings({ kind: "service", status: null, from: "2026-10-01", to: "2026-10-01" })).map((r) => r.id), [serviceIds[0]]);
});

test("L3: kind=legacy reads the legacy table; kind=liteapi reads its own", async () => {
  const legacy = mine(await listAdminBookings({ kind: "legacy", status: "needs_review", from: null, to: null }));
  assert.deepEqual(legacy.map((r) => [r.kind, r.id]), [["legacy", legacyId]]);
  assert.equal(legacy[0].serviceName, `${SUFFIX} legacy`);
  const lite = await listAdminBookings({ kind: "liteapi", status: null, from: null, to: null });
  assert.ok(Array.isArray(lite));
  assert.equal(mine(lite).length, 0);
});

function listHandler() {
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === "/api/admin/bookings" && l.route?.methods?.get,
  );
  assert.ok(layer, "GET /api/admin/bookings is registered");
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

test("L4: a bad filter is a 400; without kind the original array shape is unchanged", async () => {
  const handler = listHandler();
  const bad = capture();
  await handler({ query: { kind: "trips" }, user: { claims: { sub: adminId } } } as any, bad as any);
  assert.equal(bad.statusCode, 400);

  const listed = capture();
  await handler({ query: { kind: "service", status: "needs_review" }, user: { claims: { sub: adminId } } } as any, listed as any);
  assert.equal(listed.statusCode, 200, JSON.stringify(listed.body));
  assert.ok(Array.isArray(listed.body.rows));
  assert.equal(typeof listed.body.limit, "number");

  const legacyShape = capture();
  await handler({ query: { status: "needs_review" }, user: { claims: { sub: adminId } } } as any, legacyShape as any);
  assert.equal(legacyShape.statusCode, 200);
  assert.ok(Array.isArray(legacyShape.body), "no kind ⇒ the original enriched array");
});
