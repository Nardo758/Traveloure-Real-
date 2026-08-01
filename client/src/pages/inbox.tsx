/**
 * Traveler Inbox — QA_PUNCH_LIST item 15 [DM] half (Lane W5-E).
 *
 * A unified aggregation surface (mirrors the earner console's Inbox concept —
 * client/src/pages/provider/inbox.tsx, client/src/pages/expert/inbox.tsx) with two tabs:
 *
 *  - Messages: the same conversation-threads grouping traveler-mode /chat gained in PR #363,
 *    now factored into the shared `useConversationThreads` hook (client/src/hooks/
 *    use-conversation-threads.ts) so this tab and chat.tsx read one implementation, not two.
 *  - Updates: the traveler's real notifications (GET /api/notifications — the exact query the
 *    bell/notifications.tsx page reads), reusing the same mark-as-read / mark-all-read
 *    mutations so state stays in sync with those existing surfaces.
 *
 * One-home rule: this page REFERENCES and deep-links into /chat and /notifications — it never
 * re-implements the chat pane or a notification action (accept/decline booking requests stays
 * on /notifications and the earner Inbox pages; this is a traveler surface).
 */
import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { useConversationThreads } from "@/hooks/use-conversation-threads";
import { useUnreadMessageCount } from "@/hooks/use-message-read";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import {
  Inbox as InboxIcon,
  MessageSquare,
  Bell,
  Calendar,
  CreditCard,
  Bot,
  Briefcase,
  Plane,
  FileText,
  Check,
  CheckCheck,
} from "lucide-react";

// ─── Messages tab ───────────────────────────────────────────────────────────

function MessagesTab() {
  const { threads, isLoading } = useConversationThreads();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <Card className="border-2 border-dashed border-border">
        <CardContent className="p-10 text-center" data-testid="empty-inbox-messages">
          <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No conversations yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Messages you exchange with an expert will show up here.
          </p>
          <Button variant="outline" asChild data-testid="button-empty-browse-experts">
            <Link href="/chat">Browse experts</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((thread) => (
        // The existing deep-link chat.tsx already resolves: ?expertId= selects the thread
        // directly (effectiveLinkedExpert), matching how a traveler reaches a conversation.
        <Link key={thread.counterpartId} href={`/chat?expertId=${thread.counterpartId}`}>
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            data-testid={`inbox-thread-${thread.counterpartId}`}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Avatar className="w-10 h-10 flex-shrink-0">
                <AvatarImage src={thread.avatarUrl ?? undefined} alt={thread.displayName ?? "Expert"} />
                <AvatarFallback>{(thread.displayName || "E")[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className={`text-foreground truncate ${thread.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>
                  {thread.displayName || "Expert"}
                </p>
                {thread.lastMessage && (
                  <p className="text-sm text-muted-foreground truncate">{thread.lastMessage}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {thread.lastMessageAt && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
                  </span>
                )}
                {/* W5-E: real per-thread unread count (readAt-derived, use-conversation-threads).
                    Clears once /chat marks the thread read. */}
                {thread.unreadCount > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center"
                    data-testid={`inbox-thread-unread-${thread.counterpartId}`}
                  >
                    {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// ─── Updates tab ─────────────────────────────────────────────────────────────
//
// Shape + endpoints verified against client/src/pages/notifications.tsx and
// client/src/components/notification-bell.tsx — both real, live surfaces this tab reuses
// rather than re-querying/re-deriving. `isRead` is a real column (server/storage.ts
// `createNotification`/notifications table); there is no separate "delivered" or
// per-recipient read-receipt concept in the schema, so unread state here is exactly the
// same boolean those two surfaces already render — nothing invented (§13).

interface ApiNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedId?: string;
  data?: {
    tripId?: string;
    workspacePath?: string;
    clientId?: string;
    [key: string]: unknown;
  };
}

const typeIcons: Record<string, typeof Bell> = {
  message: MessageSquare,
  new_chat: MessageSquare,
  message_received: MessageSquare,
  ai: Bot,
  reminder: Calendar,
  credits: CreditCard,
  booking_request: Briefcase,
  booking_created: Briefcase,
  booking_confirmed: Briefcase,
  visa_status_update: Plane,
  itinerary_update: FileText,
  itinerary_shared: FileText,
  expert_suggestion: FileText,
};

function getNotificationIcon(type: string) {
  return typeIcons[type] || Bell;
}

/**
 * Deep-link resolution — mirrors notifications.tsx's priority chain exactly (tripId branch
 * first, then message_received/clientId, else no action): tripId + workspacePath is how every
 * traveler-facing notification (itinerary_update, expert_suggestion, itinerary_shared) links
 * back to the traveler's own trip view; the `/expert/workspace/:id` fallback is dead for real
 * traveler rows (the server always sets workspacePath alongside tripId for this audience) but
 * kept for parity with the shared renderer.
 */
function resolveNotificationLink(n: ApiNotification): { href: string; label: string } | null {
  if (n.data?.tripId) {
    return {
      href: n.data.workspacePath || `/expert/workspace/${n.data.tripId}`,
      label: n.data.workspacePath?.startsWith("/trip/") || n.data.workspacePath?.startsWith("/itinerary-view/")
        ? "View Itinerary"
        : "Open",
    };
  }
  if (n.type === "message_received") {
    return { href: n.data?.clientId ? `/chat?clientId=${n.data.clientId}` : "/chat", label: "Open Chat" };
  }
  return null;
}

function UpdatesTab() {
  const { data: notifications, isLoading } = useQuery<ApiNotification[]>({
    queryKey: ["/api/notifications"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const sorted = useMemo(
    () => [...(notifications ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [notifications],
  );
  const unreadCount = sorted.filter((n) => !n.isRead).length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <Card className="border-2 border-dashed border-border">
        <CardContent className="p-10 text-center" data-testid="empty-inbox-updates">
          <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No updates</h3>
          <p className="text-sm text-muted-foreground">You're all caught up! Check back later.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4 mr-1.5" />
            Mark all as read
          </Button>
        </div>
      )}
      {sorted.map((n) => {
        const Icon = getNotificationIcon(n.type);
        const link = resolveNotificationLink(n);
        return (
          <Card
            key={n.id}
            className={n.isRead ? "border-border" : "border-primary/30 bg-primary/5"}
            data-testid={`inbox-update-${n.id}`}
          >
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm ${n.isRead ? "" : "font-semibold"} text-foreground`}>{n.title}</p>
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </p>
                  {link && (
                    <Link href={link.href}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          if (!n.isRead) markAsReadMutation.mutate(n.id);
                        }}
                        data-testid={`button-open-update-${n.id}`}
                      >
                        {link.label}
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
              {!n.isRead && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                  onClick={() => markAsReadMutation.mutate(n.id)}
                  disabled={markAsReadMutation.isPending}
                  title="Mark as read"
                  data-testid={`button-mark-read-${n.id}`}
                >
                  <Check className="w-4 h-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const INBOX_TABS = ["messages", "updates"];

export default function InboxPage() {
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab") ?? "messages";
  const initialTab = INBOX_TABS.includes(tabParam) ? tabParam : "messages";

  // W5-E: real per-tab unread counts — messages from the new GET /api/messages/unread/count,
  // updates from the same GET /api/notifications the Updates tab itself renders (no fabrication).
  const { data: unreadMessages } = useUnreadMessageCount();
  const { data: notifications } = useQuery<{ isRead: boolean }[]>({ queryKey: ["/api/notifications"] });
  const unreadUpdatesCount = (notifications ?? []).filter((n) => !n.isRead).length;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <InboxIcon className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
              Inbox
            </h1>
            <p className="text-sm text-muted-foreground">
              Conversations with experts and updates about your trips, in one place.
            </p>
          </div>
        </div>

        <Tabs defaultValue={initialTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="messages" data-testid="tab-inbox-messages">
              Messages
              {!!unreadMessages?.count && (
                <span className="ml-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold inline-flex items-center justify-center">
                  {unreadMessages.count > 9 ? "9+" : unreadMessages.count}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="updates" data-testid="tab-inbox-updates">
              Updates
              {unreadUpdatesCount > 0 && (
                <span className="ml-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] font-semibold inline-flex items-center justify-center">
                  {unreadUpdatesCount > 9 ? "9+" : unreadUpdatesCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="messages">
            <MessagesTab />
          </TabsContent>
          <TabsContent value="updates">
            <UpdatesTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
