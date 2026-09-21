/**
 * membership-writer.db.test.ts — ledger `2026-09-21-membership-writer`.
 *
 * Locked Decision 26 reserved `plan_memberships` as "READ here (`isActivePlus`) and WRITTEN later
 * by the separate Plus-checkout lane from the Stripe subscription webhook". Until this lane the
 * table had NO writer in `server/` at all, and subscription events fell through the webhook
 * router to "Unhandled event type" — a Stripe subscription granted nothing.
 *
 * WHAT THIS PROVES (needs a database — it asserts on real rows and a real unique index):
 *   M1  a subscription records an ACTIVE membership the reader then sees.
 *   M2  REDELIVERY IS IDEMPOTENT — the load-bearing one. Stripe redelivers routinely; without
 *       migration 316's partial unique index this would insert a second row and
 *       `getActiveMembership`'s "most-recent period wins" would decide an entitlement by a race.
 *   M3  cancellation flows through the SAME writer and stops the reader granting.
 *   M4  past_due maps to `lapsed`, NOT active — the platform must not grant a paid entitlement on
 *       an unpaid period, even while Stripe still considers the subscription alive.
 *   M5  an unresolvable user or plan key writes NOTHING and NAMES why (§13) — never a row filed
 *       under a nearest-looking plan.
 *   M6  a plan key outside the recurring set is refused. Trip Pass is per-trip by LD 26 and must
 *       never land in this table.
 *
 * Run: DATABASE_URL=… npx tsx --test server/__tests__/membership-writer.db.test.ts
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  upsertStripeMembership,
  mapStripeSubscriptionStatus,
} from "../services/plan-membership-writer.service";
import { getActiveMembership } from "../services/plan-membership.service";

const RUN = crypto.randomUUID().slice(0, 8);
const userId = crypto.randomUUID();
const subId = `sub_${RUN}`;
const customerId = `cus_${RUN}`;

async function rowCount(subscriptionId: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM plan_memberships WHERE stripe_subscription_id = ${subscriptionId}`);
  return (r.rows?.[0] as any)?.n ?? 0;
}

after(async () => {
  await db.execute(sql`DELETE FROM plan_memberships WHERE stripe_subscription_id LIKE ${`sub_${RUN}%`}`);
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
});

test("M1: a Stripe subscription records an active membership the reader sees", async () => {
  await db.execute(sql`
    INSERT INTO users (id, email, role, stripe_customer_id)
    VALUES (${userId}, ${`mw-${RUN}@test.local`}, 'traveler', ${customerId})`);

  const result = await upsertStripeMembership({
    subscriptionId: subId,
    status: "active",
    currentPeriodStart: Math.floor(Date.now() / 1000) - 86_400,
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 86_400 * 365,
    metadataUserId: userId,
    metadataPlanKey: "plus_annual",
    customerId,
  });

  assert.equal(result.written, true);
  assert.equal(result.written && result.planKey, "plus_annual");
  const membership = await getActiveMembership(userId, "plus_annual");
  assert.ok(membership, "the existing reader must now see the membership");
  assert.equal(membership!.source, "stripe", "a webhook-written row is sourced 'stripe', never 'manual'");
});

test("M2: REDELIVERY IS IDEMPOTENT — one subscription, one row", async () => {
  // Stripe redelivers webhooks as a matter of course. Without migration 316's partial unique
  // index this inserts a second row and the reader picks between duplicates by period.
  for (let i = 0; i < 3; i++) {
    await upsertStripeMembership({
      subscriptionId: subId,
      status: "active",
      currentPeriodStart: Math.floor(Date.now() / 1000) - 86_400,
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 86_400 * 365,
      metadataUserId: userId,
      metadataPlanKey: "plus_annual",
      customerId,
    });
  }
  assert.equal(await rowCount(subId), 1, "three deliveries of one subscription must be ONE row");
});

test("M3: cancellation flows through the SAME writer and stops the grant", async () => {
  const r = await upsertStripeMembership({
    subscriptionId: subId,
    status: "canceled",
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 86_400,
    metadataUserId: userId,
    metadataPlanKey: "plus_annual",
    customerId,
  });
  assert.equal(r.written && r.status, "cancelled");
  assert.equal(await rowCount(subId), 1, "cancellation updates the row, never adds one");
  assert.equal(
    await getActiveMembership(userId, "plus_annual"),
    null,
    "a cancelled membership must stop granting even before its period ends",
  );
});

test("M4: past_due is LAPSED, not active — no grant on an unpaid period", () => {
  assert.equal(mapStripeSubscriptionStatus("past_due"), "lapsed");
  assert.equal(mapStripeSubscriptionStatus("unpaid"), "lapsed");
  assert.equal(mapStripeSubscriptionStatus("incomplete"), "lapsed");
  assert.equal(mapStripeSubscriptionStatus("active"), "active");
  assert.equal(mapStripeSubscriptionStatus("trialing"), "active");
  assert.equal(mapStripeSubscriptionStatus("canceled"), "cancelled");
  // An unrecognised status must fail SAFE — lapsed grants nothing.
  assert.equal(mapStripeSubscriptionStatus("something_stripe_added_later"), "lapsed");
});

test("M5: an unresolvable user or plan writes NOTHING and names why (§13)", async () => {
  const noUser = await upsertStripeMembership({
    subscriptionId: `sub_${RUN}_nouser`,
    status: "active",
    metadataUserId: crypto.randomUUID(),
    metadataPlanKey: "plus_annual",
    customerId: `cus_${RUN}_absent`,
  });
  assert.equal(noUser.written, false);
  assert.equal(!noUser.written && noUser.reason, "no_user");
  assert.equal(await rowCount(`sub_${RUN}_nouser`), 0, "a refused write must leave no row");

  const noPlan = await upsertStripeMembership({
    subscriptionId: `sub_${RUN}_noplan`,
    status: "active",
    metadataUserId: userId,
    metadataPlanKey: null,
    customerId,
  });
  assert.equal(noPlan.written, false);
  assert.equal(!noPlan.written && noPlan.reason, "no_plan_key");
  assert.equal(await rowCount(`sub_${RUN}_noplan`), 0);
});

test("M6: Trip Pass may never land in plan_memberships (LD 26 keeps it per-trip)", async () => {
  const r = await upsertStripeMembership({
    subscriptionId: `sub_${RUN}_trippass`,
    status: "active",
    metadataUserId: userId,
    metadataPlanKey: "trip_pass",
    customerId,
  });
  assert.equal(r.written, false, "trip_pass is not a recurring plan and must be refused");
  assert.equal(!r.written && r.reason, "no_plan_key");
  assert.equal(await rowCount(`sub_${RUN}_trippass`), 0);
});
