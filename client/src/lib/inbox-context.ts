/**
 * WHAT A CONVERSATION IS ABOUT, on the client (ledger `2026-09-07-inbox-context`; Console & AI
 * Concierge brief §10 row L13 — CLAUDE.md Locked Decision 40 and its D22 `advisor` amendment).
 *
 * The server already resolves and LABELS every thread's `conversation_contexts` rows
 * (`listConversationContexts` → `contextLabel`, emitted on `GET /api/messages`). This module does
 * the join and NOTHING else: it resolves no name, writes no label and knows no kind vocabulary of
 * its own. A client-side labeller would be the derivation-drift class §18 rule 1 names, and it
 * would drift the first time a fifth kind lands — which `context_kind` is deliberately able to do
 * without a migration (no DB CHECK, LD 40's own note).
 *
 * It is a plain module rather than part of the hook so it keeps its proof with no React.
 */

/** One context row as the server resolved it. `id` is a handle / service / booking / trip id —
 *  never a `users.id` (Locked Decision 40; `check-public-user-id`). It is a key, never printed. */
export interface ConversationThreadContext {
  kind: "storefront" | "service" | "booking" | "advisor";
  id: string;
  label: string;
}

/** One row of `GET /api/messages` — only the fields the thread list reads are declared. */
export interface ConversationSummaryRow {
  publicId?: string | null;
  otherUserId?: string | null;
  contexts?: ConversationThreadContext[] | null;
}

/**
 * The join, keyed by counterpart — the same key `publicId` is joined on, and deliberately the same
 * READ, because `/api/messages` is the one place these are resolved (§18 rule 1).
 *
 * §13, AND IT IS THE POINT OF THE LANE: a thread with no context rows is simply ABSENT from this
 * map, and the row then draws no chip. It is never given a kind — "storefront" is a claim nobody
 * made — and there is no backfill behind it: migration 287 was deliberately written without one,
 * so an OLDER thread has nothing to show and says nothing. A context whose LABEL the server could
 * not produce is dropped for the same reason: a wordless chip says something without saying what.
 */
export function contextsByCounterpartId(
  summaries: readonly ConversationSummaryRow[] | null | undefined,
): Map<string, ConversationThreadContext[]> {
  const map = new Map<string, ConversationThreadContext[]>();
  for (const row of summaries ?? []) {
    if (typeof row?.otherUserId !== "string" || !Array.isArray(row?.contexts)) continue;
    const rows = row.contexts.filter(
      (c): c is ConversationThreadContext =>
        !!c && typeof c.kind === "string" && typeof c.label === "string" && c.label.trim().length > 0,
    );
    if (rows.length > 0) map.set(row.otherUserId, rows);
  }
  return map;
}
