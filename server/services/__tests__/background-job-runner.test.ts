import assert from "node:assert/strict";
import test from "node:test";
import {
  getBackgroundJobStats,
  isTransientDatabaseError,
  runBackgroundJob, isBackgroundJobSkip } from "../background-job-runner";

test("classifies transient PostgreSQL connection failures without treating ordinary errors as retryable", () => {
  assert.equal(
    isTransientDatabaseError(Object.assign(new Error("too many clients"), { code: "53300" })),
    true,
  );
  assert.equal(
    isTransientDatabaseError(new Error("timeout exceeded when trying to connect to postgres")),
    true,
  );
  assert.equal(isTransientDatabaseError(new Error("duplicate key value violates unique constraint")), false);
});

test("retries a transient database failure with bounded attempts", async () => {
  let attempts = 0;
  const result = await runBackgroundJob(
    "test-transient-retry",
    async () => {
      attempts++;
      if (attempts < 3) {
        throw Object.assign(new Error("connection terminated unexpectedly"), { code: "08006" });
      }
      return "completed";
    },
    { initialBackoffMs: 0, maxBackoffMs: 0 },
  );

  assert.equal(result, "completed");
  assert.equal(attempts, 3);
});

test("does not retry non-transient failures", async () => {
  let attempts = 0;
  await assert.rejects(
    runBackgroundJob(
      "test-permanent-failure",
      async () => {
        attempts++;
        throw new Error("invalid input");
      },
      { initialBackoffMs: 0, maxBackoffMs: 0 },
    ),
    /invalid input/,
  );
  assert.equal(attempts, 1);
});

test("skips an overlapping pass for the same job", async () => {
  let releaseFirst!: () => void;
  const firstPass = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = runBackgroundJob("test-overlap", () => firstPass);
  await new Promise((resolve) => setImmediate(resolve));

  const overlapping = await runBackgroundJob("test-overlap", async () => "should-not-run");
  // A skip is an EXPLICIT sentinel, not `undefined` (lane: internal-jobs-hardening, L4): callers
  // could not otherwise tell a skip from a job body that resolved void.
  assert.ok(isBackgroundJobSkip(overlapping), "an overlapping pass must resolve the skip sentinel");
  assert.equal((overlapping as any).reason, "overlap");
  assert.deepEqual(getBackgroundJobStats().running, ["test-overlap"]);

  releaseFirst();
  await first;
  assert.equal(getBackgroundJobStats().activeJobs, 0);
});