/**
 * EXPERT-BOOKING-REQUEST RATE AUTHORITY — SS-14 / docs/DECISIONS.md ruling 71 (completes 1C).
 *
 * ── WHAT THIS PINS ─────────────────────────────────────────────────────────────────────────────
 * 1C (ruling 69 D6) repointed the CART checkout + /api/cart fee-preview onto the D1 resolver via
 * `direct-charge-rate.service.ts`, but TWO charge-adjacent paths still read the per-service
 * `revenueShareRate` snapshot as a FIRST OPERAND: `POST /api/expert-booking-requests` (which persists
 * `platform_fee`/`provider_earnings` onto a REAL `service_bookings` row) and the
 * `GET /api/trips/:tripId/commission` earnings breakdown. Ruling 71 repoints BOTH onto the same seam
 * (Step 1), then RETIRES the provider-lane derivation so new provider rows carry a NULL snapshot
 * (Step 2). These pins fail the day either regresses.
 *
 * NO LITERALS (§8 / ruling 32): every economic expectation is computed from a `fee_bands` READ via
 * `resolveProviderRate` / `getExpertSplitRates`. Re-pricing a band is not a test edit.
 *
 * Needs the dev server (the endpoints live in the routes.ts monolith). See the bench recipe.
 *   npx tsx --test server/__tests__/expert-booking-request-rate.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
// stripe.service.ts hard-fails on a non-test key at import time (the storage/routes graph pulls it
// in). None of the paths under test touch Stripe; a dummy test key is fine.
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) process.env.STRIPE_SECRET_KEY = "sk_test_dummy";

const { db } = await import("../db");
const { sql, eq } = await import("drizzle-orm");
const { storage } = await import("../storage");
const { resolveProviderRate } = await import("../services/fee-resolution.service");
const { getExpertSplitRates } = await import("../services/commission");
const { insertProviderServiceSchema } = await import("../../shared/schema");
const { trips, tripExpertAdvisors, itineraryItems } = await import("../../shared/schema");

const RUN = crypto.randomUUID().slice(0, 8);
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
// A real PROVIDER band (ruling 48), distinct from fee-resolution-authority's `moderate`, so the two
// suites never fight over the same row when both mutate-and-restore.
const BAND = "commercial";
const round2 = (n: number) => Math.round(n * 100) / 100;

let categoryId: string;
let providerId: string;
let expertId: string;
let serviceId: string;
let traveler: { id: string; cookie: string };
let bandOriginalRate: number;
const createdServiceIds: string[] = [];
const createdUserIds: string[] = [];
const createdTripIds: string[] = [];

// ── Disposable-DB guard (mirrors checkout-claim-sweep.db.test.ts; never defaults open) ─────────
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
      `[ebr-rate] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

async function registerUser(tag: string): Promise<{ id: string; cookie: string }> {
  const email = `ebr-${RUN}-${tag}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Sup3rSecret!23", firstName: "EBR", lastName: tag }),
  });
  const raw = await res.text();
  assert.ok(res.ok, `register(${tag}) must succeed: ${res.status} ${raw}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  createdUserIds.push(JSON.parse(raw).user.id);
  return { id: JSON.parse(raw).user.id, cookie: setCookie.split(";")[0] };
}

function api(path: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function readServiceRate(id: string): Promise<number | null> {
  const r = await db.execute(sql`SELECT revenue_share_rate AS v FROM provider_services WHERE id = ${id}`);
  const v = (r.rows[0] as any)?.v;
  return v === null || v === undefined ? null : Number(v);
}
async function readBookingEconomics(id: string): Promise<{ total: number; fee: number; earnings: number }> {
  const r = await db.execute(sql`
    SELECT CAST(total_amount AS FLOAT) AS t, CAST(platform_fee AS FLOAT) AS f, CAST(provider_earnings AS FLOAT) AS e
    FROM service_bookings WHERE id = ${id}`);
  const row = r.rows[0] as any;
  assert.ok(row, `booking ${id} must exist`);
  return { total: Number(row.t), fee: Number(row.f), earnings: Number(row.e) };
}
/** POST a booking request as the traveler and return the created booking id + response economics. */
async function requestBooking(): Promise<{ bookingId: string; body: any }> {
  const res = await api("/api/expert-booking-requests", traveler.cookie, "POST", { serviceId });
  const text = await res.text();
  assert.equal(res.status, 201, `expert-booking-request must succeed: ${res.status} ${text}`);
  const body = JSON.parse(text);
  assert.ok(body.bookingId, "a service-scoped request must create a booking row");
  return { bookingId: body.bookingId, body };
}

before(async () => {
  await assertDisposableDb();
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL} (see the bench recipe)`);

  // A category on the real `commercial` provider band → the D1 path. Every expectation re-reads the
  // band, so the starting rate is only a starting point.
  const bandRow = await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS r FROM fee_bands WHERE band_key = ${BAND} AND is_active = true LIMIT 1`);
  bandOriginalRate = Number((bandRow.rows[0] as any).r);

  const cat = await db.execute(sql`
    INSERT INTO service_categories (id, name, slug, commission_band_key)
    VALUES (gen_random_uuid()::text, ${"ebr-" + RUN}, ${"ebr-" + RUN}, ${BAND})
    RETURNING id`);
  categoryId = String((cat.rows[0] as any).id);

  // A provider owner (role 'service_provider' → the D1 lane) and an expert owner (expert lane).
  const prov = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`ebr-${RUN}-prov@t.test`}, 'service_provider') RETURNING id`);
  providerId = String((prov.rows[0] as any).id);
  createdUserIds.push(providerId);
  const exp = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`ebr-${RUN}-exp@t.test`}, 'local_expert') RETURNING id`);
  expertId = String((exp.rows[0] as any).id);
  createdUserIds.push(expertId);

  traveler = await registerUser("trav");

  // The service under booking-request test: a provider-owned $100 listing in the banded category.
  const svc = await storage.createProviderService({
    userId: providerId,
    serviceName: `EBR provider svc ${RUN}`,
    price: "100.00",
    serviceType: "planning",
    deliveryMethod: "async_messaging",
    categoryId,
    status: "active",
  } as any);
  serviceId = svc.id;
  createdServiceIds.push(svc.id);
});

after(async () => {
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${String(bandOriginalRate)} WHERE band_key = ${BAND}`);
  await db.execute(sql`DELETE FROM service_bookings WHERE service_id = ANY(${createdServiceIds})`).catch(() => {});
  for (const id of createdServiceIds) await db.execute(sql`DELETE FROM provider_services WHERE id = ${id}`).catch(() => {});
  for (const id of createdTripIds) await db.delete(trips).where(eq(trips.id, id)).catch(() => {});
  await db.execute(sql`DELETE FROM service_categories WHERE id = ${categoryId}`).catch(() => {});
  for (const id of createdUserIds) await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
});

// ── STEP 1: the booking-request charge path records the D1 band, never the snapshot ────────────

test("B1: an expert-booking-request records platform_fee/provider_earnings from the D1 band", async () => {
  const rate = await resolveProviderRate({ categoryId });
  const { bookingId } = await requestBooking();
  const econ = await readBookingEconomics(bookingId);
  assert.equal(econ.total, 100, "total is server-derived from the $100 catalog price");
  assert.equal(econ.fee.toFixed(2), round2(100 * rate.platformRate).toFixed(2), "platform_fee = total × the D1 band platform rate");
  assert.equal(econ.earnings.toFixed(2), round2(100 * rate.providerShareRate).toFixed(2), "provider_earnings = total × the D1 band provider share");
});

test("B2: flip the band → the NEXT booking's recorded economics move, with no service-row touch", async () => {
  const before = await resolveProviderRate({ categoryId });
  const rateBefore = await readServiceRate(serviceId); // NULL for a provider row (Step 2)
  const edited = round2(before.platformRate * 2);
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${String(edited)} WHERE band_key = ${BAND}`);
  try {
    const after = await resolveProviderRate({ categoryId });
    assert.equal(after.platformRate, edited, "the band edit must reach the resolver");
    const { bookingId } = await requestBooking();
    const econ = await readBookingEconomics(bookingId);
    assert.equal(econ.fee.toFixed(2), round2(100 * edited).toFixed(2), "the booking must record the EDITED band rate");
    assert.notEqual(econ.fee.toFixed(2), round2(100 * before.platformRate).toFixed(2), "the economics must actually have moved");
  } finally {
    await db.execute(sql`UPDATE fee_bands SET default_rate = ${String(bandOriginalRate)} WHERE band_key = ${BAND}`);
  }
  assert.equal(await readServiceRate(serviceId), rateBefore, "no service row was touched to move the rate");
});

test("B3: a STALE non-NULL revenueShareRate snapshot is DETHRONED — the D1 band charges, not the snapshot", async () => {
  // Simulate a legacy pre-ruling-71 stamp: a hostile 0.99 share (99% to owner, 1% platform fee).
  await db.execute(sql`UPDATE provider_services SET revenue_share_rate = '0.99' WHERE id = ${serviceId}`);
  try {
    const rate = await resolveProviderRate({ categoryId });
    const { bookingId } = await requestBooking();
    const econ = await readBookingEconomics(bookingId);
    assert.notEqual(econ.earnings.toFixed(2), (100 * 0.99).toFixed(2), "the 0.99 snapshot must NEVER price the booking");
    assert.equal(econ.earnings.toFixed(2), round2(100 * rate.providerShareRate).toFixed(2), "the D1 band provider share wins over the snapshot");
    assert.equal(econ.fee.toFixed(2), round2(100 * rate.platformRate).toFixed(2), "platform fee is the D1 take, not 1% of the snapshot");
  } finally {
    await db.execute(sql`UPDATE provider_services SET revenue_share_rate = NULL WHERE id = ${serviceId}`);
  }
});

// ── STEP 2: the provider-lane derivation is retired; the input strip is unchanged (§18) ────────

test("B4 (Step 2): a newly created PROVIDER service carries a NULL revenueShareRate", async () => {
  const svc = await storage.createProviderService({
    userId: providerId,
    serviceName: `EBR step2 ${RUN}`,
    price: "100.00",
    serviceType: "planning",
    deliveryMethod: "async_messaging",
    categoryId,
    status: "active",
  } as any);
  createdServiceIds.push(svc.id);
  assert.equal(await readServiceRate(svc.id), null, "a provider row must no longer be stamped — the D1 band resolves live at charge time");
});

test("B5 (§18 unchanged): a client-sent revenueShareRate is stripped on CREATE (schema + storage)", async () => {
  // Layer 1 — the schema POST /api/provider/services parses.
  const parsed = insertProviderServiceSchema.parse({ serviceName: "x", price: "100.00", revenueShareRate: "0.99" }) as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "revenueShareRate"), false, "the schema must omit the client split");

  // Layer 2 — storage, called with the field still attached. Provider owner ⇒ stripped AND not
  // stamped (NULL). The hostile 0.99 must never reach the row from any caller.
  const provSvc = await storage.createProviderService({
    userId: providerId, serviceName: `EBR strip prov ${RUN}`, price: "100.00", categoryId, status: "active",
    revenueShareRate: "0.99",
  } as any);
  createdServiceIds.push(provSvc.id);
  assert.equal(await readServiceRate(provSvc.id), null, "a provider row never persists the client's 0.99 (stripped + retired)");

  // Layer 2, expert owner ⇒ stripped AND re-DERIVED from the band (expert lane still stamps).
  const expectExpertShare = (await getExpertSplitRates()).expertShareRate;
  const expSvc = await storage.createProviderService({
    userId: expertId, serviceName: `EBR strip exp ${RUN}`, price: "100.00", status: "active",
    revenueShareRate: "0.99",
  } as any);
  createdServiceIds.push(expSvc.id);
  const stored = await readServiceRate(expSvc.id);
  assert.notEqual(stored, 0.99, "the client's 0.99 must never be persisted on an expert row either");
  assert.equal(stored?.toFixed(2), expectExpertShare.toFixed(2), "the expert row carries the fee_bands-derived share, not the client value");
});

test("B6 (§18 unchanged): a PATCH cannot move the split — the update strip is intact", async () => {
  const svc = await storage.createProviderService({
    userId: expertId, serviceName: `EBR patch ${RUN}`, price: "100.00", status: "active",
  } as any);
  createdServiceIds.push(svc.id);
  const before = await readServiceRate(svc.id);
  await storage.updateProviderService(svc.id, { revenueShareRate: "0.99", serviceName: `EBR patched ${RUN}` } as any);
  assert.equal(await readServiceRate(svc.id), before, "a PATCH must not move the commission split");
  const r = await db.execute(sql`SELECT service_name AS n FROM provider_services WHERE id = ${svc.id}`);
  assert.equal((r.rows[0] as any).n, `EBR patched ${RUN}`, "the non-privileged field on the same PATCH still updated");
});

// ── STEP 1: the booking-actions earnings breakdown agrees with the resolver ────────────────────

test("B7: GET /api/trips/:tripId/commission agrees with the D1 resolver for a provider-lane advisor", async () => {
  // A provider-role advisor with one active service in the banded category; the endpoint averages
  // the advisor's own services' resolved share, so a single service pins directly to the D1 rate.
  const advisor = await registerUser("adv");
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${advisor.id}`);
  const advSvc = await storage.createProviderService({
    userId: advisor.id, serviceName: `EBR advisor svc ${RUN}`, price: "100.00", categoryId, status: "active",
  } as any);
  createdServiceIds.push(advSvc.id);

  const [trip] = await db.insert(trips).values({
    userId: traveler.id, title: `EBR commission trip ${RUN}`, destination: "Kyoto",
    startDate: "2026-09-01", endDate: "2026-09-05",
  } as any).returning({ id: trips.id });
  createdTripIds.push(trip.id);
  await db.insert(tripExpertAdvisors).values({ tripId: trip.id, localExpertId: advisor.id, status: "accepted" } as any);
  await db.insert(itineraryItems).values({ tripId: trip.id, title: "Item", dayNumber: 1, status: "confirmed", estimatedCost: "100.00" } as any);

  const rate = await resolveProviderRate({ categoryId });
  const res = await api(`/api/trips/${trip.id}/commission`, advisor.cookie);
  const text = await res.text();
  assert.equal(res.status, 200, `commission GET must succeed: ${res.status} ${text}`);
  const body = JSON.parse(text);
  assert.equal(
    Number(body.revenueShareRate).toFixed(2),
    rate.providerShareRate.toFixed(2),
    "the displayed breakdown must agree with the D1 provider share the charge path would use",
  );
  // And the money lines are that share applied to the $100 item.
  assert.equal(Number(body.expertShare).toFixed(2), round2(100 * rate.providerShareRate).toFixed(2), "expert share line = item × D1 share");
  assert.equal(Number(body.platformFee).toFixed(2), round2(100 * rate.platformRate).toFixed(2), "platform fee line = item × D1 take");
});
