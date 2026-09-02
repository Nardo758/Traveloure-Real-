/**
 * internal-jobs-heartbeat.db.test.ts — "did the cron actually drive this job?"
 *
 * Lane: internal-jobs-hardening, L6. Finding F5: GitHub `schedule` is best-effort and auto-disables
 * after 60 days of repository inactivity, and nothing detected a workflow that had stopped firing.
 *
 *   H1 a successful pass upserts a heartbeat
 *   H2 a SKIP does not advance last_success_at (a permanently-overlapping job must go stale)
 *   H3 the health endpoint flags a job past 2x its cadence as `stale`
 *   H4 the health endpoint is itself secret-gated (and sits behind the /internal limiter)
 *   H5 on a FRESH table every mapped job reports `never_succeeded` — the roster is iterated, never
 *      the rows. Iterating rows would mean a job that has never once succeeded never appears and
 *      never alarms: the same absence-compared-to-absence shape as the 200-HTML dead route this
 *      lane started from, one layer up.
 */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { jobHeartbeats } from "@shared/schema";
import internalRoutes, { JOB_CADENCE } from "../internal.routes";
import { runBackgroundJob } from "../../services/background-job-runner";
import { computeJobHealth, summarizeJobResult } from "../../services/job-heartbeats.service";

const SECRET = "internal-jobs-heartbeat-test-secret";

async function clearHeartbeats() {
  await db.execute(sql`DELETE FROM job_heartbeats`);
}

async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  process.env.INTERNAL_JOB_SECRET = SECRET;
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

const post = (base: string, path: string, secret: string | null = SECRET) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-internal-secret": secret } : {}) },
    body: "{}",
  });

const get = (base: string, path: string, secret: string | null = SECRET) =>
  fetch(`${base}${path}`, { headers: secret ? { "x-internal-secret": secret } : {} });

test("H1: a successful pass upserts a heartbeat with an allowlist summary", async () => {
  await clearHeartbeats();
  await withServer(async (base) => {
    const res = await post(base, "/internal/jobs/earnings-release");
    assert.equal(res.status, 200);

    const rows = await db.select().from(jobHeartbeats);
    const row = rows.find((r) => r.jobName === "earnings-release");
    assert.ok(row, "a successful pass must leave a heartbeat");
    assert.ok(row!.lastSuccessAt instanceof Date);
    // The stored summary is the SAME allowlist the public CI log prints: booleans + numeric leaves.
    const stored = row!.lastResult as Record<string, unknown>;
    assert.equal(stored.ok, true);
    assert.equal(stored.skipped, false);
    assert.equal(typeof stored["result.expert"], "number");
    assert.equal(typeof stored["result.provider"], "number");
  });
});

test("H2: a skip does NOT advance last_success_at", async () => {
  await clearHeartbeats();
  await withServer(async (base) => {
    assert.equal((await post(base, "/internal/jobs/email-outbox")).status, 200);
    const [before] = await db.select().from(jobHeartbeats);
    assert.ok(before, "precondition: the first pass stamped");
    const stampedAt = new Date(before.lastSuccessAt).getTime();

    await new Promise((r) => setTimeout(r, 25));

    // Occupy the job name so the next endpoint call is deduped, exactly as a warm timer would.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const holder = runBackgroundJob("email-outbox", () => held.then(() => ({ drained: 0 })));
    await new Promise((r) => setImmediate(r));

    const skipped = await post(base, "/internal/jobs/email-outbox");
    const body = await skipped.json() as any;
    assert.equal(body.skipped, true, "precondition: this pass was skipped");

    release();
    await holder;

    const [after] = await db.select().from(jobHeartbeats);
    assert.equal(
      new Date(after.lastSuccessAt).getTime(),
      stampedAt,
      "a skip must leave the heartbeat untouched — a permanently-overlapping job has to go stale",
    );
  });
});

test("H3: the health endpoint flags a job past 2x its cadence as stale", async () => {
  await clearHeartbeats();
  const entry = JOB_CADENCE.find((j) => j.job === "earnings-release")!;
  // Stamp it far enough in the past to be unambiguously beyond 2x.
  const staleAt = new Date(Date.now() - entry.expectedIntervalSec * 1000 * 3);
  await db.insert(jobHeartbeats).values({
    jobName: "earnings-release",
    lastSuccessAt: staleAt,
    lastResult: { ok: true, skipped: false },
  });

  const rows = await computeJobHealth(JOB_CADENCE);
  const stale = rows.find((r) => r.job === "earnings-release")!;
  assert.equal(stale.status, "stale");
  assert.ok(stale.ageSec! > entry.expectedIntervalSec * 2);

  // A fresh stamp on the same job flips it back to ok — the threshold is real, not a one-way latch.
  await db
    .insert(jobHeartbeats)
    .values({ jobName: "earnings-release", lastSuccessAt: new Date(), lastResult: {} })
    .onConflictDoUpdate({ target: jobHeartbeats.jobName, set: { lastSuccessAt: new Date() } });
  const fresh = (await computeJobHealth(JOB_CADENCE)).find((r) => r.job === "earnings-release")!;
  assert.equal(fresh.status, "ok");
});

test("H4: the health endpoint is secret-gated like every other internal route", async () => {
  await withServer(async (base) => {
    assert.equal((await get(base, "/internal/jobs/health", null)).status, 401, "no secret");
    assert.equal((await get(base, "/internal/jobs/health", "wrong")).status, 401, "wrong secret");
    const ok = await get(base, "/internal/jobs/health");
    assert.equal(ok.status, 200);
    const body = await ok.json() as any;
    assert.equal(body.ok, true, "`ok` is about the READ succeeding");
    assert.equal(typeof body.healthy, "boolean", "`healthy` is the verdict about the jobs");
    assert.equal(body.measures, "last cron-driven success", "the wording that keeps a red row readable");
  });
});

test("H5: on a fresh table every mapped job reports never_succeeded, none is omitted", async () => {
  await clearHeartbeats();
  await withServer(async (base) => {
    const res = await get(base, "/internal/jobs/health");
    const body = await res.json() as any;

    assert.equal(body.jobs.length, JOB_CADENCE.length, "the ROSTER is iterated, not the table rows");
    assert.deepEqual(
      body.jobs.map((j: any) => j.job).sort(),
      JOB_CADENCE.map((j) => j.job).slice().sort(),
    );
    for (const j of body.jobs) {
      assert.equal(j.status, "never_succeeded", `${j.job} must alarm, not vanish`);
      assert.equal(j.lastSuccessAt, null);
    }
    assert.equal(body.healthy, false, "a roster of never-succeeded jobs is not healthy");
    assert.equal(body.staleCount, JOB_CADENCE.length);
  });
});

test("H6: the summary allowlist keeps strings out (paired with the CI script's jq filter)", () => {
  const summary = summarizeJobResult({
    ok: true,
    skipped: false,
    job: "probe",
    result: { drained: 3, error: "SECRET-SHAPED DETAIL", nested: { count: 7, note: "also a string" } },
  });
  assert.equal(summary.ok, true);
  assert.equal(summary["result.drained"], 3);
  assert.equal(summary["result.nested.count"], 7);
  assert.equal(JSON.stringify(summary).includes("SECRET-SHAPED DETAIL"), false);
  assert.equal(JSON.stringify(summary).includes("also a string"), false);
});
