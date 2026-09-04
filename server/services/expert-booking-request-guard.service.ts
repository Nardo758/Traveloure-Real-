/**
 * expert-booking-request-guard.service.ts
 *
 * Validation + ownership authorization for `POST /api/expert-booking-requests`
 * (ruling `2026-09-04-slip-precondition`, lane b; CLAUDE.md Locked Decision 32).
 *
 * "No expert touchpoint exists without a slip; the tripId is what authorizes the expert's
 * view of the plan." tripId was previously optional here — a storefront request could be
 * sent with no trip, so even when a trip WAS attached later nothing had ever required one,
 * and the expert could never be attached as an advisor. This module is the ONE place that
 * decides "is this request well-formed and does this session own the trip it names" —
 * pulled out of the `server/routes.ts` monolith handler so it can be exercised directly by
 * a test with no Express app and no database (a stubbed trip record is all it needs).
 *
 * §14: the acting user is passed in from the session by the CALLER — this module never reads
 * req.body for identity, and the trip record it checks against is fetched by the caller
 * (server-side, keyed on the validated tripId), never trusted from the client's own claim
 * about the trip's owner.
 */
import { z } from "zod";

export const expertBookingRequestSchema = z.object({
  tripId: z
    .string({ required_error: "A trip is required — start a plan before requesting an expert." })
    .min(1, "A trip is required — start a plan before requesting an expert."),
  notes: z.string().optional().default(""),
  serviceId: z.string().optional(),
  bookingMetadata: z.record(z.any()).optional(),
});

export type ExpertBookingRequestBody = z.infer<typeof expertBookingRequestSchema>;

export type ExpertBookingAuthResult =
  | { ok: true; data: ExpertBookingRequestBody }
  | { ok: false; status: 400 | 401 | 404; message: string };

/**
 * Pure decision function: validates the body shape (tripId required) and, when the shape is
 * valid, checks the caller-supplied trip record against the session's own userId. Takes the
 * trip as a plain value (not a lookup function) so a test can hand it a stub with no DB
 * involved at all.
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

  if (!trip) {
    return { ok: false, status: 404, message: "Trip not found" };
  }
  if (trip.userId !== sessionUserId) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  return { ok: true, data: validation.data };
}
