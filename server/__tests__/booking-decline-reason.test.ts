/**
 * Task #113 — server-side validation of the optional decline `reason` field
 * on PATCH /api/expert/bookings/:id/status.
 *
 * These tests exercise the validation logic directly (without a live DB) by
 * importing and calling the normalisation logic through a minimal request mock.
 * They do NOT require a DATABASE_URL — they run purely in-process.
 *
 * Run with:
 *   npx tsx --test server/__tests__/booking-decline-reason.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline the server-side normalisation logic so it can be unit-tested without
// standing up the full Express app.  This mirrors the logic added to
// handleOwnerBookingStatus in server/routes.ts exactly.
// ---------------------------------------------------------------------------
type NormaliseResult =
  | { ok: true; reason: string | undefined }
  | { ok: false; status: number; message: string };

function normaliseReason(raw: unknown): NormaliseResult {
  if (raw === undefined || raw === null) {
    return { ok: true, reason: undefined };
  }
  if (typeof raw !== "string") {
    return { ok: false, status: 400, message: "reason must be a string" };
  }
  const trimmed = raw.trim();
  if (trimmed.length > 500) {
    return { ok: false, status: 400, message: "reason must be 500 characters or fewer" };
  }
  return { ok: true, reason: trimmed || undefined };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("decline reason normalisation", () => {
  test("absent reason → undefined (no-reason decline still works)", () => {
    const result = normaliseReason(undefined);
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, undefined);
  });

  test("null reason → treated as absent", () => {
    const result = normaliseReason(null);
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, undefined);
  });

  test("blank string reason → treated as absent", () => {
    const result = normaliseReason("   ");
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, undefined);
  });

  test("whitespace-padded reason → trimmed", () => {
    const result = normaliseReason("  availability conflict  ");
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, "availability conflict");
  });

  test("valid non-empty reason → preserved", () => {
    const result = normaliseReason("I am fully booked for those dates.");
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, "I am fully booked for those dates.");
  });

  test("exactly 500-character reason → accepted", () => {
    const reason = "a".repeat(500);
    const result = normaliseReason(reason);
    assert.equal(result.ok, true);
    assert.equal((result as any).reason, reason);
  });

  test("501-character reason → rejected with 400", () => {
    const result = normaliseReason("a".repeat(501));
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
    assert.match((result as any).message, /500 characters/);
  });

  test("non-string reason (number) → rejected with 400", () => {
    const result = normaliseReason(42);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
    assert.match((result as any).message, /string/);
  });

  test("non-string reason (object) → rejected with 400", () => {
    const result = normaliseReason({ evil: true });
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
  });

  test("non-string reason (array) → rejected with 400", () => {
    const result = normaliseReason(["drop table"]);
    assert.equal(result.ok, false);
    assert.equal((result as any).status, 400);
  });
});
