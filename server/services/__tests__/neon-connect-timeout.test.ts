/**
 * Neon connect timeouts: pool settings, single-flight liveness budget, readiness
 * retry, and the itinerary sweep's one-warn backoff. No database.
 *
 * Run: npx tsx --test server/services/__tests__/neon-connect-timeout.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BACKGROUND_POOL_MAX,
  POOL_CONNECTION_TIMEOUT_MS,
  POOL_IDLE_TIMEOUT_MS,
  POOL_KEEPALIVE_INITIAL_DELAY_MS,
  REQUEST_POOL_MAX,
  SESSION_POOL_MAX,
  backgroundPoolConfig,
  requestPoolConfig,
  sessionPoolConfig,
} from "../../db-pool-config";
import { isConnectTimeoutError } from "../connect-timeout";
import { SWEEP_CONNECT_BACKOFF_MS, SweepConnectBackoff } from "../sweep-connect-backoff";
import {
  LIVENESS_DB_BUDGET_MS,
  READINESS_ATTEMPTS,
  READINESS_ATTEMPT_BUDGET_MS,
  READINESS_RETRY_DELAY_MS,
  createDbProbe,
  probeDatabaseReady,
} from "../db-readiness";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

test("pool settings wait out a Neon wake-up and keep sweeps off the request pool", () => {
  const request = requestPoolConfig("postgres://example");
  const background = backgroundPoolConfig("postgres://example");
  const session = sessionPoolConfig("postgres://example");
  assert.equal(request.max, REQUEST_POOL_MAX);
  assert.equal(request.max, 10);
  assert.equal(background.max, BACKGROUND_POOL_MAX);
  assert.equal(session.max, SESSION_POOL_MAX);
  assert.ok(background.max < request.max);
  assert.equal(session.max, 2);
  for (const pool of [request, background, session]) {
    assert.equal(pool.connectionString, "postgres://example");
    assert.equal(pool.connectionTimeoutMillis, POOL_CONNECTION_TIMEOUT_MS);
    assert.equal(pool.connectionTimeoutMillis, 15_000);
    assert.equal(pool.idleTimeoutMillis, POOL_IDLE_TIMEOUT_MS);
    assert.equal(pool.idleTimeoutMillis, 20_000);
    assert.equal(pool.keepAlive, true);
    assert.equal(pool.keepAliveInitialDelayMillis, POOL_KEEPALIVE_INITIAL_DELAY_MS);
    assert.equal(pool.allowExitOnIdle, false);
  }
});

test("connect-timeout matcher accepts pg's two strings and rejects statement timeouts", () => {
  assert.equal(isConnectTimeoutError(new Error("timeout exceeded when trying to connect")), true);
  assert.equal(
    isConnectTimeoutError(new Error("Connection terminated due to connection timeout")),
    true,
  );
  const wrapped = new Error("Failed query");
  (wrapped as Error & { cause?: unknown }).cause = new Error("timeout exceeded when trying to connect");
  assert.equal(isConnectTimeoutError(wrapped), true);
  assert.equal(isConnectTimeoutError(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" })), true);
  assert.equal(isConnectTimeoutError(new Error("duplicate key value violates unique constraint")), false);
  assert.equal(isConnectTimeoutError(new Error("canceling statement due to statement timeout")), false);
});

test("sweep backoff warns once per outage and again only after a success", () => {
  const backoff = new SweepConnectBackoff();
  const t0 = 1_000_000;
  assert.equal(backoff.isCoolingDown(t0), false);
  assert.equal(backoff.noteTimeout(t0), true);
  assert.equal(backoff.isCoolingDown(t0 + SWEEP_CONNECT_BACKOFF_MS - 1), true);
  assert.equal(backoff.isCoolingDown(t0 + SWEEP_CONNECT_BACKOFF_MS), false);
  // A second timeout in the same episode does not warn again, and it refreshes the window.
  assert.equal(backoff.noteTimeout(t0 + 1), false);
  assert.equal(backoff.isCoolingDown(t0 + SWEEP_CONNECT_BACKOFF_MS), true);
  assert.equal(backoff.isCoolingDown(t0 + 1 + SWEEP_CONNECT_BACKOFF_MS), false);
  assert.equal(SWEEP_CONNECT_BACKOFF_MS, 60_000);
  backoff.noteSuccess();
  assert.equal(backoff.isCoolingDown(t0 + 1 + SWEEP_CONNECT_BACKOFF_MS), false);
  assert.equal(backoff.noteTimeout(t0 + SWEEP_CONNECT_BACKOFF_MS), true);
});

test("a health burst shares one in-flight connect", async () => {
  // The probe timer is unref'd so a health check cannot hold the process open.
  // This interval is what keeps the test alive until that timer fires.
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    let calls = 0;
    let release: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const probe = createDbProbe(() => {
      calls += 1;
      return pending;
    });
    const raced = probe.within(30);
    const shared = probe.once();
    assert.equal(await raced, false);
    assert.equal(calls, 1);
    release(1);
    assert.equal(await shared, true);
    assert.equal(calls, 1);
  } finally {
    clearInterval(keepAlive);
  }
});

test("readiness retries a short budget and stops once the database answers", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const woken = await probeDatabaseReady({
    probe: async () => {
      calls += 1;
      return calls === 3;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.deepEqual(woken, { ok: true, attempts: 3 });
  assert.deepEqual(sleeps, [READINESS_RETRY_DELAY_MS, READINESS_RETRY_DELAY_MS]);

  const down = await probeDatabaseReady({
    probe: async () => false,
    sleep: async () => {},
  });
  assert.deepEqual(down, { ok: false, attempts: READINESS_ATTEMPTS });

  const worst =
    READINESS_ATTEMPTS * READINESS_ATTEMPT_BUDGET_MS +
    (READINESS_ATTEMPTS - 1) * READINESS_RETRY_DELAY_MS;
  assert.ok(worst < 5_000, `readiness budget ${worst}ms must stay under the 5s probe timeout`);
  assert.ok(LIVENESS_DB_BUDGET_MS <= 1_000);
  assert.ok(LIVENESS_DB_BUDGET_MS < POOL_CONNECTION_TIMEOUT_MS);
});

test("liveness stays HTTP 200 and readiness retries without renaming the URLs", () => {
  const content = read("server/routes/content.routes.ts");
  const healthStart = content.indexOf('router.get("/api/health"');
  const health = content.slice(healthStart, content.indexOf('router.get("/api/status"', healthStart));
  assert.match(health, /dbHealthCheckWithin\(\)/);
  assert.match(health, /status: "degraded", db: false/);
  assert.doesNotMatch(health, /status\(503\)/);
  assert.match(
    health,
    /status: "ok", db: true, timestamp: new Date\(\)\.toISOString\(\), build, flags, egress, mapsCaps, keys, migrations, trendScores, supply \}/,
  );

  const index = read("server/index.ts");
  assert.match(index, /app\.get\("\/api\/ready"/);
  assert.match(index, /probeDatabaseReady\(\)/);
  assert.match(index, /ready: database\.ok/);

  const infra = read("server/infrastructure/health.ts");
  const liveStart = infra.indexOf('router.get("/health"');
  const readyStart = infra.indexOf('router.get("/health/ready"');
  const live = infra.slice(liveStart, readyStart);
  assert.doesNotMatch(live, /probeDatabaseReady|pool\.query|SELECT 1|checkDatabase\(/);
  assert.match(live, /not probed on liveness/);
  assert.match(infra.slice(readyStart), /probeDatabaseReady\(\)/);
  assert.match(infra, /router\.get\("\/health\/live"/);
});

test("the sweep catches a connect timeout on the background pool and does not error-log it", () => {
  const outcome = read("server/services/itinerary-generation-outcome.service.ts");
  const sweepFn = outcome.slice(outcome.indexOf("export async function sweepTimedOutGenerations"));
  const selectRegion = sweepFn.slice(0, sweepFn.indexOf("finishComparisonGeneration"));
  assert.match(selectRegion, /backgroundDb\.select/);
  assert.doesNotMatch(selectRegion, /await db\.select/);

  const scheduler = read("server/services/itinerary-generation-sweep-scheduler.service.ts");
  const timeoutBranch = scheduler.slice(
    scheduler.indexOf("if (isConnectTimeoutError(err))"),
    scheduler.indexOf('console.error("[ItineraryGenerationSweep] Sweep pass failed:"'),
  );
  assert.match(timeoutBranch, /logger\.warn/);
  assert.match(timeoutBranch, /backing off/);
  assert.match(timeoutBranch, /noteTimeout/);
  assert.match(timeoutBranch, /backedOff: true/);
  assert.doesNotMatch(timeoutBranch, /console\.error/);
  assert.match(scheduler, /skipped: "connect-backoff"/);
  assert.match(scheduler, /error: "database connect backoff"/);

  const auth = read("server/replit_integrations/auth/replitAuth.ts");
  assert.match(auth, /sessionPoolConfig/);
  assert.match(auth, /"\/api\/health"/);
  assert.match(auth, /"\/api\/ready"/);
  assert.match(auth, /isConnectTimeoutError/);

  const errors = read("server/infrastructure/error-handler.ts");
  assert.match(errors, /DATABASE_CONNECT_TIMEOUT/);
  assert.match(errors, /Database is waking up/);
  assert.match(errors, /res\.status\(503\)/);
});
