/**
 * CN-1d-UI-s (ledger `2026-11-01-cn1d-ui-server-reads`): the reads the "Hire for this trip" screen needs.
 *
 *   S1  the public GET /api/services/:id of an approved, active concierge listing carries
 *       conciergeTasks (label, domain, linkOnly, cap), conciergePriceLabel and conciergeResponseHoursLabel;
 *       a planning listing carries none of the three; the buy action is "hire" / "Hire for this trip"
 *   S2  the owner's GET /api/trips/:id/expert-advisor carries source and accessUntil (ISO); a legacy
 *       handoff row reads accessUntil null
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cn1d-ui-server-reads.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { registerAndSignIn, SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const PREFIX = `cn1dui-${RUN}`;
const conciergeId = `${PREFIX}-conc`;
const planningId = `${PREFIX}-plan`;
const kindMeals = `${PREFIX}-meals`;
const kindStays = `${PREFIX}-stays`;
const tripConcierge = `${PREFIX}-trip-c`;
const tripHandoff = `${PREFIX}-trip-h`;
const CONCIERGE_KEYS = ["conciergeTasks", "conciergePriceLabel", "conciergeResponseHoursLabel"];
let ownerId = "";
let ownerCookie = "";
let expertId = "";

async function getJson(path: string, cookie?: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: cookie ? { cookie } : {} });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  assert.equal((await fetch(`${BASE_URL}/api/health`)).status, 200, "dev server must be running on :5000");

  const owner = await registerAndSignIn({
    baseUrl: BASE_URL, email: `${PREFIX}-owner@traveloure.test`, password: "TestPass123!", firstName: "Own",
    extra: SUPPLY_PROVIDER_SIGNUP_EXTRA,
  });
  ownerId = owner.id;
  ownerCookie = owner.cookie;
  expertId = `${PREFIX}-exp`;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role) VALUES
      (${expertId}, ${`${expertId}@traveloure.test`}, 'Aya', 'Local', 'local_expert')
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms
      (id, user_id, first_name, last_name, status, identity_verification_status, stripe_connect_status, city, destinations)
    VALUES (${crypto.randomUUID()}, ${expertId}, 'Aya', 'Local', 'approved', 'verified', 'complete', 'Kyoto', '[]'::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO concierge_task_kinds (id, label, domain, sort_order, active) VALUES
      (${kindMeals}, 'Meals fixture', 'meals', 1, true),
      (${kindStays}, 'Stays fixture', 'stays', 2, true)
  `);
  await db.execute(sql`
    INSERT INTO provider_services
      (id, user_id, service_name, price, pricing_unit, response_window_hours, service_type, status, approval_status, delivery_method)
    VALUES
      (${conciergeId}, ${expertId}, 'Local concierge fixture', '120.00', 'per_trip', 6, 'concierge', 'active', 'approved', 'async_messaging'),
      (${planningId}, ${expertId}, 'Planning fixture', '80.00', NULL, 6, 'planning', 'active', 'approved', 'async_messaging')
  `);
  await db.execute(sql`
    INSERT INTO provider_service_concierge_tasks (id, service_id, task_kind_id, cap) VALUES
      (${crypto.randomUUID()}, ${conciergeId}, ${kindMeals}, 3),
      (${crypto.randomUUID()}, ${conciergeId}, ${kindStays}, NULL)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone) VALUES
      (${tripConcierge}, ${ownerId}, 'Concierge trip', 'Kyoto', '2027-04-02', '2027-04-05', 'Asia/Tokyo'),
      (${tripHandoff}, ${ownerId}, 'Handoff trip', 'Kyoto', '2027-05-02', '2027-05-05', 'Asia/Tokyo')
  `);
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, workspace_status, source, access_until, assigned_at) VALUES
      (${crypto.randomUUID()}, ${tripConcierge}, ${expertId}, 'accepted', 'draft', 'concierge', '2027-04-05T15:00:00Z', NOW()),
      (${crypto.randomUUID()}, ${tripHandoff}, ${expertId}, 'accepted', 'draft', 'handoff', NULL, NOW())
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${tripConcierge}, ${tripHandoff})`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id IN (${tripConcierge}, ${tripHandoff})`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${conciergeId}, ${planningId})`).catch(() => {});
  await db.execute(sql`DELETE FROM concierge_task_kinds WHERE id IN (${kindMeals}, ${kindStays})`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${expertId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${expertId}, ${ownerId})`).catch(() => {});
  await pool.end();
});

test("S1 a public concierge read carries its tasks and two labels; a planning read carries none", async () => {
  const conc = await getJson(`/api/services/${conciergeId}`);
  assert.equal(conc.status, 200, JSON.stringify(conc.json));
  assert.deepEqual(conc.json.conciergeTasks, [
    { taskKindKey: kindMeals, label: "Meals fixture", domain: "meals", linkOnly: false, cap: 3 },
    { taskKindKey: kindStays, label: "Stays fixture", domain: "stays", linkOnly: true, cap: null },
  ]);
  assert.equal(conc.json.conciergePriceLabel, "120.00 per trip");
  assert.equal(conc.json.conciergeResponseHoursLabel, "Aims to reply within 6 hours.");
  assert.equal(conc.json.buyAction?.primary?.kind, "hire");
  assert.equal(conc.json.buyAction?.primary?.label, "Hire for this trip");
  assert.equal("userId" in conc.json, false, "the never-fields stay stripped");

  const plan = await getJson(`/api/services/${planningId}`);
  assert.equal(plan.status, 200);
  for (const key of CONCIERGE_KEYS) assert.equal(key in plan.json, false, `planning read carries no ${key}`);
  assert.notEqual(plan.json.buyAction?.primary?.kind, "hire");
});

test("S2 the owner's advisor read carries source and accessUntil; a handoff row reads null", async () => {
  const conc = await getJson(`/api/trips/${tripConcierge}/expert-advisor`, ownerCookie);
  assert.equal(conc.status, 200, JSON.stringify(conc.json));
  const c = conc.json.advisor;
  assert.equal(c.source, "concierge");
  assert.equal(c.accessUntil, "2027-04-05T15:00:00.000Z");
  assert.equal("access_until" in c, false, "the raw column is not published twice");
  assert.equal(conc.json.advisors.length, 1);

  const ho = await getJson(`/api/trips/${tripHandoff}/expert-advisor`, ownerCookie);
  assert.equal(ho.status, 200);
  assert.equal(ho.json.advisor.source, "handoff");
  assert.equal(ho.json.advisor.accessUntil, null);

  const stranger = await getJson(`/api/trips/${tripConcierge}/expert-advisor`);
  assert.notEqual(stranger.status, 200, "still owner-gated");
});
