/**
 * LANE A (brief 0) ? WHAT A PLAIN ASSIGNMENT ACCEPT IS ALLOWED TO GRANT.
 *
 * The defect (ledger `2026-09-24-request-rail-unpaid`, named again in the Nov 17 trace): an expert could accept
 * an ASSIGNMENT INVITE with no money behind it and reach a WRITE status on a traveler's plan, because the accept
 * route checked payment only when a handoff was `proposed`.
 *
 * THE RULE. The plain accept reaches a write status only with a PAID BASIS for that (trip, expert) pair:
 *
 *   handoff        a handoff whose fee is CAPTURED and whose work is OPEN ? status `accepted` or `delivered`.
 *                  Not `proposed`, not `authorized` (a hold is not money), not `approved` (the work is over and
 *                  the pen has been returned), not withdrawn or released.
 *   paid_request   a NON-handoff expert request assigned to that expert that carries the verified PaymentIntent
 *                  the request rail stamps (`server/routes/booking-actions.ts:360-365`), and is not refunded.
 *
 * KEYED ON THE PAIR, never on the trip alone: `getTripHandoff` returns ONE handoff per trip, so a second expert
 * on the same plan would read the first expert's fee.
 *
 * NOT BASES, on purpose (Leon, Nov 17 amendment 1): an admin assignment, a concierge accept and a plan-work
 * purchase each write a write status DIRECTLY and never reach this accept ? `admin.routes.ts:9290` and `:1363`,
 * `admin-query.service.ts:1023` (status `assigned`), `concierge-engagement.service.ts:32` (status `accepted`),
 * `plan-work-access.service.ts:315` with `PLAN_WORK_GRANT_STATUS` `accepted` (`:113`). Listing them here would
 * be a second copy of a standing those rails already grant.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

/** The two statuses in which a handoff's fee is captured AND the work is still open. */
export const HANDOFF_WRITE_STATUSES = ["accepted", "delivered"] as const;
export type HandoffWriteStatus = (typeof HANDOFF_WRITE_STATUSES)[number];

/** What stands behind a row that is about to be accepted. */
export type AdvisorAcceptBasis =
  | { kind: "handoff"; requestId: string; handoffStatus: HandoffWriteStatus }
  | { kind: "paid_request"; requestId: string };

/** The named refusal. NEW USER-FACING STRING ? Leon's wording approval is required on the PR before it ships. */
export const ADVISOR_UNPAID_REFUSAL = {
  code: "advisor_unpaid",
  status: 409,
  message:
    "This expert's work on this plan isn't paid for yet, so it can't be accepted. Ask them to send a plan request instead.",
} as const;

export type AdvisorAcceptRefusalCode = typeof ADVISOR_UNPAID_REFUSAL.code;

/** Pure. `null` ? the accept may proceed; otherwise the named refusal. */
export function advisorAcceptRefusal(basis: AdvisorAcceptBasis | null | undefined): AdvisorAcceptRefusalCode | null {
  return basis ? null : ADVISOR_UNPAID_REFUSAL.code;
}

/**
 * Pure. The handoff half of the rule, stated once so the SQL and its test cannot disagree.
 * `captured` is `captured_at IS NOT NULL`; a status outside {accepted, delivered} is never a basis.
 */
export function handoffBasisFromStatus(
  status: string | null | undefined,
  captured: boolean,
): HandoffWriteStatus | null {
  if (!captured) return null;
  return (HANDOFF_WRITE_STATUSES as readonly string[]).includes(status ?? "")
    ? (status as HandoffWriteStatus)
    : null;
}

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
      AND status IN ('assigned', 'in_progress')
      AND refund_id IS NULL
      AND NULLIF(optimization_context->>'paymentIntentId', '') IS NOT NULL
    LIMIT 1
  `);
  const p = (paid.rows?.[0] ?? null) as { id: string } | null;
  if (p) return { kind: "paid_request", requestId: p.id };

  return null;
}
