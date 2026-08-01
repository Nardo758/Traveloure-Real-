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
