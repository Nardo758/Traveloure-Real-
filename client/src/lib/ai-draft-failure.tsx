import type { AiDraftFailureNotice } from "@/lib/slip-free-draft";

/** The traveler-facing error for a real model failure (502 `ai_unavailable` or 503 high demand). */
export function AiDraftFailureAlert({ notice }: { notice: AiDraftFailureNotice }) {
  return (
    <div
      role="alert"
      data-testid="ai-draft-failure"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
    >
      <p className="font-medium" data-testid="ai-draft-failure-title">
        {notice.title}
      </p>
      <p data-testid="ai-draft-failure-message">{notice.description}</p>
    </div>
  );
}
