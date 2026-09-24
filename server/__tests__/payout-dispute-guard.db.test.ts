/**
 * Focused disposable-DB regression tests for aggregate payout dispute holds.
 *
 * Run: npx tsx --test server/__tests__/payout-dispute-guard.db.test.ts
 */
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const run = crypto.randomUUID().slice(0, 8);
const providerId = `pdg-${run}-provider`;
const email = `${providerId}@test.invalid`;
const payoutIds: string[] = [];
const earningIds: string[] = [];

async function disposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { /* local */ }
  if (!host || !["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) {
    throw new Error("Refusing payout guard fixtures outside a disposable local database");
  }
}

async function fixture(opts: { amount: string; disputeState?: string; payoutAmount?: string }) {
  const earningId = `pdg-${run}-earning-${crypto.randomUUID().slice(0, 8)}`;
  await db.execute(sql`
    INSERT INTO provider_earnings (id, provider_id, type, amount, source_type, source_id, status, dispute_state)
    VALUES (${earningId}, ${providerId}, 'service_booking', ${opts.amount}, 'booking',
      ${`booking-${earningId}`}, 'releasable', ${opts.disputeState ?? "none"})
  `);
  earningIds.push(earningId);
  if (!opts.payoutAmount) return { earningId };
  const payoutId = `pdg-${run}-payout-${crypto.randomUUID().slice(0, 8)}`;
  await storage.createProviderPayout({
    id: payoutId,
    providerId,
    amount: opts.payoutAmount,
    status: "pending",
  } as any);
  payoutIds.push(payoutId);
  return { earningId, payoutId };
}

async function rows() {
  const result = await db.execute(sql`
    SELECT id, amount, status, dispute_state, payout_id
    FROM provider_earnings WHERE provider_id = ${providerId}
  `);
  return result.rows as Array<{ id: string; amount: string; status: string; dispute_state: string; payout_id: string | null }>;
}

before(async () => {
  await disposableDb();
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${providerId}, ${email}, 'Payout', 'Guard', 'service_provider')
  `);
});

beforeEach(async () => {
  // Keep each scenario independent even though the provider fixture is shared.
  await db.execute(sql`DELETE FROM provider_earnings WHERE provider_id = ${providerId}`);
  await db.execute(sql`DELETE FROM provider_payouts WHERE provider_id = ${providerId}`);
  payoutIds.length = 0;
  earningIds.length = 0;
});

after(async () => {
  await db.execute(sql`DELETE FROM provider_earnings WHERE provider_id = ${providerId}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_payouts WHERE provider_id = ${providerId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id = ${providerId}`).catch(() => {});
});

test("excludes disputed booking earnings while unrelated same-provider payout proceeds", async () => {
  await fixture({ amount: "50.00", disputeState: "open" });
  const unrelated = await fixture({ amount: "50.00", payoutAmount: "50.00" });
  const result = await storage.claimProviderPayoutForProcessing(unrelated.payoutId!);
  assert.equal(result.payout?.status, "processing");
  const current = await rows();
  assert.equal(current.find((r) => r.id === unrelated.earningId)?.payout_id, unrelated.payoutId);
  assert.equal(current.find((r) => r.dispute_state === "open")?.payout_id, null);
});

test("insufficient undisputed aggregate leaves payout pending", async () => {
  await fixture({ amount: "80.00", disputeState: "open" });
  const payout = await fixture({ amount: "20.00", payoutAmount: "50.00" });
  const result = await storage.claimProviderPayoutForProcessing(payout.payoutId!);
  assert.equal(result.reason, "insufficient_releasable_earnings");
  const current = await db.execute(sql`SELECT status FROM provider_payouts WHERE id = ${payout.payoutId}`);
  assert.equal((current.rows[0] as any)?.status, "pending");
});

test("concurrent claims reserve an earning at most once", async () => {
  const earning = await fixture({ amount: "50.00" });
  const first = await fixture({ amount: "0.00", payoutAmount: "50.00" });
  const second = await fixture({ amount: "0.00", payoutAmount: "50.00" });
  const results = await Promise.all([
    storage.claimProviderPayoutForProcessing(first.payoutId!),
    storage.claimProviderPayoutForProcessing(second.payoutId!),
  ]);
  assert.equal(results.filter((r) => !!r.payout).length, 1);
  const current = await rows();
  assert.ok([first.payoutId, second.payoutId].includes(current.find((r) => r.id === earning.earningId)?.payout_id ?? ""));
});

test("held reserved earning is never substituted from unrelated rows", async () => {
  const claimed = await fixture({ amount: "50.00", payoutAmount: "50.00" });
  await storage.claimProviderPayoutForProcessing(claimed.payoutId!);
  await db.execute(sql`UPDATE provider_earnings SET status = 'held' WHERE id = ${claimed.earningId}`);
  const unrelated = await fixture({ amount: "50.00" });
  const completed = await storage.updateProviderPayoutStatus(claimed.payoutId!, "completed");
  assert.equal(completed.status, "completed");
  const current = await rows();
  assert.equal(current.find((r) => r.id === unrelated.earningId)?.status, "releasable");
  assert.equal(current.find((r) => r.id === claimed.earningId)?.status, "held");
});

test("duplicate claim reports ambiguous processing instead of retrying Stripe", async () => {
  const payout = await fixture({ amount: "50.00", payoutAmount: "50.00" });
  const claimed = await storage.claimProviderPayoutForProcessing(payout.payoutId!);
  assert.equal(claimed.payout?.status, "processing");
  const duplicate = await storage.claimProviderPayoutForProcessing(payout.payoutId!);
  assert.equal(duplicate.reason, "already_processing");
});