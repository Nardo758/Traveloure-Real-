/**
 * LANE A (brief 0) ? the PURE half of "what may a plain assignment accept grant".
 *
 * Split from `advisor-accept-basis.service.ts` for the reason `conversation-public-id.pure.ts` exists: the
 * service imports `../db`, which refuses to load without `DATABASE_URL`, and the rule itself is pure. A unit
 * test can hold the rule without a database, and the route still imports one module.
 *
 * THE RULE. The plain accept reaches a write status only with a PAID BASIS for that (trip, expert) pair:
 *
 *   handoff        a handoff whose fee is CAPTURED and whose work is OPEN ? status `accepted` or `delivered`.
 *                  Not `proposed`, not `authorized` (a hold is not money), not `approved` (the work is over and
 *                  the pen has been returned), not withdrawn or released.
 *   paid_request   a NON-handoff expert request assigned to that expert that carries the verified PaymentIntent
 *                  the request rail stamps (`server/routes/booking-actions.ts:360-365`), not refunded.
 *
 * NOT BASES (Leon, Nov 17 amendment 1): an admin assignment, a concierge accept and a plan-work purchase each
 * write a write status DIRECTLY and never reach this accept ? `admin.routes.ts:9290`, `:1363`,
 * `admin-query.service.ts:1023` (status `assigned`), `concierge-engagement.service.ts:32` (`accepted`),
 * `plan-work-access.service.ts:315` with `PLAN_WORK_GRANT_STATUS` `accepted` (`:113`).
 */

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
