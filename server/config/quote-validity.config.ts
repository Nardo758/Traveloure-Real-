/**
 * QUOTE VALIDITY — the window a custom quote stands for, as CONFIG rather than literals.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-29, option A; ledger
 * `2026-09-15-d28-d31-service-quotes`). The `completion-windows.config.ts` posture: these are DAY
 * COUNTS, not fees, rates or amounts — nothing here multiplies money, it only decides how long an
 * offer stays acceptable — so §8's `fee_bands` rule does not bind them, but its "no literal in a
 * route" half does. A route never writes a number of days; it calls these accessors.
 *
 * TWO VALUES, ONE PLATFORM-WIDE:
 *   · `QUOTE_VALIDITY_DAYS` — the DEFAULT applied when the provider states no window (default 7).
 *   · `QUOTE_VALIDITY_CEILING_DAYS` — the CEILING a provider's own choice may not exceed
 *     (default 30). The ruling makes it ONE platform value, deliberately not per listing: a
 *     per-listing ceiling is a second authority for the same rule.
 *
 * A provider's choice ABOVE the ceiling is REFUSED with the ceiling STATED — never silently clamped
 * (§13: a clamped answer presented as the provider's own is a claim they did not make). A default
 * an operator has set above the ceiling is the operator's contradiction and is resolved toward the
 * ceiling here (the ceiling is the rule; the default is a convenience under it).
 *
 * Read at CALL time, not at module load, so an operator's env change and a test's env change both
 * take effect without a restart of this module.
 */

export const QUOTE_VALIDITY_DAYS_ENV = "QUOTE_VALIDITY_DAYS";
export const QUOTE_VALIDITY_CEILING_DAYS_ENV = "QUOTE_VALIDITY_CEILING_DAYS";

const DEFAULT_QUOTE_VALIDITY_DAYS = 7;
const DEFAULT_QUOTE_VALIDITY_CEILING_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A positive integer day count from the environment, else the default. Zero is not a window. */
function envPositiveDays(key: string, dflt: number): number {
  const v = parseInt(process.env[key] || "", 10);
  return Number.isFinite(v) && v >= 1 ? v : dflt;
}

/** The platform ceiling on any quote's validity, in days. */
export function quoteValidityCeilingDays(): number {
  return envPositiveDays(QUOTE_VALIDITY_CEILING_DAYS_ENV, DEFAULT_QUOTE_VALIDITY_CEILING_DAYS);
}

/** The default validity applied when the provider states none, never above the ceiling. */
export function quoteValidityDays(): number {
  return Math.min(
    envPositiveDays(QUOTE_VALIDITY_DAYS_ENV, DEFAULT_QUOTE_VALIDITY_DAYS),
    quoteValidityCeilingDays(),
  );
}

export type QuoteValidityResolution =
  | { ok: true; days: number; source: "provider_choice" | "config_default" }
  | {
      ok: false;
      reason: "exceeds_ceiling" | "not_a_positive_day_count";
      requestedDays: number;
      ceilingDays: number;
    };

/**
 * Resolve the validity for ONE quote from the provider's optional choice.
 *   · absent / null  ⇒ the config default, and the answer SAYS it was the default (§13);
 *   · a positive integer ≤ ceiling ⇒ the provider's choice;
 *   · above the ceiling ⇒ REFUSED, with `ceilingDays` stated so the caller can say the number;
 *   · not a positive integer ⇒ REFUSED (a zero- or negative-day quote is not a quote).
 * PURE: no clock, no db, no logging.
 */
export function resolveQuoteValidityDays(requested?: number | null): QuoteValidityResolution {
  const ceilingDays = quoteValidityCeilingDays();
  if (requested === undefined || requested === null) {
    return { ok: true, days: quoteValidityDays(), source: "config_default" };
  }
  if (!Number.isInteger(requested) || requested < 1) {
    return { ok: false, reason: "not_a_positive_day_count", requestedDays: requested, ceilingDays };
  }
  if (requested > ceilingDays) {
    return { ok: false, reason: "exceeds_ceiling", requestedDays: requested, ceilingDays };
  }
  return { ok: true, days: requested, source: "provider_choice" };
}

/** `from` + `days`. The issue rail derives `expires_at` here and nowhere else. */
export function quoteExpiresAt(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
