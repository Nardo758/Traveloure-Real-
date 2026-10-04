/**
 * R-ac (surface step 5; ledger `2026-10-04-surface-step5-map-versions`): how many FREE day re-times
 * a version allows within 24 h of the paid run. Admin-configurable through deployment config
 * (`OPTIMIZER_FREE_RETIMES`, default 3). Past it, a re-time is a paid run and the UI says so before
 * it happens.
 */
export function optimizerFreeRetimes(): number {
  const raw = Number(process.env.OPTIMIZER_FREE_RETIMES);
  return Number.isInteger(raw) && raw >= 0 ? raw : 3;
}
