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
  // Expert-request review/booking/full-concierge split (R6/R7, ratified Jul 30 2026): explicitly
  // pinned to the standard 7-day window — the decision-maker tied this to the 7-day refund/dispute
  // window on purpose (a held earning must not clear before the refund window closes). Previously
  // this surface had no explicit row and rode the bookings DEFAULT_WINDOW_DAYS fallback (same 7d
  // value, but undocumented as intentional); now a named, independently env-overridable key.
  expert_review_fee:    envDays('EARNINGS_HOLD_DAYS_EXPERT_REVIEW', DEFAULT_WINDOW_DAYS),
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

/**
 * CN-1f (ledger `2026-11-02-cn1f-concierge-payout-hold`; CN-1 OPEN (C), Leon: "Default unchanged; override by env only
 * (CONCIERGE_HOLD_DAYS)"). The concierge hold length: CONCIERGE_HOLD_DAYS when it is a whole number ≥ 0, else the
 * bookings default (`holdWindowDays('service_booking')`, i.e. EARNINGS_HOLD_DAYS). Unset = default — deliberately NOT the
 * "unset disables" shape CONCIERGE_ACCEPT_HOURS uses. Read at call time, so a deploy's env change applies to the next mint.
 */
export function conciergeHoldDays(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.CONCIERGE_HOLD_DAYS ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return holdWindowDays("service_booking");
}

/**
 * CN-1f: when a concierge earning becomes available. The hold starts at the LATER of the trip's end (the first instant
 * after its last day, in the trip's zone — `conciergeAccessUntil`) and the completion declaration (or now, when there is
 * none), then adds `conciergeHoldDays()`. With no usable trip end the anchor is the declaration (or now). Never null: a
 * NULL available_at is never released.
 */
export function conciergeAvailableAt(tripEnd: Date | null, declaredAt: Date | undefined, now: Date = new Date()): Date {
  const declared = declaredAt ?? now;
  const anchor = tripEnd && tripEnd.getTime() > declared.getTime() ? tripEnd : declared;
  return new Date(anchor.getTime() + conciergeHoldDays() * DAY_MS);
}
