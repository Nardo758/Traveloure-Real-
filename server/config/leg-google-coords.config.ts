/**
 * R312 (ledger `2026-10-04-leg-google-coords-refresh`; R311 — LD 57 extends to transport_legs): a Google
 * coordinate on a leg is a CACHE that may live at most this many days from its fetch
 * (`coord_fetched_at`). Google's Places terms set the 30-day ceiling, so the env can only SHORTEN it.
 */
const GOOGLE_COORD_CEILING_DAYS = 30;

export function legGoogleCoordMaxAgeDays(): number {
  const n = Number(process.env.LEG_GOOGLE_COORD_MAX_AGE_DAYS);
  return Number.isFinite(n) && n > 0 && n <= GOOGLE_COORD_CEILING_DAYS ? n : GOOGLE_COORD_CEILING_DAYS;
}

/**
 * How far ahead of the ceiling the daily job refreshes. One day, so a once-a-day job reaches every
 * leg before it is a full max age old; a leg it could not refresh is cleared at the ceiling.
 */
export const LEG_GOOGLE_COORD_REFRESH_LEAD_DAYS = 1;
