/**
 * FEE-PREVIEW × TRIP-PASS ENTITLEMENT — informational-waiver contract (Lane 4, small-filed rider 3b).
 *
 * GET /api/cart/fee-preview accepts an optional `?tripId=` and, when the trip holds an active Trip
 * Pass, reports a Trip Pass waiver via the SAME `coversAction(tripId, "traveler_service_fee")` the
 * charge path calls (payments.routes.ts). What this proves is the TRUTH of that surface today, which
 * is subtle and worth pinning exactly:
 *
 *   - The D3 traveler-service-fee is NOT billed on the direct path today (the handler stamps
 *     `billedOnDirectPathToday: false` and its own comment says the waiver "never changes
 *     platformFeeTotal"). So the waiver is INFORMATIONAL: it reports what WOULD have been charged
 *     (`wouldHaveBeenAmountTotal`), and the cart `total` is UNCHANGED whether or not a pass applies.
 *   - Filed alongside as a finding (`docs/findings/FEE_NOT_BILLED_ON_DIRECT_PATH.md`): because the
 *     fee isn't collected on this path, a pass-holder and a non-holder pay the same total here —
 *     which is a revenue question, not a bug for this test to paper over. This test asserts the
 *     honest current behaviour so a future change that STARTS billing (and thus makes the waiver
 *     move the total) will surface here loudly rather than silently.
 *
 * Assertions (all against the real booted route, buyer's own session + cart):
 *   A. No tripId → `tripPassFeeWaiver: null`, and a baseline `total` T.
 *   B. tripId of a trip with NO pass → still `null`, total still T (a tripId alone never waives).
 *   C. tripId of a trip WITH an active pass → waiver present (`waived:true`, `basis:"trip_pass"`,
 *      `wouldHaveBeenAmountTotal > 0`, `billedOnDirectPathToday:false`) AND `total` === T (unchanged).
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY. Every row is created and
 * deleted by this file. Run solo against a local dev server:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/fee-preview-entitlement.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
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
  assert.equal(res.status, 200, `fee-preview${query} should be 200, got ${res.status}: ${await res.text().catch(() => "")}`);
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
  assert.equal(reg.status, 201, `register buyer failed (${reg.status}): ${await reg.text().catch(() => "")}`);
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
  assert.ok(add.status >= 200 && add.status < 300, `add-to-cart failed (${add.status}): ${await add.text().catch(() => "")}`);
});

after(async () => {
  await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id IN (${tripNoPassId}, ${tripPassId})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${tripNoPassId}, ${tripPassId})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${providerId})`);
  await db.execute(sql`DELETE FROM users WHERE email = ${buyerEmail}`); // cart_items cascade from users
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

test("C: a tripId WITH an active pass reports an informational waiver — flag + counterfactual, total UNCHANGED", async () => {
  const baseline = await feePreview();

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
  assert.ok(w.wouldHaveBeenAmountTotal > 0, `counterfactual fee should be > 0, got ${w.wouldHaveBeenAmountTotal}`);
  // The truth this rider pins: the fee is NOT billed on the direct path today, so the waiver is
  // informational and does NOT reduce the total. If someone starts billing it, this flips and the
  // assertion below fails loudly (that is the intended tripwire — see the finding doc).
  assert.equal(w.billedOnDirectPathToday, false, "the D3 fee is not billed on the direct path today");
  assert.equal(covered.total, baseline.total, "informational waiver must NOT change the cart total today");
});
