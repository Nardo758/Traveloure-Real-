/**
 * One warn per outage, then silence until a pass succeeds.
 *
 * The itinerary sweep runs every minute. Logging the connect timeout on every
 * tick is the burst production saw. The cooldown also stops the next ticks from
 * opening more connections while Neon is still waking.
 */
export const SWEEP_CONNECT_BACKOFF_MS = 60_000;

export class SweepConnectBackoff {
  private until = 0;
  private logged = false;

  isCoolingDown(now: number): boolean {
    return now < this.until;
  }

  /** @returns whether the caller should emit the single warning for this episode. */
  noteTimeout(now: number, backoffMs = SWEEP_CONNECT_BACKOFF_MS): boolean {
    const shouldLog = !this.logged;
    this.until = now + backoffMs;
    this.logged = true;
    return shouldLog;
  }

  noteSuccess(): void {
    this.until = 0;
    this.logged = false;
  }
}
