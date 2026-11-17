/**
 * LANE A (brief 0) - THE SEEDED PROOFS of the paid-basis guard.
 *
 * These run against a real disposable database with real rows, because the rule is a SQL lookup and the pure
 * tests cannot see it. Each case seeds the exact row shape and asks the SAME function the route asks
 * (`loadAdvisorAcceptBasis`) and the same mapper (`advisorAcceptRefusal`).
 *
 * The shapes, and which statuses count:
 *   handoff   captured_at NOT NULL and status accepted|delivered - a BASIS. proposed / authorized are not
 *             (a hold is not money); approved / withdrawn / released are FINISHED.
 *   request   handoff_kind NULL, status assigned|in_progress, not refunded, a PaymentIntent AND its
 *             `platform_revenue` ledger row - a BASIS. No ledger row - FORGED, so unpaid. status completed ?
 *             FINISHED (completeExpertRequest sets it on delivery, before any approval).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  advisorAcceptRefusal,
  loadAdvisorAcceptBasis,
} from "../services/advisor-accept-basis.service";

const RUN = crypto.randomUUID().slice(0, 8);
const uid = () => crypto.randomUUID();
const ids = {
  owner: `aa-owner-${RUN}`,
  expert: `aa-expert-${RUN}`,
  trip: `aa-trip-${RUN}`,
};

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE.has(host)) throw new Error(`[advisor-accept-basis] REFUSING to write fixtures to '${host}'.`);
}

async function seedRequest(row: {
  id: string;
  handoffKind?: string | null;
  status: string;
  captured?: boolean;
  pi?: string | null;
  refundId?: string | null;
  ledger?: boolean;
}) {
  await db.execute(sql`
    INSERT INTO expert_requests (id, user_id, trip_id, destination_city, request_type, status,
      assigned_expert_id, handoff_kind, captured_at, refund_id, optimization_context)
    VALUES (${row.id}, ${ids.owner}, ${ids.trip}, 'Kyoto', 'plan_help', ${row.status},
      ${ids.expert}, ${row.handoffKind ?? null},
      ${row.captured ? sql`NOW()` : sql`NULL`}, ${row.refundId ?? null},
      ${row.pi ? sql`${JSON.stringify({ paymentIntentId: row.pi })}::jsonb` : sql`'{}'::jsonb`})
  `);
  if (row.ledger && row.pi) {
    await db.execute(sql`
      INSERT INTO platform_revenue (id, source_id, source_type, gross_amount, platform_fee, net_amount)
      VALUES (${uid()}, ${row.pi}, 'expert_review_fee', 60.00, 60.00, 60.00)
    `);
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
  await db.execute(sql`DELETE FROM platform_revenue WHERE source_id LIKE ${`pi_aa_${RUN}%`}`);
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.owner}, ${ids.expert})`);
});

test("P1: no paid row at all - refused as unpaid", async () => {
  const f = await loadAdvisorAcceptBasis(ids.trip, ids.expert);
  assert.equal(f, null);
  assert.equal(advisorAcceptRefusal(f), "advisor_unpaid");
});

test("P2: a proposed handoff (no capture) is not a basis - an invite cannot be accepted on a hold", async () => {
  await seedRequest({ id: uid(), handoffKind: "polish", status: "proposed" });
  assert.equal(await loadAdvisorAcceptBasis(ids.trip, ids.expert), null);
});

test("P3: a captured, ACCEPTED handoff is a basis - the normal paid accept still succeeds", async () => {
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  await seedRequest({ id: uid(), handoffKind: "polish", status: "accepted", captured: true });
  const f = await loadAdvisorAcceptBasis(ids.trip, ids.expert);
  assert.equal(f?.kind, "handoff");
  assert.equal(advisorAcceptRefusal(f), null);
});

test("P4: after approval (status approved) the row is FINISHED, not unpaid - re-accept refused", async () => {
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  await seedRequest({ id: uid(), handoffKind: "polish", status: "approved", captured: true });
  const f = await loadAdvisorAcceptBasis(ids.trip, ids.expert);
  assert.equal(f?.kind, "finished");
  assert.equal(advisorAcceptRefusal(f), "advisor_finished");
});

test("P5: a paid request with its LEDGER row is a basis", async () => {
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  const pi = `pi_aa_${RUN}_p5`;
  await seedRequest({ id: uid(), status: "assigned", pi, ledger: true });
  const f = await loadAdvisorAcceptBasis(ids.trip, ids.expert);
  assert.equal(f?.kind, "paid_request");
  assert.equal(advisorAcceptRefusal(f), null);
});

test("P6: a FORGED PaymentIntent with no ledger row is refused as unpaid", async () => {
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  const pi = `pi_aa_${RUN}_forged`;
  await seedRequest({ id: uid(), status: "assigned", pi, ledger: false });
  const f = await loadAdvisorAcceptBasis(ids.trip, ids.expert);
  assert.equal(f, null, "the key alone must not be a basis");
  assert.equal(advisorAcceptRefusal(f), "advisor_unpaid");
});

test("P7: a REFUNDED paid request is not a basis", async () => {
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  const pi = `pi_aa_${RUN}_p7`;
  await seedRequest({ id: uid(), status: "assigned", pi, ledger: true, refundId: `re_${RUN}` });
  assert.equal(await loadAdvisorAcceptBasis(ids.trip, ids.expert), null);
});

test("P8: a COMPLETED paid request is FINISHED - delivery closed it before any approval", async () => {
  await db.execute(sql`DELETE FROM expert_requests WHERE trip_id = ${ids.trip}`);
  const pi = `pi_aa_${RUN}_p8`;
  await seedRequest({ id: uid(), status: "completed", pi, ledger: true });
  const f = await loadAdvisorAcceptBasis(ids.trip, ids.expert);
  assert.equal(f?.kind, "finished");
  assert.equal(advisorAcceptRefusal(f), "advisor_finished");
});
