import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useChats } from "@/hooks/use-chat";

export interface ConversationThread {
  /**
   * The other party's user id — sender or receiver, whichever isn't the session user.
   *
   * LD 40 lane 2: still id-addressed — the WebSocket send, block/report and read-all rails are all
   * keyed on a counterpart user id, and `/api/chats` is where it comes from. `publicId` below is
   * the address that replaces it for SENDING; when lane 2 strips `otherUserId` from
   * `ConversationSummary`, the join below goes with it and this hook must read its threads from
   * `GET /api/messages` outright.
   */
  counterpartId: string;
  /**
   * The OPAQUE conversation id (CLAUDE.md Locked Decision 40) — an HMAC over the internal pair id,
   * carrying no user ids. This is the address a client SENDS with. `null` when this thread was not
   * on the `GET /api/messages` page we joined against (that read is capped at 50), which is a real
   * state and is rendered honestly by the callers: they keep the legacy id-addressed link rather
   * than inventing an opaque id (§13).
   */
  publicId: string | null;
  /** Real display name from the server-enriched /api/chats row (`participant.displayName`),
   *  or null when the server didn't provide one. Callers pick the honest role-specific
   *  fallback label (e.g. "Client" for an earner viewer, "Expert" for a traveler viewer) —
   *  this hook stays role-agnostic, matching the grouping logic it was extracted from. */
  displayName: string | null;
  avatarUrl: string | null;
  /** Most recent message body in this thread, or null. */
  lastMessage: string | null;
  /** ISO timestamp of the most recent message in this thread, or null. */
  lastMessageAt: string | null;
  /** Count of messages in this thread the session user RECEIVED and has not yet read
   *  (`readAt IS NULL` on the `/api/chats` row where `receiverId === session user`). Computed
   *  client-side from the same fully-fetched `/api/chats` list — no second endpoint (W5-E: the
   *  aggregate count has a real server source too, GET /api/messages/unread/count, but a
   *  cheap per-conversation breakdown of it doesn't need its own route). */
  unreadCount: number;
}

/** One row of `GET /api/messages` — only the two fields this hook reads are declared. */
interface ConversationSummaryRow {
  publicId?: string | null;
  otherUserId?: string | null;
}

/**
 * Groups the session user's `/api/chats` rows into one thread per conversation partner,
 * keeping only the most recent message per counterpart, sorted newest message first.
 *
 * Extracted from chat.tsx's `conversationPartners` memo (traveler-mode threads, PR #363)
 * so the traveler Inbox "Messages" tab (W5-E, docs/planning/QA_PUNCH_LIST.md item 15) can
 * reuse the identical grouping instead of re-implementing it. chat.tsx itself now consumes
 * this hook for the grouping step — behavior is byte-identical to before the extraction
 * (same map-by-counterpart-then-take-latest-then-sort algorithm, same field reads).
 *
 * CLAUDE.md Locked Decision 40 (lane 3) adds ONE field: `publicId`, joined from
 * `GET /api/messages` — the read that already computes it server-side. It is deliberately a JOIN
 * rather than a second grouping: the server is the only place that can mint the id (it is an HMAC
 * keyed on `SESSION_SECRET`), and re-deriving the thread list from a second endpoint would be two
 * implementations of one grouping (§18 rule 1).
 */
export function useConversationThreads(): { threads: ConversationThread[]; isLoading: boolean } {
  const { user } = useAuth();
  const { data: chats, isLoading } = useChats();

  // The opaque conversation id per counterpart. Failure is SOFT: no map, no `publicId`, and the
  // callers fall back to their legacy id-addressed link — a thread the traveler can still open
  // beats a thread that renders as unreachable (§15b's posture: the ancillary read may not break
  // the surface it decorates).
  const { data: summaries } = useQuery<ConversationSummaryRow[]>({
    queryKey: ["/api/messages"],
    queryFn: async () => {
      const res = await fetch("/api/messages", { credentials: "include" });
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const publicIdByCounterpart = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of summaries ?? []) {
      if (typeof row?.publicId === "string" && typeof row?.otherUserId === "string") {
        map.set(row.otherUserId, row.publicId);
      }
    }
    return map;
  }, [summaries]);

  const threads = useMemo<ConversationThread[]>(() => {
    const byCounterpart = new Map<string, { row: any; latest: number; unreadCount: number }>();
    for (const c of (chats as any[] | null | undefined) ?? []) {
      const counterpartId = c.senderId === user?.id ? c.receiverId : c.senderId;
      if (!counterpartId) continue;
      const ts = c.createdAt ? +new Date(c.createdAt) : 0;
      const isUnreadIncoming = c.receiverId === user?.id && !c.readAt;
      const existing = byCounterpart.get(counterpartId);
      if (!existing) {
        byCounterpart.set(counterpartId, { row: c, latest: ts, unreadCount: isUnreadIncoming ? 1 : 0 });
      } else {
        if (ts > existing.latest) {
          existing.row = c;
          existing.latest = ts;
        }
        if (isUnreadIncoming) existing.unreadCount += 1;
      }
    }
    return Array.from(byCounterpart.entries())
      .sort((a, b) => b[1].latest - a[1].latest)
      .map(([counterpartId, { row, unreadCount }]) => ({
        counterpartId,
        publicId: publicIdByCounterpart.get(counterpartId) ?? null,
        displayName: row.participant?.displayName ?? null,
        avatarUrl: row.participant?.profileImageUrl || row.participant?.profileImage || null,
        lastMessage: row.message ?? null,
        lastMessageAt: row.createdAt ?? null,
        unreadCount,
      }));
  }, [chats, user?.id, publicIdByCounterpart]);

  return { threads, isLoading };
}
