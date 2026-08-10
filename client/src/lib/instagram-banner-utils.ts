/**
 * instagram-banner-utils.ts
 *
 * View-model helpers for the Instagram connection banner in Content Studio.
 * Extracted from content-studio.tsx so the banner's display logic can be
 * unit-tested against real production code rather than copied snippets.
 *
 * Any change to the banner JSX in content-studio.tsx must be reflected here.
 */

export type InstagramDisconnectReason =
  | "personal_account"
  | "token_expired"
  | "auth_error"
  | "verification_error"
  | undefined;

export type InstagramStatus =
  | { connected: true; accountType?: string }
  | { connected: false; reason?: InstagramDisconnectReason };

/**
 * Whether the Instagram connection banner should be rendered.
 * Mirrors: `!instagramStatusLoading && !isInstagramConnected`
 */
export function shouldShowInstagramBanner(
  status: InstagramStatus | undefined,
  loading: boolean,
): boolean {
  if (loading) return false;
  if (!status) return true; // status not yet fetched after load resolves — treat as disconnected
  return !status.connected;
}

/**
 * Heading text for the banner.
 * Mirrors the three-branch conditional in the banner JSX.
 */
export function getInstagramBannerHeading(reason: InstagramDisconnectReason): string {
  if (reason === "personal_account") return "Business or Creator account required";
  if (reason === "token_expired") return "Instagram session expired";
  return "Connect your Instagram account";
}

/**
 * CTA button label for the banner.
 * Mirrors: `instagramDisconnectReason === "token_expired" ? "Reconnect Instagram" : ...`
 */
export function getInstagramBannerButtonLabel(reason: InstagramDisconnectReason): string {
  if (reason === "token_expired") return "Reconnect Instagram";
  if (reason === "personal_account") return "Reconnect with Business Account";
  return "Connect Instagram";
}

/**
 * Whether the banner should use amber styling (personal_account warning variant).
 * Mirrors: `instagramDisconnectReason === "personal_account" ? "border-amber-300 ..." : "border-pink-200 ..."`
 */
export function isInstagramBannerAmberVariant(reason: InstagramDisconnectReason): boolean {
  return reason === "personal_account";
}
