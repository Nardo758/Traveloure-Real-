/**
 * THE ASK-AI DRAWER'S ONE HOME FOR ITS COPY AND ITS DERIVATIONS.
 *
 * (L16 lanes 2 and 3; ledger `2026-09-16-l16-lanes2-3-drawer`. Brief of record:
 *  `docs/design/ASK_AI_DRAWER_BRIEF.md` §5 — the visibility table (§5.2), the flow (§5.3) and the
 *  ten copy rules (§5.4) — and the LOCKED rulings **D-45..D-50** (§7.1, ledger
 *  `2026-09-16-l16-rulings-d45-d50`). CLAUDE.md Locked Decision 45 (3), Locked Decision 41 (b)/(c),
 *  Locked Decision 42 **D16** / **D18** / **D23**, §8, §13, §14, §18 rule 1.)
 *
 * ── WHY A MODULE AND NOT PROSE IN THE COMPONENT ──────────────────────────────────────────────
 * Every string below is a §13 RULE, not a preference: what may be claimed, what must be omitted,
 * and which absence means which thing. A second copy of any of them — a nicer sentence typed into
 * a JSX branch, a "no proposals yet" written twice — is the derivation-drift class §18 rule 1
 * names, and here it drifts into a CLAIM. `AskAiDrawer.tsx` is the ONE renderer; this file is the
 * ONE author of what it says. Nothing here fetches, and nothing here is a component, so every rule
 * is provable without a DOM.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ────────────────────────────────────────────────
 *  · **It computes no price.** The amount is the SERVER's, off the `aiTask` block D-48's read half
 *    put on `GET /api/trips/:tripId/proposals` — the same `concierge:ai_task` band the charge point
 *    resolves. There is no literal here (§8) and no second fee read (D-48's own words, §18 rule 1).
 *  · **It computes no staleness.** D-50 (c)'s window is SERVER config; a client that re-derived it
 *    would be a second authority that disagrees the day the knob moves. Expiry reaches this surface
 *    only as the server's own REFUSAL, and `readProposalActionRefusal` renders that reason.
 *  · **It decides no authorization.** `askAiRailVisibility` MIRRORS the routes and never widens
 *    them; a render rule is never what keeps a write out (Locked Decision 42 D16's own wording,
 *    the §14 posture). The routes are the policy.
 *  · **It never names the engine.** LD 41 (c): `plan_proposals.model_tier` is a COST record. No
 *    badge, and equally no degraded-quality disclaimer — the prohibition binds both directions.
 */
import type {
  PlanProposalAddition,
  PlanProposalChangeSet,
  PlanProposalReplacement,
  PlanProposalStatus,
} from "@shared/plan-proposals";
// §18 rule 1: the Trip-Pass chip's sentence and the money formatter are the optimizer rail's, and
// this is one more caller of each. A second spelling of "Included in your Trip Pass" on the same
// slip is exactly the drift the rule names.
import { TRIP_PASS_COVERED_LABEL, formatMoneyCents } from "./optimization-preview";

/** The row as `GET /api/trips/:tripId/proposals` serves it. A reader's view, never a writer's. */
export interface AskAiProposalRow {
  id: string;
  question?: string | null;
  proposal?: PlanProposalChangeSet | null;
  status?: string | null;
  createdAt?: string | null;
  appliedAt?: string | null;
  discardedAt?: string | null;
  appliedItemIds?: string[] | null;
  /** Present ⇒ a PaymentIntent stands for this proposal. Never a price this surface may state. */
  stripePaymentIntentId?: string | null;
}

/** D-48's read half, verbatim: both fields OPTIONAL, and an absent one is "we have no answer". */
export interface AskAiTaskBlock {
  coveredByTripPass?: boolean;
  priceCents?: number;
}

export interface AskAiProposalsResponse {
  proposals?: AskAiProposalRow[];
  aiTask?: AskAiTaskBlock;
}

// ── The copy (§5.4's ten rules, one home) ────────────────────────────────────────────────────

/**
 * Every sentence this surface can say. Grouped by the rule that produced it, so a reader editing
 * one can see which §13 rule they are editing.
 */
export const ASK_AI_COPY = {
  /** The rail card and the drawer share a title — one control, one name. */
  title: "Ask AI about this plan",
  railMeta: "charged on apply",

  // Rule 1 — A PROPOSAL IS A PROPOSAL. Nothing is *added*, *updated*, *saved* or *done* on the
  // strength of one existing. The state is STAGED, until apply.
  stagedBadge: "Staged",
  nothingChangedYet:
    "A proposal is a proposal — nothing on your plan changes until you apply it.",

  // Rule 2 — CHARGED ONLY ON APPLY. Asking and reading are free; the price is stated on the apply
  // control, from the server, and NO number renders while that read has not answered.
  askIsFree: "Asking is free. Reading and discarding are free.",
  priceUnknown: "We don't have a price to show yet.",
  /** Appended to the server-resolved amount. The amount itself is never spelled here (§8). */
  priceSuffix: "per task, charged only when you apply one",

  // Rule 3 — NO UNDO IS OFFERED, EVER (Locked Decision 42 D18). After an apply the drawer REPORTS
  // what the apply created and offers no reverse, because no code path can perform one.
  appliedNoUndo:
    "Applied. There is no undo — this is a record of what it created, not a way back.",

  // Rule 5 — PROTECTED WORK IS STATED, NOT IMPLIED. A present `protectedNote` renders verbatim;
  // absent, the drawer says NOTHING. "Nothing is protected" is a claim nobody made.
  protectedEyebrow: "Left alone",

  // Rule 6 — AN EMPTY LOG IS NOT AN EMPTY ANSWER.
  emptyLog: "You haven't asked anything about this plan yet.",

  // Rule 7 — A DISCARDED PROPOSAL STAYS VISIBLE, marked discarded. Filtering it out would make the
  // log a claim rather than a record.
  discardedBadge: "Discarded",
  discardedNote: "You read this one and said no. It stays here as a record of what was offered.",

  // Rule 8 — AN EMPTY CHANGE SET IS A REAL ANSWER, and NO pay control renders for it: charging for
  // an apply that would write nothing is a charge for nothing.
  emptyChangeSet:
    "This answer proposes no changes to your plan. There is nothing to apply, so there is nothing to pay for.",

  // Rule 10 — A DAY THE PROPOSAL DID NOT NAME IS NOT THE AI'S ANSWER.
  unplacedDay:
    "This one names no day. Applying it places it on day 1 so it has somewhere to live — that is a placement you can move, not a time the AI chose.",

  // D-45 (RULED = A, STATELESS): the question column plus this log IS the thread. Said out loud so
  // nobody reads a memory into it that does not exist (§13).
  statelessNote:
    "Each question is answered on its own — this log is the whole conversation, and nothing here remembers the last one.",

  // LD 41 (b) — ON AN EMPTY PLAN THE DRAWER DEFERS. It never offers a paid task to build a plan
  // from nothing, and never becomes a second free rail.
  emptyPlanDeferralTitle: "Start with the free draft",
  emptyPlanDeferral:
    "This plan has no items yet. A free AI draft is what an empty plan wants — come back here once there is something to ask about.",

  // The ask box.
  askPlaceholder: "Ask about this plan…",
  askAction: "Ask",
  askEmpty: "Type a question first.",

  // The actions.
  discardAction: "Discard",
  applyAction: "Apply to my plan",
  payAction: "Pay and apply",
  reAskAction: "Ask again",

  // D-48 — PAY and APPLY are OWNER-ONLY AT THE ROUTE. The drawer says why the controls are absent
  // rather than drawing one the server will refuse.
  advisorCannotApply:
    "You can ask, read and discard on this plan. Applying a proposal — and paying for one — is the plan owner's.",

  // The refusals, each in the server's own voice where the server gave one.
  notAvailableYet: "Asking the AI about a plan is not available yet.",
  inFlight: "An answer for this plan is already on its way.",
  askFailed: "We couldn't ask about this plan.",
} as const;

// ── Visibility (§5.2, read against D-48 as RULED) ───────────────────────────────────────────

/**
 * WHAT THE VIEWER MAY SEE AND DO, mirroring the routes and never widening them.
 *
 * The routes are the policy: ASK / READ / DISCARD run
 * `authorizeTripLogistics(..., { requireWriteAccess: true })` — owner ‖ §12 WRITE-status advisor,
 * NEVER `pending` — and PAY / APPLY run `authorizeTripOwnerTier` (D-48, AMENDED against the
 * brief's own recommendation). This function is ADDITIVE to that and decides nothing.
 *
 * ── WHY THE ADVISOR ARM WAITS FOR THE SERVER, AND THE OWNER ARM DOES NOT ─────────────────────
 * The slip's `tripRole === "expert"` comes from `getTripRole`, whose advisor branch is
 * `isTripAdvisor` — which grants **`pending`**, correctly, for READING the plan. It therefore
 * cannot tell a WRITE-status advisor from a pending one, and restating §12's status list on the
 * client would be a second copy of a rule whose home is `server/utils/trip-advisor.ts` (§18 rule 1).
 * So the advisor arm asks the SERVER: the proposal log's own gate is exactly `requireWriteAccess`,
 * so a successful read IS the proof, and a 401/403 is the refusal. Until it answers, the card is
 * ABSENT rather than drawn-then-withdrawn — an omitted control is honest, a control that vanishes
 * is not (§13). The OWNER passes both tiers by construction and needs no round trip.
 */
export interface AskAiVisibilityInput {
  /** `plancard.tripRole === "owner"`. */
  isOwner: boolean;
  /** `plancard.tripRole === "expert"` — an advisor of ANY §12 access status, `pending` included. */
  isExpertViewer: boolean;
  /**
   * What the proposal-log read has done so far. `refused` is a 401/403 from that route — the only
   * signal that separates a pending advisor from a write-status one.
   */
  logRead: "pending" | "ok" | "refused" | "error";
}

export interface AskAiVisibility {
  /** Draw the rail card and the drawer at all. */
  visible: boolean;
  /** ASK / DISCARD — the §12 WRITE tier. */
  canAsk: boolean;
  /** PAY / APPLY — the OWNER tier (D-48). */
  canApply: boolean;
  /**
   * Present ⇒ say this where the apply control would have been. Only ever set for a viewer who
   * CAN ask but cannot apply, so it explains an absence the viewer can otherwise see around it.
   */
  applyAbsenceNote: string | null;
}

export function askAiRailVisibility(input: AskAiVisibilityInput): AskAiVisibility {
  const hidden: AskAiVisibility = {
    visible: false,
    canAsk: false,
    canApply: false,
    applyAbsenceNote: null,
  };

  // The owner: every tier, no round trip. An `error` on the log read does not hide the card —
  // "we could not load the log" is not "you may not have one" (§13), and the drawer says so.
  if (input.isOwner) {
    return { visible: true, canAsk: true, canApply: true, applyAbsenceNote: null };
  }

  // Not on this plan at all.
  if (!input.isExpertViewer) return hidden;

  // An advisor. Only a SUCCESSFUL read proves the §12 WRITE status the ask and discard rails need.
  // `pending` (still loading), `refused` (the server said no — a pending advisor) and `error` (we
  // have no answer) all draw nothing: none of the three is proof, and a control the server will
  // refuse is worse than an absent one.
  if (input.logRead !== "ok") return hidden;

  return {
    visible: true,
    canAsk: true,
    canApply: false,
    applyAbsenceNote: ASK_AI_COPY.advisorCannotApply,
  };
}

// ── The coverage / price line (lane 2 — D-48's read half, rendered) ──────────────────────────

export type AskAiPriceLine =
  /** The server says an active Trip Pass covers this action on this plan. */
  | { kind: "covered"; label: string }
  /** The server resolved the `concierge:ai_task` band. The amount is ITS number, formatted. */
  | { kind: "priced"; label: string; amount: string }
  /** We have NO ANSWER. Neither "covered" nor "not covered", and no number (§13). */
  | { kind: "unknown"; label: string };

/**
 * WHAT THE DRAWER MAY SAY ABOUT MONEY, from the server's `aiTask` block and nothing else.
 *
 * §13 runs through every branch, and the ORDER matters:
 *   · `coveredByTripPass === true` ⇒ the covered label, on the SERVER's word. The traveler is not
 *     told a price they will not be charged.
 *   · `coveredByTripPass === false` **and** a resolvable `priceCents` ⇒ the amount.
 *   · **an ABSENT `coveredByTripPass` is not `false`.** It is "the coverage read failed", so the
 *     drawer claims NEITHER coverage nor a price it might not charge — the `shouldOfferSavePayment`
 *     posture (LD 43 (d)), one product over.
 *   · an absent or non-positive `priceCents` ⇒ no number. `0` would read as "this is free", which
 *     is a claim; the band being unresolvable is not.
 */
export function askAiPriceLine(aiTask: AskAiTaskBlock | null | undefined): AskAiPriceLine {
  if (!aiTask || typeof aiTask !== "object") {
    return { kind: "unknown", label: ASK_AI_COPY.priceUnknown };
  }
  if (aiTask.coveredByTripPass === true) {
    return { kind: "covered", label: TRIP_PASS_COVERED_LABEL };
  }
  if (aiTask.coveredByTripPass !== false) {
    // Absent / not a boolean: we have no answer. Saying a price here would be charging-shaped
    // certainty on top of an unanswered question.
    return { kind: "unknown", label: ASK_AI_COPY.priceUnknown };
  }
  const cents = aiTask.priceCents;
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) {
    return { kind: "unknown", label: ASK_AI_COPY.priceUnknown };
  }
  const amount = formatMoneyCents(cents, "USD");
  return { kind: "priced", amount, label: `${amount} ${ASK_AI_COPY.priceSuffix}` };
}

// ── Reading a proposal row (§5.4 rules 1, 3, 7, 8, 9, 10) ────────────────────────────────────

export interface AskAiChangeSetView {
  additions: PlanProposalAddition[];
  replaces: PlanProposalReplacement[];
  notes: string[];
  /** Verbatim or null. NEVER a manufactured "nothing is protected" (rule 5). */
  protectedNote: string | null;
  /** True ⇒ rule 8: a real answer that proposes nothing, and NO pay control may render. */
  isEmpty: boolean;
  /** True ⇒ rule 10's sentence renders. An addition that names no day is UNPLACED, not day 1. */
  hasUnplacedAddition: boolean;
}

/** Reads the stored change set as DATA. A row it cannot understand renders as empty, not as a guess. */
export function readChangeSet(
  changeSet: PlanProposalChangeSet | null | undefined,
): AskAiChangeSetView {
  const cs = changeSet && typeof changeSet === "object" ? changeSet : {};
  const additions = Array.isArray(cs.additions) ? cs.additions.filter(isAddition) : [];
  const replaces = Array.isArray(cs.replaces) ? cs.replaces.filter(isReplacement) : [];
  const notes = Array.isArray(cs.notes) ? cs.notes.filter((n) => typeof n === "string" && n.trim() !== "") : [];
  const protectedNote =
    typeof cs.protectedNote === "string" && cs.protectedNote.trim() !== "" ? cs.protectedNote : null;
  return {
    additions,
    replaces,
    notes,
    protectedNote,
    // Rule 8 is about what an APPLY would WRITE. Notes and a protected note are things the AI
    // SAID — real content, and worth reading — but applying them would change nothing, so a
    // proposal carrying only those is still nothing to pay for.
    isEmpty: additions.length === 0 && replaces.length === 0,
    hasUnplacedAddition: additions.some(
      (a) => typeof a.dayNumber !== "number" || !Number.isFinite(a.dayNumber),
    ),
  };
}

function isAddition(value: unknown): value is PlanProposalAddition {
  return !!value && typeof value === "object" && typeof (value as any).title === "string";
}

function isReplacement(value: unknown): value is PlanProposalReplacement {
  return !!value && typeof value === "object" && typeof (value as any).itemId === "string";
}

/**
 * RULE 9 — A PRICE THE SOURCE DID NOT STATE IS OMITTED, NEVER `$0`.
 *
 * `estimatedCost` is filled only from a catalog row's real price or a source that stated one
 * (D-50 (e)). Absent, blank or unparseable ⇒ `null`, and the row draws no price line at all.
 * A `0` that a source DID state is left alone: "free" is a real thing for a source to say, and
 * suppressing it would be its own §13 lie. The suppression is of a MISSING figure, not a zero one.
 */
export function readEstimatedCost(addition: PlanProposalAddition): string | null {
  const raw = addition?.estimatedCost;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** What the row's own status means for the controls on it. Mirrors the routes, decides nothing. */
export type AskAiRowState =
  | { kind: "staged"; canDiscard: boolean; canApply: boolean; badge: null; note: string }
  | { kind: "applied"; canDiscard: false; canApply: false; badge: string; note: string }
  | { kind: "discarded"; canDiscard: false; canApply: false; badge: string; note: string }
  | { kind: "refunded"; canDiscard: false; canApply: false; badge: string; note: string }
  | { kind: "unknown"; canDiscard: false; canApply: false; badge: null; note: string };

/**
 * The per-row control state.
 *
 * Everything refusable here is refused by the SERVER first; this only decides what to DRAW.
 *   · `applied`   — rule 3: report, never a reverse.
 *   · `discarded` — rule 7: the row STAYS and is marked.
 *   · `refunded`  — OPTION B's terminal state (ledger `2026-09-16-l16-lane1-review-fixes`): the
 *     traveler paid, the apply refused, the fee went back. The drawer offers a RE-ASK, never a
 *     retry of the same proposal and never a silent reprice (D-50 (c)).
 *   · an unrecognised status — the reader says it cannot understand the row rather than rendering
 *     it as staged, which would draw an apply control over a state nobody defined (§13).
 *
 * A STAGED row carrying a PaymentIntent cannot be discarded — the storage layer's atomic
 * conditional refuses it, because money that may yet move must not have its row pulled out from
 * under it. Mirrored here so no control is drawn that the server will refuse.
 */
export function askAiRowState(row: AskAiProposalRow, viewerCanApply: boolean): AskAiRowState {
  const status = typeof row?.status === "string" ? (row.status as PlanProposalStatus | string) : null;
  const changeSet = readChangeSet(row?.proposal);
  switch (status) {
    case "proposed":
      return {
        kind: "staged",
        // The row's own PaymentIntent is the server's discard refusal, mirrored.
        canDiscard: !row.stripePaymentIntentId,
        // Rule 8: an empty change set has nothing to apply, so no apply (and no pay) control.
        canApply: viewerCanApply && !changeSet.isEmpty,
        badge: null,
        note: ASK_AI_COPY.nothingChangedYet,
      };
    case "applied":
      return {
        kind: "applied",
        canDiscard: false,
        canApply: false,
        badge: "Applied",
        note: ASK_AI_COPY.appliedNoUndo,
      };
    case "discarded":
      return {
        kind: "discarded",
        canDiscard: false,
        canApply: false,
        badge: ASK_AI_COPY.discardedBadge,
        note: ASK_AI_COPY.discardedNote,
      };
    case "refunded":
      return {
        kind: "refunded",
        canDiscard: false,
        canApply: false,
        badge: "Refunded",
        note:
          "This one could not be applied as you read it, so its fee went back. Ask again for a fresh answer.",
      };
    default:
      return {
        kind: "unknown",
        canDiscard: false,
        canApply: false,
        badge: null,
        note: "We can't read the state of this one, so no action is offered on it.",
      };
  }
}

/**
 * RULE 3 — WHAT AN APPLY CREATED, as a record.
 *
 * §13: an `applied` row with no recorded ids says the apply is recorded and the ids are not, which
 * is true; it never says "0 items", which would be a claim that the apply wrote nothing.
 */
export function appliedRecordLine(row: AskAiProposalRow): string | null {
  const ids = Array.isArray(row?.appliedItemIds)
    ? row.appliedItemIds.filter((id) => typeof id === "string" && id !== "")
    : [];
  if (ids.length === 0) return null;
  return ids.length === 1 ? "Created 1 item on your plan." : `Created ${ids.length} items on your plan.`;
}

// ── The refusals, in the server's own voice ──────────────────────────────────────────────────

export type AskAiAskRefusal =
  /** 503 — the create rail exists and its model call does not (L16 lane 1 stopped there). */
  | { kind: "not_built"; message: string; canRetry: false }
  /** 409 — an ask for this plan is already in flight. D-46 (i): it may name a row that has no row yet. */
  | { kind: "in_flight"; message: string; inFlightProposalId: string | null; canRetry: false }
  /** 429 — a named limit. `retryAfterSec` is the SERVER's; nothing here invents one. */
  | { kind: "rate_limited"; message: string; scope: string | null; retryAfterSec: number | null; canRetry: true }
  /** Anything else, including a 400, a 403 and a network failure. */
  | { kind: "failed"; message: string; canRetry: true };

/**
 * Reads the create rail's refusal. The server's own `message` is preferred wherever it gave one —
 * a second sentence written here would be a second copy of the rail's policy (§18 rule 1) and
 * would go stale the day the rail's reason changes.
 *
 * THE 503 IS HANDLED HONESTLY AND NOT AS AN ERROR. Lane 1 shipped the rail deliberately stopped
 * before the model call; "not available yet" is the truth, it is not the traveler's to fix, and
 * a retry control on it would promise a different answer that no code path can give (§13).
 */
export function readAskRefusal(status: number, body: unknown): AskAiAskRefusal {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = typeof b.message === "string" && b.message.trim() !== "" ? b.message : null;

  if (status === 503) {
    return { kind: "not_built", message: message ?? ASK_AI_COPY.notAvailableYet, canRetry: false };
  }
  if (status === 409) {
    return {
      kind: "in_flight",
      message: message ?? ASK_AI_COPY.inFlight,
      inFlightProposalId:
        typeof b.inFlightProposalId === "string" && b.inFlightProposalId !== ""
          ? b.inFlightProposalId
          : null,
      canRetry: false,
    };
  }
  if (status === 429) {
    return {
      kind: "rate_limited",
      // The limiter's own sentence names WHICH limit was hit; restating it here would be the
      // second copy of a rule whose home is `message-rate-limiter.ts`.
      message: message ?? "You have asked as much as this plan allows for now.",
      scope: typeof b.scope === "string" ? b.scope : null,
      retryAfterSec:
        typeof b.retryAfterSec === "number" && Number.isFinite(b.retryAfterSec) && b.retryAfterSec > 0
          ? b.retryAfterSec
          : null,
      canRetry: true,
    };
  }
  return { kind: "failed", message: message ?? ASK_AI_COPY.askFailed, canRetry: true };
}

export type AskAiActionRefusal = {
  /** The server's `reason` where it gave one, so a lane can pin the codes it renders. */
  reason: string | null;
  message: string;
  /**
   * D-50 (c): an expired proposal, and a listing that has gone away, are both answered with a
   * RE-ASK — never a silent reprice and never a retry of the same proposal.
   */
  offersReAsk: boolean;
  /**
   * OPTION B: a PAID proposal refused at apply is refunded. Present ⇒ the server told us what
   * happened to the money, and the drawer says it. Absent ⇒ NOTHING was charged, which is the
   * truth and is not a refund of nothing (§13).
   */
  refundLine: string | null;
};

/**
 * Reads a pay or apply refusal. The re-ask offer is decided by the server's own REASON CODE and
 * never by a message match: the codes are `stale_catalog_price`, `listing_unavailable`,
 * `protected_item` and `refunded`, and each of the four means "this proposal cannot become the
 * thing you read", which is what a re-ask answers.
 */
export const ASK_AI_RE_ASK_REASONS = [
  "stale_catalog_price",
  "listing_unavailable",
  "protected_item",
  "refunded",
] as const;

export function readProposalActionRefusal(status: number, body: unknown): AskAiActionRefusal {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const reason = typeof b.reason === "string" && b.reason !== "" ? b.reason : null;
  const message =
    typeof b.message === "string" && b.message.trim() !== ""
      ? b.message
      : status === 402
        ? "This proposal has not been paid for yet."
        : "We couldn't apply this proposal.";
  const refund = b.refund && typeof b.refund === "object" ? (b.refund as Record<string, unknown>) : null;
  // §13: the refund line reports the SERVER's outcome word and never asserts one it did not give.
  const refundLine =
    refund && typeof refund.outcome === "string"
      ? refund.outcome === "issued"
        ? "Your fee has been refunded."
        : "Your fee is being returned — we have a record of it."
      : null;
  return {
    reason,
    message,
    offersReAsk: reason != null && (ASK_AI_RE_ASK_REASONS as readonly string[]).includes(reason),
    refundLine,
  };
}

// ── LD 41 (b) — the empty-plan deferral ──────────────────────────────────────────────────────

/**
 * ON AN EMPTY PLAN THE DRAWER DEFERS TO THE FREE DRAFT, and says so.
 *
 * It does NOT restate `slipBuildAiAction`'s rule — it CALLS it (§18 rule 1). That function is the
 * ONE place "empty plan ⇒ draft, otherwise optimize" is written down (LD 41 (b)), guarded by
 * `scripts/check-ai-draft-eligibility.cjs`, and a second `itemCount === 0` typed here would be the
 * third copy of it.
 */
export function askAiDeferralToDraft(aiAction: "draft" | "optimize"): string | null {
  return aiAction === "draft" ? ASK_AI_COPY.emptyPlanDeferral : null;
}
