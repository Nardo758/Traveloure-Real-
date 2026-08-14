/**
 * Task #113 — server-side validation of the optional decline `reason` field
 * on PATCH /api/expert/bookings/:id/status.
 *
 * Imports the production utility (`server/utils/normalize-decline-reason.ts`)
 * used directly by the route handler, so these tests stay green only when the
 * real handler logic matches.
 *
 * Run with:
 *   npx tsx --test server/__tests__/booking-decline-reason.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeDeclineReason, DECLINE_REASON_MAX_LENGTH } from "../utils/normalize-decline-reason.js";

describe("decline reason normalisation (production utility)", () => {
  test("absent reason → ok, reason: undefined", () => {
    const result = normalizeDeclineReason(undefined);
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, undefined);
  });

  test("null reason → ok, reason: undefined (treated as absent)", () => {
    const result = normalizeDeclineReason(null);
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, undefined);
  });

  test("blank string reason → ok, reason: undefined (treated as absent)", () => {
    const result = normalizeDeclineReason("   ");
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, undefined);
  });

  test("whitespace-padded reason → trimmed", () => {
    const result = normalizeDeclineReason("  availability conflict  ");
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, "availability conflict");
  });

  test("valid non-empty reason → preserved", () => {
    const result = normalizeDeclineReason("I am fully booked for those dates.");
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, "I am fully booked for those dates.");
  });

  test(`exactly ${DECLINE_REASON_MAX_LENGTH}-character reason → accepted`, () => {
    const reason = "a".repeat(DECLINE_REASON_MAX_LENGTH);
    const result = normalizeDeclineReason(reason);
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, reason);
  });

  test(`${DECLINE_REASON_MAX_LENGTH + 1}-character reason → 400`, () => {
    const result = normalizeDeclineReason("a".repeat(DECLINE_REASON_MAX_LENGTH + 1));
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
    assert.match((result as any).message, /500 characters/);
  });

  test("non-string reason (number) → 400", () => {
    const result = normalizeDeclineReason(42);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
    assert.match((result as any).message, /string/);
  });

  test("non-string reason (object) → 400", () => {
    const result = normalizeDeclineReason({ evil: true });
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
  });

  test("non-string reason (array) → 400", () => {
    const result = normalizeDeclineReason(["drop table"]);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
  });
});
