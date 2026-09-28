/**
 * EACH BOOKING IS STAMPED FROM ITS OWN CART LINE'S PLAN, OWNER-VERIFIED; THE BODY `tripId` IS IGNORED
 * (R149 — ledger `2026-09-27-checkout-stamp-from-line-trip`; decision-maker ruling Sep 28, 2026; §14).
 *
 * Before R149 `POST /api/checkout` stamped every claimed booking `tripId: tripId || item.tripId`, so a
 * body `tripId` re-stamped EVERY booking of a mixed-trip cart onto one plan, and a line with no plan
 * was attached to whatever plan the body named. R148 had already stopped the body `tripId` granting a
 * fee waiver; R149 stops it choosing attribution.
 *
 * Proofs, against the real booted checkout (the buyer's own session and cart). Each reads the claim
 * rows the checkout writes BEFORE its Stripe call, so no real Stripe call is needed (CI's stub key
 * fails the PaymentIntent AFTER the claim, which is not asserted):
 *   S1  two lines on two OWNED plans + body `tripId` naming the first ⇒ each booking carries its own
 *       line's plan.
 *   S2  a line with NO plan + a body `tripId` ⇒ the booking carries NO plan.
 *   S3  a line on a plan the buyer does NOT own ⇒ 409 `line_trip_not_owned`, and NO booking is written.
 *   S4  a plan-work line with no plan of its own is refused even when the body names a plan (the
 *       plan-work guard reads the line's plan now, not the body's).
 *   S5  (pure) the ONE ownership read partitions owned / not owned / unverifiable, each plan once.
 *
 * SERVER REQUIRED for S1–S4 (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this
 * file writes it deletes. Run solo against a local server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/checkout-stamp-from-line-trip.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { resolveOwnedLineTripIds } from "../services/trip-pass-line-coverage.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `cslt-${RUN}-buyer@t.test`;
const ids = {
  provider: `cslt-${RUN}-prov`,
  foreignUser: `cslt-${RUN}-foreign`,
  svcA: `cslt-${RUN}-svc-a`,
  svcB: `cslt-${RUN}-svc-b`,
  svcPlanWork: `cslt-${RUN}-svc-pw`,
  tripOne: `cslt-${RUN}-trip-one`,
  tripTwo: `cslt-${RUN}-trip-two`,
  tripForeign: `cslt-${RUN}-trip-foreign`,
};
const ALL_SERVICES = [ids.svcA, ids.svcB, ids.svcPlanWork];
const ALL_TRIPS = [ids.tripOne, ids.tripTwo, ids.tripForeign];
let buyerId = "";
let buyerCookie = "";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!(host !== null && DISPOSABLE_HOSTS.has(host))) {
    throw new Error(
      `[checkout-stamp-from-line-trip] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
        `not a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function clearBuyer(): Promise<void> {
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${buyerId}`);
  await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${buyerId}`);
}

async function seedCartRow(serviceId: string, tripId: string | null): Promise<void> {
  const id = `cslt-${RUN}-cart-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity, trip_id)
    VALUES (${id}, ${buyerId}, ${serviceId}, 1, ${tripId})
  `);
}

/** POST the checkout; return its status, body and the claim rows it wrote (service id → trip id). */
async function checkout(body: Record<string, unknown> = {}) {
  const key = `cslt-${RUN}-${crypto.randomUUID()}`;
  const res = await api("/api/checkout", buyerCookie, "POST", { idempotencyKey: key, ...body });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const r = await db.execute(sql`
    SELECT service_id, trip_id
      FROM service_bookings
     WHERE traveler_id = ${buyerId} AND idempotency_key LIKE ${key + "%"}
  `);
  const stamps = new Map<string, string | null>();
  for (const row of r.rows as any[]) stamps.set(row.service_id, row.trip_id ?? null);
  return { status: res.status, text, json, stamps };
}

let serverUp = false;

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  serverUp = !!(health && health.ok);
  if (!serverUp) return;
  await assertDisposableDb();

  const reg = await api("/api/auth/register", undefined, "POST", {
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Stamp",
    lastName: "Line",
  });
  if (reg.status !== 201) assert.fail(`register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  buyerCookie = setCookie!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`cslt-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.foreignUser}, ${`cslt-${RUN}-foreign@t.test`}, 'Foreign', 'Owner', 'user')`);

  // Declared `instant` so the lines are checkout-able (ledger `2026-09-25-checkout-request-mode`).
  for (const sid of [ids.svcA, ids.svcB]) {
    await db.execute(sql`
      INSERT INTO provider_services
        (id, user_id, service_name, description, price, price_type, booking_mode, status, approval_status, delivery_method)
      VALUES
        (${sid}, ${ids.provider}, ${`Stamp from line ${RUN} ${sid.slice(-5)}`}, 'fixture', '100.00',
         'fixed', 'instant', 'active', 'approved', 'call')
    `);
  }
  // A PLAN-WORK listing: its expert offering key is a `planning`-tier key (shared/expert-offerings.ts).
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, description, price, price_type, booking_mode, status, approval_status,
       delivery_method, expert_offering_type_key)
    VALUES
      (${ids.svcPlanWork}, ${ids.provider}, ${`Stamp from line ${RUN} plan work`}, 'fixture', '100.00',
       'fixed', 'instant', 'active', 'approved', 'call', 'full_itinerary')
  `);

  for (const [tid, owner] of [
    [ids.tripOne, buyerId],
    [ids.tripTwo, buyerId],
    [ids.tripForeign, ids.foreignUser],
  ] as const) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
      VALUES (${tid}, ${owner}, 'Stamp from line', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
  }
});

after(async () => {
  try {
    if (buyerId) await clearBuyer();
    for (const tid of ALL_TRIPS) await db.execute(sql`DELETE FROM trips WHERE id = ${tid}`);
    for (const sid of ALL_SERVICES) await db.execute(sql`DELETE FROM provider_services WHERE id = ${sid}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.foreignUser})`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`);
  } finally {
    await pool.end();
  }
});

test("S1: two lines on two owned plans, body tripId naming the first ⇒ each booking on its own line's plan", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcA, ids.tripOne);
  await seedCartRow(ids.svcB, ids.tripTwo);
  const r = await checkout({ tripId: ids.tripOne });
  assert.equal(r.stamps.size, 2, `the checkout must claim both lines (status ${r.status}: ${r.text})`);
  assert.equal(r.stamps.get(ids.svcA), ids.tripOne, "line A's booking is on plan one");
  assert.equal(r.stamps.get(ids.svcB), ids.tripTwo, "line B's booking stays on ITS OWN plan two, not the body's");
  await clearBuyer();
});

test("S2: a line with no plan + a body tripId ⇒ the booking has no plan", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcA, null);
  const r = await checkout({ tripId: ids.tripOne });
  assert.equal(r.stamps.size, 1, `the checkout must claim the line (status ${r.status}: ${r.text})`);
  assert.equal(r.stamps.get(ids.svcA), null, "a standalone line is never attached to the body's plan");
  await clearBuyer();
});

test("S3: a line on a plan the buyer does not own is refused before any booking is written", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcA, ids.tripOne);
  await seedCartRow(ids.svcB, ids.tripForeign);
  const r = await checkout();
  assert.equal(r.status, 409, `a foreign-plan line is refused (got ${r.status}: ${r.text})`);
  assert.equal(r.json?.reason, "line_trip_not_owned");
  assert.equal(r.stamps.size, 0, "NO booking row is written — not even for the owned line");
  const any = await db.execute(sql`SELECT count(*)::int AS n FROM service_bookings WHERE traveler_id = ${buyerId}`);
  assert.equal((any.rows[0] as any).n, 0, "no booking of any key exists for the buyer");
  await clearBuyer();
});

test("S4: a plan-work line with no plan of its own is refused even when the body names a plan", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcPlanWork, null);
  const r = await checkout({ tripId: ids.tripOne });
  assert.equal(r.status, 409, `plan work with no plan of its own is refused (got ${r.status}: ${r.text})`);
  assert.equal(r.stamps.size, 0, "no booking is written");
  await clearBuyer();
});

test("S5: the ONE ownership read partitions owned / not owned / unverifiable, each plan once", async () => {
  const calls: string[] = [];
  const out = await resolveOwnedLineTripIds(
    "me",
    [{ tripId: "mine" }, { tripId: "mine" }, { tripId: "theirs" }, { tripId: "boom" }, { tripId: null }, {}, null],
    {
      ownsTrip: async (tripId, userId) => {
        calls.push(tripId);
        assert.equal(userId, "me", "ownership is checked against the SESSION user");
        if (tripId === "boom") throw new Error("lookup failed");
        return tripId === "mine";
      },
    },
  );
  assert.deepEqual([...out.owned], ["mine"]);
  assert.deepEqual([...out.notOwned], ["theirs"]);
  assert.deepEqual([...out.failed], ["boom"], "a lookup that threw is unverifiable, never owned");
  assert.deepEqual(calls.sort(), ["boom", "mine", "theirs"], "each distinct plan is read once; standalone lines are not read");

  const none = await resolveOwnedLineTripIds("", [{ tripId: "mine" }], { ownsTrip: async () => true });
  assert.deepEqual([...none.owned], [], "no session user owns nothing");
  assert.deepEqual([...none.notOwned], ["mine"]);
});
