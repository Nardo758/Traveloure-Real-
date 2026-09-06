/**
 * shared/contact-address.ts — how a conversation is ADDRESSED.
 *
 * Ledger `2026-09-05-user-id-is-internal`, CLAUDE.md Locked Decision 40.
 *
 * `users.id` is INTERNAL. A traveler opens a channel with an earner by naming WHAT the conversation
 * is about — a storefront handle, a public service, a booking they are already on, or (D22, ledger
 * `2026-09-05-slip-decisions-d18-d22`) the PLAN they share with an advisor — and the SERVER
 * resolves the counterpart from that. This is §14's identity rule (the actor comes from the
 * session, never from `req.body`) applied to the OTHER end of the message: a client-chosen
 * recipient id is an identity the caller picked, and it is the whole reason user ids are worth
 * harvesting.
 *
 * THE SCHEMA IS AN ALLOWLIST AND IT IS `.strict()` (§19). `.strict()` is load-bearing, not
 * decoration: it is what makes `{ receiverId }` — the legacy id-addressed shape this ruling
 * reverses — a 400 on this rail rather than a silently ignored key, so a client that "ports" to the
 * new endpoint by renaming the URL fails loudly instead of appearing to work.
 *
 * EXACTLY ONE ADDRESS. Two addresses is refused rather than resolved in a priority order: a caller
 * who sends both a `serviceId` and a `bookingId` has not said which conversation they mean, and
 * picking one for them is a guess (§13).
 *
 * `tripId` IS AN ADDRESS FOR A THREAD, NOT A GRANT (D22). It names a PLAN, and the server answers
 * "who is the other person on this plan" from the trip's own rows — the owner, or the
 * `trip_expert_advisors` row in a §12 access status. It is deliberately the ONLY kind whose
 * counterpart depends on WHO IS ASKING, which is exactly why it can carry no id: an address that
 * resolves differently per caller must be resolved by the side that knows who the caller is.
 *
 * NEGATIVE SPACE: this module decides SHAPE only. Whether the handle exists, whether the service is
 * approved and public, whether the caller is on the booking, whether either party has blocked the
 * other — every one of those is a database question answered server-side by
 * `server/services/contact-rails.service.ts`, and none of them can be answered here.
 */
import { z } from "zod";
import { HANDLE_RE } from "./handle";

/** Max length of the optional opening message sent with a start request. */
export const CONTACT_ABOUT_MAX = 500;

/**
 * The address kinds, and they are the whole set (Locked Decision 40, amended by its D22 addendum).
 * `tripId` is the plan-scoped `advisor` thread; the first three are unchanged.
 */
export const CONTACT_ADDRESS_KINDS = ["handle", "serviceId", "bookingId", "tripId"] as const;
export type ContactAddressKind = (typeof CONTACT_ADDRESS_KINDS)[number];

export const contactStartBodySchema = z
  .object({
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => HANDLE_RE.test(v), "Not a valid handle")
      .optional(),
    serviceId: z.string().trim().min(1).max(64).optional(),
    bookingId: z.string().trim().min(1).max(64).optional(),
    /**
     * D22 — the PLAN whose traveler↔advisor thread this is. The server resolves the counterpart
     * from the trip's own rows; no user id, handle or advisor row id is ever accepted here.
     */
    tripId: z.string().trim().min(1).max(64).optional(),
    // The opening message. Optional: a caller may open the thread without saying anything yet.
    about: z.string().trim().min(1).max(CONTACT_ABOUT_MAX).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const given = CONTACT_ADDRESS_KINDS.filter((k) => value[k] !== undefined);
    if (given.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of handle, serviceId, bookingId or tripId is required",
      });
      return;
    }
    if (given.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Send exactly one address, not ${given.length} (${given.join(", ")})`,
      });
    }
  });

export type ContactStartBody = z.infer<typeof contactStartBodySchema>;

/** The single address the body carries, after the schema has proven there is exactly one. */
export function addressKindOf(body: ContactStartBody): ContactAddressKind {
  const given = CONTACT_ADDRESS_KINDS.filter((k) => body[k] !== undefined);
  // Unreachable through the schema; a plain throw beats returning a guessed default (§13).
  if (given.length !== 1) throw new Error("contact address is not exactly one kind");
  return given[0];
}
