/**
 * THE BOOKING-AGENT CLAIM — one rail, one atomic conditional, one author.
 *
 * CLAUDE.md Locked Decision 44's reserved question, ruled by ledger
 * `2026-09-08-assignment-is-claimed` and executed by `2026-09-15-booking-agent-claim`:
 *
 *   **BOOKING-AGENT AUTO-ASSIGNMENT IS RETIRED; A REQUEST IS CLAIMED FROM THE POOL.**
 *   No assignee is stamped at create. The request lands in the pooled queue that already exists on
 *   the expert inbox and is CLAIMED by whoever takes it; matching may ORDER the queue and never
 *   binds a person. An unclaimed request says it is unclaimed and is never rendered as someone's
 *   (§13). NO BACKFILL — a row that was assigned was assigned.
 *
 * WHY THIS IS A MODULE AND NOT A ROUTE BODY. The decision has three parts that must not be
 * re-typed anywhere else (§18 rule 1): who may claim, the atomic write, and how a failed write is
 * classified into an answer. The route is a thin adapter over this; the test drives this directly.
 *
 * §14 — THE ACTOR IS THE SESSION. `actorUserId` is `getUserId(req)` at the one call site. Nothing
 * here reads a body, a query string or a param for an identity, and `claimBodySchema` is a
 * `.strict()` allowlist of NOTHING, so a request that tries to name its own claimant is REFUSED
 * rather than silently stripped (the LD 34 posture — a silent strip teaches a client that its field
 * was honoured).
 *
 * §15 — THE STATEMENT IS THE GUARD. `storage.claimAffiliateBookingRequest` is
 * `UPDATE … SET expert_id = $me WHERE id = $id AND expert_id IS NULL`. It runs FIRST, before any
 * read. The read that follows a zero-row result exists only to say WHICH refusal it was; if it
 * raced and the row is now the actor's own, that is the actor's own retry and it succeeds. A
 * check-then-update would be the bug this shape exists to refuse.
 *
 * WHAT A CLAIM DOES NOT DO. It writes NO status. `assigned` is a LEGACY value that
 * `HUMAN_SETTABLE_BOOKING_AGENT_STATUSES` deliberately excludes (LD 44 (e), ledger
 * `2026-09-08-agent-phase-zero`), and `researching` / `purchased_by_api` are server-written machine
 * states a human may not type themselves into. Whether a request is claimed is `expert_id`'s answer
 * and the status column's business is the work, not the ownership.
 *
 * NEGATIVE SPACE, STATED. This module decides nothing about ORDER — the pooled queue's ordering
 * lives in `storage.getAffiliateBookingRequestsByExpert` and is untouched by this lane. It does not
 * RELEASE a claim (nothing un-claims a request today, and inventing an un-claim would be a second
 * assignee-moving rail nobody has ruled). It touches no money, no amount and no rate.
 */
import { z } from "zod";

import { storage } from "../storage";
import { isExpertRole } from "@shared/roles";
import type { AffiliateBookingRequest } from "@shared/schema";

/**
 * The claim takes NO input beyond the row id in the path and the actor in the session. `.strict()`
 * so a body carrying `expertId` (or anything else) is refused — §19's allowlist shape at its
 * smallest: an allowlist of nothing.
 */
export const claimBodySchema = z.object({}).strict();

export type BookingAgentClaimRefusal = "not_an_agent" | "not_found" | "already_claimed";

export type BookingAgentClaimOutcome =
  | {
      ok: true;
      row: AffiliateBookingRequest;
      /** True when the actor already held this claim — their own retry, not a second grant. */
      alreadyYours: boolean;
    }
  | { ok: false; reason: BookingAgentClaimRefusal };

/** HTTP status per refusal, stated once so the route and its proofs cannot disagree. */
export const BOOKING_AGENT_CLAIM_STATUS: Record<BookingAgentClaimRefusal, number> = {
  not_an_agent: 403,
  not_found: 404,
  already_claimed: 409,
};

/**
 * The refusal wording. `already_claimed` names the FACT and never the person: the pooled reader
 * only ever shows an agent unclaimed rows plus their own, so naming a holder here would publish an
 * identity the queue itself does not.
 */
export const BOOKING_AGENT_CLAIM_MESSAGE: Record<BookingAgentClaimRefusal, string> = {
  not_an_agent: "Booking-agent role required",
  not_found: "Request not found",
  already_claimed: "Another booking agent has already claimed this request",
};

/**
 * Claim one pooled affiliate booking request for `actorUserId`.
 *
 * The gate is the SAME one the pooled read and the PATCH rail apply — an expert role, or admin —
 * because the pool a request lands in is exactly the pool those routes serve. A claimant the queue
 * would never show the row to may not take it.
 */
export async function claimBookingRequest(params: {
  requestId: string;
  actorUserId: string;
}): Promise<BookingAgentClaimOutcome> {
  const { requestId, actorUserId } = params;

  const actor = await storage.getUser(actorUserId);
  if (!actor || (!isExpertRole(actor.role ?? "") && actor.role !== "admin")) {
    return { ok: false, reason: "not_an_agent" };
  }

  // §15: the write is the guard and it goes first.
  const claimed = await storage.claimAffiliateBookingRequest(requestId, actorUserId);
  if (claimed) return { ok: true, row: claimed, alreadyYours: false };

  // Zero rows matched. That is EITHER "no such request" OR "already claimed" — the statement
  // cannot tell them apart, so read the row to choose the message. This read decides nothing.
  const current = await storage.getAffiliateBookingRequestById(requestId);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.expertId === actorUserId) {
    // The actor's own retry (a double-press, a replay). The fact they are asking for is already
    // true, so the claim is IDEMPOTENT rather than a 409: refusing a holder their own claim would
    // make a lost response look like someone else's win. §15d takes exactly this posture for the
    // balance-payer claim — "the holder's own retry re-claims, anyone else is refused 409".
    return { ok: true, row: current, alreadyYours: true };
  }
  return { ok: false, reason: "already_claimed" };
}
