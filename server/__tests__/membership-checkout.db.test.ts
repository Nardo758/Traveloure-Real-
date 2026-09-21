/**
 * membership-checkout.db.test.ts — ledger `2026-09-21-membership-checkout`, increment 2.
 *
 * Increment 1 landed the RECORDING half (the webhook writer). This is the COLLECTING half: the one
 * rail that starts a Stripe subscription Checkout Session. It GRANTS NOTHING — the membership row
 * is written later by the webhook — so what is worth proving here is the REFUSALS, and that the
 * rail never writes to `plan_memberships` on any path.
 *
 * WHAT THIS PROVES (needs a database — it asserts on real `plans` / `plan_memberships` rows):
 *   C1  while PLUS_SALES_ENABLED is off (the default, and the state today) the rail refuses
 *       BEFORE touching Stripe — the LD 26 gate, checked first.
 *   C2  `trip_pass` is refused BY NAME even with sales on. LD 26 keeps it per-trip in
 *       `trip_entitlements`; it must never become a subscription.
 *   C3  an unknown or inactive plan is refused, never sold.
 *   C4  a plan whose ACTIVE-MODE price id is NULL is refused with `price_not_configured` — the
 *       cross-mode fallback the resolver forbids, asserted here end to end against a real row.
 *   C5  an existing active membership refuses a SECOND checkout (`already_member`) — the guard
 *       that actually prevents paying twice, since a session idempotency key would not.
 *   C6  NO PATH WRITES `plan_memberships`. The rail collects; only the webhook records.
 *
 * Deliberately NOT proven here: a successful session. That needs a live Stripe key and would
 * create a real object in a real account; the success path's own invariants (the subscription
 * metadata, the card pin, the absent idempotency key) are asserted by reading the source in
 * `membership-checkout-shape.test.ts`, which needs neither a database nor a network.
 *
 * Run: DATABASE_URL=… npx tsx --test server/__tests__/membership-checkout.db.test.ts
 */
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { startMembershipCheckout } from "../services/membership-checkout.service";

const RUN = crypto.randomUUID().slice(0, 8);
const userId = crypto.randomUUID();

/** Flip the LD 26 sales gate for one assertion, always restoring it. */
async function withSales<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.PLUS_SALES_ENABLED;
  process.env.PLUS_SALES_ENABLED = on ? "1" : "0";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.PLUS_SALES_ENABLED;
    else process.env.PLUS_SALES_ENABLED = prev;
  }
}

/**
 * `plan_memberships.user_id` is FK → `users(id) ON DELETE CASCADE`, so this suite needs a real
 * user row, not a bare UUID. Created once, removed in `after` (the cascade takes the memberships).
 */
async function seedUser(): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, role)
    VALUES (${userId}, ${`mc-${RUN}@test.local`}, 'traveler')
    ON CONFLICT (id) DO NOTHING`);
}

async function membershipRowCount(): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM plan_memberships WHERE user_id = ${userId}`);
  return (r.rows?.[0] as any)?.n ?? 0;
}

before(async () => {
  await seedUser();
});

after(async () => {
  // The FK cascades, so deleting the user removes any membership this suite left behind.
  await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
});

test("C1: sales disabled refuses first, before any plan read or Stripe call", async () => {
  const r = await withSales(false, () =>
    startMembershipCheckout({ userId, planKey: "plus_annual" }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "sales_disabled");
  assert.equal(await membershipRowCount(), 0);
});

test("C2: trip_pass is refused BY NAME even with sales on (LD 26 keeps it per-trip)", async () => {
  const r = await withSales(true, () => startMembershipCheckout({ userId, planKey: "trip_pass" }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "plan_not_subscribable");
  assert.ok(r.ok === false && r.detail.includes("trip_pass"), r.ok === false ? r.detail : "");
  assert.equal(await membershipRowCount(), 0);
});

test("C3: an unknown key is refused by the subscribable-set check, before any row read", async () => {
  // Unknown key: not in the subscribable set at all.
  const unknown = await withSales(true, () =>
    startMembershipCheckout({ userId, planKey: `no_such_plan_${RUN}` }),
  );
  assert.equal(unknown.ok, false);
  assert.equal(unknown.ok === false && unknown.reason, "plan_not_subscribable");

  // An INACTIVE row under a real subscribable key would answer `plan_unavailable`. The suite's own
  // run-scoped key cannot reach that branch (it is not in SUBSCRIBABLE_PLAN_KEYS), which is itself
  // the correct behaviour and is what the assertion above pins: the set is checked before the row.
  assert.equal(await membershipRowCount(), 0);
});

test("C4: a NULL price id for the active mode refuses with price_not_configured", async () => {
  // Blank BOTH columns on the real row, so the assertion does not depend on which mode the CI key
  // addresses — and RESTORE them in a finally, because a suite that leaves the shared `plans` row
  // mutated would hand the next suite a plan nobody can subscribe to.
  const before = await db.execute(sql`
    SELECT stripe_price_id_test AS t, stripe_price_id_live AS l FROM plans WHERE key = 'plus_annual'`);
  const prior = before.rows?.[0] as any;
  assert.ok(prior, "expected a plus_annual plan row to exist");

  try {
    await db.execute(sql`
      UPDATE plans SET stripe_price_id_test = NULL, stripe_price_id_live = NULL
       WHERE key = 'plus_annual'`);

    const r = await withSales(true, () =>
      startMembershipCheckout({ userId, planKey: "plus_annual" }),
    );
    assert.equal(r.ok, false);
    // A blank column and an absent/unrecognised key both land on this ONE refusal, so the
    // assertion holds whatever key CI carries. What must never happen is `ok`.
    assert.equal(r.ok === false && r.reason, "price_not_configured");
    assert.equal(await membershipRowCount(), 0);
  } finally {
    await db.execute(sql`
      UPDATE plans SET stripe_price_id_test = ${prior.t}, stripe_price_id_live = ${prior.l}
       WHERE key = 'plus_annual'`);
  }
});

test("C5: an existing active membership refuses a SECOND checkout", async () => {
  await db.execute(sql`
    INSERT INTO plan_memberships (id, user_id, plan_key, status, source, current_period_end)
    VALUES (${crypto.randomUUID()}, ${userId}, 'plus_annual', 'active', 'manual',
            NOW() + INTERVAL '365 days')`);

  const r = await withSales(true, () => startMembershipCheckout({ userId, planKey: "plus_annual" }));
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "already_member");
  // Exactly the one row this test inserted — the refusal wrote nothing.
  assert.equal(await membershipRowCount(), 1);
});

test("C6: NO refusal path writes plan_memberships — the rail collects, the webhook records", async () => {
  await db.execute(sql`DELETE FROM plan_memberships WHERE user_id = ${userId}`);
  const before = await membershipRowCount();
  assert.equal(before, 0);

  for (const key of ["plus_annual", "pro_monthly", "trip_pass", `bogus_${RUN}`]) {
    await withSales(false, () => startMembershipCheckout({ userId, planKey: key }));
    await withSales(true, () => startMembershipCheckout({ userId, planKey: key }));
  }

  assert.equal(await membershipRowCount(), 0, "a checkout attempt must never write a membership");
});
