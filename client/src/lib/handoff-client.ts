/**
 * Step 7b (R323; surface spec §12) — the client half of the ONE handoff door. Every "Hand off to a
 * local expert" and every "Book this for me" (item, leg, whole plan) asks for the SAME chooser
 * through `openHandoffChooser`; one host on the slip listens and opens it. Pure helpers here are
 * the words the banner and the rows say, stated once (§18 rule 1).
 */
import { HANDOFF_KIND_LABEL, findingLine, type HandoffBannerState, type HandoffKind } from "@shared/handoff";

export const HANDOFF_CHOOSER_EVENT = "traveloure:handoff-chooser";

export interface HandoffChooserRequest {
  kind?: HandoffKind | null;
  itemIds?: string[];
}

/** Open the ONE chooser (the slip mounts its host). Safe to call where no host is mounted. */
export function openHandoffChooser(req: HandoffChooserRequest = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<HandoffChooserRequest>(HANDOFF_CHOOSER_EVENT, { detail: req }));
}

export const handoffQueryKey = (tripId: string) => [`/api/trips/${tripId}/handoff`] as const;
export const expertSuggestionsQueryKey = (tripId: string) => [`/api/trips/${tripId}/expert-suggestions`] as const;

export interface ClientHandoff {
  id: string;
  tripId: string;
  kind: HandoffKind;
  status: string;
  scopeItemIds: string[];
  feeCents: number | null;
  travelerFeeCents: number | null;
  expertId: string | null;
  expertName: string | null;
  fallbackOfferedAt: string | null;
  deliveredAt: string | null;
  changeRounds: number;
  approvedAt: string | null;
  approvedBy: string | null;
  onTripSupportOfferedAt: string | null;
  onTripSupportAcceptedAt: string | null;
  prepaid: boolean;
  withdrawalFeeCents: number | null;
}

export interface HandoffRead {
  handoff: ClientHandoff | null;
  banner: HandoffBannerState;
  city: string | null;
  typicalAcceptHours: number | null;
  onTripSupportCents: number | null;
}

export interface ClientSuggestion {
  id: string;
  itemId: string | null;
  kind: string;
  status: string;
  summary: string;
  createdAt: string;
  expertId: string;
}

/** Pure. "$12.50" — or "Included" for a prepaid (price 0) ask. */
export function money(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "Included";
  return `$${(cents / 100).toFixed(2)}`;
}

/** Pure. The banner's one line for each state (§12 step 2 / 5). Null ⇒ no banner. */
export function handoffBannerLine(read: Pick<HandoffRead, "banner" | "city" | "typicalAcceptHours" | "handoff">): string | null {
  const b = read.banner;
  if (!b) return null;
  const who = read.handoff?.expertName ?? "Your local";
  switch (b.kind) {
    case "authorizing":
      return "Finish placing the hold on your card to send your ask.";
    case "finding":
      return findingLine(b.city ?? read.city, read.typicalAcceptHours);
    case "fallback_offered":
      return "No local has accepted yet. Our concierge can take this on now, or keep waiting.";
    case "released":
      return "No local was free in time — we released the hold on your card. Nothing was charged.";
    case "accepted":
      return `${who} is working on your plan. Their changes arrive as suggestions you accept or decline.`;
    case "delivered":
      return `${who} says your plan is ready. Approve it, or ask for changes.`;
    default:
      return null;
  }
}

/** Pure. What withdrawing costs, said before the tap (R-t). */
export function withdrawLine(h: ClientHandoff | null): string | null {
  if (!h) return null;
  if (h.status === "authorizing" || h.status === "proposed" || h.status === "unmatched") return "Withdraw — nothing is charged before a local accepts.";
  if (h.status === "accepted" || h.status === "delivered") return "Withdraw — part of the fee is kept now that your local has started.";
  return null;
}

/** Pure. The chooser's title for each answer. */
export function kindLabel(kind: HandoffKind): string {
  return HANDOFF_KIND_LABEL[kind];
}
