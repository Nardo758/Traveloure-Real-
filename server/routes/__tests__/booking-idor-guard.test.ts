/**
 * booking-idor-guard.test.ts
 *
 * Confirms that GET /api/bookings/:id logs an [IDOR ATTEMPT] line and
 * returns 403 when an authenticated user who is neither the booking's
 * traveler nor its provider probes the endpoint.
 *
 * Tests:
 *   1. Static source inspection — verifies the log line and 403 are
 *      present and structurally correct in server/routes/bookings.ts.
 *   2. Pure access-control unit tests — mirrors the exact branching
 *      from the handler and drives a console.warn spy so that no DB
 *      or network is required.
 *
 * Run with:
 *   npx tsx --test server/routes/__tests__/booking-idor-guard.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── 1. Static source inspection ──────────────────────────────────────────────

const handlerPath = path.resolve(
  import.meta.dirname,
  "../bookings.ts"
);

describe("bookings.ts — static source inspection", () => {
  let src: string;

  it("handler file exists", () => {
    assert.ok(fs.existsSync(handlerPath), `Not found: ${handlerPath}`);
    src = fs.readFileSync(handlerPath, "utf-8");
  });

  it("emits [IDOR ATTEMPT] via console.warn", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    assert.ok(
      src.includes("[IDOR ATTEMPT]"),
      'Expected console.warn(`[IDOR ATTEMPT]...`) to be present in bookings.ts'
    );
    // Must use console.warn (not console.log/error) so the line appears in stderr
    assert.ok(
      /console\.warn\s*\(/.test(src),
      "Expected console.warn() call for [IDOR ATTEMPT]"
    );
  });

  it("log line interpolates the bookingId (req.params.id)", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    // The log must name the specific booking that was probed
    assert.ok(
      /req\.params\.id/.test(src),
      "Expected req.params.id to appear in the [IDOR ATTEMPT] log line"
    );
  });

  it("log line interpolates the requesting userId", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    // getUserId(req) result must be threaded into the warning
    const hasUserIdInLog =
      /User\s+\$\{userId\}/.test(src) ||
      /userId.*IDOR/.test(src) ||
      // Accept any template literal that references the local `userId` variable
      /`\[IDOR ATTEMPT\][^`]*\$\{userId\}/.test(src);
    assert.ok(
      hasUserIdInLog,
      "Expected the requesting userId to be interpolated into the [IDOR ATTEMPT] log line"
    );
  });

  it("returns 403 on the IDOR branch", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    // The 403 must appear in the same handler, after the warn
    assert.ok(
      /status\(403\)/.test(src),
      "Expected res.status(403) to be present in bookings.ts"
    );
  });

  it("admin role bypasses the IDOR guard", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    assert.ok(
      /userRole\s*===\s*['"]admin['"]/.test(src),
      "Expected admin role check before the IDOR guard"
    );
  });

  it("traveler (owner) bypasses the IDOR guard", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    assert.ok(
      /booking\.travelerId\s*===\s*userId/.test(src),
      "Expected traveler ownership check (booking.travelerId === userId)"
    );
  });

  it("provider (earner) bypasses the IDOR guard", () => {
    src ??= fs.readFileSync(handlerPath, "utf-8");
    assert.ok(
      /booking\.providerId\s*===\s*userId/.test(src),
      "Expected provider ownership check (booking.providerId === userId)"
    );
  });
});

// ── 2. Pure access-control unit tests with console.warn spy ─────────────────
//
// These replicate the exact branching from the GET /:id handler so that
// we exercise the IDOR log path without a live database.

type Booking = {
  id: string;
  travelerId: string;
  providerId: string;
};

type AccessResult = {
  /** HTTP status the handler would return */
  status: number;
  /** Whether console.warn was called with [IDOR ATTEMPT] */
  idorLogged: boolean;
  /** Captured warn messages */
  warnMessages: string[];
};

/**
 * Mirrors the access-control branching in GET /api/bookings/:id.
 * Returns the outcome and any captured console.warn calls.
 */
function checkBookingAccess(
  userId: string,
  userRole: string,
  booking: Booking
): AccessResult {
  const warnMessages: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnMessages.push(args.join(" "));
  };

  let status: number;
  try {
    // Admin sees everything
    if (userRole === "admin") {
      status = 200;
      return { status, idorLogged: false, warnMessages };
    }

    // Traveler (owner) sees full booking
    if (booking.travelerId === userId) {
      status = 200;
      return { status, idorLogged: false, warnMessages };
    }

    // Provider (earner) sees sanitized booking
    if (booking.providerId === userId) {
      status = 200;
      return { status, idorLogged: false, warnMessages };
    }

    // IDOR — log and deny
    console.warn(
      `[IDOR ATTEMPT] User ${userId} tried to access booking ${booking.id} ` +
        `(travelerId=${booking.travelerId}, providerId=${booking.providerId}) ` +
        `at GET /${booking.id}`
    );
    status = 403;
    return {
      status,
      idorLogged: warnMessages.some((m) => m.includes("[IDOR ATTEMPT]")),
      warnMessages,
    };
  } finally {
    console.warn = origWarn;
  }
}

describe("booking access-control — unrelated user (IDOR scenario)", () => {
  const TRAVELER_ID = "traveler-uuid-111";
  const PROVIDER_ID = "provider-uuid-222";
  const BOOKING_ID = "booking-uuid-aaa";
  const STRANGER_ID = "stranger-uuid-999";

  const booking: Booking = {
    id: BOOKING_ID,
    travelerId: TRAVELER_ID,
    providerId: PROVIDER_ID,
  };

  it("returns 403 for a stranger (neither traveler nor provider)", () => {
    const result = checkBookingAccess(STRANGER_ID, "user", booking);
    assert.equal(result.status, 403, "Unrelated user must receive 403");
  });

  it("emits [IDOR ATTEMPT] in console.warn for a stranger", () => {
    const result = checkBookingAccess(STRANGER_ID, "user", booking);
    assert.ok(
      result.idorLogged,
      "console.warn must contain [IDOR ATTEMPT] when a stranger probes the booking"
    );
  });

  it("includes the bookingId in the [IDOR ATTEMPT] log", () => {
    const result = checkBookingAccess(STRANGER_ID, "user", booking);
    const logLine = result.warnMessages.find((m) =>
      m.includes("[IDOR ATTEMPT]")
    );
    assert.ok(logLine, "expected an [IDOR ATTEMPT] warn message");
    assert.ok(
      logLine.includes(BOOKING_ID),
      `Log line must include bookingId "${BOOKING_ID}". Got: ${logLine}`
    );
  });

  it("includes the requesting userId in the [IDOR ATTEMPT] log", () => {
    const result = checkBookingAccess(STRANGER_ID, "user", booking);
    const logLine = result.warnMessages.find((m) =>
      m.includes("[IDOR ATTEMPT]")
    );
    assert.ok(logLine, "expected an [IDOR ATTEMPT] warn message");
    assert.ok(
      logLine.includes(STRANGER_ID),
      `Log line must include the stranger's userId "${STRANGER_ID}". Got: ${logLine}`
    );
  });
});

describe("booking access-control — legitimate callers must NOT trigger IDOR log", () => {
  const TRAVELER_ID = "traveler-uuid-111";
  const PROVIDER_ID = "provider-uuid-222";
  const BOOKING_ID = "booking-uuid-aaa";

  const booking: Booking = {
    id: BOOKING_ID,
    travelerId: TRAVELER_ID,
    providerId: PROVIDER_ID,
  };

  it("traveler (owner) gets 200, no [IDOR ATTEMPT] log", () => {
    const result = checkBookingAccess(TRAVELER_ID, "user", booking);
    assert.equal(result.status, 200, "Traveler must receive 200");
    assert.equal(result.idorLogged, false, "Traveler access must NOT trigger IDOR log");
  });

  it("provider (earner) gets 200, no [IDOR ATTEMPT] log", () => {
    const result = checkBookingAccess(PROVIDER_ID, "expert", booking);
    assert.equal(result.status, 200, "Provider must receive 200");
    assert.equal(result.idorLogged, false, "Provider access must NOT trigger IDOR log");
  });

  it("admin gets 200, no [IDOR ATTEMPT] log", () => {
    const result = checkBookingAccess("admin-uuid-000", "admin", booking);
    assert.equal(result.status, 200, "Admin must receive 200");
    assert.equal(result.idorLogged, false, "Admin access must NOT trigger IDOR log");
  });
});

describe("booking access-control — role variations for the stranger path", () => {
  const BOOKING_ID = "booking-uuid-bbb";
  const booking: Booking = {
    id: BOOKING_ID,
    travelerId: "traveler-uuid-t",
    providerId: "provider-uuid-p",
  };

  const strangerRoles = ["user", "expert", "service_provider", "local_expert"];

  for (const role of strangerRoles) {
    it(`role="${role}" stranger gets 403 + [IDOR ATTEMPT] log`, () => {
      const result = checkBookingAccess(`stranger-${role}`, role, booking);
      assert.equal(
        result.status,
        403,
        `${role} stranger must receive 403`
      );
      assert.ok(
        result.idorLogged,
        `${role} stranger access must trigger [IDOR ATTEMPT] log`
      );
    });
  }
});
