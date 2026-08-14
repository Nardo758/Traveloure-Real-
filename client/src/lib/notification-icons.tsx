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
 * Where maps disagreed on a type's icon (booking_created was Briefcase in inbox.tsx but
 * ShoppingCart in the bell; booking_confirmed was Briefcase vs Check), the whole booking_*
 * family is unified on Briefcase — one consistent "something about a booking happened" glyph
 * rather than a per-status icon, matching inbox.tsx's existing grouping.
 *
 * Ground-truthed against real `storage.createNotification({ type: ... })` call sites
 * (grepped across server/), corrected Aug 3 2026 — the prior "ground-truthed superset" claim
 * above was wrong: a subsequent audit found 12 real server-written types with no map entry
 * (safe Bell fallback, but not honest coverage). Current status per entry:
 *  - LIVE WRITER (server actually creates this type today): new_chat, message_received,
 *    booking_request, booking_confirmed, visa_status_update, itinerary_update,
 *    itinerary_shared, expert_suggestion, trip_card_ready, expert_request, booking_cancelled,
 *    expert_inquiry, provider_verification_request, itinerary_item_added, contact_submission,
 *    application_approved, application_rejected, rejection_reason_updated,
 *    stripe_connect_reminder, payout_processed, ea_message.
 *  - LEGACY / NO CURRENT WRITER (kept for old rows a legacy client consumer may still hold —
 *    no live code path creates these anymore): message, ai, reminder, credits, booking_created,
 *    booking_completed, review_received, contract_created.
 *  - Anything else (unknown/future type) -> Bell, never a crash, never invented (CLAUDE.md §13).
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
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  DollarSign,
  Mail,
  type LucideIcon,
} from "lucide-react";

export const NOTIFICATION_TYPE_ICONS: Record<string, LucideIcon> = {
  // Legacy / no current writer (kept for old rows only — see header comment).
  message: MessageSquare,
  ai: Bot,
  reminder: Calendar,
  credits: CreditCard,
  booking_created: Briefcase,
  booking_completed: Briefcase,
  review_received: Star,
  contract_created: FileText,

  // Live writers.
  new_chat: MessageSquare,
  message_received: MessageSquare,
  ea_message: MessageSquare,
  contact_submission: Mail,
  booking_request: Briefcase,
  booking_confirmed: Briefcase,
  booking_cancelled: Briefcase,
  expert_request: Briefcase,
  expert_inquiry: MessageSquare,
  visa_status_update: Plane,
  itinerary_update: FileText,
  itinerary_shared: FileText,
  itinerary_item_added: FileText,
  expert_suggestion: FileText,
  provider_verification_request: ClipboardCheck,
  application_approved: CheckCircle2,
  application_rejected: XCircle,
  rejection_reason_updated: XCircle,
  stripe_connect_reminder: CreditCard,
  payout_processed: DollarSign,
  // R-F (Console Realign, Trip Card delivery): fired on Finalize and on the T-48h auto-nudge —
  // both mean "the Trip Card is ready to view".
  trip_card_ready: CheckCircle2,
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
    const isWorkspaceLink =
      !isTravelerTripLink &&
      !n.data.workspacePath?.startsWith("/itinerary-view/") &&
      href.startsWith("/expert/workspace/");
    return {
      href,
      label:
        isTravelerTripLink || n.data.workspacePath?.startsWith("/itinerary-view/")
          ? "View Itinerary"
          : isWorkspaceLink
            ? "Open Workspace"
            : "Open",
    };
  }
  if (n.type === "message_received") {
    return { href: n.data?.clientId ? `/chat?clientId=${n.data.clientId}` : "/chat", label: "Open Chat" };
  }
  return null;
}
