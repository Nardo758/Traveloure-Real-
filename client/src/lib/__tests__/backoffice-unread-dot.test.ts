/**
 * FP-5 / N1 — the console bell's unread dot (pure unit; no DB, no browser).
 *
 * Evidence: docs/testing/CONSOLE_TABS_EXERCISE.md finding N1 (as-of `f747d0a`). The red dot on
 * `BackofficeShell`'s notification bell was a hardcoded `<span>` — no count, no query, no
 * condition — so it was lit for every provider, expert and EA on every page forever, including a
 * brand-new account with nothing at all. It carried ZERO information and could never signal a real
 * event; §13 forbids a fake indicator.
 *
 * A real source existed and is now wired: `GET /api/notifications/unread-count`, the same
 * user-scoped endpoint the traveler bell and the traveler sidebar badge already read.
 *
 * NEGATIVES FIRST — the two refusals are the whole fix, and both must FAIL CLOSED.
 *
 * Run: npx tsx --test client/src/lib/__tests__/backoffice-unread-dot.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldShowUnreadDot } from "@/components/backoffice/backoffice-shell";

test("N1: ZERO unread renders NO dot — the defect, stated as an assertion", () => {
  assert.equal(shouldShowUnreadDot({ count: 0 }), false);
});

test("N2: an unanswered query renders NO dot (loading, 401, network error)", () => {
  // Failing OPEN here would restore the defect wholesale: every first paint, every logged-out
  // render and every offline session would light the bell again.
  assert.equal(shouldShowUnreadDot(undefined), false);
  assert.equal(shouldShowUnreadDot(null), false);
  assert.equal(shouldShowUnreadDot({}), false);
});

test("N3: a non-numeric or nonsensical count renders NO dot", () => {
  assert.equal(shouldShowUnreadDot({ count: undefined }), false);
  assert.equal(shouldShowUnreadDot({ count: "3" } as any), false, "a string is not a count");
  assert.equal(shouldShowUnreadDot({ count: -1 }), false, "a negative count is not an alert");
  assert.equal(shouldShowUnreadDot({ count: Number.NaN }), false);
});

test("P1: one or more real unread notifications renders the dot", () => {
  assert.equal(shouldShowUnreadDot({ count: 1 }), true);
  assert.equal(shouldShowUnreadDot({ count: 42 }), true);
});
