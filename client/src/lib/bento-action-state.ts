import type { FeedItem } from "./feed-stream";
import { addToPlanLabel, TILE_ACTION_COPY } from "./tile-action-copy";

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
/** What a card knows that changes its one primary action. Booking paths are still decided by the card. */
export interface TileActionContext {
  /** The feed is scoped to one day: the add label names it. */
  scheduledDate?: string | null;
  /** The card's book control is the one drawn (vendor-service, recommendation). */
  bookable?: boolean;
  /** The bookable control is a partner's (recommendation only; the partner path is unchanged). */
  affiliate?: boolean;
  /** The city has an expert who can take a question (expert, lead-expert). */
  canAsk?: boolean;
}

export interface TileAction {
  label: string;
  /** Set only where the destination is fixed by the kind itself; otherwise the card's handler runs. */
  href?: string;
}

/**
 * Row 302a: the label of a tile's one primary action, by kind. Returns null for a kind with no
 * primary action of its own (a neighbourhood container, a city separator) and for the partner
 * external stub, which stays on its own card until row 304a.
 */
export function tileActionLabel(kind: FeedItem["kind"], ctx: TileActionContext = {}): string | null {
  switch (kind) {
    case "loose-gem":
    case "event":
    case "supply-activity":
    // The hotel tile's click adds the stay to the plan, so it says so (architect, #1810).
    case "supply-hotel":
      return addToPlanLabel(ctx.scheduledDate);
    case "vendor-service":
      return ctx.bookable ? TILE_ACTION_COPY.checkAvailability : addToPlanLabel(ctx.scheduledDate);
    case "recommendation":
      if (!ctx.bookable) return addToPlanLabel(ctx.scheduledDate);
      return ctx.affiliate ? TILE_ACTION_COPY.bookOnPartner : TILE_ACTION_COPY.bookNow;
    case "package":
      return TILE_ACTION_COPY.getThisTrip;
    case "expert":
    case "lead-expert":
      return ctx.canAsk ? TILE_ACTION_COPY.askThisExpert : TILE_ACTION_COPY.viewProfile;
    case "wanted-slot":
    case "earn-card":
      return TILE_ACTION_COPY.apply;
    case "external-stub":
    case "neighborhood":
    case "city-separator":
      return null;
  }
}

/** Row 302a: a tile's one primary action. The ready-made href is the detail page, as before. */
export function tileAction(item: FeedItem, ctx: TileActionContext = {}): TileAction | null {
  const label = tileActionLabel(item.kind, ctx);
  if (label === null) return null;
  const data = record(item.data);
  if (item.kind === "package") {
    const id = hasValue(data.id) ? String(data.id) : item.id;
    return { label, href: `/ready-made/${id}` };
  }
  if (item.kind === "earn-card") return { label, href: "/earn" };
  return { label };
}
