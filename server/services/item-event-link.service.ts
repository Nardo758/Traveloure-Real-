/**
 * ITEM → EVENT LINK — the ONE server-side resolution of `itinerary_items.user_experience_id`.
 * Migration 277, ledger `2026-09-03-item-event-link`, CLAUDE.md entry 29.
 *
 * WHY THIS IS A MODULE AND NOT TWO INLINE CHECKS.
 * Two live write rails admit the link — `POST /api/trips/:tripId/itinerary-items` (the
 * `server/routes.ts` monolith copy, which registers first and SHADOWS the `trips.routes.ts` twin,
 * §9) and `PATCH /api/trips/:tripId/itinerary-items/:itemId` (`trips.routes.ts`, the serving copy).
 * Two authors resolving the same admission two ways is the derivation-drift class §18 rule 1 names,
 * and it is how the §14/§19 family keeps coming back. So both rails call THIS, and a third rail
 * added later has one obvious thing to call.
 *
 * WHAT IT ACTUALLY GUARDS (§14 posture, one derivative sideways).
 * `userExperienceId` is a client-supplied FOREIGN KEY. Accepting it through the pick-based
 * allowlist (`itineraryItemEventLinkSchema`) proves only that a non-empty string arrived. It does
 * NOT prove the row exists, and — the part that matters — it does not prove the row belongs to the
 * trip in the URL. Without this resolution a traveler could staple their own item to an event on
 * SOMEONE ELSE'S plan, and every consumer that groups items by event would then render an item
 * under a stranger's wedding. The route's own authorization answers "may this caller write to THIS
 * trip"; it says nothing about the event id in the body. This closes that second question by
 * re-reading the event row server-side and comparing its `tripId` to the route's.
 *
 * ABSENT / NULL / A VALUE are THREE states and stay three (§13):
 *   · absent  ⇒ `{ action: "ignore" }`   — the caller never mentioned the link; do not touch it.
 *   · null    ⇒ `{ action: "set", value: null }` — move the item back to the plan's ONE implicit
 *               unnamed event. NULL is that event, not a missing value.
 *   · a value ⇒ verified, then `{ action: "set", value: <id> }`, or a refusal.
 *
 * A refusal is a 400 with a plain message, never a silent drop: an item that quietly landed under
 * no event would look identical to one the traveler deliberately left unfiled.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { userExperiences } from "@shared/schema";

export type ItemEventLinkResolution =
  | { ok: true; action: "ignore" }
  | { ok: true; action: "set"; value: string | null }
  | { ok: false; message: string };

/** The one refusal message both rails return, so the two cannot drift apart in wording either. */
export const EVENT_NOT_ON_THIS_TRIP_MESSAGE =
  "That event is not on this plan. An item can only be scheduled under an event that belongs to the same plan.";

/**
 * Resolve the event link a request body asked for, against the DB.
 *
 * @param tripId  the trip from the ROUTE (never from the body — the route already authorized it).
 * @param body    the parsed `itineraryItemEventLinkSchema` output, or the raw body for the
 *                key-presence check; pass `hasKey` explicitly when the parsed object cannot carry
 *                the absent-vs-null distinction.
 */
export async function resolveItemEventLink(
  tripId: string,
  hasKey: boolean,
  value: string | null | undefined,
): Promise<ItemEventLinkResolution> {
  if (!hasKey || value === undefined) return { ok: true, action: "ignore" };
  if (value === null) return { ok: true, action: "set", value: null };

  const [event] = await db
    .select({ id: userExperiences.id, tripId: userExperiences.tripId })
    .from(userExperiences)
    .where(eq(userExperiences.id, value))
    .limit(1);

  // A nonexistent id and an id on someone else's trip get the SAME message on purpose: a caller
  // must not be able to probe which event ids exist by reading the difference.
  if (!event || event.tripId !== tripId) {
    return { ok: false, message: EVENT_NOT_ON_THIS_TRIP_MESSAGE };
  }
  return { ok: true, action: "set", value: event.id };
}
