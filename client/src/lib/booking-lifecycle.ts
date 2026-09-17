/**
 * BOOKING LIFECYCLE — the ONE module the acceptance and declared-completion surfaces read.
 *
 * Ledger `2026-09-17-surfaces-acceptance-completion`. Rulings: CLAUDE.md Locked Decision 46 (an
 * artifact is ACCEPTED, not timed out; a revision is a ROW; D-27's timer ASKs and ESCALATEs and may
 * never complete in the seller's favour; the refund on a rejected artifact is the ADMIN's dispute
 * outcome) and Locked Decision 47 (the seller DECLARES, the traveler has a WINDOW, "completed" is
 * said at its close). Content of record: `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part I §3-§7 and
 * Part II §10-§14.
 *
 * WHAT THIS MODULE IS FOR, and why there is exactly one of it. Three surfaces render these states —
 * the traveler's My Bookings, the seller's console, and (label only) the slip and Trip Card — and
 * before this lane none of them rendered any of it: the columns, the rails and the timer all landed
 * and nothing drew them. Written three times, "may I accept?", "when does the window close?" and
 * "what does `awaiting_acceptance` mean in words" would be three answers, and the first status to
 * move lists would break two of them silently. That is the derivation-drift class §18 rule 1 names.
 *
 * WHAT IT IS NOT. It computes nothing the SERVER already answered:
 *   • the acceptance DEADLINE is `acceptance.acceptanceDeadline`, derived server-side from
 *     `delivered_at` + `acceptanceWindowDays()` (LD 46 — never stored, and never a client-side 7);
 *   • the declared window's DISPUTE-BY date is `completionDeclaration.disputeBy`, derived from
 *     `declaredCompletionWindowDays()` (LD 47);
 *   • the revision ALLOWANCE is the listing's own `revisions_included`, read live on the server on
 *     every decision and never copied onto the booking.
 * A number added up here would be a second authority the day either config moves.
 *
 * WHAT IT DOES DECIDE, from lists it does not own: whether a control may be DRAWN. Every from-state
 * list it reads was moved into `@shared/*` by this same lane and is RE-EXPORTED by the server module
 * that used to own it, so the surface and the rail are reading the SAME array. Drawing a button is
 * never what keeps a write out — the rail's own gate is (§14 posture, LD 42 D16) — so a control this
 * module allows may still be refused, by name, and the surface says what the server said.
 *
 * §13 THROUGHOUT, and the absences are the substance:
 *   • no `acceptance` key ⇒ this listing takes NO acceptance. Render NOTHING — never "no artifact",
 *     never "not accepted", which are claims only the seller and the traveler can make.
 *   • no `completionDeclaration` key ⇒ never declared, or already completed. Render NOTHING —
 *     never "not declared".
 *   • `deliveryTimestampMissing` ⇒ the booking is on NO acceptance clock and says so, rather than
 *     being dated from `confirmed_at` or from "now".
 *   • an ESCALATED row says the platform is looking at it. It NEVER says "refunded": a refund is an
 *     admin's outcome and is said only with a refund id in hand.
 *   • `revisionsRemaining` absent ⇒ the listing offers none. No affordance at all, never
 *     "0 remaining" beside a button that refuses.
 *
 * Pure. No React, no fetch, no Date arithmetic beyond comparing two instants the server produced.
 */

import {
  ACCEPTANCE_FROM_STATUSES,
  ARTIFACT_RECORD_ONLY_STATUSES,
  REVISION_REQUESTABLE_FROM_STATUSES,
  type AcceptanceMode,
} from "@shared/acceptance-window";
import {
  COMPLETION_ALLOWED_FROM_STATUSES,
  DISPUTABLE_FROM_STATUSES,
} from "@shared/declared-completion-window";
import { readPurchaseStatus, type PurchaseStatusReading } from "./purchase-status";

/**
 * The system reason D-27's escalation arm stamps on `booking_metadata`. Spelled here to match
 * `ACCEPTANCE_WINDOW_ELAPSED_REASON` in `server/services/artifact-acceptance-timer.service.ts`; it is
 * a value the server WRITES and the client only ever READS, so this is a comparison key, not a
 * second authority on when an escalation happens (that is the timer's, and only the timer's).
 */
export const ACCEPTANCE_WINDOW_ELAPSED_REASON = "acceptance_window_elapsed";

/** Who is looking. A stranger is a real answer and renders nothing at all (LD 42 D16). */
export type LifecycleAudience = "owner" | "seller" | "other";

/** One `booking_revision_requests` row as the server's read-out carries it. */
export interface LifecycleRevision {
  position: number;
  /** NULL by design — the rail admits a revision with no words. Render nothing, never `""`. */
  note: string | null;
  requestedAt: string;
  /** NULL = still open; a stamp = the seller re-delivered against it. */
  resolvedAt: string | null;
}

/** `describeAcceptance`'s read-out, exactly. Every optional key is OMITTED server-side, not nulled. */
export interface LifecycleAcceptance {
  mode: AcceptanceMode;
  acceptedAt?: string;
  deliveredAt?: string;
  hasBookingDeliverable: boolean;
  acceptanceDeadline?: string;
  deliveryTimestampMissing?: true;
  revisionsIncluded?: number;
  revisionsUsed?: number;
  revisionsRemaining?: number;
  revisions?: LifecycleRevision[];
}

/** `describeCompletionDeclaration`'s read-out, exactly. Absent once the booking completes. */
export interface LifecycleDeclaration {
  declaredAt: string;
  disputeBy: string;
  windowDays: number;
}

/** The minimum a surface must hand this module. Every field is server-sourced. */
export interface LifecycleBooking {
  id: string;
  status: string | null;
  acceptance?: LifecycleAcceptance | null;
  completionDeclaration?: LifecycleDeclaration | null;
  bookingMetadata?: { systemDisputeReason?: string | null } | null;
}

/**
 * WHERE THIS BOOKING STANDS, in one word, for the traveler's acceptance rail.
 *
 * `escalated` outranks everything because it is the LIVE status and the only one that has left the
 * traveler's hands; `accepted` outranks the rest because it is a stamp nothing walks back.
 */
export type AcceptanceStage =
  | "escalated"
  | "accepted"
  | "asked"
  | "revision_requested"
  | "delivered"
  | "awaiting_delivery";

export interface TravelerAcceptanceView {
  mode: AcceptanceMode;
  stage: AcceptanceStage;
  /** ISO, or null when the server holds no per-booking delivery instant (§13). */
  deliveredAt: string | null;
  /** TRUE when a PER-BOOKING artifact exists. FALSE means the listing's own file is what is served. */
  hasBookingDeliverable: boolean;
  /** The SERVER's derived deadline. Null ⇒ this booking is on no acceptance clock, and `noClockReason` says so. */
  deadline: string | null;
  noClockReason: string | null;
  acceptedAt: string | null;
  canAccept: boolean;
  canRequestRevision: boolean;
  /** Null ⇒ the listing offers no revisions at all. Never rendered as a zero (§13). */
  revisionsRemaining: number | null;
  revisions: LifecycleRevision[];
  /** The one sentence this state is worth. */
  headline: string;
}

export interface TravelerDeclarationView {
  declaredAt: string;
  disputeBy: string;
  windowDays: number;
  canDispute: boolean;
  headline: string;
}

export interface SellerCompletionView {
  /** May "mark as done" be drawn? See COMPLETION_ALLOWED_FROM_STATUSES' negative space. */
  canDeclare: boolean;
  declaration: LifecycleDeclaration | null;
  /** The window closed and the nightly job completed it — the ONE place the word is earned. */
  completed: boolean;
  headline: string;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// COPY — every string these surfaces say, in one place
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const LIFECYCLE_COPY = {
  acceptTitle: "Your deliverable",
  acceptButton: "Accept",
  reviseButton: "Request a revision",
  declareButton: "Mark as done",
  disputeButton: "Something's wrong",
  /** LD 46 — an escalated row is with a human, and that is ALL it is. Never "refunded". */
  escalated:
    "You didn't answer in time, so this is with our team. Nothing has been paid out and no refund has been issued — we'll be in touch.",
  accepted: "You accepted this.",
  asked: "Your deliverable is ready — accept it, or ask for a revision.",
  revisionRequested: "You asked for a revision. Your expert has it.",
  delivered: "Your expert has delivered.",
  awaitingDelivery: "Your expert hasn't delivered this yet.",
  /** §13: the honest reason a booking is on no clock, said out loud rather than left blank. */
  noClock: "We don't hold a delivery date for this booking, so it isn't on an acceptance clock.",
  /** D-40: accepting records the answer and moves no money. Said, not implied. */
  recordsOnlyNote:
    "Accepting this document records your answer. It doesn't complete the booking or release payment — that follows the service itself.",
  listingFileNote: "This is the file this listing ships to everyone — your expert hasn't sent a version made for you.",
  revisionsHeading: "Revisions you've asked for",
  sellerDeclareHint: "Marking this done starts the traveler's review window. Nothing is paid out until it closes.",
  sellerCompleted: "Completed.",
  sellerNotYet: "This isn't in a state you can mark done.",
} as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DERIVATIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * THE SHARED STATUS READING — both audiences, one map. Delegates to `readPurchaseStatus`
 * (`client/src/lib/purchase-status.ts`), which the slip and the Trip Card already read, rather than
 * opening a second table beside it (§18 rule 1). This lane taught that map `awaiting_acceptance` and
 * `revision_requested`; nothing else about it moved.
 *
 * §13: a row with no recorded status returns `null` and the surface draws no label — a row that
 * recorded no status makes no claim.
 */
export function lifecycleStatusReading(status: string | null | undefined): PurchaseStatusReading | null {
  return readPurchaseStatus(status);
}

/** TRUE when D-27's escalation arm — not a person — put this row in the admin queue. */
export function isAcceptanceEscalation(booking: LifecycleBooking): boolean {
  return (
    booking.status === "disputed" &&
    booking.bookingMetadata?.systemDisputeReason === ACCEPTANCE_WINDOW_ELAPSED_REASON
  );
}

/**
 * WHOLE DAYS LEFT on a server-derived deadline, for a "N days left" line. Null when there is no
 * deadline — which is a different fact from zero and must render differently (§13). A deadline
 * already passed reads 0, never a negative number presented as time remaining.
 */
export function daysRemaining(deadlineIso: string | null | undefined, now: Date = new Date()): number | null {
  if (!deadlineIso) return null;
  const ms = Date.parse(deadlineIso);
  if (!Number.isFinite(ms)) return null;
  const diff = ms - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function acceptanceStage(booking: LifecycleBooking, a: LifecycleAcceptance): AcceptanceStage {
  if (isAcceptanceEscalation(booking)) return "escalated";
  if (a.acceptedAt) return "accepted";
  if (booking.status === "awaiting_acceptance") return "asked";
  if (booking.status === "revision_requested") return "revision_requested";
  if (a.deliveredAt) return "delivered";
  return "awaiting_delivery";
}

const STAGE_HEADLINE: Record<AcceptanceStage, string> = {
  escalated: LIFECYCLE_COPY.escalated,
  accepted: LIFECYCLE_COPY.accepted,
  asked: LIFECYCLE_COPY.asked,
  revision_requested: LIFECYCLE_COPY.revisionRequested,
  delivered: LIFECYCLE_COPY.delivered,
  awaiting_delivery: LIFECYCLE_COPY.awaitingDelivery,
};

/**
 * THE TRAVELER'S ACCEPTANCE READ-OUT.
 *
 * Returns `null` — render nothing at all — for two different reasons, and both are answers:
 *   • the viewer is not the booking's owner. Accept and Request-revision are the TRAVELER's, the
 *     rails gate on `traveler_id` from the session (§14), and a seller or a stranger sees no trace.
 *   • the server sent no `acceptance` key, which means this listing takes no acceptance (§13).
 */
export function travelerAcceptanceView(
  booking: LifecycleBooking,
  audience: LifecycleAudience,
): TravelerAcceptanceView | null {
  if (audience !== "owner") return null;
  const a = booking.acceptance;
  if (!a) return null;

  const status = booking.status ?? "";
  const writable =
    a.mode === "gates_completion" ? ACCEPTANCE_FROM_STATUSES : ARTIFACT_RECORD_ONLY_STATUSES;
  const revisable =
    a.mode === "gates_completion" ? REVISION_REQUESTABLE_FROM_STATUSES : ARTIFACT_RECORD_ONLY_STATUSES;
  const remaining = typeof a.revisionsRemaining === "number" ? a.revisionsRemaining : null;
  const stage = acceptanceStage(booking, a);

  return {
    mode: a.mode,
    stage,
    deliveredAt: a.deliveredAt ?? null,
    hasBookingDeliverable: a.hasBookingDeliverable === true,
    deadline: a.acceptanceDeadline ?? null,
    // §13: the ONE honest reason a booking carries no deadline. Absent when there IS one.
    noClockReason: a.deliveryTimestampMissing === true ? LIFECYCLE_COPY.noClock : null,
    acceptedAt: a.acceptedAt ?? null,
    canAccept: !a.acceptedAt && writable.includes(status),
    // A listing that states no allowance shows NO affordance — never a disabled button beside "0".
    canRequestRevision: remaining !== null && remaining > 0 && revisable.includes(status),
    revisionsRemaining: remaining,
    revisions: a.revisions ?? [],
    headline: STAGE_HEADLINE[stage],
  };
}

/**
 * THE TRAVELER'S DECLARED-WINDOW READ-OUT (LD 47). `null` for a non-owner and for a booking that was
 * never declared or has already completed — the server omits the key in both cases, and "completed"
 * is the word that replaces this panel, never a window still counting down.
 */
export function travelerDeclarationView(
  booking: LifecycleBooking,
  audience: LifecycleAudience,
): TravelerDeclarationView | null {
  if (audience !== "owner") return null;
  const d = booking.completionDeclaration;
  if (!d) return null;
  return {
    declaredAt: d.declaredAt,
    disputeBy: d.disputeBy,
    windowDays: d.windowDays,
    canDispute: DISPUTABLE_FROM_STATUSES.includes(booking.status ?? ""),
    headline: LIFECYCLE_COPY.sellerDeclareHint,
  };
}

/**
 * THE SELLER'S COMPLETION READ-OUT (LD 47). `null` for anyone who is not the seller of this booking.
 *
 * `canDeclare` reads the from-state list and NOTHING ELSE — see its negative space in
 * `@shared/declared-completion-window`: an artifact booking takes the TRAVELER's acceptance and a
 * place-anchored one waits for its date, and both facts live in `resolveCompletionEligibility`,
 * server-side, where a rule resolver belongs. The rail refuses by name and the surface repeats what
 * it said; a second copy of that resolver on a client is the drift this module exists to avoid.
 */
export function sellerCompletionView(
  booking: LifecycleBooking,
  audience: LifecycleAudience,
): SellerCompletionView | null {
  if (audience !== "seller") return null;
  const status = booking.status ?? "";
  const completed = status === "completed";
  const declaration = booking.completionDeclaration ?? null;
  return {
    canDeclare: !completed && !declaration && COMPLETION_ALLOWED_FROM_STATUSES.includes(status),
    declaration,
    completed,
    headline: completed
      ? LIFECYCLE_COPY.sellerCompleted
      : declaration
        ? LIFECYCLE_COPY.sellerDeclareHint
        : COMPLETION_ALLOWED_FROM_STATUSES.includes(status)
          ? LIFECYCLE_COPY.sellerDeclareHint
          : LIFECYCLE_COPY.sellerNotYet,
  };
}
