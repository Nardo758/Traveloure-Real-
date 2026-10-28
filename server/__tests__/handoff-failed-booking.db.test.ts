/**
 * Row 268: an accepted handoff that ends without a fulfilled booking.
 * Captured fee refunded in full, uncaptured hold released by the existing cancel,
 * one ops alert, and a read-only admin list. The fulfilment deadline reads
 * HANDOFF_FULFILMENT_HOURS at call time; this file sets that env itself.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/handoff-failed-booking.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  HANDOFF_FAILED_BOOKING_TRAVELER_COPY,
  HANDOFF_HOLD_TRAVELER_COPY,
  HANDOFF_LIVE_STATUSES,
  HANDOFF_STATUSES,
  handoffBannerState,
  withdrawalStage,
} from "@shared/handoff";
import { handoffFulfilmentHours, handoffFulfilmentSince } from "../config/handoff.config";
import { staffMayPassBlanketGuard } from "@shared/staff-permissions";
import { insertRoutableExpertForm } from "./helpers/routable-expert";

process.env.STRIPE_SECRET_KEY ||= "sk_test_handoff_failed_booking";
const savedFulfilment = process.env.HANDOFF_FULFILMENT_HOURS;
const savedSince = process.env.HANDOFF_FULFILMENT_SINCE;
delete process.env.HANDOFF_FULFILMENT_HOURS;
delete process.env.HANDOFF_FULFILMENT_SINCE;

const handoff = await import("../services/handoff.service");
const handoffRoutes = (await import("../routes/handoff.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `fb-${RUN}-owner`,
  expert: `fb-${RUN}-expert`,
  other: `fb-${RUN}-other`,
  admin: `fb-${RUN}-admin`,
};

const REFUNDED = `${HANDOFF_FAILED_BOOKING_TRAVELER_COPY.refunded} ${HANDOFF_FAILED_BOOKING_TRAVELER_COPY.chooseAnother}`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[handoff-failed-booking] REFUSING to write fixtures to '${host}'.`);
}

type RefundMode = "succeeded" | "throw" | "pending" | "failed";
let refundMode: RefundMode = "succeeded";
type CancelMode = "ok" | "fail";
let cancelMode: CancelMode = "ok";
type CaptureMode = "ok" | "race";
let captureMode: CaptureMode = "ok";
let retrieveMode: "stored" | "succeeded" | "pending" = "stored";
const calls = {
  cancel: [] as string[],
  capture: [] as string[],
  retrieveRefund: [] as string[],
  refund: [] as { key: string; amount: number; reason: string; priorMessages: string[] }[],
};
const refundsById = new Map<string, { id: string; status: string }>();
const intents = new Map<string, { amount: number; status: string; metadata: Record<string, string> }>();

handoff.__setHandoffPaymentsForTest({
  async authorize(i) {
    const id = `pi_${i.idempotencyKey}`;
    if (!intents.has(id)) intents.set(id, { amount: i.amountCents, status: "requires_payment_method", metadata: { type: "expert_handoff" } });
    return { clientSecret: `${id}_secret`, paymentIntentId: id, amountCents: i.amountCents };
  },
  async retrieve(id) {
    const pi = intents.get(id)!;
    return {
      id,
      status: pi.status,
      amountCents: pi.amount,
      amountCapturableCents: pi.status === "requires_capture" ? pi.amount : 0,
      metadata: pi.metadata,
    };
  },
  async capture(id, key) {
    calls.capture.push(key);
    if (captureMode === "race") {
      await db.execute(sql`
        UPDATE expert_requests
        SET status = 'booking_failed',
            optimization_context = COALESCE(optimization_context, '{}'::jsonb) || jsonb_build_object(
              'bookingFailure', jsonb_build_object('at', ${new Date().toISOString()}::text, 'kind', 'expert_withdrew'::text, 'by', ${ids.expert}::text)
            )
        WHERE payment_intent_id = ${id} AND status = 'accepted'
      `);
    }
    intents.get(id)!.status = "succeeded";
    return { id, status: "succeeded", amountReceivedCents: intents.get(id)!.amount };
  },
  async cancel(id, key) {
    calls.cancel.push(key);
    if (cancelMode === "fail") throw new Error("stripe cancel failed");
    intents.get(id)!.status = "canceled";
    return { id, status: "canceled" };
  },
  async refund(i) {
    const requestId = i.idempotencyKey.replace(/^handoff-failed-booking-refund-/, "");
    const priorMessages = await messages(requestId);
    calls.refund.push({ key: i.idempotencyKey, amount: i.amountCents, reason: i.auditReason, priorMessages });
    if (refundMode === "throw") throw new Error("stripe refund failed");
    const status = refundMode === "pending" ? "pending" : refundMode === "failed" ? "failed" : "succeeded";
    const stored = { id: `re_${i.idempotencyKey}`, status };
    refundsById.set(stored.id, stored);
    return stored;
  },
  async retrieveRefund(id) {
    calls.retrieveRefund.push(id);
    if (retrieveMode === "succeeded") return { id, status: "succeeded" };
    if (retrieveMode === "pending") return { id, status: "pending" };
    return refundsById.get(id) ?? { id, status: "pending" };
  },
});

const trips: string[] = [];

async function messages(requestId: string): Promise<string[]> {
  const r = await db.execute(sql`
    SELECT message FROM notifications
    WHERE user_id = ${ids.owner} AND data->>'requestId' = ${requestId}
    ORDER BY created_at
  `);
  return (r.rows ?? []).map((row) => String((row as { message: string }).message));
}

async function notes(requestId: string): Promise<{ title: string; message: string }[]> {
  const r = await db.execute(sql`
    SELECT title, message FROM notifications
    WHERE user_id = ${ids.owner} AND data->>'requestId' = ${requestId}
    ORDER BY created_at
  `);
  return (r.rows ?? []) as { title: string; message: string }[];
}

async function alertCount(requestId: string, type = "handoff_booking_failed"): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM admin_notifications
    WHERE type = ${type} AND metadata->>'requestId' = ${requestId}
  `);
  return Number((r.rows?.[0] as { n: number } | undefined)?.n ?? 0);
}

function countMessage(list: string[], exact: string): number {
  return list.filter((m) => m === exact).length;
}

async function makeTrip(suffix: string): Promise<{ trip: string; item: string }> {
  const trip = `fb-${RUN}-${suffix}`;
  const item = `${trip}-i`;
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${trip}, ${ids.owner}, 'Failed booking', 'Kyoto, Japan', '2027-06-01', '2027-06-03')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status, estimated_cost)
    VALUES (${item}, ${trip}, 'Nishiki', 1, 0, 'in_planning', 80)`);
  trips.push(trip);
  return { trip, item };
}

async function proposed(suffix: string): Promise<{ trip: string; item: string; id: string }> {
  const { trip, item } = await makeTrip(suffix);
  const ask = await handoff.askHandoff({ tripId: trip, userId: ids.owner, kind: "polish", itemIds: [item] });
  assert.ok(ask.ok, JSON.stringify(ask));
  const id = ask.request.id;
  intents.get(ask.request.paymentIntentId!)!.status = "requires_capture";
  const confirmed = await handoff.confirmHandoffAuthorization(id, ids.owner);
  assert.ok(confirmed.ok, JSON.stringify(confirmed));
  const assigned = await handoff.adminAssignHandoff(id, ids.expert);
  assert.ok(assigned.ok, JSON.stringify(assigned));
  return { trip, item, id };
}

async function acceptedCaptured(suffix: string): Promise<{ trip: string; item: string; id: string; fee: number; travelerFee: number; pi: string }> {
  const { trip, item, id } = await proposed(suffix);
  const accepted = await handoff.acceptHandoff(id, ids.expert);
  assert.ok(accepted.ok, JSON.stringify(accepted));
  const row = accepted.request;
  const fee = row.feeCents ?? 0;
  const travelerFee = row.travelerFeeCents ?? 0;
  assert.ok(fee + travelerFee > 0, "the fixture needs a captured total");
  assert.ok(row.capturedAt, "accept captures");
  assert.ok(row.paymentIntentId);
  return { trip, item, id, fee, travelerFee, pi: row.paymentIntentId };
}

function failureOf(row: { optimizationContext: unknown } | null): { kind?: string; by?: string; refundAttempts?: number; nextRefundAt?: string; refundStatus?: string } | null {
  return ((row?.optimizationContext as { bookingFailure?: { kind?: string; by?: string; refundAttempts?: number; nextRefundAt?: string } } | null)?.bookingFailure) ?? null;
}

async function call(userId: string | null, method: string, url: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { claims: { sub: userId } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  // The production 403 is adminApiGuard, mounted on /api/admin before this router.
  // This repeats that guard's decision (DB role + staffMayPassBlanketGuard) so the
  // list route can be exercised without booting every other router.
  app.use("/api/admin", async (req: any, res, next) => {
    if (typeof req.isAuthenticated !== "function" || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const uid = req.user?.claims?.sub as string | undefined;
    const found = uid
      ? await db.execute(sql`SELECT role FROM users WHERE id = ${uid} LIMIT 1`)
      : { rows: [] as unknown[] };
    const role = (found.rows?.[0] as { role?: string } | undefined)?.role;
    if (!staffMayPassBlanketGuard(role, req.method, req.originalUrl || req.path)) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  });
  app.use(handoffRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES
    (${ids.owner}, ${`${ids.owner}@t.test`}, 'Fa', 'Owner'),
    (${ids.expert}, ${`${ids.expert}@t.test`}, 'Fa', 'Expert'),
    (${ids.other}, ${`${ids.other}@t.test`}, 'Fa', 'Other'),
    (${ids.admin}, ${`${ids.admin}@t.test`}, 'Fa', 'Admin')`);
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${ids.admin}`);
  await insertRoutableExpertForm(ids.expert);
});

after(async () => {
  if (savedFulfilment === undefined) delete process.env.HANDOFF_FULFILMENT_HOURS;
  else process.env.HANDOFF_FULFILMENT_HOURS = savedFulfilment;
  if (savedSince === undefined) delete process.env.HANDOFF_FULFILMENT_SINCE;
  else process.env.HANDOFF_FULFILMENT_SINCE = savedSince;
  handoff.__setHandoffTimerRowHookForTest(null);
  if (trips.length) {
    const tripList = sql.join(trips.map((t) => sql`${t}`), sql`, `);
    const pis = (await db.execute(sql`SELECT payment_intent_id FROM expert_requests WHERE trip_id IN (${tripList}) AND payment_intent_id IS NOT NULL`)).rows?.map((r) => (r as { payment_intent_id: string }).payment_intent_id) ?? [];
    await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${ids.owner}, ${ids.expert}, ${ids.other}, ${ids.admin})`);
    await db.execute(sql`DELETE FROM admin_notifications WHERE metadata->>'requestId' IN (
      SELECT id::text FROM expert_requests WHERE trip_id IN (${tripList})
    )`).catch(() => {});
    if (pis.length) {
      const piList = sql.join(pis.map((p) => sql`${p}`), sql`, `);
      await db.execute(sql`DELETE FROM platform_revenue WHERE source_id IN (${piList})`).catch(() => {});
      await db.execute(sql`DELETE FROM fee_ledger WHERE source_id IN (${piList})`).catch(() => {});
      await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id IN (${piList})`).catch(() => {});
    }
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${tripList})`);
    await db.execute(sql`DELETE FROM expert_requests WHERE trip_id IN (${tripList})`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${tripList})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${tripList})`);
  }
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${ids.expert}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert}, ${ids.other}, ${ids.admin})`);
  handoff.__setHandoffPaymentsForTest(null);
});

test("F1: expert withdrew refunds the captured total in full and tells the traveler after", async () => {
  refundMode = "succeeded";
  cancelMode = "ok";
  const { trip, item, id, fee, travelerFee, pi } = await acceptedCaptured("f1");
  const refundsBefore = calls.refund.length;
  const res = await call(ids.expert, "POST", `/api/handoffs/${id}/cannot-book`, { reason: "withdrew" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.handoff.status, "booking_failed");

  const row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "booking_failed");
  assert.equal(row.refundId, `re_handoff-failed-booking-refund-${id}`);
  assert.equal(row.withdrawalFeeCents ?? 0, 0);
  const meta = failureOf(row);
  assert.equal(meta?.kind, "expert_withdrew");
  assert.equal(meta?.by, ids.expert);
  assert.equal(calls.refund.length, refundsBefore + 1);
  const refund = calls.refund[calls.refund.length - 1];
  assert.equal(refund.key, `handoff-failed-booking-refund-${id}`);
  assert.equal(refund.amount, fee + travelerFee);
  assert.equal(refund.reason, "handoff_failed_booking_polish");
  assert.equal(refund.priorMessages.includes(REFUNDED), false, "the line is not sent before the refund resolves");

  const sent = await notes(id);
  assert.equal(countMessage(sent.map((n) => n.message), REFUNDED), 1);
  assert.equal(sent.filter((n) => n.message === REFUNDED).every((n) => n.title === HANDOFF_FAILED_BOOKING_TRAVELER_COPY.title), true);
  assert.equal(countMessage(sent.map((n) => n.message), HANDOFF_FAILED_BOOKING_TRAVELER_COPY.checkingPayment), 0);

  const revenue = await db.execute(sql`
    SELECT gross_amount, platform_fee, net_amount FROM platform_revenue
    WHERE source_id = ${pi} AND source_type = 'expert_review_fee' AND expert_id IS NULL
  `);
  assert.ok((revenue.rows ?? []).length >= 1, "accept recorded the fee");
  for (const rev of revenue.rows ?? []) {
    const r = rev as { gross_amount: string; platform_fee: string; net_amount: string };
    assert.equal(Number(r.gross_amount), 0);
    assert.equal(Number(r.platform_fee), 0);
    assert.equal(Number(r.net_amount), 0);
  }
  const itemRow = await db.execute(sql`SELECT routing_status FROM itinerary_items WHERE id = ${item}`);
  assert.equal((itemRow.rows?.[0] as { routing_status: string }).routing_status, "in_planning");
  const advisor = await db.execute(sql`
    SELECT status FROM trip_expert_advisors WHERE trip_id = ${trip} AND local_expert_id = ${ids.expert}
  `);
  assert.equal((advisor.rows?.[0] as { status: string }).status, "rejected");
  assert.equal(await alertCount(id), 1);

  const again = await call(ids.expert, "POST", `/api/handoffs/${id}/cannot-book`, { reason: "withdrew" });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(calls.refund.length, refundsBefore + 1, "a replay with a refund id does not refund again");
  assert.equal(await alertCount(id), 1);
  assert.equal(countMessage(await messages(id), REFUNDED), 1);
});

test("F2: expert unbookable records the reason and refunds the same way", async () => {
  refundMode = "succeeded";
  const { id, fee, travelerFee } = await acceptedCaptured("f2");
  const out = await handoff.failHandoffBooking(id, { kind: "expert_unbookable", expertId: ids.expert });
  assert.equal(out.ok, true);
  const row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "booking_failed");
  assert.equal(failureOf(row)?.kind, "expert_unbookable");
  const refund = calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${id}`);
  assert.equal(refund.length, 1);
  assert.equal(refund[0].amount, fee + travelerFee);
  assert.equal(countMessage(await messages(id), REFUNDED), 1);
  assert.equal(await alertCount(id), 1);
});

test("F3: a thrown refund sends the fallback once; the timer re-drives; pending never sends line 1", async () => {
  refundMode = "throw";
  cancelMode = "ok";
  const { id } = await acceptedCaptured("f3");
  const failed = await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(failed.ok, true);
  let row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "booking_failed");
  assert.equal(row.refundId, null);
  assert.equal(failureOf(row)?.refundAttempts, 1);
  assert.ok(failureOf(row)?.nextRefundAt);
  assert.equal(countMessage(await messages(id), HANDOFF_FAILED_BOOKING_TRAVELER_COPY.checkingPayment), 1);
  assert.equal(countMessage(await messages(id), REFUNDED), 0);
  assert.equal((await notes(id)).find((n) => n.message === HANDOFF_FAILED_BOOKING_TRAVELER_COPY.checkingPayment)?.title, HANDOFF_FAILED_BOOKING_TRAVELER_COPY.title);

  const thrown = calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${id}`).length;
  const early = new Date(Date.parse(failureOf(row)!.nextRefundAt!) - 60_000);
  await handoff.runHandoffTimers(early);
  assert.equal(calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${id}`).length, thrown);

  refundMode = "succeeded";
  await handoff.runHandoffTimers(new Date(failureOf(row)!.nextRefundAt!));
  row = (await handoff.getHandoff(id))!;
  assert.equal(row.refundId, `re_handoff-failed-booking-refund-${id}`);
  const succeeded = calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${id}`);
  assert.equal(succeeded.length, thrown + 1);
  assert.equal(succeeded[succeeded.length - 1].key, `handoff-failed-booking-refund-${id}`);
  assert.equal(countMessage(await messages(id), REFUNDED), 1);
  assert.equal(countMessage(await messages(id), HANDOFF_FAILED_BOOKING_TRAVELER_COPY.checkingPayment), 1);
  assert.equal(await alertCount(id), 1);

  refundMode = "pending";
  const pending = await acceptedCaptured("f3p");
  const pendingOut = await handoff.failHandoffBooking(pending.id, { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(pendingOut.ok, true);
  const pendingRow = (await handoff.getHandoff(pending.id))!;
  assert.equal(pendingRow.refundId, `re_handoff-failed-booking-refund-${pending.id}`);
  assert.equal(failureOf(pendingRow)?.refundStatus, "pending");
  assert.equal(countMessage(await messages(pending.id), HANDOFF_FAILED_BOOKING_TRAVELER_COPY.checkingPayment), 1);
  assert.equal(countMessage(await messages(pending.id), REFUNDED), 0);
  const pendingCalls = calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${pending.id}`).length;
  const retrievesBefore = calls.retrieveRefund.length;
  retrieveMode = "pending";
  const pendingNext = failureOf(pendingRow)?.nextRefundAt;
  assert.ok(pendingNext);
  await handoff.runHandoffTimers(new Date(pendingNext!));
  assert.equal(calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${pending.id}`).length, pendingCalls, "a pending id is retrieved, not created again");
  assert.ok(calls.retrieveRefund.length > retrievesBefore);
  assert.equal(countMessage(await messages(pending.id), REFUNDED), 0);
  retrieveMode = "succeeded";
  const afterPoll = failureOf(await handoff.getHandoff(pending.id))?.nextRefundAt;
  assert.ok(afterPoll);
  await handoff.runHandoffTimers(new Date(afterPoll!));
  assert.equal(countMessage(await messages(pending.id), REFUNDED), 1);
  assert.equal(countMessage(await messages(pending.id), HANDOFF_FAILED_BOOKING_TRAVELER_COPY.checkingPayment), 1);
  assert.equal(failureOf(await handoff.getHandoff(pending.id))?.refundStatus, "succeeded");
  assert.equal(calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${pending.id}`).length, pendingCalls);
  assert.equal(await alertCount(pending.id), 1);
  assert.equal(await alertCount(id, "handoff_hold_release_failed"), 0);
  retrieveMode = "stored";
});

test("F4: an uncaptured accept cancels the hold; a failed cancel retries on the existing rail", async () => {
  refundMode = "succeeded";
  cancelMode = "ok";
  const ok = await proposed("f4ok");
  await db.execute(sql`UPDATE expert_requests SET status = 'accepted', accepted_at = NOW() WHERE id = ${ok.id}`);
  const cancelsBefore = calls.cancel.length;
  const released = await handoff.failHandoffBooking(ok.id, { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(released.ok, true);
  const okRow = (await handoff.getHandoff(ok.id))!;
  assert.equal(okRow.status, "released");
  assert.equal(failureOf(okRow)?.kind, "expert_withdrew");
  assert.equal(calls.cancel.filter((k) => k === `handoff-release-${ok.id}`).length, 1);
  assert.equal(calls.cancel.length, cancelsBefore + 1);
  const okNotes = await notes(ok.id);
  assert.equal(countMessage(okNotes.map((n) => n.message), HANDOFF_HOLD_TRAVELER_COPY.nothingCharged), 1);
  assert.equal(countMessage(okNotes.map((n) => n.message), HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold), 0);
  assert.equal(okNotes.find((n) => n.message === HANDOFF_HOLD_TRAVELER_COPY.nothingCharged)?.title, "No local was free");
  assert.equal(countMessage(okNotes.map((n) => n.message), REFUNDED), 0);
  assert.equal(await alertCount(ok.id), 1);
  assert.equal(await alertCount(ok.id, "handoff_hold_release_failed"), 0);

  cancelMode = "fail";
  const stuck = await proposed("f4fail");
  await db.execute(sql`UPDATE expert_requests SET status = 'accepted', accepted_at = NOW() WHERE id = ${stuck.id}`);
  const first = await handoff.failHandoffBooking(stuck.id, { kind: "expert_unbookable", expertId: ids.expert });
  assert.equal(first.ok, true);
  assert.equal((await handoff.getHandoff(stuck.id))!.status, "release_pending");
  assert.ok(failureOf(await handoff.getHandoff(stuck.id)));
  assert.equal(countMessage(await messages(stuck.id), HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold), 1);
  assert.equal(countMessage(await messages(stuck.id), HANDOFF_HOLD_TRAVELER_COPY.nothingCharged), 0);
  const failCancels = calls.cancel.filter((k) => k === `handoff-release-${stuck.id}`).length;
  const nextAt = ((await handoff.getHandoff(stuck.id))!.optimizationContext as { holdRelease?: { nextAttemptAt?: string } }).holdRelease?.nextAttemptAt;
  assert.ok(nextAt);
  await handoff.runHandoffTimers(new Date(Date.parse(nextAt!) - 60_000));
  assert.equal(calls.cancel.filter((k) => k === `handoff-release-${stuck.id}`).length, failCancels);
  cancelMode = "ok";
  await handoff.runHandoffTimers(new Date(nextAt!));
  assert.equal((await handoff.getHandoff(stuck.id))!.status, "released");
  assert.equal(countMessage(await messages(stuck.id), HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold), 1);
  assert.equal(countMessage(await messages(stuck.id), HANDOFF_HOLD_TRAVELER_COPY.nothingCharged), 1);
  assert.equal(await alertCount(stuck.id), 1);
  assert.equal(await alertCount(stuck.id, "handoff_hold_release_failed"), 0);
  const capStillNamed = fs.readFileSync("server/services/handoff.service.ts", "utf8");
  assert.match(capStillNamed, /type: "handoff_hold_release_failed"/);
  assert.match(capStillNamed, /reason: "release_attempt_cap"/);
});

test("F5: a no-money accepted row fails with one alert and no Stripe call or traveler line", async () => {
  refundMode = "succeeded";
  cancelMode = "ok";
  const { id } = await proposed("f5");
  await db.execute(sql`
    UPDATE expert_requests
    SET status = 'accepted', accepted_at = NOW(), payment_intent_id = NULL, fee_cents = 0, traveler_fee_cents = 0, captured_at = NULL
    WHERE id = ${id}
  `);
  const refunds = calls.refund.length;
  const cancels = calls.cancel.length;
  const captures = calls.capture.length;
  const out = await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(out.ok, true);
  const row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "booking_failed");
  assert.equal(row.refundId, null);
  assert.equal(calls.refund.length, refunds);
  assert.equal(calls.cancel.length, cancels);
  assert.equal(calls.capture.length, captures);
  assert.deepEqual(await messages(id), []);
  assert.equal(await alertCount(id), 1);
  const alert = await db.execute(sql`
    SELECT metadata->>'state' AS state FROM admin_notifications
    WHERE type = 'handoff_booking_failed' AND metadata->>'requestId' = ${id}
  `);
  assert.equal((alert.rows?.[0] as { state: string }).state, "no_money");
});

test("F6: one handoff_booking_failed alert across a replay, and the cap alert type is a different row", async () => {
  refundMode = "succeeded";
  const { id } = await acceptedCaptured("f6");
  await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
  await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
  await handoff.runHandoffTimers(new Date(Date.now() + 72 * 3_600_000));
  assert.equal(await alertCount(id), 1);
  assert.equal(await alertCount(id, "handoff_hold_release_failed"), 0);
});

test("F7: refusals touch nothing; a non-admin is refused the list", async () => {
  refundMode = "succeeded";
  cancelMode = "ok";
  const missing = await handoff.failHandoffBooking(crypto.randomUUID(), { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 404);

  const { id } = await acceptedCaptured("f7");
  const before = JSON.stringify(await handoff.getHandoff(id));
  const refunds = calls.refund.length;
  const cancels = calls.cancel.length;
  const wrong = await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.other });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.status, 404);
  const wrongRoute = await call(ids.other, "POST", `/api/handoffs/${id}/cannot-book`, { reason: "withdrew" });
  assert.equal(wrongRoute.status, 404);
  const badBody = await call(ids.expert, "POST", `/api/handoffs/${id}/cannot-book`, { reason: "nope" });
  assert.equal(badBody.status, 400);
  assert.equal(calls.refund.length, refunds);
  assert.equal(calls.cancel.length, cancels);
  assert.equal(JSON.stringify(await handoff.getHandoff(id)), before);

  for (const status of ["proposed", "unmatched", "authorizing", "delivered", "approved", "withdrawn", "released"]) {
    await db.execute(sql`UPDATE expert_requests SET status = ${status} WHERE id = ${id}`);
    const snapshot = JSON.stringify(await handoff.getHandoff(id));
    const refused = await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
    assert.equal(refused.ok, false, status);
    if (!refused.ok) {
      assert.equal(refused.status, 409, status);
      assert.equal(refused.code, "wrong_status", status);
    }
    assert.equal(JSON.stringify(await handoff.getHandoff(id)), snapshot, status);
    assert.equal(calls.refund.length, refunds, status);
    assert.equal(calls.cancel.length, cancels, status);
  }

  await db.execute(sql`UPDATE expert_requests SET status = 'accepted', source_purchase_id = ${`pp-${RUN}`} WHERE id = ${id}`);
  const prepaidBefore = JSON.stringify(await handoff.getHandoff(id));
  const prepaid = await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(prepaid.ok, false);
  if (!prepaid.ok) {
    assert.equal(prepaid.status, 409);
    assert.equal(prepaid.code, "prepaid_not_supported");
  }
  assert.equal(JSON.stringify(await handoff.getHandoff(id)), prepaidBefore);
  assert.equal(calls.refund.length, refunds);

  await db.execute(sql`
    UPDATE expert_requests
    SET source_purchase_id = NULL, status = 'booking_failed', refund_id = 're_already',
        optimization_context = COALESCE(optimization_context, '{}'::jsonb) || jsonb_build_object(
          'bookingFailure', jsonb_build_object('refundStatus', 'succeeded'::text, 'kind', 'expert_withdrew'::text, 'by', ${ids.expert}::text, 'at', ${new Date().toISOString()}::text)
        )
    WHERE id = ${id}
  `);
  const stamped = calls.refund.length;
  const replay = await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(replay.ok, true);
  assert.equal((await handoff.getHandoff(id))!.refundId, "re_already");
  assert.equal(calls.refund.length, stamped);

  const forbidden = await call(ids.owner, "GET", "/api/admin/handoffs/failed-booking");
  assert.equal(forbidden.status, 403);
});

test("F8: the admin list shows failed bookings and skips a plain release_pending row", async () => {
  refundMode = "succeeded";
  cancelMode = "fail";
  const failed = await acceptedCaptured("f8a");
  await handoff.failHandoffBooking(failed.id, { kind: "expert_withdrew", expertId: ids.expert });
  const held = await proposed("f8b");
  await db.execute(sql`UPDATE expert_requests SET status = 'accepted', accepted_at = NOW() WHERE id = ${held.id}`);
  await handoff.failHandoffBooking(held.id, { kind: "expert_unbookable", expertId: ids.expert });
  assert.equal((await handoff.getHandoff(held.id))!.status, "release_pending");
  const plain = await proposed("f8c");
  await db.execute(sql`UPDATE expert_requests SET status = 'release_pending' WHERE id = ${plain.id}`);

  const res = await call(ids.admin, "GET", "/api/admin/handoffs/failed-booking");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const listed = (res.body.handoffs as { id: string; bookingFailure: unknown; holdReleaseAttempts: number | null }[]).map((h) => h.id);
  assert.ok(listed.includes(failed.id));
  assert.ok(listed.includes(held.id));
  assert.equal(listed.includes(plain.id), false);
  const heldRow = (res.body.handoffs as { id: string; bookingFailure: { kind?: string }; status: string }[]).find((h) => h.id === held.id);
  assert.equal(heldRow?.status, "release_pending");
  assert.equal(heldRow?.bookingFailure?.kind, "expert_unbookable");
  cancelMode = "ok";
});

test("F9: one Stripe call site each, no migration, status list and the banner string stay put", () => {
  function files(dir: string, out: string[] = []): string[] {
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules" || name === "__tests__" || name === "dist") continue;
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) files(p, out);
      else if (p.endsWith(".ts")) out.push(p);
    }
    return out;
  }
  function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }
  const serverCode = files("server").map((f) => code(fs.readFileSync(f, "utf8"))).join("\n");
  // Calls, not comments. `routes.ts` already has one `stripe.refunds.create(` beside the shared
  // site in stripe-payment.service.ts; this change adds none. Cancel and capture stay at one each.
  const count = (needle: string) => serverCode.split(needle).length - 1;
  assert.equal(count("stripe.refunds.create("), 2);
  assert.equal(count("stripe.paymentIntents.cancel("), 1);
  assert.equal(count("stripe.paymentIntents.capture("), 1);
  const handoffSrc = code(fs.readFileSync("server/services/handoff.service.ts", "utf8"));
  assert.equal(handoffSrc.includes("stripe.refunds.create"), false);
  assert.equal(handoffSrc.includes("stripe.paymentIntents.cancel"), false);
  assert.equal(handoffSrc.includes("stripe.paymentIntents.capture"), false);

  for (const name of fs.readdirSync("server/migrations")) {
    if (!name.endsWith(".sql")) continue;
    const text = fs.readFileSync(path.join("server/migrations", name), "utf8");
    assert.equal(text.includes("booking_failed"), false, name);
  }
  assert.ok(HANDOFF_STATUSES.includes("booking_failed"));
  assert.equal(HANDOFF_LIVE_STATUSES.includes("booking_failed" as never), false);
  assert.equal(withdrawalStage("booking_failed"), null);
  assert.equal(handoffBannerState({ status: "booking_failed" }), null);
  const client = fs.readFileSync("client/src/lib/handoff-client.ts", "utf8");
  assert.ok(client.includes("No local was free in time"));
  const cfg = fs.readFileSync("server/config/handoff.config.ts", "utf8");
  const fn = cfg.slice(cfg.indexOf("export function handoffFulfilmentHours"));
  assert.equal(fn.includes("48"), false);
  assert.match(fn, /process\.env\.HANDOFF_FULFILMENT_HOURS/);
});

async function stampAcceptAnchor(id: string, at: Date): Promise<void> {
  await db.execute(sql`
    UPDATE expert_requests
    SET accepted_at = ${at},
        optimization_context = COALESCE(optimization_context, '{}'::jsonb) || jsonb_build_object('handoffAcceptedAt', ${at.toISOString()}::text)
    WHERE id = ${id}
  `);
}

test("F10: the deadline needs both env values, and the second pass adds no failures", async () => {
  refundMode = "succeeded";
  cancelMode = "ok";
  const now = new Date("2026-10-28T12:00:00.000Z");
  const hour = 3_600_000;
  const old = await acceptedCaptured("f10old");
  await stampAcceptAnchor(old.id, new Date(now.getTime() - 1000 * hour));

  async function restoreHours(value: string | undefined) {
    if (value === undefined) delete process.env.HANDOFF_FULFILMENT_HOURS;
    else process.env.HANDOFF_FULFILMENT_HOURS = value;
  }

  try {
    await restoreHours(undefined);
    delete process.env.HANDOFF_FULFILMENT_SINCE;
    assert.equal(handoffFulfilmentHours(), null);
    assert.equal(handoffFulfilmentSince(), null);
    for (const raw of ["", "   ", "abc", "0", "-5"]) {
      await restoreHours(raw);
      assert.equal(handoffFulfilmentHours(), null, raw);
      const out = await handoff.runHandoffTimers(now);
      assert.equal(out.bookingFailed, 0, raw);
      assert.equal((await handoff.getHandoff(old.id))!.status, "accepted", raw);
    }
    await restoreHours("10");
    assert.equal(handoffFulfilmentHours(), 10);
    const sinceOff = await handoff.runHandoffTimers(now);
    assert.equal(sinceOff.bookingFailed, 0, "hours without a valid since does not time anyone out");
    assert.equal((await handoff.getHandoff(old.id))!.status, "accepted");
    process.env.HANDOFF_FULFILMENT_SINCE = "not-a-date";
    assert.equal(handoffFulfilmentSince(), null);
    assert.equal((await handoff.runHandoffTimers(now)).bookingFailed, 0);

    await db.execute(sql`UPDATE expert_requests SET status = 'withdrawn' WHERE id = ${old.id}`);
    const due = await acceptedCaptured("f10due");
    const early = await acceptedCaptured("f10early");
    const beforeSince = await acceptedCaptured("f10before");
    const delivered = await acceptedCaptured("f10del");
    const prepaid = await acceptedCaptured("f10pp");
    const stillProposed = await proposed("f10prop");
    const since = new Date(now.getTime() - 20 * hour);
    await stampAcceptAnchor(due.id, new Date(now.getTime() - 15 * hour));
    await stampAcceptAnchor(early.id, new Date(now.getTime() - 5 * hour));
    await stampAcceptAnchor(beforeSince.id, new Date(now.getTime() - 30 * hour));
    await db.execute(sql`UPDATE expert_requests SET status = 'delivered', delivered_at = ${now} WHERE id = ${delivered.id}`);
    await db.execute(sql`UPDATE expert_requests SET source_purchase_id = ${`pp-${RUN}-f10`} WHERE id = ${prepaid.id}`);
    await stampAcceptAnchor(prepaid.id, new Date(now.getTime() - 15 * hour));
    await db.execute(sql`UPDATE expert_requests SET authorized_at = ${now} WHERE id = ${stillProposed.id}`);

    process.env.HANDOFF_FULFILMENT_SINCE = since.toISOString();
    assert.equal(handoffFulfilmentSince()?.toISOString(), since.toISOString());
    const first = await handoff.runHandoffTimers(now);
    const dueRow = (await handoff.getHandoff(due.id))!;
    assert.equal(dueRow.status, "booking_failed");
    assert.equal(failureOf(dueRow)?.kind, "deadline_passed");
    assert.equal(failureOf(dueRow)?.by, "timer");
    assert.ok(dueRow.refundId);
    const dueRefunds = calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${due.id}`);
    assert.equal(dueRefunds.length, 1);
    assert.equal(countMessage(await messages(due.id), REFUNDED), 1);
    assert.equal(await alertCount(due.id), 1);
    assert.ok(first.bookingFailed >= 1);

    assert.equal((await handoff.getHandoff(early.id))!.status, "accepted");
    assert.equal((await handoff.getHandoff(beforeSince.id))!.status, "accepted");
    assert.equal((await handoff.getHandoff(delivered.id))!.status, "delivered");
    assert.equal((await handoff.getHandoff(prepaid.id))!.status, "accepted");
    assert.equal((await handoff.getHandoff(stillProposed.id))!.status, "proposed");

    const alerts = await alertCount(due.id);
    const refunds = dueRefunds.length;
    const second = await handoff.runHandoffTimers(now);
    assert.equal(calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${due.id}`).length, refunds);
    assert.equal(await alertCount(due.id), alerts);
    assert.equal(second.bookingFailed, 0, "the same clock does not fail another batch of already-failed rows");
  } finally {
    delete process.env.HANDOFF_FULFILMENT_HOURS;
    delete process.env.HANDOFF_FULFILMENT_SINCE;
  }
});

test("F11: ever-delivered requests are exempt, and the clock is the latest accept transition", async () => {
  refundMode = "succeeded";
  const now = new Date("2026-10-28T12:00:00.000Z");
  const hour = 3_600_000;
  const changed = await acceptedCaptured("f11chg");
  const delivered = await handoff.deliverHandoff(changed.id, ids.expert);
  assert.equal(delivered.ok, true, JSON.stringify(delivered));
  const back = await handoff.requestHandoffChanges(changed.id, ids.owner, "Please adjust the morning");
  assert.equal(back.ok, true, JSON.stringify(back));
  const ancient = new Date(now.getTime() - 30 * hour);
  await stampAcceptAnchor(changed.id, ancient);
  const freshClock = await acceptedCaptured("f11clk");
  await db.execute(sql`UPDATE expert_requests SET accepted_at = ${ancient} WHERE id = ${freshClock.id}`);
  await db.execute(sql`
    UPDATE expert_requests
    SET optimization_context = COALESCE(optimization_context, '{}'::jsonb) || jsonb_build_object('handoffAcceptedAt', ${new Date(now.getTime() - 2 * hour).toISOString()}::text)
    WHERE id = ${freshClock.id}
  `);

  process.env.HANDOFF_FULFILMENT_HOURS = "10";
  process.env.HANDOFF_FULFILMENT_SINCE = new Date(now.getTime() - 100 * hour).toISOString();
  try {
    await handoff.runHandoffTimers(now);
    assert.equal((await handoff.getHandoff(changed.id))!.status, "accepted", "a request that was delivered does not time out");
    assert.equal((await handoff.getHandoff(freshClock.id))!.status, "accepted", "the latest accept transition, not the original accepted_at, starts the clock");
    assert.equal(calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${changed.id}`).length, 0);
    assert.equal(calls.refund.filter((r) => r.key === `handoff-failed-booking-refund-${freshClock.id}`).length, 0);
  } finally {
    delete process.env.HANDOFF_FULFILMENT_HOURS;
    delete process.env.HANDOFF_FULFILMENT_SINCE;
  }
});

test("F12: a webhook succeeded report sends line 1; pending does not", async () => {
  refundMode = "pending";
  const { id, pi } = await acceptedCaptured("f12");
  await handoff.failHandoffBooking(id, { kind: "expert_withdrew", expertId: ids.expert });
  assert.equal(countMessage(await messages(id), REFUNDED), 0);
  assert.equal(failureOf(await handoff.getHandoff(id))?.refundStatus, "pending");
  const refundId = (await handoff.getHandoff(id))!.refundId!;
  await handoff.promoteHandoffFailedBookingRefunds({
    paymentIntentId: pi,
    refunds: [{ id: refundId, status: "pending" }],
  });
  assert.equal(countMessage(await messages(id), REFUNDED), 0);
  await handoff.promoteHandoffFailedBookingRefunds({
    paymentIntentId: pi,
    refunds: [{ id: refundId, status: "succeeded" }],
  });
  assert.equal(countMessage(await messages(id), REFUNDED), 1);
  assert.equal(failureOf(await handoff.getHandoff(id))?.refundStatus, "succeeded");
  assert.equal(countMessage(await messages(id), HANDOFF_FAILED_BOOKING_TRAVELER_COPY.checkingPayment), 1);
});

test("F14: a throwing timer row does not stop the run, and one ops alert is raised", async () => {
  refundMode = "succeeded";
  const now = new Date("2026-10-28T12:00:00.000Z");
  const hour = 3_600_000;
  const good = await acceptedCaptured("f14");
  await stampAcceptAnchor(good.id, new Date(now.getTime() - 15 * hour));
  process.env.HANDOFF_FULFILMENT_HOURS = "10";
  process.env.HANDOFF_FULFILMENT_SINCE = new Date(now.getTime() - 40 * hour).toISOString();
  handoff.__setHandoffTimerRowHookForTest((id) => {
    if (id === good.id) throw new Error("row blew up");
  });
  try {
    await handoff.runHandoffTimers(now);
    assert.equal((await handoff.getHandoff(good.id))!.status, "accepted", "the throwing row is left for a later pass");
    const alerts = await db.execute(sql`
      SELECT count(*)::int AS n FROM admin_notifications
      WHERE type = 'handoff_booking_failed_timer' AND reason = 'row_errors'
        AND created_at > NOW() - INTERVAL '5 minutes'
    `);
    assert.ok(Number((alerts.rows?.[0] as { n: number }).n) >= 1);
  } finally {
    handoff.__setHandoffTimerRowHookForTest(null);
    delete process.env.HANDOFF_FULFILMENT_HOURS;
    delete process.env.HANDOFF_FULFILMENT_SINCE;
  }
});

test("F15: a capture that lands after booking_failed refunds instead of finishing accept", async () => {
  refundMode = "succeeded";
  captureMode = "race";
  const { trip, item, id } = await proposed("f15");
  const out = await handoff.acceptHandoff(id, ids.expert);
  assert.equal(out.ok, true, JSON.stringify(out));
  const row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "booking_failed");
  assert.ok(row.capturedAt, "the capture is recorded so the refund can see it");
  assert.ok(row.refundId);
  assert.equal(failureOf(row)?.refundStatus, "succeeded");
  assert.equal(countMessage(await messages(id), REFUNDED), 1);
  const itemRow = await db.execute(sql`SELECT routing_status FROM itinerary_items WHERE id = ${item}`);
  assert.equal((itemRow.rows?.[0] as { routing_status: string }).routing_status, "in_planning");
  const src = fs.readFileSync("server/services/handoff.service.ts", "utf8");
  assert.ok(src.includes("FOR NO KEY UPDATE"));
  assert.equal((src.match(/FOR NO KEY UPDATE/g) ?? []).length >= 2, true);
  captureMode = "ok";
  void trip;
});
