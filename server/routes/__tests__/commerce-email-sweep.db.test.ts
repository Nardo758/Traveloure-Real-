import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { users, cartItems } from "../../../shared/schema";
import internalRoutes, { JOB_CADENCE, runJob } from "../internal.routes";
import {
  runCommerceEmailSweep, commerceSweepDependencies, commerceCartScopeId,
} from "../../services/commerce-email-sweep.service";
import { computeJobHealth } from "../../services/job-heartbeats.service";
import { messagingAutomationRegistry } from "../../automations/messaging";
import { _outboxTestHooks } from "../../services/email-outbox.service";

test("Part 3: two randomized isolated queue-only loops plus hostile scenarios", async () => {
  assert.match(process.env.MESSAGING_VERIFICATION_SCHEMA ?? "", /^automation_msg_[a-f0-9]{16}$/);
  assert.equal((await db.execute(sql`SELECT current_schema() AS s`)).rows[0].s,
    process.env.MESSAGING_VERIFICATION_SCHEMA);
  // Approved held migration applies ONLY to this disposable schema, never public/prod.
  await db.execute(sql.raw(readFileSync(
    "server/migrations/360_job_heartbeats_nullable_success.sql", "utf8")));
  // Main-only CI may lack the existing development commerce index. Reproduce
  // that already-existing constraint only inside this disposable test schema.
  const indexes = await db.execute(sql`
    SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema()
    AND tablename = 'email_outbox'`);
  if (!indexes.rows.some((r: any) => r.indexdef.includes("UNIQUE INDEX") && r.indexdef.includes("commerceKey"))) {
    await db.execute(sql`CREATE UNIQUE INDEX email_outbox_commerce_key
      ON email_outbox ((metadata ->> 'commerceKey')) WHERE metadata ? 'commerceKey'`);
  }
  assert.ok(!readFileSync("server/migrations/migration-files.ts", "utf8")
    .includes('"360_job_heartbeats_nullable_success.sql"'));

  let deliveryCalls = 0;
  _outboxTestHooks.sendEmailFn = async () => { deliveryCalls++; throw new Error("Delivery forbidden in Part 3"); };
  const originalSelect = commerceSweepDependencies.selectCandidates;
  const oldSecret = process.env.INTERNAL_JOB_SECRET;
  process.env.INTERNAL_JOB_SECRET = randomUUID();
  const app = express(); app.use(express.json()); app.use(internalRoutes);
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (secret: string | undefined = process.env.INTERNAL_JOB_SECRET) => fetch(
    `${base}/internal/jobs/commerce-email-sweep`,
    { method: "POST", headers: secret ? { "x-internal-secret": secret } : {} });
  const rows = async () => (await db.execute(sql`
    SELECT id, status, metadata, resend_id, sent_at FROM email_outbox ORDER BY id`)).rows;
  const heartbeat = async () => (await db.execute(sql`
    SELECT last_success_at, last_result, updated_at FROM job_heartbeats
    WHERE job_name = 'commerce-email-sweep'`)).rows[0] as any;
  const health = async () => (await computeJobHealth(JOB_CADENCE))
    .find(r => r.job === "commerce-email-sweep")!;
  const clean = async () => {
    await db.execute(sql`DELETE FROM email_outbox`);
    await db.execute(sql`DELETE FROM cart_items`);
    await db.execute(sql`DELETE FROM job_heartbeats`);
  };
  const fixture = async (userId: string | null, scope: string | null,
    activity: unknown, guest: string | null = null) =>
    db.insert(cartItems).values({
      userId, guestSessionId: guest, experienceSlug: scope,
      quantity: 1 + Math.floor(Math.random() * 4),
      contentMeta: { _cart_automation: { activity } },
    });
  const evidence: object[] = [];
  try {
    assert.equal((await post("")).status, 401);
    assert.equal((await post("not-the-secret")).status, 401);
    for (let loop = 1; loop <= 2; loop++) {
      await clean();
      const userId = randomUUID();
      await db.insert(users).values({
        id: userId, role: "traveler", email: `${randomUUID()}@traveloure-qa.test`,
      });
      const idle = Date.now() - 3_600_000 - 10_000 - Math.floor(Math.random() * 50_000);
      // Same sequence across two carts: without cart scope in the key this is
      // a real collision, not a vacuous different-sequence uniqueness check.
      const seqA = randomUUID(), seqB = seqA;
      const scopeA = `a-${randomUUID().slice(0, 8)}`, scopeB = `b-${randomUUID().slice(0, 8)}`;
      await fixture(userId, scopeA, { at_ms: idle, sequence_id: seqA });
      await fixture(userId, scopeB, { at_ms: idle - 1000, sequence_id: seqB });

      // Sequential native sweeps hit the REAL unique index.
      const first = await runCommerceEmailSweep();
      const second = await runCommerceEmailSweep();
      assert.deepEqual([first.candidates, first.enqueued, first.duplicates, first.skipped], [2, 2, 0, 0]);
      assert.deepEqual([second.candidates, second.enqueued, second.duplicates, second.skipped], [2, 0, 2, 0]);
      let queued = await rows();
      assert.equal(queued.length, 2);
      assert.equal(new Set(queued.map((r: any) => r.metadata.commerceKey)).size, 2);
      for (const row of queued as any[]) {
        assert.equal(row.status, "pending"); assert.equal(row.resend_id, null); assert.equal(row.sent_at, null);
        assert.ok(row.metadata.commerceKey.includes(`user:${userId}:cart:experience:`));
      }
      assert.notEqual(commerceCartScopeId(null), commerceCartScopeId("unscoped"));
      // Explicit barrier: both candidate reads finish before either INSERT begins.
      await db.execute(sql`DELETE FROM email_outbox`);
      let arrivals = 0, release!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      commerceSweepDependencies.selectCandidates = async () => {
        const selected = await originalSelect();
        if (++arrivals === 2) release();
        await barrier; return selected;
      };
      const concurrent = await Promise.all([runCommerceEmailSweep(), runCommerceEmailSweep()]);
      commerceSweepDependencies.selectCandidates = originalSelect;
      assert.equal(concurrent.reduce((n, r) => n + r.enqueued, 0), 2);
      assert.equal(concurrent.reduce((n, r) => n + r.duplicates, 0), 2);
      assert.equal((await rows()).length, 2);

      // Actual authenticated internal route stamps a real success.
      const start = Date.now();
      const response = await post(); assert.equal(response.status, 200);
      const success = await response.json() as any;
      assert.equal(success.ok, true); assert.equal(success.result.enqueued, 0);
      let hb = await heartbeat();
      const succeededAt = new Date(hb.last_success_at).getTime();
      assert.ok(succeededAt >= start && succeededAt <= Date.now());
      assert.equal((await health()).status, "ok");

      // A genuine failing SELECT, not a mocked empty result; preserve past success.
      commerceSweepDependencies.selectCandidates = async () => {
        await db.execute(sql`SELECT 1 / 0 AS injected_candidate_query_failure`);
        throw new Error("unreachable");
      };
      assert.equal((await post()).status, 500);
      hb = await heartbeat();
      assert.equal(hb.last_result.status, "FAILED");
      assert.equal(new Date(hb.last_success_at).getTime(), succeededAt);
      assert.ok(new Date(hb.updated_at).getTime() >= succeededAt);
      assert.equal((await health()).status, "failed");
      await db.execute(sql`DELETE FROM job_heartbeats WHERE job_name = 'commerce-email-sweep'`);
      assert.equal((await post()).status, 500);
      hb = await heartbeat();
      assert.equal(hb.last_success_at, null); assert.equal(hb.last_result.status, "FAILED");
      assert.equal((await health()).status, "failed");
      commerceSweepDependencies.selectCandidates = originalSelect;

      // No due carts (real current activity); then genuinely no candidate rows.
      await db.execute(sql`DELETE FROM cart_items`);
      await fixture(userId, null, { at_ms: Date.now(), sequence_id: randomUUID() });
      const notDue = await runCommerceEmailSweep();
      assert.deepEqual([notDue.candidates, notDue.enqueued, notDue.duplicates, notDue.skipped], [1, 0, 0, 1]);
      assert.equal(notDue.skipReasons.not_idle, 1);
      await db.execute(sql`DELETE FROM cart_items`);
      const emptyResponse = await post(); assert.equal(emptyResponse.status, 200);
      const empty = await emptyResponse.json() as any;
      assert.deepEqual(empty.result, { candidates: 0, enqueued: 0, duplicates: 0, skipped: 0, skipReasons: {} });
      assert.equal((await health()).status, "ok");

      // ATTACK 1: malformed legacy stamps and absence are skipped, never guessed.
      await fixture(userId, `bad-${loop}`, { at_ms: "huge", sequence_id: randomUUID() });
      await fixture(userId, `old-${loop}`, undefined);
      // ATTACK 2: guest has no account recipient.
      await fixture(null, null, { at_ms: idle, sequence_id: randomUUID() }, randomUUID());
      // ATTACK 3: a real-looking address in an accidental data-bearing clone cannot queue.
      const blockedId = randomUUID();
      await db.insert(users).values({ id: blockedId, email: `${randomUUID()}@example.com` });
      await fixture(blockedId, null, { at_ms: idle, sequence_id: randomUUID() });
      const attacked = await runCommerceEmailSweep();
      assert.deepEqual([attacked.candidates, attacked.enqueued, attacked.skipped], [4, 0, 4]);
      assert.deepEqual(attacked.skipReasons, {
        invalid_activity_stamp: 1, no_activity_stamp: 1, no_account_recipient: 1, non_qa_recipient: 1,
      });
      // ATTACK 4: resumed scope gets a new key, old history cannot block it.
      await db.execute(sql`DELETE FROM cart_items`);
      await fixture(userId, scopeA, { at_ms: idle, sequence_id: randomUUID() });
      assert.equal((await runCommerceEmailSweep()).enqueued, 1);
      // ATTACK 5: production refuses even when a valid isolation name exists.
      const oldEnv = process.env.NODE_ENV, before = (await rows()).length;
      try {
        process.env.NODE_ENV = "production";
        assert.equal((await (await post()).json() as any).reason, "disabled");
        await assert.rejects(runCommerceEmailSweep, /not released/);
        assert.equal((await rows()).length, before);
      } finally { process.env.NODE_ENV = oldEnv; }

      // Other jobs still stamp success only, leave failed/skip attempts untouched.
      const oldJob = `legacy-${randomUUID()}`;
      await runJob(oldJob, async () => ({ processed: loop }), undefined, { useBackgroundJobRunner: false });
      const oldRow = (await db.execute(sql`SELECT * FROM job_heartbeats WHERE job_name = ${oldJob}`)).rows[0] as any;
      await runJob(oldJob, async () => { throw new Error("synthetic legacy failure"); }, undefined,
        { useBackgroundJobRunner: false });
      await runJob(oldJob, async () => ({ skipReason: "not_due" }), undefined,
        { useBackgroundJobRunner: false, isSkip: () => true });
      const unchanged = (await db.execute(sql`SELECT * FROM job_heartbeats WHERE job_name = ${oldJob}`)).rows[0];
      assert.deepEqual(unchanged, oldRow);
      const never = await computeJobHealth([{ job: `never-${randomUUID()}`, bucket: "backstops", expectedIntervalSec: 900 }]);
      assert.equal(never[0].status, "never_succeeded");
      assert.equal(messagingAutomationRegistry.byId.has("messaging.commerce-email-sweep"), true);
      assert.equal(JOB_CADENCE.filter(r => r.job === "commerce-email-sweep").length, 1);
      assert.equal(deliveryCalls, 0);
      evidence.push({ loop, scenario: randomUUID(), clean: true,
        sequentialRows: 2, concurrentRows: 2, concurrentDuplicates: 2,
        firstFailureSuccessIsNull: true, previousSuccessPreserved: true,
        emptyEnqueued: 0, deliveryCalls, attackScenarios: 5 });
    }
    execFileSync("node", ["scripts/check-jobs-cron-roster.cjs"], { stdio: "pipe" });
    execFileSync("node", ["scripts/check-test-files-wired.cjs"], { stdio: "pipe" });
    console.log("PART3_LOOP_EVIDENCE=" + JSON.stringify(evidence));
  } finally {
    commerceSweepDependencies.selectCandidates = originalSelect;
    _outboxTestHooks.sendEmailFn = null;
    if (oldSecret === undefined) delete process.env.INTERNAL_JOB_SECRET;
    else process.env.INTERNAL_JOB_SECRET = oldSecret;
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await pool.end();
  }
});
