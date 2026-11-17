/**
 * LANE A (brief 0) ? the plain accept needs a PAID BASIS, keyed on the (trip, expert) pair.
 *
 * These are the pure halves of the rule: which handoff statuses count, and what the refusal is. The SQL that
 * loads the basis is exercised by the DB lane; the predicate here is what the route calls, so a status that
 * should never count cannot creep back in without this file going red.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADVISOR_UNPAID_REFUSAL,
  HANDOFF_WRITE_STATUSES,
  advisorAcceptRefusal,
  handoffBasisFromStatus,
} from "../../services/advisor-accept-basis.service";

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
  it("R1: no basis ? the named 409", () => {
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
