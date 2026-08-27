import type { FeedItem } from "./feed-stream";

/**
 * The compact Bento action grammar is intentionally decided from the composed
 * item, never from its visual position or card-specific styling.
 */
export type BentoCompactActionState = "platform" | "affiliate" | "not-bookable";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function hasValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function isAffiliateSource(data: Record<string, unknown>): boolean {
  return data.sourceType === "affiliate" || data.resolutionClass === "affiliate";
}

function hasPlatformRail(data: Record<string, unknown>): boolean {
  const bookingMode = String(data.bookingMode ?? "").trim().toLowerCase();
  return (
    ["native", "platform", "traveloure"].includes(bookingMode) ||
    hasValue(data.providerServiceId) ||
    hasValue(data.provider_service_id) ||
    (typeof data.platformBookingUrl === "string" && data.platformBookingUrl.startsWith("/"))
  );
}

/**
 * Resolve the only three standard compact action states described by
 * BENTO_ASSEMBLY §4. Cards may have a specialized single action (for example a
 * ready-made or external tile), but any compact two-button row must consume
 * this value rather than determine its own colors.
 */
export function resolveBentoCompactActionState(item: FeedItem): BentoCompactActionState {
  const data = record(item.data);
  const candidate = record(data.candidate);
  const actionData = Object.keys(candidate).length > 0 ? candidate : data;

  // Gems only expose a platform booking rail on the compact feed. Historical
  // stored partner URLs are deliberately not rendered on their card face.
  if (item.kind === "loose-gem") {
    return hasPlatformRail(actionData) ? "platform" : "not-bookable";
  }

  if (isAffiliateSource(actionData)) return "affiliate";

  if (item.kind === "vendor-service") return "platform";
  if (item.kind === "recommendation" && actionData.sourceType === "platform_provider") {
    return "platform";
  }
  if (item.kind === "external-stub" && actionData.resolutionClass === "provider" && hasValue(actionData.resolutionRef)) {
    return "platform";
  }
  if (hasPlatformRail(actionData)) return "platform";

  return "not-bookable";
}