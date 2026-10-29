/**
 * The guest RSVP body (ledger `2026-10-29-rsvp-accommodation-by-answer`).
 *
 * Accommodation is a question for a guest who is coming. It is REQUIRED when `rsvpStatus` is
 * "accepted", and for "maybe" or "declined" it must be absent or null and is never stored. Before
 * this, the schema made it optional for every answer while the page sent `""` for an unanswered
 * choice, so every maybe or declined RSVP (and a yes with no choice) was refused with a 400, and
 * a yes that got through stored "undecided" for a question the guest never answered.
 *
 * §19 ALLOWLIST: a hand-written `z.object`, as before; no key was added.
 */
import { z } from "zod";
import { accommodationPreferenceEnum } from "@shared/guest-invites-schema";

export const rsvpSchema = z
  .object({
    rsvpStatus: z.enum(["accepted", "declined", "maybe"]),
    numberOfGuests: z.number().int().min(1).max(50).optional(),
    dietaryRestrictions: z.array(z.string().max(100)).max(20).optional(),
    accommodationPreference: z.enum(accommodationPreferenceEnum).nullable().optional(),
    transportationNeeded: z.boolean().optional(),
    specialRequests: z.string().max(2000).optional(),
    message: z.string().max(2000).optional(),
  })
  .superRefine((body, ctx) => {
    const given = body.accommodationPreference != null;
    if (body.rsvpStatus === "accepted" && !given) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accommodationPreference"],
        message: "accommodationPreference is required when rsvpStatus is accepted",
      });
    }
    if (body.rsvpStatus !== "accepted" && given) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accommodationPreference"],
        message: "accommodationPreference is only accepted when rsvpStatus is accepted",
      });
    }
  });

export type RsvpBody = z.infer<typeof rsvpSchema>;

/**
 * The values the RSVP writes. `accommodationPreference` is present only for "accepted"; for any
 * other answer the key is absent, so the update leaves the stored column as it is.
 */
export function rsvpUpdateValues(body: RsvpBody, now: Date = new Date()) {
  return {
    rsvpStatus: body.rsvpStatus,
    rsvpDate: now,
    numberOfGuests: body.numberOfGuests || 1,
    dietaryRestrictions: body.dietaryRestrictions || [],
    ...(body.rsvpStatus === "accepted" && body.accommodationPreference != null
      ? { accommodationPreference: body.accommodationPreference }
      : {}),
    transportationNeeded: body.transportationNeeded || false,
    specialRequests: body.specialRequests,
    message: body.message,
  };
}
