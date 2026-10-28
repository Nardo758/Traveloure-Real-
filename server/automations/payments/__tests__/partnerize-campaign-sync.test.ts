/**
 * Row 275 — node `payments.partnerize-campaign-sync`. No database.
 * Does not call syncCampaigns and does not start a timer. Independent of the report-poll test.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isScheduledAutomationSkip } from "../../scheduler-wrapper";
import { paymentAutomationRegistry } from "..";
import { runPaymentSchedule } from "../runtime";

const SCHEDULER_PATH = path.resolve(import.meta.dirname, "../../../services/cache-scheduler.service.ts");

function credentialBlock(source: string): string {
  const start = source.indexOf("if (getPartnerizeCredentials())");
  assert.ok(start >= 0, "Partnerize scheduling is still inside getPartnerizeCredentials()");
  const end = source.indexOf("[CacheScheduler] Partnerize disabled", start);
  assert.ok(end > start, "the credential if still has its disabled else");
  return source.slice(start, end);
}

test("C1 — the registry holds the Partnerize campaign sync on its schedule id", () => {
  const node = paymentAutomationRegistry.byId.get("payments.partnerize-campaign-sync");
  assert.ok(node, "registry holds payments.partnerize-campaign-sync");
  assert.equal(node.trigger.kind, "cron");
  assert.equal(node.trigger.kind === "cron" ? node.trigger.scheduleId : "", "partnerize-campaign-sync");
});

test("C2 — without the credential context the node is skipped and the action is not called", async () => {
  let calls = 0;
  const result = await runPaymentSchedule(
    "payments.partnerize-campaign-sync",
    "partnerize-campaign-sync",
    async () => {
      calls += 1;
      return "synced";
    },
    { useBackgroundJobRunner: false },
  );
  assert.equal(isScheduledAutomationSkip(result), true);
  assert.equal((result as { reason?: string }).reason, "condition");
  assert.equal(calls, 0);
});

test("C3 — with credentialsConfigured the action runs once and its result is returned", async () => {
  let calls = 0;
  const result = await runPaymentSchedule(
    "payments.partnerize-campaign-sync",
    "partnerize-campaign-sync",
    async () => {
      calls += 1;
      return "synced";
    },
    { useBackgroundJobRunner: false, context: { credentialsConfigured: true } },
  );
  assert.equal(isScheduledAutomationSkip(result), false);
  assert.equal(result, "synced");
  assert.equal(calls, 1);
});

test("C4 — both campaign-sync schedules sit inside the credential block", () => {
  const source = fs.readFileSync(SCHEDULER_PATH, "utf8");
  const block = credentialBlock(source);
  const marker = 'runPaymentSchedule(\n          "payments.partnerize-campaign-sync"';
  const inBlock = block.split(marker).length - 1;
  assert.equal(inBlock, 2, "the initial timer and the interval are both inside the credential if");
  assert.equal(source.split(marker).length - 1, 2, "there is no campaign-sync schedule outside that block");

  const calls = [...block.matchAll(/runPaymentSchedule\(\s*"payments\.partnerize-campaign-sync"[\s\S]*?\)\.catch/g)];
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call[0], /partnerizeSyncService\.syncCampaigns\(\)/);
    assert.match(call[0], /credentialsConfigured:\s*true/);
  }
});
