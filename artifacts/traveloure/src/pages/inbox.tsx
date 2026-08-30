/**
 * Traveler Inbox — QA_PUNCH_LIST item 15 [DM] half (Lane W5-E), R-G unified-Inbox update
 * (Console Realign Lane E4).
 *
 * A unified aggregation surface (mirrors the earner console's Inbox concept —
 * client/src/pages/provider/inbox.tsx, client/src/pages/expert/inbox.tsx) with two tabs:
 *
 *  - Messages: the same conversation-threads grouping traveler-mode /chat gained in PR #363,
 *    now factored into the shared `useConversationThreads` hook (client/src/hooks/
 *    use-conversation-threads.ts) so this tab and chat.tsx read one implementation, not two.
 *  - Updates: the traveler's real notifications (GET /api/notifications — the exact query the
 *    bell reads). /notifications (`pages/notifications.tsx`) is retired to a redirect here
 *    (`?tab=updates`); this tab absorbed its unique functions verbatim — per-row mark-read,
 *    per-row DELETE (`DELETE /api/notifications/:id`), mark-all-read, and deep-link derivation
 *    (now the shared `resolveNotificationLink`/`getNotificationIcon` in
 *    client/src/lib/notification-icons.tsx, also consumed by notification-bell.tsx).
 *
 * One-home rule: this page REFERENCES and deep-links into /chat — it never re-implements the
 * chat pane. Accept/decline booking requests is an earner action that already lives on the
 * expert/provider Inbox Queue tabs (never duplicated here — this is a traveler surface).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { useConversationThreads } from "@/hooks/use-conversation-threads";
import { useUnreadMessageCount } from "@/hooks/use-message-read";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import {
  Inbox as InboxIcon,
  MessageSquare,
  Bell,
  Check,
  CheckCheck,
  Trash2,
  MoreVertical,
  ShieldOff,
  ShieldCheck,
  Flag,
} from "lucide-react";
import {
  getNotificationIcon,
  resolveNotificationLink,
  type ApiNotification,
} from "@/lib/notification-icons";

// ─── Messages tab ───────────────────────────────────────────────────────────

function MessagesTab() {
  const { threads, isLoading } = useConversationThreads();
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [reportTargetName, setReportTargetName] = useState<string>("");
  const [reportReason, setReportReason] = useState("spam");
  const [reportDetails, setReportDetails] = useState("");

  const reportMutation = useMutation({
    mutationFn: ({ targetId, reason, details }: { targetId: string; reason: string; details: string }) =>
      apiRequest("POST", `/api/messages/report/user/${targetId}`, { reason, details: details || undefined }),
    onSuccess: () => {
      setReportDialogOpen(false);
      setReportTargetId(null);
      setReportDetails("");
    },
  });

  const blockMutation = useMutation({
    mutationFn: (targetId: string) => apiRequest("POST", `/api/messages/block/${targetId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    },
  });

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
    <>
      <div className="space-y-2">
        {threads.map((thread) => (
          <div key={thread.counterpartId} className="flex items-center gap-2">
            {/* The existing deep-link: ?expertId= selects the thread directly in chat.tsx */}
            <Link href={`/chat?expertId=${thread.counterpartId}`} className="flex-1 min-w-0">
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
            {/* Per-thread block/report actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0 text-muted-foreground"
                  data-testid={`button-thread-actions-${thread.counterpartId}`}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setReportTargetId(thread.counterpartId);
                    setReportTargetName(thread.displayName || "this user");
                    setReportReason("spam");
                    setReportDetails("");
                    setReportDialogOpen(true);
                  }}
                  data-testid={`button-report-thread-${thread.counterpartId}`}
                >
                  <Flag className="w-3.5 h-3.5 mr-2 text-orange-500" />
                  Report {thread.displayName || "user"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => blockMutation.mutate(thread.counterpartId)}
                  disabled={blockMutation.isPending}
                  data-testid={`button-block-thread-${thread.counterpartId}`}
                >
                  <ShieldOff className="w-3.5 h-3.5 mr-2" />
                  Block {thread.displayName || "user"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Report dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent data-testid="dialog-inbox-report">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-orange-500" />
              Report {reportTargetName}
            </DialogTitle>
            <DialogDescription>
              Our moderation team will review this report. Reports are confidential.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason</label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger data-testid="select-inbox-report-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spam">Spam</SelectItem>
                  <SelectItem value="harassment">Harassment or threats</SelectItem>
                  <SelectItem value="inappropriate">Inappropriate content</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Additional details (optional)</label>
              <Textarea
                placeholder="Tell us more about what happened…"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                className="min-h-[80px] text-sm"
                maxLength={1000}
                data-testid="textarea-inbox-report-details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                reportTargetId &&
                reportMutation.mutate({ targetId: reportTargetId, reason: reportReason, details: reportDetails })
              }
              disabled={reportMutation.isPending || !reportTargetId}
              data-testid="button-submit-inbox-report"
            >
              {reportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Updates tab ─────────────────────────────────────────────────────────────
//
// R-G (Console Realign): this tab is the Updates half of the retired /notifications page —
// its uniques (per-row mark-read, per-row DELETE, mark-all-read, deep-link derivation) are
// absorbed here verbatim (notifications.tsx now just redirects to /inbox?tab=updates). Icon
// map + link resolution ride the shared client/src/lib/notification-icons module (bell +
// this tab are now its only two consumers). `isRead` is a real column (server/storage.ts
// `createNotification`/notifications table); there is no separate "delivered" or
// per-recipient read-receipt concept in the schema, so unread state here is exactly the
// same boolean the bell already renders — nothing invented (§13).

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

  // Absorbed from notifications.tsx (DELETE /api/notifications/:id) — kept alive, this tab is
  // now its only client caller (server/routes/content.routes.ts:2373).
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/notifications/${id}`, {}),
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
              <div className="flex items-center gap-1 flex-shrink-0">
                {!n.isRead && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => markAsReadMutation.mutate(n.id)}
                    disabled={markAsReadMutation.isPending}
                    title="Mark as read"
                    data-testid={`button-mark-read-${n.id}`}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500"
                  onClick={() => deleteMutation.mutate(n.id)}
                  disabled={deleteMutation.isPending}
                  title="Delete"
                  data-testid={`button-delete-update-${n.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
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
  const [, setLocation] = useLocation();
  const tabParam = new URLSearchParams(search).get("tab") ?? "messages";
  const initialTab = INBOX_TABS.includes(tabParam) ? tabParam : "messages";
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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

        <Tabs
          value={activeTab}
          onValueChange={(nextTab) => {
            const tab = INBOX_TABS.includes(nextTab) ? nextTab : "messages";
            setActiveTab(tab);
            setLocation(tab === "updates" ? "/inbox?tab=updates" : "/inbox");
          }}
          className="space-y-4"
        >
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
