/**
 * BOOKING LIFECYCLE — the acceptance and declared-completion read-outs, per state and per audience.
 *
 * Ledger `2026-09-17-surfaces-acceptance-completion`; CLAUDE.md Locked Decision 46 (accept, revise,
 * the D-27 ask/escalate timer, the admin's artifact refund) and Locked Decision 47 (declare, window,
 * "completed" at its close).
 *
 * What these hold:
 *   L1  AUDIENCE. Only the booking's OWNER gets the acceptance and window read-outs, and only its
 *       SELLER gets the completion one. A seller, a stranger and an owner looking at the seller view
 *       each get `null` — render nothing, not an empty card (LD 42 D16).
 *   L2  NO ACCEPTANCE AFFORDANCE ⇒ NOTHING. A booking whose listing takes no acceptance carries no
 *       `acceptance` key and the view is `null` — never "no artifact", never "not accepted" (§13).
 *   L3  EVERY STATE ROW gets its own stage and its own sentence: delivered, asked, revision
 *       requested, accepted, escalated, awaiting delivery.
 *   L4  THE ESCALATED ROW NEVER SAYS "REFUNDED". D-27 escalates into the admin queue and moves no
 *       money; the copy says it is with our team and names no refund.
 *   L5  NO CLIENT-SIDE WINDOW. `deadline` is whatever the SERVER sent and nothing else; a booking
 *       the server put on no clock says so by its reason and carries no date at all.
 *   L6  THE REVISION AFFORDANCE IS THE LISTING'S LIVE ALLOWANCE. Absent ⇒ no affordance at all,
 *       never "0 left" beside a button that refuses; exhausted ⇒ no button either.
 *   L7  THE CONTROLS READ THE RAILS' OWN FROM-STATE LISTS. Accept is drawn only from
 *       `awaiting_acceptance` on the `gates_completion` arm and only from the paid-equivalent pair
 *       on D-40's `records_only` arm — the same arrays the rails guard on, which is why they are in
 *       `@shared` rather than copied here.
 *   L8  THE DECLARED WINDOW. Present ⇒ the server's own `disputeBy`; the key is omitted once the
 *       booking completes, so no surface counts down a window that is over.
 *   L9  THE SELLER'S CONTROL. Drawn from `COMPLETION_ALLOWED_FROM_STATUSES` alone and never beside
 *       an existing declaration; a completed row says "Completed" and offers nothing.
 *   L10 `daysRemaining` distinguishes NO DEADLINE (null) from NONE LEFT (0) — two different facts,
 *       and a passed deadline never reads as negative time remaining.
 *
 * Pure unit, no DOM and no DB.
 * Run: npx tsx --test client/src/lib/__tests__/booking-lifecycle.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPTANCE_WINDOW_ELAPSED_REASON,
  LIFECYCLE_COPY,
  daysRemaining,
  isAcceptanceEscalation,
  lifecycleStatusReading,
  sellerCompletionView,
  travelerAcceptanceView,
  travelerDeclarationView,
  type LifecycleBooking,
} from "../booking-lifecycle";

const ARTIFACT = (over: Partial<LifecycleBooking> = {}): LifecycleBooking => ({
  id: "bk_1",
  status: "awaiting_acceptance",
  acceptance: {
    mode: "gates_completion",
    deliveredAt: "2026-09-10T09:00:00.000Z",
    hasBookingDeliverable: true,
    acceptanceDeadline: "2026-09-17T09:00:00.000Z",
    revisionsIncluded: 2,
    revisionsUsed: 0,
    revisionsRemaining: 2,
  },
  ...over,
});

describe("booking lifecycle — audience", () => {
  it("L1 only the owner sees the acceptance and window read-outs", () => {
    const b = ARTIFACT({ completionDeclaration: { declaredAt: "2026-09-10T00:00:00.000Z", disputeBy: "2026-09-17T00:00:00.000Z", windowDays: 7 } });
    assert.ok(travelerAcceptanceView(b, "owner"));
    assert.ok(travelerDeclarationView(b, "owner"));
    for (const who of ["seller", "other"] as const) {
      assert.equal(travelerAcceptanceView(b, who), null, `${who} sees no acceptance panel`);
      assert.equal(travelerDeclarationView(b, who), null, `${who} sees no window panel`);
    }
  });

  it("L1 only the seller sees the completion control", () => {
    const b = ARTIFACT({ status: "confirmed" });
    assert.ok(sellerCompletionView(b, "seller"));
    assert.equal(sellerCompletionView(b, "owner"), null);
    assert.equal(sellerCompletionView(b, "other"), null);
  });
});

describe("booking lifecycle — §13 absences", () => {
  it("L2 a listing that takes no acceptance renders nothing at all", () => {
    const plain: LifecycleBooking = { id: "bk_2", status: "confirmed" };
    assert.equal(travelerAcceptanceView(plain, "owner"), null);
    // …and the surface therefore says nothing about artifacts or acceptance for it.
    assert.equal(travelerDeclarationView(plain, "owner"), null);
  });

  it("L5 a booking with no delivery instant is on NO clock and says so", () => {
    const b = ARTIFACT({
      status: "confirmed",
      acceptance: { mode: "gates_completion", hasBookingDeliverable: false, deliveryTimestampMissing: true },
    });
    const v = travelerAcceptanceView(b, "owner")!;
    assert.equal(v.deadline, null, "no date is invented");
    assert.equal(v.noClockReason, LIFECYCLE_COPY.noClock);
    assert.equal(v.deliveredAt, null);
  });

  it("L5 the deadline is the SERVER's answer verbatim — nothing is added on the client", () => {
    const v = travelerAcceptanceView(ARTIFACT(), "owner")!;
    assert.equal(v.deadline, "2026-09-17T09:00:00.000Z");
    assert.equal(v.noClockReason, null);
  });

  it("L6 a listing offering no revisions shows NO revision affordance and no zero", () => {
    const b = ARTIFACT({
      acceptance: { mode: "gates_completion", deliveredAt: "2026-09-10T09:00:00.000Z", hasBookingDeliverable: true },
    });
    const v = travelerAcceptanceView(b, "owner")!;
    assert.equal(v.revisionsRemaining, null, "absent, not 0");
    assert.equal(v.canRequestRevision, false);
  });

  it("L6 an exhausted allowance draws no button either", () => {
    const b = ARTIFACT({
      acceptance: {
        mode: "gates_completion",
        deliveredAt: "2026-09-10T09:00:00.000Z",
        hasBookingDeliverable: true,
        revisionsIncluded: 2,
        revisionsUsed: 2,
        revisionsRemaining: 0,
      },
    });
    assert.equal(travelerAcceptanceView(b, "owner")!.canRequestRevision, false);
  });
});

describe("booking lifecycle — one stage per state row", () => {
  it("L3 delivered / asked / revision requested / accepted / awaiting delivery", () => {
    const cases: Array<[LifecycleBooking, string, string]> = [
      [ARTIFACT({ status: "confirmed" }), "delivered", LIFECYCLE_COPY.delivered],
      [ARTIFACT({ status: "awaiting_acceptance" }), "asked", LIFECYCLE_COPY.asked],
      [ARTIFACT({ status: "revision_requested" }), "revision_requested", LIFECYCLE_COPY.revisionRequested],
      [
        ARTIFACT({
          status: "completed",
          acceptance: { mode: "gates_completion", hasBookingDeliverable: true, acceptedAt: "2026-09-12T00:00:00.000Z" },
        }),
        "accepted",
        LIFECYCLE_COPY.accepted,
      ],
      [
        ARTIFACT({ status: "confirmed", acceptance: { mode: "gates_completion", hasBookingDeliverable: false } }),
        "awaiting_delivery",
        LIFECYCLE_COPY.awaitingDelivery,
      ],
    ];
    for (const [booking, stage, headline] of cases) {
      const v = travelerAcceptanceView(booking, "owner")!;
      assert.equal(v.stage, stage);
      assert.equal(v.headline, headline);
    }
  });

  it("L4 an ESCALATED row is with our team and never says refunded", () => {
    const b = ARTIFACT({
      status: "disputed",
      bookingMetadata: { systemDisputeReason: ACCEPTANCE_WINDOW_ELAPSED_REASON },
    });
    assert.equal(isAcceptanceEscalation(b), true);
    const v = travelerAcceptanceView(b, "owner")!;
    assert.equal(v.stage, "escalated");
    assert.match(v.headline, /with our team/i);
    assert.doesNotMatch(v.headline, /refunded\b(?!.*no refund)/i);
    assert.match(v.headline, /no refund has been issued/i);
    assert.equal(v.canAccept, false, "an escalated row offers no accept button");
  });

  it("L4 an ordinary traveler dispute is NOT read as the timer's escalation", () => {
    assert.equal(isAcceptanceEscalation(ARTIFACT({ status: "disputed", bookingMetadata: {} })), false);
    assert.equal(isAcceptanceEscalation(ARTIFACT({ status: "confirmed" })), false);
  });
});

describe("booking lifecycle — the controls read the rails' own lists", () => {
  it("L7 gates_completion: accept and revise only from awaiting_acceptance", () => {
    for (const status of ["awaiting_acceptance"]) {
      const v = travelerAcceptanceView(ARTIFACT({ status }), "owner")!;
      assert.equal(v.canAccept, true, status);
      assert.equal(v.canRequestRevision, true, status);
    }
    for (const status of ["confirmed", "deposit_paid", "revision_requested", "completed", "refunded"]) {
      const v = travelerAcceptanceView(ARTIFACT({ status }), "owner")!;
      assert.equal(v.canAccept, false, status);
      assert.equal(v.canRequestRevision, false, status);
    }
  });

  it("L7 records_only (D-40 hybrid): the paid-equivalent pair, and accepting gates nothing", () => {
    const hybrid = (status: string): LifecycleBooking => ({
      id: "bk_h",
      status,
      acceptance: {
        mode: "records_only",
        deliveredAt: "2026-09-10T09:00:00.000Z",
        hasBookingDeliverable: true,
        revisionsIncluded: 1,
        revisionsUsed: 0,
        revisionsRemaining: 1,
      },
    });
    for (const status of ["confirmed", "deposit_paid"]) {
      const v = travelerAcceptanceView(hybrid(status), "owner")!;
      assert.equal(v.canAccept, true, status);
      assert.equal(v.canRequestRevision, true, status);
    }
    for (const status of ["awaiting_acceptance", "completed", "cancelled"]) {
      assert.equal(travelerAcceptanceView(hybrid(status), "owner")!.canAccept, false, status);
    }
  });

  it("L7 an already-accepted booking is never offered the accept button again", () => {
    const b = ARTIFACT({
      status: "awaiting_acceptance",
      acceptance: { mode: "gates_completion", hasBookingDeliverable: true, acceptedAt: "2026-09-12T00:00:00.000Z" },
    });
    assert.equal(travelerAcceptanceView(b, "owner")!.canAccept, false);
  });
});

describe("booking lifecycle — the declared window (LD 47)", () => {
  const declared = (status: string): LifecycleBooking => ({
    id: "bk_d",
    status,
    completionDeclaration: { declaredAt: "2026-09-10T00:00:00.000Z", disputeBy: "2026-09-17T00:00:00.000Z", windowDays: 7 },
  });

  it("L8 the dispute-by date is the SERVER's, and the dispute control reads the shared list", () => {
    const v = travelerDeclarationView(declared("completion_declared"), "owner")!;
    assert.equal(v.disputeBy, "2026-09-17T00:00:00.000Z");
    assert.equal(v.windowDays, 7);
    assert.equal(v.canDispute, true);
  });

  it("L8 a completed booking carries no declaration key, so no window is counted down", () => {
    // The SERVER omits `completionDeclaration` once `completed_at` is stamped; this is the client
    // half of that rule — with no key there is nothing to render.
    const completed: LifecycleBooking = { id: "bk_c", status: "completed" };
    assert.equal(travelerDeclarationView(completed, "owner"), null);
  });

  it("L9 the seller's control: drawn from confirmed, never beside a declaration, gone once completed", () => {
    assert.equal(sellerCompletionView({ id: "s", status: "confirmed" }, "seller")!.canDeclare, true);
    assert.equal(sellerCompletionView({ id: "s", status: "awaiting_acceptance" }, "seller")!.canDeclare, false);
    assert.equal(sellerCompletionView({ id: "s", status: "payment_pending" }, "seller")!.canDeclare, false);
    const withDeclaration = sellerCompletionView(declared("completion_declared"), "seller")!;
    assert.equal(withDeclaration.canDeclare, false, "never a second declare button");
    assert.ok(withDeclaration.declaration);
    const done = sellerCompletionView({ id: "s", status: "completed" }, "seller")!;
    assert.equal(done.completed, true);
    assert.equal(done.canDeclare, false);
    assert.equal(done.headline, LIFECYCLE_COPY.sellerCompleted);
  });
});

describe("booking lifecycle — shared status mapping and the day count", () => {
  it("L3 the two new statuses read as claims about whose turn it is, never as completed", () => {
    const asked = lifecycleStatusReading("awaiting_acceptance")!;
    const revising = lifecycleStatusReading("revision_requested")!;
    for (const r of [asked, revising]) {
      assert.equal(r.kind, "booked");
      assert.doesNotMatch(r.label, /completed/i);
    }
    // §13: a row with no recorded status makes no claim.
    assert.equal(lifecycleStatusReading(null), null);
    assert.equal(lifecycleStatusReading(""), null);
    // The module the slip and the Trip Card already read is the one being extended — the seller and
    // the traveler surfaces share it rather than opening a second table.
    assert.equal(lifecycleStatusReading("completed")!.label, "Booked · completed");
  });

  it("L10 no deadline and no time left are different answers", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    assert.equal(daysRemaining(null, now), null, "no deadline ⇒ null, never 0");
    assert.equal(daysRemaining(undefined, now), null);
    assert.equal(daysRemaining("not-a-date", now), null);
    assert.equal(daysRemaining("2026-09-17T00:00:00.000Z", now), 2);
    assert.equal(daysRemaining("2026-09-10T00:00:00.000Z", now), 0, "a passed deadline is 0, never negative");
  });
});
