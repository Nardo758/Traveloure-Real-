/**
 * CN-1d concierge engagement lifecycle.
 *
 * A concierge checkout captures immediately. Decline and the accept-window
 * timeout refund that charge through the existing owner-decline path
 * (`refund-sb-<bookingId>-<cents>`). They do not cancel a hold and they do
 * not add a concierge-* key.
 *
 * Run: npx tsx --test server/__tests__/cn1d-concierge-engagement.db.test.ts
 */
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_key_for_cn1d_suite";
process.env.SESSION_SECRET ||= "cn1d-test-session-secret";

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { sql } from "drizzle-orm";
import { conciergeAccessUntil } from "@shared/concierge-access";
import { db } from "../db";
import { isTripAdvisor } from "../utils/trip-advisor";
import { grantConciergeAdvisorOnAccept } from "../services/concierge-engagement.service";
import { upsertTripAdvisorRow } from "../services/booking-actions.service";
import { applyOwnerDecline } from "../services/booking-owner-decline.service";
import { runConciergeAcceptTimeout, conciergeAcceptHours } from "../services/concierge-accept-timeout.service";
import { declineHandoff, withdrawHandoff } from "../services/handoff.service";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATION = path.join(ROOT, "server/migrations/429_concierge_engagement_access.sql");
const RUN = crypto.randomUUID().slice(0, 8);
const traveler = `cn1d-${RUN}-trav`;
const expert = `cn1d-${RUN}-exp`;
const tripDst = `cn1d-${RUN}-dst`;
const tripHandoff = `cn1d-${RUN}-ho`;
const serviceId = `cn1d-${RUN}-svc`;

const probe = new Stripe("sk_test_dummy");
const refundsProto = Object.getPrototypeOf(probe.refunds);
const piProto = Object.getPrototypeOf(probe.paymentIntents);
const originalRefundCreate = refundsProto.create;
const originalRetrieve = piProto.retrieve;
const refundKeys: string[] = [];
const cancelKeys: string[] = [];

function stubStripeSucceeded() {
  refundKeys.length = 0;
  cancelKeys.length = 0;
  piProto.retrieve = async () => ({ status: "succeeded", id: "pi_cn1d" });
  piProto.cancel = async (_id: string, _body: unknown, opts?: { idempotencyKey?: string }) => {
    cancelKeys.push(opts?.idempotencyKey ?? "");
    return { status: "canceled", id: "pi_cn1d" };
  };
  refundsProto.create = async (_body: unknown, opts?: { idempotencyKey?: string }) => {
    refundKeys.push(opts?.idempotencyKey ?? "");
    return { id: `re_${crypto.randomUUID().slice(0, 8)}`, status: "succeeded", amount: 8000 };
  };
}

describe("access window", () => {
  test("end of the last day follows the trip zone across the fall-back and the spring-forward", () => {
    const fallBack = conciergeAccessUntil("2026-11-01", "America/New_York");
    assert.equal(fallBack?.toISOString(), "2026-11-02T05:00:00.000Z");
    const spring = conciergeAccessUntil("2026-03-08", "America/New_York");
    assert.equal(spring?.toISOString(), "2026-03-09T04:00:00.000Z");
    assert.equal(conciergeAccessUntil("2026-11-01", null)?.toISOString(), "2026-11-02T00:00:00.000Z");
    assert.equal(conciergeAccessUntil("not-a-day", "America/New_York"), null);
  });

  test("the accept window defaults to 48 hours", () => {
    assert.equal(conciergeAcceptHours({} as NodeJS.ProcessEnv), 48);
    assert.equal(conciergeAcceptHours({ CONCIERGE_ACCEPT_HOURS: "48" } as NodeJS.ProcessEnv), 48);
    assert.equal(conciergeAcceptHours({ CONCIERGE_ACCEPT_HOURS: "0" } as NodeJS.ProcessEnv), 48);
  });
});

describe("migration 429", () => {
  test("SQL has no column DEFAULT and backfills source to handoff", () => {
    const text = fs.readFileSync(MIGRATION, "utf8");
    assert.match(text, /ADD COLUMN IF NOT EXISTS source text/);
    assert.match(text, /ADD COLUMN IF NOT EXISTS access_until timestamptz/);
    assert.match(text, /SET source = 'handoff'/);
    assert.match(text, /WHERE source IS NULL/);
    const executable = text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    assert.doesNotMatch(executable, /DEFAULT/i);
    assert.doesNotMatch(executable, /\bCHECK\b/i);
    assert.doesNotMatch(text, /concierge-/);
  });
});

before(async () => {
  const { runMigrations } = await import("../migrations/run-migrations");
  await runMigrations();
  stubStripeSucceeded();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, handle) VALUES
      (${traveler}, ${`${traveler}@t.test`}, 'Cn', 'Traveler', 'traveler', ${`t${RUN}`}),
      (${expert}, ${`${expert}@t.test`}, 'Cn', 'Expert', 'local_expert', ${`e${RUN}`})
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms
      (id, user_id, first_name, status, identity_verification_status, stripe_connect_status, city, destinations)
    VALUES (${crypto.randomUUID()}, ${expert}, 'Cn', 'approved', 'verified', 'complete', 'Kyoto', '[]'::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone) VALUES
      (${tripDst}, ${traveler}, 'DST', 'Kyoto', '2026-10-30', '2026-11-01', 'America/New_York'),
      (${tripHandoff}, ${traveler}, 'Handoff', 'Kyoto', '2027-06-01', '2027-06-03', 'America/New_York')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, service_type, status, approval_status, delivery_method)
    VALUES (${serviceId}, ${expert}, 'Local concierge', '80.00', 'concierge', 'active', 'approved', 'async_messaging')
  `);
});

after(async () => {
  refundsProto.create = originalRefundCreate;
  piProto.retrieve = originalRetrieve;
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${traveler}, ${expert})`).catch(() => {});
  await db.execute(sql`DELETE FROM refunds WHERE stripe_payment_intent_id LIKE 'pi_cn1d%'`).catch(() => {});
  await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${traveler}`);
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id IN (${tripDst}, ${tripHandoff})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${serviceId}`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${tripDst}, ${tripHandoff})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${traveler}, ${expert})`);
});

async function advisor(tripId: string) {
  const r = await db.execute(sql`
    SELECT status, source, access_until FROM trip_expert_advisors
    WHERE trip_id = ${tripId} AND local_expert_id = ${expert}
  `);
  return r.rows[0] as { status: string; source: string | null; access_until: Date | null } | undefined;
}

async function booking(opts: { id: string; tripId: string; status: string; ageHours: number; pi: string | null }) {
  await db.execute(sql`
    INSERT INTO service_bookings
      (id, service_id, traveler_id, provider_id, trip_id, booking_details, total_amount,
       platform_fee, insurance_fee, provider_earnings, status, stripe_payment_intent_id, created_at)
    VALUES
      (${opts.id}, ${serviceId}, ${traveler}, ${expert}, ${opts.tripId}, '{}'::jsonb, '80.00',
       '0.00', '0.00', '80.00', ${opts.status}, ${opts.pi},
       NOW() - (${String(opts.ageHours)} || ' hours')::interval)
  `);
}

test("accept sets source concierge and access_until at the end of the last day", async () => {
  await grantConciergeAdvisorOnAccept({
    tripId: tripDst,
    localExpertId: expert,
    endDate: "2026-11-01",
    timezone: "America/New_York",
  });
  const row = await advisor(tripDst);
  assert.equal(row?.status, "accepted");
  assert.equal(row?.source, "concierge");
  assert.equal(new Date(row!.access_until!).toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(await isTripAdvisor(tripDst, expert), true);
});

test("a handoff pending row then a concierge accept keeps concierge access", async () => {
  await upsertTripAdvisorRow({
    tripId: tripHandoff,
    localExpertId: expert,
    status: "pending",
    source: "handoff",
  });
  let row = await advisor(tripHandoff);
  assert.equal(row?.status, "pending");
  assert.equal(row?.source, "handoff");
  assert.equal(row?.access_until, null);
  await grantConciergeAdvisorOnAccept({
    tripId: tripHandoff,
    localExpertId: expert,
    endDate: "2027-06-03",
    timezone: "America/New_York",
  });
  row = await advisor(tripHandoff);
  assert.equal(row?.status, "accepted");
  assert.equal(row?.source, "concierge");
  assert.ok(row?.access_until);
  await upsertTripAdvisorRow({
    tripId: tripHandoff,
    localExpertId: expert,
    status: "pending",
    source: "handoff",
  });
  row = await advisor(tripHandoff);
  assert.equal(row?.status, "accepted");
  assert.equal(row?.source, "concierge");
});

test("access is denied once now is past access_until, and NULL does not expire", async () => {
  await db.execute(sql`
    UPDATE trip_expert_advisors SET access_until = NOW() - INTERVAL '1 hour'
    WHERE trip_id = ${tripDst} AND local_expert_id = ${expert}
  `);
  assert.equal(await isTripAdvisor(tripDst, expert), false);
  await db.execute(sql`
    UPDATE trip_expert_advisors SET access_until = NULL
    WHERE trip_id = ${tripDst} AND local_expert_id = ${expert}
  `);
  assert.equal(await isTripAdvisor(tripDst, expert), true);
  await db.execute(sql`
    UPDATE trip_expert_advisors SET access_until = NOW() + INTERVAL '2 days', source = 'concierge'
    WHERE trip_id = ${tripDst} AND local_expert_id = ${expert}
  `);
});

test("decline sets access_until to now and refunds with the existing key", async () => {
  const id = crypto.randomUUID();
  await booking({ id, tripId: tripDst, status: "pending", ageHours: 1, pi: `pi_cn1d_${id.slice(0, 8)}` });
  const before = new Date();
  const outcome = await applyOwnerDecline({
    booking: await (await import("../storage")).storage.getServiceBooking(id),
    bookingId: id,
    reason: null,
    actorUserId: expert,
    role: "provider",
  });
  assert.equal(outcome.status, 200);
  assert.deepEqual(cancelKeys, []);
  assert.deepEqual(refundKeys, [`refund-sb-${id}-8000`]);
  const stored = await db.execute(sql`SELECT status FROM service_bookings WHERE id = ${id}`);
  assert.equal((stored.rows[0] as { status: string }).status, "refunded");
  const row = await advisor(tripDst);
  assert.equal(row?.source, "concierge");
  const until = new Date(row!.access_until!).getTime();
  assert.ok(until >= before.getTime() - 2000);
  assert.ok(until <= Date.now() + 2000);
  assert.equal(await isTripAdvisor(tripDst, expert), false);
});

test("the timeout refunds an unaccepted concierge booking and reuses booking_cancelled", async () => {
  const oldId = crypto.randomUUID();
  const youngId = crypto.randomUUID();
  await booking({ id: oldId, tripId: tripDst, status: "pending", ageHours: 49, pi: `pi_cn1d_${oldId.slice(0, 8)}` });
  await booking({ id: youngId, tripId: tripDst, status: "pending", ageHours: 1, pi: `pi_cn1d_${youngId.slice(0, 8)}` });
  await db.execute(sql`
    UPDATE trip_expert_advisors SET access_until = NOW() + INTERVAL '10 days', source = 'concierge', status = 'accepted'
    WHERE trip_id = ${tripDst} AND local_expert_id = ${expert}
  `);
  refundKeys.length = 0;
  const result = await runConciergeAcceptTimeout(new Date());
  assert.equal(result.declined, 1);
  assert.equal(result.errors, 0);
  assert.deepEqual(refundKeys, [`refund-sb-${oldId}-8000`]);
  const rows = await db.execute(sql`SELECT id, status FROM service_bookings WHERE id IN (${oldId}, ${youngId})`);
  const byId = new Map((rows.rows as { id: string; status: string }[]).map((r) => [r.id, r.status]));
  assert.equal(byId.get(oldId), "refunded");
  assert.equal(byId.get(youngId), "pending");
  const note = await db.execute(sql`
    SELECT type, title FROM notifications
    WHERE user_id = ${traveler} AND related_id = ${oldId}
    ORDER BY created_at DESC LIMIT 1
  `);
  const n = note.rows[0] as { type: string; title: string };
  assert.equal(n.type, "booking_cancelled");
  assert.equal(n.title, "Booking cancelled by provider — full refund issued");
  assert.equal(await isTripAdvisor(tripDst, expert), false);
});

test("handoff decline and withdraw do not end an accepted concierge row", async () => {
  await grantConciergeAdvisorOnAccept({
    tripId: tripHandoff,
    localExpertId: expert,
    endDate: "2027-06-03",
    timezone: "America/New_York",
  });
  const before = await advisor(tripHandoff);
  const declineId = crypto.randomUUID();
  const withdrawId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO expert_requests (id, user_id, trip_id, status, assigned_expert_id, handoff_kind)
    VALUES
      (${declineId}, ${traveler}, ${tripHandoff}, 'proposed', ${expert}, 'polish'),
      (${withdrawId}, ${traveler}, ${tripHandoff}, 'proposed', ${expert}, 'polish')
  `);
  const declined = await declineHandoff(declineId, expert);
  assert.equal(declined.ok, true);
  const withdrawn = await withdrawHandoff(withdrawId, traveler);
  assert.equal(withdrawn.ok, true);
  const after = await advisor(tripHandoff);
  assert.equal(after?.status, "accepted");
  assert.equal(after?.source, "concierge");
  assert.equal(new Date(after!.access_until!).toISOString(), new Date(before!.access_until!).toISOString());
  assert.equal(await isTripAdvisor(tripHandoff, expert), true);
});

test("the migration backfill sets a null source to handoff", async () => {
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, workspace_status, source)
    VALUES (${id}, ${tripDst}, ${traveler}, 'pending', 'draft', NULL)
  `);
  await db.execute(sql`UPDATE trip_expert_advisors SET source = 'handoff' WHERE source IS NULL`);
  const r = await db.execute(sql`SELECT source FROM trip_expert_advisors WHERE id = ${id}`);
  assert.equal((r.rows[0] as { source: string }).source, "handoff");
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE id = ${id}`);
});
