import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// NOTE: deliberately NOT importing `api` from "@shared/routes" here — that module
// statically imports the entire shared DB schema (~257KB chunk), and this hook is in
// the EAGER bundle graph (dashboard-sidebar → App), so the import dragged the schema
// chunk into every first paint including the homepage. The literal below must match
// api.chats.list.path ("/api/chats") so query-key invalidation stays in sync with
// useConversationThreads/use-chat.ts.
const CHATS_LIST_PATH = "/api/chats";

/**
 * W5-E (mark-read wiring): client-side mirror of the server's
 * `buildConversationId` (server/services/messages.service.ts) — a conversation is keyed by the
 * sorted pair of participant user ids joined by "_". User ids are UUIDs (no "_" in a UUID), so
 * this is unambiguous and matches the server's `parseConversationId` exactly.
 */
export function buildConversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join("_");
}

/** GET /api/messages/unread/count — real, session-scoped count of the caller's unread received
 *  messages (server/routes/messages.ts). Used to sum into the Inbox badge alongside the existing
 *  notifications count (§13 — no fabricated numbers, two real sources summed). */
export function useUnreadMessageCount(enabled = true) {
  return useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread/count"],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/**
 * PATCH /api/messages/conversation/:conversationId/read-all — marks every unread message the
 * session user RECEIVED in that conversation as read (server-scoped to `receiverId = session
 * user`; the caller's own sent messages are never touched — verified in
 * server/services/messages.service.ts `markConversationRead`). Idempotent: re-marking an
 * already-read conversation is a no-op.
 *
 * Invalidates both the aggregate unread count and the `/api/chats` list (the same query
 * `useConversationThreads`/chat.tsx read for `readAt`-derived per-thread unread indicators), so
 * every badge drops immediately without a page reload.
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      apiRequest("PATCH", `/api/messages/conversation/${conversationId}/read-all`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread/count"] });
      queryClient.invalidateQueries({ queryKey: [CHATS_LIST_PATH] });
    },
  });
}
