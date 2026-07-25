/**
 * Per-surface earnings clearance windows — escrow spine Phase 2 (docs/design/escrow-spine.md).
 *
 * An earning is born `held` with an `availableAt = created + window`. The earnings-release
 * scheduler flips `held → releasable` once `availableAt` has passed AND no dispute is open. This
 * module is the single source of the window per earning surface — CONFIG, not literals (each is
 * env-overridable). The pre-escrow single `EARNINGS_HOLD_DAYS` env stays honored as the bookings
 * default so existing deployments keep their tuned value.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function envDays(key: string, dflt: number): number {
  const v = parseInt(process.env[key] || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
}

// Bookings default (back-compat env). Also the fallback for any unmapped surface.
const DEFAULT_WINDOW_DAYS = envDays('EARNINGS_HOLD_DAYS', 7);

// Surface (earning `type`/`sourceType`) → hold window in days. All env-overridable.
const EARNINGS_HOLD_WINDOWS: Record<string, number> = {
  booking:              DEFAULT_WINDOW_DAYS,
  service_booking:      DEFAULT_WINDOW_DAYS,
  consulting:           DEFAULT_WINDOW_DAYS,
  optimization_fee:     envDays('EARNINGS_HOLD_DAYS_OPTIMIZATION', DEFAULT_WINDOW_DAYS),
  template_sale:        envDays('EARNINGS_HOLD_DAYS_TEMPLATE', 14),   // digital good — longer chargeback tail
  template_commission:  envDays('EARNINGS_HOLD_DAYS_TEMPLATE', 14),
  affiliate_commission: envDays('EARNINGS_HOLD_DAYS_AFFILIATE', DEFAULT_WINDOW_DAYS),
  // D7 (ready-made, ratified 2026-07-25): 7-day escrow window; the admin stale-content refund is
  // grantable only while the earning is still in escrow — after release, no refund.
  ready_made_sale:      envDays('EARNINGS_HOLD_DAYS_READY_MADE', 7),
  tip:                  envDays('EARNINGS_HOLD_DAYS_TIP', 0),         // clears immediately
  referral_bonus:       envDays('EARNINGS_HOLD_DAYS_REFERRAL', 0),    // platform-funded bonus — no chargeback risk
};

/** Hold window (days) for an earning surface; falls back to the bookings default. */
export function holdWindowDays(surface?: string | null): number {
  if (surface && Object.prototype.hasOwnProperty.call(EARNINGS_HOLD_WINDOWS, surface)) {
    return EARNINGS_HOLD_WINDOWS[surface];
  }
  return DEFAULT_WINDOW_DAYS;
}

/** availableAt = `from` + the surface's hold window. A 0-day window returns `from` (immediately releasable). */
export function availableAtFor(surface?: string | null, from?: Date): Date {
  const base = from ?? new Date();
  return new Date(base.getTime() + holdWindowDays(surface) * DAY_MS);
}
