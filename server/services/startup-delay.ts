/**
 * jitteredStartupDelay — boot-herd mitigation (scheduler-reliability lane #1712).
 *
 * On a cold Autoscale boot, the DB seeding pipeline and ~20 scheduler first-passes all contend for
 * the single 20-slot connection pool (`server/db.ts`, connectionTimeoutMillis 5000). When they
 * cluster in the first few minutes, an acquire waits past 5s and throws "timeout exceeded when
 * trying to connect" — the shared root cause of the four #1712 production sightings (earnings-release
 * timeout, auto-complete DB error, health-check 500 bursts, seed connection timeout).
 *
 * This does NOT resize or retune the pool (filed as the follow-on lane). It is the cheap, behavior-
 * preserving half: enforce a FLOOR of 60s so no scheduler fires during the boot window, and add up
 * to `STARTUP_DELAY_SPREAD_MS` of random jitter so the first passes fan out across time instead of
 * stampeding together. It only ever pushes a first pass LATER, never earlier, so no job's behavior
 * regresses — the recurring interval is unchanged.
 */
export const STARTUP_DELAY_FLOOR_MS = 60_000;
export const STARTUP_DELAY_SPREAD_MS = 60_000;

/**
 * Returns a first-pass delay of at least 60s, plus up to 60s of jitter. Pass the scheduler's own
 * intended first-run delay as `baseMs`; a delay already past the floor is preserved and only gains
 * jitter.
 */
export function jitteredStartupDelay(baseMs = 0): number {
  const floored = Math.max(STARTUP_DELAY_FLOOR_MS, baseMs);
  return floored + Math.floor(Math.random() * STARTUP_DELAY_SPREAD_MS);
}
