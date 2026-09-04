/**
 * trip-timezone.ts — the ONE place a plan's IANA timezone is derived.
 * Ledger `2026-09-04-plan-mint`, CLAUDE.md entry 30.
 *
 * ── WHAT THIS IS, AND WHAT IT IS DELIBERATELY NOT ───────────────────────────────────────────
 * This is a **LAUNCH-MARKET LOOKUP, NOT A GEOCODER.** It answers one question — "of the markets
 * this platform actually operates in, which one is this destination, and what zone is it in?" —
 * by reusing the two pieces of config that already exist for exactly those markets:
 *   • `resolveMarketSlug` (strict exact-match on the destination's city segment, NULL otherwise)
 *   • `MARKET_TIMEZONES`  (the IANA id per market slug)
 * It makes **no network call**, has **no third-party dependency**, and — per §13's "no hardcoded
 * city lists" rule — introduces **no second city list**: growing the set of resolvable zones means
 * adding a market to `shared/operating-markets.ts` + `MARKET_TIMEZONES`, which is where markets are
 * added anyway.
 *
 * ── WHY NOT `timezoneForMarket()` ───────────────────────────────────────────────────────────
 * That helper answers `"UTC"` for an unknown/unmapped market, which is the right answer for the
 * demand rollup (it needs SOME grain to bucket a day by, and says so honestly at the rollup). It
 * is the WRONG answer for a plan: a stored `"UTC"` is a CLAIM that this plan's 16:00 means 16:00
 * in London, and every downstream reader — the .ics export above all — would treat it as one. So
 * this function returns `null` where that one returns `"UTC"`.
 *
 * ── NULL IS A FINISHED ANSWER (§13) ─────────────────────────────────────────────────────────
 * `null` means "not captured". Readers keep their pre-existing zone-free behaviour and say why;
 * nobody substitutes UTC, the server's zone, or the nearest-looking market. A wrong zone is worse
 * than an honestly absent one because it looks authoritative.
 */
import { MARKET_TIMEZONES, resolveMarketSlug } from "./trend-engine/operating-markets";

/**
 * The IANA timezone for a free-text trip destination, or `null` when the destination resolves to
 * none of the operating markets (which is every destination outside them — never a nearest guess).
 */
export function resolveTripTimezone(destination: string | null | undefined): string | null {
  const slug = resolveMarketSlug(destination);
  if (!slug) return null;
  return MARKET_TIMEZONES[slug] ?? null;
}

/**
 * Is this string an IANA zone this runtime can actually resolve? Used by readers before they act
 * on a stored value: the column has NO DB CHECK (publish-trap posture), so a row could carry a
 * value this Node build's ICU data does not know, and the honest response to that is the same as
 * NULL's — fall back to the zone-free behaviour, never to a substitute zone.
 */
export function isUsableTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
