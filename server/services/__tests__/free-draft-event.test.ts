/**
 * E6 — `slip_free_draft_run` event data (ledger `2026-09-28-kyoto-s4-draft-ci`; slip-funnel-events.md §3.6).
 *   D1  drafted carries outcome + itemsWritten, and nothing else
 *   D2  refused_not_empty / provider_failed carry the outcome only (no count, no model claim)
 *   D3  the event name and stage are the doc's
 *   D4  A5: draftBasis and heldSlots ride a drafted run only when known; the ask is its own outcome
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FREE_DRAFT_RUN_EVENT, SLIP_FUNNEL_STAGE, freeDraftRunEventData } from "../free-draft-event";

test("D1: a drafted run records the rows it wrote", () => {
  assert.deepEqual(freeDraftRunEventData({ outcome: "drafted", itemsWritten: 3 }), { outcome: "drafted", itemsWritten: 3 });
});

test("D2: a refused or failed run records only its outcome", () => {
  assert.deepEqual(freeDraftRunEventData({ outcome: "refused_not_empty" }), { outcome: "refused_not_empty" });
  assert.deepEqual(freeDraftRunEventData({ outcome: "provider_failed" }), { outcome: "provider_failed" });
});

test("D3: event name and stage are the design doc's", () => {
  assert.equal(FREE_DRAFT_RUN_EVENT, "slip_free_draft_run");
  assert.equal(SLIP_FUNNEL_STAGE, "SLIP");
  assert.ok(SLIP_FUNNEL_STAGE.length <= 4, "funnel_events.stage is varchar(4)");
});

test("D4: A5 — basis and held slots when known, omitted when not; the ask is an outcome", () => {
  assert.deepEqual(freeDraftRunEventData({ outcome: "drafted", itemsWritten: 9, draftBasis: "open_anchor_set", heldSlots: 1 }), {
    outcome: "drafted",
    itemsWritten: 9,
    draftBasis: "open_anchor_set",
    heldSlots: 1,
  });
  assert.deepEqual(freeDraftRunEventData({ outcome: "drafted", itemsWritten: 2, draftBasis: null, heldSlots: 0 }), {
    outcome: "drafted",
    itemsWritten: 2,
    heldSlots: 0,
  });
  assert.deepEqual(freeDraftRunEventData({ outcome: "anchor_asked" }), { outcome: "anchor_asked" });
});
