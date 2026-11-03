/**
 * CB-1 (ledger `2026-11-03-cb1-analytics-consent-banner`): the analytics consent banner. Mounted once in App,
 * beside `Ga4PageViews`. It renders nothing unless the GA4 tag is loaded, no choice is stored, the browser's
 * time zone is one that shows the banner (`lib/analytics-consent.ts`) and the page is a traveler surface.
 *
 * Allow grants and No thanks denies analytics through `lib/ga4.ts` (never gtag directly), and the choice is
 * stored on the device. There is deliberately no close button: a banner dismissed without a choice would
 * come back on every load, so the only ways out are the two choices.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  denyAnalyticsConsent,
  grantAnalyticsConsent,
  isGa4Loaded,
  isTravelerSurface,
} from "@/lib/ga4";
import {
  readStoredConsent,
  shouldShowConsentBanner,
  storeConsent,
  type AnalyticsConsentChoice,
} from "@/lib/analytics-consent";
import { ANALYTICS_CONSENT_COPY } from "@/lib/analytics-consent-copy";

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Pure. Should the banner render on this path? */
export function consentBannerVisible(input: {
  location: string;
  gaLoaded: boolean;
  stored: AnalyticsConsentChoice | null;
  timeZone: string | null | undefined;
}): boolean {
  return isTravelerSurface(input.location) && shouldShowConsentBanner(input);
}

/** The visitor's choice: tell the tag, then store it (a failed store still applies for the session). */
export function applyConsentChoice(
  choice: AnalyticsConsentChoice,
  storage: Pick<Storage, "setItem"> | null | undefined,
): boolean {
  if (choice === "granted") grantAnalyticsConsent();
  else denyAnalyticsConsent();
  return storeConsent(storage, choice);
}

export function AnalyticsConsentBannerView(props: { onAllow: () => void; onDecline: () => void }) {
  const copy = ANALYTICS_CONSENT_COPY;
  return (
    <div
      role="dialog"
      aria-label={copy.ariaLabel}
      data-testid="analytics-consent-banner"
      className="fixed inset-x-0 bottom-0 z-[60] border-t bg-background px-4 py-3 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          {copy.body}{" "}
          <Link href="/privacy" className="text-primary underline" data-testid="analytics-consent-privacy">
            {copy.privacyLink}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={props.onDecline} data-testid="analytics-consent-decline">
            {copy.decline}
          </Button>
          <Button size="sm" onClick={props.onAllow} data-testid="analytics-consent-allow">
            {copy.allow}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsConsentBanner() {
  const [location] = useLocation();
  const [chosen, setChosen] = useState<AnalyticsConsentChoice | null>(null);
  const stored = chosen ?? readStoredConsent(browserStorage());
  if (!consentBannerVisible({ location, gaLoaded: isGa4Loaded(), stored, timeZone: browserTimeZone() })) return null;
  const choose = (choice: AnalyticsConsentChoice) => {
    applyConsentChoice(choice, browserStorage());
    setChosen(choice);
  };
  return <AnalyticsConsentBannerView onAllow={() => choose("granted")} onDecline={() => choose("denied")} />;
}
