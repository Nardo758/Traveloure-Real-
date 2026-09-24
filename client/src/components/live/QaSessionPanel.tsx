/**
 * A Q&A SESSION ON A BOOKING — one panel, both people (Locked Decision 54, ledger
 * `2026-09-24-live-chat-qa-sessions`).
 *
 * Reads `GET /api/qa-sessions/:bookingId` and draws NOTHING when the server answers 404 — that is
 * the server saying "not a Q&A Session, or not yours", so this page never guesses which bookings
 * are Q&A Sessions (§18 rule 1, the `BundleComponentsPanel` precedent). Start calls the ONE start
 * rail; the countdown is read off the server's own `endsAt` and the chat opens through the booking
 * address (LD 40 — `{ bookingId }`, never a user id).
 *
 * NOTHING LOCKS AT ZERO. The chat stays open after the paid window; the panel says the time is up
 * and nothing more. Completion stays the existing "mark complete" rail for messaging listings.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, Timer } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiRefusalMessage } from "@/lib/api-refusal";
import { useToast } from "@/hooks/use-toast";
import { conversationChatPath, startConversation } from "@/lib/earner-address";
import { qaSessionLengthLabel, qaSessionState, type QaSessionState } from "@shared/live-availability";

interface QaSessionView {
  bookingId: string;
  serviceName: string | null;
  viewer: "traveler" | "expert";
  status: string | null;
  paid: boolean;
  lengthMinutes: number | null;
  lengthSource: "purchase" | "listing";
  state: QaSessionState | null;
  canStart: boolean;
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function QaSessionPanel({ bookingId }: { bookingId: string }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [now, setNow] = useState(() => new Date());
  const [opening, setOpening] = useState(false);
  const queryKey = [`/api/qa-sessions/${bookingId}`];

  const { data } = useQuery<QaSessionView | null>({
    queryKey,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/qa-sessions/${bookingId}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Could not load the session");
      return res.json();
    },
  });

  // Re-derive the phase off the server's stamp every second while a session is live.
  const stamp = data?.state && data.state.phase !== "not_started" ? data.state : null;
  const live = !!stamp && new Date(stamp.endsAt).getTime() > now.getTime();
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const start = useMutation({
    mutationFn: () => apiRequest("POST", `/api/qa-sessions/${bookingId}/start`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Session started", description: "The clock is running — open the chat to begin." });
    },
    onError: (err: unknown) =>
      toast({
        title: "Not started",
        description: apiRefusalMessage(err, "This session can't be started yet."),
        variant: "destructive",
      }),
  });

  if (!data || !data.lengthMinutes) return null;

  const state: QaSessionState = stamp
    ? qaSessionState(data.lengthMinutes, stamp, now)
    : { phase: "not_started", lengthMinutes: data.lengthMinutes };
  const other = data.viewer === "traveler" ? "your expert" : "your traveler";

  const openChat = async () => {
    setOpening(true);
    const started = await startConversation({ bookingId });
    setOpening(false);
    if (!started) {
      toast({ title: "Chat unavailable", description: "The conversation could not be opened.", variant: "destructive" });
      return;
    }
    navigate(
      conversationChatPath(started.conversationId, {
        name: started.recipient.displayName || null,
        avatar: started.recipient.avatarUrl,
      }),
    );
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3" data-testid={`qa-session-panel-${bookingId}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Timer className="w-4 h-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">{qaSessionLengthLabel(data.lengthMinutes)} Q&amp;A session</span>
        {state.phase === "live" && (
          <span
            className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-xs font-medium text-[#15803D]"
            data-testid={`qa-session-remaining-${bookingId}`}
          >
            Live · {formatRemaining(state.remainingMs)} left
          </span>
        )}
        {state.phase === "ended" && (
          <span className="text-xs text-muted-foreground" data-testid={`qa-session-ended-${bookingId}`}>
            Session time is up — the chat stays open.
          </span>
        )}
      </div>

      {state.phase === "not_started" && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid={`qa-session-not-started-${bookingId}`}>
          {data.paid
            ? `The clock starts when you or ${other} press Start.`
            : "You can start the session once payment has gone through."}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {data.canStart && state.phase === "not_started" && (
          <Button
            size="sm"
            onClick={() => start.mutate()}
            disabled={start.isPending}
            data-testid={`button-qa-session-start-${bookingId}`}
          >
            {start.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Timer className="w-4 h-4 mr-1" />}
            Start session
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={openChat}
          disabled={opening}
          data-testid={`button-qa-session-chat-${bookingId}`}
        >
          {opening ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-1" />}
          Open chat
        </Button>
      </div>
    </div>
  );
}
