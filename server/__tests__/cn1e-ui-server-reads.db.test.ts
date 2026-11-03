/**
 * CN-1e-UI-s (ledger `2026-11-02-cn1e-ui-server-reads`): the two reads the task-log screens need.
 *
 *   S1  GET /api/expert/bookings rows carry service: { id, serviceName, serviceType } and nothing more; a booking with
 *       no listing carries service null
 *   S2  a task's events carry the note stored on that event: the expert's note on done / could-not-get round-trips;
 *       every other event's note is null; the task-level note is unchanged
 *
 * Run (server on :5000 for S1, disposable DB):
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cn1e-ui-server-reads.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { grantConciergeAdvisorOnAccept } from "../services/concierge-engagement.service";
import { createConciergeTask, listConciergeTasks, transitionConciergeTask } from "../services/concierge-task-log.service";
import { registerAndSignIn } from "./fixtures/register-and-sign-in";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const P = `cn1eui-${RUN}`;
const traveler = `${P}-trav`;
const trip = `${P}-trip`;
const svc = `${P}-svc`;
const svcPlanning = `${P}-svc-plan`;
const kindErrand = `${P}-errand`;
const bConcierge = `${P}-b-conc`;
const bPlanning = `${P}-b-plan`;
const bNoListing = `${P}-b-none`;
let expert = "";
let expertCookie = "";

async function booking(id: string, serviceId: string | null, status = "confirmed") {
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, booking_details, total_amount, platform_fee, insurance_fee, provider_earnings, status)
    VALUES (${id}, ${serviceId}, ${traveler}, ${expert}, ${trip}, '{}'::jsonb, '80.00', '0.00', '0.00', '80.00', ${status})
  `);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  assert.equal((await fetch(`${BASE_URL}/api/health`)).status, 200, "dev server must be running on :5000");
  const exp = await registerAndSignIn({
    baseUrl: BASE_URL, email: `${P}-exp@t.test`, password: "TestPass123!", firstName: "Aya",
    extra: { intent: "supply", supplyRole: "provider", provider: { businessName: "Fixture", category: "other", city: "Kyoto" } },
  });
  expert = exp.id;
  expertCookie = exp.cookie;
  await db.execute(sql`UPDATE users SET role = 'local_expert' WHERE id = ${expert}`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, role) VALUES (${traveler}, ${`${traveler}@t.test`}, 'Tra', 'traveler')`);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, status, identity_verification_status, stripe_connect_status, city, destinations)
    VALUES (${crypto.randomUUID()}, ${expert}, 'Aya', 'approved', 'verified', 'complete', 'Kyoto', '[]'::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone)
    VALUES (${trip}, ${traveler}, 'Open', 'Kyoto', '2027-06-01', '2027-06-05', 'Asia/Tokyo')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, service_type, status, approval_status, delivery_method) VALUES
      (${svc}, ${expert}, 'Local concierge', '80.00', 'concierge', 'active', 'approved', 'async_messaging'),
      (${svcPlanning}, ${expert}, 'Plan review', '80.00', 'planning', 'active', 'approved', 'async_messaging')
  `);
  await db.execute(sql`INSERT INTO concierge_task_kinds (id, label, domain, sort_order, active) VALUES (${kindErrand}, 'Errand', 'errands', 1, true)`);
  await db.execute(sql`INSERT INTO provider_service_concierge_tasks (id, service_id, task_kind_id, cap) VALUES (${`${P}-o1`}, ${svc}, ${kindErrand}, NULL)`);
  await booking(bConcierge, svc);
  await booking(bPlanning, svcPlanning);
  await booking(bNoListing, null);
  await grantConciergeAdvisorOnAccept({ tripId: trip, localExpertId: expert });
});

after(async () => {
  await db.execute(sql`DELETE FROM concierge_task_events WHERE service_booking_id IN (${bConcierge})`).catch(() => {});
  await db.execute(sql`DELETE FROM concierge_tasks WHERE service_booking_id IN (${bConcierge})`).catch(() => {});
  await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${traveler}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_service_concierge_tasks WHERE service_id = ${svc}`).catch(() => {});
  await db.execute(sql`DELETE FROM concierge_task_kinds WHERE id = ${kindErrand}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${svc}, ${svcPlanning})`).catch(() => {});
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${expert}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${traveler}, ${expert})`).catch(() => {});
  await pool.end().catch(() => {});
});

test("S1 expert bookings carry service { id, serviceName, serviceType } only; no listing ⇒ null", async () => {
  const res = await fetch(`${BASE_URL}/api/expert/bookings`, { headers: { cookie: expertCookie } });
  assert.equal(res.status, 200);
  const rows = (await res.json()) as Array<{ id: string; service: any }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const conc = byId.get(bConcierge)!;
  assert.deepEqual(conc.service, { id: svc, serviceName: "Local concierge", serviceType: "concierge" });
  assert.deepEqual(Object.keys(conc.service).sort(), ["id", "serviceName", "serviceType"], "no extra listing fields");
  assert.deepEqual(byId.get(bPlanning)!.service, { id: svcPlanning, serviceName: "Plan review", serviceType: "planning" });
  assert.equal(byId.get(bNoListing)!.service, null);
});

test("S2 events carry their own note: done / could-not-get round-trip; others null; task note unchanged", async () => {
  const a = await createConciergeTask(bConcierge, traveler, { taskKindId: kindErrand, title: "Pick up tickets", note: "Two adults" });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const aId = (a.body as any).id;
  assert.equal((await transitionConciergeTask(aId, traveler, "traveler_ok")).status, 200);
  assert.equal((await transitionConciergeTask(aId, expert, "done", { note: "Collected at the box office" })).status, 200);

  const b = await createConciergeTask(bConcierge, traveler, { taskKindId: kindErrand, title: "Find a florist" });
  const bId = (b.body as any).id;
  assert.equal((await transitionConciergeTask(bId, traveler, "traveler_ok")).status, 200);
  assert.equal((await transitionConciergeTask(bId, expert, "could_not_get", { note: "Closed for the holiday" })).status, 200);

  const list = await listConciergeTasks(bConcierge, traveler);
  assert.equal(list.status, 200);
  const tasks = (list.body as any).tasks as any[];
  const ta = tasks.find((t) => t.id === aId);
  const tb = tasks.find((t) => t.id === bId);
  assert.deepEqual(ta.events.map((e: any) => [e.toState, e.note]), [["requested", null], ["traveler_ok", null], ["done", "Collected at the box office"]]);
  assert.deepEqual(tb.events.map((e: any) => [e.toState, e.note]), [["requested", null], ["traveler_ok", null], ["could_not_get", "Closed for the holiday"]]);
  assert.equal(ta.note, "Two adults", "the task-level note is the traveler's, unchanged");
  assert.equal(tb.note, null);
  for (const e of [...ta.events, ...tb.events]) {
    assert.deepEqual(Object.keys(e).sort(), ["actorType", "createdAt", "fromState", "note", "toState"]);
  }
});
