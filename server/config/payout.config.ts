/**
 * Payout floor — single source (MONEY_MAP F-7).
 *
 * The $10 minimum payout amount was duplicated as three separate literals
 * (server/routes/admin.routes.ts ×2, server/routes/payments.routes.ts ×1). Consolidated here so
 * all three sites can't silently drift out of sync.
 *
 * fee-literal-ok: single source, admin-configurable is a filed follow-up — today this is a code
 * constant (not a `fee_bands` row) below Stripe's own transfer-fee economics, not a business rate;
 * making it admin-editable via `fee_bands` is filed, not done here.
 */
export const MIN_PAYOUT_CENTS = 1000; // $10.00 — below this Stripe transfer fees consume too much

/** MIN_PAYOUT_CENTS expressed in whole dollars (10). */
export const MIN_PAYOUT_DOLLARS = MIN_PAYOUT_CENTS / 100;

/**
 * EFFECTIVE payout threshold = max(platform floor, the earner's own configured minimum).
 * Ledger 90 (FP-5, S2).
 *
 * The console offered a "Minimum Payout Amount $" control on Settings which persisted perfectly
 * to `provider_settings.minimum_payout_amount` and was consulted by NOTHING: the Money page gated
 * on a hardcoded `stats.available < 10` and the server on `MIN_PAYOUT_CENTS` alone. A provider who
 * set 250 to batch their payouts was offered a payout at 10 and never learned why.
 *
 * The rule, in one place, in both directions:
 *   • the PLATFORM FLOOR IS NEVER LOWERED — a user preference below $10 is inert, because the
 *     floor exists for Stripe's transfer economics, not for the earner's convenience;
 *   • a STRICTER user preference IS honoured — it is their own money and their own batching call.
 *
 * §14: `userMinimumDollars` is read SERVER-SIDE from the earner's own settings row and is never
 * accepted from a request body. A NULL/absent/garbage/negative value degrades to the floor — the
 * safe failure mode for a threshold (the same posture `resolveCoordinationFee` takes on an absent
 * `fee_bands` row, §8).
 */
export function effectivePayoutMinimumCents(
  userMinimumDollars: string | number | null | undefined,
): number {
  const parsed =
    typeof userMinimumDollars === "number" ? userMinimumDollars : parseFloat(String(userMinimumDollars ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return MIN_PAYOUT_CENTS;
  return Math.max(MIN_PAYOUT_CENTS, Math.round(parsed * 100));
}
