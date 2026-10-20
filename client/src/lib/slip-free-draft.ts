/**
 * THE FREE DRAFT CALL — one home (§18 rule 1). The slip rail's "Draft it with AI" and the expert
 * door's "Check my plan" / empty-state action both run the SAME free draft (LD 41 (b): only on an
 * empty slip; the server refuses otherwise with its own sentence, read through
 * `readSlipHasItemsRefusal`). Extracted from `SlipRail.tsx` by ledger `2026-09-29-expert-door`.
 *
 * SMOKE 4, item 5 (ledger `2026-10-02-smoke4-draft-fixes`; decision-maker, Oct 2, 2026: "Hotel is
 * optional and recommended after the draft, not asked before it"): "Draft it with AI" ALWAYS
 * drafts. The client sends the explicit skip (`withoutAnchor`) on every call, so a Trip with no place
 * to stay and no places being compared is drafted without one (`none_asked`) and the slip then
 * recommends where to stay. This supersedes A5's "never sent on their behalf" for this client path.
 * The server's 409 `anchor_needed` stays as a defensive answer for a caller that sends neither a
 * hotel nor the skip; here it would surface as an ordinary error.
 */
import { readSlipHasItemsRefusal } from "@/lib/ai-draft-refusal";

/** The toast and the inline alert share this title. The description is the server's sentence. */
export const AI_DRAFT_FAILURE_TITLE = "Couldn't draft this plan";

export interface AiDraftFailureNotice {
  title: string;
  description: string;
}

/**
 * A real model failure, as the server already answers it (`aiFailureResponse`):
 * 502 `ai_unavailable` ("Planning is temporarily unavailable.") or 503 high demand.
 * The client does not restate the sentence — it shows `body.message`.
 * Anything else (a refusal, a 500, a body with no message) is null so the caller keeps its own path.
 */
export function readAiDraftFailure(status: number, body: unknown): AiDraftFailureNotice | null {
  if (status !== 502 && status !== 503) return null;
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  const message = typeof rec.message === "string" ? rec.message.trim() : "";
  if (!message) return null;
  const unavailable = status === 502 && rec.code === "ai_unavailable" && rec.retryable === false;
  const highDemand =
    status === 503 &&
    (rec.code === "ai_unavailable" || rec.retryable === true || typeof rec.retryAfterSeconds === "number");
  if (!unavailable && !highDemand) return null;
  return { title: AI_DRAFT_FAILURE_TITLE, description: message };
}

/** Thrown when the draft route answers a real model failure, so the slip can show that notice. */
export class FreeDraftFailure extends Error {
  readonly notice: AiDraftFailureNotice;
  constructor(notice: AiDraftFailureNotice) {
    super(notice.description);
    this.name = "FreeDraftFailure";
    this.notice = notice;
  }
}

export interface FreeDraftTrip {
  id: string;
  destination: string;
  startDate: string | Date;
  endDate: string | Date;
  travelers?: number | null;
}

export type FreeDraftResult = { kind: "drafted"; basisLine: string | null };

export async function runFreeDraft(trip: FreeDraftTrip): Promise<FreeDraftResult> {
  const res = await fetch("/api/ai/generate-itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      tripId: trip.id,
      destination: trip.destination,
      dates: { start: String(trip.startDate).slice(0, 10), end: String(trip.endDate).slice(0, 10) },
      // RC-12: a party nobody stated is not sent; the draft route plans without one.
      ...(trip.travelers ? { travelers: trip.travelers } : {}),
      withoutAnchor: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server's OWN sentence for a non-empty slip — never a second copy of the rule.
    const refusal = readSlipHasItemsRefusal(res.status, body);
    if (refusal) throw new Error(refusal.message);
    const modelFailure = readAiDraftFailure(res.status, body);
    if (modelFailure) throw new FreeDraftFailure(modelFailure);
    throw new Error(body?.message || AI_DRAFT_FAILURE_TITLE);
  }
  const line = typeof body?.draftBasis?.line === "string" ? body.draftBasis.line : null;
  return { kind: "drafted", basisLine: line };
}
