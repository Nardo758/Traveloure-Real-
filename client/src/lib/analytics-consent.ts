/**
 * CB-1 (ledger `2026-11-03-cb1-analytics-consent-banner`): the analytics consent choice. Pure, no DOM.
 *
 * The banner is only the grant/deny path. Google's Consent Mode region default in `lib/ga4.ts`
 * (`GA4_DENIED_REGIONS`) stays the legal default: analytics is denied in the EEA, UK and CH until a visitor
 * chooses Allow, and granted elsewhere until a visitor chooses No thanks.
 *
 * REGION SIGNAL, AND ITS TRADE-OFF: the browser's time zone is the only region signal the client has (there
 * is no geo header on Replit), and no geo lookup or network call is made. An over-match (Europe/Istanbul,
 * Europe/Moscow) shows a harmless banner; an under-match (a European visitor whose device reports another
 * zone) sees no banner and stays at Google's regional default, which in the EEA is denied — never the
 * other way round.
 */

export const ANALYTICS_CONSENT_KEY = "tl.analytics-consent";
export type AnalyticsConsentChoice = "granted" | "denied";

/** Zones that show the banner: every Europe/* zone, plus the Atlantic islands of EEA/EFTA states. */
export const CONSENT_BANNER_TZ_PREFIXES = ["Europe/"] as const;
export const CONSENT_BANNER_TZ_EXACT = [
  "Atlantic/Reykjavik",
  "Atlantic/Canary",
  "Atlantic/Madeira",
  "Atlantic/Azores",
  "Atlantic/Faroe",
] as const;

/** The stored choice, or null. A storage that is absent or throws (private mode, blocked) reads as null. */
export function readStoredConsent(storage?: Pick<Storage, "getItem"> | null): AnalyticsConsentChoice | null {
  try {
    const v = storage?.getItem(ANALYTICS_CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/** Store the choice. False when storage is absent or throws — the banner still works for the session. */
export function storeConsent(storage: Pick<Storage, "setItem"> | null | undefined, value: AnalyticsConsentChoice): boolean {
  try {
    if (!storage) return false;
    storage.setItem(ANALYTICS_CONSENT_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/** Is this time zone one that shows the banner? An unknown zone does not. */
export function isConsentBannerTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  return (
    CONSENT_BANNER_TZ_PREFIXES.some((p) => timeZone.startsWith(p)) ||
    (CONSENT_BANNER_TZ_EXACT as readonly string[]).includes(timeZone)
  );
}

/** The tag is loaded, no choice is stored, and the zone is one that shows the banner. */
export function shouldShowConsentBanner(input: {
  gaLoaded: boolean;
  stored: AnalyticsConsentChoice | null;
  timeZone: string | null | undefined;
}): boolean {
  return input.gaLoaded && input.stored === null && isConsentBannerTimeZone(input.timeZone);
}
