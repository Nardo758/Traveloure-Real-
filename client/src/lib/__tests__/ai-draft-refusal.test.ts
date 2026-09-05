/**
 * THE CLIENT SIDE OF THE FREE-DRAFT REFUSAL — one reader, and it never re-implements the gate.
 *
 * CLAUDE.md Locked Decision 41 (b) / ledger `2026-09-05-draft-only-on-empty`.
 *
 * The server answers a free draft on a non-empty slip with 409 `slip_has_items`. Four draft
 * surfaces read that answer, and they read it through ONE module — the sibling of
 * `isTripEmptyRefusal` in `optimization-gate.ts`, and for the same reason (§18 rule 1).
 *
 * Pure — no DOM, no network. Run: npx tsx --test client/src/lib/__tests__/ai-draft-refusal.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSlipHasItemsRefusal, readSlipHasItemsRefusal, slipHref } from "../ai-draft-refusal";

const BODY = {
  error: "slip_has_items",
  message: "This plan already has items in it, so the free AI draft won't rebuild it.",
  optimize: true,
  itemCount: 6,
  tripId: "trip-abc",
};

describe("LD 41 (b) — the client reads the refusal through one module", () => {
  it("C1 a 409 slip_has_items is recognised", () => {
    assert.equal(isSlipHasItemsRefusal(409, BODY), true);
  });

  it("C2 another 409 is NOT this refusal — the optimizer's own pre-flight must pass through", () => {
    assert.equal(isSlipHasItemsRefusal(409, { error: "trip_empty_convert_cart" }), false);
  });

  it("C3 the same code on a different status is not a refusal", () => {
    assert.equal(isSlipHasItemsRefusal(500, BODY), false);
    assert.equal(isSlipHasItemsRefusal(400, BODY), false);
  });

  it("C4 a non-refusal reads as null so the caller keeps its own error path", () => {
    assert.equal(readSlipHasItemsRefusal(500, { message: "boom" }), null);
    assert.equal(readSlipHasItemsRefusal(409, null), null);
    assert.equal(readSlipHasItemsRefusal(409, "not an object"), null);
  });

  it("C5 the refusal carries the SERVER'S sentence verbatim — the client never paraphrases", () => {
    const r = readSlipHasItemsRefusal(409, BODY)!;
    assert.equal(r.message, BODY.message);
    assert.equal(r.itemCount, 6);
    assert.equal(r.tripId, "trip-abc");
  });

  it("C6 a refusal with no trip named gets NO link, never a guessed one (§13)", () => {
    const r = readSlipHasItemsRefusal(409, { ...BODY, tripId: undefined })!;
    assert.equal(r.tripId, null);
    assert.equal(slipHref(r), null);
  });

  it("C7 the link goes to the slip, which owns the ONE Optimize gate", () => {
    const r = readSlipHasItemsRefusal(409, BODY)!;
    assert.equal(slipHref(r), "/plans/trip-abc");
  });

  it("C8 a missing itemCount degrades to 0 rather than rendering NaN", () => {
    const r = readSlipHasItemsRefusal(409, { error: "slip_has_items", tripId: "t" })!;
    assert.equal(r.itemCount, 0);
    assert.equal(typeof r.message, "string");
    assert.ok(r.message.length > 0);
  });
});
