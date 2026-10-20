/**
 * Paid Optimize failure refund — shared constants and the pure gate
 * (ledger `2026-10-20-optimize-paid-failure-refund`).
 *
 * A PaymentIntent authorizes another full run only when this comparison already
 * holds an optimized version and that payment has not been claimed for refund.
 * A run that ended with no optimized version is refunded instead.
 */

export const OPTIMIZER_RUN_REFUND_REASON = "optimizer_run_failed";
export const OPTIMIZER_RUN_REFUND_SOURCE = "optimizer_run_failed";

export type OptimizerFeeRefundState = "refunded" | "pending";

/** One Stripe idempotency key per PaymentIntent. A retry returns the same refund. */
export function optimizerRunRefundIdempotencyKey(paymentIntentId: string): string {
  return `optimizer-run-refund-${paymentIntentId}`;
}

/** Claim row in `refunds` before the Stripe call. Not a Stripe refund id. */
export function optimizerRunRefundPendingId(paymentIntentId: string): string {
  return `pending-optimizer-${paymentIntentId}`;
}

/**
 * Whether the payment already recorded on this comparison may start another run
 * without a new charge. Zero optimized versions means the traveler got nothing,
 * so the payment is refunded and does not authorize a retry.
 */
export function recordedPaymentCoversAnotherRun(
  aiOptimizedCount: number,
  refundState: OptimizerFeeRefundState | null,
): boolean {
  return aiOptimizedCount > 0 && refundState == null;
}
