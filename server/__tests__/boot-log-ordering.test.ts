/**
 * BOOT-LOG ORDERING — the migration summary is visible, on the pino stream, before "Server started"
 * (Lane 3, boot-log-flush).
 *
 * Production's deploy log showed "…migrations pending" → "Server started" with NO completion summary
 * between them: runMigrations logged its summary via raw `console.log`, while the boot markers use
 * pino (which in production writes JSON straight to fd 1, transport undefined). Two write paths to
 * the same fd interleave unreliably, so the deploy-log capture dropped the raw summary. The fix logs
 * the summary through the SAME pino logger, from index.ts, before the listen/"Server started" line.
 *
 * This proves the observable contract against a REAL production boot: spawn the built bundle, capture
 * stdout, and assert the three markers appear in order —
 *   "migrations pending"  (prod pre-bind)  <  "Migrations complete" (with a visible count)  <  "Server started"
 * so the migration count (e.g. that migration 270 applied) is durably in the deploy log on the next
 * publish. A regression that reverts to console.log, or moves the summary after "Server started",
 * fails here.
 *
 * Requires the built bundle (dist/index.cjs) + a disposable Postgres (DATABASE_URL). Run in
 * boot-log-gate.yml. Run solo: npm run build && DATABASE_URL=…localhost… \
 *   npx tsx --test server/__tests__/boot-log-ordering.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const BUNDLE = path.resolve(process.cwd(), "dist/index.cjs");
const PORT = "5099";
const MIGRATIONS_PENDING = "migrations pending";
const MIGRATIONS_COMPLETE = "Migrations complete";
const SERVER_STARTED = "Server started";

test("prod boot logs the migration summary (with count) on the pino stream, between 'migrations pending' and 'Server started'", async () => {
  assert.ok(existsSync(BUNDLE), `built bundle missing at ${BUNDLE} — run 'npm run build' first`);
  assert.ok(
    (process.env.DATABASE_URL ?? "").length > 0,
    "DATABASE_URL must point at a disposable/CI Postgres for this boot test",
  );

  const child = spawn("node", [BUNDLE], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT,
      SESSION_SECRET: process.env.SESSION_SECRET ?? "ci-test-secret-not-for-production",
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_ci_stub_no_real_calls",
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_ci_stub_no_real_calls",
      XAI_API_KEY: process.env.XAI_API_KEY ?? "xai-ci-stub-no-real-calls",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "sk-ant-ci-stub-no-real-calls",
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? "re_ci_stub_no_real_calls",
      // Prod boot purges @traveloure.test accounts unless explicitly allowed; CI DB is throwaway.
      ALLOW_TEST_ACCOUNTS: "1",
      SESSION_COOKIE_INSECURE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let out = "";
  const seen = { pending: -1, complete: -1, started: -1 };
  const done = new Promise<void>((resolve) => {
    const onData = (buf: Buffer) => {
      out += buf.toString();
      if (seen.pending < 0 && out.includes(MIGRATIONS_PENDING)) seen.pending = out.indexOf(MIGRATIONS_PENDING);
      if (seen.complete < 0 && out.includes(MIGRATIONS_COMPLETE)) seen.complete = out.indexOf(MIGRATIONS_COMPLETE);
      if (seen.started < 0 && out.includes(SERVER_STARTED)) {
        seen.started = out.indexOf(SERVER_STARTED);
        resolve(); // "Server started" is the last marker we need — stop here
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 120_000));
  try {
    await Promise.race([done, timeout]);
  } finally {
    child.kill("SIGKILL");
  }

  assert.ok(seen.pending >= 0, `never logged the pre-bind '${MIGRATIONS_PENDING}' marker. Output:\n${out.slice(-2000)}`);
  assert.ok(seen.complete >= 0, `never logged the '${MIGRATIONS_COMPLETE}' summary — the deploy-log regression. Output:\n${out.slice(-2000)}`);
  assert.ok(seen.started >= 0, `never logged '${SERVER_STARTED}'. Output:\n${out.slice(-2000)}`);

  assert.ok(seen.pending < seen.complete, "'Migrations complete' must come AFTER 'migrations pending'");
  assert.ok(seen.complete < seen.started, "'Migrations complete' must come BEFORE 'Server started' (flushed before the ready line)");

  // The count must be visible — this is the line that verifies a migration (e.g. 270) applied.
  const summaryLine = out.split("\n").find((l) => l.includes(MIGRATIONS_COMPLETE)) ?? "";
  assert.ok(
    /appliedCount|stamped/.test(summaryLine),
    `the migration summary must carry a visible count (appliedCount/stamped). Line: ${summaryLine}`,
  );
});
