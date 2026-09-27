/**
 * The versions of the Terms and the Privacy Policy that a user accepts (ledger
 * `2026-09-27-cancel-preview-equals-refund`). ONE home: the Terms page renders
 * `CURRENT_TERMS_VERSION` in its footer, and every server path that records an acceptance
 * (`POST /api/auth/accept-terms`, email registration) writes the same constant — so the
 * version stored on `users.terms_version` is the version the page displays (§18 rule 1).
 * Bump it only when the Terms text changes in a way that needs a new acceptance; editing the
 * page's footer without it is impossible, because the footer reads this.
 */
export const CURRENT_TERMS_VERSION = "1.1";
export const CURRENT_PRIVACY_VERSION = "1.0";
