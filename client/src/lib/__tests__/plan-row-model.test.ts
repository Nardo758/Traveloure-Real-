import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanRowModel,
  nextActionFromCounts,
  planRowSection,
  routingCountsFromPlancard,
} from "../plan-row-model";

/**
 * L3 my-plans-rows (Console & AI Concierge brief; ledger `2026-09-07-my-plans-rows`).
 * Pure pins for the My plans row model — no DOM, no DB, no network.
 *
 * Run: npx tsx --test client/src/lib/__tests__/plan-row-model.test.ts
 */

const NOW = new Date(2026, 8, 7, 12, 0, 0); // Sep 7 2026, local noon — never a midnight boundary

// ── planRowSection ─────────────────────────────────────────────────────────────

test("a plan you are ON is Traveling now — even when finalized (dates win over paperwork)", () => {
  assert.equal(
    planRowSection({ startDate: "2026-09-05", endDate: "2026-09-10", finalVersion: 2 }, NOW),
    "traveling",
  );
  assert.equal(
    planRowSection({ startDate: "2026-09-05", endDate: "2026-09-10" }, NOW),
    "traveling",
  );
});

test("a finalized upcoming plan is Final; a non-final upcoming plan is In planning", () => {
  assert.equal(
    planRowSection({ startDate: "2026-10-01", endDate: "2026-10-05", finalVersion: 1 }, NOW),
    "final",
  );
  assert.equal(
    planRowSection({ startDate: "2026-10-01", endDate: "2026-10-05" }, NOW),
    "planning",
  );
});

test("a plan behind you is Past — even when finalized", () => {
  assert.equal(
    planRowSection({ startDate: "2026-08-01", endDate: "2026-08-05", finalVersion: 3 }, NOW),
    "past",
  );
  assert.equal(
    planRowSection({ startDate: "2026-08-01", endDate: "2026-08-05" }, NOW),
    "past",
  );
});

test("an undated, non-final plan is In planning — unscheduled, never vanished and never '1970-past'", () => {
  // The old page handed null dates to `new Date(null)` (EPOCH 1970) and sorted undated plans
  // into Past, rendering "Jan 1, 1970" on the row. §13: absent reads as absent — the row shows
  // no date line — and the plan itself still appears, in the one section that is TRUE of it.
  assert.equal(planRowSection({}, NOW), "planning");
  assert.equal(planRowSection({ startDate: null, endDate: null }, NOW), "planning");
  assert.equal(planRowSection({ startDate: "not-a-date", endDate: "2026-10-05" }, NOW), "planning");
});

test("an undated FINAL plan still lands in Final (the one fact the row holds)", () => {
  assert.equal(planRowSection({ finalVersion: 1 }, NOW), "final");
});

test("boundary days: the START date is Traveling now; the END date reads Past from its first minute", () => {
  // The end date is a DATE column — local midnight — so under the pre-existing my-trips bucketing
  // (which this lane preserves, not re-rules) `end < now` flips a plan to Past at 00:00 on its
  // last day. Pinned so the convention is stated, not silently inherited.
  assert.equal(planRowSection({ startDate: "2026-09-07", endDate: "2026-09-09" }, NOW), "traveling");
  assert.equal(planRowSection({ startDate: "2026-09-05", endDate: "2026-09-07" }, NOW), "past");
});

// ── routingCountsFromPlancard ──────────────────────────────────────────────────

test("counts come only from real items: booking ⇒ purchased, explicit purchased ⇒ purchased, routed by status", () => {
  const counts = routingCountsFromPlancard({
    days: [
      {
        activities: [
          { routingStatus: "in_planning" },
          { routingStatus: "in_planning" },
          { routingStatus: "with_expert" },
          { routingStatus: "ready_for_checkout" },
          { routingStatus: "purchased" },
          { booking: { id: "b1" } }, // a booking even without a routing status
          { routingStatus: null },
          {},
        ],
      },
      { activities: [{ routingStatus: "with_expert" }] },
    ],
  });
  assert.deepEqual(counts, { in_planning: 2, with_expert: 2, ready_for_checkout: 1, purchased: 2 });
});

test("no days, empty days, or null data ⇒ all zeros (the strip then renders nothing)", () => {
  const zero = { in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 0 };
  assert.deepEqual(routingCountsFromPlancard(null), zero);
  assert.deepEqual(routingCountsFromPlancard({}), zero);
  assert.deepEqual(routingCountsFromPlancard({ days: [{ activities: null }, {}] }), zero);
});

test("an unknown routing status counts as NOTHING — never rebucketed into a nearer-looking stage", () => {
  const counts = routingCountsFromPlancard({
    days: [{ activities: [{ routingStatus: "archived" }, { routingStatus: "draft" }] }],
  });
  assert.deepEqual(counts, { in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 0 });
});

// ── nextActionFromCounts ───────────────────────────────────────────────────────

test("the next action is the most-advanced actionable stage: checkout beats expert beats planning", () => {
  assert.deepEqual(
    nextActionFromCounts({ in_planning: 3, with_expert: 2, ready_for_checkout: 1, purchased: 9 }),
    { status: "ready_for_checkout", n: 1 },
  );
  assert.deepEqual(
    nextActionFromCounts({ in_planning: 3, with_expert: 2, ready_for_checkout: 0, purchased: 0 }),
    { status: "with_expert", n: 2 },
  );
  assert.deepEqual(
    nextActionFromCounts({ in_planning: 3, with_expert: 0, ready_for_checkout: 0, purchased: 0 }),
    { status: "in_planning", n: 3 },
  );
});

test("purchased items are done: all-purchased or empty ⇒ NO next action", () => {
  assert.equal(
    nextActionFromCounts({ in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 4 }),
    null,
  );
  assert.equal(
    nextActionFromCounts({ in_planning: 0, with_expert: 0, ready_for_checkout: 0, purchased: 0 }),
    null,
  );
});

// ── buildPlanRowModel ──────────────────────────────────────────────────────────

test("Message is gated on a REAL advisor row; pending is spelled out, never implied", () => {
  const trip = { id: "t1", startDate: "2026-10-01", endDate: "2026-10-05" };
  const plancard = { days: [{ activities: [{ routingStatus: "ready_for_checkout" }] }] };

  const none = buildPlanRowModel(trip, plancard, null, NOW);
  assert.equal(none.hasAdvisor, false);
  assert.equal(none.advisorName, null);
  assert.equal(none.advisorPending, false);

  const requested = buildPlanRowModel(trip, plancard, { status: "pending", first_name: "Aya", last_name: null }, NOW);
  assert.equal(requested.hasAdvisor, true);
  assert.equal(requested.advisorPending, true);
  assert.equal(requested.advisorName, "Aya");

  const active = buildPlanRowModel(trip, plancard, { status: "accepted", first_name: "Kenji", last_name: "Sato" }, NOW);
  assert.equal(active.hasAdvisor, true);
  assert.equal(active.advisorPending, false);
  assert.equal(active.advisorName, "Kenji Sato");
});

test("the primary action lands on the Trip Card post-final and on the slip pre-final", () => {
  const plancard = { days: [] };
  assert.equal(
    buildPlanRowModel({ id: "t1", finalVersion: 2 }, plancard, null, NOW).primaryHref,
    "/trip/t1",
  );
  assert.equal(
    buildPlanRowModel({ id: "t1" }, plancard, null, NOW).primaryHref,
    "/plans/t1",
  );
});

test("the composed model: section + counts + next action agree on one fixture", () => {
  const model = buildPlanRowModel(
    { id: "t9", startDate: "2026-12-20", endDate: "2026-12-28" },
    { days: [{ activities: [{ routingStatus: "in_planning" }, { booking: { id: "b" } }] }] },
    null,
    NOW,
  );
  assert.equal(model.section, "planning");
  assert.deepEqual(model.counts, { in_planning: 1, with_expert: 0, ready_for_checkout: 0, purchased: 1 });
  assert.deepEqual(model.nextAction, { status: "in_planning", n: 1 });
  assert.equal(model.hasFinal, false);
});
