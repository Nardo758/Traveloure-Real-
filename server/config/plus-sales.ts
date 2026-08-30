/**
 * plus-sales.ts — the PLUS_SALES_ENABLED gate (ledger 2026-08-27-plus-is-delivery).
 *
 * Plus does not go on sale until the delivery path proves out end-to-end (a scheduled draft fires
 * and notifies) AND the daily external trigger is wired. This flag, owned by the Plus-occasions
 * lane, gates the purchase surface: while OFF (the default), the "Join Plus" CTAs show a
 * coming-soon/waitlist state instead of routing to checkout. Flip it on only when those
 * prerequisites hold — see the PR's deploy prerequisites.
 *
 * Env-driven so ops can flip it per environment without a deploy of app code.
 */
export function isPlusSalesEnabled(): boolean {
  const v = (process.env.PLUS_SALES_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
