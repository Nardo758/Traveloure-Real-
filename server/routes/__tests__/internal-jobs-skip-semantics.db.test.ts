/**
 * internal-jobs-skip-semantics.db.test.ts — a skip, a real run, and a broken job are three
 * DIFFERENT answers (lane: internal-jobs-hardening, L4).
 *
 * Before this, `runJob` read `result === undefined → { ok:true, skipped:true }`, and
 * `runBackgroundJob` returned `undefined` for BOTH an overlap skip AND a job body that resolved
 * void. The two void-returning jobs — `drainOutbox` and `runTravelpayoutsReportPoll` — therefore
 * answered `skipped: true` on EVERY call. A successful drain, an overlap skip, and an outbox that
 * had silently stopped draining were indistinguishable to the cron watching the response, which is
 * precisely the state §17 rule 2 forbids ("silence must be distinguishable from the job not having
 * run").
 *
 *   S1 an overlap skip                 → { ok:true, skipped:true, reason:"overlap" }
 *   S2 a real drain of an empty outbox → { ok:true, drained:0 } and NO `skipped`
 *   S3 a job body resolving undefined  → 500 { ok:false } (contract error, never a skip)
 *   S4 an object-returning job         → { ok:true, result:{…} } and NO `skipped` (no regression)
 *
 * Needs a database: S2 and S4 run the REAL jobs (a no-op drain and a no-op earnings release) rather
 * than a stub, so the proof covers the actual wiring the cron hits.
 *
 * S2 PARKS the shared outbox (R320, ledger `2026-10-05-internal-jobs-skip-isolated`). The CI job runs
 * this file after ~20 DB suites on ONE database, and their email rows stay due in `email_outbox`; the
 * real drain then claimed them, tried to SEND them, bumped their attempt counts and answered
 * `drained: N` — a failure that depended on what ran first. S2 now moves every row the drain would
 * claim out of its window for the duration of the test and restores each row's own `retry_after`
 * after, so "an empty outbox drains 0" is asserted against an outbox that is empty of due work.
 */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import { jobHeartbeats } from "@shared/schema";
import { db } from "../../db";
import internalRoutes, { runJob } from "../internal.routes";
import { runBackgroundJob } from "../../services/background-job-runner";

const SECRET = "internal-jobs-skip-semantics-test-secret";

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(internalRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function postJob(baseUrl: string, route: string) {
  return fetch(`${baseUrl}/internal/jobs/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    body: "{}",
  });
}

test("S1: an overlapping pass answers skipped:true with a reason", async () => {
  process.env.INTERNAL_JOB_SECRET = SECRET;
  await withServer(async (base) => {
    // Occupy the "email-outbox" job name so the endpoint's pass is deduped, exactly as a warm
    // in-process timer pass would.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const holder = runBackgroundJob("email-outbox", () => held.then(() => ({ drained: 0 })));
    await new Promise((r) => setImmediate(r));

    const res = await postJob(base, "email-outbox");
    const body = await res.json() as any;

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.skipped, true, "an overlapping pass must report skipped");
    assert.equal(body.reason, "overlap");

    release();
    await holder;
  });
});

/**
 * Move every row `drainOutboxImpl` would claim out of its window, returning each row's own
 * `retry_after` so it can be put back exactly. The WHERE is the drain's candidate predicate
 * (`server/services/email-outbox.service.ts`), restated here only to park rows — never to decide one.
 */
async function parkDueOutboxRows(): Promise<Array<{ id: number; old_retry_after: Date | null }>> {
  const result = await db.execute(sql`
    WITH due AS (
      SELECT id, retry_after FROM email_outbox
      WHERE (status IN ('pending', 'failed') AND (retry_after IS NULL OR retry_after <= NOW()))
         OR (status = 'processing' AND retry_after < NOW() - INTERVAL '1 minute')
      FOR UPDATE
    )
    UPDATE email_outbox AS o
    SET    retry_after = NOW() + INTERVAL '1 day'
    FROM   due
    WHERE  o.id = due.id
    RETURNING o.id, due.retry_after AS old_retry_after
  `);
  return (result.rows ?? []) as Array<{ id: number; old_retry_after: Date | null }>;
}

async function restoreOutboxRows(parked: Array<{ id: number; old_retry_after: Date | null }>) {
  for (const row of parked) {
    await db.execute(sql`UPDATE email_outbox SET retry_after = ${row.old_retry_after} WHERE id = ${row.id}`);
  }
}

test("S2: a real drain of an empty outbox reports drained:0, NOT skipped", async () => {
  process.env.INTERNAL_JOB_SECRET = SECRET;
  const parked = await parkDueOutboxRows();
  try {
    await withServer(async (base) => {
      const res = await postJob(base, "email-outbox");
      const body = await res.json() as any;

      assert.equal(res.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.skipped, undefined, "a job that actually ran must not claim to be skipped");
      assert.equal(body.result?.drained, 0, "an empty outbox is an honest drained:0, not silence");
      assert.equal(body.result?.error, undefined);
    });
  } finally {
    await restoreOutboxRows(parked);
  }
});

test("S3: a job body resolving undefined is a contract error (500), never a skip", async () => {
  const { status, body } = await runJob("contract-probe", async () => undefined);
  assert.equal(status, 500);
  assert.equal((body as any).ok, false);
  assert.equal((body as any).skipped, undefined, "a broken job must never borrow the skip's clothes");
  assert.match(String((body as any).error), /resolved undefined/);
});

test("S4: an object-returning job is unchanged — ok:true with its result, no skipped", async () => {
  process.env.INTERNAL_JOB_SECRET = SECRET;
  await withServer(async (base) => {
    const res = await postJob(base, "earnings-release");
    const body = await res.json() as any;

    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.job, "earnings-release");
    assert.equal(body.skipped, undefined);
    assert.equal(typeof body.result?.expert, "number");
    assert.equal(typeof body.result?.provider, "number");
  });
});

test("S5: a missing-Stripe-key reconciliation is an HTTP 200 skip and never stamps its heartbeat", async () => {
  const before = await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.jobName, "stripe-reconciliation"));
  const { status, body } = await runJob(
    "stripe-reconciliation",
    async () => ({ status: "skipped", skipReason: "stripe_secret_key_missing" }),
    (result) => result?.status === "failed",
    { isSkip: (result) => result?.status === "skipped" },
  );
  const after = await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.jobName, "stripe-reconciliation"));

  assert.equal(status, 200);
  assert.deepEqual(body, {
    ok: true,
    skipped: true,
    reason: "stripe_secret_key_missing",
    job: "stripe-reconciliation",
  });
  assert.deepEqual(after, before, "a skipped reconciliation is not a successful cron heartbeat");
});
