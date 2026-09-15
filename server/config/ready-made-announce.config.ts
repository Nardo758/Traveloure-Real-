/**
 * THE READY-MADE ANNOUNCE GRACE — how long a DELIVERED purchase may carry no announcement marker
 * before §17's drift job hands it back to the one shared notifier.
 *
 * Ruling 2026-09-15, punchlist **D-18** = option A; ledger `2026-09-15-d18-announced-marker`.
 *
 * CONFIG, NOT A LITERAL, and the `completion-windows.config.ts` / `earnings-hold.config.ts`
 * posture is why: this is a LIVENESS window an operator must be able to move without a code
 * change, exactly like `BOOKING_AUTO_COMPLETE_DAYS_ARTIFACT` and `EARNINGS_HOLD_DAYS`. §8 is
 * untouched — nothing here is a fee, a rate, a margin or a multiplier; it decides WHEN a detector
 * is entitled to say a buyer was never told, and it multiplies no money at all.
 *
 * WHY MINUTES AND NOT DAYS. The two windows on this rail measure different things and must not
 * collapse into one number (§18 rule 1 would then have nothing to keep them apart). The
 * FULFILMENT grace (`READY_MADE_FULFILMENT_GRACE_MS` in the job) covers the milliseconds between
 * the confirm INSERT and the fulfil that follows it in the same request. THIS one covers the gap
 * between a purchase being delivered and its buyer being told, which is a gap a human feels: a
 * buyer who paid and heard nothing is waiting NOW, so a day-long window would be a detector that
 * arrives after the complaint. The default sits comfortably past the fulfilment grace so the two
 * classifications can never both fire on the same freshly-minted row.
 *
 * §13 — THE WINDOW IS A CLAIM ABOUT WHAT WE KNOW, NOT ABOUT WHAT HAPPENED. Inside it a NULL
 * marker means "the announcement may still be in flight"; past it, it means "nothing on disk says
 * this buyer was told". Neither reading is ever "the buyer was not told" — the notifier's own
 * dedupe key is what distinguishes those, and that is why the recovery path RE-DRIVES the shared
 * sender rather than assuming a send is owed.
 */

/**
 * The `envDays` shape one unit down (`completion-windows.config.ts`). A non-numeric or negative
 * value falls back to the default rather than disabling the window — an unparseable env var must
 * never silently turn a detector off.
 */
function envMinutes(key: string, dflt: number): number {
  const v = parseInt(process.env[key] || "", 10);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}

/** Default 60 minutes: four times the fulfilment grace, and well inside the same calendar day. */
export const READY_MADE_ANNOUNCE_GRACE_MINUTES = envMinutes("READY_MADE_ANNOUNCE_GRACE_MINUTES", 60);

export const READY_MADE_ANNOUNCE_GRACE_MS = READY_MADE_ANNOUNCE_GRACE_MINUTES * 60 * 1000;
