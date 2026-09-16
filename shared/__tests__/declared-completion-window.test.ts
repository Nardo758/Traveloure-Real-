/**
 * D-7 DECLARED COMPLETION — the PURE layer (punchlist D-36/D-37/D-38/D-39, option A; ledger
 * `2026-09-15-d36-d39-completion-declared`).
 *
 * `shared/declared-completion-window.ts` is the ONE derivation of when a seller-declared window
 * closes, which instant bounds a traveler's dispute, how the admin queue tells a declared-window
 * dispute from a post-completion one, and when a coordination engagement was declared. It computes
 * and never writes — no `db`, no `storage`, no request — which is what lets these proofs run with no
 * database and what keeps a second copy of any of those decisions from being written beside it
 * (§18 rule 1).
 *
 * WHAT IS PROVEN HERE AND WHAT IS NOT. These are the DERIVATIONS. The rails that apply them — the
 * atomic conditionals, the owner/traveler gates, the nightly job's passes — are proven against a
 * real database in `server/__tests__/declared-completion.db.test.ts`. Neither suite stands in for the
 * other.
 *
 * NO FEE LITERAL (§8): not one number here is money. `windowDays` is a DAY COUNT passed in; this
 * file states no window of its own, deliberately — a literal here would be the parallel constant
 * `completion-windows.config.ts`'s header forbids.
 *
 * Run solo: npx tsx --test shared/__tests__/declared-completion-window.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETION_DECLARED_STATUS,
  coordinationDeclaredAt,
  DAY_MS,
  declaredCompletionDeadline,
  declaredWindowElapsed,
  disputeStageFor,
  disputeWindowAnchor,
} from "../declared-completion-window";

const WINDOW = 5; // an arbitrary day count for the arithmetic — NOT the config value, NOT money

test("P1: the deadline is DERIVED — declared instant plus the window, and never stored anywhere", () => {
  const declared = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(
    declaredCompletionDeadline(declared, WINDOW),
    new Date(declared.getTime() + WINDOW * DAY_MS).toISOString(),
  );
  // The string form every DB driver hands back is accepted identically.
  assert.equal(declaredCompletionDeadline(declared.toISOString(), WINDOW), declaredCompletionDeadline(declared, WINDOW));
  // A zero-day window closes at the declaration itself — a real config value, honoured verbatim.
  assert.equal(declaredCompletionDeadline(declared, 0), declared.toISOString());
});

test("P2 (§13): a window the server cannot date does NOT start — null, never 'now' or a guess", () => {
  assert.equal(declaredCompletionDeadline(null, WINDOW), null);
  assert.equal(declaredCompletionDeadline(undefined, WINDOW), null);
  assert.equal(declaredCompletionDeadline("not a date", WINDOW), null);
  assert.equal(declaredCompletionDeadline(new Date(NaN), WINDOW), null);
  // A window the CONFIG cannot state is refused too — never clamped to 0.
  assert.equal(declaredCompletionDeadline(new Date(), -1), null);
  assert.equal(declaredCompletionDeadline(new Date(), Number.NaN), null);
});

test("P3: elapsed is a strict reading of the derived deadline, and an undatable window never elapses", () => {
  const declared = new Date("2026-09-15T12:00:00.000Z");
  const deadline = new Date(declared.getTime() + WINDOW * DAY_MS);
  assert.equal(declaredWindowElapsed(declared, WINDOW, new Date(deadline.getTime() - 1)), false);
  assert.equal(declaredWindowElapsed(declared, WINDOW, deadline), true, "the deadline instant itself counts as elapsed");
  assert.equal(declaredWindowElapsed(declared, WINDOW, new Date(deadline.getTime() + DAY_MS)), true);
  // §13: no instant ⇒ no window ⇒ it can never be said to have elapsed (the timer must not fire).
  assert.equal(declaredWindowElapsed(null, WINDOW, new Date("2099-01-01T00:00:00Z")), false);
});

test("P4: ONE dispute anchor — the declaration when there is one, else completed_at, else none", () => {
  const declared = new Date("2026-09-10T00:00:00.000Z");
  const completed = new Date("2026-09-17T00:00:00.000Z");
  // A declared booking's window began at the declaration (D-37 anchors the earning there too), so
  // the traveler's cutoff begins there — even after the window's close stamped `completed_at`.
  assert.equal(disputeWindowAnchor({ completionDeclaredAt: declared, completedAt: completed })?.getTime(), declared.getTime());
  assert.equal(disputeWindowAnchor({ completionDeclaredAt: declared, completedAt: null })?.getTime(), declared.getTime());
  // An UNDECLARED completion (traveler confirm, artifact acceptance, admin reject) keeps today's cutoff.
  assert.equal(disputeWindowAnchor({ completionDeclaredAt: null, completedAt: completed })?.getTime(), completed.getTime());
  // Neither ⇒ no TIME bound; the STATE bound (`DISPUTABLE_FROM_STATUSES`) is what holds.
  assert.equal(disputeWindowAnchor({ completionDeclaredAt: null, completedAt: null }), null);
  assert.equal(disputeWindowAnchor({ completionDeclaredAt: "garbage", completedAt: undefined }), null);
});

test("P5 (D-38): the queue tells the two disputes apart by DERIVATION, and completed_at outranks", () => {
  const declared = new Date("2026-09-10T00:00:00.000Z");
  const completed = new Date("2026-09-17T00:00:00.000Z");
  assert.equal(disputeStageFor({ completionDeclaredAt: declared, completedAt: null }), "declared_window");
  assert.equal(disputeStageFor({ completionDeclaredAt: null, completedAt: completed }), "post_completion");
  // A declared booking an admin re-completed (reject) and that was disputed AGAIN is post-completion:
  // the money exists and is held.
  assert.equal(disputeStageFor({ completionDeclaredAt: declared, completedAt: completed }), "post_completion");
  // A dispute on a confirmed/deposit_paid row, or D-27's escalation: nothing declared, nothing minted.
  assert.equal(disputeStageFor({ completionDeclaredAt: null, completedAt: null }), "pre_completion");
});

test("P6 (D-39): a coordination engagement's declaration instant is read from its own state_history", () => {
  const first = "2026-09-12T09:00:00.000Z";
  const history = [
    { status: "in_progress", timestamp: "2026-09-01T09:00:00.000Z", note: "started" },
    { status: COMPLETION_DECLARED_STATUS, timestamp: first, actor: "coordinator" },
    // A hypothetical later append naming the same status must NOT move the window the traveler
    // was already told about — the FIRST entry is the anchor.
    { status: COMPLETION_DECLARED_STATUS, timestamp: "2026-09-13T09:00:00.000Z" },
  ];
  assert.equal(coordinationDeclaredAt(history)?.toISOString(), first);
  // §13: a history with no such entry — legacy direct `completed`, or still in progress — has NO
  // window, so the refund gate does not apply to it.
  assert.equal(coordinationDeclaredAt([{ status: "completed", timestamp: "2026-09-01T00:00:00Z" }]), null);
  assert.equal(coordinationDeclaredAt([]), null);
  assert.equal(coordinationDeclaredAt(null), null);
  assert.equal(coordinationDeclaredAt("[]"), null, "a stringified column is not parsed — a reader must hand over the array");
  // A declared entry with an unreadable timestamp is skipped, not guessed onto a clock.
  assert.equal(coordinationDeclaredAt([{ status: COMPLETION_DECLARED_STATUS, timestamp: "nope" }]), null);
});
