/**
 * THE TRIP PASS SERVICE-FEE WAIVER IS DECIDED PER CART LINE FROM ITS OWN PLAN, OWNER-VERIFIED; THE
 * BODY `tripId` GRANTS NOTHING (R148 — ledger `2026-09-27-trip-pass-waiver-per-line`; decision-maker,
 * Sep 27, 2026; LD 41; §14).
 *
 * Before R148 `POST /api/checkout` waived the traveler service fee on EVERY line when the request BODY
 * named a `tripId` holding an active Trip Pass, and never checked that the caller owned that trip. So:
 *   - SECURITY (§14): a crafted request naming SOMEONE ELSE'S Trip-Pass trip had its fee waived.
 *   - LD 41 unmet: the real cart caller (`cart.tsx`) sends NO tripId, so a pass holder was charged.
 *
 * Proofs, against the real booted checkout (the buyer's own session and cart). Each reads the claim
 * rows the checkout writes BEFORE its Stripe call — `booking_details.travelerServiceFee` is the
 * snapshot the fee ledger is later written from — so no real Stripe call is needed (CI's stub key
 * fails the PaymentIntent AFTER the claim, which is not asserted):
 *   T1  SECURITY REGRESSION: body `tripId` = a FOREIGN trip holding an active pass ⇒ NO line waived.
 *   T2  a line whose OWN `cart_items.trip_id` is the buyer's covered plan, body sends NO tripId (the
 *       real cart.tsx shape) ⇒ that line IS waived, basis `trip_pass`.
 *   T3  mixed cart — covered own plan / uncovered own plan / standalone ⇒ only the first is waived.
 *   T4  a line whose `trip_id` is SOMEONE ELSE's covered trip ⇒ not waived (ownership is checked
 *       before the entitlement is read).
 *   T5  (pure) rails first, one waiver per line — the ONE precedence rule `lineFeeWaiverBasis` — and
 *       the resolver's own guarantees (distinct trips resolved once, foreign never consulted, fail
 *       closed per trip, standalone never covered). Runs without a server.
 *
 * SERVER REQUIRED for T1–T4 (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row this
 * file writes it deletes. Run solo against a local server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-force-exit \
 *     server/__tests__/checkout-trip-pass-per-line.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../db";
import { grantTripPass } from "../services/trip-entitlement.service";
import {
  resolveTripPassCoveredTripIds,
  tripPassCoversLine,
  lineFeeWaiverBasis,
} from "../services/trip-pass-line-coverage.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `tppl-${RUN}-buyer@t.test`;
const ids = {
  provider: `tppl-${RUN}-prov`,
  foreignUser: `tppl-${RUN}-foreign`,
  svcA: `tppl-${RUN}-svc-a`,
  svcB: `tppl-${RUN}-svc-b`,
  svcC: `tppl-${RUN}-svc-c`,
  tripCovered: `tppl-${RUN}-trip-covered`,
  tripUncovered: `tppl-${RUN}-trip-uncovered`,
  tripForeign: `tppl-${RUN}-trip-foreign`,
};
const ALL_SERVICES = [ids.svcA, ids.svcB, ids.svcC];
const ALL_TRIPS = [ids.tripCovered, ids.tripUncovered, ids.tripForeign];
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
      `[checkout-trip-pass-per-line] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is ` +
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
  const id = `tppl-${RUN}-cart-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO cart_items (id, user_id, service_id, quantity, trip_id)
    VALUES (${id}, ${buyerId}, ${serviceId}, 1, ${tripId})
  `);
}

/**
 * Checkout the buyer's cart and return the traveler-fee snapshot each claimed row carries, keyed by
 * service id. `body` is merged into the request (T1 plants a foreign `tripId` there).
 */
async function checkoutSnapshots(body: Record<string, unknown> = {}): Promise<Map<string, any>> {
  const key = `tppl-${RUN}-${crypto.randomUUID()}`;
  const res = await api("/api/checkout", buyerCookie, "POST", { idempotencyKey: key, ...body });
  const text = await res.text();
  const r = await db.execute(sql`
    SELECT service_id, booking_details
      FROM service_bookings
     WHERE traveler_id = ${buyerId} AND idempotency_key LIKE ${key + "%"}
  `);
  const out = new Map<string, any>();
  for (const row of r.rows as any[]) {
    out.set(row.service_id, row.booking_details?.travelerServiceFee ?? null);
  }
  assert.ok(out.size > 0, `the checkout must take its claim (status ${res.status}: ${text})`);
  return out;
}

function assertWaived(snap: any, label: string): void {
  assert.ok(snap, `${label}: the row carries a travelerServiceFee snapshot`);
  assert.equal(snap.waived, true, `${label}: waived`);
  assert.equal(snap.waiverBasis, "trip_pass", `${label}: basis trip_pass`);
  assert.equal(snap.charged, 0, `${label}: charged 0`);
  assert.ok(snap.wouldHaveBeen > 0, `${label}: the real fee is still named (${snap.wouldHaveBeen})`);
}
function assertCharged(snap: any, label: string): void {
  assert.ok(snap, `${label}: the row carries a travelerServiceFee snapshot`);
  assert.equal(snap.waived, false, `${label}: NOT waived`);
  assert.equal(snap.waiverBasis, null, `${label}: no waiver basis`);
  assert.ok(snap.charged > 0, `${label}: the fee is charged in full (${snap.charged})`);
  assert.equal(snap.charged, snap.wouldHaveBeen, `${label}: charged == the band-priced fee`);
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
    firstName: "Trip",
    lastName: "Pass",
  });
  if (reg.status !== 201) assert.fail(`register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  buyerCookie = setCookie!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.provider}, ${`tppl-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.foreignUser}, ${`tppl-${RUN}-foreign@t.test`}, 'Foreign', 'Owner', 'user')`);

  // Declared `instant` so the lines are cartable/checkout-able (ledger `2026-09-25-checkout-request-mode`).
  for (const sid of ALL_SERVICES) {
    await db.execute(sql`
      INSERT INTO provider_services
        (id, user_id, service_name, description, price, price_type, booking_mode, status, approval_status, delivery_method)
      VALUES
        (${sid}, ${ids.provider}, ${`Trip pass per line ${RUN} ${sid.slice(-5)}`}, 'fixture', '100.00',
         'fixed', 'instant', 'active', 'approved', 'call')
    `);
  }

  for (const [tid, owner] of [
    [ids.tripCovered, buyerId],
    [ids.tripUncovered, buyerId],
    [ids.tripForeign, ids.foreignUser],
  ] as const) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
      VALUES (${tid}, ${owner}, 'Trip pass per line', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
  }
  // Active passes on the buyer's covered plan AND on the foreign user's trip.
  for (const tid of [ids.tripCovered, ids.tripForeign]) {
    const { created } = await grantTripPass({
      tripId: tid,
      sourcePaymentId: `tppl-${RUN}-pi-${tid.slice(-8)}`,
      allowancesSnapshot: { priceCents: 1900 },
    });
    assert.equal(created, true, `grantTripPass must create an active pass on ${tid}`);
  }
});

after(async () => {
  try {
    if (buyerId) await clearBuyer();
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${ids.tripCovered}, ${ids.tripUncovered}, ${ids.tripForeign})`);
    for (const tid of ALL_TRIPS) await db.execute(sql`DELETE FROM trips WHERE id = ${tid}`);
    for (const sid of ALL_SERVICES) await db.execute(sql`DELETE FROM provider_services WHERE id = ${sid}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${ids.provider}, ${ids.foreignUser})`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`);
  } finally {
    await pool.end();
  }
});

// ── T1 — SECURITY REGRESSION ──────────────────────────────────────────────────────────────────
test("T1: a body tripId naming a FOREIGN Trip-Pass trip waives nothing (§14 security regression)", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcA, null);
  const snaps = await checkoutSnapshots({ tripId: ids.tripForeign });
  assertCharged(snaps.get(ids.svcA), "T1 standalone line with a foreign body tripId");
  await clearBuyer();
});

// ── T2 — LD 41 met at the primary checkout ────────────────────────────────────────────────────
test("T2: a line on the buyer's OWN covered plan is waived with NO body tripId (the cart.tsx shape)", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcA, ids.tripCovered);
  const snaps = await checkoutSnapshots();
  assertWaived(snaps.get(ids.svcA), "T2 own covered plan");
  await clearBuyer();
});

// ── T3 — mixed cart ───────────────────────────────────────────────────────────────────────────
test("T3: mixed cart — only the line on the covered own plan is waived", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcA, ids.tripCovered);
  await seedCartRow(ids.svcB, ids.tripUncovered);
  await seedCartRow(ids.svcC, null);
  const snaps = await checkoutSnapshots();
  assertWaived(snaps.get(ids.svcA), "T3 covered own plan");
  assertCharged(snaps.get(ids.svcB), "T3 uncovered own plan");
  assertCharged(snaps.get(ids.svcC), "T3 standalone line");
  await clearBuyer();
});

// ── T4 — a line on someone else's covered trip ────────────────────────────────────────────────
test("T4: a line whose trip_id is SOMEONE ELSE's covered trip is not waived", async (t) => {
  if (!serverUp) return t.skip("server not running");
  await clearBuyer();
  await seedCartRow(ids.svcA, ids.tripForeign);
  // Even naming it in the body grants nothing.
  const snaps = await checkoutSnapshots({ tripId: ids.tripForeign });
  assertCharged(snaps.get(ids.svcA), "T4 foreign trip on the line");
  await clearBuyer();
});

// ── T5 — the pure rules (no server) ───────────────────────────────────────────────────────────
test("T5: rails first, one waiver per line (the ONE precedence rule)", () => {
  assert.equal(lineFeeWaiverBasis({ railsWaived: true, tripPassCovered: true }), "rails", "rails wins over trip pass");
  assert.equal(lineFeeWaiverBasis({ railsWaived: true, tripPassCovered: false }), "rails");
  assert.equal(lineFeeWaiverBasis({ railsWaived: false, tripPassCovered: true }), "trip_pass");
  assert.equal(lineFeeWaiverBasis({ railsWaived: false, tripPassCovered: false }), null);
});

test("T5b: the resolver checks ownership first, resolves each trip once, fails closed per trip", async () => {
  const ownsCalls: string[] = [];
  const coversCalls: string[] = [];
  const covered = await resolveTripPassCoveredTripIds(
    "me",
    [{ tripId: "mine-pass" }, { tripId: "mine-pass" }, { tripId: "theirs-pass" }, { tripId: "mine-nopass" },
      { tripId: "mine-throws" }, { tripId: null }, {}, null],
    {
      ownsTrip: async (tripId, userId) => {
        ownsCalls.push(tripId);
        assert.equal(userId, "me", "ownership is checked against the SESSION user");
        return tripId.startsWith("mine-");
      },
      coversTravelerFee: async (tripId) => {
        coversCalls.push(tripId);
        if (tripId === "mine-throws") throw new Error("entitlement read failed");
        return tripId.endsWith("-pass");
      },
    },
  );
  assert.deepEqual([...covered], ["mine-pass"], "only the owned, covered plan");
  assert.deepEqual(ownsCalls.sort(), ["mine-nopass", "mine-pass", "mine-throws", "theirs-pass"], "each distinct trip once");
  assert.ok(!coversCalls.includes("theirs-pass"), "a foreign trip's pass is never consulted");
  assert.equal(tripPassCoversLine({ tripId: "mine-pass" }, covered), true);
  assert.equal(tripPassCoversLine({ tripId: "theirs-pass" }, covered), false);
  assert.equal(tripPassCoversLine({ tripId: null }, covered), false, "a standalone line is never covered");
  assert.equal(tripPassCoversLine({}, covered), false);
  assert.equal(
    (await resolveTripPassCoveredTripIds("", [{ tripId: "mine-pass" }], {
      ownsTrip: async () => true,
      coversTravelerFee: async () => true,
    })).size,
    0,
    "no session user covers nothing",
  );
});
