/**
 * LANE A (brief 0) — the PURE half of "what may a plain assignment accept grant".
 *
 * Split from `advisor-accept-basis.service.ts` for the reason `conversation-public-id.pure.ts` exists: the
 * service imports `../db`, which refuses to load without `DATABASE_URL`, and the rule itself is pure. A unit
 * test can hold the rule without a database, and the route still imports one module.
 *
 * THE RULE. The plain accept reaches a write status only with a PAID BASIS for that (trip, expert) pair:
 *
 *   handoff        a handoff whose fee is CAPTURED and whose work is OPEN — status `accepted` or `delivered`.
 *                  Not `proposed`, not `authorized` (a hold is not money), not `approved` (the work is over and
 *                  the pen has been returned), not withdrawn or released.
 *   paid_request   a NON-handoff expert request assigned to that expert that carries the verified PaymentIntent
 *                  the request rail stamps (`server/routes/booking-actions.ts:360-365`), not refunded.
 *
 * NOT BASES (Leon, Nov 17 amendment 1): an admin assignment, a concierge accept and a plan-work purchase each
 * write a write status DIRECTLY and never reach this accept — `admin.routes.ts:9290`, `:1363`,
 * `admin-query.service.ts:1023` (status `assigned`), `concierge-engagement.service.ts:32` (`accepted`),
 * `plan-work-access.service.ts:315` with `PLAN_WORK_GRANT_STATUS` `accepted` (`:113`).
 */

/**
 * THE FINISH MARKER ON A PAID REQUEST (addendum 5). A non-handoff request is CLOSED by `status='completed'`
 * (+ `completed_at`), written by `completeExpertRequest` (`server/services/booking-actions.service.ts:65-70`,
 * its atomic `WHERE status <> 'completed'` claim) and triggered by the expert's DELIVERED workspace transition
 * (`server/routes/booking-actions.ts:1495-1500`, R7). Delivery happens BEFORE the traveler can approve, so by
 * the time a no-handoff approval returns the advisor row to `pending`, the request is already `completed` ?
 * which is why the paid basis must be OPEN and not merely paid. No column is added: this marker exists.
 */
export const PAID_REQUEST_OPEN_STATUSES = ["assigned", "in_progress"] as const;
export type PaidRequestOpenStatus = (typeof PAID_REQUEST_OPEN_STATUSES)[number];

/** Pure. Is this request still open work? `completed` (and anything else) is not. */
export function paidRequestIsOpen(status: string | null | undefined): boolean {
  return (PAID_REQUEST_OPEN_STATUSES as readonly string[]).includes(status ?? "");
}

/** The two statuses in which a handoff's fee is captured AND the work is still open. */
export const HANDOFF_WRITE_STATUSES = ["accepted", "delivered"] as const;
export type HandoffWriteStatus = (typeof HANDOFF_WRITE_STATUSES)[number];

/** The second refusal: a paid basis EXISTED and the work is closed. A different fact, a different code. */
export const ADVISOR_FINISHED_REFUSAL = {
  code: "advisor_finished",
  status: 409,
  message:
    "This work is already finished, so there's nothing to accept. If the traveler wants more help, they can send a new plan request.",
} as const;

export type AdvisorFinishedRefusalCode = typeof ADVISOR_FINISHED_REFUSAL.code;

/** What stands behind a row that is about to be accepted. */
export type AdvisorAcceptBasis =
  | { kind: "handoff"; requestId: string; handoffStatus: HandoffWriteStatus }
  | { kind: "paid_request"; requestId: string };

/**
 * What the lookup found. `finished` is NOT a basis: it says a paid basis existed and the work is closed,
 * so the refusal can name the right fact (`advisor_finished`) instead of calling finished work unpaid.
 */
export type AdvisorAcceptFinding = AdvisorAcceptBasis | { kind: "finished"; requestId: string };

/** The named refusal. NEW USER-FACING STRING — Leon's wording approval is required on the PR before it ships. */
export const ADVISOR_UNPAID_REFUSAL = {
  code: "advisor_unpaid",
  status: 409,
  message:
    "This plan isn't paid for yet, so you can't accept it. The traveler needs to send a plan request first.",
} as const;

export type AdvisorAcceptRefusalCode = typeof ADVISOR_UNPAID_REFUSAL.code;

/** Pure. `null` — the accept may proceed; otherwise the named refusal. */
export function advisorAcceptRefusal(
  finding: AdvisorAcceptFinding | null | undefined,
): AdvisorAcceptRefusalCode | AdvisorFinishedRefusalCode | null {
  if (!finding) return ADVISOR_UNPAID_REFUSAL.code;
  if (finding.kind === "finished") return ADVISOR_FINISHED_REFUSAL.code;
  return null;
}

/**
 * Pure (addendum 2). A client may not stamp its own PaymentIntent into the request context. The rail already
 * refuses to persist a `paymentIntentId` it did not verify (`server/routes/booking-actions.ts:362-365`), but it
 * does NOT strip one the client sent, so a forged key rode the jsonb. This removes it before the write.
 */
export function stripClientPaymentIntent<T extends Record<string, any>>(context: T | null | undefined): T | null | undefined {
  if (!context || typeof context !== "object") return context;
  if (!("paymentIntentId" in context)) return context;
  const { paymentIntentId: _unverified, ...rest } = context as any;
  return rest as T;
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
