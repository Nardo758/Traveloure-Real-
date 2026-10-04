/**
 * R-ac cap (surface spec v1.3.4 §15, option (a); step 6 brief — ledger `2026-10-04-step6-trip-card`):
 * how many FULL Optimize runs one Trip Pass covers on its trip. Deployment config by name
 * (`TRIP_PASS_RUNS_PER_TRIP`, default 5). Past it the run states the band fee and routes into a
 * paid run. Re-times are not runs and are not counted here.
 */
export function tripPassRunsPerTrip(): number {
  const raw = Number(process.env.TRIP_PASS_RUNS_PER_TRIP);
  return Number.isInteger(raw) && raw >= 0 ? raw : 5;
}
