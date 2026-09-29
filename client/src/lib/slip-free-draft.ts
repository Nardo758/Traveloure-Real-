/**
 * THE FREE DRAFT CALL — one home (§18 rule 1). The slip rail's "Draft it with AI" and the expert
 * door's "Check my plan" / empty-state action both run the SAME free draft (LD 41 (b): only on an
 * empty slip; the server refuses otherwise with its own sentence, read through
 * `readSlipHasItemsRefusal`). Extracted from `SlipRail.tsx` by ledger `2026-09-29-expert-door`.
 */
import { readSlipHasItemsRefusal } from "@/lib/ai-draft-refusal";

export interface FreeDraftTrip {
  id: string;
  destination: string;
  startDate: string | Date;
  endDate: string | Date;
  travelers?: number | null;
}

export async function runFreeDraft(trip: FreeDraftTrip): Promise<unknown> {
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
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // The server's OWN sentence for a non-empty slip — never a second copy of the rule.
    const refusal = readSlipHasItemsRefusal(res.status, body);
    if (refusal) throw new Error(refusal.message);
    throw new Error(body?.message || "Couldn't draft this plan");
  }
  return res.json();
}
