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
  /** When the expert accepted (the projection carries it; NULL before accept). */
  acceptedAt?: string | null;
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
    case "withdrawn":
      // Smoke 13 #5: the confirmation after Withdraw, said by the server's own state.
      return b.holdReleased
        ? HANDOFF_WITHDRAWN_HOLD_RELEASED
        : "Request withdrawn — what isn't kept is refunded to your card.";
    default:
      return null;
  }
}

/** Smoke 13 #5: the confirmation a withdrawal before any capture reads. */
export const HANDOFF_WITHDRAWN_HOLD_RELEASED = "Request withdrawn — hold released";

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

// ── THE HANDOFF BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-handoff-board`) ──
// "The slip doesn't move, the pen does." Every phrase the board look prints, stated once. Each one is
// a real value or nothing at all (§13): no neighbourhood, reason or host count is invented.

/** Pure. The expert holds the pen on the scope while the request is accepted or delivered. */
export function handoffHoldsPen(h: Pick<ClientHandoff, "status"> | null | undefined): boolean {
  return !!h && (h.status === "accepted" || h.status === "delivered");
}

/** Pure. The scope's item ids while the pen is held; empty otherwise. */
export function handoffPenScope(h: Pick<ClientHandoff, "status" | "scopeItemIds"> | null | undefined): ReadonlySet<string> {
  return new Set(handoffHoldsPen(h) ? (h!.scopeItemIds ?? []).map(String) : []);
}

/** Pure. Who holds the pen, by the name the server disclosed (never before accept). */
export function handoffExpertLabel(h: Pick<ClientHandoff, "expertName"> | null | undefined): string {
  return h?.expertName?.trim() || "your local";
}

/** Pure. The board banner's title: "Ana has your plan". */
export function handoffBoardTitle(h: Pick<ClientHandoff, "expertName">): string {
  const who = h.expertName?.trim();
  return who ? `${who} has your plan` : "Your local has your plan";
}

/** Pure. "40 min ago" / "3 h ago" / "2 days ago" — null when the instant is missing or unreadable. */
export function handoffAgo(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.floor((nowMs - t) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Pure. The banner's subline: "Polish my plan · 3 stops · accepted 40 min ago". */
export function handoffBoardSubline(h: Pick<ClientHandoff, "kind" | "scopeItemIds" | "acceptedAt" | "deliveredAt" | "status">, nowMs: number): string {
  const n = (h.scopeItemIds ?? []).length;
  const parts: string[] = [HANDOFF_KIND_LABEL[h.kind] ?? "Help with your plan"];
  if (n > 0) parts.push(`${n} stop${n === 1 ? "" : "s"}`);
  const ago = h.status === "delivered" ? handoffAgo(h.deliveredAt, nowMs) : handoffAgo(h.acceptedAt, nowMs);
  if (ago) parts.push(`${h.status === "delivered" ? "ready" : "accepted"} ${ago}`);
  return parts.join(" · ");
}

/** Pure. The banner's pills; a zero count or an unknown fee is omitted, never "0". */
export function handoffBoardPills(input: {
  pending: number;
  booked: number | null;
  handoff: Pick<ClientHandoff, "status" | "feeCents" | "travelerFeeCents" | "prepaid">;
}): { key: "suggestions" | "booked" | "fee"; text: string }[] {
  const out: { key: "suggestions" | "booked" | "fee"; text: string }[] = [];
  if (input.pending > 0) out.push({ key: "suggestions", text: `${input.pending} suggestion${input.pending === 1 ? "" : "s"} waiting` });
  if (input.booked && input.booked > 0) out.push({ key: "booked", text: `${input.booked} booked` });
  const h = input.handoff;
  // R323: the fee is CAPTURED on the expert's accept, so from accept on it is paid.
  if (["accepted", "delivered", "approved"].includes(h.status)) {
    if (h.prepaid) out.push({ key: "fee", text: "included with your plan" });
    else {
      const total = (h.feeCents ?? 0) + (h.travelerFeeCents ?? 0);
      if (total > 0) out.push({ key: "fee", text: `fee paid · ${money(total)}` });
    }
  }
  return out;
}

/** Pure. The day header's extra stat: "3 with Ana · 2 yours" — null when none of the day is in scope. */
export function handoffDayStat(dayItemIds: readonly string[], scope: ReadonlySet<string>, who: string, isOwner: boolean): string | null {
  if (!scope.size) return null;
  const withExpert = dayItemIds.filter((id) => scope.has(id)).length;
  if (!withExpert) return null;
  const rest = dayItemIds.length - withExpert;
  return [`${withExpert} with ${who}`, isOwner && rest > 0 ? `${rest} yours` : null].filter(Boolean).join(" · ");
}

/** Pure. The footer's sentence while the expert is still working (R323: paid on approval only). */
export function handoffFooterLine(who: string): string {
  return `You'll get a summary and two buttons: Approve, or Request changes. Approve hands every item back to you and pays ${who}. Nothing is paid to them before that.`;
}
