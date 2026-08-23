import { useChats, useSendMessage } from "@/hooks/use-chat";
import { useConversationThreads } from "@/hooks/use-conversation-threads";
import { useTrip } from "@/hooks/use-trips";
import { useAuth } from "@/hooks/use-auth";
import { isEarnerRole } from "@shared/roles";
import { getRoleHomePath } from "@/lib/role-utils";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Send, Loader2, MessageSquare, Search, Star, MapPin, ArrowLeft, User, Clock, Wifi, WifiOff,
  PackageCheck, Eye, Lightbulb, CheckCircle2, AlertCircle, MessageCircle, FileText,
  MoreVertical, Flag, ShieldOff, ShieldCheck, Bell,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { buildConversationId, useMarkConversationRead } from "@/hooks/use-message-read";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

interface RealtimeMessage {
  id: string;
  senderId: string;
  recipientId?: string;
  content: string;
  timestamp: string;
}

interface DisplayExpert {
  id: string | number;
  name: string;
  location: string;
  avatar: string;
  /** Real review-backed rating, or null when the expert has no reviews (§13: never a fabricated number). */
  rating: number | null;
  reviews: number;
  specialties: string[];
  languages: string[];
  responseTime: string;
  /** Set only for earner-mode conversation partners (audit A4) — the last real message in the
   *  thread, shown in the list card instead of a fabricated rating/location for a client. */
  lastMessage?: string;
  /** ISO timestamp of the last real message in a conversation, used for the Inbox-style
   * recency cue in the shared conversation rail. */
  lastMessageAt?: string | null;
  /** True for earner-mode conversation partners — swaps the "browse an expert" card layout
   *  (rating/location/specialties) for a real thread-preview layout. */
  isConversationPartner?: boolean;
  /** W5-E: unread-received-message count for this thread (from useConversationThreads),
   *  cleared once the thread is opened and read-all is confirmed. */
  unreadCount?: number;
}

/**
 * A single trip plan-lifecycle event, sourced from GET /api/notifications (the exact endpoint
 * the bell page / Inbox "Updates" tab already read — see client/src/pages/inbox.tsx's
 * ApiNotification). Only the fields this feature reads are declared here; the real writers are
 * server/routes/booking-actions.ts's four `type: 'itinerary_update'` inserts (suggestion,
 * delivery status advance, plan-review decision, per-item comments both directions) — every one
 * of them stamps `data.tripId` + `data.workspacePath` already resolved for the notification's
 * OWN recipient/role, so this feature reads that verbatim rather than re-deriving a link.
 */
interface PlanEventNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  data?: {
    tripId?: string;
    itemId?: string;
    workspacePath?: string;
    [key: string]: unknown;
  };
}

/** Icon per event, chosen from the real, fixed set of titles the server writes (see the four
 *  insert sites above) — never a generic/ambiguous default beyond the honest fallback. */
function planEventIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("delivered")) return PackageCheck;
  if (t.includes("ready for review")) return Eye;
  if (t.includes("suggestion")) return Lightbulb;
  if (t.includes("approved")) return CheckCircle2;
  if (t.includes("changes requested")) return AlertCircle;
  if (t.includes("comment")) return MessageCircle;
  return FileText;
}

/**
 * A single inline, read-only system row for a trip plan-lifecycle event (claude/chat-plan-events,
 * ratified "Light" scope). Centered/muted/small — visually distinct from a chat bubble, matching
 * the page's existing muted-token language (bg-muted / text-muted-foreground, no raw hex). No
 * mutation, no mark-as-read — that stays owned by /notifications + Inbox "Updates" (one-home
 * rule). The "View" link is exactly the server-resolved `data.workspacePath` (already correct for
 * THIS notification's own recipient/role) — never re-derived, and omitted entirely when absent
 * rather than rendering a broken link (§13).
 */
function PlanEventRow({ event }: { event: PlanEventNotification }) {
  const Icon = planEventIcon(event.title);
  const href = event.data?.workspacePath;
  return (
    <div className="flex justify-center py-1" data-testid={`plan-event-${event.id}`}>
      <div className="flex items-center gap-2 max-w-[90%] px-3 py-1.5 rounded-full bg-muted/70 text-muted-foreground text-xs">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{event.title}</span>
        <span className="flex-shrink-0 opacity-70">
          · {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
        </span>
        {href && (
          <Link href={href} className="flex-shrink-0 font-medium underline underline-offset-2 hover:text-foreground">
            View
          </Link>
        )}
      </div>
    </div>
  );
}

/** Map a raw /api/experts row to the chat display shape. Ratings stay honest —
 *  a score renders only when reviewCount > 0, else null (shown as "New"). */
function mapExpertToDisplay(data: any): DisplayExpert {
  const reviews = Number(data.reviewCount ?? 0);
  const rawRating = data.averageRating ?? data.rating;
  return {
    id: data.id,
    name: `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || data.name || "Local Expert",
    location:
      data.expertForm?.city ||
      data.destinations?.[0] ||
      data.location ||
      "Trip Planner",
    avatar: data.profileImage || data.profileImageUrl || "",
    rating: reviews > 0 && rawRating ? Number(rawRating) : null,
    reviews,
    specialties:
      data.expertForm?.primarySpecialty
        ? [data.expertForm.primarySpecialty, ...(data.specialties ?? [])]
        : data.specialties ?? [],
    languages: data.languages ?? ["English"],
    responseTime: data.responseTime || "< 2 hours",
  };
}

export default function Chat() {
  const { user } = useAuth();
  const { data: chats, isLoading, refetch } = useChats();
  const sendMessageMutation = useSendMessage();
  const { toast } = useToast();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  // Ledger 90 (FP-5, I3): `?provider=` is accepted as an ALIAS for `?expertId=`. The service-detail
  // "Contact Provider" CTA linked to `/chat?provider=<userId>` for its whole life and this file has
  // never read that param, so the most prominent way for a traveler to reach a provider dropped
  // them on the browse directory with no composer. The CTA itself now uses the canonical rail
  // (useAskExpert → `?expertId=` + `?name=`), and this alias catches every link already out in the
  // world — a shared URL, a bookmark, a chat history. There is ONE conversation rail here, not two:
  // `provider_services` is role-agnostic, so a listing's owner may be a provider or an expert, and
  // the thread is the same `user_and_expert_chats` row either way.
  const expertIdFromUrl = urlParams.get("expertId") ?? urlParams.get("provider");
  // clientId: forwarded from /expert/messages/:clientId and /provider/messages/:clientId
  // deep-links. Pre-populates the search box so the relevant conversation is surfaced.
  const clientIdFromUrl = urlParams.get("clientId");
  // tripId: forwarded from My Plans so this shared surface can restore trip context and select
  // the assigned expert when an accepted advisor relationship exists.
  const tripIdFromUrl = urlParams.get("tripId");
  // about: forwarded from "Ask expert" buttons on gem/activity cards — pre-fills the message
  const aboutFromUrl = urlParams.get("about");
  // name/avatar: optional display fallback for expertIdFromUrl (see fallbackExpert below) —
  // forwarded by callers (e.g. the storefront "Message" CTA, via useAskExpert) that already
  // know the target's display info and can't rely on /api/experts/:id resolving it (that
  // lookup is expert-family-only; a provider-role target 404s there).
  const nameFromUrl = urlParams.get("name");
  const avatarFromUrl = urlParams.get("avatar");

  // Audit A4: an earner (provider or expert-family) landing on /chat needs THEIR client
  // threads, not the traveler-facing "browse a directory of experts to hire" surface — the
  // wrong product surface for someone seeking conversations with the people who booked them.
  // Same role source ProtectedRoute/role-routes-config reads (`users.role` via `isEarnerRole`).
  const isEarner = isEarnerRole(user?.role);

  // Real experts for the browse sidebar (replaces the old hardcoded sample list). Skipped for
  // earners — they get their real conversation partners instead (below).
  const { data: expertList = [] } = useQuery<DisplayExpert[]>({
    queryKey: ["/api/experts"],
    queryFn: async () => {
      const res = await fetch("/api/experts", { credentials: "include" });
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows.map(mapExpertToDisplay) : [];
    },
    enabled: !isEarner,
  });

  const { data: linkedExpert, isSuccess: linkedExpertQueried } = useQuery<DisplayExpert | null>({
    queryKey: ["/api/experts", expertIdFromUrl],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${expertIdFromUrl}`);
      if (!res.ok) return null;
      return mapExpertToDisplay(await res.json());
    },
    enabled: !!expertIdFromUrl,
  });

  // Fallback for an expertIdFromUrl that /api/experts/:id can't resolve (it's expert-family
  // role only — a provider-role storefront owner 404s there). When the query has settled
  // without a result AND the caller passed name/avatar (see nameFromUrl above), build a
  // minimal DisplayExpert directly from the URL — no second endpoint, same self-contained
  // param pattern the `about` prefill already uses.
  const fallbackExpert = useMemo<DisplayExpert | null>(() => {
    if (!expertIdFromUrl || linkedExpert || !linkedExpertQueried || !nameFromUrl) return null;
    return {
      id: expertIdFromUrl,
      name: nameFromUrl,
      location: "",
      avatar: avatarFromUrl || "",
      rating: null,
      reviews: 0,
      specialties: [],
      languages: [],
      responseTime: "",
    };
  }, [expertIdFromUrl, linkedExpert, linkedExpertQueried, nameFromUrl, avatarFromUrl]);

  const effectiveLinkedExpert = linkedExpert ?? fallbackExpert;

  // Fetch client info when arriving from /expert/messages/:clientId deep-link
  const { data: linkedClient } = useQuery<any>({
    queryKey: ["/api/users", clientIdFromUrl],
    queryFn: async () => {
      const res = await fetch(`/api/users/${clientIdFromUrl}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientIdFromUrl,
  });

  // Real conversation partners, grouped from the same /api/chats rows the provider/expert Inbox
  // "Recent conversations" list reads (server enriches each row with `participant.displayName`,
  // role-agnostic — no new endpoint). Grouping itself now lives in the shared
  // useConversationThreads hook (W5-E extraction, so the traveler Inbox Messages tab can reuse
  // it byte-for-byte instead of re-implementing it) — mapped here onto the existing DisplayExpert
  // shape so the rest of the thread UI (selection, header, messages) is unchanged. Computed for
  // BOTH roles: an earner's counterpart is a client, a traveler's counterpart is the expert they
  // messaged (W1-B) — the grouping is symmetric, only the counterpart's real-world role differs.
  const { threads: conversationThreads } = useConversationThreads();
  const conversationPartners = useMemo<DisplayExpert[]>(() => {
    return conversationThreads.map((t) => ({
      id: t.counterpartId,
      name: t.displayName || (isEarner ? "Client" : "Expert"),
      location: isEarner ? "Client" : "Expert",
      avatar: t.avatarUrl || "",
      rating: null,
      reviews: 0,
      specialties: [],
      languages: [],
      responseTime: "",
      lastMessage: t.lastMessage ?? undefined,
      lastMessageAt: t.lastMessageAt,
      isConversationPartner: true,
      unreadCount: t.unreadCount,
    }));
  }, [isEarner, conversationThreads]);

  // Inbox threads are role-agnostic: a traveler may be talking with either an expert or a
  // service provider. Prefer the real thread already returned by /api/chats over the
  // expert-directory lookup, which intentionally cannot resolve provider profiles.
  const threadExpertFromUrl = useMemo(
    () =>
      expertIdFromUrl
        ? conversationPartners.find((partner) => String(partner.id) === String(expertIdFromUrl)) ?? null
        : null,
    [conversationPartners, expertIdFromUrl],
  );

  // Traveler-mode browse directory (real experts + any deep-linked expert not already in the
  // list). Kept separate from conversationPartners so the two can render as distinct groups
  // (threads first, directory below) while still sharing one search box.
  const directoryExperts = useMemo<DisplayExpert[]>(() => {
    if (isEarner) return [];
    if (effectiveLinkedExpert) {
      const exists = expertList.some(e => String(e.id) === String(effectiveLinkedExpert.id));
      if (!exists) return [effectiveLinkedExpert, ...expertList];
    }
    return expertList;
  }, [isEarner, effectiveLinkedExpert, expertList]);

  const allExperts = useMemo(() => {
    if (isEarner) {
      if (linkedClient) {
        const exists = conversationPartners.some(p => String(p.id) === String(linkedClient.id));
        if (!exists) {
          return [
            {
              id: linkedClient.id,
              name:
                linkedClient.firstName || linkedClient.lastName
                  ? `${linkedClient.firstName ?? ""} ${linkedClient.lastName ?? ""}`.trim()
                  : linkedClient.username || linkedClient.email || "Client",
              location: "Client",
              avatar: linkedClient.profileImageUrl || linkedClient.profileImage || "",
              rating: null,
              reviews: 0,
              specialties: [],
              languages: [],
              responseTime: "",
              isConversationPartner: true,
            } as DisplayExpert,
            ...conversationPartners,
          ];
        }
      }
      return conversationPartners;
    }
    // Traveler mode: real conversation threads first, then the browse directory — a directory
    // entry already covered by a real thread is dropped so the same expert doesn't render twice.
    const dedupedDirectory = directoryExperts.filter(
      e => !conversationPartners.some(p => String(p.id) === String(e.id)),
    );
    return [...conversationPartners, ...dedupedDirectory];
  }, [isEarner, conversationPartners, linkedClient, directoryExperts]);

  // F3 (workstation-flows audit): for expert users, cross-reference the conversation partner
  // against assigned trips so the thread header can offer "Open trip workspace". Client-side
  // join — /api/expert/assigned-trips already returns traveler_user_id per trip.
  const isExpertUser = ["expert", "local_expert", "travel_expert", "event_planner", "executive_assistant"]
    .includes(user?.role ?? "");
  const { data: expertAssignedTrips } = useQuery<Array<{ trip_id: string; traveler_user_id?: string; status: string }>>({
    queryKey: ["/api/expert/assigned-trips"],
    enabled: isExpertUser,
    staleTime: 60_000,
  });

  const [message, setMessage] = useState("");
  const [selectedExpert, setSelectedExpert] = useState<DisplayExpert | null>(null);
  const handledInitialSelectionRef = useRef<string | null>(null);

  // ── Block / report state ─────────────────────────────────────────────────
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ messageId?: string; type: "message" | "user" } | null>(null);
  const [reportReason, setReportReason] = useState<string>("spam");
  const [reportDetails, setReportDetails] = useState("");

  const { data: blockStatus, refetch: refetchBlockStatus } = useQuery<{ blockedByMe: boolean; blocked: boolean }>({
    queryKey: ["/api/messages/block/status", selectedExpert?.id],
    queryFn: async () => {
      if (!selectedExpert) return { blockedByMe: false, blocked: false };
      const res = await fetch(`/api/messages/block/status/${selectedExpert.id}`, { credentials: "include" });
      if (!res.ok) return { blockedByMe: false, blocked: false };
      return res.json();
    },
    enabled: !!selectedExpert?.id && !!user?.id,
  });

  const blockMutation = useMutation({
    mutationFn: (targetId: string) => apiRequest("POST", `/api/messages/block/${targetId}`, {}),
    onSuccess: () => {
      refetchBlockStatus();
      toast({ title: "User blocked", description: "You will no longer receive messages from this person." });
    },
    onError: () => toast({ title: "Failed to block user", variant: "destructive" }),
  });

  const unblockMutation = useMutation({
    mutationFn: (targetId: string) => apiRequest("DELETE", `/api/messages/block/${targetId}`, {}),
    onSuccess: () => {
      refetchBlockStatus();
      toast({ title: "User unblocked", description: "You can now exchange messages again." });
    },
    onError: () => toast({ title: "Failed to unblock user", variant: "destructive" }),
  });

  const reportMutation = useMutation({
    mutationFn: ({
      type,
      messageId,
      reason,
      details,
    }: {
      type: "message" | "user";
      messageId?: string;
      reason: string;
      details: string;
    }) => {
      const url =
        type === "message" && messageId
          ? `/api/messages/report/message/${messageId}`
          : `/api/messages/report/user/${selectedExpert?.id}`;
      return apiRequest("POST", url, { reason, details: details || undefined });
    },
    onSuccess: () => {
      setReportDialogOpen(false);
      setReportTarget(null);
      setReportDetails("");
      toast({ title: "Report submitted", description: "Our moderation team will review this shortly." });
    },
    onError: () => toast({ title: "Failed to submit report", variant: "destructive" }),
  });

  const openReportDialog = (type: "message" | "user", messageId?: string) => {
    setReportTarget({ type, messageId });
    setReportReason("spam");
    setReportDetails("");
    setReportDialogOpen(true);
  };
  const partnerAssignedTrip = useMemo(
    () =>
      selectedExpert
        ? (expertAssignedTrips ?? []).find(
            (t) => t.traveler_user_id != null && String(t.traveler_user_id) === String(selectedExpert.id) && t.status === "accepted",
          ) ?? null
        : null,
    [selectedExpert, expertAssignedTrips],
  );

  // ── Plan-lifecycle events (claude/chat-plan-events) ─────────────────────────────────────────
  // Traveler-side mirror of expertAssignedTrips above: which of MY OWN trips has this expert as
  // an active advisor. Real linkage via GET /api/trips/mine/advisors (new, session-scoped —
  // server/routes/booking-actions.ts), the reverse of the existing /api/expert/assigned-trips
  // read this page already uses for the earner side. Skipped for earners (no traveler-owned
  // trips to look up).
  const { data: travelerTripAdvisors } = useQuery<Array<{ trip_id: string; expert_id: string; status: string }>>({
    queryKey: ["/api/trips/mine/advisors"],
    enabled: !isEarner,
    staleTime: 60_000,
  });

  const tripAdvisor = useMemo(
    () =>
      tripIdFromUrl
        ? (travelerTripAdvisors ?? []).find(
            (advisor) =>
              String(advisor.trip_id) === String(tripIdFromUrl) && advisor.status === "accepted",
          ) ?? null
        : null,
    [tripIdFromUrl, travelerTripAdvisors],
  );

  // My Plans only knows the trip. Resolve the same expert display record used by direct Inbox
  // links so both entry points converge on one selected conversation.
  const { data: tripLinkedExpert } = useQuery<DisplayExpert | null>({
    queryKey: ["/api/experts", tripAdvisor?.expert_id],
    queryFn: async () => {
      const res = await fetch(`/api/experts/${tripAdvisor?.expert_id}`, { credentials: "include" });
      if (!res.ok) return null;
      return mapExpertToDisplay(await res.json());
    },
    enabled: !isEarner && !!tripAdvisor?.expert_id && !expertIdFromUrl,
  });
  const initialLinkedExpert = threadExpertFromUrl ?? effectiveLinkedExpert ?? tripLinkedExpert;

  // The trip actually shared with the OPEN conversation partner, resolved from real assignment
  // data only (never guessed — §13). Earner (expert) side reuses partnerAssignedTrip above
  // (already resolved from /api/expert/assigned-trips, accepted-only); a provider earner has no
  // assigned-trip concept at all and correctly resolves to null. Traveler side looks up the
  // reverse via travelerTripAdvisors, same accepted-only bar.
  const sharedTripId = useMemo(() => {
    if (!selectedExpert) return null;
    if (isEarner) return isExpertUser ? (partnerAssignedTrip?.trip_id ?? null) : null;
    const match = (travelerTripAdvisors ?? []).find(
      (a) => String(a.expert_id) === String(selectedExpert.id) && a.status === "accepted",
    );
    return match?.trip_id ?? null;
  }, [selectedExpert, isEarner, isExpertUser, partnerAssignedTrip, travelerTripAdvisors]);

  // Preserve a valid My Plans trip context even before an expert is selected. Once a shared
  // conversation is open, sharedTripId remains the authoritative relationship-based value.
  const selectedTripId = sharedTripId ?? tripIdFromUrl;
  const { data: selectedTrip } = useTrip(!isEarner ? (selectedTripId ?? "") : "");

  // The same GET /api/notifications the bell page (notifications.tsx) and Inbox "Updates" tab
  // (inbox.tsx) already read — no new endpoint for the events themselves, only for the
  // shared-trip resolution above. Filtered to itinerary_update rows whose `data.tripId` matches
  // the resolved shared trip; when no shared trip resolves, this is always empty (never a guess).
  const { data: allNotifications } = useQuery<PlanEventNotification[]>({
    queryKey: ["/api/notifications"],
  });
  const planEvents = useMemo(() => {
    if (!sharedTripId) return [];
    return (allNotifications ?? []).filter(
      (n) => n.type === "itinerary_update" && n.data?.tripId === sharedTripId,
    );
  }, [allNotifications, sharedTripId]);

  // Merge messages + plan events into one chronological timeline. Read-only: this never mutates
  // either source, never marks anything read (that stays owned by /notifications + Inbox
  // "Updates" — the one-home rule), and never touches the message-send/WebSocket/typing/
  // unread-badge logic above. `chats` (the existing, unfiltered-by-thread query — unchanged
  // here) supplies messages; planEvents (already trip-scoped, above) supplies events.
  type TimelineEntry =
    | { kind: "message"; ts: number; chat: NonNullable<typeof chats>[number] }
    | { kind: "event"; ts: number; event: PlanEventNotification };
  const timelineItems = useMemo<TimelineEntry[]>(() => {
    const msgItems: TimelineEntry[] = (chats ?? []).map((chat) => ({
      kind: "message",
      ts: chat.createdAt ? new Date(chat.createdAt).getTime() : 0,
      chat,
    }));
    const eventItems: TimelineEntry[] = planEvents.map((event) => ({
      kind: "event",
      ts: new Date(event.createdAt).getTime(),
      event,
    }));
    return [...msgItems, ...eventItems].sort((a, b) => a.ts - b.ts);
  }, [chats, planEvents]);

  const [searchQuery, setSearchQuery] = useState("");

  // Pre-fill message when arriving from "Ask expert" on a gem/activity card
  useEffect(() => {
    if (aboutFromUrl) {
      setMessage(`I'm interested in ${aboutFromUrl} — can you share any tips or help me plan this?`);
    }
  }, [aboutFromUrl]);

  // A deep link should select its target once. It must not reassert that selection after the
  // traveler deliberately chooses another thread in the same rail. Resetting the handled key
  // when the URL context changes still makes links from Inbox and My Plans switch conversations.
  const initialSelectionKey = expertIdFromUrl
    ? `expert:${expertIdFromUrl}`
    : tripIdFromUrl
      ? `trip:${tripIdFromUrl}`
      : null;
  useEffect(() => {
    if (!initialSelectionKey) {
      handledInitialSelectionRef.current = null;
      return;
    }
    if (!initialLinkedExpert || handledInitialSelectionRef.current === initialSelectionKey) return;

    setSelectedExpert(initialLinkedExpert);
    handledInitialSelectionRef.current = initialSelectionKey;
  }, [initialLinkedExpert, initialSelectionKey]);

  // When arriving from /expert/messages/:clientId deep-link, pre-populate search with the
  // client's name so the relevant conversation thread is surfaced immediately.
  useEffect(() => {
    if (linkedClient && !searchQuery) {
      const clientName = linkedClient.firstName
        ? `${linkedClient.firstName} ${linkedClient.lastName || ""}`.trim()
        : (linkedClient.username || linkedClient.email || "");
      if (clientName) setSearchQuery(clientName);
    }
  }, [linkedClient]);
  const [realtimeMessages, setRealtimeMessages] = useState<RealtimeMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // A11y focus management: when a conversation is opened (mouse or keyboard), move focus
  // to the message input so keyboard users can type immediately.
  useEffect(() => {
    if (selectedExpert) {
      messageInputRef.current?.focus();
    }
  }, [selectedExpert?.id]);

  // W5-E: mark-read wiring. A "conversation" server-side (server/routes/messages.ts,
  // server/services/messages.service.ts) is keyed by the sorted pair of participant user ids —
  // exactly the same pairing chat.tsx already threads by (session user + selectedExpert.id), so
  // `read-all` on the conversationId is the right primitive here (not per-message PATCH): one
  // call marks every unread-received message in the open thread, and the server scopes the
  // update to `receiverId = session user` (verified in messages.service.ts) so a caller's own
  // sent messages are never touched.
  const markConversationRead = useMarkConversationRead();

  // Mark-read on thread open/select. Runs whenever the open thread's counterpart changes; a
  // harmless no-op when there's no real conversation yet (e.g. browsing the expert directory
  // pre-first-message) since read-all matches zero rows in that case.
  useEffect(() => {
    if (!user?.id || !selectedExpert) return;
    const conversationId = buildConversationId(user.id, String(selectedExpert.id));
    markConversationRead.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedExpert?.id]);

  const handleNewMessage = useCallback((msg: any) => {
    if (msg.type === "chat") {
      setRealtimeMessages(prev => [...prev, {
        id: msg.id || crypto.randomUUID(),
        senderId: msg.senderId,
        recipientId: msg.recipientId,
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString(),
      }]);
      refetch();
      // A new message arrived while this thread is open (the sender is the currently selected
      // counterpart) — mark it read immediately rather than waiting for the next thread-open.
      if (user?.id && selectedExpert && msg.senderId === String(selectedExpert.id)) {
        markConversationRead.mutate(buildConversationId(user.id, String(selectedExpert.id)));
      }
    }
  }, [refetch, user?.id, selectedExpert, markConversationRead]);

  const handleTyping = useCallback((senderId: string) => {
    if (selectedExpert && String(selectedExpert.id) === senderId) {
      setIsTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
    }
  }, [selectedExpert]);

  const handleWsError = useCallback((error: string) => {
    // Distinguish a policy block from an infrastructure failure so the user
    // understands they are blocked rather than experiencing a network error.
    const isBlocked = error.toLowerCase().includes("cannot send messages");
    toast({
      title: isBlocked ? "Message not delivered" : "Message failed",
      description: isBlocked
        ? error
        : (error || "Failed to send message. Please try again."),
      variant: "destructive",
    });
  }, [toast]);

  const { isConnected, sendMessage: wsSendMessage, sendTyping } = useWebSocket({
    userId: user?.id,
    onMessage: handleNewMessage,
    onTyping: handleTyping,
    onConnected: () => {},
    onError: handleWsError,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [realtimeMessages, chats]);

  const handleSend = () => {
    if (!message.trim() || !selectedExpert) return;
    
    const currentMessage = message;
    const recipientId = String(selectedExpert.id);
    
    // For demo experts (numeric IDs), use HTTP fallback which doesn't enforce FK
    // WebSocket real-time only works with actual platform users
    if (isConnected && recipientId.length > 10) {
      // Real user ID (UUID format), try WebSocket
      const success = wsSendMessage(recipientId, currentMessage);
      if (success) {
        setMessage("");
      }
    } else {
      // Demo mode or WebSocket failed - use HTTP mutation
      sendMessageMutation.mutate(
        { message: currentMessage, senderId: user?.id, receiverId: recipientId },
        { 
          onSuccess: () => {
            setMessage("");
            refetch();
          },
          onError: () => {
            toast({
              title: "Message failed",
              description: "Failed to send message. Please try again.",
              variant: "destructive",
            });
          }
        }
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (selectedExpert && isConnected) {
      sendTyping(String(selectedExpert.id));
    }
  };

  const filteredExperts = allExperts.filter(expert =>
    expert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expert.specialties.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  // Traveler mode renders two groups (real threads first, browse directory below) — split the
  // already-searched list back out by the flag conversationPartners/directoryExperts stamp.
  const filteredConversations = filteredExperts.filter(expert => expert.isConversationPartner);
  const filteredDirectory = filteredExperts.filter(expert => !expert.isConversationPartner);

  const renderExpertCard = (expert: DisplayExpert, index: number) => (
    <motion.div
      key={expert.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Open conversation with ${expert.name}`}
        className={`cursor-pointer transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedExpert?.id === expert.id ? 'ring-2 ring-primary' : ''}`}
        onClick={() => setSelectedExpert(expert)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelectedExpert(expert);
          }
        }}
        data-testid={`card-expert-${expert.id}`}
      >
        <CardContent className={expert.isConversationPartner ? "px-3 py-2.5" : "p-4"}>
          <div className={expert.isConversationPartner ? "flex items-start gap-2.5" : "flex items-start gap-3"}>
            <Avatar className={expert.isConversationPartner ? "w-9 h-9" : "w-12 h-12"}>
              <AvatarImage src={expert.avatar} alt={expert.name} />
              <AvatarFallback>{expert.name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className={`${expert.isConversationPartner ? "text-sm" : ""} font-semibold text-slate-900 dark:text-white truncate`}>
                  {expert.name}
                </h3>
                {/* W5-E: per-thread unread indicator — real count from useConversationThreads
                    (readAt-derived), cleared once the thread is opened. */}
                {!!expert.unreadCount && expert.unreadCount > 0 && (
                  <span
                    className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0"
                    data-testid={`badge-thread-unread-${expert.id}`}
                  >
                    {expert.unreadCount > 9 ? "9+" : expert.unreadCount}
                  </span>
                )}
              </div>
              {expert.isConversationPartner ? (
                <>
                  {expert.lastMessage && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {expert.lastMessage}
                    </p>
                  )}
                  {expert.lastMessageAt && (
                    <p className="text-[11px] leading-4 text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(expert.lastMessageAt), { addSuffix: true })}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    {expert.rating !== null ? (
                      <div className="flex items-center gap-1 text-amber-500 text-sm shrink-0">
                        <Star className="w-3 h-3 fill-current" />
                        {expert.rating.toFixed(1)}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">New</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3 h-3" />
                    {expert.location}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {expert.specialties.slice(0, 2).map(spec => (
                      <Badge key={spec} variant="secondary" className="text-xs">
                        {spec}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    // Rendered inside a role shell (ConsoleAwareLayout → DashboardLayout / BackofficeShell /
    // EALayout), NOT as a standalone page — those shells already supply the global chrome
    // (sidebar + their own sticky h-[52px] header) and their own <main> scroll container. This
    // page used to assume a nonexistent standalone header stack + its own page-level scroll,
    // producing a dead band above the title, a clipped conversation header, and a second
    // scrollbar. Fix: ONE viewport-anchored height here (h-[calc(100vh-52px)], matching the
    // shell's own real, shared h-[52px] header — DashboardLayout/BackofficeShell/EALayout all
    // use the identical value) establishes a single bounded frame for this page; every nested
    // pane below derives its height from that frame via flex-1/min-h-0, never its own viewport
    // arithmetic.
    <div className="flex flex-col h-[calc(100vh-52px)] min-h-0 bg-background">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-border flex-shrink-0">
        <div className="px-3 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href={isEarner ? getRoleHomePath(user?.role ?? "user") : "/dashboard"}>
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold font-display text-slate-900 dark:text-white">
                  {isEarner ? "Messages" : "Expert Chat"}
                </h1>
                {!isEarner && (
                  <Link href="/inbox?tab=updates">
                    <Button variant="outline" size="sm" data-testid="button-view-updates">
                      <Bell className="w-3.5 h-3.5 mr-1.5" />
                      Updates
                    </Button>
                  </Link>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {isEarner ? "Conversations with your clients" : "Connect with local experts for your trips"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-3 sm:px-6 py-4 md:py-6">
        <div className="flex flex-col md:grid md:grid-cols-3 gap-4 md:gap-6 h-full min-h-0">
          {/* Expert List */}
          <div className="md:col-span-1 flex-1 md:flex-auto flex flex-col gap-4 min-h-0">
            <div className="relative flex-shrink-0">
              <Input
                placeholder={isEarner ? "Search conversations..." : "Search experts..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-experts"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>

            {/* Radix ScrollArea's Viewport wraps children in an inner `display:table` div that
                sizes to CONTENT (ignoring the parent's bounded width) — the `truncate` classes on
                the card text below can never engage without this. Force that wrapper back to a
                normal block so truncation actually applies (verified against the installed
                @radix-ui/react-scroll-area DOM: Root > Viewport(div) > content-wrapper(div) — the
                `[&>div>div]` target below is that content-wrapper, two levels under Root). */}
            <ScrollArea className="flex-1 min-h-0 [&>div>div]:!block [&>div>div]:!w-full [&>div>div]:!min-w-0">
              {isEarner ? (
                filteredExperts.length === 0 ? (
                  <div className="text-center py-12 px-2">
                    <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-1">No conversations yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Messages clients send you will land here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pr-4">
                    {filteredExperts.map((expert, index) => renderExpertCard(expert, index))}
                  </div>
                )
              ) : (
                <div className="space-y-5 pr-4">
                  {/* Your conversations — real threads first (W1-B) */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">
                      Your conversations
                    </h4>
                    {conversationPartners.length === 0 ? (
                      <div className="text-center py-6 px-2" data-testid="empty-conversations">
                        <MessageSquare className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">
                          No conversations yet. Message an expert below to get started.
                        </p>
                      </div>
                    ) : filteredConversations.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-1">No conversations match your search.</p>
                    ) : (
                      <div className="space-y-3">
                        {filteredConversations.map((expert, index) => renderExpertCard(expert, index))}
                      </div>
                    )}
                  </div>

                  {/* Browse directory — how a traveler starts a NEW conversation */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">
                      Experts
                    </h4>
                    {filteredDirectory.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-1">No experts match your search.</p>
                    ) : (
                      <div className="space-y-3">
                        {filteredDirectory.map((expert, index) => renderExpertCard(expert, index))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Chat Area */}
          <div className="md:col-span-2 flex-1 md:flex-auto min-h-0">
            <Card className="h-full flex flex-col min-h-0">
              {selectedExpert ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-border flex items-center gap-4 flex-shrink-0">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={selectedExpert.avatar} alt={selectedExpert.name} />
                      <AvatarFallback>{selectedExpert.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{selectedExpert.name}</h3>
                        {selectedTrip && selectedTripId && (
                          <Link href={`/plans/${selectedTripId}`}>
                            <Badge
                              variant="outline"
                              className="text-xs cursor-pointer hover:bg-accent"
                              data-testid="badge-chat-trip-context"
                            >
                              <MapPin className="w-3 h-3 mr-1" />
                              {selectedTrip.title || selectedTrip.destination || "Trip"}
                            </Badge>
                          </Link>
                        )}
                        {/* F3 (workstation-flows audit): when this conversation partner is a client
                            with an active assignment, jump straight into the trip's workstation. */}
                        {partnerAssignedTrip && (
                          <Link href={`/expert/workspace/${partnerAssignedTrip.trip_id}`}>
                            <Badge
                              variant="outline"
                              className="text-xs cursor-pointer hover:bg-accent"
                              data-testid="badge-open-trip-workspace"
                            >
                              Open trip workspace
                            </Badge>
                          </Link>
                        )}
                        {isConnected ? (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            <Wifi className="w-3 h-3 mr-1" /> Live
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            <WifiOff className="w-3 h-3 mr-1" /> Offline
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {isTyping ? (
                          <span className="flex items-center gap-1 text-primary">
                            <motion.span
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.2, repeat: Infinity }}
                            >
                              typing...
                            </motion.span>
                          </span>
                        ) : (
                          <>
                            {selectedExpert.responseTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Responds {selectedExpert.responseTime}
                              </span>
                            )}
                            {selectedExpert.reviews > 0 && (
                              <>
                                <span>|</span>
                                <span>{selectedExpert.reviews} reviews</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" data-testid="button-view-profile">View Profile</Button>
                    {/* Block / report user — conversation header actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid="button-conversation-actions">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openReportDialog("user")}
                          data-testid="button-report-user"
                        >
                          <Flag className="w-3.5 h-3.5 mr-2 text-orange-500" />
                          Report {selectedExpert.name}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {blockStatus?.blockedByMe ? (
                          <DropdownMenuItem
                            onClick={() => unblockMutation.mutate(String(selectedExpert.id))}
                            data-testid="button-unblock-user"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 mr-2 text-green-500" />
                            Unblock {selectedExpert.name}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => blockMutation.mutate(String(selectedExpert.id))}
                            data-testid="button-block-user"
                          >
                            <ShieldOff className="w-3.5 h-3.5 mr-2" />
                            Block {selectedExpert.name}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Messages */}
                  <ScrollArea
                    className="flex-1 min-h-0 p-4"
                    role="log"
                    aria-live="polite"
                    aria-label="Message thread"
                  >
                    {timelineItems.length > 0 ? (
                      <div className="space-y-4">
                        {timelineItems.map((item) =>
                          item.kind === "event" ? (
                            <PlanEventRow key={`event-${item.event.id}`} event={item.event} />
                          ) : (
                            <div
                              key={`msg-${item.chat.id}`}
                              className={`flex ${item.chat.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className="flex items-end gap-2 max-w-[70%]">
                                {item.chat.senderId !== user?.id && (
                                  <Avatar className="w-8 h-8">
                                    <AvatarImage src={selectedExpert.avatar} />
                                    <AvatarFallback>{selectedExpert.name[0]}</AvatarFallback>
                                  </Avatar>
                                )}
                                <div
                                  className={`
                                    rounded-2xl p-4 shadow-sm
                                    ${item.chat.senderId === user?.id
                                      ? 'bg-primary text-white rounded-br-none'
                                      : 'bg-muted text-foreground rounded-bl-none'}
                                  `}
                                >
                                  <p>{item.chat.message}</p>
                                  <div className={`text-xs mt-2 ${item.chat.senderId === user?.id ? 'text-white/70' : 'text-muted-foreground'}`}>
                                    {item.chat.createdAt && format(new Date(item.chat.createdAt), "h:mm a")}
                                  </div>
                                </div>
                                {/* Message actions — only shown on incoming messages */}
                                {item.chat.senderId !== user?.id && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100 flex-shrink-0 self-center"
                                        data-testid={`button-message-actions-${item.chat.id}`}
                                      >
                                        <MoreVertical className="w-3.5 h-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                      <DropdownMenuItem
                                        onClick={() => openReportDialog("message", item.chat.id)}
                                        data-testid={`button-report-message-${item.chat.id}`}
                                      >
                                        <Flag className="w-3.5 h-3.5 mr-2 text-orange-500" />
                                        Report message
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                          <MessageSquare className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Start a conversation</h3>
                        <p className="text-muted-foreground text-sm max-w-xs">
                          {isEarner
                            ? `Send ${selectedExpert.name} a message to get the conversation started.`
                            : `Say hello to ${selectedExpert.name} and get personalized travel advice!`}
                        </p>
                      </div>
                    )}
                  </ScrollArea>

                  {/* Input — replaced by a notice when a block is active in either direction */}
                  <div className="p-4 border-t border-border flex-shrink-0">
                    {blockStatus?.blocked ? (
                      <div
                        className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground"
                        data-testid="blocked-message-notice"
                      >
                        <ShieldOff className="w-4 h-4 text-destructive" />
                        {blockStatus.blockedByMe
                          ? `You have blocked ${selectedExpert.name}. Unblock to send messages.`
                          : "Messaging is not available for this conversation."}
                      </div>
                    ) : (
                      <form 
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex gap-3"
                      >
                        <Input
                          ref={messageInputRef}
                          value={message}
                          onChange={handleInputChange}
                          placeholder="Type your message..."
                          className="flex-1"
                          aria-label="Message"
                          data-testid="input-message"
                        />
                        <Button 
                          type="submit" 
                          disabled={sendMessageMutation.isPending || !message.trim()}
                          aria-label="Send message"
                          data-testid="button-send"
                        >
                          {sendMessageMutation.isPending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Send className="w-5 h-5" />
                          )}
                        </Button>
                      </form>
                    )}
                  </div>
                </>
              ) : (
                <CardContent className="flex-1 flex flex-col items-center justify-center text-center py-12">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                    <User className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                    {isEarner ? "Select a conversation" : "Select an Expert"}
                  </h3>
                  <p className="text-muted-foreground max-w-sm">
                    {isEarner
                      ? "Choose a client conversation from the list to view and reply to messages."
                      : "Choose a local expert from the list to start chatting and get personalized travel advice."}
                  </p>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Report dialog — shared for message-level and user-level reports */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent data-testid="dialog-report">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-orange-500" />
              {reportTarget?.type === "message" ? "Report message" : `Report ${selectedExpert?.name ?? "user"}`}
            </DialogTitle>
            <DialogDescription>
              Our moderation team will review this report. Reports are confidential.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason</label>
              <Select value={reportReason} onValueChange={setReportReason}>
                <SelectTrigger data-testid="select-report-reason">
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
                data-testid="textarea-report-details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                reportMutation.mutate({
                  type: reportTarget?.type ?? "user",
                  messageId: reportTarget?.messageId,
                  reason: reportReason,
                  details: reportDetails,
                })
              }
              disabled={reportMutation.isPending}
              data-testid="button-submit-report"
            >
              {reportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
