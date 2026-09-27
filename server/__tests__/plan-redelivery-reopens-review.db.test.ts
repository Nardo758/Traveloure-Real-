/**
 * Ledger `2026-09-25-p1-approve-and-quotes` (Pass 3 finding P3-L1-REDELIVERY-UNAPPROVABLE).
 *
 * After the traveler asks for changes (`plan_approval_status='changes_requested'`, workspace back
 * to draft), the expert's RE-delivery must re-open the review: `updateExpertAssignmentWorkspaceStatus`
 * moving to 'delivered' clears 'changes_requested' back to NULL in the same statement, because the
 * traveler's Approve banner renders only while the status is NULL (PlanApprovalBanner.tsx). Before
 * the fix the status stayed 'changes_requested' forever and the plan could never be approved.
 *
 *   R1  changes_requested → re-deliver ⇒ status NULL, the traveler's note is kept, the diary row is written
 *   R2  an 'approved' plan re-delivered stays 'approved' (never cleared)
 *   R3  moving to 'in_review' (not delivered) leaves 'changes_requested' untouched
 *
 * DISPOSABLE DB ONLY. Every row this file writes is deleted in after().
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  owner: `prr-${RUN}-owner`,
  expert: `prr-${RUN}-expert`,
  tripA: `prr-${RUN}-trip-a`,
  tripB: `prr-${RUN}-trip-b`,
  tripC: `prr-${RUN}-trip-c`,
};
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

async function makeAdvisor(tripId: string, planApprovalStatus: string | null, workspaceStatus: string): Promise<string> {
  const created = await storage.createTripExpertAdvisor({ tripId, localExpertId: ids.expert, message: "fixture" });
  await db.execute(sql`
    UPDATE trip_expert_advisors
       SET status = 'accepted', workspace_status = ${workspaceStatus},
           plan_approval_status = ${planApprovalStatus},
           plan_review_note = ${planApprovalStatus === "changes_requested" ? "Please swap day 2" : null}
     WHERE id = ${created.id}
  `);
  return created.id;
}

async function row(id: string): Promise<any> {
  const r = await db.execute(sql`
    SELECT workspace_status, plan_approval_status, plan_review_note FROM trip_expert_advisors WHERE id = ${id}
  `);
  return r.rows[0];
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host) && process.env.JOURNEY_DB_WRITES_OK !== "1") {
    throw new Error(`[plan-redelivery] refusing to write to non-disposable host '${host}'`);
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.owner}, ${`prr-${RUN}-owner@t.test`}, 'PRR', 'Owner', 'traveler')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
    VALUES (${ids.expert}, ${`prr-${RUN}-expert@t.test`}, 'PRR', 'Expert', 'local_expert')`);
  for (const t of [ids.tripA, ids.tripB, ids.tripC]) {
    await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
      VALUES (${t}, ${ids.owner}, 'PRR fixture', 'Lisbon', CURRENT_DATE + 10, CURRENT_DATE + 15)`);
  }
});

after(async () => {
  const trips = [ids.tripA, ids.tripB, ids.tripC];
  for (const t of trips) {
    await db.execute(sql`DELETE FROM item_transition_log WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trip_expert_advisors WHERE trip_id = ${t}`).catch(() => {});
    await db.execute(sql`DELETE FROM trips WHERE id = ${t}`).catch(() => {});
  }
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`).catch(() => {});
});

test("R1 · re-delivery after changes_requested re-opens review: status NULL, note kept, diary row written", async () => {
  const id = await makeAdvisor(ids.tripA, "changes_requested", "draft");
  assert.ok(await storage.updateExpertAssignmentWorkspaceStatus(id, "in_review", "draft", ids.expert));
  assert.equal((await row(id)).plan_approval_status, "changes_requested", "in_review alone does not re-open review");
  assert.ok(await storage.updateExpertAssignmentWorkspaceStatus(id, "delivered", "in_review", ids.expert));
  const after = await row(id);
  assert.equal(after.workspace_status, "delivered");
  assert.equal(after.plan_approval_status, null, "the Approve banner renders only while this is NULL");
  assert.equal(after.plan_review_note, "Please swap day 2", "the traveler's note stays as the record");
  const diary = await db.execute(sql`
    SELECT count(*)::int AS n FROM item_transition_log
     WHERE trip_id = ${ids.tripA} AND event_type = 'workspace_status_transition' AND to_status = 'delivered'`);
  assert.equal((diary.rows[0] as any).n, 1);
});

test("R2 · an approved plan re-delivered stays approved", async () => {
  const id = await makeAdvisor(ids.tripB, "approved", "in_review");
  assert.ok(await storage.updateExpertAssignmentWorkspaceStatus(id, "delivered", "in_review", ids.expert));
  assert.equal((await row(id)).plan_approval_status, "approved");
});

test("R3 · a transition that is not to delivered leaves changes_requested alone", async () => {
  const id = await makeAdvisor(ids.tripC, "changes_requested", "draft");
  assert.ok(await storage.updateExpertAssignmentWorkspaceStatus(id, "in_review", "draft", ids.expert));
  assert.equal((await row(id)).plan_approval_status, "changes_requested");
});
