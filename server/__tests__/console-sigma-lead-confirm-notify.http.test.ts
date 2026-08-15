/**
 * CONSOLE-SIGMA — lead-confirm notification regression lock.
 *
 * Regression target: Task 1113 — POST /api/admin/leads/:expertRequestId/confirm must
 * insert exactly one notifications row for the assigned expert (with data.workspacePath).
 * An idempotent re-confirm must insert no duplicate.
 *
 * Assertion map:
 *   N1  first confirm → 200 + exactly one notifications row with correct type and
 *       data.workspacePath pointing at /expert/workspace/<tripId>.
 *   N2  second confirm (idempotent) → 200 + notification count stays at 1 (no duplicate).
 *
 * Pattern: real HTTP against real admin router over a real email-auth session,
 * same harness as console-sigma-workspace-machine.http.test.ts.
 *
 * Run with:
 *   npx tsx --test server/__tests__/console-sigma-lead-confirm-notify.http.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import passport from "passport";
import type { Server } from "http";

delete process.env.REPL_ID;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "[REDACTED_STRIPE_TEST_KEY]";
}

const { db, pool } = await import("../db");
const { eq, and, sql } = await import("drizzle-orm");
const { users, trips, expertRequests, tripExpertAdvisors, notifications } = await import("../../shared/schema");
const { getSession } = await import("../replit_integrations/auth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const adminRoutes = (await import("../routes/admin.routes")).default;

const PASSWORD = "test-password-lcn1";

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(salt + ":" + key.toString("hex"));
    });
  });
}

let server: Server;
let baseUrl: string;
let adminCookie: string;

let adminId: string;
let expertId: string;
let tripId: string;
let expertRequestId: string;

async function login(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login failed for ${email}: ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "login must set a session cookie");
  return setCookie!.split(";")[0];
}

/** DB fact: notification rows for the expert scoped to this trip, ordered oldest-first. */
async function notificationRows() {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, expertId),
        eq(notifications.type, "booking_request"),
      ),
    )
    .orderBy(notifications.createdAt);
}

before(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));
  setupEmailAuth(app);
  app.use(adminRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Seed admin + expert users
  adminId = crypto.randomUUID();
  expertId = crypto.randomUUID();
  const adminEmail = `lcn-admin-${adminId.slice(0, 8)}@t.test`;
  const expertEmail = `lcn-expert-${expertId.slice(0, 8)}@t.test`;
  const password = await hashPassword(PASSWORD);

  await db.insert(users).values([
    {
      id: adminId,
      email: adminEmail,
      password,
      firstName: "LCN",
      lastName: "Admin",
      role: "admin",
      authProvider: "email",
    },
    {
      id: expertId,
      email: expertEmail,
      password,
      firstName: "LCN",
      lastName: "Expert",
      role: "local_expert",
      authProvider: "email",
    },
  ] as any);

  // Seed a trip owned by the traveler (admin acts as trip owner for fixture simplicity)
  const [trip] = await db
    .insert(trips)
    .values({
      userId: adminId,
      title: "LCN Notify Test Trip",
      destination: "Tokyo",
      startDate: "2026-10-01",
      endDate: "2026-10-07",
    } as any)
    .returning({ id: trips.id });
  tripId = trip.id;

  // Seed expert_request with assigned_expert_id — the handler uses this to fire the notification
  const [req] = await db
    .insert(expertRequests)
    .values({
      userId: adminId,
      tripId,
      status: "pending",
      assignedExpertId: expertId,
      requestType: "local_expert",
    } as any)
    .returning({ id: expertRequests.id });
  expertRequestId = req.id;

  adminCookie = await login(adminEmail);
});

after(async () => {
  try {
    // Notifications cascade from users; tripExpertAdvisors cascade from trips;
    // expertRequests cascade from trips (onDelete: cascade on tripId).
    if (tripId) await db.delete(trips).where(eq(trips.id, tripId)).catch(() => {});
    if (expertId) await db.delete(users).where(eq(users.id, expertId)).catch(() => {});
    if (adminId) await db.delete(users).where(eq(users.id, adminId)).catch(() => {});
  } finally {
    server?.close();
    await pool.end().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// N1: first confirm → 200 + exactly one notifications row with correct fields.
// ---------------------------------------------------------------------------
test("N1: first confirm inserts exactly one notification with correct type and workspacePath", async () => {
  const res = await fetch(`${baseUrl}/api/admin/leads/${expertRequestId}/confirm`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200, `confirm failed: ${await res.text()}`);

  const rows = await notificationRows();
  assert.equal(rows.length, 1, "exactly one notification row must be created for the expert");

  const n = rows[0] as any;
  assert.equal(n.userId, expertId, "notification must target the assigned expert");
  assert.equal(n.type, "booking_request", "type must be booking_request");

  // data.workspacePath is the key regression point — must exist and point to the trip workspace
  const data = typeof n.data === "string" ? JSON.parse(n.data) : n.data;
  assert.ok(data, "notification data must not be null");
  assert.equal(
    data.workspacePath,
    `/expert/workspace/${tripId}`,
    "workspacePath must point at the expert workspace for the confirmed trip",
  );
  assert.equal(data.tripId, tripId, "data.tripId must match the confirmed trip");
});

// ---------------------------------------------------------------------------
// N2: idempotent re-confirm → 200 + notification count stays at 1 (no duplicate).
// ---------------------------------------------------------------------------
test("N2: re-confirming the same request adds no duplicate notification", async () => {
  // Second confirm — tripExpertAdvisors row already exists, so wasCreated = false
  const res = await fetch(`${baseUrl}/api/admin/leads/${expertRequestId}/confirm`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
  assert.equal(res.status, 200, `re-confirm must still return 200: ${await res.text()}`);

  const rows = await notificationRows();
  assert.equal(rows.length, 1, "re-confirm must not insert a duplicate notification row");
});
