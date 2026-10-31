/**
 * Four one-string copy changes (ledger `2026-10-31-four-copy-strings`). Each string is the approved
 * wording, held once here and read by the surfaces that show it.
 */

/** "Sign up as a provider" and the provider sign-up door it opens. */
export const PROVIDER_SIGNUP_COPY = {
  label: "Sign up as a provider",
  href: "/signup?intent=supply&supplyRole=provider",
} as const;

/** The Discover page's market headline: "Discover ‹Market›". */
export const DISCOVER_HEADLINE_COPY = {
  forMarket: (market: string): string => `Discover ${market}`,
} as const;

/** The comparison board's add toast. */
export const COMPARISON_ADD_TOAST_COPY = {
  added: "Added. Your other stops are unchanged.",
} as const;
