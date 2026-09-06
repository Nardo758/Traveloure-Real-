import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, ChevronDown, ChevronUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { parseApiErrorMessage } from "@/lib/api-error";

/**
 * Per-item plan comment thread (QA_PUNCH_LIST W3-C item 12; migration 165).
 *
 * The communication half of the delivery loop: "can we do this earlier?" lives on the item,
 * not in detached chat. Shared between the Trip Card (client/src/components/plancard/
 * ActivitiesSection.tsx, owner-facing) and the Workstation item editor
 * (client/src/pages/expert/workspace.tsx ItemsEditorPanel, expert-facing) — same component,
 * same server contract (GET/POST /api/trips/:tripId/items/:itemId/comments,
 * server/routes/booking-actions.ts), plain shadcn/Tailwind tokens so it reads correctly on
 * both the traveler surface's cool palette and the console's warm palette (the same posture
 * other shared cross-surface pickers in this codebase already use, e.g.
 * client/src/components/expert/transport-picker.tsx).
 *
 * §13: `authorName` is a real server-side join to `users` (never guessed client-side); an
 * empty thread renders "No comments yet", never a fabricated count.
 */

interface ItemCommentRow {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ItemComments({
  tripId,
  itemId,
  className,
  label,
  hideCount,
}: {
  tripId: string;
  itemId: string;
  className?: string;
  /**
   * What the MOUNTING SURFACE calls this thread (ledger `2026-09-06-slip-conformance`). The slip's
   * item row says "Ask your expert about this" — the ratified `ItemRow` artboard's own words, held
   * in `@/lib/slip-item-tools` beside the slip's other row labels. Absent = the default below, so
   * the Trip Card and the Workstation mounts are byte-identical to what they were.
   *
   * A PROP, NOT A FORK. One component, one server contract; a second per-item thread beside this
   * one because a surface wanted different words is the drift class §18 rule 1 names, and it is how
   * the traveler's question and the expert's answer end up in two places.
   */
  label?: string;
  /**
   * Suppress the comment count on the toggle (the slip mount — the artboard draws none).
   *
   * §13 — this hides a REAL number, it never substitutes a fake one: the count still comes from
   * this component's own per-item read and still renders inside the opened thread. Nothing here
   * ever displays a count derived from anywhere but the thread it describes.
   */
  hideCount?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const commentsUrl = `/api/trips/${tripId}/items/${itemId}/comments`;

  // Fetched unconditionally (not gated on `open`) so the toggle can show a real count before
  // the thread is expanded — a fabricated/static count would violate §13, so this is a real
  // per-item read rather than a guess. Item rows per day are few, so this stays cheap.
  const { data, isLoading } = useQuery<{ comments: ItemCommentRow[] }>({
    queryKey: [commentsUrl],
  });
  const comments = data?.comments ?? [];

  const postMutation = useMutation({
    mutationFn: async (body: string) => apiRequest("POST", commentsUrl, { body }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: [commentsUrl] });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't post comment",
        description: parseApiErrorMessage(err, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const body = draft.trim();
    if (!body || postMutation.isPending) return;
    postMutation.mutate(body);
  };

  return (
    <div className={className} data-testid={`item-comments-${itemId}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`button-toggle-comments-${itemId}`}
      >
        <MessageSquare className="w-3 h-3" />
        <span>
          {/* The surface's own label wins; without one, the historic count/"Comment" toggle. When
              the mount suppresses the count the label is the whole of it — never a "0" and never a
              count from anywhere but this thread's own read (§13). */}
          {label
            ? label
            : !hideCount && comments.length > 0
              ? `${comments.length} comment${comments.length > 1 ? "s" : ""}`
              : "Comment"}
        </span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div
          className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-2.5"
          data-testid={`comment-thread-${itemId}`}
        >
          {isLoading && (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          )}
          {!isLoading && comments.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No comments yet.</p>
          )}
          {comments.map((c) => (
            <div key={c.id} data-testid={`comment-${c.id}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12px] font-semibold text-foreground" data-testid={`comment-author-${c.id}`}>
                  {c.authorName}
                </span>
                <span className="text-[10px] text-muted-foreground" data-testid={`comment-time-${c.id}`}>
                  {formatCommentTime(c.createdAt)}
                </span>
              </div>
              <p
                className="text-[12px] text-muted-foreground whitespace-pre-wrap break-words"
                data-testid={`comment-body-${c.id}`}
              >
                {c.body}
              </p>
            </div>
          ))}

          <div className="flex items-end gap-1.5 pt-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              maxLength={2000}
              rows={1}
              className="min-h-0 resize-none text-[12px] py-1.5"
              data-testid={`textarea-comment-${itemId}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={handleSubmit}
              disabled={!draft.trim() || postMutation.isPending}
              data-testid={`button-send-comment-${itemId}`}
              title="Send"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
