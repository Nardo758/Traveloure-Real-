/**
 * Console Realign Lane E4 (R-G) — single source of truth for notification-type icon +
 * deep-link resolution. Replaces three previously-divergent copies:
 *  - client/src/pages/inbox.tsx (13-type map: message/new_chat/message_received/ai/reminder/
 *    credits/booking_request/booking_created/booking_confirmed/visa_status_update/
 *    itinerary_update/itinerary_shared/expert_suggestion)
 *  - client/src/pages/notifications.tsx (now retired to a redirect — its 6-type map + default
 *    was a subset of the above, minus visa_status_update, itinerary_update/itinerary_shared,
 *    and expert_suggestion)
 *  - client/src/components/notification-bell.tsx (6-type map: booking_created/booking_confirmed/
 *    booking_completed/message_received/review_received/contract_created — only
 *    message_received overlapped with the other two)
 *
 * Real union = 16 types (the brief's "~13" was an approximation from a partial audit; this is
 * the ground-truthed superset). Where maps disagreed on a type's icon (booking_created was
 * Briefcase in inbox.tsx but ShoppingCart in the bell; booking_confirmed was Briefcase vs Check),
 * the whole booking_* family is unified on Briefcase — one consistent "something about a
 * booking happened" glyph rather than a per-status icon, matching inbox.tsx's existing grouping.
 *
 * Unknown/new type -> Bell, never a crash, never invented (CLAUDE.md §13).
 */
import {
  Bell,
  MessageSquare,
  Bot,
  Calendar,
  CreditCard,
  Briefcase,
  Plane,
  FileText,
  Star,
  type LucideIcon,
} from "lucide-react";

export const NOTIFICATION_TYPE_ICONS: Record<string, LucideIcon> = {
  message: MessageSquare,
  new_chat: MessageSquare,
  message_received: MessageSquare,
  ai: Bot,
  reminder: Calendar,
  credits: CreditCard,
  booking_request: Briefcase,
  booking_created: Briefcase,
  booking_confirmed: Briefcase,
  booking_completed: Briefcase,
  review_received: Star,
  contract_created: FileText,
  visa_status_update: Plane,
  itinerary_update: FileText,
  itinerary_shared: FileText,
  expert_suggestion: FileText,
};

export function getNotificationIcon(type: string): LucideIcon {
  return NOTIFICATION_TYPE_ICONS[type] || Bell;
}

/**
 * Shape shared by every surface that reads GET /api/notifications (bell, Inbox Updates tab).
 * `data` is the notifications table's jsonb payload column (shared/schema.ts:1006) — an
 * arbitrary-shape bag; the fields below are the ones any real writer populates.
 */
export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedId?: string | null;
  relatedType?: string | null;
  data?: {
    tripId?: string;
    workspacePath?: string;
    itemId?: string;
    clientId?: string;
    bookingId?: string;
    [key: string]: unknown;
  } | null;
}

export interface ResolvedNotificationLink {
  href: string;
  label: string;
}

/**
 * Deep-link resolution — the single implementation (was duplicated across inbox.tsx and
 * notifications.tsx with the same priority chain: tripId branch first, then
 * message_received/clientId, else no action).
 *
 * R-E: traveler-facing itinerary links (workspacePath starting "/trip/") resolve to the slip
 * (/plans/:tripId), anchored to the changed item when the notification carries one (Lane E2's
 * repoint, preserved). Expert workspacePath links (/expert/workspace/...) and other shapes
 * (e.g. /itinerary-view/) are left untouched.
 */
export function resolveNotificationLink(n: ApiNotification): ResolvedNotificationLink | null {
  if (n.data?.tripId) {
    const isTravelerTripLink = n.data.workspacePath?.startsWith("/trip/");
    const itemId = typeof n.data.itemId === "string" ? n.data.itemId : undefined;
    const href = isTravelerTripLink
      ? itemId
        ? `/plans/${n.data.tripId}?item=${itemId}`
        : `/plans/${n.data.tripId}`
      : n.data.workspacePath || `/expert/workspace/${n.data.tripId}`;
    return {
      href,
      label:
        isTravelerTripLink || n.data.workspacePath?.startsWith("/itinerary-view/")
          ? "View Itinerary"
          : "Open",
    };
  }
  if (n.type === "message_received") {
    return { href: n.data?.clientId ? `/chat?clientId=${n.data.clientId}` : "/chat", label: "Open Chat" };
  }
  return null;
}
