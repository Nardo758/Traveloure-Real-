/**
 * FEE-PREVIEW × TRIP-PASS ENTITLEMENT — the traveler fee is BILLED and the waiver is a REAL reduction
 * (ruling 2026-09-02-traveler-fee-applies-everywhere; was Lane 4 small-filed rider 3b's informational
 * contract, now flipped by the ruling).
 *
 * GET /api/cart/fee-preview accepts an optional `?tripId=` and, when the trip holds an active Trip
 * Pass, reports a Trip Pass waiver via the SAME `coversAction(tripId, "traveler_service_fee")` the
 * charge path calls (payments.routes.ts). The traveler service fee is now a term of the quoted total
 * (a `travelerFee` line), computed by the SAME `resolveTravelerServiceFee` the charge loop uses, so
 * preview == charge:
 *
 *   - Uncovered: the preview `total` INCLUDES the fee (`travelerFee > 0`).
 *   - Covered (active pass): the fee is 0, the `total` is REDUCED by exactly the waived amount, and
 *     the waiver reports `billedOnDirectPathToday: true` + `wouldHaveBeenAmountTotal` (what the pass
 *     suppressed) + a `label` line for the cart. This is the former tripwire flipped to expectation.
 *
 * Assertions (all against the real booted route, buyer's own session + cart):
 *   A. No tripId → `tripPassFeeWaiver: null`, and a baseline `total` T (which now includes the fee).
 *   B. tripId of a trip with NO pass → still `null`, total still T (a tripId alone never waives).
 *   C. tripId of a trip WITH an active pass → waiver present (`waived:true`, `basis:"trip_pass"`,
 *      `wouldHaveBeenAmountTotal > 0`, `billedOnDirectPathToday:true`), `travelerFee === 0`, AND
 *      `total === T − wouldHaveBeenAmountTotal` (a real reduction).
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row is created and
 * deleted by this file. Run solo against a local dev server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/fee-preview-entitlement.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { grantTripPass } from "../services/trip-entitlement.service";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

const buyerEmail = `feeprev-${RUN}-buyer@t.test`;
const providerId = `feeprev-${RUN}-prov`;
const serviceId = `feeprev-${RUN}-svc`;
const tripNoPassId = `feeprev-${RUN}-trip-nopass`;
const tripPassId = `feeprev-${RUN}-trip-pass`;
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
      `[fee-preview] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a recognized ` +
        `disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
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

async function feePreview(query = ""): Promise<any> {
  const res = await api(`/api/cart/fee-preview${query}`, buyerCookie);
  // Read the body EXACTLY once: text() on the failure path, json() on success. Reading it inside the
  // assert message (eagerly evaluated) would consume it before json() → "Body has already been read".
  if (res.status !== 200) {
    assert.fail(`fee-preview${query} should be 200, got ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} ('npm run dev' / CI boot step)`);
  await assertDisposableDb();

  // Buyer — a real session over HTTP.
  const reg = await api("/api/auth/register", undefined, "POST", {
    email: buyerEmail,
    password: PASSWORD,
    firstName: "Fee",
    lastName: "Preview",
  });
  // Read the body once (json on success), never in the assert message — see feePreview above.
  if (reg.status !== 201) {
    assert.fail(`register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  }
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  buyerCookie = setCookie!.split(";")[0];
  buyerId = ((await reg.json()) as any).user.id;

  // Provider + a priced, approved service the buyer can cart. $100 → a non-zero traveler-fee
  // counterfactual regardless of owner role.
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${providerId}, ${`feeprev-${RUN}-prov@t.test`}, 'Prov', 'Fixture', 'service_provider')`);
  await db.execute(sql`INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method)
    VALUES (${serviceId}, ${providerId}, ${`Fee preview svc ${RUN}`}, 'fixture', '100.00', 'active', 'approved', 'in_person')`);

  // Two buyer-owned trips: one without a pass, one that will get one.
  for (const tid of [tripNoPassId, tripPassId]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
      VALUES (${tid}, ${buyerId}, 'Fee preview trip', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 35)`);
  }

  // Buyer carts the service (through the real route).
  const add = await api("/api/cart/items", buyerCookie, "POST", { serviceId, quantity: 1 });
  if (!(add.status >= 200 && add.status < 300)) {
    assert.fail(`add-to-cart failed (${add.status}): ${await add.text().catch(() => "")}`);
  }
});

after(async () => {
  // The shared `../db` pool is built `allowExitOnIdle: false`, so a run that never ends it outlives
  // its own assertions (ledger `2026-09-05-fee-ledger-test-robustness`). Cleanup first, in reverse
  // dependency order; the pool closes in a `finally` so the process exits on every path.
  try {
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${tripNoPassId}, ${tripPassId})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${tripNoPassId}, ${tripPassId})`);
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
    await db.execute(sql`DELETE FROM users WHERE id IN (${providerId})`);
    await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`); // cart_items cascade from users
  } finally {
    await pool.end();
  }
});

test("A: no tripId → no waiver, and a baseline total", async () => {
  const preview = await feePreview();
  assert.equal(preview.tripPassFeeWaiver, null, "no tripId must report no waiver");
  assert.ok(preview.total > 0, `baseline total should be > 0, got ${preview.total}`);
});

test("B: a tripId with NO pass never waives, and the total is unchanged", async () => {
  const baseline = await feePreview();
  const withTrip = await feePreview(`?tripId=${tripNoPassId}`);
  assert.equal(withTrip.tripPassFeeWaiver, null, "a tripId alone (no pass) must not waive");
  assert.equal(withTrip.total, baseline.total, "an unpassed tripId must not change the total");
});

test("C: a tripId WITH an active pass REDUCES the total by the waived fee — the waiver is real now", async () => {
  const baseline = await feePreview();
  // Baseline (no pass) now CHARGES the traveler service fee, so it is a term of the total.
  assert.ok(baseline.travelerFee > 0, `uncovered baseline must charge a traveler fee, got ${baseline.travelerFee}`);

  const { created } = await grantTripPass({
    tripId: tripPassId,
    sourcePaymentId: `feeprev-${RUN}-pi`,
    allowancesSnapshot: { revisionsRemaining: 1, priceCents: 1900 },
  });
  assert.equal(created, true, "grantTripPass must create an active pass");

  const covered = await feePreview(`?tripId=${tripPassId}`);
  const w = covered.tripPassFeeWaiver;
  assert.ok(w, "an active pass must surface a tripPassFeeWaiver");
  assert.equal(w.waived, true, "waived flag");
  assert.equal(w.basis, "trip_pass", "waiver basis");
  assert.ok(w.wouldHaveBeenAmountTotal > 0, `waived fee should be > 0, got ${w.wouldHaveBeenAmountTotal}`);
  // Ruling 2026-09-02-traveler-fee-applies-everywhere: the fee IS billed on the direct path now, so
  // the waiver is a REAL reduction — the covered total drops by exactly the waived fee, and the
  // covered cart charges no traveler fee. This is the tripwire flipped to the expectation.
  assert.equal(w.billedOnDirectPathToday, true, "the traveler fee is now billed on the direct path");
  assert.equal(covered.travelerFee, 0, "a fully covered cart charges no traveler fee");
  assert.equal(
    covered.total,
    Math.round((baseline.total - w.wouldHaveBeenAmountTotal) * 100) / 100,
    "an active pass must reduce the total by exactly the waived fee",
  );
});
