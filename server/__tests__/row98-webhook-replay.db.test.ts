/**
 * Row 98 (ledger `2026-10-30-row98-webhook-dedupe-replay`): POST /api/admin/webhook-events/:stripeEventId/replay re-runs a
 * FAILED event only, never one marked processed. Synthetic rows only; the replayed event's dispute charge is expanded,
 * so no Stripe call is made.
 *
 *   W5  a failed Connect claim replays once and completes; a processed event is refused replay_already_completed; a
 *       claim with no error is refused replay_not_failed; an unknown one is replay_not_found; a bad body is 400
 *   W6  a non-admin is 403 and an anonymous caller 401, and nothing runs
 *
 * Run against a disposable dev database with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row98-webhook-replay.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const PREFIX = `evt_r98r_${RUN}`;
let adminCookie = "";
let userCookie = "";
const userIds: string[] = [];

function disputeEvent(id: string) {
  return {
    id,
    type: "charge.dispute.created",
    data: { object: { id: `dp_r98r_${RUN}_${id.slice(-4)}`, status: "needs_response", amount: 100, charge: { id: `ch_r98r_${RUN}`, payment_intent: null, metadata: {} } } },
  };
}
async function seed(suffix: string, state: { error: string | null; completed: boolean }) {
  const id = `${PREFIX}_${suffix}`;
  await pool.query(
    `INSERT INTO platform_webhook_consumers (stripe_event_id, consumer, event_type, raw_payload, error, completed_at, created_at)
     VALUES ($1, 'connect', 'charge.dispute.created', $2::jsonb, $3, CASE WHEN $4 THEN NOW() ELSE NULL END, NOW() - interval '2 hours')`,
    [id, JSON.stringify(disputeEvent(id)), state.error, state.completed],
  );
  return id;
}
async function replay(id: string, cookie: string | null, body: unknown = { consumer: "connect" }) {
  const res = await fetch(`${BASE_URL}/api/admin/webhook-events/${id}/replay`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json };
}
async function row(id: string) {
  return (await pool.query(`SELECT completed_at, error FROM platform_webhook_consumers WHERE stripe_event_id = $1 AND consumer = 'connect'`, [id])).rows[0];
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  const admin = await registerAndSignIn({ baseUrl: BASE_URL, email: `r98r-${RUN}-admin@traveloure.test`, password: "TestPass123!", firstName: "Row", lastName: "Admin", extra: { intent: "supply" } });
  adminCookie = admin.cookie;
  userIds.push(admin.id);
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.id]);
  const user = await registerAndSignIn({ baseUrl: BASE_URL, email: `r98r-${RUN}-user@traveloure.test`, password: "TestPass123!", firstName: "Row", lastName: "User", extra: { intent: "supply" } });
  userCookie = user.cookie;
  userIds.push(user.id);
});

after(async () => {
  await pool.query(`DELETE FROM platform_webhook_consumers WHERE stripe_event_id LIKE $1`, [`${PREFIX}_%`]).catch(() => {});
  await pool.query(`DELETE FROM webhook_events WHERE stripe_event_id LIKE $1`, [`${PREFIX}_%`]).catch(() => {});
  await pool.query(`DELETE FROM stripe_dispute_lifecycle WHERE dispute_id LIKE $1`, [`dp_r98r_${RUN}%`]).catch(() => {});
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]).catch(() => {});
  await pool.end();
});

test("W6 a non-admin is 403 and an anonymous caller 401; nothing runs", async () => {
  const id = await seed("w6", { error: "boom", completed: false });
  assert.equal((await replay(id, userCookie)).status, 403);
  assert.equal((await replay(id, null)).status, 401);
  const r = await row(id);
  assert.equal(r.completed_at, null);
  assert.equal(r.error, "boom");
});

test("W5 a failed event replays once; a processed one is refused", async () => {
  const failed = await seed("fail", { error: "handler failed", completed: false });
  const ok = await replay(failed, adminCookie);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.deepEqual(ok.json, { replayed: true, stripeEventId: failed, consumer: "connect" });
  const after = await row(failed);
  assert.ok(after.completed_at, "completed");
  assert.equal(after.error, null);
  const again = await replay(failed, adminCookie);
  assert.equal(again.status, 409);
  assert.equal(again.json.reason, "replay_already_completed");
  const lifecycle = await pool.query(`SELECT count(*)::int AS n FROM stripe_dispute_lifecycle WHERE dispute_id = $1`, [disputeEvent(failed).data.object.id]);
  assert.equal(lifecycle.rows[0].n, 1, "the handler ran once");

  const processed = await seed("done", { error: null, completed: true });
  assert.equal((await replay(processed, adminCookie)).json.reason, "replay_already_completed");
  const live = await seed("live", { error: null, completed: false });
  const notFailed = await replay(live, adminCookie);
  assert.equal(notFailed.status, 409);
  assert.equal(notFailed.json.reason, "replay_not_failed");
  const missing = await replay(`${PREFIX}_missing`, adminCookie);
  assert.equal(missing.status, 404);
  assert.equal(missing.json.reason, "replay_not_found");
  assert.equal((await replay(failed, adminCookie, { consumer: "connect", extra: 1 })).status, 400);
  assert.equal((await replay(failed, adminCookie, {})).status, 400);
});
