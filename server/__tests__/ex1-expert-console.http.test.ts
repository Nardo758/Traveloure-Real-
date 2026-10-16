/**
 * EX-1 — expert console bugs (Track A; ledger row in the same PR).
 *
 *   X1  GET /api/expert/profile is the OWNER's read: anonymous ⇒ 401.
 *   X2  A PENDING expert (application not approved) saves headline / bio / city, "reloads", and
 *       reads them back through GET /api/expert/profile — while the public /api/experts/:id is
 *       still a 404 for them, which is exactly why the editor used to blank every save.
 *   X3  POST /api/admin/expert-applications/:id/rescore: anonymous ⇒ 401, a non-admin ⇒ 403, an
 *       unknown id ⇒ 404; an admin ⇒ 200 with a knowledge score, written by the ONE UPDATE onto
 *       the SAME form row (a repeat adds no row) and audit-logged once per call.
 *   X4  The expert console slot rails derive end_time = start + the listing's duration, and store
 *       NULL when either is missing (a range slot has no start) — never a guessed default.
 *
 * Run against a disposable dev database only, with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/ex1-expert-console.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const EXPERT_EMAIL = `ex1-expert-${RUN}@traveloure.test`;
const ADMIN_EMAIL = `ex1-admin-${RUN}@traveloure.test`;

let expertCookie = "";
let expertId = "";
let adminCookie = "";
let formId = "";
const serviceWithDuration = crypto.randomUUID();
const serviceNoDuration = crypto.randomUUID();

async function register(email: string): Promise<{ cookie: string; id: string }> {
  const actor = await registerAndSignIn({ baseUrl: BASE_URL, email, password: PASSWORD, firstName: "Ex", lastName: "One" });
  return { cookie: actor.cookie, id: actor.id };
}

async function call(method: string, path: string, cookie: string | null, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");

  ({ cookie: expertCookie, id: expertId } = await register(EXPERT_EMAIL));
  await pool.query(`UPDATE users SET role = 'travel_expert' WHERE id = $1`, [expertId]);
  formId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO local_expert_forms (id, user_id, status, city, knowledge_proof_answers)
     VALUES ($1, $2, 'pending', 'Kyoto', '[]'::jsonb)`,
    [formId, expertId],
  );

  const admin = await register(ADMIN_EMAIL);
  adminCookie = admin.cookie;
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.id]);

  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method, duration_minutes)
     VALUES ($1, $3, 'EX-1 timed tour', '50.00', 'active', 'approved', 'in_person', 90),
            ($2, $3, 'EX-1 untimed tour', '50.00', 'active', 'approved', 'in_person', NULL)`,
    [serviceWithDuration, serviceNoDuration, expertId],
  );
});

after(async () => {
  try {
    await pool.query(`DELETE FROM vendor_availability_slots WHERE service_id = ANY($1)`, [[serviceWithDuration, serviceNoDuration]]);
    await pool.query(`DELETE FROM provider_services WHERE id = ANY($1)`, [[serviceWithDuration, serviceNoDuration]]);
    await pool.query(`DELETE FROM access_audit_logs WHERE resource_id = $1`, [formId]);
    await pool.query(`DELETE FROM local_expert_forms WHERE user_id = $1`, [expertId]);
    await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [[EXPERT_EMAIL, ADMIN_EMAIL]]);
  } finally {
    await pool.end();
  }
});

test("X1: the owner profile read refuses an anonymous caller", async () => {
  const res = await call("GET", "/api/expert/profile", null);
  assert.equal(res.status, 401, res.text);
});

test("X2: a pending expert's headline, bio and city save and read back on reload", async () => {
  const saved = await call("PATCH", "/api/expert/profile", expertCookie, {
    headline: "Tea-house mornings in Higashiyama",
    bio: "Born in Kyoto, I walk guests through the quiet lanes.",
    city: "Kyoto",
  });
  assert.equal(saved.status, 200, saved.text);

  // The public profile is still closed to an unapproved expert — the old read path.
  const publicRead = await call("GET", `/api/experts/${expertId}`, null);
  assert.equal(publicRead.status, 404, "an unapproved expert has no public profile");

  // A "reload" is a fresh read of the owner endpoint.
  for (let i = 0; i < 2; i++) {
    const read = await call("GET", "/api/expert/profile", expertCookie);
    assert.equal(read.status, 200, read.text);
    assert.equal(read.json.headline, "Tea-house mornings in Higashiyama");
    assert.equal(read.json.bio, "Born in Kyoto, I walk guests through the quiet lanes.");
    assert.equal(read.json.city, "Kyoto");
    assert.ok(!("userId" in read.json) && !("email" in read.json), "an explicit field list, never a spread row");
  }
});

test("X3: the admin re-score is admin-only, idempotent on the form row, and audit-logged", async () => {
  assert.equal((await call("POST", `/api/admin/expert-applications/${formId}/rescore`, null)).status, 401);
  assert.equal((await call("POST", `/api/admin/expert-applications/${formId}/rescore`, expertCookie)).status, 403);
  assert.equal(
    (await call("POST", `/api/admin/expert-applications/${crypto.randomUUID()}/rescore`, adminCookie)).status,
    404,
  );

  const first = await call("POST", `/api/admin/expert-applications/${formId}/rescore`, adminCookie);
  assert.equal(first.status, 200, first.text);
  assert.ok(first.json.knowledgeScore?.verdict, "the score is returned");
  const r1 = await pool.query(`SELECT knowledge_score, knowledge_scored_at FROM local_expert_forms WHERE user_id = $1`, [expertId]);
  assert.equal(r1.rows.length, 1);
  assert.ok(r1.rows[0].knowledge_scored_at, "the score is written onto the form row");

  const second = await call("POST", `/api/admin/expert-applications/${formId}/rescore`, adminCookie);
  assert.equal(second.status, 200, second.text);
  const r2 = await pool.query(`SELECT knowledge_scored_at FROM local_expert_forms WHERE user_id = $1`, [expertId]);
  assert.equal(r2.rows.length, 1, "a repeat overwrites — it never adds a row");
  assert.ok(new Date(r2.rows[0].knowledge_scored_at) >= new Date(r1.rows[0].knowledge_scored_at));

  const audit = await pool.query(
    `SELECT action, target_user_id FROM access_audit_logs WHERE resource_id = $1 AND action = 'expert_application_rescore'`,
    [formId],
  );
  assert.equal(audit.rows.length, 2, "one audit row per re-score");
  assert.equal(audit.rows[0].target_user_id, expertId);
});

test("X4: console slots derive end_time from the listing's duration, else NULL", async () => {
  const timed = await call("POST", `/api/me/services/${serviceWithDuration}/slots`, expertCookie, {
    date: futureDate(10),
    startTime: "09:00",
  });
  assert.equal(timed.status, 201, timed.text);
  assert.equal(timed.json.endTime, "10:30");

  const noStart = await call("POST", `/api/me/services/${serviceWithDuration}/slots`, expertCookie, { date: futureDate(11) });
  assert.equal(noStart.status, 201, noStart.text);
  assert.equal(noStart.json.endTime, null, "no start time ⇒ no end time");

  const noDuration = await call("POST", `/api/me/services/${serviceNoDuration}/slots`, expertCookie, {
    date: futureDate(10),
    startTime: "09:00",
  });
  assert.equal(noDuration.status, 201, noDuration.text);
  assert.equal(noDuration.json.endTime, null, "no duration ⇒ no end time, never a default");

  const range = await call("POST", `/api/me/services/${serviceWithDuration}/slots/range`, expertCookie, {
    startDate: futureDate(20),
    endDate: futureDate(22),
  });
  assert.equal(range.status, 201, range.text);
  assert.ok(range.json.slots.length > 0);
  for (const slot of range.json.slots) assert.equal(slot.endTime, null, "a range slot has no start, so no end");
});
