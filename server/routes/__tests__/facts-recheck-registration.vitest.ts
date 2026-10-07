import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

// Exercise the real route, job, overlap runner, heartbeat writer and health
// reader. Only persistence and unrelated Stripe initialization are simulated.
const fixture = vi.hoisted(() => ({
  execute: vi.fn(),
  write: vi.fn(),
  heartbeats: new Map<string, Record<string, unknown>>(),
}));
vi.mock("../../db", () => ({
  db: {
    execute: fixture.execute,
    select: () => ({ from: async () => Array.from(fixture.heartbeats.values()) }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          fixture.write(row);
          fixture.heartbeats.set(row.jobName as string, row);
        },
      }),
    }),
  },
  pool: { on: vi.fn(), query: vi.fn() },
  getPoolStats: () => ({ totalCount: 1, idleCount: 0, waitingCount: 0 }),
}));
vi.mock("../../utils/stripe-key", () => ({
  getStripeSecretKey: () => "sk_test_not_a_real_key",
}));
vi.mock("stripe", () => ({ default: class NoNetworkStripe {} }));

import internalRoutes, { JOB_CADENCE } from "../internal.routes";
import { runBackgroundJob } from "../../services/background-job-runner";

const SECRET = "facts-recheck-registration-test-only";
const originalSecret = process.env.INTERNAL_JOB_SECRET;
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json() as express.RequestHandler);
  app.use(internalRoutes);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (originalSecret === undefined) delete process.env.INTERNAL_JOB_SECRET;
  else process.env.INTERNAL_JOB_SECRET = originalSecret;
});
beforeEach(() => {
  process.env.INTERNAL_JOB_SECRET = SECRET;
  fixture.execute.mockReset().mockResolvedValue({ rows: [] });
  fixture.write.mockClear();
  fixture.heartbeats.clear();
  for (const { job } of JOB_CADENCE) {
    if (job !== "facts-recheck") {
      fixture.heartbeats.set(job, { jobName: job, lastSuccessAt: new Date(), lastResult: { ok: true } });
    }
  }
});
async function post(secret: string = SECRET) {
  return fetch(`${base}/internal/jobs/facts-recheck`, {
    method: "POST",
    headers: { "x-internal-secret": secret, "content-type": "application/json" },
    body: "{}",
  });
}
async function health() {
  const response = await fetch(`${base}/internal/jobs/health`, { headers: { "x-internal-secret": SECRET } });
  expect(response.status).toBe(200);
  return response.json();
}

describe("facts-recheck daily registration", () => {
  it("has exactly one daily roster entry and reports never_succeeded before the first run", async () => {
    expect(JOB_CADENCE.filter(({ job }) => job === "facts-recheck")).toEqual([
      { job: "facts-recheck", expectedIntervalSec: 86400, bucket: "daily" },
    ]);
    const body = await health();
    expect(body.jobs.find((job: { job: string }) => job.job === "facts-recheck").status).toBe("never_succeeded");
  });

  it("fails closed before running the job when the secret is unset or incorrect", async () => {
    delete process.env.INTERNAL_JOB_SECRET;
    expect((await post()).status).toBe(503);
    process.env.INTERNAL_JOB_SECRET = SECRET;
    expect((await post("wrong-test-only-secret")).status).toBe(401);
    expect((await post("")).status).toBe(401);
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it("returns the job counts and stamps a real empty-candidate success", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      // Step 9b (ledger `2026-10-07-step9b-optimizer-and-rechecks`): the leg re-check's counts ride along.
      ok: true, job: "facts-recheck", result: { checked: 0, conflicts: 0, notified: 0, failed: 0, legsChecked: 0, legsChanged: 0, legsNotified: 0 },
    });
    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(fixture.write).toHaveBeenCalledOnce();
    expect(fixture.write.mock.calls[0][0].jobName).toBe("facts-recheck");
    const body = await health();
    expect(body.jobs.find((job: { job: string }) => job.job === "facts-recheck").status).toBe("ok");
  });

  it("surfaces a candidate-scan error as HTTP 500 without stamping success", async () => {
    fixture.execute.mockRejectedValueOnce(new Error("simulated candidate-scan failure"));
    const response = await post();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, job: "facts-recheck", error: "simulated candidate-scan failure" });
    expect(fixture.write).not.toHaveBeenCalled();
    const body = await health();
    expect(body.jobs.find((job: { job: string }) => job.job === "facts-recheck").status).toBe("never_succeeded");
  });

  it("skips an overlapping pass without querying candidates or refreshing the heartbeat", async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const held = runBackgroundJob("facts-recheck", async () => {
      started();
      await new Promise<void>((resolve) => { release = resolve; });
      return { checked: 0, conflicts: 0, notified: 0, failed: 0 };
    });
    await ready;
    try {
      const response = await post();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, skipped: true, job: "facts-recheck" });
      expect(fixture.execute).not.toHaveBeenCalled();
      expect(fixture.write).not.toHaveBeenCalled();
    } finally {
      release();
      await held;
    }
  });
});