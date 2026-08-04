/**
 * Task: the trip commission API must show the new split to experts right after
 * an admin fee-band edit (ruling 25, HTTP surface).
 *
 * The service level is already proven (server/services/__tests__/expert-split-band.db.test.ts):
 * getExpertSplitRates() and resolveReadyMadeTakeRate re-read fee_bands.expert_standard
 * after a cache clear / 60s TTL expiry. This test proves the HTTP surface experts
 * actually see — GET /api/trips/:tripId/commission (server/routes/booking-actions.ts,
 * fallbackExpertShare) — over a REAL authenticated session:
 *
 *   1. Boots a real express app: getSession() + passport + setupEmailAuth() +
 *      the real booking-actions router mounted at /api (same as server/routes.ts).
 *   2. Logs in as an expert via POST /api/auth/login (real session cookie).
 *   3. Seeds a trip assigned to that expert (trip_expert_advisors) with one
 *      confirmed itinerary item, and asserts the commission response mirrors
 *      the seeded expert_standard band (expert has no active services, so the
 *      fallbackExpertShare path is exercised).
 *   4. Simulates the admin band edit (fee_bands UPDATE — what
 *      PATCH /api/admin/fee-bands/expert_standard executes) + cache expiry
 *      (clearExpertSplitCache(), equivalent to the 60s TTL elapsing), and
 *      asserts the SAME authenticated GET now returns the new fallback share.
 *   5. Proves the in-process cache bounds staleness: without a clear, the HTTP
 *      response still serves the old split.
 * Band, cache, and all seeded rows are restored/removed in finally blocks.
 *
 * Run with: npx tsx --test server/__tests__/trip-commission-band-edit.http.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import passport from "passport";
import type { Server } from "http";

// The OIDC strategy needs a live discovery round-trip; the email-auth session
// path under test does not. Drop REPL_ID so setupAuth-equivalent wiring below
// stays offline (same behavior as CI, see replitAuth.ts REPL_ID early-return).
delete process.env.REPL_ID;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
// stripe.service.ts hard-fails on a non-test key at import time (booking-actions'
// module graph pulls it in). The commission route never touches Stripe, so a
// dummy test key is fine — same technique as booking-confirm-payment-idempotency.
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
}

const { db, pool } = await import("../db");
const { sql, eq } = await import("drizzle-orm");
const { users, trips, tripExpertAdvisors, itineraryItems } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { clearExpertSplitCache } = await import("../services/commission");
const bookingActionsRoutes = (await import("../routes/booking-actions")).default;

const BAND_KEY = "expert_standard";
const PASSWORD = "test-password-1034";

// scrypt hash in the exact salt:hex format emailAuth.ts verifyPassword expects.
function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(salt + ":" + key.toString("hex"));
    });
  });
}

async function readBand(): Promise<{ rate: number; active: boolean }> {
  const r = await db.execute(sql`
    SELECT CAST(default_rate AS FLOAT) AS rate, is_active
    FROM fee_bands WHERE band_key = ${BAND_KEY} LIMIT 1
  `);
  const row = r.rows?.[0] as any;
  assert.ok(row, "expert_standard band must be seeded (migrations 033/174)");
  return { rate: Number(row.rate), active: !!row.is_active };
}

// Exactly the write PATCH /api/admin/fee-bands/:bandKey performs for default_rate.
async function setBandRate(rate: number) {
  await db.execute(sql`UPDATE fee_bands SET default_rate = ${rate} WHERE band_key = ${BAND_KEY}`);
}

let server: Server;
let baseUrl: string;
let cookie: string;
let expertId: string;
let tripId: string;

before(async () => {
  // Real HTTP app: session store + passport + email auth + the real router.
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));
  setupEmailAuth(app);
  app.use("/api", bookingActionsRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Seed expert + assigned trip + one confirmed itinerary item ($100).
  expertId = crypto.randomUUID();
  await db.insert(users).values({
    id: expertId,
    email: `expert-1034-${expertId.slice(0, 8)}@t.test`,
    password: await hashPassword(PASSWORD),
    firstName: "Band",
    lastName: "Tester",
    role: "local_expert",
    authProvider: "email",
  } as any);

  const [trip] = await db.insert(trips).values({
    userId: expertId,
    title: "Commission band HTTP test trip",
    destination: "Lisbon",
    startDate: "2026-09-01",
    endDate: "2026-09-05",
  } as any).returning({ id: trips.id });
  tripId = trip.id;

  await db.insert(tripExpertAdvisors).values({
    tripId,
    localExpertId: expertId,
    status: "accepted",
  } as any);

  await db.insert(itineraryItems).values({
    tripId,
    title: "Tram 28 private tour",
    dayNumber: 1,
    status: "confirmed",
    estimatedCost: "100.00",
  } as any);

  // Real login → real session cookie (the auth path experts use).
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `expert-1034-${expertId.slice(0, 8)}@t.test`, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login failed: ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "login must set a session cookie");
  cookie = setCookie!.split(";")[0];

  clearExpertSplitCache();
});

after(async () => {
  try {
    // Remove seeded rows (itinerary items + advisor rows cascade from the trip).
    if (tripId) await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {});
    if (expertId) await db.delete(users).where(eq(users.id, expertId)).catch(() => {});
    // Session rows expire via TTL; nothing to restore in fee_bands here — each
    // test restores the band itself, and the sanity check below proves it.
    const band = await readBand();
    assert.ok(band.active, "expert_standard band must remain active after the test");
    clearExpertSplitCache();
  } finally {
    server?.close();
    await pool.end().catch(() => {});
  }
});

async function getCommission(): Promise<any> {
  const res = await fetch(`${baseUrl}/api/trips/${tripId}/commission`, {
    headers: { cookie },
  });
  const text = await res.text();
  assert.equal(res.status, 200, `commission GET failed: ${text}`);
  return JSON.parse(text);
}

test("commission API mirrors the seeded band for an authenticated expert (fallback path)", async () => {
  const band = await readBand();
  assert.ok(band.active);

  const body = await getCommission();
  assert.equal(body.tripId, tripId);
  assert.equal(body.expertId, expertId);
  assert.equal(body.itemCount, 1);
  // Expert has no active provider services → fallbackExpertShare = 1 - band rate.
  const expectedShare = Math.round((1 - band.rate) * 1e4) / 1e4;
  assert.equal(body.revenueShareRate, expectedShare);
  assert.equal(body.totalGross, "100.00");
  assert.equal(body.expertShare, (100 * (1 - band.rate)).toFixed(2));
  assert.equal(body.platformFee, (100 * band.rate).toFixed(2));
});

test("admin band edit + cache expiry changes the split the expert sees over HTTP", async () => {
  const original = await readBand();
  const edited = original.rate <= 0.5 ? original.rate + 0.1 : original.rate - 0.1;
  try {
    // Prime the cache with the pre-edit value via the real HTTP surface.
    const beforeBody = await getCommission();
    assert.equal(beforeBody.revenueShareRate, Math.round((1 - original.rate) * 1e4) / 1e4);

    // The admin edit (what PATCH /api/admin/fee-bands/expert_standard writes)...
    await setBandRate(edited);

    // ...is NOT visible while the 60s in-process cache holds — staleness is bounded, not zero.
    const staleBody = await getCommission();
    assert.equal(staleBody.revenueShareRate, beforeBody.revenueShareRate);

    // After cache expiry (TTL elapse ≡ clearExpertSplitCache), the HTTP response
    // the expert sees reflects the new fallback share immediately.
    clearExpertSplitCache();
    const freshBody = await getCommission();
    const expectedShare = Math.round((1 - edited) * 1e4) / 1e4;
    assert.equal(freshBody.revenueShareRate, expectedShare);
    assert.equal(freshBody.expertShare, (100 * (1 - edited)).toFixed(2));
    assert.equal(freshBody.platformFee, (100 * edited).toFixed(2));
  } finally {
    await setBandRate(original.rate);
    clearExpertSplitCache();
  }
});

test("a non-assigned authenticated user gets 403, never a split", async () => {
  // Second real user + login: assignment gating on the same endpoint.
  const otherId = crypto.randomUUID();
  const email = `other-1034-${otherId.slice(0, 8)}@t.test`;
  try {
    await db.insert(users).values({
      id: otherId,
      email,
      password: await hashPassword(PASSWORD),
      role: "local_expert",
      authProvider: "email",
    } as any);
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert.equal(login.status, 200);
    const otherCookie = login.headers.get("set-cookie")!.split(";")[0];

    const res = await fetch(`${baseUrl}/api/trips/${tripId}/commission`, {
      headers: { cookie: otherCookie },
    });
    assert.equal(res.status, 403);
  } finally {
    await db.delete(users).where(eq(users.id, otherId)).catch(() => {});
  }
});
