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
 *
 * AMENDED (decision-maker ruling 2026-09-20, ledger `2026-09-20-concierge-plan-read`): a WINNING
 * claim on a request that names a `tripId` now also grants the claimant READ-only standing
 * (`trip_expert_advisors.status = "pending"`) on that plan, through the ONE `upsertTripAdvisorRow`
 * author — see `concierge-plan-read.service.ts`. The claim's own write and its atomic guard are
 * unchanged; the grant is an ancillary effect that never throws into this function's result.
 */
import { z } from "zod";

import { storage } from "../storage";
import { isExpertRole } from "@shared/roles";
import type { AffiliateBookingRequest } from "@shared/schema";
import { grantConciergePlanRead } from "./concierge-plan-read.service";
import { logger } from "../infrastructure/logger";

/**
 * The claim takes NO input beyond the row id in the path and the actor in the session. `.strict()`
 * so a body carrying `expertId` (or anything else) is refused — §19's allowlist shape at its
 * smallest: an allowlist of nothing.
 */
export const claimBodySchema = z.object({}).strict();

/**
 * WHO MAY WRITE A BOOKING REQUEST (board task #1678, ledger `2026-09-23-phase1-security`). Pure, and
 * the ONE answer the PATCH rail asks: the agent holding the claim writes, an admin writes, an
 * unclaimed request must be claimed first (through `claimBookingRequest`, the one claim author), and
 * a request another agent holds is not the caller's to touch. Role is checked before this is asked.
 */
export type BookingRequestWriteStanding = "holder" | "admin" | "unclaimed" | "not_yours";

export function bookingRequestWriteStanding(input: {
  actorUserId: string;
  actorIsAdmin: boolean;
  holderUserId: string | null;
}): BookingRequestWriteStanding {
  if (input.actorIsAdmin) return "admin";
  if (input.holderUserId === null) return "unclaimed";
  return input.holderUserId === input.actorUserId ? "holder" : "not_yours";
}

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
 * Injectable seam for the plan-read grant only (ledger `2026-09-20-concierge-plan-read`, on the
 * `concierge-handoff.service.ts` `ConciergeHandoffDeps` precedent, §18 rule 1's pattern applied to
 * a second module): defaults to the real grant; a test injects a failure to prove a WINNING
 * claim's own result is unchanged by it (§15b).
 */
export interface ClaimBookingRequestDeps {
  grantConciergePlanRead: typeof grantConciergePlanRead;
}

const defaultClaimDeps: ClaimBookingRequestDeps = {
  grantConciergePlanRead: (input) => grantConciergePlanRead(input),
};

/**
 * Claim one pooled affiliate booking request for `actorUserId`.
 *
 * The gate is the SAME one the pooled read and the PATCH rail apply — an expert role, or admin —
 * because the pool a request lands in is exactly the pool those routes serve. A claimant the queue
 * would never show the row to may not take it.
 */
export async function claimBookingRequest(
  params: {
    requestId: string;
    actorUserId: string;
  },
  deps: ClaimBookingRequestDeps = defaultClaimDeps,
): Promise<BookingAgentClaimOutcome> {
  const { requestId, actorUserId } = params;

  const actor = await storage.getUser(actorUserId);
  if (!actor || (!isExpertRole(actor.role ?? "") && actor.role !== "admin")) {
    return { ok: false, reason: "not_an_agent" };
  }

  // §15: the write is the guard and it goes first.
  const claimed = await storage.claimAffiliateBookingRequest(requestId, actorUserId);
  if (claimed) {
    // THE CLAIM HALF OF THE PLAN-READ GRANT (decision-maker ruling 2026-09-20, ledger
    // `2026-09-20-concierge-plan-read`). Fires only on a WINNING claim — the branch above ran
    // exactly once for this pair — never on a lost race (the caller below never reaches this) and
    // never re-run on the actor's own retry (`alreadyYours`, further down): the grant already
    // landed the first time this branch ran, and the one author's upsert would no-op a repeat
    // anyway. §13: a pooled request with no `tripId` grants nothing — there is no plan to read.
    // §15b, locally guarded (unlike `concierge-handoff.service.ts`, this function has no outer
    // try/catch of its own to fall back on — an unguarded throw here would turn a WON claim into
    // a 500 the caller never asked for): the real implementation never throws, and this call is
    // ALSO wrapped so an injected/future one cannot cost the win either (G7b,
    // `concierge-plan-read.db.test.ts`).
    try {
      await deps.grantConciergePlanRead({
        tripId: claimed.tripId,
        expertUserId: actorUserId,
        requestId: claimed.id,
      });
    } catch (err) {
      logger.error(
        { err, requestId: claimed.id, tripId: claimed.tripId, actorUserId },
        "[booking-agent-claim] plan-read grant threw — the claim stands (§15b)",
      );
    }
    return { ok: true, row: claimed, alreadyYours: false };
  }

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
