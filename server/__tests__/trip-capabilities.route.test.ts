/**
 * CAP-1 — GET /api/trips/:tripId/capabilities (ledger `2026-11-03-cap1-trip-capabilities`).
 *
 *   T4 the owner gets 200 with the whole shape; a stranger 403; an unknown trip 404 — the SAME codes the plancard GET
 *      gives the same users (both routes asked side by side, through the one extracted gate).
 *   T5 a granted pass → `pass.active` true and `actions.optimize` "free" while runs are left.
 *   T6 waitlist mode → `actions.checkout` "waitlist" for a traveler owner, "yes" for an admin owner.
 *   T4b the verified-email gate: with enforcement on, an unverified owner reads "verify" (reason `email_unverified`);
 *       once the email is verified, the same owner reads "yes".
 *
 * TRANSPORT: the REAL routers in a bare express app with a chosen session identity (the payer-reads-plancard shape).
 * DISPOSABLE DB ONLY. Every row is created here and removed in after().
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/trip-capabilities.route.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

const { db } = await import("../db");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { TRAVELER_SIGNUP_MODE_SETTING } = await import("@shared/launch-signup");
const { grantTripPass } = await import("../services/trip-entitlement.service");
const capabilitiesRouter = (await import("../routes/trip-capabilities.routes")).default;
const plancardRouter = (await import("../routes/plancard.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `cap1-${RUN}-owner`,
  admin: `cap1-${RUN}-admin`,
  stranger: `cap1-${RUN}-stranger`,
  trip: `cap1-${RUN}-trip`,
  adminTrip: `cap1-${RUN}-trip-admin`,
  passTrip: `cap1-${RUN}-trip-pass`,
};
let priorMode: string | null = null;

async function getAs(userId: string, path: string): Promise<{ status: number; body: any; cache: string | null }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(capabilitiesRouter);
  app.use(plancardRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: await res.json().catch(() => null), cache: res.headers.get("cache-control") };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function setMode(value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${TRAVELER_SIGNUP_MODE_SETTING}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  priorMode = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  for (const [id, role] of [[ids.owner, "user"], [ids.admin, "admin"], [ids.stranger, "user"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id}, ${`${id}@t.test`}, 'CAP', 'Fixture', ${role})`);
  }
  for (const [tripId, owner] of [[ids.trip, ids.owner], [ids.adminTrip, ids.admin], [ids.passTrip, ids.owner]] as const) {
    await db.execute(sql`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
      VALUES (${tripId}, ${owner}, ${`CAP plan ${RUN}`}, 'Kyoto, Japan', '2027-05-01', '2027-05-04', 'draft')
    `);
    await db.execute(sql`INSERT INTO trip_collaborators (id, trip_id, user_id, role) VALUES (${crypto.randomUUID()}, ${tripId}, ${owner}, 'owner')`);
  }
  await grantTripPass({ tripId: ids.passTrip, source: "manual", allowancesSnapshot: { runsPerTrip: 3 } });
});

after(async () => {
  await setMode(priorMode);
  for (const t of [ids.trip, ids.adminTrip, ids.passTrip]) {
    await db.execute(sql`DELETE FROM trip_entitlements WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`).catch(() => {});
  }
  for (const id of [ids.owner, ids.admin, ids.stranger]) await db.execute(sql`DELETE FROM users WHERE id = ${id}`).catch(() => {});
});

test("T4 owner 200 with the whole shape; stranger 403; unknown 404 — the same codes as the plancard GET", async () => {
  await setMode("open");
  const own = await getAs(ids.owner, `/api/trips/${ids.trip}/capabilities`);
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.cache, "private, no-store");
  assert.deepEqual(Object.keys(own.body).sort(), ["actions", "concierge", "handoff", "pass", "reasons", "signup", "viewer"]);
  assert.deepEqual(own.body.viewer, { role: "owner", canEdit: true, canPay: true, emailVerified: false });
  assert.deepEqual(own.body.signup, { mode: "open", purchasesAllowed: true });
  assert.deepEqual(own.body.pass, { active: false, runs: null });
  assert.deepEqual(own.body.handoff, { present: false, kind: null, status: null, scopeItemIds: [], pendingSuggestions: 0, onTripSupport: "none" });
  assert.deepEqual(own.body.concierge, { present: false, status: null, accessUntil: null });
  assert.equal(own.body.actions.checkout, "yes");
  assert.equal(own.body.actions.handoff, "offer");
  for (const k of ["optimize", "ask", "handoff", "handoffBook", "checkout", "tripPass", "concierge"]) {
    assert.equal(typeof own.body.actions[k], "string", k);
    assert.equal(typeof own.body.reasons[k], "string", k);
  }

  for (const [user, trip, code] of [[ids.owner, ids.trip, 200], [ids.stranger, ids.trip, 403], [ids.owner, `cap1-${RUN}-nope`, 404]] as const) {
    const caps = await getAs(user, `/api/trips/${trip}/capabilities`);
    const card = await getAs(user, `/api/trips/${trip}/plancard`);
    assert.equal(caps.status, code, `capabilities for ${user} on ${trip}`);
    assert.equal(card.status, code, `plancard for ${user} on ${trip}`);
  }
});

test("T5 a granted pass: pass.active and optimize free while runs are left", async () => {
  await setMode("open");
  const r = await getAs(ids.owner, `/api/trips/${ids.passTrip}/capabilities`);
  assert.equal(r.status, 200);
  assert.equal(r.body.pass.active, true);
  assert.ok(r.body.pass.runs && r.body.pass.runs.left > 0, JSON.stringify(r.body.pass));
  assert.equal(r.body.actions.optimize, "free");
  assert.equal(r.body.actions.ask, "free");
  assert.equal(r.body.actions.tripPass, "active");
});

test("T6 waitlist: checkout waitlist for a traveler owner, yes for an admin owner", async () => {
  await setMode("waitlist");
  const traveler = await getAs(ids.owner, `/api/trips/${ids.trip}/capabilities`);
  assert.equal(traveler.body.signup.mode, "waitlist");
  assert.equal(traveler.body.actions.checkout, "waitlist");
  assert.equal(traveler.body.reasons.checkout, "waitlist");
  const admin = await getAs(ids.admin, `/api/trips/${ids.adminTrip}/capabilities`);
  assert.equal(admin.body.signup.purchasesAllowed, true);
  assert.equal(admin.body.actions.checkout, "yes");
});

test("T4b the verified-email gate: verify for an unverified owner, yes once verified", async () => {
  await setMode("open");
  const prior = process.env.EMAIL_SENDS_ENABLED;
  process.env.EMAIL_SENDS_ENABLED = "true";
  try {
    const before = await getAs(ids.owner, `/api/trips/${ids.trip}/capabilities`);
    assert.equal(before.status, 200);
    assert.equal(before.body.viewer.emailVerified, false);
    assert.equal(before.body.actions.checkout, "verify");
    assert.equal(before.body.reasons.checkout, "email_unverified");
    assert.equal(before.body.actions.tripPass, "verify");
    assert.equal(before.body.actions.handoff, "verify");
    await db.execute(sql`UPDATE users SET email_verified = NOW() WHERE id = ${ids.owner}`);
    const after = await getAs(ids.owner, `/api/trips/${ids.trip}/capabilities`);
    assert.equal(after.body.viewer.emailVerified, true);
    assert.equal(after.body.actions.checkout, "yes");
  } finally {
    if (prior === undefined) delete process.env.EMAIL_SENDS_ENABLED;
    else process.env.EMAIL_SENDS_ENABLED = prior;
    await db.execute(sql`UPDATE users SET email_verified = NULL WHERE id = ${ids.owner}`);
  }
});
