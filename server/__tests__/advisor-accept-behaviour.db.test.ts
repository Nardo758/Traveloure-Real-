/**
 * LANE A - the BEHAVIOURAL proofs (round 3). The rule-level proofs live in
 * advisor-accept-basis.db.test.ts; these go through the handlers.
 *
 * B1  plan-review approval with NO handoff returns the pen: advisor -> pending, open suggestions superseded.
 * B2  re-accept at the route: paid request -> accept -> deliver -> approve -> accept again answers 409
 *     advisor_finished and the row stays pending.
 * B3  the rails that write a write status DIRECTLY still do it with the guard in place: an admin assignment
 *     (status assigned) and a concierge accept (status accepted). The guard never runs on either.
 *
 * ASCII only: the previous file picked up a mangled character in transit and the reviewer asked for ASCII in
 * new files until that is fixed.
 *
 * NOTE (round 3): this file is ASCII by review request until the editor's dash mangling is fixed.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = () => crypto.randomUUID();
const ids = { owner: uid(), expert: uid(), trip: uid(), assignment: uid(), paidRequest: uid(), suggestion: uid() };

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE.has(host)) throw new Error(`[advisor-accept-behaviour] REFUSING to write to '${host}'.`);
}

const one = async <T = any>(query: any): Promise<T | undefined> => ((await db.execute(query)).rows?.[0] as T);

/** Mount the real booking-actions router under /api with a stubbed session, as handoff-lifecycle.db.test.ts does. */
async function post(userId: string, url: string, body?: unknown) {
  const mod = await import("../routes/booking-actions");
  const router = (mod as any).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "T" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api", router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name) VALUES (${ids.owner}, ${`${ids.owner}@t.test`}, 'Owner')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name) VALUES (${ids.expert}, ${`${ids.expert}@t.test`}, 'Expert')`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${ids.trip}, ${ids.owner}, 'Kyoto days', 'Kyoto, Japan', '2027-05-01', '2027-05-03')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM expert_suggestions WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id LIKE ${`pi_beh_${RUN}%`}`);
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`);
});

async function seedAdvisor(status = "accepted", workspaceStatus: string | null = "delivered") {
  await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`
    INSERT INTO trip_expert_advisors (id, trip_id, local_expert_id, status, workspace_status, assigned_at)
    VALUES (${ids.assignment}, ${ids.trip}, ${ids.expert}, ${status}, ${workspaceStatus}, NOW())
  `);
}

test("B1: approval with NO handoff returns the pen and supersedes open suggestions", async () => {
  await seedAdvisor();
  await db.execute(sql`DELETE FROM expert_suggestions WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`
    INSERT INTO expert_suggestions (id, trip_id, expert_id, kind, status, payload)
    VALUES (${ids.suggestion}, ${ids.trip}, ${ids.expert}, 'add_item', 'pending', '{"title":"Seed suggestion"}'::jsonb)
  `);

  const res = await post(ids.owner, `/api/trips/${ids.trip}/plan-review`, { decision: "approve" });
  assert.equal(res.status, 200, `plan-review answered ${res.status}: ${JSON.stringify(res.body)}`);

  const advisor = await one<{ status: string }>(sql`SELECT status FROM trip_expert_advisors WHERE id = ${ids.assignment}`);
  assert.equal(advisor?.status, "pending", "the expert is read-only again after approval");

  const sugg = await one<{ status: string }>(sql`SELECT status FROM expert_suggestions WHERE id = ${ids.suggestion}`);
  assert.equal(sugg?.status, "superseded", `an open suggestion must not survive approval (saw ${sugg?.status})`);
});

test("B2: re-accept at the ROUTE is refused as advisor_finished and the row stays pending", async () => {
  await seedAdvisor("accepted");
  // A paid request for the pair that delivery has already CLOSED (completeExpertRequest sets completed).
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  const pi = `pi_beh_${RUN}_b2`;
  await db.execute(sql`
    INSERT INTO expert_requests (id, user_id, trip_id, destination_city, request_type, status,
      assigned_expert_id, handoff_kind, optimization_context, completed_at)
    VALUES (${ids.paidRequest}, ${ids.owner}, ${ids.trip}, 'Kyoto', 'plan_help', 'completed',
      ${ids.expert}, NULL, ${JSON.stringify({ paymentIntentId: pi })}::jsonb, NOW())
  `);
  await db.execute(sql`
    INSERT INTO platform_revenue (id, source_id, source_type, gross_amount, platform_fee, net_amount)
    VALUES (${uid()}, ${pi}, 'expert_review_fee', 60.00, 60.00, 60.00)
  `);

  const approve = await post(ids.owner, `/api/trips/${ids.trip}/plan-review`, { decision: "approve" });
  assert.equal(approve.status, 200, `approve answered ${approve.status}: ${JSON.stringify(approve.body)}`);

  const accept = await post(ids.expert, `/api/expert/assignments/${ids.assignment}/accept`);
  assert.equal(accept.status, 409, `the re-accept must be refused (answered ${accept.status})`);
  assert.equal((accept.body as any)?.code, "advisor_finished");

  const advisor = await one<{ status: string }>(sql`SELECT status FROM trip_expert_advisors WHERE id = ${ids.assignment}`);
  assert.equal(advisor?.status, "pending", "the refused accept must not move the row");
});

test("B3a: an ADMIN assignment still reaches `assigned` with the guard in place", async () => {
  await seedAdvisor("pending", null);
  const { assignExpertAdvisorToRequest, upsertTripAdvisorRow } = await import("../services/booking-actions.service");
  const reqId = uid();
  await db.execute(sql`
    INSERT INTO expert_requests (id, user_id, trip_id, destination_city, request_type, status)
    VALUES (${reqId}, ${ids.owner}, ${ids.trip}, 'Kyoto', 'plan_help', 'pending')
  `);
  // What the admin route does: route the request, then grant `assigned` through the ONE author.
  await assignExpertAdvisorToRequest(reqId, ids.expert);
  await upsertTripAdvisorRow({ tripId: ids.trip, localExpertId: ids.expert, status: "assigned" });

  const advisor = await one<{ status: string }>(sql`SELECT status FROM trip_expert_advisors WHERE id = ${ids.assignment}`);
  assert.equal(advisor?.status, "assigned", "an admin assignment writes its write status directly");
});

test("B3b: a CONCIERGE accept still reaches `accepted` with the guard in place", async () => {
  await seedAdvisor("pending", null);
  const { grantConciergeAdvisorOnAccept } = await import("../services/concierge-engagement.service");
  await grantConciergeAdvisorOnAccept({ tripId: ids.trip, localExpertId: ids.expert });

  const advisor = await one<{ status: string }>(sql`SELECT status FROM trip_expert_advisors WHERE id = ${ids.assignment}`);
  assert.equal(advisor?.status, "accepted", "a concierge accept writes its write status directly");
});
