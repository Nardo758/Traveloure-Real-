/**
 * transport-cancel — the transport card's cancel-control decision, and the ONE from-state list
 * behind it.
 *
 * Ledger `2026-09-14-transport-card-cancel`; punchlist R-2. CLAUDE.md §13, §14, §18b, §18 rule 1.
 *
 * WHY THIS EXISTS. R-2: `TransportBookingCard.actionButton()` opened with
 * `if (isCancelled || isBooked || isConfirmed) return null;` and the file carried no cancel or
 * refund control at all, while `POST /api/bookings/:id/cancel` had existed the whole time. The
 * two ways a fix of that shape goes wrong both fail SILENTLY and plausibly:
 *
 *  · THE STATUS LIST GETS RE-TYPED. The route accepts `pending` and `confirmed`; a client copy
 *    drifts the day a status is added or removed, and then a button is offered for a state the
 *    server refuses (a 400 the traveler reads as a bug) or hidden for one it would have accepted
 *    (a cancellation nobody can reach). The predicate under test imports the SHARED list the
 *    route's own 400 and its §18b `expectedFromStatuses` guard both read, so the three cannot
 *    disagree — C5 pins exactly that.
 *  · MONEY LEAKS INTO THE CARD. A refund is a policy answer the server composes from the
 *    booking's own cancellation policy and its time-to-start. A card that computed, guessed or
 *    even defaulted one would be stating a number nobody stands behind (§14/§13). C7 pins that
 *    this module contains no money term at all, and C8 pins the same over the card and its dialog.
 *
 * §13 — ABSENCE IS AN ANSWER, AND THE TWO ABSENCES ARE DIFFERENT. `no-booking` (this viewer has
 * no transport booking of this option) and `not-cancellable` (there is one, and it has left the
 * cancellable states) are never collapsed: the first is the ordinary state of an unbought option
 * and of a hub read by an expert rather than its traveler, the second is a finished booking.
 *
 * NEGATIVE SPACE. This suite is PURE: it does not render, fetch or touch a DOM. It cannot see
 * whether `TransportBookingCard` actually mounts the control — C6/C8 are STATIC pins over the
 * file text (comments stripped) and see shape, not behaviour — and it asserts nothing about the
 * server's own from-state guard, which `server/__tests__/transport-payment-intent.db.test.ts` T7
 * proves against a real database.
 *
 * Run: npx tsx --test client/src/lib/__tests__/transport-cancel.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { transportCancelControl } from "../transport-cancel";
import {
  BOOKING_CANCELLABLE_FROM_STATUSES,
  isBookingCancellable,
} from "../../../../shared/booking-cancellation";

const ROOT = process.cwd();
const CARD = path.join(ROOT, "client/src/components/itinerary/TransportBookingCard.tsx");
const DIALOG = path.join(ROOT, "client/src/components/booking/CancelBookingDialog.tsx");
const MODULE = path.join(ROOT, "client/src/lib/transport-cancel.ts");
const ROUTES = path.join(ROOT, "server/routes.ts");

/** Comments stripped, so a pin can never be satisfied by the prose that DESCRIBES the rule. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, "$1"))
    .join("\n");
}
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("transportCancelControl — the state → control decision", () => {
  it("C1 — a booking in a cancellable status yields the control, carrying its own id", () => {
    for (const status of BOOKING_CANCELLABLE_FROM_STATUSES) {
      assert.deepEqual(
        transportCancelControl({ serviceBookingId: "booking-1", serviceBookingStatus: status }),
        { kind: "cancel", bookingId: "booking-1" },
        `${status} is a status the cancel route accepts, so the control must be offered`,
      );
    }
  });

  it("C2 — no booking for this viewer ⇒ no control, and the reason says which absence it is", () => {
    for (const id of [undefined, null, ""]) {
      assert.deepEqual(
        transportCancelControl({ serviceBookingId: id, serviceBookingStatus: "confirmed" }),
        { kind: "none", reason: "no-booking" },
      );
    }
  });

  it("C3 — a booking past the cancellable states is a DIFFERENT absence, never the same one", () => {
    for (const status of ["cancelled", "refunded", "completed", "in_progress", "disputed"]) {
      assert.deepEqual(
        transportCancelControl({ serviceBookingId: "booking-1", serviceBookingStatus: status }),
        { kind: "none", reason: "not-cancellable" },
        `${status} has left the cancel route's from-state list`,
      );
    }
    // §13: an ABSENT status is not a cancellable one. A surface that has not been told the status
    // has not been told the booking can be cancelled.
    for (const status of [undefined, null, ""]) {
      assert.deepEqual(
        transportCancelControl({ serviceBookingId: "booking-1", serviceBookingStatus: status }),
        { kind: "none", reason: "not-cancellable" },
      );
    }
  });

  it("C4 — a read-only surface never draws it, whatever the booking says", () => {
    assert.deepEqual(
      transportCancelControl({
        serviceBookingId: "booking-1",
        serviceBookingStatus: "confirmed",
        readOnly: true,
      }),
      { kind: "none", reason: "read-only" },
    );
  });
});

describe("the from-state list has ONE author (§18 rule 1)", () => {
  it("C5 — the client predicate and the cancel route read the SAME shared list", () => {
    // (a) the shared predicate is closed at the declared list, and is the one this module uses.
    const candidates = [
      "pending",
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
      "refunded",
      "disputed",
      "payment_pending",
    ];
    assert.deepEqual(
      candidates.filter((s) => isBookingCancellable(s)).sort(),
      [...BOOKING_CANCELLABLE_FROM_STATUSES].sort(),
    );

    // (b) the SERVER reads it too — both the 400 and, per §18b, the atomic conditional that
    //     performs the flip. A route that went back to spelling the statuses out fails here.
    const routes = stripComments(read(ROUTES));
    assert.match(
      routes,
      /import \{ BOOKING_CANCELLABLE_FROM_STATUSES, isBookingCancellable \} from "@shared\/booking-cancellation";/,
      "the cancel route must import the shared list, not restate it",
    );
    const cancelAt = routes.indexOf('app.post("/api/bookings/:id/cancel"');
    assert.ok(cancelAt > 0, "the cancel handler must still be locatable");
    const handler = routes.slice(cancelAt, routes.indexOf('app.post("/api/expert/reviews/:id/respond"'));
    assert.match(handler, /if \(!isBookingCancellable\(booking\.status\)\)/, "the 400 reads the shared predicate");
    assert.match(
      handler,
      /updateServiceBookingStatus\(\s*req\.params\.id,\s*"cancelled",\s*reason,\s*BOOKING_CANCELLABLE_FROM_STATUSES,\s*\)/,
      "§18b: the non-refund branch's UPDATE carries the from-state list, so the transition IS the guard",
    );
    assert.ok(
      !/booking\.status !== "pending" && booking\.status !== "confirmed"/.test(handler),
      "the re-typed copy must be gone, not merely shadowed",
    );
  });

  it("C6 — the card reads the decision, and does not re-derive it from the OPTION's own status", () => {
    const card = stripComments(read(CARD));
    assert.match(card, /import \{ transportCancelControl \} from "@\/lib\/transport-cancel";/);
    assert.match(card, /transportCancelControl\(\{/, "the card must call the one decision");
    assert.ok(
      !/isBookingCancellable|"pending"|"refunded"/.test(card),
      "the card must not carry its own copy of the booking-status vocabulary",
    );
    // `option.bookingStatus` is the OPTION's vocabulary and is NOT flipped by a booking
    // cancellation — it may still drive the BADGE, but never the cancel decision.
    const decision = card.slice(card.indexOf("transportCancelControl({"), card.indexOf("const cancelControl"));
    assert.ok(
      !/option\.bookingStatus/.test(decision),
      "the cancel decision must read the SERVER-resolved booking status, never the option's own",
    );
  });
});

describe("no money is decided on this surface (§14/§13)", () => {
  it("C7 — the decision module contains no money term at all", () => {
    const mod = stripComments(read(MODULE));
    assert.ok(
      !/refund|amount|price|percent|policy|fee|rate/i.test(mod),
      "the cancel DECISION is about state, never about money",
    );
  });

  it("C8 — the card and the dialog state the server's numbers and compute none", () => {
    const card = stripComments(read(CARD));
    // Every refund figure the card can show comes off the server's own cancel response.
    assert.ok(
      !/refundAmount\s*[*/+-]|\*\s*refundPercent|refundPercent\s*\/\s*100/.test(card),
      "no arithmetic on a refund figure may appear on the card",
    );
    assert.match(
      card,
      /cancelResult\.refund\?\.issued/,
      "§13: a refund is reported only when the SERVER's response says one was issued",
    );
    assert.ok(
      !/totalAmount\s*[*]|0\.\d+\s*\*/.test(card),
      "no policy rate literal may appear on the card",
    );

    const dialog = stripComments(read(DIALOG));
    assert.match(
      dialog,
      /useQuery<CancelPreview>\(\{\s*queryKey: \[`\/api\/bookings\/\$\{bookingId\}\/cancel-preview`\]/,
      "the dialog's figures come from the server's own quote endpoint",
    );
    assert.ok(
      !/refundPercent\s*\/\s*100|totalAmount\s*\*/.test(dialog),
      "the dialog renders the quote; it never recomputes one",
    );
    assert.match(
      dialog,
      /disabled=\{cancelMutation\.isPending \|\| previewLoading \|\| !cancelPreview\}/,
      "§13: no cancellation is confirmable before the server has stated its consequence",
    );
  });

  it("C9 — there is ONE cancel dialog, and both surfaces mount it", () => {
    const card = stripComments(read(CARD));
    const myBookings = stripComments(read(path.join(ROOT, "client/src/pages/my-bookings.tsx")));
    for (const [name, src] of [["the transport card", card], ["my-bookings", myBookings]] as const) {
      assert.match(
        src,
        /import \{ CancelBookingDialog(?:, type CancelBookingResult)? \} from "@\/components\/booking\/CancelBookingDialog";/,
        `${name} must reuse the shared dialog`,
      );
      assert.match(src, /<CancelBookingDialog/, `${name} must mount it`);
      assert.ok(
        !/cancel-preview`\]/.test(src.replace(/CancelBookingDialog/g, "")),
        `${name} must not run its own preview query beside the shared one`,
      );
    }
  });
});
