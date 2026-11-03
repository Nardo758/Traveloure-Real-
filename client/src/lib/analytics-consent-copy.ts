/**
 * CB-1: the traveler-facing analytics consent copy. HELD for owner approval ("Wording approved — Leon" on
 * the PR); one edit here flips the banner when the wording is ruled. The privacy policy §11 text (also held)
 * lives inline in `pages/privacy.tsx` with the rest of the policy.
 */

/** The banner (`components/AnalyticsConsentBanner.tsx`). */
export const ANALYTICS_CONSENT_COPY = {
  body: "We'd like to use analytics cookies to see which pages get used. Nothing from your plan is included.",
  allow: "Allow",
  decline: "No thanks",
  privacyLink: "Privacy policy",
  ariaLabel: "Analytics cookies",
} as const;

