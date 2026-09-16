/**
 * D-6 ACCEPTANCE — the PURE layer (punchlist D-24/D-25/D-26/D-40, option A; ledger
 * `2026-09-15-d24-d26-acceptance-columns`).
 *
 * `shared/acceptance-window.ts` is the ONE derivation of who takes acceptance, when the window
 * closes, how many revisions are left and which file a booking is served. It computes and never
 * writes — no `db`, no `storage`, no request — which is exactly what lets these proofs run with no
 * database and no network, and what keeps a second copy of any of those four decisions from being
 * written beside it (§18 rule 1).
 *
 * WHAT IS PROVEN HERE AND WHAT IS NOT. These are the DERIVATIONS. The rails that apply them — the
 * atomic conditionals, the traveler/provider gates, the child-row insert — are proven against a real
 * database in `server/__tests__/acceptance-rails.db.test.ts`. Neither suite stands in for the other.
 *
 * NO FEE LITERAL (§8): not one number here is money. `windowDays` is a DAY COUNT passed in from
 * `acceptanceWindowDays()`; this file states no window of its own, deliberately — a literal here
 * would be the parallel constant `completion-windows.config.ts`'s header forbids.
 *
 * Run solo: npx tsx --test shared/__tests__/acceptance-window.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acceptanceDeadline,
  acceptanceModeFor,
  DELIVERABLE_READABLE_STATUSES,
  mayRequestRevision,
  resolveDeliverable,
  resolveRevisionAllowance,
  takesArtifactAcceptance,
  AWAITING_ACCEPTANCE_STATUS,
  REVISION_REQUESTED_STATUS,
} from "../acceptance-window";

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A1 — WHICH LISTINGS TAKE ACCEPTANCE, AND WHAT IT DOES (D-6 + D-40)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A1: a pdf listing GATES COMPLETION; a hybrid gates nothing unless it DECLARED an artifact", () => {
  assert.equal(
    acceptanceModeFor({ deliveryMethod: "pdf", productShape: null }),
    "gates_completion",
    "the D-6 artifact case: acceptance is what completes the booking and mints",
  );

  // D-40, and this is the ruling's load-bearing half. A hybrid that declared an artifact takes
  // acceptance OF THAT ARTIFACT while the BOOKING keeps D-7's completion — `records_only`.
  assert.equal(
    acceptanceModeFor({
      deliveryMethod: "hybrid",
      productShape: null,
      declaredArtifactDeliverable: "Post-trip photo edit",
    }),
    "records_only",
    "a hybrid's declared artifact is accepted, but the booking still completes by its own timer",
  );

  // §13: NULL = NOT DECLARED ⇒ NO affordance at all. It must never be read as "no artifact",
  // which is a claim only the seller can make.
  assert.equal(
    acceptanceModeFor({ deliveryMethod: "hybrid", productShape: null, declaredArtifactDeliverable: null }),
    null,
    "a hybrid that declared nothing is pure D-7 — the reader draws nothing",
  );
  assert.equal(
    acceptanceModeFor({ deliveryMethod: "hybrid", productShape: null, declaredArtifactDeliverable: "   " }),
    null,
    "whitespace is not a declaration",
  );

  // Everything else takes no acceptance: sessions (D-7), on-ground work (D-7), and the two shapes
  // that outrank the delivery method in `completionRuleFor`.
  for (const method of ["call", "video", "in_person", "async_messaging", "voice_notes"]) {
    assert.equal(acceptanceModeFor({ deliveryMethod: method, productShape: null }), null, method);
  }
  assert.equal(
    acceptanceModeFor({ deliveryMethod: "pdf", productShape: "bundle" }),
    null,
    "a bundle keeps bundle_components and is out of scope for both lanes",
  );
  assert.equal(
    acceptanceModeFor({ deliveryMethod: "pdf", productShape: "property" }),
    null,
    "a property keeps checkout_date",
  );
  assert.equal(acceptanceModeFor({ deliveryMethod: null, productShape: null }), null);

  assert.equal(takesArtifactAcceptance({ deliveryMethod: "pdf", productShape: null }), true);
  assert.equal(takesArtifactAcceptance({ deliveryMethod: "in_person", productShape: null }), false);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A2 — THE DEADLINE IS DERIVED FROM THE DELIVERY INSTANT, AND AN ABSENT ONE STARTS NO CLOCK
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A2: the acceptance deadline is delivery + the config window, and NULL delivery = no clock", () => {
  const delivered = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(
    acceptanceDeadline(delivered, 7),
    "2026-09-22T12:00:00.000Z",
    "derived from the delivery instant plus the window it was handed",
  );
  // The window is a PARAMETER: the derivation states no number of its own, so a config change moves
  // every deadline at once and nothing stored has to be re-stamped (the whole reason D-24 refuses a
  // stored `acceptance_window_ends_at`).
  assert.equal(acceptanceDeadline(delivered, 3), "2026-09-18T12:00:00.000Z");
  assert.equal(acceptanceDeadline(delivered.toISOString(), 7), "2026-09-22T12:00:00.000Z");

  // §13 — the absences. A booking whose delivery instant the server does not hold is NOT put on an
  // acceptance clock: it is omitted with its reason, never anchored on "now", on `confirmed_at` or
  // on the LISTING's `deliverable_uploaded_at` (a clock shared by every buyer — the mismatch D-26
  // exists for).
  assert.equal(acceptanceDeadline(null, 7), null, "NULL delivery instant ⇒ no deadline at all");
  assert.equal(acceptanceDeadline(undefined, 7), null);
  assert.equal(acceptanceDeadline("not a date", 7), null, "an undatable value is not guessed");
  assert.equal(acceptanceDeadline(delivered, Number.NaN), null, "an unusable window yields no claim");
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A3 — THE ALLOWANCE IS THE LISTING'S, AND NULL OR 0 IS NO AFFORDANCE (not "0 remaining")
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A3: revisions_included NULL or 0 offers NOTHING; a positive allowance counts down from the rows", () => {
  const never = resolveRevisionAllowance(null, 0);
  assert.equal(never.offered, false, "§13: a listing that stated nothing shows no revision affordance");
  assert.equal(never.included, null, "and the absence is carried as NULL, never coerced to 0");
  assert.equal(never.remaining, null, "there is no number to remain from");
  assert.equal(mayRequestRevision(never), false);

  const none = resolveRevisionAllowance(0, 0);
  assert.equal(none.offered, false, "a stated ZERO is also no affordance — never a button that refuses");
  assert.equal(none.included, 0, "but 0 STATED and NULL never-stated stay distinguishable");
  assert.equal(mayRequestRevision(none), false);

  const two = resolveRevisionAllowance(2, 0);
  assert.equal(two.offered, true);
  assert.equal(two.remaining, 2);
  assert.equal(mayRequestRevision(two), true);

  // `used` is COUNTED from the child rows (D-25). There is no `revisions_used` column to disagree.
  assert.equal(resolveRevisionAllowance(2, 1).remaining, 1);
  const spent = resolveRevisionAllowance(2, 2);
  assert.equal(spent.remaining, 0);
  assert.equal(spent.offered, true, "the listing DID offer revisions — that stays true once they are spent");
  assert.equal(mayRequestRevision(spent), false, "and the refusal can therefore state the number");

  // A seller lowering the allowance after rows exist never produces a negative remainder.
  assert.equal(resolveRevisionAllowance(1, 3).remaining, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A4 — THE PER-BOOKING FILE WHEN SET, ELSE THE LISTING'S, AND THE READER IS TOLD WHICH (D-26)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A4: the deliverable resolves per-booking first and NAMES its source", () => {
  assert.deepEqual(resolveDeliverable("objstore:deliverables/bk/abc.pdf", "objstore:listing.pdf"), {
    value: "objstore:deliverables/bk/abc.pdf",
    source: "booking",
  });
  assert.deepEqual(resolveDeliverable(null, "objstore:listing.pdf"), {
    value: "objstore:listing.pdf",
    source: "listing",
  });
  assert.deepEqual(resolveDeliverable("   ", "https://example.test/x.pdf"), {
    value: "https://example.test/x.pdf",
    source: "listing",
  });
  // §13: nothing anywhere is NOT an empty string standing in for a file.
  assert.equal(resolveDeliverable(null, null), null);
  assert.equal(resolveDeliverable("", "  "), null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A5 — THE READ LIST, AND WHAT IT STILL REFUSES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test("A5: the acceptance statuses may read the artifact; a provisional claim never can", () => {
  assert.ok(DELIVERABLE_READABLE_STATUSES.includes("confirmed"), "the pre-existing gate is preserved");
  assert.ok(
    DELIVERABLE_READABLE_STATUSES.includes(AWAITING_ACCEPTANCE_STATUS),
    "a traveler must be able to READ what they are asked to accept",
  );
  assert.ok(
    DELIVERABLE_READABLE_STATUSES.includes(REVISION_REQUESTED_STATUS),
    "and must keep what they were sent while a revision is outstanding",
  );
  // §15b: a `payment_pending` row with no PaymentIntent is an unauthorized provisional claim, and
  // widening a READ list is exactly the kind of change that quietly unlocks one.
  for (const refused of ["payment_pending", "pending", "cancelled", "refunded", "expired", "disputed"]) {
    assert.ok(!DELIVERABLE_READABLE_STATUSES.includes(refused), `${refused} must not read the file`);
  }
});
