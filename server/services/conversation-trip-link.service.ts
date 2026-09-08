/**
 * CONVERSATION → PLAN LINK — the ONE server-side resolution of `conversations.trip_id`.
 * Migration 290, ledger `2026-09-08-conversation-trip-id`, CLAUDE.md Locked Decision 45 (1).
 *
 * WHY THIS IS A MODULE AND NOT AN INLINE CHECK.
 * `server/services/item-event-link.service.ts` is the precedent (LD 29) and the reasoning is the
 * same one derivative over: a link admitted by a §19 allowlist has only been proven to be a
 * NON-EMPTY STRING. It has not been proven to name a row, and — the part that matters — it has not
 * been proven to name a row the CALLER may attach anything to. A second copy of that decision beside
 * this one is the derivation-drift class §18 rule 1 names, and lane L16 (the slip's Ask-AI drawer)
 * is the second caller this exists for.
 *
 * WHAT IT GUARDS (§14 posture). §14 says a money endpoint derives the ACTOR from the session and
 * never from `req.body`. The same reasoning binds a client-supplied FOREIGN KEY that decides WHOSE
 * plan a thread is filed under: without this, any signed-in caller could staple their own AI
 * conversation onto a stranger's plan, and every reader that groups conversations by plan would then
 * show a thread on a plan its owner never opened.
 *
 * ABSENT / NULL / A VALUE are THREE states and stay three (§13):
 *   · absent  ⇒ `{ action: "ignore" }` — the caller never mentioned the link; do not touch it.
 *   · null    ⇒ `{ action: "set", value: null }` — an explicit "this thread belongs to no plan".
 *   · a value ⇒ verified against the OWNER, then `{ action: "set", value: <id> }`, or a refusal.
 *
 * NULL IS NOT A MISSING VALUE. It is the ordinary pre-mint case: a traveler talking to the AI before
 * any plan exists. Every reader says so rather than resolving it to the caller's nearest plan.
 *
 * A refusal is a 400 with a plain message, never a silent drop: a conversation that quietly landed
 * on no plan would look identical to one the traveler deliberately left unfiled.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { trips } from "@shared/schema";

export type ConversationTripLinkResolution =
  | { ok: true; action: "ignore" }
  | { ok: true; action: "set"; value: string | null }
  | { ok: false; message: string };

/** The one refusal message, so callers cannot drift apart in wording either. */
export const CONVERSATION_TRIP_NOT_YOURS_MESSAGE =
  "That plan is not yours. A conversation can only belong to a plan you own.";

/**
 * Resolve the plan link a request body asked for, against the DB.
 *
 * @param userId  the OWNER, from the SESSION — never from the body (§14).
 * @param hasKey  whether the body mentioned `tripId` at all (absent and null are different).
 * @param value   the value the §19 allowlist admitted.
 */
export async function resolveConversationTripLink(
  userId: string,
  hasKey: boolean,
  value: string | null | undefined,
): Promise<ConversationTripLinkResolution> {
  if (!hasKey || value === undefined) return { ok: true, action: "ignore" };
  if (value === null) return { ok: true, action: "set", value: null };

  const [trip] = await db
    .select({ id: trips.id, userId: trips.userId })
    .from(trips)
    .where(eq(trips.id, value))
    .limit(1);

  // A nonexistent id and someone else's plan get the SAME message on purpose (the
  // `POST /api/conversations/start` posture, LD 40): a caller must not be able to probe which trip
  // ids exist by reading the difference between "no such thing" and "not yours".
  if (!trip || !trip.userId || trip.userId !== userId) {
    return { ok: false, message: CONVERSATION_TRIP_NOT_YOURS_MESSAGE };
  }
  return { ok: true, action: "set", value: trip.id };
}
