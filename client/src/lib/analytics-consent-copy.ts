/**
 * CB-1: the traveler-facing analytics consent copy. Wording approved — Leon (Nov 6, 2026), with the privacy
 * policy §11 text, which lives inline in `pages/privacy.tsx` with the rest of the policy.
 */

/** The banner (`components/AnalyticsConsentBanner.tsx`). */
export const ANALYTICS_CONSENT_COPY = {
  body: "We'd like to use analytics cookies to see which pages get used. Nothing from your plan is included.",
  allow: "Allow",
  decline: "No thanks",
  privacyLink: "Privacy policy",
  ariaLabel: "Analytics cookies",
} as const;

