/**
 * expert-booking-request-guard — ruling `2026-09-04-slip-precondition` (lane b), CLAUDE.md
 * Locked Decision 32: "no expert touchpoint exists without a slip; the tripId is what
 * authorizes the expert's view of the plan."
 *
 * Pure unit proofs over `authorizeExpertBookingRequest` — no Express app, no database. The
 * function under test takes the trip record as a plain stubbed value, exactly so this suite
 * can prove the three required behaviors without a DB:
 *
 *   G1 — a request with no tripId is REFUSED with a 400 (was previously optional and silently
 *        accepted, per the pre-fix `expertBookingRequestSchema`).
 *   G2 — a tripId that resolves to a trip owned by someone else is REFUSED 401 (§14: ownership
 *        is decided from the session userId against the server's own trip record, never from
 *        the request body).
 *   G3 — a tripId the session actually owns is AUTHORIZED, and — proving the route's own
 *        "create the advisor row the same way a routed lead does" clause — the caller then
 *        invokes `ensureTripAdvisorRow` exactly once with (tripId, expertUserId, notes). The
 *        real `ensureTripAdvisorRow` (server/services/booking-actions.service.ts) touches the
 *        DB, so it is stubbed here — the point of this proof is that the ROUTE decides to call
 *        it, once, with the right arguments; the DB write itself is that function's own
 *        concern, proven elsewhere against a disposable database
 *        (server/__tests__/expert-booking-request-rate.db.test.ts).
 *
 * Also proves the not-found case (tripId present but no such trip ⇒ 404, never treated as
 * "no trip" and silently allowed through).
 *
 * Run: npx tsx --test server/__tests__/expert-booking-request-guard.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeExpertBookingRequest,
  expertBookingRequestSchema,
} from "../services/expert-booking-request-guard.service";

const OWNER_ID = "user-owner-1";
const OTHER_USER_ID = "user-other-2";
const TRIP_ID = "trip-abc-123";

test("G1: a request with no tripId is refused with a 400 and an honest message", () => {
  const result = authorizeExpertBookingRequest({ notes: "please help" }, OWNER_ID, undefined);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.message, /trip/i, "the 400 message must say a trip is required, not a generic error");
  }
});

test("G1b: an empty-string tripId is refused with a 400 (min(1), not just presence)", () => {
  const result = authorizeExpertBookingRequest({ tripId: "" }, OWNER_ID, undefined);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("G1c: a non-string tripId is refused with a 400", () => {
  const result = authorizeExpertBookingRequest({ tripId: 12345 }, OWNER_ID, undefined);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("G2: a tripId owned by a DIFFERENT user is refused with 401, never 200", () => {
  const trip = { userId: OTHER_USER_ID };
  const result = authorizeExpertBookingRequest({ tripId: TRIP_ID }, OWNER_ID, trip);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 401);
    assert.match(result.message, /unauthorized/i);
  }
});

test("G2b: ownership is decided from the passed-in trip record, never from a body-supplied claim", () => {
  // Even if the body tried to assert something about ownership, the function only ever reads
  // tripId/notes/serviceId/bookingMetadata off the body — the decision is trip.userId vs the
  // sessionUserId argument, both supplied by the caller server-side (§14).
  const trip = { userId: OTHER_USER_ID };
  const result = authorizeExpertBookingRequest(
    { tripId: TRIP_ID, userId: OWNER_ID, notes: "spoofed ownership claim" } as any,
    OWNER_ID,
    trip,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 401);
});

test("G-404: a tripId with no matching trip is refused with 404, never silently treated as no trip", () => {
  const result = authorizeExpertBookingRequest({ tripId: TRIP_ID }, OWNER_ID, undefined);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 404);
    assert.match(result.message, /not found/i);
  }
});

test("G3: an owned tripId is authorized and returns the validated body", () => {
  const trip = { userId: OWNER_ID };
  const result = authorizeExpertBookingRequest(
    { tripId: TRIP_ID, serviceId: "svc-1", notes: "please help with my trip" },
    OWNER_ID,
    trip,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.tripId, TRIP_ID);
    assert.equal(result.data.serviceId, "svc-1");
    assert.equal(result.data.notes, "please help with my trip");
  }
});

test("G3b: notes defaults to an empty string when omitted (schema default, not an invented value)", () => {
  const trip = { userId: OWNER_ID };
  const result = authorizeExpertBookingRequest({ tripId: TRIP_ID }, OWNER_ID, trip);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.notes, "");
});

// ── G4: the ROUTE's decision to create the advisor row, proven with a stubbed ensureTripAdvisorRow ──
//
// This mirrors the shape of server/routes.ts's handler for the owner-authorized + serviceId
// branch: once `authorizeExpertBookingRequest` returns ok, and a service resolves to a
// providerId, the route calls `ensureTripAdvisorRow(tripId, providerId, notes)` — the SAME
// function the routed-lead caller in server/routes/booking-actions.ts uses (one implementation,
// two callers, §18 rule 1). We stand up a tiny stand-in of just that decision here (no Express,
// no DB) so the "advisor row created for an owned trip" behavior has a direct proof; the
// production wiring itself is grepped for in G5 below.
async function handleAuthorizedRequest(
  body: unknown,
  sessionUserId: string,
  trip: { userId: string } | null | undefined,
  resolveProviderId: (serviceId: string) => string | undefined,
  ensureTripAdvisorRowStub: (tripId: string, expertUserId: string, notes: string | null) => Promise<void>,
): Promise<{ status: number; message?: string; advisorRowCreated: boolean }> {
  const auth = authorizeExpertBookingRequest(body, sessionUserId, trip);
  if (!auth.ok) return { status: auth.status, message: auth.message, advisorRowCreated: false };

  const { tripId, notes, serviceId } = auth.data;
  let advisorRowCreated = false;
  if (serviceId) {
    const providerId = resolveProviderId(serviceId);
    if (providerId) {
      await ensureTripAdvisorRowStub(tripId, providerId, notes || null);
      advisorRowCreated = true;
    }
  }
  return { status: 201, advisorRowCreated };
}

test("G4: owner tripId + resolvable service ⇒ ensureTripAdvisorRow is called exactly once with (tripId, expertUserId, notes)", async () => {
  const trip = { userId: OWNER_ID };
  const calls: Array<{ tripId: string; expertUserId: string; notes: string | null }> = [];
  const stub = async (tripId: string, expertUserId: string, notes: string | null) => {
    calls.push({ tripId, expertUserId, notes });
  };

  const result = await handleAuthorizedRequest(
    { tripId: TRIP_ID, serviceId: "svc-1", notes: "please help" },
    OWNER_ID,
    trip,
    (serviceId) => (serviceId === "svc-1" ? "expert-user-9" : undefined),
    stub,
  );

  assert.equal(result.status, 201);
  assert.equal(result.advisorRowCreated, true);
  assert.equal(calls.length, 1, "ensureTripAdvisorRow must be called exactly once");
  assert.deepEqual(calls[0], { tripId: TRIP_ID, expertUserId: "expert-user-9", notes: "please help" });
});

test("G4b: unauthorized (non-owner) tripId never reaches the advisor-row step", async () => {
  const trip = { userId: OTHER_USER_ID };
  const calls: unknown[] = [];
  const stub = async (...args: unknown[]) => {
    calls.push(args);
  };

  const result = await handleAuthorizedRequest(
    { tripId: TRIP_ID, serviceId: "svc-1" },
    OWNER_ID,
    trip,
    () => "expert-user-9",
    stub,
  );

  assert.equal(result.status, 401);
  assert.equal(result.advisorRowCreated, false);
  assert.equal(calls.length, 0, "the advisor row must never be created for a request that failed authorization");
});

// ── G5: production wiring — the route calls the SAME shared ensureTripAdvisorRow, not a second
//        raw INSERT into trip_expert_advisors (§18 rule 1: one implementation, one more caller) ──
test("G5: server/routes.ts imports ensureTripAdvisorRow from booking-actions.service and calls it in the booking-request handler, with no second raw INSERT into trip_expert_advisors nearby", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const src = fs.readFileSync(path.join(repoRoot, "server", "routes.ts"), "utf8");

  assert.match(
    src,
    /import\s*\{\s*ensureTripAdvisorRow\s*\}\s*from\s*["']\.\/services\/booking-actions\.service["']/,
    "routes.ts must import the shared ensureTripAdvisorRow rather than reimplementing it",
  );

  const handlerStart = src.indexOf('app.post("/api/expert-booking-requests"');
  assert.ok(handlerStart >= 0, "the expert-booking-requests handler must exist");
  const handlerEnd = src.indexOf("\n  });", handlerStart);
  const handlerSrc = src.slice(handlerStart, handlerEnd > 0 ? handlerEnd : handlerStart + 6000);

  assert.match(
    handlerSrc,
    /ensureTripAdvisorRow\(/,
    "the handler must call ensureTripAdvisorRow to attach the expert as an advisor",
  );
  assert.doesNotMatch(
    handlerSrc,
    /INSERT INTO trip_expert_advisors/i,
    "the handler must not hand-roll a second INSERT into trip_expert_advisors — ensureTripAdvisorRow is the one writer",
  );
});

// Schema export sanity — importable on its own, no side effects.
test("schema export: expertBookingRequestSchema rejects a body with no tripId", () => {
  const parsed = expertBookingRequestSchema.safeParse({ notes: "x" });
  assert.equal(parsed.success, false);
});
