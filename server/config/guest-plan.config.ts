/**
 * GATE-1B (ledger `2026-11-04-gate1b-guest-plan`; architect ruling 4/6, Nov 4, 2026): the guest plan's limits and
 * retention, in ONE module. Handlers read these; no number is written in a handler.
 */

/** Ruling 4: guest plan creates per guest session per day, and per IP per hour; guest saves per session per hour. */
export const GUEST_PLAN_LIMITS = {
  createPerSession: { maxRequests: 5, windowMs: 24 * 60 * 60 * 1000 },
  createPerIp: { maxRequests: 20, windowMs: 60 * 60 * 1000 },
  savesPerSession: { maxRequests: 60, windowMs: 60 * 60 * 1000 },
} as const;

/** The longest guest-session id accepted in `X-Guest-Session` (the client mints a UUID). */
export const GUEST_SESSION_ID_MAX_LENGTH = 128;

/**
 * A-10 (ledger `2026-11-05-lane6-guest-cookie`): the guest cookie's lifetime, refreshed on every guest request — the
 * retention window when one is set (a plan idle longer is deleted anyway), else 30 days.
 */
export const GUEST_SESSION_COOKIE_DEFAULT_DAYS = 30;
export function guestSessionCookieMaxAgeMs(env: NodeJS.ProcessEnv = process.env): number {
  return (guestPlanRetentionDays(env) ?? GUEST_SESSION_COOKIE_DEFAULT_DAYS) * 24 * 60 * 60 * 1000;
}

/** Per retention pass, at most this many guest plans are deleted (the rest wait for the next pass). */
export const GUEST_PLAN_RETENTION_BATCH = 500;

/**
 * Ruling 6: `GUEST_PLAN_RETENTION_DAYS`, a whole number of days ≥ 1, counted from the plan's last change
 * (`trips.updated_at`, ruling 3). Unset or not a whole positive number ⇒ null: the retention job is disabled (it logs
 * and deletes nothing) and the privacy line says the plan is kept until sign-in.
 */
export function guestPlanRetentionDays(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.GUEST_PLAN_RETENTION_DAYS ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
