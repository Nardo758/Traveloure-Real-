/**
 * The ONE cancellation schedule (shared/cancellation-schedule.ts) — Lane B, Sep 27, 2026.
 *
 * C1 pins every boundary the refund math turns on; C2 pins that the labels and article-7 lines are
 * GENERATED from the same table (so a window edited there moves every reader); C3 pins that the
 * server's `refundPercentFor` delegates here and re-states no threshold of its own, and that the
 * three client/label copies read this module instead of typing the windows.
 *
 * Run: npx tsx --test shared/__tests__/cancellation-schedule.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CANCELLATION_POLICY_TYPES,
  CANCELLATION_SCHEDULE,
  CANCELLATION_TIER_LABELS,
  cancellationTierSchedule,
  cancellationTierFilterLabel,
  scheduleRefundPercent,
} from "../cancellation-schedule";
import { CANCELLATION_POLICY_TYPE_LABELS, cancellationPolicyTypeEnum } from "../schema";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("C1 boundaries: exactly at a window refunds that window's percent; a hair inside drops a step", () => {
  const cases: Array<[typeof CANCELLATION_POLICY_TYPES[number], number | null, number]> = [
    ["flexible", 24, 100], ["flexible", 23.99, 0], ["flexible", null, 100],
    ["moderate", 120, 100], ["moderate", 119.99, 50], ["moderate", 48, 50], ["moderate", 47.99, 0], ["moderate", null, 100],
    ["strict", 168, 50], ["strict", 167.99, 0], ["strict", null, 50],
    ["non_refundable", 10_000, 0], ["non_refundable", null, 0],
  ];
  for (const [policy, hours, percent] of cases) {
    assert.equal(scheduleRefundPercent(policy, hours), percent, `${policy} @ ${hours}h`);
  }
});

test("C2 labels and article-7 lines are generated from the schedule", () => {
  assert.deepEqual([...cancellationPolicyTypeEnum], [...CANCELLATION_POLICY_TYPES]);
  assert.deepEqual(CANCELLATION_POLICY_TYPE_LABELS, CANCELLATION_TIER_LABELS);
  assert.equal(cancellationTierSchedule("flexible"), "100% at least 24 hours before; 0% after.");
  assert.equal(
    cancellationTierSchedule("moderate"),
    "100% at least 5 days before; 50% from 48 hours to 5 days before; 0% inside 48 hours.",
  );
  assert.equal(cancellationTierSchedule("strict"), "50% at least 7 days before; 0% after.");
  assert.equal(cancellationTierSchedule("non_refundable"), "no automatic refund; contact support about an exception.");
  // Every step the sentence states is a step the math applies.
  for (const p of CANCELLATION_POLICY_TYPES) {
    for (const step of CANCELLATION_SCHEDULE[p].steps) {
      assert.ok(cancellationTierSchedule(p).includes(`${step.percent}%`), `${p} sentence names ${step.percent}%`);
      assert.equal(scheduleRefundPercent(p, step.minHoursBefore), step.percent);
    }
  }
});

test("C3 the server delegates and every former copy reads the module", () => {
  const server = read("server/services/cancellation-policy.service.ts");
  assert.match(server, /from '@shared\/cancellation-schedule'/);
  const fn = server.slice(server.indexOf("export function refundPercentFor("), server.indexOf("function describeOutcome("));
  assert.match(fn, /return scheduleRefundPercent\(policy, hoursUntilStart\);/);
  assert.doesNotMatch(fn, /\b(24|48|120|168)\b/, "refundPercentFor must not restate a window");

  for (const rel of [
    "client/src/lib/pricing-fees.ts",
    "client/src/pages/service-detail.tsx",
    "client/src/pages/provider/workstation.tsx",
    "shared/schema.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /cancellation-schedule/, `${rel} reads shared/cancellation-schedule`);
    assert.doesNotMatch(src, /full refund if cancelled at least 24 hours|refund 5\+ days/, `${rel} types no window`);
  }
});

// C4 — ledger `2026-09-27-cancel-filter-labels`: the seed's filter chips are generated from this
// table. "Strict (No Refund)" named a refund the schedule does not withhold (strict pays 50% at
// least 7 days out) and "Moderate (50% Refund)" hid moderate's full-refund window.
test("C4 filter chip labels come from the schedule and claim only what it pays", () => {
  assert.equal(cancellationTierFilterLabel("flexible"), "Flexible (full refund at least 24 hours before)");
  assert.equal(cancellationTierFilterLabel("moderate"), "Moderate (full refund at least 5 days before)");
  assert.equal(cancellationTierFilterLabel("strict"), "Strict (50% refund at least 7 days before)");
  assert.equal(cancellationTierFilterLabel("non_refundable"), "Non-refundable (no refund once booked)");
  const seed = read("server/seeds/experience-template-tabs.seed.ts");
  assert.match(seed, /cancellationTierFilterLabel/, "the seed generates its chips from the schedule");
  const blocks = seed.split('slug: "cancellation"').slice(1).map((b) => b.slice(0, b.indexOf("]")));
  assert.equal(blocks.length, 2, "both cancellation filters are checked");
  for (const b of blocks) {
    assert.match(b, /CANCELLATION_FILTER_OPTIONS/, "the chips are the generated options");
    assert.doesNotMatch(b, /label:/, "no cancellation chip label is typed in the seed");
  }
});
