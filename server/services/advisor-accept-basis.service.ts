/**
 * LANE A (brief 0) ? WHERE THE PAID BASIS IS READ.
 *
 * The rule itself is pure and lives in `advisor-accept-basis.pure.ts` (a unit test must not load `../db`).
 * This module adds the one thing the rule cannot: the lookup, keyed on the (trip, expert) PAIR, never on the
 * trip alone ? `getTripHandoff` returns ONE handoff per trip, so a second expert on the same plan would read
 * the first expert's fee.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { PAID_REQUEST_OPEN_STATUSES, handoffBasisFromStatus, type AdvisorAcceptBasis } from "./advisor-accept-basis.pure";

export {
  ADVISOR_UNPAID_REFUSAL,
  HANDOFF_WRITE_STATUSES,
  PAID_REQUEST_OPEN_STATUSES,
  advisorAcceptRefusal,
  handoffBasisFromStatus,
  paidRequestIsOpen,
} from "./advisor-accept-basis.pure";
export type { AdvisorAcceptBasis, AdvisorAcceptRefusalCode, HandoffWriteStatus } from "./advisor-accept-basis.pure";

/** The lookup. Both statements are read-only and keyed on `(tripId, expertId)`. */
export async function loadAdvisorAcceptBasis(
  tripId: string,
  expertId: string,
): Promise<AdvisorAcceptBasis | null> {
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

  const paid = await db.execute(sql`
    SELECT id FROM expert_requests
    WHERE trip_id = ${tripId}
      AND assigned_expert_id = ${expertId}
      AND handoff_kind IS NULL
      AND status IN (${sql.join(PAID_REQUEST_OPEN_STATUSES.map((v) => sql`${v}`), sql`, `)})
      AND refund_id IS NULL
      AND NULLIF(optimization_context->>'paymentIntentId', '') IS NOT NULL
    LIMIT 1
  `);
  const p = (paid.rows?.[0] ?? null) as { id: string } | null;
  if (p) return { kind: "paid_request", requestId: p.id };

  return null;
}
