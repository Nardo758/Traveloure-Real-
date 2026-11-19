/**
 * F8 (#1243): a reversed Connect transfer returns earnings to payable.
 *
 * Drives the REAL handler (`processStripeWebhookEvent`) with constructed Stripe events, so removing the new case or
 * its guards makes these cases fail. DB-backed; CI is the database.
 *
 * The brief's cases, with `transfer.paid` replaced by `transfer.created` (on the pinned API version `transfer.paid`
 * and `transfer.failed` no longer exist - Leon, Nov 19 2026), plus the redelivery-after-reversal case.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type Stripe from "stripe";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { processStripeWebhookEvent } from "../routes/webhooks.routes";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = () => crypto.randomUUID();
const expertUser = uid();
const providerUser = uid();
const payoutA = uid();
const payoutB = uid();
const payoutP = uid();

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { /* refuse below */ }
  if (!DISPOSABLE.has(host)) throw new Error(`[f8-transfer-reversal] REFUSING to write to '${host}'.`);
}

function transferEvent(type: string, transfer: Record<string, unknown>, created = Math.floor(Date.now() / 1000)): Stripe.Event {
  return {
    id: `evt_f8_${crypto.randomUUID()}`,
    object: "event",
    type,
    created,
    data: { object: transfer },
  } as unknown as Stripe.Event;
}

async function earningsOf(payoutId: string) {
  return (await db.execute(sql`SELECT id, status, payout_id, dispute_state FROM expert_earnings WHERE payout_id = ${payoutId} OR reference_id = ${"f8-" + RUN}`)).rows ?? [];
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, role, first_name, last_name) VALUES (${expertUser}, ${`f8-expert-${RUN}@ci.test`}, 'expert', 'F8', 'Expert')`);
  await db.execute(sql`INSERT INTO users (id, email, role, first_name, last_name) VALUES (${providerUser}, ${`f8-prov-${RUN}@ci.test`}, 'provider', 'F8', 'Provider')`);
  for (const id of [payoutA, payoutB]) {
    await db.execute(sql`INSERT INTO expert_payouts (id, expert_id, amount, status) VALUES (${id}, ${expertUser}, 10, 'completed')`);
  }
  await db.execute(sql`INSERT INTO provider_payouts (id, provider_id, amount, status) VALUES (${payoutP}, ${providerUser}, 10, 'completed')`);
  // Two paid_out earnings on payout A (one of them disputed), one on payout B that must stay untouched.
  for (const [payout, dispute] of [[payoutA, "none"], [payoutA, "open"], [payoutB, "none"]] as const) {
    await db.execute(sql`
      INSERT INTO expert_earnings (id, expert_id, type, amount, status, payout_id, dispute_state, reference_id)
      VALUES (${uid()}, ${expertUser}, 'service_booking', 5, 'paid_out', ${payout}, ${dispute}, ${"f8-" + RUN})
    `);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM expert_earnings WHERE expert_id = ${expertUser}`);
  await db.execute(sql`DELETE FROM expert_payouts WHERE expert_id = ${expertUser}`);
  await db.execute(sql`DELETE FROM provider_payouts WHERE provider_id = ${providerUser}`);
  await db.execute(sql`DELETE FROM admin_notifications WHERE type = 'stripe_connect_transfer_reversed' AND metadata->>'payoutId' IN (${payoutA}, ${payoutP})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${expertUser}, ${providerUser})`);
});

test("F8.1 a FULL reversal returns that payout's rows to releasable, disputed to held, and clears payout_id", async () => {
  const transfer = { id: `tr_${RUN}`, reversed: true, amount_reversed: 10, metadata: { payoutId: payoutA, requesterType: "expert" } };
  await processStripeWebhookEvent(transferEvent("transfer.reversed", transfer));
  const rows = (await db.execute(sql`SELECT status, payout_id, dispute_state FROM expert_earnings WHERE reference_id = ${"f8-" + RUN}`)).rows as any[];
  const onA = rows.filter((r) => r.payout_id === null);
  assert.equal(onA.length, 2, "both rows of payout A moved");
  assert.ok(onA.some((r) => r.dispute_state === "open" && r.status === "held"), "a disputed row goes to held");
  assert.ok(onA.some((r) => r.dispute_state !== "open" && r.status === "releasable"), "the other returns to releasable");
});

test("F8.2 rows of another payout are untouched", async () => {
  const rows = (await db.execute(sql`SELECT status FROM expert_earnings WHERE payout_id = ${payoutB}`)).rows as any[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "paid_out");
});

test("F8.3 the payout moves completed -> failed and records the event id in metadata", async () => {
  const [row] = (await db.execute(sql`SELECT status, metadata FROM expert_payouts WHERE id = ${payoutA}`)).rows as any[];
  assert.equal(row.status, "failed");
  assert.match(String(row.metadata?.transferReversedEventId ?? ""), /^evt_f8_/);
});

test("F8.4 a redelivered reversal changes nothing and writes no second admin row", async () => {
  // The SAME event id twice: that is what a redelivery is. (The first version of this test minted a new id each
  // call, so the durable claim was never exercised and the case could not fail for the right reason.)
  const transfer = { id: `tr_${RUN}`, reversed: true, amount_reversed: 10, metadata: { payoutId: payoutA, requesterType: "expert" } };
  const redelivered = transferEvent("transfer.reversed", transfer);
  const before = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM admin_notifications WHERE metadata->>'payoutId' = ${payoutA}`)).rows as any[];
  await processStripeWebhookEvent(redelivered);
  const after = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM admin_notifications WHERE metadata->>'payoutId' = ${payoutA}`)).rows as any[];
  assert.equal(after[0].n, before[0].n, "the durable claim dedupes the redelivery");
});

test("F8.5 a PARTIAL reversal changes no earnings row and asks for manual review", async () => {
  const transfer = { id: `tr_p_${RUN}`, reversed: false, amount_reversed: 3, amount: 10, metadata: { payoutId: payoutB, requesterType: "expert" } };
  await processStripeWebhookEvent(transferEvent("transfer.reversed", transfer));
  const rows = (await db.execute(sql`SELECT status, payout_id FROM expert_earnings WHERE payout_id = ${payoutB}`)).rows as any[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "paid_out", "no earnings change on a partial reversal");
  const [note] = (await db.execute(sql`SELECT metadata FROM admin_notifications WHERE metadata->>'payoutId' = ${payoutB} ORDER BY created_at DESC LIMIT 1`)).rows as any[];
  assert.equal(note.metadata.needsManualReview, true);
});

test("F8.6 a provider reversal moves provider_payouts to failed and records the event id in notes", async () => {
  const transfer = { id: `tr_pr_${RUN}`, reversed: true, amount_reversed: 10, metadata: { payoutId: payoutP, requesterType: "provider" } };
  await processStripeWebhookEvent(transferEvent("transfer.reversed", transfer));
  const [row] = (await db.execute(sql`SELECT status, notes FROM provider_payouts WHERE id = ${payoutP}`)).rows as any[];
  assert.equal(row.status, "failed");
  assert.match(String(row.notes ?? ""), /transfer\.reversed evt_f8_/);
});

test("F8.7 transfer.created still completes a payout (the event the pinned API version has)", async () => {
  const fresh = uid();
  await db.execute(sql`INSERT INTO expert_payouts (id, expert_id, amount, status) VALUES (${fresh}, ${expertUser}, 10, 'processing')`);
  const transfer = { id: `tr_c_${RUN}`, metadata: { payoutId: fresh, requesterType: "expert" } };
  await processStripeWebhookEvent(transferEvent("transfer.created", transfer));
  const [row] = (await db.execute(sql`SELECT status FROM expert_payouts WHERE id = ${fresh}`)).rows as any[];
  assert.equal(row.status, "completed");
  await db.execute(sql`DELETE FROM expert_payouts WHERE id = ${fresh}`);
});

test("F8.8 a NEW transfer.created after a full reversal does not move the payout back or re-mark earnings", async () => {
  // F8.1 already reversed payoutA fully. A late `transfer.created` with a NEW event id must not resurrect it.
  const transfer = { id: `tr_late_${RUN}`, metadata: { payoutId: payoutA, requesterType: "expert" } };
  await processStripeWebhookEvent(transferEvent("transfer.created", transfer));
  const [payout] = (await db.execute(sql`SELECT status FROM expert_payouts WHERE id = ${payoutA}`)).rows as any[];
  const earnings = (await db.execute(sql`SELECT status FROM expert_earnings WHERE reference_id = ${"f8-" + RUN}`)).rows as any[];
  // If EITHER of these comes back completed/paid_out the guard in storage.ts:189 (failed -> completed) is the cause and
  // that needs a ruling; this test is written to FAIL loudly in that case, which is the report.
  assert.notEqual(payout.status, "completed", "a late transfer.created must not re-complete a failed payout");
  assert.equal(earnings.some((e) => e.status === "paid_out"), false, "and must not mark earnings paid_out again");
});

test("F8.9 a reversal for a payout that is not 'completed' changes no earnings and asks for manual review", async () => {
  const notCompleted = uid();
  await db.execute(sql`INSERT INTO expert_payouts (id, expert_id, amount, status) VALUES (${notCompleted}, ${expertUser}, 10, 'processing')`);
  await db.execute(sql`
    INSERT INTO expert_earnings (id, expert_id, type, amount, status, payout_id, dispute_state, reference_id)
    VALUES (${uid()}, ${expertUser}, 'service_booking', 5, 'paid_out', ${notCompleted}, 'none', ${"f8-nc-" + RUN})
  `);
  const transfer = { id: `tr_nc_${RUN}`, reversed: true, metadata: { payoutId: notCompleted, requesterType: "expert" } };
  await processStripeWebhookEvent(transferEvent("transfer.reversed", transfer));
  const [earning] = (await db.execute(sql`SELECT status, payout_id FROM expert_earnings WHERE reference_id = ${"f8-nc-" + RUN}`)).rows as any[];
  assert.equal(earning.status, "paid_out", "no earnings change");
  assert.equal(earning.payout_id, notCompleted, "and the payout id stays");
  const [note] = (await db.execute(sql`SELECT metadata FROM admin_notifications WHERE metadata->>'payoutId' = ${notCompleted} ORDER BY created_at DESC LIMIT 1`)).rows as any[];
  assert.equal(note.metadata.needsManualReview, true);
  assert.equal(note.metadata.payoutStatus, "processing");
  await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${"f8-nc-" + RUN}`);
  await db.execute(sql`DELETE FROM expert_payouts WHERE id = ${notCompleted}`);
});

test("F8.10 an unknown requesterType touches no table and asks for manual review", async () => {
  const ghost = uid();
  await db.execute(sql`INSERT INTO expert_payouts (id, expert_id, amount, status) VALUES (${ghost}, ${expertUser}, 10, 'completed')`);
  const transfer = { id: `tr_unk_${RUN}`, reversed: true, metadata: { payoutId: ghost, requesterType: "sommelier" } };
  await processStripeWebhookEvent(transferEvent("transfer.reversed", transfer));
  const [payout] = (await db.execute(sql`SELECT status FROM expert_payouts WHERE id = ${ghost}`)).rows as any[];
  assert.equal(payout.status, "completed", "an unknown rail changes nothing");
  const [note] = (await db.execute(sql`SELECT metadata FROM admin_notifications WHERE metadata->>'transferId' = ${`tr_unk_${RUN}`} ORDER BY created_at DESC LIMIT 1`)).rows as any[];
  assert.equal(note.metadata.needsManualReview, true);
  assert.equal(note.metadata.payoutRowsMoved, 0);
  await db.execute(sql`DELETE FROM expert_payouts WHERE id = ${ghost}`);
});

test("F8.11 if the admin-row insert fails, the payout and earnings roll back with it", async () => {
  // No injection seam exists on the handler's module-level `db`, so the failure is forced at the DATABASE level: a
  // trigger on admin_notifications that raises for THIS run's transfer id. The handler's transaction must roll the
  // payout update and the earnings update back with it.
  const rbPayout = uid();
  const rbTransfer = `tr_rb_${RUN}`;
  await db.execute(sql`INSERT INTO expert_payouts (id, expert_id, amount, status) VALUES (${rbPayout}, ${expertUser}, 10, 'completed')`);
  await db.execute(sql`
    INSERT INTO expert_earnings (id, expert_id, type, amount, status, payout_id, dispute_state, reference_id)
    VALUES (${uid()}, ${expertUser}, 'service_booking', 5, 'paid_out', ${rbPayout}, 'none', ${"f8-rb-" + RUN})
  `);
  const fnName = `f8_fail_admin_${RUN}`;
  try {
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION ${fnName}() RETURNS trigger AS $$
      BEGIN
        IF NEW.metadata->>'transferId' = '${rbTransfer}' THEN
          RAISE EXCEPTION 'f8 forced failure for the rollback case';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `));
    await db.execute(sql.raw(`CREATE TRIGGER ${fnName}_trg BEFORE INSERT ON admin_notifications FOR EACH ROW EXECUTE FUNCTION ${fnName}()`));

    const transfer = { id: rbTransfer, reversed: true, metadata: { payoutId: rbPayout, requesterType: "expert" } };
    await assert.rejects(
      () => processStripeWebhookEvent(transferEvent("transfer.reversed", transfer)),
      /f8 forced failure/,
      "the handler throws when the admin row cannot be written",
    );

    const [payout] = (await db.execute(sql`SELECT status FROM expert_payouts WHERE id = ${rbPayout}`)).rows as any[];
    assert.equal(payout.status, "completed", "the payout update rolled back");
    const [earning] = (await db.execute(sql`SELECT status, payout_id FROM expert_earnings WHERE reference_id = ${"f8-rb-" + RUN}`)).rows as any[];
    assert.equal(earning.status, "paid_out", "the earnings update rolled back");
    assert.equal(earning.payout_id, rbPayout, "and its payout id is still there");
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${fnName}_trg ON admin_notifications`)).catch(() => {});
    await db.execute(sql.raw(`DROP FUNCTION IF EXISTS ${fnName}()`)).catch(() => {});
    await db.execute(sql`DELETE FROM expert_earnings WHERE reference_id = ${"f8-rb-" + RUN}`).catch(() => {});
    await db.execute(sql`DELETE FROM expert_payouts WHERE id = ${rbPayout}`).catch(() => {});
  }
});
