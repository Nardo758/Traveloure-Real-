import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { runCommerceEmailSweepSchedule } from "../../services/commerce-email-sweep.service";
import { recordJobSuccess, recordCommerceSweepFailure } from "../../services/job-heartbeats.service";
import { loadUncertainEmailSummary } from "../../services/email-outbox.service";
import { commerceSweepDependencies, runCommerceEmailSweep } from "../../services/commerce-email-sweep.service";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const binding = process.env.COMMERCE_QA_PROOF_RUN_ID ? JSON.parse(process.env.COMMERCE_QA_PROOF_RUN_ID) : undefined;
test("fresh owned runner: empty/failure/concurrent and wrong-owner rejection, two loops", { skip: !!binding?.sweepOnly }, async () => {
  const original = commerceSweepDependencies.selectCandidates;
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  try {
    await db.execute(sql`ALTER TABLE job_heartbeats ALTER COLUMN last_success_at DROP NOT NULL`);
    for (let loop=1; loop<=2; loop++) {
      await db.execute(sql`DELETE FROM job_heartbeats`);
      commerceSweepDependencies.selectCandidates = async () => { throw new Error("first_owned_candidate_fault"); };
      await assert.rejects(runCommerceEmailSweepSchedule(), /first_owned_candidate_fault/);
      await recordCommerceSweepFailure();
      const firstFailure = (await db.execute(sql`SELECT last_success_at,last_result FROM job_heartbeats
        WHERE job_name='commerce-email-sweep'`)).rows[0] as any;
      assert.equal(firstFailure.last_success_at, null);
      assert.equal(firstFailure.last_result.status, "FAILED");
      commerceSweepDependencies.selectCandidates = async () => [];
      const empty = await runCommerceEmailSweepSchedule();
      assert.equal(empty.enqueued, 0);
      await recordJobSuccess("commerce-email-sweep", { ...empty, ok: true });
      const success = (await db.execute(sql`SELECT last_result FROM job_heartbeats
        WHERE job_name='commerce-email-sweep'`)).rows[0] as any;
      assert.equal(success.last_result.ok, true);
      const paired = await Promise.all([runCommerceEmailSweep(),runCommerceEmailSweep()]);
      assert.equal(paired.reduce((n,row) => n+row.enqueued,0), 0);
      commerceSweepDependencies.selectCandidates = async () => { throw new Error("owned_candidate_fault"); };
      await assert.rejects(runCommerceEmailSweepSchedule(), /owned_candidate_fault/);
      await recordCommerceSweepFailure();
      const failed = (await db.execute(sql`SELECT last_result FROM job_heartbeats
        WHERE job_name='commerce-email-sweep'`)).rows[0] as any;
      assert.equal(failed.last_result.status, "FAILED");
      const fingerprint = (await db.execute(sql`SELECT md5(current_database() || ':' ||
        coalesce(inet_server_addr()::text,'local')) AS fingerprint`)).rows[0].fingerprint;
      const owner = spawn(process.execPath, ["scripts/verification/run-messaging-gate.mjs",
        "--isolated-db","--qa-proof-channel","--real-clock-sweep",
        "server/routes/__tests__/commerce-real-clock-sweep.db.test.ts"], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: process.env.DATABASE_URL,
          NODE_ENV: "development", ENVIRONMENT: "development", REPLIT_DEV_DOMAIN: "owned.test",
          MESSAGING_DEV_FINGERPRINT: String(fingerprint), COMMERCE_QA_DELIVERY_PROOF: "1",
          COMMERCE_QA_PROOF_RUN_ID: JSON.stringify({ runId: randomUUID(), token: "a".repeat(64),
            loop: 1, port: 1, sweepOnly: true, schema: process.env.MESSAGING_VERIFICATION_SCHEMA,
            cartId: randomUUID(), sequenceId: randomUUID(), startTime: new Date().toISOString() }) },
        stdio: ["ignore","ignore","pipe","ipc"],
      });
      let error = ""; owner.stderr.on("data", bytes => { error += bytes.toString(); });
      const exit = await new Promise(resolve => owner.once("exit", resolve));
      assert.notEqual(exit, 0); assert.match(error, /unowned or drifted retained fixture/);
    }
  } finally { commerceSweepDependencies.selectCandidates = original; await pool.end(); }
});

test("approved retained scenario: one real-clock sweep, no provider or scheduler", { skip: !binding?.sweepOnly }, async () => {
  assert.equal(binding.sweepOnly, true);
  assert.equal((await db.execute(sql`SELECT current_schema() AS name`)).rows[0].name, binding.schema);
  for (const name of ["RESEND_API_KEY", "SIGNUP_QA_TEST_INBOX", "ITINERARY_OUTCOME_TEST_EMAIL"])
    assert.equal(process.env[name], undefined);
  const before = (await db.execute(sql`SELECT content_meta FROM cart_items WHERE id=${binding.cartId}`)).rows[0];
  assert.ok(before);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("Provider/network forbidden"); }) as typeof fetch;
  const invokedAt = new Date().toISOString();
  try {
    let counts;
    try {
      counts = await runCommerceEmailSweepSchedule();
      if (!("enqueued" in counts)) throw new Error("Owned clock job was skipped, not a successful sweep");
      await recordJobSuccess("commerce-email-sweep", { ...counts, ok: true });
    } catch (error) {
      await recordCommerceSweepFailure();
      throw error;
    }
    const after = (await db.execute(sql`SELECT content_meta FROM cart_items WHERE id=${binding.cartId}`)).rows[0];
    assert.deepEqual(after.content_meta, before.content_meta, "Sweep must not move the clock/snapshot");
    const heartbeat = (await db.execute(sql`SELECT last_success_at,last_result FROM job_heartbeats
      WHERE job_name='commerce-email-sweep'`)).rows[0];
    assert.ok(heartbeat?.last_success_at, "A swallowed heartbeat failure is not proof of success");
    assert.equal((heartbeat.last_result as any)?.ok, true);
    const rows = (await db.execute(sql`SELECT id,status,email_type FROM email_outbox ORDER BY id`)).rows;
    const held = await loadUncertainEmailSummary();
    console.log("COMMERCE_REAL_CLOCK_SWEEP=" + JSON.stringify({
      runId: binding.runId, invokedAt, observedAt: new Date().toISOString(),
      counts, heartbeat, outbox: rows, uncertainAttempts: held,
      providerCallsBlocked: true, receiptId: null, status: "WAITING",
    }));
  } finally { globalThis.fetch = originalFetch; await pool.end(); }
});
