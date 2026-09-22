/**
 * `service_bookings` REALIZED-MONEY status set — one home, §18 rule 1.
 *
 * Moved here from `server/routes/demand.routes.ts` (ledger
 * `2026-09-22-denorm-counters-are-display-only`) when a SECOND reader appeared in
 * `server/services/admin-query.service.ts`. A service reaching into a route module for a shared
 * constant is backwards — the route is the higher layer — so the list lives in a leaf module that
 * neither side owns and both import. ONE definition (§18 rule 1); `demand.routes.ts` re-exports it
 * so its public surface is unchanged.
 *
 * Comment below is the original, moved verbatim rather than restated:
 *
 * Money-realized booking statuses that count toward the earner's benchmark revenue/bookings.
 * Matches the reconciliation job's PAID_EQUIVALENT_STATUSES (server/jobs/stripeReconciliation.ts)
 * verbatim — the codebase's canonical "this is realized money" set — so no new scope is invented
 * here. A `payment_pending`/`pending`/`cancelled`/`refunded` row is NOT realized revenue (§15b),
 * so it is excluded; `deposit_paid` is likewise excluded because its full `totalAmount` is not yet
 * collected (only the deposit is), and counting the full amount would overstate revenue (§13).
 */
export const BENCHMARK_REVENUE_STATUSES = ["confirmed", "in_progress", "completed", "delivered", "disputed"];
