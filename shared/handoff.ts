/**
 * THE HANDOFF (step 7b, R323; surface spec §12; rulings R-n, R-q, R-s, R-t, R-bd). Pure: the
 * vocabularies and the decisions every surface and the server read ONCE (§18 rule 1).
 *
 * "The slip doesn't move, the pen does": one plan; a handoff changes who holds the pen on which
 * items. An expert never writes a traveler's plan — every change is an `expert_suggestions` row the
 * traveler accepts or declines (R-n). The money: authorized at Ask, captured on the expert's accept,
 * released if nobody accepts (R-q); the expert is paid on approval (R-n), which auto-applies after
 * the window (R-s); withdrawing costs nothing before accept and a band-named share after (R-t).
 */

/** The chooser's three answers (§12 step 1). */
export const HANDOFF_KINDS = ["polish", "book", "plan_all"] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];

export const HANDOFF_KIND_LABEL: Record<HandoffKind, string> = {
  polish: "Polish my plan",
  book: "Book these for me",
  plan_all: "Plan it all",
};

export const HANDOFF_KIND_LINE: Record<HandoffKind, string> = {
  polish: "A local reviews the stops you tick and suggests changes you accept or decline.",
  book: "A local checks the stops you tick and books them in your name; you pay each booking before it's made.",
  plan_all: "A local plans the whole trip with you and books it; accept their changes one by one or all at once.",
};

/**
 * The expert-review fee tier each answer is priced by — the EXISTING bands (`expert_review_*`,
 * `full_concierge_*`, migration 137) through the EXISTING `resolveExpertReviewAmount`. No new rate.
 */
export const HANDOFF_FEE_TIER: Record<HandoffKind, "review" | "review_and_book" | "full_concierge"> = {
  polish: "review",
  book: "review_and_book",
  plan_all: "full_concierge",
};

/** A handoff row's status (app-enforced on `expert_requests.status`; legacy rows keep their own). */
export const HANDOFF_STATUSES = [
  "authorizing", // the row exists; the card hold is being placed
  "proposed", // matched; waiting for the expert to accept
  "unmatched", // routing found nobody; admin can assign
  "accepted", // the expert took it; the fee is captured; the pen is theirs on the scope
  "delivered", // the expert marked it ready; waiting for the traveler
  "approved", // the traveler approved (or the window did); the expert is paid; the pen returned
  "withdrawn", // the traveler withdrew
  "released", // nobody accepted in time; the hold was released
] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

/** Live = the request still holds or may still hold the pen. */
export const HANDOFF_LIVE_STATUSES: readonly HandoffStatus[] = ["proposed", "unmatched", "accepted", "delivered"];

export const SUGGESTION_KINDS = ["edit", "add", "remove", "move", "leg"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
export const SUGGESTION_STATUSES = ["pending", "accepted", "declined", "superseded"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** R-s: two rounds of "request changes" are included; a third is a new ask. */
export const HANDOFF_CHANGE_ROUNDS_INCLUDED = 2;

/** R-t: what stage a withdrawal is at, and the band that names its fee. Before accept: none. */
export type WithdrawalStage = "before_accept" | "after_accept" | "after_delivery";
export const WITHDRAWAL_FEE_BAND: Record<Exclude<WithdrawalStage, "before_accept">, string> = {
  after_accept: "handoff_withdrawal_accepted",
  after_delivery: "handoff_withdrawal_delivered",
};
export const ON_TRIP_SUPPORT_BAND = "on_trip_support";

export function withdrawalStage(status: string | null | undefined): WithdrawalStage | null {
  if (status === "authorizing" || status === "proposed" || status === "unmatched") return "before_accept";
  if (status === "accepted") return "after_accept";
  if (status === "delivered") return "after_delivery";
  return null; // approved / withdrawn / released — nothing left to withdraw from
}

/**
 * Pure (R-t). Cents KEPT on a withdrawal of a captured fee: the band's share of the fee, rounded
 * to the cent and never more than the fee. A missing or non-positive band keeps NOTHING — the
 * traveler-safe answer for a fee no one has set (§13); the caller logs it.
 */
export function withdrawalKeptCents(feeCents: number, bandShare: number | null): number {
  if (!(feeCents > 0) || bandShare == null || !(bandShare > 0)) return 0;
  return Math.min(feeCents, Math.round(feeCents * Math.min(bandShare, 1)));
}

/** Pure (§12 step 5). Why the expert cannot mark delivered yet, or null. */
export function deliverRefusal(input: {
  status: string | null;
  kind: HandoffKind | string | null;
  openSuggestions: number;
  unbookedInScope: number;
}): "not_accepted" | "open_suggestions" | "unbooked_items" | null {
  if (input.status !== "accepted") return "not_accepted";
  if (input.openSuggestions > 0) return "open_suggestions";
  if ((input.kind === "book" || input.kind === "plan_all") && input.unbookedInScope > 0) return "unbooked_items";
  return null;
}

/** Pure (R-s). May the traveler ask for another round? */
export function changeRoundAllowed(changeRounds: number | null | undefined): boolean {
  return (changeRounds ?? 0) < HANDOFF_CHANGE_ROUNDS_INCLUDED;
}

/** The banner's state for a live request (§12 step 2), from the row and the clock. */
export type HandoffBannerState =
  | { kind: "authorizing" }
  | { kind: "finding"; city: string | null }
  | { kind: "fallback_offered" }
  | { kind: "released" }
  | { kind: "accepted" }
  | { kind: "delivered" }
  | null;

export function handoffBannerState(row: {
  status: string | null;
  fallbackOfferedAt?: string | Date | null;
  city?: string | null;
}): HandoffBannerState {
  if (row.status === "released") return { kind: "released" };
  if (row.status === "authorizing") return { kind: "authorizing" };
  if (row.status === "proposed" || row.status === "unmatched") {
    return row.fallbackOfferedAt ? { kind: "fallback_offered" } : { kind: "finding", city: row.city ?? null };
  }
  if (row.status === "accepted") return { kind: "accepted" };
  if (row.status === "delivered") return { kind: "delivered" };
  return null;
}

/** "Finding your Kyoto local · usually within N hours" — the N only when measured (§13). */
export function findingLine(city: string | null, typicalHours: number | null): string {
  const who = city ? `Finding your ${city} local` : "Finding your local";
  return typicalHours != null && typicalHours > 0 ? `${who} · usually within ${typicalHours} hour${typicalHours === 1 ? "" : "s"}` : who;
}

/** The §9 instrumentation events, named once. */
export const HANDOFF_EVENTS = {
  requested: "handoff_requested",
  accepted: "handoff_accepted",
  suggestionAccepted: "handoff_suggestion_accepted",
  approved: "handoff_approved",
} as const;
