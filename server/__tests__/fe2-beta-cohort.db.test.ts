/**
 * FE-2 — the expert rate cohort (decision-maker rulings, Oct 16, 2026; ledger
 * `2026-10-16-fe2-beta-cohort`).
 *
 *   F1 an approval stamps rate_cohort + rate_locked_at and ONE `rate_cohort_assigned` audit row,
 *      in the role change's transaction; a failed cohort audit row rolls the stamp back.
 *   F2 a re-approval never re-stamps or moves the lock date.
 *   F3 the resolver: a cohort expert pays the cohort band; a non-cohort expert the ordinary band;
 *      a per-expert override beats the cohort; a tip is not a planning fee.
 *   F4 an inactive cohort band, or a cohort past its end date, falls back to the ordinary band.
 *   F5 a blank approval setting, or a role outside the three, stamps nothing.
 *   F6 the expert's rate view: the resolver's rate, with the label and lock date only for a cohort.
 *   F7 the admin band PATCH refuses a rate edit while a cohort member exists (422
 *      cohort_band_locked, audited, nothing written) and allows it once none does.
 *   F8 migration 383 (the backfill) stamps approved cohort-role experts at their approval audit
 *      time, skips everyone else, and a second run changes nothing.
 *
 * NO RATE LITERALS: every band expectation is read from fee_bands. The override is a test input.
 * The FE-2 settings and the band row are restored in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? process.env.STRIPE_SECRET_KEY
  : "sk_test_dummy";

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { resolveCommissionRates, clearExpertSplitCache } = await import("../services/commission");
const { updateUserRole } = await import("../services/admin-query.service");
const { stampApprovalCohort, resolveExpertRateView } = await import("../services/expert-rate-cohort.service");
const adminRouter = (await import("../routes/admin.routes")).default;

const SUFFIX = `fe2-${process.pid}`;
const BAND = "expert_beta_2026";
const SETTINGS = ["expert_approval_rate_cohort", "expert_beta_end_date", "expert_rate_change_notice_days"];
const savedSettings = new Map<string, string | null>();
let savedBand: { default_rate: number; is_active: boolean; description: string | null };
let adminId: string;
const created: string[] = [];

async function setSetting(key: string, value: string) {
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value) VALUES (${key}, ${value})
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
  `);
}

async function bandRate(key: string): Promise<number> {
  const r = await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS r FROM fee_bands WHERE band_key = ${key}`);
  return (r.rows[0] as any).r as number;
}

async function makeUser(role: string, tag: string): Promise<string> {
  const r = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`${SUFFIX}-${tag}@traveloure.test`}, ${role})
    RETURNING id
  `);
  const id = String((r.rows[0] as any).id);
  created.push(id);
  return id;
}

async function cohortOf(id: string) {
  const r = await db.execute(sql`SELECT rate_cohort, rate_locked_at FROM users WHERE id = ${id}`);
  return r.rows[0] as { rate_cohort: string | null; rate_locked_at: Date | null };
}

async function cohortAuditCount(id: string): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM access_audit_logs WHERE target_user_id = ${id} AND action = 'rate_cohort_assigned'
  `);
  return (r.rows[0] as any).n as number;
}

async function approve(userId: string, role: string) {
  await updateUserRole(userId, role, { actorId: adminId, actorRole: "admin", reason: "admin_expert_application_approved" }, { assignRateCohort: true });
}

before(async () => {
  for (const key of SETTINGS) {
    const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
    savedSettings.set(key, (r.rows[0] as any)?.setting_value ?? null);
  }
  const b = await db.execute(sql`SELECT CAST(default_rate AS FLOAT) AS default_rate, is_active, description FROM fee_bands WHERE band_key = ${BAND}`);
  assert.ok(b.rows.length, `${BAND} must be seeded (migration 382)`);
  savedBand = b.rows[0] as any;
  await setSetting("expert_approval_rate_cohort", "beta_2026");
  await setSetting("expert_beta_end_date", "");
  await setSetting("expert_rate_change_notice_days", "30");
  adminId = await makeUser("admin", "admin");
  clearExpertSplitCache();
});

after(async () => {
  await db.execute(sql`
    UPDATE fee_bands SET default_rate = ${savedBand.default_rate}, is_active = ${savedBand.is_active},
           description = ${savedBand.description}
     WHERE band_key = ${BAND}
  `);
  for (const [key, value] of savedSettings) {
    if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
    else await setSetting(key, value);
  }
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id IN (${sql.join(created.map((id) => sql`${id}`), sql`, `)})`);
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id = ${adminId} OR target_user_id IN (${sql.join(created.map((id) => sql`${id}`), sql`, `)})`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${sql.join(created.map((id) => sql`${id}`), sql`, `)})`);
  await pool.end();
});

test("F1: approval stamps the cohort, the lock date and one audit row; a failed audit row rolls the stamp back", async () => {
  const expert = await makeUser("user", "f1");
  await approve(expert, "travel_expert");
  const row = await cohortOf(expert);
  assert.equal(row.rate_cohort, "beta_2026");
  assert.ok(row.rate_locked_at, "the lock date is stamped");
  assert.equal(await cohortAuditCount(expert), 1);
  const audit = await db.execute(sql`
    SELECT metadata FROM access_audit_logs WHERE target_user_id = ${expert} AND action = 'rate_cohort_assigned'
  `);
  const meta = (audit.rows[0] as any).metadata;
  assert.equal(meta.cohort, "beta_2026");
  assert.equal(meta.bandKey, BAND);
  assert.equal(meta.platformRate, await bandRate(BAND));

  const second = await makeUser("user", "f1b");
  await assert.rejects(
    db.transaction((tx) => stampApprovalCohort(tx as any, { userId: second, role: "travel_expert", actorId: "no-such-actor", actorRole: "admin" })),
  );
  assert.equal((await cohortOf(second)).rate_cohort, null, "the stamp rolled back with its audit row");
  assert.equal(await cohortAuditCount(second), 0);
});

test("F2: a re-approval never re-stamps or moves the lock date", async () => {
  const expert = await makeUser("user", "f2");
  await approve(expert, "local_expert");
  const first = await cohortOf(expert);
  await approve(expert, "local_expert");
  const again = await cohortOf(expert);
  assert.equal(again.rate_cohort, "beta_2026");
  assert.deepEqual(again.rate_locked_at, first.rate_locked_at);
  assert.equal(await cohortAuditCount(expert), 1);
});

test("F3: the resolver — cohort band; ordinary band; override beats cohort; a tip is not a planning fee", async () => {
  const cohortExpert = await makeUser("user", "f3a");
  await approve(cohortExpert, "event_planner");
  const plainExpert = await makeUser("travel_expert", "f3b");
  const cohortRate = await bandRate(BAND);
  const standardRate = await bandRate("expert_standard");

  const c = await resolveCommissionRates({ category: "default", expertId: cohortExpert });
  assert.equal(c.platformFeeRate, cohortRate);
  assert.equal(Math.round((c.expertShareRate + c.platformFeeRate) * 1e6), 1e6);
  assert.equal((await resolveCommissionRates({ category: "default", expertId: plainExpert })).platformFeeRate, standardRate);
  assert.equal(
    (await resolveCommissionRates({ category: "tip", expertId: cohortExpert })).platformFeeRate,
    await bandRate("tip_handling"),
  );

  await db.execute(sql`UPDATE users SET commission_override_platform_fee_percent = 7 WHERE id = ${cohortExpert}`);
  assert.equal((await resolveCommissionRates({ category: "default", expertId: cohortExpert })).platformFeeRate, 0.07);
  await db.execute(sql`UPDATE users SET commission_override_platform_fee_percent = NULL WHERE id = ${cohortExpert}`);
});

test("F4: an inactive cohort band, or a cohort past its end date, falls back to the ordinary band", async () => {
  const expert = await makeUser("user", "f4");
  await approve(expert, "travel_expert");
  const standardRate = await bandRate("expert_standard");

  await setSetting("expert_beta_end_date", "2020-01-01");
  assert.equal((await resolveCommissionRates({ category: "default", expertId: expert })).platformFeeRate, standardRate);
  const today = new Date().toISOString().slice(0, 10);
  await setSetting("expert_beta_end_date", today);
  assert.equal((await resolveCommissionRates({ category: "default", expertId: expert })).platformFeeRate, await bandRate(BAND));
  await setSetting("expert_beta_end_date", "");

  await db.execute(sql`UPDATE fee_bands SET is_active = false WHERE band_key = ${BAND}`);
  try {
    assert.equal((await resolveCommissionRates({ category: "default", expertId: expert })).platformFeeRate, standardRate);
  } finally {
    await db.execute(sql`UPDATE fee_bands SET is_active = true WHERE band_key = ${BAND}`);
  }
});

test("F5: a blank approval setting, or a role outside the three, stamps nothing", async () => {
  const assistant = await makeUser("user", "f5a");
  await approve(assistant, "executive_assistant");
  assert.equal((await cohortOf(assistant)).rate_cohort, null);

  await setSetting("expert_approval_rate_cohort", "");
  try {
    const expert = await makeUser("user", "f5b");
    await approve(expert, "travel_expert");
    assert.equal((await cohortOf(expert)).rate_cohort, null);
    assert.equal(await cohortAuditCount(expert), 0);
  } finally {
    await setSetting("expert_approval_rate_cohort", "beta_2026");
  }
});

test("F6: the rate view — the resolver's rate, the label and lock date only for a cohort", async () => {
  const expert = await makeUser("user", "f6a");
  await approve(expert, "travel_expert");
  const view = await resolveExpertRateView(expert);
  assert.equal(view.platformRate, await bandRate(BAND));
  assert.equal(view.cohortLabel, "beta");
  assert.equal(view.basis, "cohort");
  assert.equal(view.lockedAt, new Date((await cohortOf(expert)).rate_locked_at!).toISOString());

  const plain = await makeUser("travel_expert", "f6b");
  const plainView = await resolveExpertRateView(plain);
  assert.equal(plainView.platformRate, await bandRate("expert_standard"));
  assert.equal(plainView.cohortLabel, null);
  assert.equal(plainView.basis, "standard");

  await db.execute(sql`UPDATE users SET commission_override_platform_fee_percent = 9 WHERE id = ${expert}`);
  const overridden = await resolveExpertRateView(expert);
  assert.equal(overridden.platformRate, 0.09);
  assert.equal(overridden.cohortLabel, null);
  assert.equal(overridden.basis, "override");
  await db.execute(sql`UPDATE users SET commission_override_platform_fee_percent = NULL WHERE id = ${expert}`);
});

function patchHandler() {
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === "/api/admin/fee-bands/:bandKey" && l.route?.methods?.patch,
  );
  assert.ok(layer, "the fee-band PATCH route is registered");
  return layer.route.stack.at(-1).handle;
}

function capture() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function patchRequest(body: Record<string, unknown>) {
  return { params: { bandKey: BAND }, body, user: { claims: { sub: adminId } }, ip: "127.0.0.1", get: () => "fe2-test" };
}

test("F7: a rate edit on a band a cohort member pays is refused, audited and writes nothing", async () => {
  const expert = await makeUser("user", "f7");
  await approve(expert, "travel_expert");
  const rateBefore = await bandRate(BAND);
  const handler = patchHandler();

  const res = capture();
  await handler(patchRequest({ defaultRate: rateBefore + 0.01, confirm: true }) as any, res as any);
  assert.equal(res.statusCode, 422, JSON.stringify(res.body));
  assert.equal(res.body.code, "cohort_band_locked");
  assert.equal(await bandRate(BAND), rateBefore, "the rate did not move");
  const refused = await db.execute(sql`
    SELECT count(*)::int AS n FROM access_audit_logs
     WHERE actor_id = ${adminId} AND action = 'fee_band_rate_edit_refused' AND resource_id = ${BAND}
  `);
  assert.ok((refused.rows[0] as any).n >= 1, "the refusal is audited");

  // A non-rate edit is still allowed.
  const ok = capture();
  await handler(patchRequest({ description: "FE-2 description edit" }) as any, ok as any);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));

  // With no cohort member left, the rate may change again.
  const members = await db.execute(sql`SELECT id FROM users WHERE rate_cohort = 'beta_2026'`);
  const memberIds = (members.rows as any[]).map((r) => String(r.id));
  const foreign = memberIds.filter((id) => !created.includes(id));
  if (foreign.length === 0) {
    await db.execute(sql`UPDATE users SET rate_cohort = NULL WHERE rate_cohort = 'beta_2026'`);
    const freed = capture();
    await handler(patchRequest({ defaultRate: rateBefore + 0.01, confirm: true }) as any, freed as any);
    assert.equal(freed.statusCode, 200, JSON.stringify(freed.body));
    assert.equal(await bandRate(BAND), rateBefore + 0.01);
  }
});

test("F8: the backfill (migration 383) stamps approved cohort-role experts at their approval time, once", async () => {
  const backfill = readFileSync(
    fileURLToPath(new URL("../migrations/383_expert_rate_cohort_backfill.sql", import.meta.url)),
    "utf8",
  );
  const approved = await makeUser("local_expert", "f8a");
  const noForm = await makeUser("local_expert", "f8b");
  const pending = await makeUser("travel_expert", "f8c");
  const assistant = await makeUser("executive_assistant", "f8d");
  const noAudit = await makeUser("event_planner", "f8e");
  for (const [id, status] of [[approved, "approved"], [pending, "pending"], [assistant, "approved"], [noAudit, "approved"]] as const) {
    await db.execute(sql`INSERT INTO local_expert_forms (id, user_id, status) VALUES (gen_random_uuid()::text, ${id}, ${status})`);
  }
  const approvedAt = new Date("2026-09-01T12:00:00Z");
  await db.execute(sql`
    INSERT INTO access_audit_logs (id, actor_id, actor_role, action, resource_type, resource_id, target_user_id, metadata, created_at)
    VALUES (gen_random_uuid()::text, ${adminId}, 'admin', 'role_change', 'user', ${approved}, ${approved},
            ${JSON.stringify({ oldRole: "user", newRole: "local_expert", reason: "admin_expert_application_approved" })}::jsonb,
            ${approvedAt.toISOString()}::timestamp)
  `);

  await db.execute(sql.raw(backfill));
  const a = await cohortOf(approved);
  assert.equal(a.rate_cohort, "beta_2026");
  assert.equal(new Date(a.rate_locked_at!).toISOString(), approvedAt.toISOString());
  assert.equal((await cohortOf(noAudit)).rate_cohort, "beta_2026", "no approval audit row ⇒ now()");
  assert.ok((await cohortOf(noAudit)).rate_locked_at);
  for (const id of [noForm, pending, assistant]) assert.equal((await cohortOf(id)).rate_cohort, null);

  const lockedBefore = (await cohortOf(noAudit)).rate_locked_at;
  await db.execute(sql.raw(backfill));
  assert.deepEqual((await cohortOf(noAudit)).rate_locked_at, lockedBefore, "a second run changes nothing");
});
