import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

// Only persistence is simulated. The sweeps, cron wrapper, heartbeat writer,
// health computation and HTTP routes below are the production implementations.
const fixture = vi.hoisted(() => ({
  execute: vi.fn(),
  write: vi.fn(),
  heartbeats: new Map<string, Record<string, unknown>>(),
}));
vi.mock("../../db", () => ({
  db: {
    execute: fixture.execute,
    select: () => ({ from: async () => [...fixture.heartbeats.values()] }),
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
// Unrelated job modules eagerly initialize Stripe on import. No provider call
// belongs in this test; supply a non-credential and a client with no operations.
vi.mock("../../utils/stripe-key", () => ({
  getStripeSecretKey: () => "sk_test_not_a_real_key",
}));
vi.mock("stripe", () => ({ default: class NoNetworkStripe {} }));

import internalRoutes, { JOB_CADENCE } from "../internal.routes";
import { sweepExpiredCheckoutClaims, sweepStaleAuthorizedClaims } from "../../services/checkout-claim.service";

const SECRET = "checkout-sweep-failure-test-only";
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let base: string;
const originalSecret = process.env.INTERNAL_JOB_SECRET;
beforeAll(async () => {
  process.env.INTERNAL_JOB_SECRET = SECRET;
  const app = express();
  app.use(express.json(), internalRoutes);
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
  fixture.execute.mockReset().mockResolvedValue({ rows: [] });
  fixture.write.mockClear();
  fixture.heartbeats.clear();
  // Make every other job fresh, so global healthy=false is attributable to checkout.
  for (const { job } of JOB_CADENCE) {
    if (job !== "checkout-sweep") {
      fixture.heartbeats.set(job, { jobName: job, lastSuccessAt: new Date(), lastResult: { ok: true } });
    }
  }
});
async function health() {
  const response = await fetch(`${base}/internal/jobs/health`, { headers: { "x-internal-secret": SECRET } });
  expect(response.status).toBe(200);
  return response.json();
}
async function postSweep() {
  return fetch(`${base}/internal/jobs/checkout-sweep`, {
    method: "POST",
    headers: { "x-internal-secret": SECRET, "content-type": "application/json" },
    body: "{}",
  });
}
describe("checkout candidate scan failures cannot refresh cron success", () => {
  it.each([
    ["unauthorized", sweepExpiredCheckoutClaims],
    ["authorized", sweepStaleAuthorizedClaims],
  ] as const)("%s sweep exposes the actual candidate-query failure", async (_name, sweep) => {
    fixture.execute.mockRejectedValueOnce(new Error("simulated candidate-query failure"));
    expect((await sweep()).error).toBe("simulated candidate-query failure");
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it.each([1, 2])("failure of scan %i returns HTTP 500 and never stamps a missing heartbeat", async (scan) => {
    if (scan === 2) fixture.execute.mockResolvedValueOnce({ rows: [] });
    fixture.execute.mockRejectedValueOnce(new Error("simulated candidate-query failure"));
    const response = await postSweep();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("simulated candidate-query failure");
    expect(fixture.write).not.toHaveBeenCalled();
    expect(fixture.heartbeats.has("checkout-sweep")).toBe(false);
    const status = await health();
    expect(status.healthy).toBe(false);
    expect(status.staleCount).toBe(1);
    expect(status.jobs.find((job: { job: string }) => job.job === "checkout-sweep").status).toBe("never_succeeded");
  });

  it.each([1, 2])("failure of scan %i preserves a stale heartbeat instead of making it healthy", async (scan) => {
    const entry = JOB_CADENCE.find(({ job }) => job === "checkout-sweep")!;
    const previous = {
      jobName: entry.job,
      lastSuccessAt: new Date(Date.now() - 3 * entry.expectedIntervalSec * 1000),
      lastResult: { ok: true, previousPass: true },
    };
    fixture.heartbeats.set(entry.job, previous);
    if (scan === 2) fixture.execute.mockResolvedValueOnce({ rows: [] });
    fixture.execute.mockRejectedValueOnce(new Error("simulated candidate-query failure"));
    expect((await postSweep()).status).toBe(500);
    expect(fixture.write).not.toHaveBeenCalled();
    expect(fixture.heartbeats.get(entry.job)).toEqual(previous);
    const status = await health();
    expect(status.healthy).toBe(false);
    expect(status.jobs.find((job: { job: string }) => job.job === entry.job).status).toBe("stale");
  });

  it("two completed empty scans are an honest success and recovery stamps exactly once", async () => {
    const response = await postSweep();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.result.error).toBeUndefined();
    expect(fixture.execute).toHaveBeenCalledTimes(2);
    expect(fixture.write).toHaveBeenCalledTimes(1);
    const status = await health();
    expect(status.healthy).toBe(true);
    expect(status.staleCount).toBe(0);
  });

  it("both failed scans retain both diagnostics and withhold the heartbeat", async () => {
    fixture.execute.mockRejectedValue(new Error("simulated candidate-query failure"));
    const response = await postSweep();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.result.unauthorized.error).toContain("simulated candidate-query failure");
    expect(body.result.authorized.error).toContain("simulated candidate-query failure");
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it.each([new Error(""), ""])("even an empty thrown diagnostic cannot become success (%s)", async (error) => {
    fixture.execute.mockRejectedValueOnce(error);
    const response = await postSweep();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBeTruthy();
    expect(fixture.write).not.toHaveBeenCalled();
  });

  it("a failed scan followed by a completed scan recovers only on the completed pass", async () => {
    fixture.execute.mockRejectedValueOnce(new Error("simulated candidate-query failure"));
    expect((await postSweep()).status).toBe(500);
    expect(fixture.write).not.toHaveBeenCalled();
    expect((await health()).healthy).toBe(false);
    expect((await postSweep()).status).toBe(200);
    expect(fixture.write).toHaveBeenCalledTimes(1);
    expect((await health()).healthy).toBe(true);
  });
});