/**
 * THE FREE DRAFT CALL — one home (§18 rule 1). The slip rail's "Draft it with AI" and the expert
 * door's "Check my plan" / empty-state action both run the SAME free draft (LD 41 (b): only on an
 * empty slip; the server refuses otherwise with its own sentence, read through
 * `readSlipHasItemsRefusal`). Extracted from `SlipRail.tsx` by ledger `2026-09-29-expert-door`.
 *
 * A5 (ledger `2026-09-29-a5-draft-open-set`; §M5): a Trip with no place to stay and no places being
 * compared is ASKED where the traveler is staying instead of drafted. That is an answer, not an
 * error — `runFreeDraft` returns it, and the caller shows the question. "Draft without a hotel" is
 * the traveler's own answer (`withoutAnchor`), never sent on their behalf.
 */
import { readSlipHasItemsRefusal } from "@/lib/ai-draft-refusal";
import { ANCHOR_NEEDED_ERROR } from "@shared/draft-basis";

export interface FreeDraftTrip {
  id: string;
  destination: string;
  startDate: string | Date;
  endDate: string | Date;
  travelers?: number | null;
}

export type FreeDraftResult =
  | { kind: "drafted"; basisLine: string | null }
  | { kind: "anchor_needed"; message: string };

export async function runFreeDraft(trip: FreeDraftTrip, opts: { withoutAnchor?: boolean } = {}): Promise<FreeDraftResult> {
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
      ...(opts.withoutAnchor ? { withoutAnchor: true } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409 && body?.error === ANCHOR_NEEDED_ERROR && typeof body?.message === "string") {
    return { kind: "anchor_needed", message: body.message };
  }
  if (!res.ok) {
    // The server's OWN sentence for a non-empty slip — never a second copy of the rule.
    const refusal = readSlipHasItemsRefusal(res.status, body);
    if (refusal) throw new Error(refusal.message);
    throw new Error(body?.message || "Couldn't draft this plan");
  }
  const line = typeof body?.draftBasis?.line === "string" ? body.draftBasis.line : null;
  return { kind: "drafted", basisLine: line };
}
