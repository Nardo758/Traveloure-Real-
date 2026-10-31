/**
 * Row 98, option (b) (ledger `2026-10-30-row98-webhook-dedupe-replay`; Leon, Oct 30, 2026): a Stripe event delivered
 * twice is processed once per consumer, and a handler that takes a transaction shares ONE with its claim and its
 * completion — never across a Stripe call or an email. Synthetic events and rows only.
 *
 *   W1  the platform rail: the same event twice runs its handler once
 *   W2  the Connect rail: the same dispute event twice runs the dispute handler once, end to end
 *   W3  two concurrent deliveries: one runs, the other is answered in flight (the route's 500)
 *   W4  claimed_at (migration 418) is stamped on the claim and again on the re-take
 *   W4b a handler that throws rolls its claim back with its work; the failure is recorded and the next delivery runs
 *   W7  a dispute's charge id is fetched before the transaction; an expanded charge is never fetched
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row98-webhook-dedupe.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  WebhookClaimInFlightError,
  claimWebhookEvent,
  failWebhookClaim,
  runUnderWebhookClaim,
  runUnderWebhookClaimTx,
  withExpandedDisputeCharge,
} from "../services/webhook-claim.service";

process.env.STRIPE_SECRET_KEY ||= "sk_test_ci_stub_no_real_calls";

const RUN = crypto.randomUUID().slice(0, 8);
const ids: string[] = [];
const rowsOf = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);
const evt = (suffix: string, type = "charge.refunded") => {
  const id = `evt_r98_${RUN}_${suffix}`;
  ids.push(id);
  return { id, type } as const;
};
async function claimRow(id: string, consumer: string) {
  return rowsOf(await db.execute(sql`
    SELECT completed_at, error, claimed_at FROM platform_webhook_consumers WHERE stripe_event_id = ${id} AND consumer = ${consumer}
  `))[0];
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  const file = readFileSync("server/migrations/418_platform_webhook_consumers_claimed_at.sql", "utf8");
  const stripped = file.replace(/--.*$/gm, "");
  assert.match(stripped, /ADD COLUMN IF NOT EXISTS claimed_at timestamp/i);
  for (const banned of [/\bDEFAULT\b/i, /\bNOT NULL\b/i, /\bCHECK\b/i, /\bUPDATE\b/i, /\bINDEX\b/i]) assert.doesNotMatch(stripped, banned);
  assert.match(readFileSync("server/migrations/migration-files.ts", "utf8"), /"418_platform_webhook_consumers_claimed_at\.sql"/);
  assert.match(readFileSync("shared/schema.ts", "utf8"), /claimedAt: timestamp\("claimed_at"\)/);
  await pool.query(file);
});

after(async () => {
  await db.execute(sql`DELETE FROM platform_webhook_consumers WHERE stripe_event_id LIKE ${`evt_r98_${RUN}_%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM webhook_events WHERE stripe_event_id LIKE ${`evt_r98_${RUN}_%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM stripe_dispute_lifecycle WHERE dispute_id LIKE ${`dp_r98_${RUN}%`}`).catch(() => {});
  await pool.end().catch(() => {});
});

test("W1 the platform rail runs the same event once", async () => {
  const e = evt("w1");
  let runs = 0;
  assert.equal(await runUnderWebhookClaim(e, "platform", e, async () => { runs += 1; }), "processed");
  assert.equal(await runUnderWebhookClaim(e, "platform", e, async () => { runs += 1; }), "already_completed");
  assert.equal(runs, 1);
});

test("W2 the Connect rail runs the same dispute event once, end to end", async () => {
  const { processStripeWebhookEvent } = await import("../routes/webhooks.routes");
  const e = evt("w2", "charge.dispute.created");
  const event: any = {
    id: e.id,
    type: e.type,
    data: { object: { id: `dp_r98_${RUN}_w2`, status: "needs_response", amount: 100, charge: { id: `ch_r98_${RUN}`, payment_intent: null, metadata: {} } } },
  };
  await processStripeWebhookEvent(event);
  await processStripeWebhookEvent(event);
  const row = await claimRow(e.id, "connect");
  assert.ok(row.completed_at, "completed once");
  const lifecycle = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM stripe_dispute_lifecycle WHERE dispute_id = ${`dp_r98_${RUN}_w2`}`));
  assert.equal(lifecycle[0].n, 1);
  const logged = rowsOf(await db.execute(sql`SELECT processed FROM webhook_events WHERE stripe_event_id = ${e.id}`));
  assert.equal(logged[0].processed, true);
});

test("W3 two concurrent deliveries: one runs, the other is in flight", async () => {
  const e = evt("w3", "charge.dispute.updated");
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let started!: () => void;
  const running = new Promise<void>((r) => { started = r; });
  let runs = 0;
  const first = runUnderWebhookClaimTx(e, "connect", e, async () => { runs += 1; started(); await gate; });
  await running;
  await assert.rejects(runUnderWebhookClaimTx(e, "connect", e, async () => { runs += 1; }), (err: any) => err instanceof WebhookClaimInFlightError);
  release();
  assert.equal(await first, "processed");
  assert.equal(await runUnderWebhookClaimTx(e, "connect", e, async () => { runs += 1; }), "already_completed");
  assert.equal(runs, 1);
});

test("W4 claimed_at is stamped on the claim and on the re-take", async () => {
  const e = evt("w4");
  assert.deepEqual(await claimWebhookEvent(e, "platform", e), { claimed: true });
  const first = (await claimRow(e.id, "platform")).claimed_at as Date;
  assert.ok(first, "stamped on claim");
  await failWebhookClaim(e.id, "platform", new Error("boom"));
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(await claimWebhookEvent(e, "platform", e), { claimed: true });
  const second = (await claimRow(e.id, "platform")).claimed_at as Date;
  assert.ok(new Date(second).getTime() > new Date(first).getTime(), "stamped again on re-take");
});

test("W4b a throw rolls the claim back with the work; the next delivery runs it", async () => {
  const e = evt("w4b", "charge.dispute.created");
  const marker = `dp_r98_${RUN}_w4b`;
  await assert.rejects(
    runUnderWebhookClaimTx(e, "connect", e, async (tx) => {
      await tx.execute(sql`INSERT INTO stripe_dispute_lifecycle (dispute_id, terminal_outcome, booking_status) VALUES (${marker}, NULL, '{}'::jsonb)`);
      throw new Error("handler failed");
    }),
    /handler failed/,
  );
  const lost = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM stripe_dispute_lifecycle WHERE dispute_id = ${marker}`));
  assert.equal(lost[0].n, 0, "the work rolled back");
  const failed = await claimRow(e.id, "connect");
  assert.equal(failed.completed_at, null);
  assert.equal(failed.error, "handler failed", "the failure is recorded for replay");
  let runs = 0;
  assert.equal(await runUnderWebhookClaimTx(e, "connect", e, async () => { runs += 1; }), "processed");
  assert.equal(runs, 1);
  const done = await claimRow(e.id, "connect");
  assert.ok(done.completed_at);
  assert.equal(done.error, null);
});

test("W7 the charge is fetched before the transaction, and never when expanded", async () => {
  const calls: string[] = [];
  const stripe: any = { charges: { retrieve: async (id: string) => { calls.push(id); return { id, payment_intent: null, metadata: {} }; } } };
  const byId: any = { type: "charge.dispute.created", data: { object: { id: "dp", charge: "ch_1" } } };
  const out: any = await withExpandedDisputeCharge(byId, stripe);
  assert.deepEqual(calls, ["ch_1"]);
  assert.equal(out.data.object.charge.id, "ch_1");
  await withExpandedDisputeCharge(out, stripe);
  await withExpandedDisputeCharge({ type: "charge.refunded", data: { object: { charge: "ch_2" } } } as any, stripe);
  assert.deepEqual(calls, ["ch_1"], "an expanded charge and a non-dispute event make no call");
  const src = readFileSync("server/routes/webhooks.routes.ts", "utf8");
  const start = src.indexOf("async function processConnectDisputeEvent");
  const body = src.slice(start, src.indexOf("\n}\n", start));
  const fetchAt = body.indexOf("withExpandedDisputeCharge(");
  const txAt = body.indexOf("runUnderWebhookClaimTx(");
  assert.ok(fetchAt > 0 && txAt > fetchAt, "fetched before the transaction");
});
