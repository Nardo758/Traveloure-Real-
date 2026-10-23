/**
 * Gap 9 screens (ledger `2026-10-22-gap9-payout-admin-screens`): the read fields the admin screens need.
 *   GS1  B — the not-routable list carries no `email`; `reminderCooldownEndsAt` is null before a reminder, and after
 *        one it is the reminder's own time plus the shared 72h constant; a second press inside it is the 429
 *   GS2  D — the provider admin list carries the same `reminderCooldownEndsAt`
 *   GS3  C — owed rows carry `canReceiveTransfer` equal to the payout-request gate's test, the pending/approved
 *        payout count and total, and the display name — and no `email`
 *
 * Synthetic rows only (`@traveloure.test`). Assertions compare fields and counts; nothing prints row contents.
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 server/__tests__/gap9-screens.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";
import { STRIPE_CONNECT_REMINDER_COOLDOWN_MS, STRIPE_CONNECT_REMINDER_TYPE } from "../services/stripe-connect-reminder-policy";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const P = `g9s${RUN}`;
const expertId = `${P}-expert`;
const providerId = `${P}-provider`;
const paidReady = `${P}-ready`;
const paidNot = `${P}-notready`;
const providerFormId = `${P}-form`;
let admin = { id: "", cookie: "" };

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { cookie: admin.cookie } });
  return { status: res.status, json: await res.json().catch(() => null) as any };
}
async function post(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: "{}" });
  return res.status;
}
async function latestReminderAt(userId: string): Promise<number> {
  const r = await pool.query(`SELECT max(created_at) AS t FROM notifications WHERE user_id = $1 AND type = $2`, [userId, STRIPE_CONNECT_REMINDER_TYPE]);
  return new Date(r.rows[0].t).getTime();
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  const a = await registerAndSignIn({ baseUrl: BASE_URL, email: `${P}-admin@traveloure.test`, password: "TestPass123!", firstName: "Gap9", lastName: "Admin", extra: { intent: "supply" } });
  admin = { id: a.id, cookie: a.cookie };
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.id]);
  const insertUser = `INSERT INTO users (id, email, first_name, last_name, role, stripe_account_id, can_receive_payments) VALUES ($1, $2, 'Synthetic', $3, $4, $5, $6)`;
  await pool.query(insertUser, [expertId, `${expertId}@traveloure.test`, "Expert", "travel_expert", null, false]);
  await pool.query(insertUser, [providerId, `${providerId}@traveloure.test`, "Provider", "service_provider", null, false]);
  await pool.query(insertUser, [paidReady, `${paidReady}@traveloure.test`, "Ready", "travel_expert", `acct_${P}`, true]);
  await pool.query(insertUser, [paidNot, `${paidNot}@traveloure.test`, "NotReady", "travel_expert", `acct_${P}x`, false]);
  await pool.query(
    `INSERT INTO local_expert_forms (id, user_id, status, identity_verification_status, stripe_connect_status) VALUES ($1, $2, 'approved', 'pending', 'not_started')`,
    [crypto.randomUUID(), expertId],
  );
  await pool.query(
    `INSERT INTO service_provider_forms (id, user_id, business_name, name, email, mobile, country, address, business_type, status)
     VALUES ($1, $2, 'Synthetic Business', 'Synthetic', $3, '000', 'Nowhere', 'Nowhere', 'LLC', 'approved')`,
    [providerFormId, providerId, `${providerId}@traveloure.test`],
  );
  const past = new Date(Date.now() - 86_400_000).toISOString();
  for (const uid of [paidReady, paidNot]) {
    await pool.query(
      `INSERT INTO expert_earnings (id, expert_id, type, amount, status, dispute_state, available_at) VALUES ($1, $2, 'tip', '100.00', 'releasable', 'none', $3::timestamptz)`,
      [`${uid}-earn`, uid, past],
    );
  }
  await pool.query(
    `INSERT INTO expert_payouts (id, expert_id, amount, status) VALUES ($1, $2, '20.00', 'pending'), ($3, $2, '15.50', 'approved'), ($4, $2, '9.00', 'completed')`,
    [`${P}-po1`, paidReady, `${P}-po2`, `${P}-po3`],
  );
});

after(async () => {
  try {
    const ids = [expertId, providerId, paidReady, paidNot];
    await pool.query(`DELETE FROM access_audit_logs WHERE actor_id = $1`, [admin.id]).catch(() => {});
    await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM expert_payouts WHERE expert_id = ANY($1)`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM expert_earnings WHERE expert_id = ANY($1)`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM service_provider_forms WHERE id = $1`, [providerFormId]).catch(() => {});
    await pool.query(`DELETE FROM local_expert_forms WHERE user_id = ANY($1)`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[...ids, admin.id]]).catch(() => {});
  } finally {
    await pool.end();
  }
});

test("GS1 — not-routable: no email, and the cooldown end matches the 429 window", async () => {
  const first = await get("/api/admin/experts/not-routable");
  assert.equal(first.status, 200);
  assert.ok(first.json.experts.every((r: any) => !("email" in r)), "no email field on any row");
  const mine = first.json.experts.find((r: any) => r.userId === expertId);
  assert.ok(mine);
  assert.equal(mine.reminderCooldownEndsAt, null);

  assert.equal(await post(`/api/admin/experts/${expertId}/remind-stripe`), 200);
  const sentAt = await latestReminderAt(expertId);
  const after = (await get("/api/admin/experts/not-routable")).json.experts.find((r: any) => r.userId === expertId);
  assert.equal(new Date(after.reminderCooldownEndsAt).getTime(), sentAt + STRIPE_CONNECT_REMINDER_COOLDOWN_MS);
  assert.ok(new Date(after.reminderCooldownEndsAt).getTime() > Date.now());
  assert.equal(await post(`/api/admin/experts/${expertId}/remind-stripe`), 429, "a press inside the shown window is the 429");
});

test("GS2 — provider rows carry the same cooldown end", async () => {
  const before = (await get("/api/admin/platform-service-providers")).json.find((p: any) => p.userId === providerId);
  assert.ok(before);
  assert.equal(before.reminderCooldownEndsAt, null);
  assert.equal(await post(`/api/admin/providers/${providerId}/remind-stripe`), 200);
  const sentAt = await latestReminderAt(providerId);
  const row = (await get("/api/admin/platform-service-providers")).json.find((p: any) => p.userId === providerId);
  assert.equal(new Date(row.reminderCooldownEndsAt).getTime(), sentAt + STRIPE_CONNECT_REMINDER_COOLDOWN_MS);
  assert.equal(await post(`/api/admin/providers/${providerId}/remind-stripe`), 429);
});

test("GS3 — owed rows: transfer gate, payouts waiting, name, no email", async () => {
  const r = await get("/api/admin/payouts/owed");
  assert.equal(r.status, 200);
  const ready = r.json.earners.find((e: any) => e.earnerId === paidReady);
  const not = r.json.earners.find((e: any) => e.earnerId === paidNot);
  assert.ok(ready && not);
  for (const row of [ready, not]) assert.equal("email" in row, false);
  // The payout-request gate (payments.routes.ts): a Stripe account id AND can_receive_payments.
  const gate = async (uid: string) => {
    const a = (await pool.query(`SELECT stripe_account_id, can_receive_payments FROM users WHERE id = $1`, [uid])).rows[0];
    return !(!a.stripe_account_id || !a.can_receive_payments);
  };
  assert.equal(ready.canReceiveTransfer, await gate(paidReady));
  assert.equal(not.canReceiveTransfer, await gate(paidNot));
  assert.equal(ready.canReceiveTransfer, true);
  assert.equal(not.canReceiveTransfer, false);
  assert.equal(ready.pendingPayoutCount, 2);
  assert.equal(ready.pendingPayoutTotal, 35.5);
  assert.equal(not.pendingPayoutCount, 0);
  assert.equal(ready.displayName, "Synthetic Ready");
});
