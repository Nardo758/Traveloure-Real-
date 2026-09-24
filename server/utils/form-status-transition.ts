/**
 * Did an application save ENTER a status, or re-save one it already had? (board task #905,
 * ledger `2026-09-23-phase2-messages`).
 *
 * The expert and provider application status writers read the prior status under a row lock and
 * return it as `priorStatus`, so two concurrent saves are serialized and exactly one of them
 * enters the new status. The one-time messages an entry triggers — the approval notification and
 * email, the rejection email — go out only when this answers true; a re-save sends nothing.
 *
 * `priorStatus` absent (a caller or double that does not report it) reads as "entered": the
 * pre-#905 behaviour, never a silent suppression of a real first approval.
 */
export interface FormStatusWriteResult {
  priorStatus?: string | null;
}

export function enteredStatus(row: FormStatusWriteResult, status: string): boolean {
  if (row.priorStatus === undefined) return true;
  return row.priorStatus !== status;
}
