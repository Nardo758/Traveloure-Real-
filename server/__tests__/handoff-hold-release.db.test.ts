/**
 * Fix-queue 212(a): a failed Stripe cancel of an uncaptured handoff hold is `release_pending`,
 * retried by `runHandoffTimers`, and the traveler is told the hold is gone only after Stripe
 * confirms the cancel. Accept still requires `proposed`.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   npx tsx --test --test-concurrency=1 server/__tests__/handoff-hold-release.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { HANDOFF_HOLD_RELEASE_MAX_ATTEMPTS, HANDOFF_HOLD_TRAVELER_COPY } from "@shared/handoff";
import { insertRoutableExpertForm } from "./helpers/routable-expert";

process.env.STRIPE_SECRET_KEY ||= "sk_test_handoff_hold_release";
const handoff = await import("../services/handoff.service");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `hr-${RUN}-owner`,
  expert: `hr-${RUN}-expert`,
};

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[handoff-hold-release] REFUSING to write fixtures to '${host}'.`);
}

type CancelMode = "ok" | "fail" | "already_canceled" | "retrieve_canceled";
let cancelMode: CancelMode = "ok";
const calls = { cancel: [] as string[], capture: [] as string[], retrieve: 0, authorize: 0 };
const intents = new Map<string, { amount: number; status: string; metadata: Record<string, string> }>();

handoff.__setHandoffPaymentsForTest({
  async authorize(i) {
    calls.authorize += 1;
    const id = `pi_${i.idempotencyKey}`;
    if (!intents.has(id)) intents.set(id, { amount: i.amountCents, status: "requires_payment_method", metadata: { type: "expert_handoff" } });
    return { clientSecret: `${id}_secret`, paymentIntentId: id, amountCents: i.amountCents };
  },
  async retrieve(id) {
    calls.retrieve += 1;
    const pi = intents.get(id)!;
    const status = cancelMode === "retrieve_canceled" ? "canceled" : pi.status;
    return {
      id,
      status,
      amountCents: pi.amount,
      amountCapturableCents: status === "requires_capture" ? pi.amount : 0,
      metadata: pi.metadata,
    };
  },
  async capture(id, key) {
    calls.capture.push(key);
    intents.get(id)!.status = "succeeded";
    return { id, status: "succeeded", amountReceivedCents: intents.get(id)!.amount };
  },
  async cancel(id, key) {
    calls.cancel.push(key);
    if (cancelMode === "fail" || cancelMode === "retrieve_canceled") throw new Error("stripe cancel failed");
    if (cancelMode === "already_canceled") {
      const err = new Error("You cannot cancel this PaymentIntent because it has a status of canceled.") as Error & {
        payment_intent?: { status: string; cancellation_reason: string };
      };
      err.payment_intent = { status: "canceled", cancellation_reason: "expired" };
      throw err;
    }
    intents.get(id)!.status = "canceled";
    return { id, status: "canceled" };
  },
  async refund(i) {
    return { id: `re_${i.idempotencyKey}`, status: "succeeded" };
  },
});

const trips: string[] = [];

async function makeTrip(suffix: string): Promise<{ trip: string; item: string }> {
  const trip = `hr-${RUN}-${suffix}`;
  const item = `${trip}-i`;
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${trip}, ${ids.owner}, 'Hold release', 'Kyoto, Japan', '2027-05-01', '2027-05-03')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, day_number, sort_order, routing_status, estimated_cost)
    VALUES (${item}, ${trip}, 'Nishiki', 1, 0, 'in_planning', 0)`);
  trips.push(trip);
  return { trip, item };
}

async function proposedAsk(suffix: string): Promise<{ trip: string; item: string; id: string }> {
  const { trip, item } = await makeTrip(suffix);
  const ask = await handoff.askHandoff({ tripId: trip, userId: ids.owner, kind: "polish", itemIds: [item] });
  assert.ok(ask.ok, JSON.stringify(ask));
  const id = ask.request.id;
  const pi = ask.request.paymentIntentId!;
  intents.get(pi)!.status = "requires_capture";
  await handoff.confirmHandoffAuthorization(id, ids.owner);
  await db.execute(sql`UPDATE expert_requests SET authorized_at = NOW() - INTERVAL '49 hours', status = 'unmatched', assigned_expert_id = NULL WHERE id = ${id}`);
  return { trip, item, id };
}

async function messages(requestId: string): Promise<string[]> {
  const r = await db.execute(sql`SELECT message FROM notifications WHERE user_id = ${ids.owner} AND data->>'requestId' = ${requestId} ORDER BY created_at`);
  return (r.rows ?? []).map((row) => String((row as { message: string }).message));
}

async function park(trip: string): Promise<void> {
  await db.execute(sql`UPDATE expert_requests SET status = 'withdrawn' WHERE trip_id = ${trip} AND status = 'release_pending'`);
}

async function alertCount(requestId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM admin_notifications
    WHERE type = 'handoff_hold_release_failed' AND metadata->>'requestId' = ${requestId}
  `);
  return Number((r.rows?.[0] as { n: number } | undefined)?.n ?? 0);
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name) VALUES
    (${ids.owner}, ${`${ids.owner}@t.test`}, 'Ho', 'Owner'),
    (${ids.expert}, ${`${ids.expert}@t.test`}, 'Ho', 'Expert')`);
  await insertRoutableExpertForm(ids.expert);
});

after(async () => {
  if (trips.length) {
    await db.execute(sql`DELETE FROM notifications WHERE user_id = ${ids.owner}`);
    await db.execute(sql`DELETE FROM admin_notifications WHERE type = 'handoff_hold_release_failed' AND metadata->>'requestId' IN (
      SELECT id::text FROM expert_requests WHERE trip_id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)})
    )`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM expert_requests WHERE trip_id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${sql.join(trips.map((t) => sql`${t}`), sql`, `)})`);
  }
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${ids.expert}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`);
  handoff.__setHandoffPaymentsForTest(null);
});

test("release success sends the nothing-charged line", async () => {
  cancelMode = "ok";
  const { id } = await proposedAsk("ok");
  const beforeCancels = calls.cancel.length;
  const out = await handoff.runHandoffTimers();
  const row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "released");
  assert.ok(out.released >= 1);
  assert.equal(calls.cancel.length, beforeCancels + 1);
  const sent = await messages(id);
  assert.ok(sent.includes(HANDOFF_HOLD_TRAVELER_COPY.nothingCharged));
  assert.equal(sent.includes(HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold), false);
});

test("release failure sets release_pending and does not say nothing was charged", async () => {
  cancelMode = "fail";
  const { trip, item, id } = await proposedAsk("fail");
  const auths = calls.authorize;
  await handoff.runHandoffTimers();
  const row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "release_pending");
  const sent = await messages(id);
  assert.ok(sent.includes(HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold));
  assert.equal(sent.includes(HANDOFF_HOLD_TRAVELER_COPY.nothingCharged), false);
  const again = await handoff.askHandoff({ tripId: trip, userId: ids.owner, kind: "polish", itemIds: [item] });
  assert.equal(again.ok, false);
  if (!again.ok) {
    assert.equal(again.code, "hold_release_pending");
    assert.equal(again.message, HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold);
  }
  assert.equal(calls.authorize, auths, "a pending release does not place a second hold");
  await park(trip);
});

test("retry success flips to released and sends the confirmed line", async () => {
  cancelMode = "fail";
  const { id } = await proposedAsk("retry");
  const t0 = new Date();
  await handoff.runHandoffTimers(t0);
  assert.equal((await handoff.getHandoff(id))!.status, "release_pending");
  assert.equal((await messages(id)).includes(HANDOFF_HOLD_TRAVELER_COPY.nothingCharged), false);
  const early = calls.cancel.length;
  await handoff.runHandoffTimers(new Date(t0.getTime() + 60_000));
  assert.equal(calls.cancel.length, early, "backoff skips a cancel inside the hour");
  const next = (await handoff.getHandoff(id))!.optimizationContext as { holdRelease?: { nextAttemptAt?: string } };
  cancelMode = "ok";
  await handoff.runHandoffTimers(new Date(next.holdRelease!.nextAttemptAt!));
  assert.equal((await handoff.getHandoff(id))!.status, "released");
  const sent = await messages(id);
  assert.ok(sent.includes(HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold));
  assert.ok(sent.includes(HANDOFF_HOLD_TRAVELER_COPY.nothingCharged));
});

test("retry cap keeps release_pending and alerts once", async () => {
  cancelMode = "fail";
  const { trip, id } = await proposedAsk("cap");
  let now = new Date();
  await handoff.runHandoffTimers(now);
  for (let i = 1; i < HANDOFF_HOLD_RELEASE_MAX_ATTEMPTS; i++) {
    const meta = ((await handoff.getHandoff(id))!.optimizationContext as { holdRelease?: { nextAttemptAt?: string } }).holdRelease;
    assert.ok(meta?.nextAttemptAt, `attempt ${i} schedules a next try`);
    now = new Date(meta!.nextAttemptAt!);
    await handoff.runHandoffTimers(now);
  }
  const row = (await handoff.getHandoff(id))!;
  assert.equal(row.status, "release_pending");
  assert.equal(await alertCount(id), 1);
  const cancels = calls.cancel.filter((k) => k === `handoff-release-${id}`).length;
  assert.equal(cancels, HANDOFF_HOLD_RELEASE_MAX_ATTEMPTS);
  await handoff.runHandoffTimers(new Date(now.getTime() + 48 * 3_600_000));
  assert.equal((await handoff.getHandoff(id))!.status, "release_pending");
  assert.equal(await alertCount(id), 1);
  assert.equal(calls.cancel.filter((k) => k === `handoff-release-${id}`).length, cancels);
  assert.equal((await messages(id)).includes(HANDOFF_HOLD_TRAVELER_COPY.nothingCharged), false);
  await park(trip);
});

test("accept on release_pending is refused and does not capture", async () => {
  cancelMode = "ok";
  const { trip, item } = await makeTrip("accept");
  const ask = await handoff.askHandoff({ tripId: trip, userId: ids.owner, kind: "polish", itemIds: [item] });
  assert.ok(ask.ok, JSON.stringify(ask));
  intents.get(ask.request.paymentIntentId!)!.status = "requires_capture";
  await handoff.confirmHandoffAuthorization(ask.request.id, ids.owner);
  const assigned = await handoff.adminAssignHandoff(ask.request.id, ids.expert);
  assert.ok(assigned.ok, JSON.stringify(assigned));
  await db.execute(sql`UPDATE expert_requests SET status = 'release_pending' WHERE id = ${ask.request.id}`);
  const captures = calls.capture.length;
  const refused = await handoff.acceptHandoff(ask.request.id, ids.expert);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, "wrong_status");
  assert.equal(calls.capture.length, captures);
  assert.equal((await handoff.getHandoff(ask.request.id))!.status, "release_pending");
});

test("Stripe already canceled or expired counts as a confirmed release", async () => {
  cancelMode = "already_canceled";
  const { id } = await proposedAsk("expired");
  const retrieves = calls.retrieve;
  await handoff.runHandoffTimers();
  assert.equal((await handoff.getHandoff(id))!.status, "released");
  assert.equal(calls.retrieve, retrieves, "the error already says the intent is canceled");
  assert.ok((await messages(id)).includes(HANDOFF_HOLD_TRAVELER_COPY.nothingCharged));
});

test("a cancel error followed by a canceled retrieve is a confirmed release", async () => {
  cancelMode = "retrieve_canceled";
  const { id } = await proposedAsk("retrieve");
  await handoff.runHandoffTimers();
  assert.equal((await handoff.getHandoff(id))!.status, "released");
  assert.ok(calls.retrieve >= 1);
  assert.ok((await messages(id)).includes(HANDOFF_HOLD_TRAVELER_COPY.nothingCharged));
  assert.equal((await messages(id)).includes(HANDOFF_HOLD_TRAVELER_COPY.checkingOnHold), false);
});

test("decline still returns the ask to unmatched, and a released ask can be asked again", async () => {
  cancelMode = "ok";
  const { trip, item } = await makeTrip("rematch");
  const ask = await handoff.askHandoff({ tripId: trip, userId: ids.owner, kind: "polish", itemIds: [item] });
  assert.ok(ask.ok, JSON.stringify(ask));
  intents.get(ask.request.paymentIntentId!)!.status = "requires_capture";
  await handoff.confirmHandoffAuthorization(ask.request.id, ids.owner);
  const assigned = await handoff.adminAssignHandoff(ask.request.id, ids.expert);
  assert.ok(assigned.ok, JSON.stringify(assigned));
  const declined = await handoff.declineHandoff(ask.request.id, ids.expert);
  assert.ok(declined.ok, JSON.stringify(declined));
  const afterDecline = (await handoff.getHandoff(ask.request.id))!;
  assert.equal(afterDecline.status, "unmatched");
  assert.equal(afterDecline.assignedExpertId, null);

  await db.execute(sql`UPDATE expert_requests SET authorized_at = NOW() - INTERVAL '49 hours' WHERE id = ${ask.request.id}`);
  await handoff.runHandoffTimers();
  assert.equal((await handoff.getHandoff(ask.request.id))!.status, "released");
  const again = await handoff.askHandoff({ tripId: trip, userId: ids.owner, kind: "polish", itemIds: [item] });
  assert.ok(again.ok, JSON.stringify(again));
});
