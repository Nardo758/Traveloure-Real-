/**
 * CN-1e: the concierge task log (migration 430), against a real database.
 *
 *   E1  requested → traveler_ok → done, one event row per step with actor type and id; a repeat writes nothing
 *   E2  traveler_ok by the expert, another user or an admin → 403 concierge_task_owner_only; nothing written
 *   E3  done after access_until → 403 concierge_access_ended; done on a pending or cancelled booking → 409
 *   E4  a kind the listing does not offer → 400; cap 2: the third → 409; could_not_get / withdrawn free a slot;
 *       NULL cap is unlimited; two parallel creates at cap-1 → one 201, one 409
 *   E5  a link-only kind: done without a link → 400 concierge_link_required; https → done; http → 400
 *   E6  done from requested → 409; traveler_ok from done → 409; withdraw by the expert → 403
 *   E7  no notification row and no email outbox row is written (the counterpart notification waits for CN-1e-UI)
 *   E8  migration 430 applies twice cleanly; no DEFAULT and no CHECK in its SQL
 *   E9  a handoff engagement (no confirmed concierge booking) cannot create tasks → 409
 *   E10 the six routes are in the mutation-auth manifest (server/routes registered, resource-owner checks in the service)
 *   H1  through the real route: traveler-ok by the expert → 403 concierge_task_owner_only
 *   H2  through the real route: done after access_until → 403 concierge_access_ended
 *
 * Run: DATABASE_URL=… npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cn1e-concierge-tasks.db.test.ts
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { grantConciergeAdvisorOnAccept, endConciergeAdvisorAccess } from "../services/concierge-engagement.service";
import { upsertTripAdvisorRow } from "../services/booking-actions.service";
import { createConciergeTask, listConciergeTasks, transitionConciergeTask } from "../services/concierge-task-log.service";
import http from "node:http";
import express from "express";
import passport from "passport";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "cn1e-test-session-secret";
const PASSWORD = "cn1e-pass-123";
function scryptHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

const ROOT = path.resolve(import.meta.dirname, "../..");
const MIGRATION = path.join(ROOT, "server/migrations/430_cn1e_concierge_tasks.sql");
const RUN = crypto.randomUUID().slice(0, 8);
const P = `cn1e-${RUN}`;
const traveler = `${P}-trav`;
const expert = `${P}-exp`;
const other = `${P}-other`;
const admin = `${P}-admin`;
const trip = `${P}-trip`;
const tripEnded = `${P}-trip-ended`;
const tripHandoff = `${P}-trip-ho`;
const svc = `${P}-svc`;
const svcPlanning = `${P}-svc-plan`;
const kindMeal = `${P}-meal`;
const kindStay = `${P}-stay`;
const kindErrand = `${P}-errand`;
const kindUnoffered = `${P}-unoffered`;
const bConfirmed = `${P}-b-ok`;
const bEnded = `${P}-b-ended`;
const bPending = `${P}-b-pending`;
const bCancelled = `${P}-b-cancel`;
const bHandoff = `${P}-b-ho`;

async function events(taskId: string) {
  const r = await db.execute(sql`SELECT from_state, to_state, actor_type, actor_id FROM concierge_task_events WHERE task_id = ${taskId} ORDER BY created_at, id`);
  return r.rows as Array<{ from_state: string | null; to_state: string; actor_type: string; actor_id: string | null }>;
}
async function state(taskId: string) {
  const r = await db.execute(sql`SELECT state FROM concierge_tasks WHERE id = ${taskId}`);
  return (r.rows[0] as any)?.state as string | undefined;
}
async function noteCount() {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM notifications WHERE user_id IN (${traveler}, ${expert})`);
  return (r.rows[0] as any).n as number;
}
async function booking(id: string, tripId: string, serviceId: string, status: string) {
  await db.execute(sql`
    INSERT INTO service_bookings (id, service_id, traveler_id, provider_id, trip_id, booking_details, total_amount, platform_fee, insurance_fee, provider_earnings, status)
    VALUES (${id}, ${serviceId}, ${traveler}, ${expert}, ${tripId}, '{}'::jsonb, '80.00', '0.00', '0.00', '80.00', ${status})
  `);
}
async function newTask(bookingId: string, kind: string, actor = traveler, extra: { linkUrl?: string } = {}) {
  const r = await createConciergeTask(bookingId, actor, { taskKindId: kind, title: "Dinner for two", ...extra });
  return r;
}
async function okTask(bookingId: string, kind: string) {
  const c = await newTask(bookingId, kind);
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const id = (c.body as any).id as string;
  const ok = await transitionConciergeTask(id, traveler, "traveler_ok");
  assert.equal(ok.status, 200);
  return id;
}

before(async () => {
  const { runMigrations } = await import("../migrations/run-migrations");
  await runMigrations();
  await db.execute(sql`
    INSERT INTO users (id, email, password, auth_provider, first_name, last_name, role, handle) VALUES
      (${traveler}, ${`${traveler}@t.test`}, ${scryptHash(PASSWORD)}, 'email', 'Cn', 'Traveler', 'traveler', ${`t${RUN}`}),
      (${expert}, ${`${expert}@t.test`}, ${scryptHash(PASSWORD)}, 'email', 'Cn', 'Expert', 'local_expert', ${`e${RUN}`})
  `);
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, handle) VALUES
      (${other}, ${`${other}@t.test`}, 'Cn', 'Other', 'traveler', ${`o${RUN}`}),
      (${admin}, ${`${admin}@t.test`}, 'Cn', 'Admin', 'admin', ${`a${RUN}`})
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, first_name, status, identity_verification_status, stripe_connect_status, city, destinations)
    VALUES (${crypto.randomUUID()}, ${expert}, 'Cn', 'approved', 'verified', 'complete', 'Kyoto', '[]'::jsonb)
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone) VALUES
      (${trip}, ${traveler}, 'Open', 'Kyoto', '2027-06-01', '2027-06-05', 'Asia/Tokyo'),
      (${tripEnded}, ${traveler}, 'Ended', 'Kyoto', '2027-07-01', '2027-07-05', 'Asia/Tokyo'),
      (${tripHandoff}, ${traveler}, 'Handoff', 'Kyoto', '2027-08-01', '2027-08-05', 'Asia/Tokyo')
  `);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, price, service_type, status, approval_status, delivery_method) VALUES
      (${svc}, ${expert}, 'Local concierge', '80.00', 'concierge', 'active', 'approved', 'async_messaging'),
      (${svcPlanning}, ${expert}, 'Plan review', '80.00', 'planning', 'active', 'approved', 'async_messaging')
  `);
  await db.execute(sql`
    INSERT INTO concierge_task_kinds (id, label, domain, sort_order, active) VALUES
      (${kindMeal}, 'Restaurant booking', 'meals', 1, true),
      (${kindStay}, 'Stays', 'stays', 2, true),
      (${kindErrand}, 'Errand', 'errands', 3, true),
      (${kindUnoffered}, 'Admission', 'admissions', 4, true)
  `);
  await db.execute(sql`
    INSERT INTO provider_service_concierge_tasks (id, service_id, task_kind_id, cap) VALUES
      (${`${P}-o1`}, ${svc}, ${kindMeal}, 2),
      (${`${P}-o2`}, ${svc}, ${kindStay}, NULL),
      (${`${P}-o3`}, ${svc}, ${kindErrand}, NULL)
  `);
  await booking(bConfirmed, trip, svc, "confirmed");
  await booking(bEnded, tripEnded, svc, "confirmed");
  await booking(bPending, trip, svc, "pending");
  await booking(bCancelled, trip, svc, "cancelled");
  await booking(bHandoff, tripHandoff, svcPlanning, "confirmed");
  await grantConciergeAdvisorOnAccept({ tripId: trip, localExpertId: expert });
  await grantConciergeAdvisorOnAccept({ tripId: tripEnded, localExpertId: expert });
  await upsertTripAdvisorRow({ tripId: tripHandoff, localExpertId: expert, status: "accepted", source: "handoff" });
});

after(async () => {
  await db.execute(sql`DELETE FROM notifications WHERE user_id IN (${traveler}, ${expert}, ${other}, ${admin})`).catch(() => {});
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id = ${admin}`).catch(() => {});
  await db.execute(sql`DELETE FROM service_bookings WHERE traveler_id = ${traveler}`);
  await db.execute(sql`DELETE FROM provider_service_concierge_tasks WHERE service_id = ${svc}`);
  await db.execute(sql`DELETE FROM concierge_task_kinds WHERE id IN (${kindMeal}, ${kindStay}, ${kindErrand}, ${kindUnoffered})`);
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${svc}, ${svcPlanning})`);
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${trip}, ${tripEnded}, ${tripHandoff})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${trip}, ${tripEnded}, ${tripHandoff})`);
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${expert}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${traveler}, ${expert}, ${other}, ${admin})`);
  await pool.end().catch(() => {});
});

describe("CN-1e concierge tasks", () => {
  test("E1 full path, one event per step, a repeat writes nothing", async () => {
    const c = await newTask(bConfirmed, kindErrand);
    assert.equal(c.status, 201);
    const id = (c.body as any).id;
    assert.equal((c.body as any).state, "requested");
    assert.equal((c.body as any).requestedBy, "traveler");
    assert.equal((await transitionConciergeTask(id, traveler, "traveler_ok")).status, 200);
    const again = await transitionConciergeTask(id, traveler, "traveler_ok");
    assert.equal(again.status, 200);
    assert.equal((again.body as any).state, "traveler_ok");
    assert.equal((await transitionConciergeTask(id, expert, "done")).status, 200);
    assert.equal((await transitionConciergeTask(id, expert, "done")).status, 200);
    assert.deepEqual(await events(id), [
      { from_state: null, to_state: "requested", actor_type: "traveler", actor_id: traveler },
      { from_state: "requested", to_state: "traveler_ok", actor_type: "traveler", actor_id: traveler },
      { from_state: "traveler_ok", to_state: "done", actor_type: "expert", actor_id: expert },
    ]);
    const list = await listConciergeTasks(bConfirmed, traveler);
    const view = (list.body as any).tasks.find((t: any) => t.id === id);
    assert.equal(view.events.length, 3);
    assert.equal(JSON.stringify(view).includes(expert), false, "no actor ids in the projection");
    const proposed = await newTask(bConfirmed, kindErrand, expert);
    assert.equal(proposed.status, 201);
    assert.equal((proposed.body as any).requestedBy, "expert");
    assert.equal((proposed.body as any).state, "requested");
  });

  test("E2 only the traveler OKs", async () => {
    const id = (((await newTask(bConfirmed, kindErrand)).body) as any).id;
    for (const who of [expert, other, admin]) {
      const r = await transitionConciergeTask(id, who, "traveler_ok");
      assert.equal(r.status, 403, who);
      assert.equal((r.body as any).code, "concierge_task_owner_only");
    }
    assert.equal(await state(id), "requested");
    assert.equal((await events(id)).length, 1);
    const adminRead = await listConciergeTasks(bConfirmed, admin);
    assert.equal(adminRead.status, 200);
    assert.equal((adminRead.body as any).viewer, "admin");
    assert.equal((await listConciergeTasks(bConfirmed, other)).status, 404);
  });

  test("E3 access window and active engagement", async () => {
    const id = await okTask(bEnded, kindErrand);
    await endConciergeAdvisorAccess(tripEnded, expert, new Date(Date.now() - 1000));
    const r = await transitionConciergeTask(id, expert, "done");
    assert.equal(r.status, 403);
    assert.equal((r.body as any).code, "concierge_access_ended");
    assert.equal(await state(id), "traveler_ok");
    assert.equal((await listConciergeTasks(bEnded, expert)).status, 404, "an ended expert no longer reads");

    const ok = await okTask(bConfirmed, kindErrand);
    for (const status of ["pending", "cancelled"]) {
      await db.execute(sql`UPDATE service_bookings SET status = ${status} WHERE id = ${bConfirmed}`);
      const d = await transitionConciergeTask(ok, expert, "done");
      assert.equal(d.status, 409, status);
      assert.equal((d.body as any).code, "concierge_engagement_not_active");
    }
    await db.execute(sql`UPDATE service_bookings SET status = 'confirmed' WHERE id = ${bConfirmed}`);
    assert.equal((await newTask(bPending, kindErrand)).status, 409);
    assert.equal((await newTask(bCancelled, kindErrand)).status, 409);
  });

  test("E4 kinds and caps", async () => {
    const no = await newTask(bConfirmed, kindUnoffered);
    assert.equal(no.status, 400);
    assert.equal((no.body as any).code, "concierge_task_kind_not_offered");
    const a = await newTask(bConfirmed, kindMeal);
    const b = await newTask(bConfirmed, kindMeal);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const c = await newTask(bConfirmed, kindMeal);
    assert.equal(c.status, 409);
    assert.equal((c.body as any).code, "concierge_task_cap_reached");
    assert.equal((await transitionConciergeTask((a.body as any).id, traveler, "withdrawn")).status, 200);
    const d = await newTask(bConfirmed, kindMeal);
    assert.equal(d.status, 201, "withdrawn frees a slot");
    await transitionConciergeTask((b.body as any).id, traveler, "traveler_ok");
    assert.equal((await transitionConciergeTask((b.body as any).id, expert, "could_not_get")).status, 200);
    // One slot free again (d is live). Two parallel creates: one wins.
    const [x, y] = await Promise.all([newTask(bConfirmed, kindMeal), newTask(bConfirmed, kindMeal)]);
    assert.deepEqual([x.status, y.status].sort(), [201, 409]);
    for (let i = 0; i < 5; i++) assert.equal((await newTask(bConfirmed, kindErrand)).status, 201, "NULL cap");
  });

  test("E5 link-only kinds", async () => {
    const id = await okTask(bConfirmed, kindStay);
    const none = await transitionConciergeTask(id, expert, "done");
    assert.equal(none.status, 400);
    assert.equal((none.body as any).code, "concierge_link_required");
    const http = await transitionConciergeTask(id, expert, "done", { linkUrl: "http://example.com/stay" });
    assert.equal(http.status, 400);
    const ok = await transitionConciergeTask(id, expert, "done", { linkUrl: "https://example.com/stay" });
    assert.equal(ok.status, 200);
    assert.equal((ok.body as any).linkUrl, "https://example.com/stay");
    const notLinkOnly = await newTask(bConfirmed, kindErrand, traveler, { linkUrl: "https://example.com" });
    assert.equal(notLinkOnly.status, 400, "a link only on a link-only kind");
  });

  test("E6 illegal transitions", async () => {
    const id = (((await newTask(bConfirmed, kindErrand)).body) as any).id;
    const early = await transitionConciergeTask(id, expert, "done");
    assert.equal(early.status, 409);
    assert.deepEqual(early.body, { code: "concierge_task_illegal_transition", from: "requested", to: "done" });
    await transitionConciergeTask(id, traveler, "traveler_ok");
    await transitionConciergeTask(id, expert, "done");
    const back = await transitionConciergeTask(id, traveler, "withdrawn");
    assert.equal(back.status, 409);
    const w = await transitionConciergeTask((((await newTask(bConfirmed, kindErrand)).body) as any).id, expert, "withdrawn");
    assert.equal(w.status, 403);
  });

  test("E7 no notification row and no email are written", async () => {
    const outbox = async () =>
      ((await db.execute(sql`SELECT count(*)::int AS n FROM email_outbox WHERE to_email IN (${`${traveler}@t.test`}, ${`${expert}@t.test`})`)).rows[0] as any).n as number;
    const notesBefore = await noteCount();
    const outboxBefore = await outbox();
    const id = await okTask(bConfirmed, kindErrand);
    await transitionConciergeTask(id, expert, "done");
    const w = await newTask(bConfirmed, kindErrand, expert);
    await transitionConciergeTask((w.body as any).id, traveler, "withdrawn");
    assert.equal(await noteCount(), notesBefore, "no notification rows");
    assert.equal(await outbox(), outboxBefore, "no email outbox rows");
    const src = fs.readFileSync(path.join(ROOT, "server/services/concierge-task-log.service.ts"), "utf8");
    assert.doesNotMatch(src, /createNotification/);
  });

  test("E8 migration 430 applies twice; no DEFAULT, no CHECK", async () => {
    const text = fs.readFileSync(MIGRATION, "utf8");
    const executable = text.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    assert.doesNotMatch(executable, /\bDEFAULT\b/i);
    assert.doesNotMatch(executable, /\bCHECK\b/i);
    assert.doesNotMatch(executable, /amount|price|payment/i);
    await pool.query(executable);
    await pool.query(executable);
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name IN ('concierge_tasks','concierge_task_events') AND column_default IS NOT NULL`);
    assert.equal((r.rows[0] as any).n, 0);
  });

  test("E9 a handoff engagement cannot create concierge tasks", async () => {
    const r = await newTask(bHandoff, kindErrand);
    assert.equal(r.status, 409);
    assert.equal((r.body as any).code, "concierge_engagement_not_active");
  });

  test("E10 the six routes are registered and listed by mutation-auth", () => {
    const routes = fs.readFileSync(path.join(ROOT, "server/routes/concierge-task-log.routes.ts"), "utf8");
    for (const p of ["/traveler-ok", "/done", "/could-not-get", "/withdraw"]) assert.match(routes, new RegExp(`/api/concierge/tasks/:taskId${p}`));
    assert.match(routes, /router\.post\("\/api\/concierge\/bookings\/:bookingId\/tasks", isAuthenticated/);
    assert.match(routes, /router\.get\("\/api\/concierge\/bookings\/:bookingId\/tasks", isAuthenticated/);
    assert.match(fs.readFileSync(path.join(ROOT, "server/routes.ts"), "utf8"), /app\.use\(conciergeTaskLogRoutes\)/);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "generated/security/mutation-auth-manifest.json"), "utf8"));
    const mine = manifest.mutations.filter((m: any) => m.source === "server/routes/concierge-task-log.routes.ts");
    assert.deepEqual(
      mine.map((m: any) => `${m.method} ${m.path}`).sort(),
      [
        "POST /api/concierge/bookings/:bookingId/tasks",
        "POST /api/concierge/tasks/:taskId/could-not-get",
        "POST /api/concierge/tasks/:taskId/done",
        "POST /api/concierge/tasks/:taskId/traveler-ok",
        "POST /api/concierge/tasks/:taskId/withdraw",
      ],
      "the five mutations (the sixth route is the GET read)",
    );
    assert.ok(mine.every((m: any) => m.expectedBoundary === "resource-owner" && m.expectedAuth === "required"));
  });
});

describe("CN-1e through the real routes", () => {
  const tripH = `${P}-trip-h`;
  const tripHEnded = `${P}-trip-h-ended`;
  const bH = `${P}-b-h`;
  const bHEnded = `${P}-b-h-ended`;
  let server: http.Server;
  let base = "";
  let travelerCookie = "";
  let expertCookie = "";

  async function signIn(email: string): Promise<string> {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    return res.headers.get("set-cookie")!.split(";")[0];
  }
  async function post(pathname: string, cookie: string, body: unknown = {}) {
    const res = await fetch(`${base}${pathname}`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  before(async () => {
    const { getSession } = await import("../replit_integrations/auth/replitAuth");
    const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
    const { default: routes } = await import("../routes/concierge-task-log.routes");
    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: any, cb) => cb(null, user));
    passport.deserializeUser((user: any, cb) => cb(null, user));
    setupEmailAuth(app);
    app.use(routes);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    await db.execute(sql`
      INSERT INTO trips (id, user_id, title, destination, start_date, end_date, timezone) VALUES
        (${tripH}, ${traveler}, 'Http', 'Kyoto', '2027-09-01', '2027-09-05', 'Asia/Tokyo'),
        (${tripHEnded}, ${traveler}, 'Http ended', 'Kyoto', '2027-10-01', '2027-10-05', 'Asia/Tokyo')
    `);
    await booking(bH, tripH, svc, "confirmed");
    await booking(bHEnded, tripHEnded, svc, "confirmed");
    await grantConciergeAdvisorOnAccept({ tripId: tripH, localExpertId: expert });
    await grantConciergeAdvisorOnAccept({ tripId: tripHEnded, localExpertId: expert });
    travelerCookie = await signIn(`${traveler}@t.test`);
    expertCookie = await signIn(`${expert}@t.test`);
  });

  after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await db.execute(sql`DELETE FROM service_bookings WHERE id IN (${bH}, ${bHEnded})`);
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id IN (${tripH}, ${tripHEnded})`);
    await db.execute(sql`DELETE FROM trips WHERE id IN (${tripH}, ${tripHEnded})`);
  });

  test("H1 traveler-ok by the expert → 403 concierge_task_owner_only", async () => {
    const created = await post(`/api/concierge/bookings/${bH}/tasks`, travelerCookie, { taskKindId: kindErrand, title: "Dinner for two" });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const r = await post(`/api/concierge/tasks/${created.json.id}/traveler-ok`, expertCookie);
    assert.equal(r.status, 403);
    assert.deepEqual(r.json, { code: "concierge_task_owner_only" });
    assert.equal(await state(created.json.id), "requested");
    const anon = await fetch(`${base}/api/concierge/tasks/${created.json.id}/traveler-ok`, { method: "POST" });
    assert.equal(anon.status, 401);
  });

  test("H2 done after access_until → 403 concierge_access_ended", async () => {
    const created = await post(`/api/concierge/bookings/${bHEnded}/tasks`, travelerCookie, { taskKindId: kindErrand, title: "Dinner for two" });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal((await post(`/api/concierge/tasks/${created.json.id}/traveler-ok`, travelerCookie)).status, 200);
    await endConciergeAdvisorAccess(tripHEnded, expert, new Date(Date.now() - 1000));
    const r = await post(`/api/concierge/tasks/${created.json.id}/done`, expertCookie);
    assert.equal(r.status, 403);
    assert.deepEqual(r.json, { code: "concierge_access_ended" });
    assert.equal(await state(created.json.id), "traveler_ok");
  });
});
