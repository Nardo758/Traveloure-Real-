/**
 * LANE A (brief 0) — the plain accept needs a PAID BASIS, keyed on the (trip, expert) pair.
 *
 * These are the pure halves of the rule: which handoff statuses count, and what the refusal is. The SQL that
 * loads the basis is exercised by the DB lane; the predicate here is what the route calls, so a status that
 * should never count cannot creep back in without this file going red.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADVISOR_FINISHED_REFUSAL,
  ADVISOR_UNPAID_REFUSAL,
  HANDOFF_WRITE_STATUSES,
  PAID_REQUEST_OPEN_STATUSES,
  advisorAcceptRefusal,
  handoffBasisFromStatus,
  paidRequestIsOpen,
  stripClientPaymentIntent,
} from "../../services/advisor-accept-basis.pure";

describe("which handoff statuses are a paid basis", () => {
  it("B1: captured + accepted, or captured + delivered", () => {
    assert.equal(handoffBasisFromStatus("accepted", true), "accepted");
    assert.equal(handoffBasisFromStatus("delivered", true), "delivered");
  });

  it("B2: nothing else ? a hold is not money and an approved handoff has returned the pen", () => {
    for (const status of ["proposed", "authorized", "approved", "withdrawn", "released", "unmatched", "declined", ""]) {
      assert.equal(handoffBasisFromStatus(status, true), null, `status ${status} must not be a basis`);
    }
    assert.equal(handoffBasisFromStatus(null, true), null);
  });

  it("B3: an uncaptured handoff is never a basis, whatever its status says", () => {
    assert.equal(handoffBasisFromStatus("accepted", false), null);
    assert.equal(handoffBasisFromStatus("delivered", false), null);
  });

  it("B4: the two admitted statuses, stated once", () => {
    assert.deepEqual([...HANDOFF_WRITE_STATUSES], ["accepted", "delivered"]);
  });
});

describe("the refusal the route returns", () => {
  it("R1: no basis — the named 409", () => {
    assert.equal(advisorAcceptRefusal(null), "advisor_unpaid");
    assert.equal(advisorAcceptRefusal(undefined), "advisor_unpaid");
    assert.equal(ADVISOR_UNPAID_REFUSAL.status, 409);
    assert.equal(ADVISOR_UNPAID_REFUSAL.code, "advisor_unpaid");
    assert.ok(ADVISOR_UNPAID_REFUSAL.message.length > 0, "the message Leon must approve is present");
  });

  it("R2: either basis ? no refusal", () => {
    assert.equal(advisorAcceptRefusal({ kind: "handoff", requestId: "r1", handoffStatus: "accepted" }), null);
    assert.equal(advisorAcceptRefusal({ kind: "paid_request", requestId: "r2" }), null);
  });

  it("R3: re-accept after approval is refused at the predicate ? approved is not a basis", () => {
    // The handoff that was accepted, delivered and approved reads `approved`, so the lookup finds no basis.
    assert.equal(advisorAcceptRefusal(handoffBasisFromStatus("approved", true)), "advisor_unpaid");
  });
});

describe("a paid request must be OPEN, not merely paid (addendum 5)", () => {
  it("O1: the finish marker is `completed`, and it is not an open status", () => {
    // completeExpertRequest sets status='completed' on delivery (booking-actions.service.ts:65-70), before the
    // traveler can approve. A no-handoff approval therefore cannot revive a completed request.
    assert.equal(paidRequestIsOpen("completed"), false);
    assert.equal(paidRequestIsOpen("assigned"), true);
    assert.equal(paidRequestIsOpen("in_progress"), true);
  });

  it("O2: nothing else counts as open either", () => {
    for (const status of ["approved", "cancelled", "delivered", "unassigned", "refunded", "", null]) {
      assert.equal(paidRequestIsOpen(status as any), false, `status ${status} must not be open`);
    }
    assert.deepEqual([...PAID_REQUEST_OPEN_STATUSES], ["assigned", "in_progress"]);
  });
});

describe("addendum 2 — a forged PaymentIntent cannot be a basis", () => {
  it("F1: the client's key is stripped before the request is written", () => {
    const stripped = stripClientPaymentIntent({
      paymentIntentId: "pi_forged_by_the_client",
      planSnapshot: { travelers: 2 },
    }) as any;
    assert.equal("paymentIntentId" in stripped, false, "the unverified key must not survive");
    assert.deepEqual(stripped.planSnapshot, { travelers: 2 }, "the ask fields are untouched");
  });

  it("F2: a context without the key is returned as it was, and null passes through", () => {
    const ctx = { planSnapshot: { travelers: 4 } };
    assert.equal(stripClientPaymentIntent(ctx), ctx);
    assert.equal(stripClientPaymentIntent(null), null);
    assert.equal(stripClientPaymentIntent(undefined), undefined);
  });
});

describe("addendum 4 — finished work is not unpaid work", () => {
  it("N1: a finished finding names advisor_finished, not advisor_unpaid", () => {
    assert.equal(advisorAcceptRefusal({ kind: "finished", requestId: "r1" }), "advisor_finished");
    assert.equal(advisorAcceptRefusal(null), "advisor_unpaid");
    assert.equal(ADVISOR_FINISHED_REFUSAL.status, 409);
    assert.equal(ADVISOR_FINISHED_REFUSAL.code, "advisor_finished");
    assert.notEqual(ADVISOR_FINISHED_REFUSAL.message, ADVISOR_UNPAID_REFUSAL.message);
  });
});

describe("the two refusals, character for character", () => {
  // These are the exact sentences Leon must approve. A test on the literal is the only way a reword in code
  // cannot drift from the wording he was shown; changing either means changing this test in the same commit.
  it("W1: the unpaid sentence", () => {
    assert.equal(
      ADVISOR_UNPAID_REFUSAL.message,
      "This plan isn't paid for yet, so you can't accept it. The traveler needs to send a plan request first.",
    );
  });
  it("W2: the finished sentence", () => {
    assert.equal(
      ADVISOR_FINISHED_REFUSAL.message,
      "This work is already finished, so there's nothing to accept. If the traveler wants more help, they can send a new plan request.",
    );
  });
});
