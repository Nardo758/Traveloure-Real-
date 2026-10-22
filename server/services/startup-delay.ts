/**
 * jitteredStartupDelay — boot-herd mitigation (scheduler-reliability lane #1712).
 *
 * On a cold Autoscale boot, the DB seeding pipeline and the scheduler first-passes all want
 * connections while Neon may still be waking. The pool settings that tolerate that wake-up live
 * in `server/db-pool-config.ts` (longer connect timeout, keepalive, a separate small background
 * pool). This delay is the other half: a FLOOR of 60s so no scheduler fires during the boot
 * window, plus up to `STARTUP_DELAY_SPREAD_MS` of jitter so the first passes fan out instead of
 * stampeding. It only ever pushes a first pass LATER, never earlier — the recurring interval is
 * unchanged.
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
