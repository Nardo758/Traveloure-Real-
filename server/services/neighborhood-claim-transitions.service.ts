/**
 * NEIGHBORHOOD CLAIM TRANSITIONS — the claim's diary (expert field knowledge v2, Phase 1).
 *
 * Mirrors item-transition-log.service.ts (which is trip-scoped and cannot host these rows).
 * ONE writer module for `neighborhood_claim_transitions`. Every status flip on
 * `expert_neighborhood_claims` writes a row in the SAME transaction as the flip — callers pass
 * their `tx` so the pair is all-or-nothing. APPEND-ONLY: inserts and reads only; no UPDATE or
 * DELETE here, ever. (The gem-candidates sibling's fire-and-forget audit write is a filed
 * finding — this module is deliberately the stronger shape.)
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { neighborhoodClaimTransitions, type NeighborhoodClaimTransition } from "@shared/schema";
import type { ClaimActorType, ClaimStatus } from "@shared/neighborhood-claims";

/** The executor shape both `db` and a drizzle `tx` satisfy — inside a transaction, pass the `tx`. */
export type ClaimTxExecutor = Pick<typeof db, "insert">;

export interface ClaimTransitionEntry {
  claimId: string;
  claimVersion: number;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  actorType: ClaimActorType;
  actorId?: string | null;
}

export async function logClaimTransition(executor: ClaimTxExecutor, entry: ClaimTransitionEntry): Promise<void> {
  await executor.insert(neighborhoodClaimTransitions).values({
    claimId: entry.claimId,
    claimVersion: entry.claimVersion,
    fromStatus: entry.fromStatus ?? null,
    toStatus: entry.toStatus,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
  });
}

export async function listClaimTransitions(claimId: string): Promise<NeighborhoodClaimTransition[]> {
  return db
    .select()
    .from(neighborhoodClaimTransitions)
    .where(eq(neighborhoodClaimTransitions.claimId, claimId))
    .orderBy(asc(neighborhoodClaimTransitions.createdAt), asc(neighborhoodClaimTransitions.id));
}
