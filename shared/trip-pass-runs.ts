/**
 * R-ac cap (surface spec v1.3.4 §15 option (a); step 6 — ledger `2026-10-04-step6-trip-card`). Pure:
 * a Trip Pass covers a FULL optimizer run while fewer than the cap have been covered on its trip;
 * the next is a paid run, whose fee the existing gate states. Re-times are not runs.
 */
export function passCoversRun(used: number, cap: number): boolean {
  return Number.isFinite(used) && used < cap;
}

export function passRunsLeft(used: number, cap: number): number {
  return Number.isFinite(used) ? Math.max(0, cap - used) : 0;
}
