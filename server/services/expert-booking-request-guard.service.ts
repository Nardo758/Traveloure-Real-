/**
 * expert-booking-request-guard.service.ts
 *
 * Validation + ownership authorization for `POST /api/expert-booking-requests`
 * (ruling `2026-09-04-slip-precondition`, lane b; CLAUDE.md Locked Decision 32).
 *
 * NARROWED (coordinator correction, same day): the ruling binds the expert TOUCHPOINT — the
 * advisor attachment — not every caller of this overloaded endpoint. Five client surfaces call
 * `POST /api/expert-booking-requests`; some (visa-help's plain service purchase) are ordinary
 * commerce with no trip and no advisor involved. So `tripId` stays OPTIONAL on the schema:
 *
 *   - tripId ABSENT   ⇒ authorized as before (a trip-less service booking / inquiry — the
 *                       pre-existing commerce behavior, unchanged, no advisor row).
 *   - tripId PRESENT  ⇒ MUST resolve to a trip the session user owns, or the request is refused
 *                       (404 unknown trip, 401 someone else's trip) — a bad tripId is never
 *                       silently downgraded to "no trip". Only a validated, owned tripId ever
 *                       reaches the advisor-attachment step in the route handler.
 *
 * "No expert touchpoint exists without a slip; the tripId is what authorizes the expert's view
 * of the plan" — that's the ADVISOR-ATTACHMENT step (ensureTripAdvisorRow, called by the route
 * only when tripId is present and authorized), not the schema requirement. This module is the
 * ONE place that decides "is this request well-formed and, if it names a trip, does this
 * session own it" — pulled out of the `server/routes.ts` monolith handler so it can be
 * exercised directly by a test with no Express app and no database (a stubbed trip record is
 * all it needs).
 *
 * §14: the acting user is passed in from the session by the CALLER — this module never reads
 * req.body for identity, and the trip record it checks against is fetched by the caller
 * (server-side, keyed on the validated tripId), never trusted from the client's own claim
 * about the trip's owner.
 */
import { z } from "zod";

export const expertBookingRequestSchema = z.object({
  tripId: z.string().optional(),
  notes: z.string().optional().default(""),
  serviceId: z.string().optional(),
  bookingMetadata: z.record(z.any()).optional(),
});

export type ExpertBookingRequestBody = z.infer<typeof expertBookingRequestSchema>;

export type ExpertBookingAuthResult =
  | { ok: true; data: ExpertBookingRequestBody }
  | { ok: false; status: 400 | 401 | 404; message: string };

/**
 * Pure decision function: validates the body shape and, ONLY when a tripId was actually
 * supplied, checks the caller-supplied trip record against the session's own userId. A
 * trip-less request is authorized outright (the endpoint's pre-existing commerce behavior).
 * Takes the trip as a plain value (not a lookup function) so a test can hand it a stub with no
 * DB involved at all.
 */
export function authorizeExpertBookingRequest(
  rawBody: unknown,
  sessionUserId: string,
  trip: { userId: string | null } | null | undefined,
): ExpertBookingAuthResult {
  const validation = expertBookingRequestSchema.safeParse(rawBody);
  if (!validation.success) {
    return {
      ok: false,
      status: 400,
      message: validation.error.errors[0]?.message || "Invalid request body",
    };
  }

  if (validation.data.tripId) {
    if (!trip) {
      return { ok: false, status: 404, message: "Trip not found" };
    }
    if (trip.userId !== sessionUserId) {
      return { ok: false, status: 401, message: "Unauthorized" };
    }
  }

  return { ok: true, data: validation.data };
}
