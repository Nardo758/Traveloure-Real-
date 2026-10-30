/**
 * Row 100 (ledger `2026-10-30-row100-missed-run-cron-alerts`): a roster job that is stale or has
 * never succeeded alerts staff once per job per UTC day. The alert does not stamp a heartbeat.
 *
 *   A1  a stale job writes one digest and one staff row per admin; a second call the same UTC day
 *       does not duplicate; a second stale job the same day is its own alert
 *   A2  a roster that is all ok writes nothing
 *   A3  never_succeeded is alerted
 *   A4  a thrown database read leaves the caller unaffected and writes nothing
 *   A5  a thrown writer does not reject, and a later job in the same pass still alerts
 *   A6  the alert does not stamp a heartbeat, send mail, or add a route; routing-recheck calls it
 *       after its own run
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row100-job-stale-alert.db.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { jobHeartbeats } from "@shared/schema";
import { getAdminUserIds } from "../services/content-query.service";
import {
  JOB_STALE_DIGEST_TYPE,
  JOB_STALE_STAFF_TYPE,
  formatExpectedCadence,
  jobStaleAlertMessage,
  jobStaleAlertTitle,
  jobStaleStaffDedupeKey,
  recordStaleJobAlerts,
  type JobStaleDigestRow,
  type JobStaleStaffRow,
} from "../services/job-stale-alert.service";
import type { JobCadence, JobHealthRow } from "../services/job-heartbeats.service";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RUN = crypto.randomUUID().slice(0, 8);
const PREFIX = `row100-${RUN}-`;
const NOW = new Date("2026-10-30T15:00:00.000Z");
const DAY = "2026-10-30";
const SECRET_MARKER = "ROW100-SECRET-SHAPED";
const ADMIN_A = `row100a-${RUN}`;
const ADMIN_B = `row100b-${RUN}`;

function cadence(job: string, expectedIntervalSec: number, bucket: string): JobCadence {
  return { job, expectedIntervalSec, bucket };
}

function unhealthy(partial: Pick<JobHealthRow, "job" | "status"> & Partial<JobHealthRow>): JobHealthRow {
  return {
    bucket: "hourly",
    expectedIntervalSec: 3600,
    lastSuccessAt: null,
    ageSec: null,
    lastResult: null,
    ...partial,
  };
}

async function digestsFor(job: string) {
  const r = await pool.query(
    `SELECT message, reason, is_read, metadata FROM admin_notifications
     WHERE type = $1 AND metadata->>'job' = $2 ORDER BY id`,
    [JOB_STALE_DIGEST_TYPE, job],
  );
  return r.rows as Array<{ message: string; reason: string; is_read: boolean; metadata: Record<string, unknown> }>;
}

async function staffFor(job: string) {
  const r = await pool.query(
    `SELECT user_id, type, title, message, dedupe_key, data FROM notifications
     WHERE dedupe_key LIKE $1 ORDER BY user_id`,
    [`job-missed-run:${DAY}:${job}:%`],
  );
  return r.rows as Array<{
    user_id: string;
    type: string;
    title: string;
    message: string;
    dedupe_key: string;
    data: Record<string, unknown>;
  }>;
}

describe("row 100 missed-run cron alerts", () => {
  before(async () => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
    assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
    await pool.query(
      `INSERT INTO users (id, email, first_name, last_name, role) VALUES
       ($1, $2, 'Row', 'Hundred', 'admin'),
       ($3, $4, 'Row', 'Hundred', 'admin')`,
      [ADMIN_A, `${ADMIN_A}@traveloure-qa.test`, ADMIN_B, `${ADMIN_B}@traveloure-qa.test`],
    );
  });

  after(async () => {
    try {
      await pool.query(`DELETE FROM notifications WHERE dedupe_key LIKE $1`, [`job-missed-run:%:${PREFIX}%`]);
      await pool.query(
        `DELETE FROM admin_notifications WHERE type = $1 AND metadata->>'job' LIKE $2`,
        [JOB_STALE_DIGEST_TYPE, `${PREFIX}%`],
      );
      await pool.query(`DELETE FROM job_heartbeats WHERE job_name LIKE $1`, [`${PREFIX}%`]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[ADMIN_A, ADMIN_B]]);
    } finally {
      await pool.end();
    }
  });

  it("A1 a stale job alerts once per job per UTC day, including a second stale job", async () => {
    const jobA = `${PREFIX}stale-a`;
    const jobB = `${PREFIX}stale-b`;
    const intervalSec = 15 * 60;
    const staleAt = new Date(NOW.getTime() - intervalSec * 3 * 1000);
    await db.insert(jobHeartbeats).values([
      { jobName: jobA, lastSuccessAt: staleAt, lastResult: { ok: true, note: SECRET_MARKER } },
      { jobName: jobB, lastSuccessAt: staleAt, lastResult: { ok: true } },
    ]);
    const [beforeA] = await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.jobName, jobA));
    const roster = [cadence(jobA, intervalSec, "backstops"), cadence(jobB, intervalSec, "backstops")];

    await recordStaleJobAlerts({ now: NOW, roster });
    await recordStaleJobAlerts({ now: NOW, roster });

    const admins = await getAdminUserIds();
    assert.ok(admins.includes(ADMIN_A));
    assert.ok(admins.includes(ADMIN_B));

    for (const job of [jobA, jobB]) {
      const digest = await digestsFor(job);
      assert.equal(digest.length, 1, job);
      assert.equal(digest[0].reason, "stale");
      assert.equal(digest[0].is_read, false);
      assert.equal(digest[0].metadata.job, job);
      assert.equal(digest[0].metadata.status, "stale");
      assert.equal(digest[0].metadata.expectedIntervalSec, intervalSec);
      assert.equal(digest[0].metadata.bucket, "backstops");
      assert.equal(digest[0].metadata.day, DAY);
      assert.equal(JSON.stringify(digest[0]).includes(SECRET_MARKER), false);
      const message = jobStaleAlertMessage({
        job,
        status: "stale",
        lastSuccessAt: new Date(digest[0].metadata.lastSuccessAt as string).toISOString(),
        expectedIntervalSec: intervalSec,
        bucket: "backstops",
      });
      assert.equal(digest[0].message, message);
      assert.match(digest[0].message, /Last cron-driven success: 20/);
      assert.match(digest[0].message, /Expected cadence: every 15 minutes \(backstops\)/);

      const staff = await staffFor(job);
      assert.equal(staff.length, admins.length, job);
      const ids = staff.map((row) => row.user_id);
      assert.ok(ids.includes(ADMIN_A));
      assert.ok(ids.includes(ADMIN_B));
      for (const row of staff) {
        assert.equal(row.type, JOB_STALE_STAFF_TYPE);
        assert.equal(row.title, jobStaleAlertTitle({ job, status: "stale" }));
        assert.equal(row.message, message);
        assert.equal(row.dedupe_key, jobStaleStaffDedupeKey(DAY, job, row.user_id));
        assert.equal(row.data.reason, "stale");
        assert.equal(JSON.stringify(row).includes(SECRET_MARKER), false);
      }
    }

    const [afterA] = await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.jobName, jobA));
    assert.equal(
      new Date(afterA.lastSuccessAt).getTime(),
      new Date(beforeA.lastSuccessAt).getTime(),
      "alerting a stale job must not stamp its heartbeat",
    );
  });

  it("A2 all ok writes nothing", async () => {
    const job = `${PREFIX}ok`;
    await db.insert(jobHeartbeats).values({
      jobName: job,
      lastSuccessAt: NOW,
      lastResult: { ok: true, note: SECRET_MARKER },
    });
    await recordStaleJobAlerts({ now: NOW, roster: [cadence(job, 60 * 60, "hourly")] });
    assert.equal((await digestsFor(job)).length, 0);
    assert.equal((await staffFor(job)).length, 0);
  });

  it("A3 never_succeeded is alerted", async () => {
    const job = `${PREFIX}never`;
    const roster = [cadence(job, 24 * 60 * 60, "daily")];
    await recordStaleJobAlerts({ now: NOW, roster });
    const digest = await digestsFor(job);
    assert.equal(digest.length, 1);
    assert.equal(digest[0].reason, "never_succeeded");
    assert.equal(digest[0].metadata.lastSuccessAt, null);
    assert.equal(
      digest[0].message,
      jobStaleAlertMessage({
        job,
        status: "never_succeeded",
        lastSuccessAt: null,
        expectedIntervalSec: 24 * 60 * 60,
        bucket: "daily",
      }),
    );
    assert.match(digest[0].message, /none recorded/);
    assert.match(digest[0].message, /every 24 hours \(daily\)/);
    const heartbeats = await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.jobName, job));
    assert.equal(heartbeats.length, 0, "never_succeeded stays without a heartbeat");
    const staff = await staffFor(job);
    assert.ok(staff.length >= 2);
    assert.equal(staff[0].title, `Scheduled job ${job} is never_succeeded`);
  });

  it("A4 a thrown database read leaves the caller unaffected", async () => {
    const job = `${PREFIX}throw`;
    const original = db.select.bind(db);
    (db as any).select = () => {
      throw new Error("database unavailable");
    };
    let continued = false;
    try {
      await recordStaleJobAlerts({ now: NOW, roster: [cadence(job, 60, "hourly")] });
      continued = true;
    } finally {
      (db as any).select = original;
    }
    assert.equal(continued, true);
    assert.equal((await digestsFor(job)).length, 0);
    assert.equal((await pool.query("SELECT 1 AS ok")).rows[0].ok, 1);
  });

  it("A5 a thrown writer does not reject, and a later job still alerts", async () => {
    const first = unhealthy({ job: `${PREFIX}writer-a`, status: "stale", lastSuccessAt: "2026-10-28T00:00:00.000Z" });
    const second = unhealthy({ job: `${PREFIX}writer-b`, status: "never_succeeded" });
    const digests: JobStaleDigestRow[] = [];
    const staff: JobStaleStaffRow[] = [];
    await recordStaleJobAlerts({ now: NOW, rows: [first, second] }, {
      health: async () => {
        throw new Error("unused");
      },
      alreadyRecordedToday: async () => false,
      writeDigest: async (row) => {
        if (row.metadata.job === first.job) throw new Error("database unavailable");
        digests.push(row);
      },
      adminUserIds: async () => [ADMIN_A, ADMIN_B],
      writeStaff: async (row) => {
        staff.push(row);
      },
    });
    assert.equal(digests.length, 1);
    assert.equal(digests[0].metadata.job, second.job);
    assert.equal(staff.length, 2);
    assert.deepEqual(staff.map((row) => row.userId), [ADMIN_A, ADMIN_B]);
  });

  it("A6 the runner does not stamp, send mail, or add a route", () => {
    assert.equal(formatExpectedCadence(60 * 60), "every 1 hour");
    assert.equal(formatExpectedCadence(90), "every 90 seconds");
    const service = fs.readFileSync("server/services/job-stale-alert.service.ts", "utf8");
    assert.equal(service.includes("recordJobSuccess"), false);
    assert.equal(service.includes("jobHeartbeats"), false);
    assert.doesNotMatch(service, /email\.service|resend|sendEmail|ADMIN_EMAIL/i);
    const routes = fs.readFileSync("server/routes/internal.routes.ts", "utf8");
    const start = routes.indexOf('router.post("/internal/jobs/routing-recheck"');
    const end = routes.indexOf("router.post(", start + 1);
    const handler = routes.slice(start, end);
    const runAt = handler.indexOf('runJob("routing-recheck"');
    const alertAt = handler.indexOf("recordStaleJobAlerts({ roster: JOB_CADENCE })");
    assert.ok(runAt > 0 && alertAt > runAt, "the alert runs after the job, on the hourly pass");
    assert.equal(handler.includes("recordJobSuccess"), false);
    assert.equal(routes.includes("/internal/jobs/job-stale"), false);
    assert.equal(routes.includes("/internal/jobs/missed-run"), false);
  });
});
