/**
 * PAYOUT PARITY — HTTP ROUTE LEG. Closes the negative space documented in
 * .github/workflows/payout-parity-gate.yml: payout-parity.db.test.ts stamps bookings via the
 * same resolver/insurance helpers the checkout route imports, but it does NOT drive the HTTP
 * route — so a route change that stamps a different figure (reordering the insurance deduction,
 * bypassing safeParseRate, recomputing the split) stayed invisible to the gate.
 *
 * This suite drives the REAL `POST /api/checkout` (cart populated via the real `POST /api/cart`,
 * session minted via the real `POST /api/auth/register`) and asserts the provider_earnings the
 * route stamps onto service_bookings equals the SHARED RECIPE expectation, derived in-process
 * through the SAME resolveCommissionRates + calcInsuranceFee the db suite uses — no fee
 * literals (§8), the expectation is resolved from live fee_bands config at stamp time.
 *
 *   R1 — default-band expert service: route-stamped provider_earnings === recipe
 *        (price × expertShareRate − insuranceFee), platform_fee/insurance_fee stamped
 *        consistently (total take = price − earnings).
 *   R2 — per-service revenueShareRate OVERRIDE: the route must honour safeParseRate's
 *        override path; the fixture rate is chosen so the override figure and the
 *        default-band figure are DISTINGUISHABLE (belt-and-braces discriminator).
 *
 * STRIPE CONTRACT (both legs accepted; the stamp happens BEFORE Stripe either way):
 *   • 503 payment_unavailable (CI stub key, ruling 38's declared-unavailable negative
 *     contract): the claim rows stay provisional (payment_pending) with the stamp intact.
 *   • 201 (a real test-mode key): the same rows, promoted; the stamp is identical.
 * Any OTHER status is a hard failure — a 400/500 means the route never stamped anything and
 * the parity claim would be vacuously green.
 *
 * Transport: real HTTP against the already-running server on :5000 (dev: 'Start application';
 * CI: the server booted by payout-parity-gate.yml). Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/payout-parity-route.http.test.ts
 *
 * DISPOSABLE DB ONLY — same guard posture as payout-parity.db.test.ts. Every row this file
 * writes (directly or via the routes) is created here and deleted in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolveCommissionRates, calcInsuranceFee } from "../services/commission";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  expert: `ppr-${RUN}-expert`,
  travelerEmail: `ppr-${RUN}-trav@t.test`,
};
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];
let travelerId: string | null = null;
let travelerCookie = "";

// ── Disposable-DB guard (mirrors payout-parity.db.test.ts; never defaults open) ──────────────
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[payout-parity-route] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

function api(path: string, method: string, body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(travelerCookie ? { cookie: travelerCookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Fixture service owned by the expert; no category ⇒ the route's "default" fee-category fallback. */
async function makeService(price: string, revenueShareRate?: string): Promise<string> {
  const id = `ppr-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, revenue_share_rate)
    VALUES (${id}, ${ids.expert}, ${`Payout parity route service ${RUN}`}, 'fixture', ${price}, 'active', 'approved', ${revenueShareRate ?? null})
  `);
  createdServiceIds.push(id);
  return id;
}

/** safeParseRate — verbatim behaviour of the checkout route's local helper (and the db suite's). */
function safeParseRate(value: any, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/**
 * THE SHARED RECIPE — identical derivation to payout-parity.db.test.ts bookLikeCheckout():
 * default fee category, expert-band resolution, per-service override via safeParseRate,
 * insurance deducted from the expert's gross share. No fee literals.
 */
async function recipeExpectation(price: number, revenueShareRate?: string) {
  const feeCategory = "default";
  const rates = await resolveCommissionRates({ category: feeCategory, expertId: ids.expert });
  const expertShareRate = safeParseRate(revenueShareRate, rates.expertShareRate);
  const insuranceFeeAmt = calcInsuranceFee(price, rates, feeCategory);
  const netExpertEarningsAmt = price * expertShareRate - insuranceFeeAmt;
  return {
    defaultBandShare: rates.expertShareRate,
    stamped: netExpertEarningsAmt.toFixed(2),
    insurance: insuranceFeeAmt.toFixed(2),
    platformFee: (price - price * expertShareRate + insuranceFeeAmt).toFixed(2),
  };
}

/**
 * Drive the REAL route: cart the service, POST /api/checkout, accept the declared Stripe
 * contract (503 payment_unavailable with a stub key, 201 with a real one — anything else
 * fails loudly), then read back the row the route stamped.
 */
async function checkoutThroughRoute(serviceId: string): Promise<{
  status: number;
  row: { provider_earnings: string; platform_fee: string; insurance_fee: string; total_amount: string; status: string };
}> {
  // Start from an EMPTY cart. On the 503 payment_unavailable leg the route deliberately leaves
  // the cart intact ("Your cart is exactly as you left it"), so without this reset a prior
  // test's item would ride along and the bare idempotency key would land on the WRONG service.
  await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`);

  const addRes = await api("/api/cart", "POST", { serviceId });
  assert.equal(addRes.status, 201, `POST /api/cart must accept the fixture service: ${await addRes.clone().text()}`);

  const checkoutKey = `ppr-${RUN}-${crypto.randomUUID()}`;
  const res = await api("/api/checkout", "POST", { idempotencyKey: checkoutKey });
  const bodyText = await res.text();
  if (res.status === 503) {
    // Ruling 38 negative contract: payment provider unreachable ⇒ machine-readable code,
    // provisional rows intact. This is the CI-stub-key leg.
    const body = JSON.parse(bodyText);
    assert.equal(body.error, "payment_unavailable", `503 must be the declared contract, got: ${bodyText}`);
  } else {
    assert.equal(res.status, 201, `POST /api/checkout must be 201 or the declared 503, got ${res.status}: ${bodyText}`);
  }

  // LIKE prefix (bare key + any `#<n>` suffixed rows): a single-item cart must stamp exactly
  // ONE row — more than one means the cart was not isolated and the parity read is meaningless.
  const r = await db.execute(sql`
    SELECT id, service_id, provider_earnings, platform_fee, insurance_fee, total_amount, status
    FROM service_bookings WHERE idempotency_key LIKE ${checkoutKey + "%"}
  `);
  assert.equal(r.rows.length, 1, "checkout must have stamped exactly one booking row for this key");
  const row = r.rows[0] as any;
  createdBookingIds.push(row.id);
  assert.equal(row.service_id, serviceId, "the stamped row must be for the service under test");
  if (res.status === 503) {
    assert.equal(row.status, "payment_pending", "on payment_unavailable the claim row must stay provisional");
  }
  return { status: res.status, row };
}

before(async () => {
  await assertDisposableDb();
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL} ('npm run dev' / CI boot step)`);

  // Traveler through the real registration route (email-auth session, user.claims.sub shape).
  const reg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ids.travelerEmail, password: PASSWORD, firstName: "PPR", lastName: "Traveler" }),
  });
  assert.equal(reg.status, 201, `register failed (${reg.status}): ${await reg.clone().text()}`);
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  travelerCookie = setCookie!.split(";")[0];
  travelerId = ((await reg.json()) as any).user.id;

  // Expert (service owner) — direct fixture insert, same posture as the db suite.
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`ppr-${RUN}-expert@t.test`}, 'PPR', 'Expert', 'expert')
  `);
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM provider_earnings WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM platform_revenue WHERE source_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM payment_intents WHERE booking_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  if (travelerId) {
    await db.execute(sql`DELETE FROM cart_items WHERE user_id = ${travelerId}`).catch(() => {});
    await db.execute(sql`DELETE FROM contracts WHERE traveler_id = ${travelerId}`).catch(() => {});
  }
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.expert}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE email = ${ids.travelerEmail}`).catch(() => {});
});

test("R1: route-stamped provider_earnings equals the shared recipe (default band)", async () => {
  const price = 180;
  const serviceId = await makeService(price.toFixed(2));
  const expected = await recipeExpectation(price);
  assert.ok(Number(expected.stamped) > 0, "recipe expectation must be a positive payout");

  const { row } = await checkoutThroughRoute(serviceId);
  assert.equal(
    Number(row.provider_earnings).toFixed(2),
    expected.stamped,
    "the route's stamped 'You earn $X' figure has DRIFTED from the shared resolver/insurance recipe",
  );
  assert.equal(Number(row.insurance_fee).toFixed(2), expected.insurance, "insurance_fee stamp must match the recipe");
  assert.equal(Number(row.platform_fee).toFixed(2), expected.platformFee, "platform_fee stamp must match the recipe");
  // Conservation: what the expert is promised plus the platform take is exactly the price.
  assert.equal(
    (Number(row.provider_earnings) + Number(row.platform_fee)).toFixed(2),
    Number(row.total_amount).toFixed(2),
    "earnings + platform take must reconstruct the charged amount",
  );
});

test("R2: per-service revenueShareRate override flows through the route's safeParseRate path", async () => {
  const price = 200;
  const overrideRate = "0.55"; // valid [0,1] override; discriminator asserted below, no fee literal in the EXPECTATION
  const serviceId = await makeService(price.toFixed(2), overrideRate);
  const expected = await recipeExpectation(price, overrideRate);
  const defaultBand = await recipeExpectation(price);
  // Belt-and-braces: the override figure must DIFFER from the default-band figure, otherwise
  // this test could not distinguish "route honoured the override" from "route ignored it".
  assert.notEqual(expected.stamped, defaultBand.stamped, "fixture override must be distinguishable from the default band");
  assert.notEqual(parseFloat(overrideRate), expected.defaultBandShare, "override rate must differ from the live band rate");

  const { row } = await checkoutThroughRoute(serviceId);
  assert.equal(
    Number(row.provider_earnings).toFixed(2),
    expected.stamped,
    "the route must stamp the per-service override figure (safeParseRate path), not the band figure",
  );
});
