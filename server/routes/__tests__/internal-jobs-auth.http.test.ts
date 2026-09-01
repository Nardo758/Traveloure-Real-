/**
 * internal-jobs-auth.http.test.ts — the machine-to-machine guard on the scheduler-reliability
 * internal job routes (#1712).
 *
 * These endpoints run MONEY and INTEGRITY jobs with no user session, so the ONLY thing standing
 * between the open internet and "release earnings" / "auto-complete bookings" is the shared
 * INTERNAL_JOB_SECRET guard. This proves the guard is DEFAULT-DENY on EVERY new route, exactly as
 * the occasion-drafts runner is:
 *   - 503 while the secret is unconfigured (fail closed, never fail open),
 *   - 401 with a missing or wrong secret,
 * and that the guard runs BEFORE the job body (these cases never touch the DB — no fixture needed).
 *
 * The happy-path idempotency of each job is proven at the DB layer by the existing suites
 * (booking-auto-complete.db, checkout-claim-sweep.db, reconciliation-detection.db,
 * booking-completion-machinery.db) and the "runs once / overlapping call no-ops" mechanism the
 * endpoints delegate to is proven by background-job-runner.test.ts ("skips an overlapping pass").
 */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import internalRoutes from "../internal.routes";

// Every route the jobs-cron workflow POSTs (occasion-drafts has its own workflow but shares the guard).
const JOB_ROUTES = [
  "/internal/jobs/earnings-release",
  "/internal/jobs/booking-auto-completion",
  "/internal/jobs/stripe-reconciliation",
  "/internal/jobs/checkout-sweep",
  "/internal/jobs/availability-materialization",
  "/internal/jobs/booking-expiry",
  "/internal/jobs/travelpayouts-report-poll",
  "/internal/jobs/itinerary-generation-sweep",
  "/internal/jobs/email-outbox",
  "/internal/run-occasion-drafts",
];

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

function post(baseUrl: string, path: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
  });
}

test("every job route returns 503 while INTERNAL_JOB_SECRET is unconfigured (fail closed)", async () => {
  const prev = process.env.INTERNAL_JOB_SECRET;
  delete process.env.INTERNAL_JOB_SECRET;
  try {
    await withServer(async (baseUrl) => {
      for (const route of JOB_ROUTES) {
        const res = await post(baseUrl, route, { "x-internal-secret": "anything" });
        assert.equal(res.status, 503, `${route} should be 503 when the secret is unset, got ${res.status}`);
      }
    });
  } finally {
    if (prev === undefined) delete process.env.INTERNAL_JOB_SECRET;
    else process.env.INTERNAL_JOB_SECRET = prev;
  }
});

test("every job route returns 401 with a missing or wrong secret (never reaches the job body)", async () => {
  const prev = process.env.INTERNAL_JOB_SECRET;
  process.env.INTERNAL_JOB_SECRET = "correct-horse-battery-staple";
  try {
    await withServer(async (baseUrl) => {
      for (const route of JOB_ROUTES) {
        const missing = await post(baseUrl, route);
        assert.equal(missing.status, 401, `${route} should be 401 with no secret, got ${missing.status}`);

        const wrong = await post(baseUrl, route, { "x-internal-secret": "not-the-secret" });
        assert.equal(wrong.status, 401, `${route} should be 401 with a wrong secret, got ${wrong.status}`);

        const wrongBearer = await post(baseUrl, route, { authorization: "Bearer not-the-secret" });
        assert.equal(wrongBearer.status, 401, `${route} should be 401 with a wrong bearer, got ${wrongBearer.status}`);
      }
    });
  } finally {
    if (prev === undefined) delete process.env.INTERNAL_JOB_SECRET;
    else process.env.INTERNAL_JOB_SECRET = prev;
  }
});
