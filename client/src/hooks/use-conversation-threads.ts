import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useChats } from "@/hooks/use-chat";

export interface ConversationThread {
  /** The other party's user id — sender or receiver, whichever isn't the session user. */
  counterpartId: string;
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
 */
export function useConversationThreads(): { threads: ConversationThread[]; isLoading: boolean } {
  const { user } = useAuth();
  const { data: chats, isLoading } = useChats();

  const threads = useMemo<ConversationThread[]>(() => {
    const byCounterpart = new Map<string, { row: any; latest: number }>();
    for (const c of (chats as any[] | null | undefined) ?? []) {
      const counterpartId = c.senderId === user?.id ? c.receiverId : c.senderId;
      if (!counterpartId) continue;
      const ts = c.createdAt ? +new Date(c.createdAt) : 0;
      const existing = byCounterpart.get(counterpartId);
      if (!existing || ts > existing.latest) {
        byCounterpart.set(counterpartId, { row: c, latest: ts });
      }
    }
    return Array.from(byCounterpart.entries())
      .sort((a, b) => b[1].latest - a[1].latest)
      .map(([counterpartId, { row }]) => ({
        counterpartId,
        displayName: row.participant?.displayName ?? null,
        avatarUrl: row.participant?.profileImageUrl || row.participant?.profileImage || null,
        lastMessage: row.message ?? null,
        lastMessageAt: row.createdAt ?? null,
      }));
  }, [chats, user?.id]);

  return { threads, isLoading };
}
