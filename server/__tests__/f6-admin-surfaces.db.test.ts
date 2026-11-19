/**
 * F6 (#1823) + the F7 placement fix: the two admin surfaces, over HTTP against the REAL admin router.
 *
 * Mounted at the app root (`app.use(router)`), because the routes already carry their `/api/...` paths
 * (`server/routes.ts:1226`). The session is stubbed, as `f1-route-writes.db.test.ts` does; I did not use a ci-* login
 * because the harness has no running app in this step and the stub exercises the same handler and guards.
 *
 * Every response's status is asserted BEFORE its body is read, so a 401/403/404 reports itself instead of turning
 * into a confusing JSON error. Counts are RELATIVE: the total is read first, then N rows are added, then asserted.
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
const providerUser = uid();
const serviceId = uid();
const createdBookings: string[] = [];
let server: any;
let base = "";

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { /* refuse below */ }
  if (!DISPOSABLE.has(host)) throw new Error(`[f6-admin-surfaces] REFUSING to write to '${host}'.`);
}

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
  app.use(router); // the routes already carry /api/...
  const s = app.listen(0);
  await new Promise<void>((r) => s.once("listening", () => r()));
  const { port } = s.address() as AddressInfo;
  return { s, base: `http://127.0.0.1:${port}` };
}

async function getJson(path: string) {
  const res = await fetch(`${base}${path}`);
  assert.equal(res.status, 200, `${path} answers 200 (got ${res.status})`);
  return (await res.json()) as any;
}

async function insertException(withLate: boolean): Promise<string> {
  const id = uid();
  createdBookings.push(id);
  const details = withLate
    ? { reconciliationException: { paymentIntentId: `pi_${RUN}`, actor: "webhook", reason: "t", status: "payment_pending" },
        lateFailureIgnored: [{ eventId: `evt_${RUN}`, eventType: "payment_intent.payment_failed", stripeCreated: "2026-11-19T09:00:00.000Z" }] }
    : { reconciliationException: { paymentIntentId: `pi_${RUN}_${id.slice(0, 6)}`, actor: "webhook", reason: "t", status: "payment_pending" } };
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, status, total_amount, booking_details)
    VALUES (${id}, ${serviceId}, ${travelerUser}, ${providerUser}, 'payment_pending', 10, ${JSON.stringify(details)}::jsonb)
  `);
  return id;
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, role, first_name, last_name) VALUES (${adminUser}, ${`f6-admin-${RUN}@ci.test`}, 'admin', 'F6', 'Admin')`);
  await db.execute(sql`INSERT INTO users (id, email, role, first_name, last_name) VALUES (${travelerUser}, ${`f6-user-${RUN}@ci.test`}, 'traveler', 'F6', 'User')`);
  await db.execute(sql`INSERT INTO users (id, email, role, first_name, last_name) VALUES (${providerUser}, ${`f6-provider-${RUN}@ci.test`}, 'provider', 'F6', 'Provider')`);
  // service_bookings.service_id and provider_id are NOT NULL with FKs.
  // `provider_services` keys its owner as `user_id` (`shared/schema.ts:1281`), not `provider_id`.
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name)
    VALUES (${serviceId}, ${providerUser}, ${"F6 fixture " + RUN})
  `);
  const booted = await boot("admin");
  server = booted.s; base = booted.base;
});

after(async () => {
  server?.close?.();
  for (const id of createdBookings) await db.execute(sql`DELETE FROM service_bookings WHERE id = ${id}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${adminUser}, ${travelerUser}, ${providerUser})`);
});

test("F6.6 reconciliation-exceptions carries lateFailureIgnored; stuck-pending does not", async () => {
  await insertException(true);
  const recon = await getJson("/api/admin/bookings/reconciliation-exceptions");
  assert.ok(Array.isArray(recon.lateFailureIgnored), "the late list lives on the reconciliation surface");
  assert.ok(recon.lateFailureIgnored.some((r: any) => (r.records ?? []).some((x: any) => x.eventId === `evt_${RUN}`)));
  const stuck = await getJson("/api/admin/bookings/stuck-pending");
  assert.equal(Object.prototype.hasOwnProperty.call(stuck, "lateFailureIgnored"), false, "stuck-pending must not carry it");
});

test("F6.7 pages do not hide rows: relative total, 50 per page, offset reaches the rest", async () => {
  const beforeTotal = (await getJson("/api/admin/bookings/reconciliation-exceptions")).total as number;
  const N = 51;
  for (let i = 0; i < N; i++) await insertException(false);
  const first = await getJson("/api/admin/bookings/reconciliation-exceptions");
  assert.equal(first.total, beforeTotal + N, "total counts every exception row");
  assert.equal(first.bookings.length, Math.min(50, beforeTotal + N));
  if (beforeTotal + N > 50) {
    assert.equal(first.truncated, true);
    const lastOffset = Math.max(0, beforeTotal + N - 1);
    const rest = await getJson(`/api/admin/bookings/reconciliation-exceptions?offset=${lastOffset}`);
    assert.equal(rest.bookings.length, 1, "the last row is reachable by offset");
    assert.equal(rest.truncated, false);
    assert.equal(rest.offset, lastOffset);
  }
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

test("F6.9 stuck-pending answers 200 for an admin with a fixture row (the 500 F7 shipped)", async () => {
  // F7's `late` query UNIONed `bookings.id` (uuid) with `service_bookings.id` (varchar) INSIDE this handler, so the
  // route answered 500 for every admin. This PR moved the late list out and casts the UNION; this case is the proof.
  await insertException(false); // at least one fixture row exists for the surface to read
  const res = await fetch(`${base}/api/admin/bookings/stuck-pending`);
  assert.equal(res.status, 200, "stuck-pending answers 200, not 500");
  const body = (await res.json()) as any;
  assert.equal(Object.prototype.hasOwnProperty.call(body, "lateFailureIgnored"), false, "and carries no late list");
});
