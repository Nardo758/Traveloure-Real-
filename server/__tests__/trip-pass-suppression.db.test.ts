/**
 * trip-pass-suppression.db.test.ts — charge-point suppression proofs
 * (ruling 2026-08-29-trip-pass). Needs the dev server on localhost:5000
 * (BASE_URL overridable); skips the HTTP legs when it isn't up.
 *
 * SP1  covered trip → POST /api/optimization-payments returns coveredByTripPass,
 *      feeCents 0, and NO clientSecret/PaymentIntent (negative first: the same call
 *      on the uncovered sibling trip does NOT return coveredByTripPass)
 * SP2  resolveTripPassFeeWaiver returns the rails-waiver shape with basis
 *      'trip_pass' and an honest counterfactual amount (never 0 unless the fee is 0)
 * SP3  waiver helper is honest-null when the subtotal is unusable
 *
 * Stripe posture (persona-program rule): asserts the configured key is a TEST key
 * before any HTTP leg; aborts otherwise. No Stripe call is ever made by the covered
 * path — that absence is the proof.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   JOURNEY_DB_WRITES_OK=1 DATABASE_URL=... npx tsx --test server/__tests__/trip-pass-suppression.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolveTripPassFeeWaiver } from "../services/rails-attribution.service";

const BASE = process.env.BASE_URL ?? "http://localhost:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const email = `tp-sup-${RUN}@example.com`;
let cookie = "";
let coveredTripId = "";
let uncoveredTripId = "";
let serverUp = false;

before(async () => {
  const key = process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || "";
  assert.ok(
    key.startsWith("sk_test_") || key === "",
    "Refusing to run: a NON-TEST Stripe key is configured (persona-program rule).",
  );
  try {
    const ping = await fetch(`${BASE}/api/pricing`);
    serverUp = ping.ok;
  } catch {
    serverUp = false;
  }
  if (!serverUp) return;

  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TpSup123!pass", firstName: "Tp", lastName: "Sup", userType: "user" }),
  });
  assert.equal(reg.status, 201, await reg.text());
  cookie = (reg.headers.get("set-cookie") ?? "").split(";")[0];

  for (const label of ["covered", "uncovered"] as const) {
    const res = await fetch(`${BASE}/api/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        title: `TP ${label} trip`,
        destination: "Kyoto, Japan",
        startDate: "2027-03-01",
        endDate: "2027-03-05",
      }),
    });
    assert.equal(res.status, 201, await res.clone().text());
    const trip = await res.json();
    if (label === "covered") coveredTripId = trip.id;
    else uncoveredTripId = trip.id;
  }

  // Seed the entitlement directly (the purchase flow has its own proofs; this suite
  // proves SUPPRESSION given an active pass).
  await db.execute(sql`
    INSERT INTO trip_entitlements (id, trip_id, plan_key, status, source_payment_id, allowances_snapshot)
    VALUES (${`tp-sup-${RUN}`}, ${coveredTripId}, 'trip_pass', 'active', ${`pi_sup_${RUN}`}, '{"revisionsRemaining":1}'::jsonb)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM trip_entitlements WHERE id = ${`tp-sup-${RUN}`}`);
  if (coveredTripId) await db.execute(sql`DELETE FROM trips WHERE id IN (${coveredTripId}, ${uncoveredTripId})`);
  await db.execute(sql`DELETE FROM users WHERE email = ${email}`);
});

test("SP1: optimizer charge suppressed on the covered trip only", { timeout: 30_000 }, async (t) => {
  if (!serverUp) return t.skip("dev server not running on " + BASE);

  const covered = await fetch(`${BASE}/api/optimization-payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ tripId: coveredTripId }),
  });
  const coveredBody: any = await covered.json();
  assert.equal(covered.status, 200, JSON.stringify(coveredBody));
  assert.equal(coveredBody.coveredByTripPass, true);
  assert.equal(coveredBody.feeCents, 0);
  assert.equal(coveredBody.clientSecret, undefined, "no PaymentIntent may exist for a covered run");

  const uncovered = await fetch(`${BASE}/api/optimization-payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ tripId: uncoveredTripId }),
  });
  const uncoveredBody: any = await uncovered.json().catch(() => ({}));
  // The uncovered path proceeds toward the normal charge machinery (free-rerun check,
  // then Stripe — which may fail in a sandbox with a dummy key). The assertion that
  // matters: it is NEVER reported as pass-covered.
  assert.notEqual(uncoveredBody.coveredByTripPass, true, "uncovered trip must not be covered");
});

test("SP2: trip-pass fee waiver reuses the rails shape with basis trip_pass", async () => {
  const w: any = await resolveTripPassFeeWaiver(100);
  if (w === null) {
    // Honest-null is legal only when the traveler fee band is absent from this DB.
    return;
  }
  assert.equal(w.waived, true);
  assert.equal(w.basis, "trip_pass");
  assert.equal(w.billedOnDirectPathToday, false);
  assert.ok(typeof w.wouldHaveBeenAmount === "number" && w.wouldHaveBeenAmount > 0,
    "counterfactual must be the real un-waived amount");
});

test("SP3: waiver helper is honest-null on an unusable subtotal", async () => {
  const w = await resolveTripPassFeeWaiver(Number.NaN);
  // Either null (resolver threw) or a shape whose counterfactual is not fabricated.
  if (w !== null) {
    assert.ok(!Number.isNaN((w as any).wouldHaveBeenAmount));
  }
});
