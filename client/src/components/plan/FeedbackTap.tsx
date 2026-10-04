/**
 * `FeedbackTap` — one line, the moment's chips and an optional text field (ledger
 * `2026-10-04-feedback-phase-a`). No modal, no stars, no "rate us". It renders only while the
 * server says its moment is OPEN for this plan and viewer (`GET /api/plans/:id/feedback`); once
 * answered or dismissed it never reappears for that plan and moment — persisted server-side, not
 * in browser storage. Codes, copy and the text cap come from the ONE registry (`shared/feedback.ts`).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FEEDBACK_DISMISSED,
  FEEDBACK_OTHER,
  FEEDBACK_PROMPT,
  TAP_TEXT_MAX,
  feedbackChipLabel,
  type FeedbackMoment,
} from "@shared/feedback";
import { GROUP_MANIFEST } from "@shared/group-manifest";

export interface FeedbackTapViewProps {
  moment: FeedbackMoment;
  codes: readonly string[];
  /** The plan group's time unit (the manifest's `timeUnit`) — chip copy that refers to time uses it. */
  timeUnit?: string | null;
  busy?: boolean;
  /** After an answer, the line becomes a thank-you with Undo for the rest of the visit. */
  answered?: string | null;
  onAnswer: (code: string, text?: string) => void;
  onDismiss: () => void;
  onUndo?: () => void;
}

const chip =
  "inline-flex min-h-[32px] items-center rounded-full border border-border px-3 text-xs font-medium hover:bg-muted/40 disabled:opacity-50";

export function FeedbackTapView({ moment, codes, timeUnit, busy = false, answered = null, onAnswer, onDismiss, onUndo }: FeedbackTapViewProps) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [text, setText] = useState("");
  if (answered) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`feedback-tap-${moment}`} data-feedback-state="answered">
        Thanks — that helps.{" "}
        {onUndo ? (
          <button type="button" className="underline underline-offset-2" onClick={onUndo} disabled={busy} data-testid="feedback-undo">
            Undo
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid={`feedback-tap-${moment}`} data-feedback-state="open">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{FEEDBACK_PROMPT[moment] ?? ""}</p>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
          onClick={onDismiss}
          disabled={busy}
          data-testid="feedback-dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {codes.map((code) => (
          <button
            key={code}
            type="button"
            className={chip}
            disabled={busy}
            aria-pressed={code === FEEDBACK_OTHER ? otherOpen : undefined}
            onClick={() => (code === FEEDBACK_OTHER ? setOtherOpen((o) => !o) : onAnswer(code))}
            data-testid={`feedback-chip-${code}`}
          >
            {feedbackChipLabel(code, timeUnit)}
          </button>
        ))}
      </div>
      {otherOpen ? (
        <div className="space-y-1.5">
          <textarea
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            rows={2}
            maxLength={TAP_TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What would make it fit?"
            data-testid="feedback-text"
          />
          <button
            type="button"
            className={chip}
            disabled={busy}
            onClick={() => onAnswer(FEEDBACK_OTHER, text)}
            data-testid="feedback-send"
          >
            Send
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The container: reads whether the moment is open, writes answers, dismissals and undo. */
export function FeedbackTap({ tripId, moment, codes, onDone }: { tripId: string; moment: FeedbackMoment; codes: readonly string[]; onDone?: () => void }) {
  const key = [`/api/plans/${tripId}/feedback`];
  const { data } = useQuery<{ open: FeedbackMoment[]; answers: Record<string, { code: string }>; groupKey: string }>({ queryKey: key });
  const [answered, setAnswered] = useState<string | null>(null);
  const write = useMutation({
    mutationFn: async (body: { code: string; text?: string }) =>
      (await apiRequest("POST", `/api/plans/${tripId}/feedback`, { moment, code: body.code, ...(body.text ? { text: body.text } : {}) })).json(),
    onSuccess: (_out, body) => {
      if (body.code === FEEDBACK_DISMISSED) void queryClient.invalidateQueries({ queryKey: key });
      else setAnswered(body.code);
      onDone?.();
    },
  });
  const undo = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/plans/${tripId}/feedback`, { moment })).json(),
    onSuccess: () => {
      setAnswered(null);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  if (!answered && !data?.open?.includes(moment)) return null;
  const timeUnit = data?.groupKey ? (GROUP_MANIFEST as any)[data.groupKey]?.timeUnit ?? null : null;
  return (
    <FeedbackTapView
      moment={moment}
      codes={codes}
      timeUnit={timeUnit}
      busy={write.isPending || undo.isPending}
      answered={answered}
      onAnswer={(code, text) => write.mutate({ code, text })}
      onDismiss={() => write.mutate({ code: FEEDBACK_DISMISSED })}
      onUndo={() => undo.mutate()}
    />
  );
}
