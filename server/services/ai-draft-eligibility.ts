/**
 * ai-draft-eligibility.ts — THE FREE AI DRAFT RUNS ONLY ON AN EMPTY SLIP (the DB half).
 *
 * CLAUDE.md Locked Decision 41 (b) / ledger `2026-09-05-draft-only-on-empty`.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Two free rails wrote a fresh AI plan onto an EXISTING trip and replaced whatever was there
 * (`saveGeneratedItinerarySnapshot`'s rebuild delete, and the Claude Regenerate wipe in
 * `server/routes.ts`). That is a free RE-OPTIMIZE: the traveler builds a slip, then asks the AI
 * to rebuild it — which is exactly the product the paid Optimize rail sells
 * (`/api/optimization-payments` → `generateOptimizedItineraries` → three anchored variants).
 * The decision-maker's ruling: the free draft is the FIRST plan on an empty slip; every later AI
 * action on a slip that already holds items is Optimize and goes through the existing pay gate.
 *
 * ONE PREDICATE, ONE PLACE (§18 rule 1). Every writer calls THIS — a second copy of "is this slip
 * empty?" is the derivation-drift class, and it would drift the first time the definition of
 * "holds items" moves. Guarded at CI by `scripts/check-ai-draft-eligibility.cjs`.
 *
 * THIS FILE IS THE DB HALF. Everything it decides lives in `ai-draft-eligibility.pure.ts` — the
 * `trip-destinations.pure.ts` precedent — so the decisions keep their proof with no
 * `DATABASE_URL`. Every pure name is re-exported here, so callers have ONE import and there is
 * still only one decision.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  decideAiDraftEligibility,
  isUntouchedAiDraftFromCounts,
  AiDraftSlipHasItemsError,
  type AiDraftEligibility,
} from "./ai-draft-eligibility.pure";

export {
  AI_DRAFT_REFUSAL_ERROR,
  AI_DRAFT_REFUSAL_MESSAGE,
  AI_DRAFT_REFUSAL_STATUS,
  aiDraftRefusalBody,
  AiDraftSlipHasItemsError,
  isAiDraftSlipHasItemsError,
  decideAiDraftEligibility,
  isUntouchedAiDraftFromCounts,
} from "./ai-draft-eligibility.pure";
export type { AiDraftEligibility } from "./ai-draft-eligibility.pure";

/**
 * Anything with a drizzle-shaped `.execute()` — `db` or a transaction handle. The second-layer
 * check inside `saveGeneratedItinerarySnapshot` passes its `tx` so it reads the SAME row-locked
 * snapshot the delete is about to act on, rather than racing it on a separate connection.
 */
export type EligibilityExecutor = { execute: (query: any) => Promise<any> };

/** Read one integer column off a drizzle `execute` result, defaulting to 0 rather than NaN. */
function intFrom(row: any, key: string): number {
  const raw = row?.[key];
  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * COUNT EVERY ROW, IN EVERY STATUS — see the pure module's note for why this is a bare `COUNT(*)`
 * and deliberately NOT the rebuild guard's deletable predicate.
 */
export async function countTripItineraryItems(
  tripId: string,
  exec: EligibilityExecutor = db,
): Promise<number> {
  const result = await exec.execute(
    sql`SELECT COUNT(*)::int AS count FROM itinerary_items WHERE trip_id = ${tripId}`,
  );
  return intFrom((result as any)?.rows?.[0], "count");
}

/**
 * THE predicate. Call it BEFORE any model call fires so a refused request costs no tokens (the
 * same placement reason `POST /api/trips/:id/generate-itinerary`'s authorization check already
 * carries). The decision itself is `decideAiDraftEligibility` — this reads the one number it needs.
 */
export async function resolveAiDraftEligibility(
  tripId: string | null | undefined,
  exec: EligibilityExecutor = db,
): Promise<AiDraftEligibility> {
  if (!tripId) return decideAiDraftEligibility(null, 0);
  return decideAiDraftEligibility(tripId, await countTripItineraryItems(tripId, exec));
}

/**
 * Second-layer assertion, for use INSIDE the snapshot transaction. Reuses
 * `resolveAiDraftEligibility` rather than re-counting — restating the count inside the transaction
 * is precisely the second author §18 rule 1 forbids.
 */
export async function assertAiDraftEligible(
  tripId: string,
  exec: EligibilityExecutor = db,
): Promise<void> {
  const verdict = await resolveAiDraftEligibility(tripId, exec);
  if (!verdict.eligible) throw new AiDraftSlipHasItemsError(tripId, verdict.itemCount);
}

/**
 * LD 41 (c) — "the free draft is a SKETCH", the READ side. Counts the plan's rows and the subset
 * that are still untouched draft rows, and hands both to the pure predicate. See that module for
 * why an EMPTY plan answers `false`.
 */
export async function isUntouchedAiDraft(
  tripId: string,
  exec: EligibilityExecutor = db,
): Promise<boolean> {
  const result = await exec.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE origin = 'ai' AND routing_status = 'in_planning'
      )::int AS sketch
    FROM itinerary_items
    WHERE trip_id = ${tripId}
  `);
  const row = (result as any)?.rows?.[0];
  return isUntouchedAiDraftFromCounts(intFrom(row, "total"), intFrom(row, "sketch"));
}
