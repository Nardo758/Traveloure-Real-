/**
 * R323 (step 7b) — the handoff's pure rules and words (`@shared/handoff`, `@/lib/handoff-client`).
 *   P1 withdrawal stages and what is kept (R-t): nothing before accept; a missing band keeps nothing
 *   P2 deliver is refused while a suggestion is open, and while a booking scope has unbooked stops
 *   P3 two rounds of changes are included (R-s)
 *   P4 the banner's lines — the wait is said only when measured (§13); "Included" for a prepaid ask
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HANDOFF_FEE_TIER,
  changeRoundAllowed,
  deliverRefusal,
  findingLine,
  handoffBannerState,
  withdrawalKeptCents,
  withdrawalStage,
} from "../../../../shared/handoff";
import { handoffBannerLine, money, withdrawLine } from "../handoff-client";
import { FEEDBACK_CODES, isFeedbackPair } from "../../../../shared/feedback";

test("P1 withdrawal stages and the kept share", () => {
  assert.equal(withdrawalStage("authorizing"), "before_accept");
  assert.equal(withdrawalStage("proposed"), "before_accept");
  assert.equal(withdrawalStage("accepted"), "after_accept");
  assert.equal(withdrawalStage("delivered"), "after_delivery");
  assert.equal(withdrawalStage("approved"), null);
  assert.equal(withdrawalKeptCents(10000, 0.25), 2500);
  assert.equal(withdrawalKeptCents(10000, null), 0, "a missing band keeps nothing");
  assert.equal(withdrawalKeptCents(10000, 2), 10000, "never more than the fee");
  assert.equal(withdrawalKeptCents(0, 0.5), 0);
  assert.deepEqual(HANDOFF_FEE_TIER, { polish: "review", book: "review_and_book", plan_all: "full_concierge" });
});

test("P2 deliver refusals", () => {
  assert.equal(deliverRefusal({ status: "proposed", kind: "polish", openSuggestions: 0, unbookedInScope: 0 }), "not_accepted");
  assert.equal(deliverRefusal({ status: "accepted", kind: "polish", openSuggestions: 1, unbookedInScope: 0 }), "open_suggestions");
  assert.equal(deliverRefusal({ status: "accepted", kind: "book", openSuggestions: 0, unbookedInScope: 2 }), "unbooked_items");
  assert.equal(deliverRefusal({ status: "accepted", kind: "polish", openSuggestions: 0, unbookedInScope: 2 }), null, "polish books nothing");
});

test("P3 two included rounds", () => {
  assert.equal(changeRoundAllowed(null), true);
  assert.equal(changeRoundAllowed(1), true);
  assert.equal(changeRoundAllowed(2), false);
});

test("P4 banner words", () => {
  assert.equal(findingLine("Kyoto", null), "Finding your Kyoto local");
  assert.equal(findingLine("Kyoto", 3), "Finding your Kyoto local · usually within 3 hours");
  assert.equal(findingLine(null, 1), "Finding your local · usually within 1 hour");
  assert.deepEqual(handoffBannerState({ status: "proposed", fallbackOfferedAt: null, city: "Kyoto" }), { kind: "finding", city: "Kyoto" });
  assert.deepEqual(handoffBannerState({ status: "unmatched", fallbackOfferedAt: "2026-10-05" }), { kind: "fallback_offered" });
  assert.equal(handoffBannerState({ status: "approved" }), null);
  const line = handoffBannerLine({ banner: { kind: "released" }, city: null, typicalAcceptHours: null, handoff: null });
  assert.match(line ?? "", /released the hold/);
  assert.equal(money(0), "Included");
  assert.equal(money(4999), "$49.99");
  assert.match(withdrawLine({ status: "proposed" } as any) ?? "", /nothing is charged/);
  assert.match(withdrawLine({ status: "accepted" } as any) ?? "", /part of the fee is kept/);
  assert.equal(withdrawLine({ status: "approved" } as any), null);
  assert.deepEqual(FEEDBACK_CODES.post_handoff, ["helped", "some", "no"]);
  assert.ok(isFeedbackPair("post_handoff", "helped"));
});
