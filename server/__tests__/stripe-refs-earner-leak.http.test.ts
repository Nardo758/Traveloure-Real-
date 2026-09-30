/**
 * STRIPE REFERENCE LEAK GATE — regression test for the sanitizeBookingForExpert
 * allow-list fix (EARNER_BOOKING_FIELDS in server/utils/data-sanitizer.ts).
 *
 * The historical bug: the old deny-list stripped field names that don't exist on
 * service_bookings while the REAL Stripe reference columns (stripePaymentIntentId,
 * stripeDepositIntentId, stripeBalanceIntentId) leaked straight through to
 * providers/experts. This suite pins the fixed behaviour at the HTTP surface so a
 * future refactor of the earner booking routes cannot silently re-leak them:
 *
 *   L1 — GET /api/expert/bookings as an expert session: no Stripe intent ref or
 *        idempotencyKey anywhere in the response body (keys AND marker values).
 *   L2 — GET /api/provider/bookings as a service_provider session: same claim.
 *   L3 — GET /api/bookings/:id as the earning provider: same claim.
 *   L4 — admin (canSeeFull) still sees the FULL row through the same sanitizer
 *        (GET /api/bookings/:id on a booking the admin is party to) — the gate
 *        must not have over-stripped privileged surfaces.
 *
 * Transport: real HTTP against the already-running server on :5000 (sessions
 * minted via the real /api/auth/register + /api/auth/login so claims.role is the
 * DB role at login time — the routes read req.user.claims.role).
 *
 * Run solo:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/stripe-refs-earner-leak.http.test.ts
 *
 * DISPOSABLE DB ONLY — same guard posture as payout-parity-route.http.test.ts.
 * Every row this file writes is created here and deleted in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);

// Marker values: globally unique per run so a substring scan of the raw response
// body catches a leak through ANY path (nested objects, renamed keys, etc.).
const MARKERS = {
  paymentIntent: `pi_leak_${RUN}_payment`,
  depositIntent: `pi_leak_${RUN}_deposit`,
  balanceIntent: `pi_leak_${RUN}_balance`,
  idempotencyKey: `idem_leak_${RUN}_key`,
};
const FORBIDDEN_KEYS = [
  "stripePaymentIntentId",
  "stripeDepositIntentId",
  "stripeBalanceIntentId",
  "idempotencyKey",
];

const emails = {
  traveler: `srl-${RUN}-trav@t.test`,
  expert: `srl-${RUN}-expert@t.test`,
  provider: `srl-${RUN}-provider@t.test`,
  admin: `srl-${RUN}-admin@t.test`,
};
const userIds: Record<string, string> = {};
const cookies: Record<string, string> = {};
const createdServiceIds: string[] = [];
const createdBookingIds: string[] = [];

// ── Disposable-DB guard (mirrors payout-parity suites; never defaults open) ──
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
      `[stripe-refs-leak] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function registerUser(email: string, first: string): Promise<{ id: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: first, lastName: "LeakGate" }),
  });
  assert.equal(res.status, 201, `register ${email} failed (${res.status}): ${await res.clone().text()}`);
  return { id: ((await res.json()) as any).user.id };
}

/** Login AFTER the DB role flip so the session's claims.role snapshot carries the role. */
async function loginCookie(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login ${email} failed (${res.status}): ${await res.clone().text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, `login ${email} must set a session cookie`);
  return setCookie!.split(";")[0];
}

function apiGet(path: string, cookie: string) {
  return fetch(`${BASE_URL}${path}`, { headers: { cookie } });
}

/** Recursively collect every key present anywhere in a JSON value. */
function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

/** The core negative claim: no forbidden key at ANY depth, no marker value anywhere in the raw body. */
function assertNoStripeRefs(rawBody: string, parsed: unknown, surface: string): void {
  for (const marker of Object.values(MARKERS)) {
    assert.ok(
      !rawBody.includes(marker),
      `${surface}: Stripe/idempotency marker value '${marker}' LEAKED into the earner response body`,
    );
  }
  const keys = collectKeys(parsed);
  for (const key of FORBIDDEN_KEYS) {
    assert.ok(
      !keys.has(key),
      `${surface}: forbidden field '${key}' present in the earner response (sanitizer bypassed?)`,
    );
  }
}

async function makeService(ownerId: string): Promise<string> {
  const id = `srl-${RUN}-svc-${crypto.randomUUID().slice(0, 6)}`;
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status)
    VALUES (${id}, ${ownerId}, ${`Stripe leak gate service ${RUN}`}, 'fixture', '100.00', 'active', 'approved')
  `);
  createdServiceIds.push(id);
  return id;
}

/** Seed a booking with ALL THREE Stripe intent refs + idempotencyKey stamped with run markers. */
async function makeBooking(serviceId: string, providerId: string, suffix: string): Promise<string> {
  const id = `srl-${RUN}-bkg-${suffix}`;
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, status, total_amount, platform_fee, provider_earnings,
       stripe_payment_intent_id, stripe_deposit_intent_id, stripe_balance_intent_id, idempotency_key)
    VALUES
      (${id}, ${serviceId}, ${userIds.traveler}, ${providerId}, 'confirmed', '100.00', '25.00', '75.00',
       ${MARKERS.paymentIntent}, ${MARKERS.depositIntent}, ${MARKERS.balanceIntent}, ${MARKERS.idempotencyKey + "-" + suffix})
  `);
  createdBookingIds.push(id);
  return id;
}

let expertBookingId = "";
let providerBookingId = "";
let adminBookingId = "";

before(async () => {
  await assertDisposableDb();
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `server must be running on ${BASE_URL} ('npm run dev' / CI boot step)`);

  // All four users through the real registration route, then role flips + fresh
  // logins so each session's claims.role snapshot is the intended role.
  userIds.traveler = (await registerUser(emails.traveler, "SRL-Trav")).id;
  userIds.expert = (await registerUser(emails.expert, "SRL-Expert")).id;
  userIds.provider = (await registerUser(emails.provider, "SRL-Provider")).id;
  userIds.admin = (await registerUser(emails.admin, "SRL-Admin")).id;

  await db.execute(sql`UPDATE users SET role = 'expert' WHERE id = ${userIds.expert}`);
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${userIds.provider}`);
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${userIds.admin}`);

  cookies.expert = await loginCookie(emails.expert);
  cookies.provider = await loginCookie(emails.provider);
  cookies.admin = await loginCookie(emails.admin);

  // One service + one marker-stamped booking per earner, plus one where the ADMIN
  // is the earning party (so GET /api/bookings/:id passes its party check and the
  // canSeeFull branch of sanitizeBookingForExpert is what's under test in L4).
  const expertSvc = await makeService(userIds.expert);
  const providerSvc = await makeService(userIds.provider);
  const adminSvc = await makeService(userIds.admin);
  expertBookingId = await makeBooking(expertSvc, userIds.expert, "exp");
  providerBookingId = await makeBooking(providerSvc, userIds.provider, "prov");
  adminBookingId = await makeBooking(adminSvc, userIds.admin, "adm");
});

after(async () => {
  for (const id of createdBookingIds) {
    await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`).catch(() => {});
  }
  for (const id of createdServiceIds) {
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
    await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  }
  await db
    .execute(
      sql`DELETE FROM users WHERE email IN (${emails.traveler}, ${emails.expert}, ${emails.provider}, ${emails.admin})`,
    )
    .catch(() => {});
});

test("L1: GET /api/expert/bookings never exposes Stripe intent refs or idempotencyKey", async () => {
  const res = await apiGet("/api/expert/bookings", cookies.expert);
  assert.equal(res.status, 200, `expert bookings list must 200, got ${res.status}: ${await res.clone().text()}`);
  const raw = await res.text();
  const parsed = JSON.parse(raw) as any[];
  const row = parsed.find((b) => b.id === expertBookingId);
  assert.ok(row, "the seeded expert booking must appear in the list (otherwise the leak claim is vacuous)");
  assert.equal(row.totalAmount, "100.00", "operational fields must survive the allow-list projection");
  assertNoStripeRefs(raw, parsed, "GET /api/expert/bookings");
});

test("L2: GET /api/provider/bookings never exposes Stripe intent refs or idempotencyKey", async () => {
  const res = await apiGet("/api/provider/bookings", cookies.provider);
  assert.equal(res.status, 200, `provider bookings list must 200, got ${res.status}: ${await res.clone().text()}`);
  const raw = await res.text();
  const parsed = JSON.parse(raw) as any[];
  const row = parsed.find((b) => b.id === providerBookingId);
  assert.ok(row, "the seeded provider booking must appear in the list (otherwise the leak claim is vacuous)");
  assert.equal(row.totalAmount, "100.00", "operational fields must survive the allow-list projection");
  assertNoStripeRefs(raw, parsed, "GET /api/provider/bookings");
});

test("L3: GET /api/bookings/:id as an earner never exposes Stripe intent refs", async () => {
  // ROUTING NOTE: /api/bookings/:id is currently served by the router mounted at
  // app.use("/api/bookings", ...) (server/routes/bookings.ts), whose ownership
  // guard admits only the TRAVELER or an admin — earners get a 403 and the inline
  // earner-branch handler in server/routes.ts is shadowed. Both outcomes are safe:
  //   • 403 ⇒ no data at all reaches the earner (guard posture);
  //   • 200 ⇒ a refactor unshadowed the earner branch, and the body must then be
  //     the sanitized projection (the original leak vector this suite pins).
  // Anything else (500, 404) is a hard failure. The raw body is scanned for the
  // marker values in EVERY case, so an error body echoing the row still fails.
  for (const [who, cookie, bookingId] of [
    ["provider", cookies.provider, providerBookingId],
    ["expert", cookies.expert, expertBookingId],
  ] as const) {
    const res = await apiGet(`/api/bookings/${bookingId}`, cookie);
    const raw = await res.text();
    assert.ok(
      res.status === 200 || res.status === 403,
      `single booking as ${who} must be 200 (sanitized) or 403 (ownership guard), got ${res.status}: ${raw}`,
    );
    const parsed = JSON.parse(raw) as any;
    if (res.status === 200) {
      assert.equal(parsed.id, bookingId, "must be the seeded booking");
    }
    assertNoStripeRefs(raw, parsed, `GET /api/bookings/:id (${who}, ${res.status})`);
  }
});

test("L4: admin (canSeeFull) still receives the full row — sanitizer must not over-strip", async () => {
  const res = await apiGet(`/api/bookings/${adminBookingId}`, cookies.admin);
  assert.equal(res.status, 200, `single booking as admin must 200, got ${res.status}: ${await res.clone().text()}`);
  const body = (await res.json()) as any;
  assert.equal(body.id, adminBookingId, "must be the seeded booking");
  assert.equal(
    body.stripePaymentIntentId,
    MARKERS.paymentIntent,
    "admin must still see stripePaymentIntentId (canSeeFull contract unchanged)",
  );
  assert.equal(body.stripeDepositIntentId, MARKERS.depositIntent, "admin must still see stripeDepositIntentId");
  assert.equal(body.stripeBalanceIntentId, MARKERS.balanceIntent, "admin must still see stripeBalanceIntentId");
});
