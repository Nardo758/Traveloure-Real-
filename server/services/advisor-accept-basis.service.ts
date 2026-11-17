/**
 * LANE A (brief 0) — WHERE THE PAID BASIS IS READ.
 *
 * The rule itself is pure and lives in `advisor-accept-basis.pure.ts` (a unit test must not load `../db`).
 * This module adds the one thing the rule cannot: the lookup, keyed on the (trip, expert) PAIR, never on the
 * trip alone — `getTripHandoff` returns ONE handoff per trip, so a second expert on the same plan would read
 * the first expert's fee.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { PAID_REQUEST_OPEN_STATUSES, handoffBasisFromStatus, type AdvisorAcceptFinding } from "./advisor-accept-basis.pure";

export {
  ADVISOR_UNPAID_REFUSAL,
  ADVISOR_FINISHED_REFUSAL,
  HANDOFF_WRITE_STATUSES,
  PAID_REQUEST_OPEN_STATUSES,
  advisorAcceptRefusal,
  handoffBasisFromStatus,
  paidRequestIsOpen,
  stripClientPaymentIntent,
} from "./advisor-accept-basis.pure";
export type {
  AdvisorAcceptBasis,
  AdvisorAcceptFinding,
  AdvisorAcceptRefusalCode,
  AdvisorFinishedRefusalCode,
  HandoffWriteStatus,
} from "./advisor-accept-basis.pure";

/** The lookup. Both statements are read-only and keyed on `(tripId, expertId)`. */
export async function loadAdvisorAcceptBasis(
  tripId: string,
  expertId: string,
): Promise<AdvisorAcceptFinding | null> {
  if (!tripId || !expertId) return null;

  const handoff = await db.execute(sql`
    SELECT id, status, captured_at FROM expert_requests
    WHERE trip_id = ${tripId}
      AND assigned_expert_id = ${expertId}
      AND handoff_kind IS NOT NULL
      AND status IN ('accepted', 'delivered')
    ORDER BY accepted_at DESC NULLS LAST
    LIMIT 1
  `);
  const h = (handoff.rows?.[0] ?? null) as { id: string; status: string; captured_at: string | null } | null;
  if (h) {
    const status = handoffBasisFromStatus(h.status, h.captured_at != null);
    if (status) return { kind: "handoff", requestId: h.id, handoffStatus: status };
  }

  // The PI alone is a CLAIM, not money (addendum 2): `optimizationContext` arrives from req.body and was
  // persisted as-is when no fee was verified, so the key's presence proves nothing. Require the LEDGER row the
  // money actually wrote — the lookup `creditExpertReviewSplit` uses (`booking-actions.service.ts:121-123`:
  // `platform_revenue.source_id = <pi>` with `source_type = 'expert_review_fee'`).
  const paid = await db.execute(sql`
    SELECT e.id FROM expert_requests e
    WHERE e.trip_id = ${tripId}
      AND e.assigned_expert_id = ${expertId}
      AND e.handoff_kind IS NULL
      AND e.status IN (${sql.join(PAID_REQUEST_OPEN_STATUSES.map((v) => sql`${v}`), sql`, `)})
      AND e.refund_id IS NULL
      AND NULLIF(e.optimization_context->>'paymentIntentId', '') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM platform_revenue r
        WHERE r.source_id = e.optimization_context->>'paymentIntentId'
          AND r.source_type = 'expert_review_fee'
      )
    LIMIT 1
  `);
  const p = (paid.rows?.[0] ?? null) as { id: string } | null;
  if (p) return { kind: "paid_request", requestId: p.id };

  // Nothing OPEN. Was there ever a paid basis? Then the refusal names FINISHED, not unpaid (addendum 4).
  const finished = await db.execute(sql`
    SELECT id FROM expert_requests
    WHERE trip_id = ${tripId}
      AND assigned_expert_id = ${expertId}
      AND (
        (handoff_kind IS NOT NULL AND captured_at IS NOT NULL
          AND status IN ('approved', 'withdrawn', 'released'))
        OR (handoff_kind IS NULL AND status = 'completed'
          AND NULLIF(optimization_context->>'paymentIntentId', '') IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM platform_revenue r
            WHERE r.source_id = expert_requests.optimization_context->>'paymentIntentId'
              AND r.source_type = 'expert_review_fee'
          ))
      )
    LIMIT 1
  `);
  const f = (finished.rows?.[0] ?? null) as { id: string } | null;
  if (f) return { kind: "finished", requestId: f.id };

  return null;
}
