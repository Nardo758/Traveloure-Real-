/**
 * membership-reconciliation.db.test.ts — ledger `2026-09-21-membership-reconciliation`,
 * memberships increment 3.
 *
 * THE HOLE THIS RAIL CLOSES. `plan_memberships` has exactly ONE writer, driven ONLY by a
 * signature-verified Stripe webhook. An undelivered webhook leaves a member CHARGED BY STRIPE with
 * NO entitlement, and until this rail nothing anywhere looked — §17's other three rails scan
 * bookings and know nothing about subscriptions.
 *
 * Real database, INJECTED StripeReader: no network, no Stripe key, the same seam the other three
 * rails are proven through.
 *
 *   N1  ACTIVE at Stripe, no row → §17's narrow exception CONVERGES it through the ONE writer.
 *       The row appears, the hand-off is reported, and NO exception is recorded — a pass must not
 *       leave a durable accusation about a fact it just fixed (the D-18 rule).
 *   N2  ACTIVE at Stripe, no row, and the writer CANNOT resolve the owner → nothing is written and
 *       `sub_active_no_membership` IS recorded, carrying the WRITER'S own refusal.
 *   N3  STATUS DRIFT: Stripe cancelled it, the row still says active → converged to `cancelled`.
 *       This is the case that would otherwise keep granting a Plus entitlement after cancellation.
 *   N4  AGREEMENT is not drift: a row that already matches Stripe is untouched and unreported.
 *   N5  §13 — a MANUAL grant for the SAME user and plan SURVIVES a hand-off that creates the
 *       stripe row beside it, and is never adopted or reported. Note what this does NOT prove:
 *       that a manual grant is unmatchable is STRUCTURAL (it carries no subscription id, so it can
 *       never enter the rail's `IN (…)` list), not something a test can demonstrate by deletion —
 *       removing the rail's `IS NOT NULL` clause leaves this suite green, which is why the clause
 *       is documented there as redundant intent rather than as the protection.
 *   N6  §13 — an INCOMPLETE subscription with no row is NOT drift. An abandoned checkout never
 *       granted anything; inventing a `lapsed` row for each would manufacture history.
 *   N7  §17 rule 2 — the per-pass tally reaches `reconciliation_runs.checked_subscriptions`
 *       (migration 318), so a scheduled pass leaves a durable record of this rail's work.
 *   N8  IDEMPOTENCE: a second pass over the same converged subscription writes no second row and
 *       records nothing new. The writer's ON CONFLICT is what makes the hand-off safe to repeat.
 *
 * Run: DATABASE_URL=… npx tsx --test server/__tests__/membership-reconciliation.db.test.ts
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { runStripeReconciliation, type StripeReader } from "../jobs/stripeReconciliation";

const RUN = crypto.randomUUID().slice(0, 8);
const userId = crypto.randomUUID();
const customerId = `cus_${RUN}`;
const PLAN = "plus_annual";

const subId = (n: string) => `sub_${RUN}_${n}`;

/** Only subscriptions this suite owns are listed, so a neighbouring row cannot move its counts. */
function reader(subscriptions: any[]): StripeReader {
  return {
    listPaymentIntents: async () => [],
    listCharges: async () => [],
    listRefunds: async () => [],
    listSubscriptions: async () => subscriptions as any,
  };
}

/** A Stripe subscription as the job reads it. `created` is irrelevant — the reader is injected. */
function sub(opts: {
  id: string;
  status: string;
  withMetadata?: boolean;
  withCustomer?: boolean;
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    id: opts.id,
    status: opts.status,
    current_period_start: nowSec - 86_400,
    current_period_end: nowSec + 86_400 * 365,
    customer: opts.withCustomer === false ? null : customerId,
    metadata: opts.withMetadata === false ? {} : { userId, planKey: PLAN },
  };
}

async function pass(subscriptions: any[]) {
  return runStripeReconciliation({
    triggeredBy: "test",
    stripeReader: reader(subscriptions),
    onlySubscriptionIds: subscriptions.map((s) => s.id),
  });
}

async function rowFor(subscriptionId: string) {
  const r = await db.execute(sql`
    SELECT status, plan_key, user_id, source FROM plan_memberships
     WHERE stripe_subscription_id = ${subscriptionId}`);
  return (r.rows ?? []) as any[];
}

before(async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role, stripe_customer_id)
    VALUES (${userId}, ${`mr-${RUN}@test.local`}, 'traveler', ${customerId})
    ON CONFLICT (id) DO NOTHING`);
});

after(async () => {
  // FK cascade takes the memberships with the user.
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
});

test("N1: ACTIVE at Stripe with no row — converged by the hand-off, and NOT accused", async () => {
  const id = subId("n1");
  const res = await pass([sub({ id, status: "active" })]);

  const rows = await rowFor(id);
  assert.equal(rows.length, 1, "the one writer should have created exactly one row");
  assert.equal(rows[0].status, "active");
  assert.equal(rows[0].plan_key, PLAN);
  assert.equal(rows[0].source, "stripe");

  assert.ok(res.membershipHandOffs.includes(id), "the hand-off should be reported");
  // The D-18 rule: the pass fixed it, so there is nothing left to accuse.
  const mine = res.exceptions.filter((e) => e.rail === "membership");
  assert.equal(mine.length, 0, `expected no exception, got ${JSON.stringify(mine)}`);
});

test("N2: ACTIVE with an UNRESOLVABLE owner — nothing written, and the WRITER's reason recorded", async () => {
  const id = subId("n2");
  // No metadata and no customer: the writer can resolve neither a user nor a plan.
  const res = await pass([sub({ id, status: "active", withMetadata: false, withCustomer: false })]);

  assert.equal((await rowFor(id)).length, 0, "an unresolvable subscription must write NOTHING");

  const ex = res.exceptions.find((e) => e.rail === "membership" && e.details?.subscriptionId === id);
  assert.ok(ex, "expected a membership exception");
  assert.equal(ex!.kind, "sub_active_no_membership");
  assert.equal(ex!.severity, "critical");
  // The reason is the writer's own named refusal, never one this job invented.
  assert.ok(
    ["no_user", "no_plan_key", "no_subscription_id"].includes(String(ex!.details?.handOffRefusal)),
    `unexpected refusal: ${ex!.details?.handOffRefusal}`,
  );
  assert.ok(!res.membershipHandOffs.includes(id));
});

test("N3: STATUS DRIFT — Stripe cancelled it while the row still granted", async () => {
  const id = subId("n3");
  // Seed a row that says the member is active.
  await db.execute(sql`
    INSERT INTO plan_memberships (id, user_id, plan_key, status, source, stripe_subscription_id,
                                  current_period_end)
    VALUES (${crypto.randomUUID()}, ${userId}, ${PLAN}, 'active', 'stripe', ${id},
            NOW() + INTERVAL '365 days')`);

  const res = await pass([sub({ id, status: "canceled" })]);

  const rows = await rowFor(id);
  assert.equal(rows.length, 1, "still exactly one row — ON CONFLICT, never a second");
  assert.equal(rows[0].status, "cancelled", "the row must follow Stripe");
  assert.ok(res.membershipHandOffs.includes(id));
  assert.equal(res.exceptions.filter((e) => e.rail === "membership").length, 0);
});

test("N4: AGREEMENT is not drift — a matching row is untouched and unreported", async () => {
  const id = subId("n4");
  await db.execute(sql`
    INSERT INTO plan_memberships (id, user_id, plan_key, status, source, stripe_subscription_id,
                                  current_period_end)
    VALUES (${crypto.randomUUID()}, ${userId}, ${PLAN}, 'active', 'stripe', ${id},
            NOW() + INTERVAL '365 days')`);

  const res = await pass([sub({ id, status: "active" })]);

  assert.equal(res.exceptions.filter((e) => e.rail === "membership").length, 0);
  assert.ok(!res.membershipHandOffs.includes(id), "an agreeing row needs no hand-off");
  assert.equal(res.checkedSubscriptions, 1, "it was still EXAMINED — that is the tally's point");
});

test("N5: §13 — a MANUAL grant for the SAME user and plan survives a hand-off beside it", async () => {
  // The realistic collision, and the one worth proving: the member holds a manual grant for
  // plus_annual AND a Stripe subscription arrives for plus_annual. The hand-off must create the
  // stripe row WITHOUT disturbing the manual one — they are different records of different origin
  // and `getActiveMembership` legitimately sees both.
  //
  // An EARLIER version of this test used a different plan and asserted only that the manual row was
  // untouched. It passed even with the rail's `stripe_subscription_id IS NOT NULL` clause deleted,
  // so it proved nothing about the protection it named — the vacuous shape §18d exists to refuse.
  const manualId = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO plan_memberships (id, user_id, plan_key, status, source, current_period_end)
    VALUES (${manualId}, ${userId}, ${PLAN}, 'active', 'manual', NOW() + INTERVAL '30 days')`);

  const id = subId("n5");
  const res = await pass([sub({ id, status: "active" })]);

  // The manual grant is byte-for-byte what it was: same status, same source, NO subscription id.
  const still = await db.execute(sql`
    SELECT status, source, plan_key, stripe_subscription_id AS sub
      FROM plan_memberships WHERE id = ${manualId}`);
  const row = still.rows?.[0] as any;
  assert.equal(row?.status, "active", "the manual grant must be untouched");
  assert.equal(row?.source, "manual");
  assert.equal(row?.plan_key, PLAN);
  assert.equal(row?.sub, null, "the hand-off must never adopt a manual grant by stamping it");

  // And the stripe row was created BESIDE it, not instead of it.
  const stripeRows = await rowFor(id);
  assert.equal(stripeRows.length, 1);
  assert.equal(stripeRows[0].source, "stripe");
  assert.ok(res.membershipHandOffs.includes(id));

  // Nothing about the manual grant was ever reported as drift.
  const accused = res.exceptions.filter(
    (e) => e.rail === "membership" && JSON.stringify(e.details ?? {}).includes(manualId),
  );
  assert.equal(accused.length, 0);
});

test("N6: §13 — an INCOMPLETE subscription with no row is not drift and invents nothing", async () => {
  const id = subId("n6");
  const res = await pass([sub({ id, status: "incomplete" })]);

  assert.equal((await rowFor(id)).length, 0, "an abandoned checkout must not manufacture a row");
  assert.equal(res.exceptions.filter((e) => e.rail === "membership").length, 0);
  assert.ok(!res.membershipHandOffs.includes(id));
});

test("N7: §17 rule 2 — the tally reaches reconciliation_runs.checked_subscriptions", async () => {
  const id = subId("n7");
  const res = await pass([sub({ id, status: "active" })]);
  assert.equal(res.checkedSubscriptions, 1);
  assert.ok(res.runId, "a pass must record a run row");

  const r = await db.execute(sql`
    SELECT checked_subscriptions AS n FROM reconciliation_runs WHERE id = ${res.runId}`);
  assert.equal(
    (r.rows?.[0] as any)?.n,
    1,
    "the tally must be DURABLE, or a scheduled pass leaves no record of this rail's work",
  );
});

test("N8: a second pass converges nothing new — the writer's ON CONFLICT makes it repeatable", async () => {
  const id = subId("n8");
  const first = await pass([sub({ id, status: "active" })]);
  assert.ok(first.membershipHandOffs.includes(id));

  const second = await pass([sub({ id, status: "active" })]);

  assert.equal((await rowFor(id)).length, 1, "a repeat pass must not insert a second row");
  assert.ok(!second.membershipHandOffs.includes(id), "nothing left to converge");
  assert.equal(second.exceptions.filter((e) => e.rail === "membership").length, 0);
});
