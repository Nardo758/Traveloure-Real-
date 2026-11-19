/**
 * F6 (#1823) + the F7 placement fix (Leon, Nov 19 2026): the admin surfaces, over HTTP.
 *
 * This file boots the REAL admin router on an ephemeral port and calls it with fetch. It does not read source text:
 * if the late list lands in the wrong handler again - which is exactly what happened to F7, whose `lateFailureIgnored`
 * block shipped inside `stuck-pending` - these cases fail.
 *
 * Fixtures are created and removed around the run; nothing else in the database is read or written.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = () => crypto.randomUUID();
const adminUser = uid();
const travelerUser = uid();
const created: string[] = [];
let server: any;
let base = "";

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { /* refuse below */ }
  if (!DISPOSABLE.has(host)) throw new Error(`[f6-admin-surfaces] REFUSING to write to '${host}'.`);
}

/** Boot the real admin router with a stubbed session: `role` decides whether it is an admin. */
async function boot(role: "admin" | "traveler") {
  const mod: any = await import("../routes/admin.routes");
  const router = mod.default ?? mod.router;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: role === "admin" ? adminUser : travelerUser } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api", router);
  const s = app.listen(0);
  await new Promise<void>((r) => s.once("listening", () => r()));
  const { port } = s.address() as AddressInfo;
  return { s, base: `http://127.0.0.1:${port}` };
}

before(async () => {
  assertDisposableDb();
  // The admin account the handlers look up, and a plain traveler for the 403 cases.
  await db.execute(sql`INSERT INTO users (id, email, role, first_name, last_name) VALUES (${adminUser}, ${`f6-admin-${RUN}@ci.test`}, 'admin', 'F6', 'Admin')`);
  await db.execute(sql`INSERT INTO users (id, email, role, first_name, last_name) VALUES (${travelerUser}, ${`f6-user-${RUN}@ci.test`}, 'traveler', 'F6', 'User')`);
  // ONE exception row carrying a late record, plus 51 bare exception rows for the page test.
  const withLate = uid();
  created.push(withLate);
  await db.execute(sql`
    INSERT INTO service_bookings (id, traveler_id, status, total_amount, booking_details, stripe_payment_intent_id)
    VALUES (${withLate}, ${travelerUser}, 'confirmed', 10,
      ${JSON.stringify({ reconciliationException: { paymentIntentId: `pi_${RUN}`, actor: "webhook", reason: "t", status: "payment_pending" }, lateFailureIgnored: [{ eventId: `evt_${RUN}`, eventType: "payment_intent.payment_failed", stripeCreated: "2026-11-19T09:00:00.000Z" }] })}::jsonb,
      ${`pi_${RUN}`})
  `);
  for (let i = 0; i < 51; i++) {
    const id = uid();
    created.push(id);
    await db.execute(sql`
      INSERT INTO service_bookings (id, traveler_id, status, total_amount, booking_details)
      VALUES (${id}, ${travelerUser}, 'payment_pending', 10,
        ${JSON.stringify({ reconciliationException: { paymentIntentId: `pi_${RUN}_${i}`, actor: "webhook", reason: "t", status: "payment_pending" } })}::jsonb)
    `);
  }
  const booted = await boot("admin");
  server = booted.s; base = booted.base;
});

after(async () => {
  server?.close?.();
  for (const id of created) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${adminUser}, ${travelerUser})`);
});

test("F6.6 reconciliation-exceptions returns lateFailureIgnored; stuck-pending has no such key", async () => {
  const recon = await (await fetch(`${base}/api/admin/bookings/reconciliation-exceptions`)).json() as any;
  assert.ok(Array.isArray(recon.lateFailureIgnored), "the late list lives on the reconciliation surface");
  assert.ok(recon.lateFailureIgnored.some((r: any) => (r.records ?? []).some((x: any) => x.eventId === `evt_${RUN}`)));
  const stuck = await (await fetch(`${base}/api/admin/bookings/stuck-pending`)).json() as any;
  assert.equal(Object.prototype.hasOwnProperty.call(stuck, "lateFailureIgnored"), false, "stuck-pending must not carry it");
});

test("F6.7 51 exception rows: 50 returned, total 51, truncated true, offset=50 returns the last one", async () => {
  const first = await (await fetch(`${base}/api/admin/bookings/reconciliation-exceptions`)).json() as any;
  assert.equal(first.bookings.length, 50);
  assert.equal(first.total, 51);
  assert.equal(first.truncated, true);
  assert.equal(first.offset, 0);
  const rest = await (await fetch(`${base}/api/admin/bookings/reconciliation-exceptions?offset=50`)).json() as any;
  assert.equal(rest.bookings.length, 1);
  assert.equal(rest.truncated, false);
  assert.equal(rest.offset, 50);
});

test("F6.8 a non-admin is refused 403 on BOTH surfaces", async () => {
  const other = await boot("traveler");
  try {
    for (const path of ["/api/admin/bookings/reconciliation-exceptions", "/api/admin/bookings/stuck-pending"]) {
      const res = await fetch(`${other.base}${path}`);
      assert.equal(res.status, 403, `${path} refuses a non-admin`);
    }
  } finally {
    other.s.close();
  }
});
