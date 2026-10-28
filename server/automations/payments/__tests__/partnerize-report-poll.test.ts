/**
 * Row 273 — node `payments.partnerize-report-poll`. No database. The action is a stub.
 * Credential values in this file are the dummy "x", never a deployment key.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { afterEach } from "node:test";
import { isScheduledAutomationSkip } from "../../scheduler-wrapper";
import { paymentAutomationRegistry } from "..";
import { runPaymentSchedule } from "../runtime";
import { getPartnerizeCredentials } from "../../../services/partnerize/partnerize-client";

const CREDENTIAL_KEYS = [
  "PARTNERIZE_APPLICATION_KEY",
  "PARTNERIZE_API_KEY",
  "PARTNERIZE_PUBLISHER_ID",
] as const;

const savedCredentials = Object.fromEntries(CREDENTIAL_KEYS.map((key) => [key, process.env[key]]));

function restoreCredentials(): void {
  for (const key of CREDENTIAL_KEYS) {
    const previous = savedCredentials[key];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

afterEach(() => {
  restoreCredentials();
});

function setCredentials(value: string): void {
  for (const key of CREDENTIAL_KEYS) process.env[key] = value;
}

function credentialBlock(source: string): string {
  const start = source.indexOf("if (getPartnerizeCredentials())");
  assert.ok(start >= 0, "the scheduler still gates Partnerize on getPartnerizeCredentials()");
  const end = source.indexOf("[CacheScheduler] Partnerize disabled", start);
  assert.ok(end > start, "the credential if still has its disabled else");
  return source.slice(start, end);
}

test("P1 — the registry holds the Partnerize report poll on its schedule id", () => {
  const node = paymentAutomationRegistry.byId.get("payments.partnerize-report-poll");
  assert.ok(node, "registry holds payments.partnerize-report-poll");
  assert.equal(node.trigger.kind, "cron");
  assert.equal(node.trigger.kind === "cron" ? node.trigger.scheduleId : "", "partnerize-report-poll");
});

test("P2 — without the credential context the node is skipped and the action is not called", async () => {
  let calls = 0;
  const result = await runPaymentSchedule(
    "payments.partnerize-report-poll",
    "partnerize-report-poll",
    async () => {
      calls += 1;
      return "polled";
    },
    { useBackgroundJobRunner: false },
  );
  assert.equal(isScheduledAutomationSkip(result), true);
  assert.equal((result as { reason?: string }).reason, "condition");
  assert.equal(calls, 0);
});

test("P3 — with credentialsConfigured the action runs once and its result is returned", async () => {
  let calls = 0;
  const result = await runPaymentSchedule(
    "payments.partnerize-report-poll",
    "partnerize-report-poll",
    async () => {
      calls += 1;
      return "polled";
    },
    { useBackgroundJobRunner: false, context: { credentialsConfigured: true } },
  );
  assert.equal(isScheduledAutomationSkip(result), false);
  assert.equal(result, "polled");
  assert.equal(calls, 1);
});

test("P4 — credentials are all-or-nothing, and every Partnerize schedule sits inside that gate", () => {
  for (const key of CREDENTIAL_KEYS) {
    setCredentials("x");
    delete process.env[key];
    assert.equal(getPartnerizeCredentials(), null, `${key} unset`);

    setCredentials("x");
    process.env[key] = "";
    assert.equal(getPartnerizeCredentials(), null, `${key} empty`);
  }

  setCredentials("x");
  assert.deepEqual(getPartnerizeCredentials(), {
    applicationKey: "x",
    apiKey: "x",
    publisherId: "x",
  });

  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, "../../../services/cache-scheduler.service.ts"),
    "utf8",
  );
  const block = credentialBlock(source);
  assert.match(block, /"payments\.partnerize-report-poll"/);
  assert.match(block, /"payments\.partnerize-campaign-sync"/);
  assert.match(block, /credentialsConfigured:\s*true/);

  const calls = [...source.matchAll(/runPaymentSchedule\(\s*\n?\s*"payments\.partnerize-/g)];
  assert.equal(calls.length, 4, "two campaign-sync calls and two report-poll calls");
  const blockStart = source.indexOf(block);
  for (const call of calls) {
    assert.ok(call.index !== undefined && call.index >= blockStart && call.index < blockStart + block.length);
  }
  assert.equal((block.match(/"payments\.partnerize-report-poll"/g) ?? []).length, 2);
});

test("P5 — the poll makes one matching call and swallows a rejection", async () => {
  const { cacheSchedulerService } = await import("../../../services/cache-scheduler.service");
  const { affiliateReconciliationService, LATE_REPORT_TOLERANCE_DAYS } = await import(
    "../../../services/affiliate-reconciliation.service"
  );
  const service = affiliateReconciliationService as unknown as {
    matchRecords: (...args: unknown[]) => Promise<unknown>;
  };
  const original = service.matchRecords;
  const calls: unknown[][] = [];
  try {
    service.matchRecords = async (...args: unknown[]) => {
      calls.push(args);
      return undefined;
    };
    await (cacheSchedulerService as unknown as { pollPartnerizeReports: () => Promise<void> }).pollPartnerizeReports();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ["last_35_days", "partnerize", { dateToleranceDays: LATE_REPORT_TOLERANCE_DAYS }]);

    service.matchRecords = async () => {
      throw new Error("partner report down");
    };
    await (cacheSchedulerService as unknown as { pollPartnerizeReports: () => Promise<void> }).pollPartnerizeReports();
  } finally {
    service.matchRecords = original;
  }
});
