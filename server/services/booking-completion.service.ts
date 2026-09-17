/**
 * BOOKING COMPLETION MACHINERY — D8 (docs/DECISIONS.md ruling 63, executed by ruling 66).
 *
 * ══ THE ONE RULE THIS MODULE EXISTS TO ENFORCE ═══════════════════════════════════════════════
 * Ruling 63: *"one payout machinery, no per-method money forks. Every completion event writes the
 * diary row and triggers fee/payout through the SAME machinery as the in-person confirm-completion
 * flip."* So this file is the ONLY place a `service_bookings` row is moved to `completed` by the
 * D8 rules, and every caller — the owner rail, the auto-complete job, a future rail — comes
 * through `completeBooking`. A second earning-release implementation is exactly the defect class
 * the ruling was written to prevent (§15c's "one promotion, two callers", one lane over).
 *
 * ══ WHAT COMPLETION *IS*, PRECISELY ══════════════════════════════════════════════════════════
 * The completion EVENT is the `confirmed → completed` status flip. `storage.updateServiceBooking
 * Status` already owns every consequence of that flip — the platform-revenue row, the provider
 * earning and the expert earning, both born `held` with `availableAt = now + holdWindowDays
 * ('service_booking')`. This module adds NO money logic of its own and touches NO rate, amount or
 * fee: it decides WHEN the flip happens, never HOW MUCH moves (§8/§14/§18 untouched).
 *
 * RELEASE is deliberately NOT part of completion. The held earning matures through the EXISTING
 * escrow window (earnings-release-scheduler) or early via the traveler's existing
 * `POST /api/bookings/:id/confirm-completion`. That is what preserves the dispute window on every
 * D8 rule for free — including ruling 63's async row, whose "disputable window" is satisfied by
 * reusing `holdWindowDays('service_booking')` rather than inventing a second constant.
 *
 * ══ §15 SHAPE ═══════════════════════════════════════════════════════════════════════════════
 * The flip is an ATOMIC CONDITIONAL (`UPDATE … WHERE id = ? AND status IN ('confirmed')`, via
 * `expectedFromStatuses`), so:
 *   - a double-run of the timer, a double-click on the owner button, and a timer racing an owner
 *     all produce exactly ONE flip, ONE earning set and ONE diary row; the loser is a no-op;
 *   - `payment_pending` is NEVER an accepted from-state — a provisional claim (§15b) belongs to
 *     `checkout-claim.service.ts` and this rail must not participate in the claim machine (§18b);
 *   - there is no compensating rollback anywhere in here. A lost race changes nothing.
 *
 * ══ D-7: THE SELLER DECLARES, THE WINDOW CLOSES, AND ONLY THEN IS "COMPLETED" SAID ═════════
 * (punchlist D-36/D-37/D-38, ruled A 2026-09-15; ledger `2026-09-15-d36-d39-completion-declared`;
 * brief Part II §11-§12.) For the owner-declared rules and the place-anchored timer the flip
 * above is now TWO flips with a window between them:
 *
 *   confirmed ──(declare)──> completion_declared ──(window elapses, undisputed)──> completed
 *
 * `declareBookingCompletion` makes the FIRST — the same eligibility the owner rail always resolved
 * (session ended per the booked slot; scope declared; the service date passed), the same evidence,
 * and it MINTS NOTHING: the money event is the second flip, made by `completeBooking`'s
 * `window_elapsed` arm when `completion_declared_at + declaredCompletionWindowDays()` has passed.
 * D-37: the held earning's `availableAt` is then ANCHORED to the DECLARATION instant
 * (`storage.mintCompletionEarningsForBooking` reads `completionDeclaredAt`), so the window is
 * served once and the seller's payout lands where it did before, to within a scheduler pass. A
 * traveler's dispute inside the window flips the row to `disputed` — the SAME row and queue as a
 * post-completion dispute (D-38) — and the close then matches zero rows by construction.
 *
 * What did NOT move: `checkout_date` (property) still completes directly on its timer;
 * `bundle_components` still completes directly when its last component lands (the bundles lane,
 * D-32..D-35, owns whether a bundle declares); `traveler_accepted` is D-6's own arm. The declared
 * window is ONE more caller of the ONE completion implementation — never a second mint path.
 *
 * ══ §13 SHAPE ═══════════════════════════════════════════════════════════════════════════════
 * Every "not yet" answer carries a machine-readable REASON. A booking that lacks the data to
 * decide (no slot end time, no delivery timestamp, no checkout date, an unclassifiable service)
 * is INELIGIBLE with that reason stated — never guessed into a completion, because a guessed
 * completion mints real money.
 *
 * ══ OBSERVABILITY — the deliberate choice (build-charter §2) ════════════════════════════════
 * NO new runs table. Each flip records itself twice, which is enough and cheaper:
 *   (a) `bookingDetails.completion` on the booking row — rule, actor, timestamp, and the EVIDENCE
 *       the decision was made on. Durable, per-flip, and present even for bookings with no trip.
 *   (b) an `item_transition_log` diary row (`booking_completed`) when the booking carries a
 *       `trip_id` — the diary is trip-scoped by construction (`trip_id NOT NULL`), so a
 *       tripless booking honestly gets (a) only rather than a synthesised trip (the same
 *       constraint `voidClaim` lives with). The job additionally logs one structured line per
 *       run with its counts, so a dead scheduler is visible in logs even on a quiet day.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  deliverableDownloads,
  providerServices,
  serviceBookings,
  vendorAvailabilitySlots,
} from "@shared/schema";
import {
  completionRuleFor,
  OWNER_DECLARED_COMPLETION_RULES,
  TIMER_DRIVEN_COMPLETION_RULES,
  type CompletionRule,
} from "@shared/service-fundamentals";
import {
  ARTIFACT_AUTO_COMPLETE_DAYS,
  DAY_MS,
  PROPERTY_AUTO_COMPLETE_GRACE_DAYS,
  declaredCompletionWindowDays,
  serviceDateCompletionDays,
} from "../config/completion-windows.config";
import { acceptanceModeFor, type DeliveryInstantSource } from "@shared/acceptance-window";
import {
  COMPLETION_DECLARED_STATUS,
  declaredCompletionDeadline,
} from "@shared/declared-completion-window";
import {
  ACCEPTANCE_FROM_STATUSES,
  COMPLETION_DECLARABLE_FROM_STATUSES,
  DECLARED_WINDOW_CLOSE_FROM_STATUSES,
  PARTIAL_COMPLETION_FROM_STATUSES,
} from "../utils/booking-from-states";
import {
  BUNDLE_COMPONENT_STATUS,
  PARTIALLY_COMPLETED_STATUS,
  allocationsAreComplete,
  cancelledComponentRefundCents,
  deriveBundleOutcome,
  isValidCancelRefundPercent,
  reducedBundleFigures,
} from "@shared/bundle-component-states";
import {
  claimComponentCancelled,
  claimComponentCompleted,
  claimComponentFailed,
  readBundleComponentRows,
  readBundleComponentStates,
  type ComponentStateSource,
} from "./bundle-component-states.service";
// Locked Decision 50, second half (ledger `2026-09-16-bundle-component-traveler-cancel`): the
// SNAPSHOTTED cancellation terms a traveler-cancelled component follows. The policy module imports
// only `db` and the traveler-charge composition, so it sits below this one.
import {
  resolveSnapshottedCancellationTerms,
  type CancellationPolicyType,
} from "./cancellation-policy.service";
// D-51 (ledger `2026-09-16-bundle-partial-settlement`): the MONEY LEG of a partial settlement — the
// claim, the one Stripe refund and the promote. Sits BELOW this module in the import graph.
import {
  issueBundlePartialSettlement,
  type BundlePartialSettlementResult,
} from "./bundle-partial-settlement.service";
import { logItemTransition, type TransitionActorType } from "./item-transition-log.service";
import { deriveClaimedSlotIds, deriveClaimedSlotUnits } from "./checkout-claim.service";
import { storage } from "../storage";

/**
 * The ONLY from-states a D8 completion may claim. `confirmed` = paid (cart rail) or accepted
 * (request rail). Everything else is deliberately absent: `payment_pending` belongs to the claim
 * machine (§15b/§18b), and `cancelled`/`refunded`/`disputed`/`expired`/`completed` are terminal
 * or under another rail's authority.
 */
// MOVED to `shared/declared-completion-window.ts` and RE-EXPORTED (ledger
// `2026-09-17-surfaces-acceptance-completion`): the seller console draws "mark as done" from this
// list, and a client cannot import this module. Every existing caller is unchanged. Read that
// file's NEGATIVE SPACE note before using it on a surface — status is not the whole eligibility.
import { COMPLETION_ALLOWED_FROM_STATUSES } from "@shared/declared-completion-window";
export { COMPLETION_ALLOWED_FROM_STATUSES };

/** Who drove this completion. Recorded on the booking row; mapped to a diary actorType below. */
export type CompletionActor =
  /*
   * `auto_complete_pdf` IS GONE (D-27; ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`).
   * It was the actor of the silent timeout D-6 forbids: a clock that completed an artifact booking
   * and minted the seller's earning without the traveler ever answering. `artifact_timer` left
   * `TIMER_DRIVEN_COMPLETION_RULES`, so `timerActorFor` returns null for it and this union has ONE
   * FEWER member — never a renamed one. An artifact completes on `traveler_accepted`, or by a human
   * resolving the dispute the unanswered window escalates into. Rows already stamped
   * `actor: "auto_complete_pdf"` in `bookingDetails.completion` are NOT rewritten (LD 44(e)): that
   * actor did complete those bookings, and editing the record would invent a different history.
   */
  | "auto_complete_property"
  /** Ruling 69 disposition 1 — the in_person/hybrid booked-service-date timer. */
  | "auto_complete_service_date"
  | "provider_session_end"
  | "provider_declared"
  | "provider_bundle_components"
  /**
   * Locked Decision 50, second half (ledger `2026-09-16-bundle-component-traveler-cancel`): THE
   * TRAVELER CANCELLED A BUNDLE COMPONENT and that answer was the last one outstanding, so the parent
   * moved to `partially_completed` and settled. The ONLY traveler-driven caller of the partial
   * settlement; it grants nothing the recorder's own gate did not already check.
   */
  | "traveler_bundle_component_cancel"
  /**
   * D-6 (ledger `2026-09-15-d24-d26-acceptance-columns`): THE TRAVELER ACCEPTED THE ARTIFACT.
   * A new CALLER of the ONE completion implementation, with its own actor tag — never a second
   * minting path (§18 rule 1, and the brief's own non-negotiable rule 3). It is the only actor
   * whose from-state is `awaiting_acceptance` rather than `confirmed`, and the only one that
   * stamps `accepted_at`.
   */
  | "traveler_accepted"
  /**
   * D-7 (ledger `2026-09-15-d36-d39-completion-declared`): THE DECLARED WINDOW CLOSED UNDISPUTED.
   * The nightly job's caller of the ONE completion implementation for a booking the seller declared
   * done (`completion_declared`), once `completion_declared_at + declaredCompletionWindowDays()` has
   * passed. It is the only actor whose from-state is `completion_declared`, and the flip it wins is
   * the one that MINTS — with `availableAt` anchored to the declaration (D-37). It never declares:
   * WHO declared, and on what evidence, is already on the row (`bookingDetails.completionDeclaration`).
   */
  | "window_elapsed";

const DIARY_ACTOR: Record<CompletionActor, TransitionActorType> = {
  auto_complete_property: "auto_complete",
  auto_complete_service_date: "auto_complete",
  provider_session_end: "provider",
  provider_declared: "provider",
  provider_bundle_components: "provider",
  traveler_bundle_component_cancel: "traveler",
  traveler_accepted: "traveler",
  window_elapsed: "auto_complete",
};

/** TRUE for the ONE actor whose completion is a traveler's acceptance rather than a rule firing. */
function isAcceptanceActor(actor: CompletionActor): boolean {
  return actor === "traveler_accepted";
}

/** TRUE for the ONE actor whose completion is a declared window closing rather than a rule firing. */
function isWindowCloseActor(actor: CompletionActor): boolean {
  return actor === "window_elapsed";
}

/**
 * D-7: WHICH TIMER RULE OPENS THE TRAVELER'S WINDOW INSTEAD OF ENDING IT. Brief §10: for
 * `in_person`/`hybrid` "the timer's job becomes *open the traveler's window*, not *end it*" — the
 * `service_date_timer` fires exactly when it always did (ruling 69's N days after the booked
 * service day, `serviceDateCompletionDays()`), but its flip is now `confirmed → completion_declared`
 * and the window's close completes N days later. NO money instant moves: the earning's
 * `availableAt` is anchored to the declaration (D-37), so it lands where today's mint-plus-hold
 * landed, and the traveler's dispute cutoff (`disputeWindowAnchor`) is the same instant it is today.
 * Opening the window at the day boundary instead — an earlier payout by N days — is a timing
 * change this ruling did not authorize, so it was not taken.
 *
 * `checkout_date` (property) is deliberately NOT here: D-7 rules physical-action and coordination
 * work, and a stay's checkout is neither. It completes directly, as before.
 */
export function timerOpensDeclaredWindow(rule: CompletionRule): boolean {
  return rule === "service_date_timer";
}

/** Why a booking is NOT (yet) completable. Stable, machine-readable, §13-honest. */
export type IneligibleReason =
  | "booking_not_found"
  | "service_not_found"
  | "wrong_status"
  | "unclassifiable_service"
  | "rule_not_owner_declared"
  | "rule_not_timer_driven"
  | "window_open"
  | "no_delivery_timestamp"
  | "no_checkout_date"
  /** Ruling 69 disposition 1: an in_person/hybrid booking with no booked date at all (§13). */
  | "no_service_date"
  | "no_booked_slot"
  | "slot_has_no_end_time"
  | "session_not_ended"
  | "bundle_components_unknown"
  | "bundle_components_incomplete"
  /**
   * D-34 (ledger `2026-09-16-d32-d35-bundle-components`): every component has an answer, at least
   * one delivered and at least one NOT — the bundle is PARTIALLY complete, which `completeBooking`
   * must never turn into `completed` (that word still means EVERY component). The flip this state
   * takes is `settleBundlePartialCompletion`'s, and it carries the undelivered ids as evidence.
   */
  | "bundle_partially_completed"
  /** D-34: every component answered and NONE delivered — the EXISTING whole-row refund lane's case;
   *  nothing here flips it, and the reason says so rather than reporting "incomplete" (§13). */
  | "bundle_components_undelivered"
  /**
   * D-32: the write asked for needs a `booking_component_states` ROW and this booking has none —
   * a LEGACY bundle, read from `booking_details` and unable to hold FAILED. Stated, never filed into
   * a jsonb key no atomic conditional could later claim; such a bundle keeps the all-or-nothing rule
   * and the existing refund lane.
   */
  | "bundle_component_states_unavailable"
  /**
   * D-33/§13: the partial flip's REDUCED figures cannot be derived because a component carries no
   * snapshotted price. The parent stays `confirmed` for a human — never a guessed share.
   */
  | "component_prices_unknown"
  /**
   * D-6/D-40: the traveler accepted, but this listing's acceptance does NOT complete the booking.
   * Either it takes no acceptance at all, or it is a `hybrid` with a DECLARED artifact, whose
   * acceptance is `records_only` — it records `accepted_at` and revision rows and gates NOTHING
   * about completion or the mint. Handled by the acceptance service's own arm, never here.
   */
  | "acceptance_does_not_complete"
  /**
   * D-27: the booking's rule IS `artifact_timer`, and `artifact_timer` no longer completes
   * anything. Stated rather than silently absent, because "this rule cannot complete" and "this
   * window is still open" are different facts and a reader must be able to tell them apart (§13).
   */
  | "artifact_takes_acceptance"
  /**
   * D-7: the booking is `completion_declared` but carries no `completion_declared_at` — a row the
   * guarded writer could not have produced (it stamps both in one UPDATE), so it is stated rather
   * than guessed onto a clock (§13). A window the server cannot date does not start.
   */
  | "no_declaration_timestamp";

export interface CompletionEligibility {
  bookingId: string;
  rule: CompletionRule | null;
  eligible: boolean;
  reason?: IneligibleReason;
  /** The server-derived facts the decision rests on — copied onto the booking row when it fires. */
  evidence: Record<string, unknown>;
  /** When this booking becomes eligible, when that is knowable. Diagnostic only. */
  eligibleAt?: string;
  /**
   * TRUE only in ruling 69 disposition 1's NARROW no-date case: an in_person/hybrid booking whose
   * service date the server does not hold, so the timer can never fire for it. The disposition
   * opens the owner rail's provider-declared arm for exactly that case and no other — the timer is
   * the normal path. The SERVICE decides this, never the caller: `completeBooking` re-reads this
   * flag and a caller that asks for the fallback on a dated booking is refused.
   */
  ownerDeclarableFallback?: boolean;
}

interface BookingRow {
  id: string;
  status: string | null;
  tripId: string | null;
  serviceId: string | null;
  providerId: string | null;
  /** The traveler who bought it — the ONLY principal the component-cancel rail admits (§14: matched against the session). */
  travelerId: string | null;
  /**
   * OC-B1's purchase-time contract snapshot (migration 291). Read by the component-cancel rail for the
   * SNAPSHOTTED cancellation policy tier (`policy.cancellationPolicyType`); NULL = never snapshotted (§13).
   */
  offeringContractSnapshot: unknown;
  confirmedAt: Date | null;
  /** D-26's per-booking delivery instant. NULL = the per-booking source has no answer (§13). */
  deliveredAt: Date | null;
  /** D-36: when the seller declared the work done. NULL = never declared (§13). */
  completionDeclaredAt: Date | null;
  slotId: string | null;
  bookingDetails: Record<string, any> | null;
  /** D-35: the three figures the partial settlement's reduced mint is derived FROM (read, never written here). */
  totalAmount: string | null;
  platformFee: string | null;
  providerEarnings: string | null;
}

interface ServiceRow {
  id: string;
  deliveryMethod: string | null;
  productShape: string | null;
  deliverableUploadedAt: Date | null;
  /** D-40: a hybrid listing's declared artifact. NULL = not declared (§13). */
  declaredArtifactDeliverable: string | null;
}

async function loadBooking(bookingId: string): Promise<BookingRow | null> {
  const [row] = await db
    .select({
      id: serviceBookings.id,
      status: serviceBookings.status,
      tripId: serviceBookings.tripId,
      serviceId: serviceBookings.serviceId,
      providerId: serviceBookings.providerId,
      travelerId: serviceBookings.travelerId,
      offeringContractSnapshot: serviceBookings.offeringContractSnapshot,
      confirmedAt: serviceBookings.confirmedAt,
      deliveredAt: serviceBookings.deliveredAt,
      completionDeclaredAt: serviceBookings.completionDeclaredAt,
      slotId: serviceBookings.slotId,
      bookingDetails: serviceBookings.bookingDetails,
      totalAmount: serviceBookings.totalAmount,
      platformFee: serviceBookings.platformFee,
      providerEarnings: serviceBookings.providerEarnings,
    })
    .from(serviceBookings)
    .where(eq(serviceBookings.id, bookingId));
  return (row as BookingRow) ?? null;
}

async function loadService(serviceId: string): Promise<ServiceRow | null> {
  const [row] = await db
    .select({
      id: providerServices.id,
      deliveryMethod: providerServices.deliveryMethod,
      productShape: providerServices.productShape,
      deliverableUploadedAt: providerServices.deliverableUploadedAt,
      declaredArtifactDeliverable: providerServices.declaredArtifactDeliverable,
    })
    .from(providerServices)
    .where(eq(providerServices.id, serviceId));
  return (row as ServiceRow) ?? null;
}

/** `YYYY-MM-DD` in UTC from a Date/date-string, or null when the value cannot be dated honestly. */
function toUtcDayString(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  }
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  // Already a bare calendar day (the `date` column shape, and the `checkOut` snapshot's shape).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/**
 * The booked service DATE for an in_person/hybrid booking (ruling 69 disposition 1), or null.
 *
 * Two server-side sources, strongest first — see the `service_date_timer` case for why these two
 * and nothing else. Returning null is a real answer: it means the platform does not know when this
 * service happens, and a completion timer must not run on a date nobody recorded.
 */
// Exported (ledger `2026-09-07-home-time-axis`): Home's unpaid-booking row is dated by THIS
// derivation — booked slot first, then the checkout snapshot, else undated and omitted — never a
// second answer to "when does this booking happen" (§18 rule 1; the audit above is the reason).
export async function resolveServiceDate(
  booking: Pick<BookingRow, "slotId" | "bookingDetails">,
): Promise<{ date: string; source: "booked_slot" | "scheduled_date" } | null> {
  if (booking.slotId) {
    const [slot] = await db
      .select({ date: vendorAvailabilitySlots.date })
      .from(vendorAvailabilitySlots)
      .where(eq(vendorAvailabilitySlots.id, booking.slotId));
    const slotDay = toUtcDayString(slot?.date as unknown);
    if (slotDay) return { date: slotDay, source: "booked_slot" };
  }
  const scheduled = toUtcDayString((booking.bookingDetails ?? {}).scheduledDate);
  if (scheduled) return { date: scheduled, source: "scheduled_date" };
  return null;
}

/**
 * THE ARTIFACT'S DELIVERY INSTANT — ONE derivation, stated with its SOURCE (D-27; ledger
 * `2026-09-15-d27-artifact-timer-acceptance-prompt`).
 *
 * This is the question "when was this artifact delivered to THIS traveler?", and it has exactly
 * two answers plus an honest third:
 *
 *   `per_booking`    `service_bookings.delivered_at` — the per-booking instant D-26 added, stamped
 *                    by the deliver rail and MOVED by every re-delivery. Preferred whenever it is
 *                    set, because it is the only one that is about this traveler.
 *   `listing_clock`  the pre-D-26 derivation ruling 63's two arms already used, kept verbatim:
 *                    the FIRST `deliverable_downloads` row for this booking (arm `downloaded` —
 *                    tried first because it covers a listing whose `deliverable_uploaded_at`
 *                    predates the column), else `max(confirmed_at, deliverable_uploaded_at)`
 *                    (arm `undownloaded`). It is a LISTING-level clock shared by every buyer,
 *                    which is why it is NAMED rather than presented as this traveler's delivery.
 *   `null`           NEITHER source answers. §13: the booking is NOT put on an acceptance clock,
 *                    is skipped with `no_delivery_timestamp`, and is never anchored on
 *                    `confirmed_at` alone, on the listing's upload instant alone, or on "now".
 *
 * IT NEVER WRITES. D-26's rule: a `listing_clock` instant is a DERIVATION, and stamping it onto
 * `delivered_at` would turn "we inferred this" into "the seller delivered on this date" — and would
 * move every other buyer's window with it the moment the listing's file changed.
 *
 * ONE IMPLEMENTATION, TWO READERS (§18 rule 1): the `artifact_timer` eligibility arm above and the
 * acceptance-prompt/escalation arm in `artifact-acceptance-timer.service.ts`. A second copy in the
 * job is exactly the derivation-drift class that rule names.
 */
export interface ArtifactDeliveryInstant {
  at: Date;
  source: DeliveryInstantSource;
  /** Which listing-clock arm produced it. `null` on the per-booking source. */
  arm: "downloaded" | "undownloaded" | null;
}

export async function resolveArtifactDeliveryInstant(
  booking: Pick<BookingRow, "id" | "confirmedAt"> & { deliveredAt?: Date | null },
  service: Pick<ServiceRow, "deliverableUploadedAt">,
): Promise<ArtifactDeliveryInstant | null> {
  // D-26's per-booking instant wins outright when it exists — it is the only one that moves with a
  // re-delivery, which is the whole reason the column was added.
  const perBooking = booking.deliveredAt ?? null;
  if (perBooking && Number.isFinite(new Date(perBooking).getTime())) {
    return { at: new Date(perBooking), source: "per_booking", arm: null };
  }

  const [first] = await db
    .select({ downloadedAt: deliverableDownloads.downloadedAt })
    .from(deliverableDownloads)
    .where(eq(deliverableDownloads.bookingId, booking.id))
    .orderBy(asc(deliverableDownloads.downloadedAt))
    .limit(1);
  if (first?.downloadedAt) {
    return { at: new Date(first.downloadedAt), source: "listing_clock", arm: "downloaded" };
  }

  if (!booking.confirmedAt || !service.deliverableUploadedAt) return null;
  const ms = Math.max(
    new Date(booking.confirmedAt).getTime(),
    new Date(service.deliverableUploadedAt).getTime(),
  );
  if (!Number.isFinite(ms)) return null;
  return { at: new Date(ms), source: "listing_clock", arm: "undownloaded" };
}

const no = (
  bookingId: string,
  rule: CompletionRule | null,
  reason: IneligibleReason,
  evidence: Record<string, unknown> = {},
): CompletionEligibility => ({ bookingId, rule, eligible: false, reason, evidence });

/**
 * Resolve — entirely from server-side records — whether a booking's D8 completion condition is
 * met right now. Reads nothing from any request body (§14 posture applied to a non-money read
 * that nonetheless *triggers* money).
 */
export async function resolveCompletionEligibility(
  bookingId: string,
  now: Date = new Date(),
  opts: {
    /**
     * D-6: resolve for a TRAVELER'S ACCEPTANCE rather than for a rule firing. The from-state
     * becomes `awaiting_acceptance` (not `confirmed`), and the acceptance itself IS the condition —
     * exactly as `provider_declared` returns `evidence: { declared: true }` because the declaration
     * is the condition there. It is a MODE of the one resolver, not a second one (§18 rule 1).
     */
    acceptance?: boolean;
    /**
     * D-7: resolve for the DECLARED WINDOW'S CLOSE rather than for a rule firing. The from-state
     * becomes `completion_declared`, and the condition is "the derived deadline has passed" —
     * `completion_declared_at + declaredCompletionWindowDays()`. A MODE of the one resolver, like
     * `acceptance` (§18 rule 1).
     */
    declaredWindow?: boolean;
  } = {},
): Promise<CompletionEligibility> {
  const forAcceptance = opts.acceptance === true;
  const forDeclaredWindow = opts.declaredWindow === true && !forAcceptance;
  const allowedFrom = forAcceptance
    ? ACCEPTANCE_FROM_STATUSES
    : forDeclaredWindow
      ? DECLARED_WINDOW_CLOSE_FROM_STATUSES
      : COMPLETION_ALLOWED_FROM_STATUSES;
  const booking = await loadBooking(bookingId);
  if (!booking) return no(bookingId, null, "booking_not_found");
  if (!allowedFrom.includes(booking.status ?? "")) {
    return no(bookingId, null, "wrong_status", { status: booking.status });
  }
  if (!booking.serviceId) return no(bookingId, null, "service_not_found");
  const service = await loadService(booking.serviceId);
  if (!service) return no(bookingId, null, "service_not_found");

  const rule = completionRuleFor({
    deliveryMethod: service.deliveryMethod,
    productShape: service.productShape,
  });
  // D-6: the acceptance arm answers BEFORE the per-rule switch, and deliberately so. A traveler's
  // acceptance is not a rule firing — it is the strongest evidence on the platform (the payer
  // saying "this is what I bought"), so it must not be made to satisfy the `artifact_timer`
  // window it exists to replace. It still resolves the RULE above, because the provenance the flip
  // records must name the rule the booking actually falls under.
  if (forAcceptance) {
    const mode = acceptanceModeFor({
      deliveryMethod: service.deliveryMethod,
      productShape: service.productShape,
      declaredArtifactDeliverable: service.declaredArtifactDeliverable,
    });
    if (mode !== "gates_completion") {
      return no(bookingId, rule, "acceptance_does_not_complete", { acceptanceMode: mode });
    }
    return {
      bookingId,
      rule,
      eligible: true,
      evidence: { accepted: true, basis: "traveler_acceptance", acceptanceMode: mode },
    };
  }
  if (!rule) {
    return no(bookingId, null, "unclassifiable_service", {
      deliveryMethod: service.deliveryMethod,
      productShape: service.productShape,
    });
  }

  const details = (booking.bookingDetails ?? {}) as Record<string, any>;

  // D-7: THE DECLARED WINDOW'S CLOSE answers before the per-rule switch, and deliberately so. The
  // per-rule conditions were ALREADY satisfied when the seller declared (they are what
  // `declareBookingCompletion` resolved, and their evidence is on the row); re-running them here
  // would let a slot edited after the declaration, or a listing reclassified, un-declare a
  // declaration the traveler was told about. The one condition that is this arm's own is time.
  if (forDeclaredWindow) {
    const declaredAt = booking.completionDeclaredAt;
    if (!declaredAt || !Number.isFinite(new Date(declaredAt).getTime())) {
      // §13: a declared row with no declaration instant is not guessed onto a clock.
      return no(bookingId, rule, "no_declaration_timestamp", { status: booking.status });
    }
    const windowDays = declaredCompletionWindowDays();
    const deadline = declaredCompletionDeadline(declaredAt, windowDays);
    const evidence = {
      basis: "declared_window_elapsed",
      declaredAt: new Date(declaredAt).toISOString(),
      windowDays,
      deadline,
      // The declaration this close is answering — rule, actor, evidence — copied so the
      // completion record can be read on its own months later (§13: who said done, and on what).
      declaration: details.completionDeclaration ?? null,
    };
    if (deadline === null) {
      return no(bookingId, rule, "no_declaration_timestamp", evidence);
    }
    if (now.getTime() < Date.parse(deadline)) {
      return { ...no(bookingId, rule, "window_open", evidence), eligibleAt: deadline };
    }
    return { bookingId, rule, eligible: true, evidence };
  }

  switch (rule) {
    // ── in_person / hybrid: the BOOKED SERVICE DATE timer (ruling 69 disposition 1, amending
    // ruling 63's "untouched" clause and closing ruling 66's "in-person has no writer" finding).
    //
    // THE DATE SOURCE IS AUDITED, NOT ASSUMED. `service_bookings` has no `booking_date` column at
    // all; two server-side records can date this booking and they are tried in order of strength:
    //   (1) the BOOKED SLOT (`slot_id` → `vendor_availability_slots.date`) — the same evidence the
    //       session_end rule gates on, and the strongest because the provider published it;
    //   (2) `bookingDetails.scheduledDate` — the purchase-time snapshot checkout writes from the
    //       cart row. Second because a cart line can carry a date the provider never confirmed.
    // Anything else — `createdAt`, "a few days after purchase", a duration guess — is a GUESSED
    // date minting real money, which is precisely what §13 forbids.
    //
    // WHEN: N days after the service DAY has FULLY passed, N = `serviceDateCompletionDays()` =
    // `holdWindowDays('service_booking')`. The day boundary (not the slot's end time) is used even
    // when a slot supplies the date, so both sources answer identically and a same-day booking is
    // never completed while the traveler could still be at the service.
    case "service_date_timer": {
      const dated = await resolveServiceDate(booking);
      if (!dated) {
        // §13 + the disposition's own words: a booking with NO service date is NOT timer-eligible.
        // This is the ONE case that opens the owner rail's provider-declared arm for in-person.
        return {
          ...no(bookingId, rule, "no_service_date", {
            slotId: booking.slotId ?? null,
            scheduledDate: details.scheduledDate ?? null,
          }),
          ownerDeclarableFallback: true,
        };
      }
      const windowDays = serviceDateCompletionDays();
      const eligibleAtMs = Date.parse(`${dated.date}T00:00:00Z`) + DAY_MS + windowDays * DAY_MS;
      const evidence = {
        serviceDate: dated.date,
        dateSource: dated.source,
        windowDays,
        eligibleAt: new Date(eligibleAtMs).toISOString(),
      };
      if (now.getTime() < eligibleAtMs) {
        return { ...no(bookingId, rule, "window_open", evidence), eligibleAt: evidence.eligibleAt };
      }
      return { bookingId, rule, eligible: true, evidence };
    }

    // ── property: the stay's CHECKOUT DATE (snapshotted into bookingDetails at purchase). ─────
    case "checkout_date": {
      const checkOut = typeof details.checkOut === "string" ? details.checkOut : null;
      if (!checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
        // §13: a property booking with no snapshotted stay range cannot be dated. Skipped with
        // the reason, never approximated from createdAt or "a few nights".
        return no(bookingId, rule, "no_checkout_date", { checkOut: details.checkOut ?? null });
      }
      // Conservative by construction: the checkout DAY must have fully passed (UTC), so a stay is
      // never completed while the traveler could still be in the room. Grace is config, default 0.
      const eligibleAtMs =
        Date.parse(`${checkOut}T00:00:00Z`) + DAY_MS + PROPERTY_AUTO_COMPLETE_GRACE_DAYS * DAY_MS;
      const evidence = { checkOut, eligibleAt: new Date(eligibleAtMs).toISOString() };
      if (now.getTime() < eligibleAtMs) {
        return { ...no(bookingId, rule, "window_open", evidence), eligibleAt: evidence.eligibleAt };
      }
      return { bookingId, rule, eligible: true, evidence };
    }

    // ── pdf: RETIRED AS A COMPLETION RULE (D-27; ledger
    // `2026-09-15-d27-artifact-timer-acceptance-prompt`). ─────────────────────────────────────
    //
    // Ruling 63's two arms — "7 days after FIRST download" and "7 days UNDOWNLOADED post-delivery"
    // — no longer COMPLETE anything. D-6 forbids a silent timeout completing in the seller's
    // favour, so an artifact booking completes only when the traveler accepts it
    // (`traveler_accepted`, the acceptance rail) or when a human resolves the dispute an
    // unanswered window escalates into.
    //
    // §13, AND IT IS THE REASON THIS ARM ANSWERS `false` RATHER THAN BEING DELETED. `artifact_timer`
    // is still the TRUE answer to "which rule governs this booking", so `completionRuleFor` still
    // returns it and this switch still has a case for it. What it must never do again is report
    // `eligible: true` for a booking nothing may complete — an eligibility nobody can act on is
    // worse than a stated refusal, because every reader takes it as a pending completion. The
    // refusal names the reason and carries the DERIVED delivery instant as evidence, so an ops
    // question ("why has this not completed?") is answerable from the row.
    //
    // The two arms themselves did not disappear: they ARE the delivery-instant derivation, lifted
    // into `resolveArtifactDeliveryInstant` below and read by the acceptance-prompt arm (§18 rule 1
    // — one derivation, two readers, never a second copy in the job).
    case "artifact_timer": {
      const instant = await resolveArtifactDeliveryInstant(booking, service);
      return no(bookingId, rule, "artifact_takes_acceptance", {
        acceptanceRule: "traveler_acceptance",
        ...(instant
          ? { deliveredAt: instant.at.toISOString(), deliveryInstantSource: instant.source, arm: instant.arm }
          : { deliveredAt: null, deliveryInstantSource: null }),
      });
    }

    // ── call / video / voice_notes: "session end PER BOOKED SLOT, provider-confirmed". ────────
    case "session_end": {
      if (!booking.slotId) {
        // §13: ruling 63 anchors this rule to the BOOKED SLOT. No slot ⇒ no session end the
        // server can know ⇒ refused with the reason, never inferred from a scheduledDate string
        // whose timezone we do not know. (This is why a voice_notes booking — which D2 does not
        // classify as scheduled, so it typically has no slot — is reported as a gap, not
        // silently completed.)
        return no(bookingId, rule, "no_booked_slot");
      }
      const [slot] = await db
        .select({ date: vendorAvailabilitySlots.date, endTime: vendorAvailabilitySlots.endTime })
        .from(vendorAvailabilitySlots)
        .where(eq(vendorAvailabilitySlots.id, booking.slotId));
      if (!slot) return no(bookingId, rule, "no_booked_slot", { slotId: booking.slotId });
      const endTime = (slot.endTime ?? "").trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
        return no(bookingId, rule, "slot_has_no_end_time", { slotId: booking.slotId, endTime: slot.endTime ?? null });
      }
      const endsAtMs = Date.parse(`${String(slot.date)}T${endTime}:00Z`);
      if (!Number.isFinite(endsAtMs)) {
        return no(bookingId, rule, "slot_has_no_end_time", { slotId: booking.slotId, date: String(slot.date), endTime });
      }
      const evidence = { slotId: booking.slotId, sessionEndsAt: new Date(endsAtMs).toISOString() };
      if (now.getTime() < endsAtMs) {
        return { ...no(bookingId, rule, "session_not_ended", evidence), eligibleAt: evidence.sessionEndsAt };
      }
      return { bookingId, rule, eligible: true, evidence };
    }

    // ── async_messaging: "SLA satisfied + scope delivered, PROVIDER-DECLARED". The declaration
    // itself is the condition; the disputable window is the escrow window the flip inherits. ──
    case "provider_declared":
      return { bookingId, rule, eligible: true, evidence: { declared: true } };

    // ── bundle (D-32..D-35, ledger `2026-09-16-d32-d35-bundle-components`): the component states are
    // read ROWS FIRST (`booking_component_states`, migration 306) and the legacy `componentCompletions`
    // jsonb SECOND, and the evidence NAMES which source answered (`componentStateSource`, §13). The
    // parent's outcome is the ONE derivation `deriveBundleOutcome` (§18 rule 1 — brief §2 rule 1: the
    // parent state is DERIVED, never stored twice), and `completed` still means EVERY component
    // (brief §2 rule 2). A partially complete bundle is a NEW answer beside the old ones — never a
    // looser version of them — and it is refused HERE so `completeBooking` can never mint the full
    // figures for it; `settleBundlePartialCompletion` owns that flip and its reduced mint. ────────
    case "bundle_components": {
      const states = await readBundleComponentStates({
        bookingId: booking.id,
        bookingDetails: details,
        bundleServiceId: service.id,
      });
      if (states.components.length === 0) {
        // §13: a bundle whose contents we cannot enumerate is never "all complete" by default.
        return no(bookingId, rule, "bundle_components_unknown", { componentStateSource: states.source });
      }
      const outcome = deriveBundleOutcome(states.components);
      const evidence = {
        componentStateSource: states.source,
        componentIds: states.components.map((c) => c.componentServiceId),
        completedComponentIds: outcome.completedComponentIds,
        missingComponentIds: outcome.pendingComponentIds,
        // NAMED, not counted (brief §4): the undelivered components carry the name they were bought under.
        undeliveredComponents: states.components
          .filter((c) => outcome.undeliveredComponentIds.includes(c.componentServiceId))
          .map((c) => ({ id: c.componentServiceId, serviceName: c.serviceName, status: c.status })),
        outcome: outcome.outcome,
      };
      switch (outcome.outcome) {
        case "completed":
          return { bookingId, rule, eligible: true, evidence };
        case "incomplete":
          // At least one component is still pending: the parent stays `confirmed`, exactly as before.
          return no(bookingId, rule, "bundle_components_incomplete", evidence);
        case "partially_completed":
          return no(bookingId, rule, "bundle_partially_completed", evidence);
        case "all_undelivered":
          // Nothing was delivered: the EXISTING whole-row refund rail's case, untouched by this lane.
          return no(bookingId, rule, "bundle_components_undelivered", evidence);
        case "no_components":
          return no(bookingId, rule, "bundle_components_unknown", evidence);
      }
    }
  }
}

export interface CompleteBookingResult {
  completed: boolean;
  bookingId: string;
  rule: CompletionRule | null;
  reason?: IneligibleReason | "lost_race";
  evidence: Record<string, unknown>;
}

/**
 * THE shared completion event. Every D8 rule ends here and nowhere else.
 *
 * 1. Re-resolve eligibility server-side (the caller's opinion is never trusted).
 * 2. Flip `confirmed → completed` through `storage.updateServiceBookingStatus` with
 *    `expectedFromStatuses` — the §15 atomic conditional IS the guard, so the flip, the platform
 *    revenue row and both held earnings happen exactly once no matter how many callers race.
 * 3. Record the provenance (booking row + diary row). Never before the flip: a completion
 *    nobody won must leave no trace claiming it did (§15b — irreversible state follows the
 *    operation that authorizes it).
 */
export async function completeBooking(input: {
  bookingId: string;
  actor: CompletionActor;
  now?: Date;
  reason?: string;
  /**
   * Ruling 69 disposition 1's NARROW no-date arm. The caller states which RAIL it is (only the
   * owner rail may pass this); the SERVICE still decides whether the fallback applies, by
   * requiring `eligibility.ownerDeclarableFallback`. A booking that HAS a service date is refused
   * exactly as before — the timer is the normal path and this cannot short-circuit it.
   */
  allowOwnerDeclaredFallback?: boolean;
}): Promise<CompleteBookingResult> {
  const now = input.now ?? new Date();
  // D-6: the acceptance arm is chosen by the ACTOR, never by a caller-supplied flag — the actor tag
  // is the caller's one statement of which rail it is, and the SERVICE decides everything else
  // (the same posture ruling 69's `allowOwnerDeclaredFallback` takes one arm over).
  const forAcceptance = isAcceptanceActor(input.actor);
  const forDeclaredWindow = isWindowCloseActor(input.actor);
  const eligibility = await resolveCompletionEligibility(input.bookingId, now, {
    acceptance: forAcceptance,
    declaredWindow: forDeclaredWindow,
  });
  const takesNoDateFallback =
    !eligibility.eligible && !!input.allowOwnerDeclaredFallback && !!eligibility.ownerDeclarableFallback;
  if (!eligibility.eligible && !takesNoDateFallback) {
    return {
      completed: false,
      bookingId: input.bookingId,
      rule: eligibility.rule,
      reason: eligibility.reason,
      evidence: eligibility.evidence,
    };
  }

  const updated = await storage.updateServiceBookingStatus(
    input.bookingId,
    "completed",
    input.reason,
    // §15/§18b: THE TRANSITION IS THE GUARD, and the acceptance rail claims its OWN from-state.
    // `awaiting_acceptance` is deliberately NOT added to `COMPLETION_ALLOWED_FROM_STATUSES`: that
    // list is also the timer's candidate predicate (`findAutoCompleteCandidates`), and widening it
    // would hand the nightly job the very bookings D-6 forbids it to complete.
    //
    // D-7: the window's close claims ITS OWN from-state too (`completion_declared`), for the same
    // reason. A `disputed` row is in neither list, so a dispute inside the window stops this flip by
    // construction — no check, no flag, the UPDATE simply matches nothing.
    forAcceptance
      ? ACCEPTANCE_FROM_STATUSES
      : forDeclaredWindow
        ? DECLARED_WINDOW_CLOSE_FROM_STATUSES
        : COMPLETION_ALLOWED_FROM_STATUSES,
  );
  if (!updated) {
    // Lost the atomic race (or the row vanished). Exactly one caller wins; the loser mints no
    // earnings, writes no diary row and performs no compensation. Re-running is safe.
    return {
      completed: false,
      bookingId: input.bookingId,
      rule: eligibility.rule,
      reason: "lost_race",
      evidence: eligibility.evidence,
    };
  }

  // (a) Provenance on the booking row — durable, present even for a tripless booking, and it
  // carries the evidence the decision rested on so an ops question is answerable months later.
  await db
    .update(serviceBookings)
    .set({
      // D-24: `accepted_at` records the ANSWER that caused the completion, where `completed_at`
      // records the money event. Written HERE — after this caller provably WON the atomic
      // conditional above — and by this actor only, so a future admin-review completion out of the
      // same `awaiting_acceptance` state can never be read as a traveler's acceptance (§13).
      ...(forAcceptance ? { acceptedAt: now } : {}),
      bookingDetails: sql`COALESCE(${serviceBookings.bookingDetails}, '{}'::jsonb) || ${JSON.stringify({
        completion: {
          rule: eligibility.rule,
          actor: input.actor,
          at: now.toISOString(),
          evidence: eligibility.evidence,
          // A completion taken on ruling 69's no-date arm must SAY it was — the row otherwise
          // reads as a normal timer completion for a date the platform never held (§13).
          ...(takesNoDateFallback
            ? { fallback: "owner_declared_no_service_date", ineligibleReason: eligibility.reason }
            : {}),
        },
      })}::jsonb`,
      updatedAt: now,
    })
    .where(eq(serviceBookings.id, input.bookingId));

  // (b) The diary row. Trip-scoped by construction (item_transition_log.trip_id NOT NULL), so a
  // booking with no trip honestly gets (a) only — the same constraint voidClaim lives with.
  if (updated.tripId) {
    try {
      await logItemTransition(db, {
        tripId: updated.tripId,
        itemId:
          typeof (updated.bookingDetails as any)?.itineraryItemId === "string"
            ? ((updated.bookingDetails as any).itineraryItemId as string)
            : null,
        eventType: "booking_completed",
        // The state this flip actually consumed — `awaiting_acceptance` on the acceptance rail,
        // `completion_declared` at the declared window's close. A diary row that always said
        // "confirmed" would misreport the two transitions that are not.
        fromStatus: forAcceptance
          ? "awaiting_acceptance"
          : forDeclaredWindow
            ? COMPLETION_DECLARED_STATUS
            : "confirmed",
        toStatus: "completed",
        actorType: DIARY_ACTOR[input.actor],
      });
    } catch (err) {
      // The flip already happened and is the money-bearing fact; a diary failure must not
      // un-complete it or 500 a timer pass. Loud, not silent.
      console.error("[booking-completion] diary row failed after a successful flip:", err);
    }
  }

  return { completed: true, bookingId: input.bookingId, rule: eligibility.rule, evidence: eligibility.evidence };
}

export interface DeclareCompletionResult {
  declared: boolean;
  bookingId: string;
  rule: CompletionRule | null;
  reason?: IneligibleReason | "lost_race";
  evidence: Record<string, unknown>;
  /** Present on success: the stamped declaration instant and the DERIVED window the traveler has. */
  declaredAt?: string;
  disputeBy?: string;
  windowDays?: number;
}

/**
 * D-7: THE DECLARATION — the FIRST of the two flips (`confirmed → completion_declared`). It MINTS
 * NOTHING; the money event is `completeBooking`'s `window_elapsed` arm at the window's close.
 *
 * 1. Re-resolve eligibility server-side exactly as `completeBooking` does for an owner rule — the
 *    session ended per the booked slot, the scope was declared, the booked service day (plus
 *    ruling 69's N) passed — so a seller cannot declare a session before its slot says it ended
 *    (brief §14: "a session the server cannot evidence is refused, not guessed").
 * 2. Flip through `storage.updateServiceBookingStatus` with `COMPLETION_DECLARABLE_FROM_STATUSES`
 *    (§15: the transition is the guard — a double declaration is ONE flip; the loser sees
 *    `undefined`). The writer stamps `completion_declared_at` in the SAME UPDATE.
 * 3. Record the provenance (`bookingDetails.completionDeclaration` + a `booking_completion_declared`
 *    diary row) AFTER the flip — a declaration nobody won must leave no trace claiming it did.
 */
export async function declareBookingCompletion(input: {
  bookingId: string;
  actor: CompletionActor;
  now?: Date;
  reason?: string;
  /** Ruling 69 disposition 1's NARROW no-date arm — the owner rail only; the SERVICE still decides. */
  allowOwnerDeclaredFallback?: boolean;
}): Promise<DeclareCompletionResult> {
  const now = input.now ?? new Date();
  // The declaration is a RULE firing (an owner's, or the service-date timer's); the acceptance and
  // window-close actors have their own arms of `completeBooking` and are refused here by the
  // ordinary eligibility path (their from-states are not `confirmed`).
  const eligibility = await resolveCompletionEligibility(input.bookingId, now);
  const takesNoDateFallback =
    !eligibility.eligible && !!input.allowOwnerDeclaredFallback && !!eligibility.ownerDeclarableFallback;
  if (!eligibility.eligible && !takesNoDateFallback) {
    return {
      declared: false,
      bookingId: input.bookingId,
      rule: eligibility.rule,
      reason: eligibility.reason,
      evidence: eligibility.evidence,
    };
  }

  const updated = await storage.updateServiceBookingStatus(
    input.bookingId,
    COMPLETION_DECLARED_STATUS,
    input.reason,
    COMPLETION_DECLARABLE_FROM_STATUSES,
  );
  if (!updated) {
    return {
      declared: false,
      bookingId: input.bookingId,
      rule: eligibility.rule,
      reason: "lost_race",
      evidence: eligibility.evidence,
    };
  }

  const windowDays = declaredCompletionWindowDays();
  const declaredAt = updated.completionDeclaredAt ? new Date(updated.completionDeclaredAt) : now;
  const disputeBy = declaredCompletionDeadline(declaredAt, windowDays);

  // (a) Provenance on the booking row — the declaration's rule, actor, instant and evidence, under
  // its OWN key. `bookingDetails.completion` stays the COMPLETION's record and is written only by
  // the flip that mints; a reader must be able to tell "declared" from "completed" on the row.
  await db
    .update(serviceBookings)
    .set({
      bookingDetails: sql`COALESCE(${serviceBookings.bookingDetails}, '{}'::jsonb) || ${JSON.stringify({
        completionDeclaration: {
          rule: eligibility.rule,
          actor: input.actor,
          at: declaredAt.toISOString(),
          evidence: eligibility.evidence,
          windowDays,
          disputeBy,
          ...(takesNoDateFallback
            ? { fallback: "owner_declared_no_service_date", ineligibleReason: eligibility.reason }
            : {}),
        },
      })}::jsonb`,
      updatedAt: now,
    })
    .where(eq(serviceBookings.id, input.bookingId));

  // (b) The diary row — trip-scoped by construction, so a tripless booking honestly gets (a) only.
  if (updated.tripId) {
    try {
      await logItemTransition(db, {
        tripId: updated.tripId,
        itemId:
          typeof (updated.bookingDetails as any)?.itineraryItemId === "string"
            ? ((updated.bookingDetails as any).itineraryItemId as string)
            : null,
        eventType: "booking_completion_declared",
        fromStatus: "confirmed",
        toStatus: COMPLETION_DECLARED_STATUS,
        actorType: DIARY_ACTOR[input.actor],
      });
    } catch (err) {
      console.error("[booking-completion] diary row failed after a successful declaration:", err);
    }
  }

  return {
    declared: true,
    bookingId: input.bookingId,
    rule: eligibility.rule,
    evidence: eligibility.evidence,
    declaredAt: declaredAt.toISOString(),
    ...(disputeBy ? { disputeBy } : {}),
    windowDays,
  };
}

/**
 * THE DECLARED-WINDOW DETECTOR: bookings whose seller declared and whose derived deadline MAY have
 * passed. Narrow SQL pre-filter (status + a floor on the declaration instant), then
 * `resolveCompletionEligibility({ declaredWindow: true })` decides — one predicate, not a second
 * copy in SQL. The floor is exact: a window cannot close before `declared_at + windowDays`.
 *
 * `disputed` rows never appear (the status predicate), so a traveler's objection stops the timer
 * here AND at the guarded flip — two independent layers, each sufficient. The UNPAID-RECHECK stamp
 * the pass-1 payment gate writes is honoured the same way pass 1 honours it.
 */
export async function findDeclaredWindowCandidates(now: Date = new Date(), limit = 2000): Promise<string[]> {
  const floor = new Date(now.getTime() - declaredCompletionWindowDays() * DAY_MS);
  const nowIso = now.toISOString();
  const rows = await db
    .select({ id: serviceBookings.id })
    .from(serviceBookings)
    .where(
      and(
        inArray(serviceBookings.status, DECLARED_WINDOW_CLOSE_FROM_STATUSES),
        sql`${serviceBookings.completionDeclaredAt} IS NOT NULL`,
        sql`${serviceBookings.completionDeclaredAt} <= ${floor}`,
        sql`(
          ${serviceBookings.bookingMetadata}->>'autoCompleteUnpaidRecheckAt' IS NULL
          OR (${serviceBookings.bookingMetadata}->>'autoCompleteUnpaidRecheckAt')::timestamptz <= ${nowIso}::timestamptz
        )`,
      ),
    )
    .orderBy(asc(serviceBookings.completionDeclaredAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * ── LD 50 REMAINDER, THE CAPACITY HALF — WHAT A FAILED OR CANCELLED COMPONENT RELEASES, AND WHY THE
 * HONEST ANSWER IS "NOTHING, AND HERE IS WHAT IS RESERVED INSTEAD" (§13; ledger
 * `2026-09-17-ld50-remainder-and-artifact-refund`) ──────────────────────────────────────────────────
 *
 * The question the lane was asked: when a component is declared `failed` or is cancelled by the
 * traveler, does it give its reserved slot capacity back? The answer, verified against every writer on
 * `main`, is that **no capacity is reserved PER COMPONENT anywhere in this codebase**:
 *
 *   · the checkout claims capacity PER CART LINE (`storage.bookSlot(item.slotId, units)`), and a bundle
 *     is ONE cart line — so a bundle booking holds ONE slot claim (or, for a stay, one per night),
 *     recorded on the booking as `slot_id` / `booking_details.claimedSlotIds` + `claimedSlotUnits`;
 *   · the purchase-time component snapshot (`booking_details.bundleComponents`) carries `id`,
 *     `serviceName` and `priceCents` and NO slot;
 *   · `booking_component_states` (migrations 306/307/309) has no slot column.
 *
 * So there is nothing per-component to release, and releasing the BOOKING's own claim on a component
 * outcome would be wrong twice over: the bundle still occupies its window, and the D-51 ruling says in
 * terms that a partial settlement "must not use the terminal whole-row `refunded` state **or release
 * all reserved capacity**". The booking-level claim is released by the ONE existing rail that owns it —
 * the first transition into `cancelled`/`refunded` inside `storage.updateServiceBookingStatus`, and
 * `refundServiceBooking`'s post-refund release — through `deriveClaimedSlotIds` / `deriveClaimedSlotUnits`,
 * which this function READS and never restates (§18 rule 1).
 *
 * WHAT THIS FUNCTION IS FOR, THEN: making that absence a STATED FACT on every component outcome rather
 * than silence. The evidence key `componentCapacity` says released: 0, names the reason, and names what
 * the booking DOES hold — so an operator reading a failed component can see that no capacity was
 * stranded and no capacity was wrongly handed back.
 *
 * IF A LATER LANE EVER RESERVES CAPACITY PER COMPONENT it needs a per-component slot record — a column
 * on `booking_component_states` (or a `slotId` on the snapshot entry), which is a schema/composer
 * decision nobody has ratified. It is NOT invented here: a reader for a fact no writer produces is the
 * speculative shape §18c refuses. The release would then go through the EXISTING
 * `storage.releaseSlot(id, units)` (V-26) inside the component's own atomic flip, whose
 * `status = 'pending'` predicate already makes the winner unique and the release exactly-once.
 */
export interface ComponentCapacityStatement {
  /** Slots this component outcome gave back. Always 0 today, and the reason says why (§13). */
  released: 0;
  reason: "no_component_capacity_reserved";
  /** What the BOOKING reserved, read through the ONE deciders — untouched by a component outcome. */
  bookingReservedSlotIds: string[];
  bookingReservedUnitsPerSlot: number;
}

export function describeComponentCapacity(input: {
  bookingDetails: Record<string, unknown> | null | undefined;
  bookingSlotId: string | null | undefined;
}): ComponentCapacityStatement {
  return {
    released: 0,
    reason: "no_component_capacity_reserved",
    bookingReservedSlotIds: deriveClaimedSlotIds(input.bookingDetails, input.bookingSlotId ?? null),
    bookingReservedUnitsPerSlot: deriveClaimedSlotUnits(input.bookingDetails),
  };
}

/**
 * Record ONE bundle component as delivered, then complete — or PARTIALLY complete — the booking if
 * that was the last answer outstanding.
 *
 * D-32 (ledger `2026-09-16-d32-d35-bundle-components`): a booking born with `booking_component_states`
 * rows is written THERE — `pending → completed` as an atomic conditional (`claimComponentCompleted`:
 * the component must still be pending AND the parent still `confirmed`, one statement, so a double
 * call is ONE flip and the second caller is told `alreadyRecorded`). A LEGACY booking (no rows) keeps
 * the jsonb merge it always had — the old map is still read, never rewritten into rows (no backfill).
 *
 * After the write, the ONE derivation decides the parent: all complete ⇒ the SAME shared
 * `completeBooking`; some delivered and the rest failed ⇒ `settleBundlePartialCompletion` (D-34/D-35);
 * anything still pending ⇒ a successful record and an explicitly uncompleted booking.
 */
export async function recordBundleComponentCompletion(input: {
  bookingId: string;
  componentServiceId: string;
  actor: CompletionActor;
  now?: Date;
}): Promise<
  CompleteBookingResult & {
    recorded: boolean;
    unknownComponent?: boolean;
    /** D-32: this call found the component already out of `pending` — a retry, not a second delivery. */
    alreadyRecorded?: boolean;
    /** D-51: the money leg's NAMED result when a partial settlement was attempted on this call. */
    settlement?: BundlePartialSettlementResult | null;
    /** D-34: the parent moved to `partially_completed` (and minted the reduced figures) on this call. */
    partiallyCompleted?: boolean;
    componentStateSource?: ComponentStateSource;
  }
> {
  const now = input.now ?? new Date();
  const pre = await resolveCompletionEligibility(input.bookingId, now);
  if (pre.rule !== "bundle_components") {
    return {
      recorded: false,
      completed: false,
      bookingId: input.bookingId,
      rule: pre.rule,
      reason: pre.reason ?? "rule_not_owner_declared",
      evidence: pre.evidence,
    };
  }
  const known = Array.isArray((pre.evidence as any).componentIds)
    ? ((pre.evidence as any).componentIds as string[])
    : [];
  if (!known.includes(input.componentServiceId)) {
    // Never invent a component. A declaration naming something outside the purchase-time
    // snapshot is rejected, not merged (§13, and it would otherwise let an owner "complete" a
    // bundle by declaring an id that is not in it).
    return {
      recorded: false,
      unknownComponent: true,
      completed: false,
      bookingId: input.bookingId,
      rule: pre.rule,
      reason: "bundle_components_incomplete",
      evidence: pre.evidence,
    };
  }
  const source = (pre.evidence as any).componentStateSource as ComponentStateSource;

  let alreadyRecorded = false;
  if (source === "rows") {
    const claim = await claimComponentCompleted({
      bookingId: input.bookingId,
      componentServiceId: input.componentServiceId,
      parentFromStatuses: COMPLETION_ALLOWED_FROM_STATUSES,
      now,
    });
    if (!claim.claimed) {
      if (claim.currentStatus !== "completed") {
        // The component is `failed` (or the parent left `confirmed`): a delivery cannot be recorded
        // over a failure, and the caller is told which state refused it rather than a bare false.
        return {
          recorded: false,
          completed: false,
          bookingId: input.bookingId,
          rule: pre.rule,
          reason: pre.reason ?? "bundle_components_incomplete",
          evidence: { ...pre.evidence, componentServiceId: input.componentServiceId, componentStatus: claim.currentStatus },
          componentStateSource: source,
        };
      }
      alreadyRecorded = true; // idempotent: same component, already delivered, ONE row flip ever
    }
  } else {
    // LEGACY (no rows): the jsonb merge, byte-for-byte the pre-306 write. A repeat declaration is
    // idempotent (same key, same-or-later timestamp, still one component).
    await db
      .update(serviceBookings)
      .set({
        bookingDetails: sql`
          jsonb_set(
            COALESCE(${serviceBookings.bookingDetails}, '{}'::jsonb),
            '{componentCompletions}',
            COALESCE(${serviceBookings.bookingDetails} -> 'componentCompletions', '{}'::jsonb)
              || ${JSON.stringify({ [input.componentServiceId]: now.toISOString() })}::jsonb,
            true
          )`,
        updatedAt: now,
      })
      .where(and(eq(serviceBookings.id, input.bookingId), inArray(serviceBookings.status, COMPLETION_ALLOWED_FROM_STATUSES)));
  }

  // All components in? Then — and only then — the SAME shared completion event fires. Some in and the
  // rest failed? Then the partial settlement (D-34/D-35). `completeBooking` re-derives, so a partial
  // bundle is refused there (`bundle_partially_completed`) and handed to the settle path here.
  const result = await completeBooking({ bookingId: input.bookingId, actor: input.actor, now });
  if (!result.completed && result.reason === "bundle_partially_completed") {
    // D-51: the ONE settlement entry — the flip + reduced mint, then the money leg (claim → Stripe →
    // promote). Never a Stripe call from a single component's flip: this runs only once the derivation
    // says every component is conclusive.
    const settled = await settleBundlePartially({ bookingId: input.bookingId, actor: input.actor, now });
    return {
      ...result,
      reason: settled.settled ? undefined : settled.reason,
      evidence: settled.evidence,
      recorded: true,
      alreadyRecorded,
      partiallyCompleted: settled.flipped,
      settlement: settled.settlement,
      componentStateSource: source,
    };
  }
  // `partiallyCompleted: false` is STATED, not omitted: a caller that reads it must get the truth on
  // every branch, not only on the one that flipped (§13 — the same reason the declare rail states
  // `completed: false`).
  return { ...result, recorded: true, alreadyRecorded, partiallyCompleted: false, componentStateSource: source };
}

export interface BundleComponentFailureResult {
  recorded: boolean;
  bookingId: string;
  rule: CompletionRule | null;
  reason?: IneligibleReason | "lost_race";
  evidence: Record<string, unknown>;
  unknownComponent?: boolean;
  /** This call found the component already out of `pending` — a retry, not a second failure. */
  alreadyRecorded?: boolean;
  /** The parent moved to `partially_completed` (and minted the reduced figures) on this call. */
  partiallyCompleted: boolean;
  /** D-51: the money leg's NAMED result when a partial settlement was attempted on this call. */
  settlement?: BundlePartialSettlementResult | null;
  /**
   * `all_undelivered`: every component has now failed. Nothing flips — the EXISTING whole-row refund
   * rail owns that case (brief §2) — and the caller is told so rather than left to infer it.
   */
  parentOutcome?: string;
  componentStateSource?: ComponentStateSource;
}

/**
 * D-32/D-34 — record ONE bundle component as FAILED: the seller's statement that this component
 * will NOT be delivered. `pending → failed` as an atomic conditional (`claimComponentFailed` — the
 * component must still be pending AND the parent still `confirmed`; a double call is ONE flip). Then
 * the ONE derivation decides the parent: the rest delivered ⇒ `settleBundlePartialCompletion`;
 * nothing delivered ⇒ `all_undelivered`, nothing flips; some still pending ⇒ recorded, waiting.
 *
 * A LEGACY bundle (no rows) is REFUSED with `bundle_component_states_unavailable`: the jsonb never
 * held FAILED and cannot be claimed atomically, so such a bundle keeps the all-or-nothing rule and
 * the existing refund lane (§13 — stated, never approximated).
 *
 * `reason` is the seller's words, already bounded by the route's `.strict()` allowlist; NULL = none
 * given. No amount, rate or status arrives from the caller (§14/§19): the status written is this
 * function's, the money is the mint's, both server-side.
 */
export async function recordBundleComponentFailure(input: {
  bookingId: string;
  componentServiceId: string;
  actor: CompletionActor;
  reason?: string | null;
  now?: Date;
}): Promise<BundleComponentFailureResult> {
  const now = input.now ?? new Date();
  const pre = await resolveCompletionEligibility(input.bookingId, now);
  if (pre.rule !== "bundle_components") {
    return {
      recorded: false,
      partiallyCompleted: false,
      bookingId: input.bookingId,
      rule: pre.rule,
      reason: pre.reason ?? "rule_not_owner_declared",
      evidence: pre.evidence,
    };
  }
  const source = (pre.evidence as any).componentStateSource as ComponentStateSource | undefined;
  if (source !== "rows") {
    return {
      recorded: false,
      partiallyCompleted: false,
      bookingId: input.bookingId,
      rule: pre.rule,
      reason: "bundle_component_states_unavailable",
      evidence: pre.evidence,
      componentStateSource: source,
    };
  }
  const known = Array.isArray((pre.evidence as any).componentIds)
    ? ((pre.evidence as any).componentIds as string[])
    : [];
  if (!known.includes(input.componentServiceId)) {
    return {
      recorded: false,
      unknownComponent: true,
      partiallyCompleted: false,
      bookingId: input.bookingId,
      rule: pre.rule,
      reason: "bundle_components_incomplete",
      evidence: pre.evidence,
      componentStateSource: source,
    };
  }

  const claim = await claimComponentFailed({
    bookingId: input.bookingId,
    componentServiceId: input.componentServiceId,
    parentFromStatuses: COMPLETION_ALLOWED_FROM_STATUSES,
    reason: typeof input.reason === "string" && input.reason.trim().length > 0 ? input.reason.trim() : null,
    now,
  });
  let alreadyRecorded = false;
  if (!claim.claimed) {
    if (claim.currentStatus !== "failed") {
      // Already delivered (or the parent left `confirmed`): a failure cannot be declared over a
      // delivery. The caller learns which state refused it.
      return {
        recorded: false,
        partiallyCompleted: false,
        bookingId: input.bookingId,
        rule: pre.rule,
        reason: pre.reason ?? "bundle_components_incomplete",
        evidence: { ...pre.evidence, componentServiceId: input.componentServiceId, componentStatus: claim.currentStatus },
        componentStateSource: source,
      };
    }
    alreadyRecorded = true;
  }

  // LD 50 remainder (§13): a component outcome releases NO capacity, and that is SAID rather than
  // silent — see `describeComponentCapacity` for why nothing per-component is reserved on `main`.
  const failedBooking = await loadBooking(input.bookingId);
  const componentCapacity = describeComponentCapacity({
    bookingDetails: (failedBooking?.bookingDetails ?? null) as Record<string, unknown> | null,
    bookingSlotId: failedBooking?.slotId ?? null,
  });

  // Re-derive AFTER the write — the resolver is the one authority on what the components now say.
  const post = await resolveCompletionEligibility(input.bookingId, now);
  const outcome = (post.evidence as any).outcome as string | undefined;
  if (post.reason === "bundle_partially_completed") {
    // D-51: the ONE settlement entry (flip + reduced mint, then claim → Stripe → promote).
    const settled = await settleBundlePartially({ bookingId: input.bookingId, actor: input.actor, now });
    return {
      recorded: true,
      alreadyRecorded,
      partiallyCompleted: settled.flipped,
      settlement: settled.settlement,
      bookingId: input.bookingId,
      rule: pre.rule,
      reason: settled.settled ? undefined : settled.reason,
      evidence: { ...settled.evidence, componentCapacity },
      parentOutcome: outcome,
      componentStateSource: source,
    };
  }
  return {
    recorded: true,
    alreadyRecorded,
    partiallyCompleted: false,
    bookingId: input.bookingId,
    rule: pre.rule,
    reason: post.reason,
    evidence: { ...post.evidence, componentCapacity },
    parentOutcome: outcome,
    componentStateSource: source,
  };
}

/** The terms a traveler-cancelled component was cancelled under, as the rail states them back. */
export interface BundleComponentCancellationTerms {
  /** The SNAPSHOTTED tier (the bundle listing's policy at purchase), after the ONE normalization. */
  policyType: CancellationPolicyType;
  /** True when the snapshot recorded NO policy and the normalizer defaulted to flexible. */
  policyDefaulted: boolean;
  /** Hours from the cancel instant to the scheduled start; null = no scheduled date (most generous tier). */
  hoursUntilStart: number | null;
  /** The pinned percent — `refundPercentFor(policyType, hoursUntilStart)` at the cancel instant. */
  refundPercent: number;
  allocationCents: number;
  /** `cancelledComponentRefundCents(allocationCents, refundPercent)` — the allocation share coming back. */
  refundCents: number;
  /** allocation − refund: what the seller retains, minted as delivered value at the flip. */
  retainedCents: number;
}

export type BundleComponentCancellationResult =
  | {
      recorded: true;
      /** The row was ALREADY cancelled (a double click / retry): the terms are the PINNED ones, nothing moved. */
      alreadyRecorded: boolean;
      bookingId: string;
      componentServiceId: string;
      terms: BundleComponentCancellationTerms;
      /** The parent moved to `partially_completed` on THIS call (this cancel was the last answer outstanding). */
      partiallyCompleted: boolean;
      /** D-51's money leg, present only when a settlement was attempted on this call (§13). */
      settlement: BundlePartialSettlementResult | null;
      parentOutcome?: string;
      reason?: IneligibleReason | "lost_race";
      evidence: Record<string, unknown>;
    }
  | {
      recorded: false;
      bookingId: string;
      componentServiceId: string;
      reason:
        | "booking_not_found"
        /** The session user is not the booking's traveler — the route answers an undifferentiated 404. */
        | "not_traveler"
        /** Not a `bundle_components` booking; `detail` carries the resolver's own reason. */
        | "rule_not_bundle"
        /** A legacy bundle (no rows): the jsonb cannot be claimed atomically and holds no allocation (§13). */
        | "bundle_component_states_unavailable"
        | "unknown_component"
        /** The component is no longer `pending` (delivered, failed, refunded — or the parent left `confirmed`). `currentStatus` says which. */
        | "component_not_pending"
        /** No allocation on this component (or the bundle's allocations do not sum): no refund can be computed, so the cancel is refused rather than filed at a guessed share. */
        | "allocation_missing"
        /** The row carries no purchase-time policy snapshot: the tier the traveler bought under is unknown (§13). */
        | "policy_snapshot_missing";
      currentStatus?: string | null;
      detail?: string;
      evidence?: Record<string, unknown>;
    };

/**
 * Locked Decision 50, third paragraph, second sentence — "when the traveler voluntarily cancels an
 * outstanding component, the component's allocated amount follows the SNAPSHOTTED cancellation policy
 * and deadline" (ledger `2026-09-16-bundle-component-traveler-cancel`; migration 309). THE ONE
 * TRAVELER-SIDE COMPONENT WRITER, the third recorder beside the seller's two above.
 *
 *  1. The PRINCIPAL is the booking's traveler and nobody else (§14: `travelerUserId` is the session's,
 *     matched against the row; the route turns a mismatch into an undifferentiated 404).
 *  2. Same server-side rule resolution as the seller rails: only a `bundle_components` booking with
 *     component ROWS may take it; a legacy jsonb bundle is refused by name.
 *  3. The refund needs an ALLOCATION to apply a percent to: a component without one (a pre-307 row,
 *     an unpriced snapshot) is refused `allocation_missing` — the traveler is never shown, and the
 *     settlement never owed, a share nobody can compute.
 *  4. THE TERMS ARE THE SNAPSHOT'S (`resolveSnapshottedCancellationTerms`): the tier is the bundle
 *     listing's policy AT PURCHASE off `offering_contract_snapshot`, the deadline is the booking's own
 *     scheduled start through the whole-row quote's SAME parse, and the percent is the ONE resolver's
 *     (`refundPercentFor`). A row with no snapshot is refused `policy_snapshot_missing` — never the
 *     live listing, never a default (§13). A live policy edit after purchase is not an input.
 *  5. ONE ATOMIC FLIP (`claimComponentCancelled`): `pending → cancelled` with the parent `confirmed`
 *     in the same WHERE, stamping `cancelled_at` AND PINNING `cancel_refund_percent` in that statement,
 *     so a double call is one flip and the second caller is handed the PINNED terms, never re-resolved
 *     ones (a clock that moved between the two calls must not change the answer).
 *  6. Then the ONE derivation decides the parent exactly as the seller rails do: every component
 *     conclusive with ≥1 delivered ⇒ `settleBundlePartially` (the D-34 flip, the D-35 mint reading the
 *     pin, then the money leg); some still pending ⇒ recorded, waiting; none delivered ⇒
 *     `all_undelivered`, nothing flips — the whole-row cancel rail owns that case.
 *
 * NO AMOUNT, RATE, PERCENT OR STATUS ARRIVES FROM THE CALLER (§14/§19): the status written is this
 * function's, the percent is the snapshot's, the cents are the row's allocation × that percent.
 */
export async function recordBundleComponentCancellation(input: {
  bookingId: string;
  componentServiceId: string;
  /** The SESSION user (§14). Matched against `service_bookings.traveler_id`; never taken from a body. */
  travelerUserId: string;
  reason?: string | null;
  now?: Date;
}): Promise<BundleComponentCancellationResult> {
  const now = input.now ?? new Date();
  const { bookingId, componentServiceId } = input;
  const booking = await loadBooking(bookingId);
  if (!booking) return { recorded: false, bookingId, componentServiceId, reason: "booking_not_found" };
  if (!booking.travelerId || booking.travelerId !== input.travelerUserId) {
    return { recorded: false, bookingId, componentServiceId, reason: "not_traveler" };
  }

  const pre = await resolveCompletionEligibility(bookingId, now);
  if (pre.rule !== "bundle_components") {
    return { recorded: false, bookingId, componentServiceId, reason: "rule_not_bundle", detail: pre.reason ?? pre.rule ?? undefined, evidence: pre.evidence };
  }
  const source = (pre.evidence as any).componentStateSource as ComponentStateSource | undefined;
  if (source !== "rows") {
    return { recorded: false, bookingId, componentServiceId, reason: "bundle_component_states_unavailable", evidence: pre.evidence };
  }
  const states = await readBundleComponentStates({
    bookingId,
    bookingDetails: booking.bookingDetails,
    bundleServiceId: booking.serviceId ?? null,
  });
  const component = states.components.find((c) => c.componentServiceId === componentServiceId);
  if (!component) return { recorded: false, bookingId, componentServiceId, reason: "unknown_component", evidence: pre.evidence };

  // The refund is `allocation × percent`; with no allocation there is nothing to apply a percent to.
  // The WHOLE bundle's allocations must be the contract fact (they sum to the price), or the settlement
  // this cancel may trigger would refuse `allocation_missing` after the traveler was told a number.
  const totalCents = Math.round((Number(booking.totalAmount ?? 0) || 0) * 100);
  if (
    !Number.isInteger(component.allocationCents) ||
    (component.allocationCents as number) < 0 ||
    !allocationsAreComplete(states.components, totalCents)
  ) {
    return { recorded: false, bookingId, componentServiceId, reason: "allocation_missing", evidence: pre.evidence };
  }
  const allocationCents = component.allocationCents as number;

  const scheduledDate = (booking.bookingDetails ?? {}).scheduledDate;
  const termsFor = (at: Date, pinnedPercent?: number): BundleComponentCancellationTerms | null => {
    const resolved = resolveSnapshottedCancellationTerms({
      offeringContractSnapshot: booking.offeringContractSnapshot,
      scheduledDate: typeof scheduledDate === "string" ? scheduledDate : null,
      now: at,
    });
    if (!resolved.ok) return null;
    // A PINNED percent (the already-cancelled path) wins over a re-resolution: the row's answer is the
    // answer the traveler was given, and the clock has moved since.
    const refundPercent = pinnedPercent ?? resolved.refundPercent;
    const refundCents = cancelledComponentRefundCents(allocationCents, refundPercent);
    return {
      policyType: resolved.policyType,
      policyDefaulted: resolved.policyDefaulted,
      hoursUntilStart: resolved.hoursUntilStart,
      refundPercent,
      allocationCents,
      refundCents,
      retainedCents: allocationCents - refundCents,
    };
  };

  // A row already `cancelled` (a retry, a double click): hand back the PINNED terms, move nothing.
  if (component.status === BUNDLE_COMPONENT_STATUS.cancelled) {
    return alreadyCancelled();
  }
  if (component.status !== BUNDLE_COMPONENT_STATUS.pending) {
    return { recorded: false, bookingId, componentServiceId, reason: "component_not_pending", currentStatus: component.status, evidence: pre.evidence };
  }

  const terms = termsFor(now);
  if (!terms) return { recorded: false, bookingId, componentServiceId, reason: "policy_snapshot_missing", evidence: pre.evidence };

  const claim = await claimComponentCancelled({
    bookingId,
    componentServiceId,
    parentFromStatuses: COMPLETION_ALLOWED_FROM_STATUSES,
    refundPercent: terms.refundPercent,
    reason: typeof input.reason === "string" && input.reason.trim().length > 0 ? input.reason.trim() : null,
    now,
  });
  if (!claim.claimed) {
    // Lost to a concurrent caller — or the parent left `confirmed` between the read and the write.
    if (claim.currentStatus === BUNDLE_COMPONENT_STATUS.cancelled) return alreadyCancelled();
    return { recorded: false, bookingId, componentServiceId, reason: "component_not_pending", currentStatus: claim.currentStatus, evidence: pre.evidence };
  }
  return afterWrite(false, terms);

  async function alreadyCancelled(): Promise<BundleComponentCancellationResult> {
    const rows = await readBundleComponentRows(db, bookingId);
    const row = rows.find((r) => r.componentServiceId === componentServiceId);
    const pinned = row?.cancelRefundPercent;
    const at = row?.cancelledAt ?? now;
    const t = isValidCancelRefundPercent(pinned) ? termsFor(at, pinned) : null;
    if (!t) {
      // Cancelled by something other than this rail (no pin) — the settlement will refuse it by name;
      // this rail has nothing true to state and does not invent terms (§13).
      return { recorded: false, bookingId, componentServiceId, reason: "component_not_pending", currentStatus: BUNDLE_COMPONENT_STATUS.cancelled, detail: "cancel_terms_missing", evidence: pre.evidence };
    }
    return afterWrite(true, t);
  }

  async function afterWrite(alreadyRecorded: boolean, t: BundleComponentCancellationTerms): Promise<BundleComponentCancellationResult> {
    // LD 50 remainder (§13): a cancelled component releases NO capacity either, and the statement says
    // what the BOOKING holds instead — the same fact the failure rail states, from the same helper.
    const componentCapacity = describeComponentCapacity({
      bookingDetails: (booking?.bookingDetails ?? null) as Record<string, unknown> | null,
      bookingSlotId: booking?.slotId ?? null,
    });
    // Re-derive AFTER the write — the resolver is the one authority on what the components now say.
    const post = await resolveCompletionEligibility(bookingId, now);
    const outcome = (post.evidence as any).outcome as string | undefined;
    if (post.reason === "bundle_partially_completed") {
      const settled = await settleBundlePartially({ bookingId, actor: "traveler_bundle_component_cancel", now });
      return {
        recorded: true,
        alreadyRecorded,
        bookingId,
        componentServiceId,
        terms: t,
        partiallyCompleted: settled.flipped,
        settlement: settled.settlement,
        parentOutcome: outcome,
        reason: settled.settled ? undefined : settled.reason,
        evidence: { ...settled.evidence, componentCapacity },
      };
    }
    return {
      recorded: true,
      alreadyRecorded,
      bookingId,
      componentServiceId,
      terms: t,
      partiallyCompleted: false,
      settlement: null,
      parentOutcome: outcome,
      reason: post.reason,
      evidence: { ...post.evidence, componentCapacity },
    };
  }
}

export interface SettleBundlePartialResult {
  settled: boolean;
  bookingId: string;
  reason?: IneligibleReason | "lost_race";
  evidence: Record<string, unknown>;
}

/**
 * D-34/D-35 — THE PARTIAL SETTLEMENT: `confirmed → partially_completed`, the ONE flip a bundle takes
 * when every component has an answer, at least one was delivered and at least one was not. It is the
 * money event for the delivered share: `storage.updateServiceBookingStatus` mints ONCE, inside the
 * flip's transaction, over the REDUCED figures the mint derives from the component rows
 * (`reducedBundleFigures` — the row's own three figures scaled by the delivered share of the
 * snapshotted prices; never a second mint, never a per-component mint, never a rate literal).
 *
 * 1. Re-derive server-side (the caller's opinion is never trusted): the outcome must be
 *    `partially_completed` and the reduced figures must be DERIVABLE — a component with no
 *    snapshotted price refuses the flip with `component_prices_unknown` and leaves the parent
 *    `confirmed` for a human (§13). The mint re-checks and throws inside the transaction, so the
 *    flip can never land without its reduced mint.
 * 2. Flip with `PARTIAL_COMPLETION_FROM_STATUSES` (§15/§18b — the transition is the guard; a
 *    concurrent settle is ONE flip, the loser sees `lost_race`).
 * 3. Provenance AFTER the flip: `bookingDetails.completion` with `partial: true`, the undelivered
 *    components NAMED (brief §4 — never a count), the reduced figures, and a
 *    `booking_partially_completed` diary row. `completed_at` is NOT stamped: the row is not completed.
 *
 * The component REFUND — the undelivered components' pro-rata share of what the traveler was charged
 * — is NOT issued here. The existing `refundServiceBooking` rail flips the WHOLE row to `refunded`,
 * which would be a lie about the delivered components (brief §1), so it cannot express this refund;
 * that rail is the brief's lane 4 and is recorded, not built, in this lane's report. The amount it
 * will owe is already on the row (`completion.reduced.deductedAmount`) and in the child rows' prices.
 */
export async function settleBundlePartialCompletion(input: {
  bookingId: string;
  actor: CompletionActor;
  now?: Date;
}): Promise<SettleBundlePartialResult> {
  const now = input.now ?? new Date();
  const eligibility = await resolveCompletionEligibility(input.bookingId, now);
  if (eligibility.reason !== "bundle_partially_completed") {
    return {
      settled: false,
      bookingId: input.bookingId,
      reason: eligibility.reason ?? "bundle_components_incomplete",
      evidence: eligibility.evidence,
    };
  }
  const booking = await loadBooking(input.bookingId);
  if (!booking) return { settled: false, bookingId: input.bookingId, reason: "booking_not_found", evidence: {} };
  const states = await readBundleComponentStates({
    bookingId: input.bookingId,
    bookingDetails: booking.bookingDetails as Record<string, unknown> | null,
    bundleServiceId: booking.serviceId ?? null,
  });
  if (states.source !== "rows") {
    return {
      settled: false,
      bookingId: input.bookingId,
      reason: "bundle_component_states_unavailable",
      evidence: eligibility.evidence,
    };
  }
  const reduced = reducedBundleFigures({
    totalAmount: booking.totalAmount,
    platformFee: booking.platformFee,
    providerEarnings: booking.providerEarnings,
    components: states.components,
  });
  if (!reduced.ok) {
    return {
      settled: false,
      bookingId: input.bookingId,
      reason: "component_prices_unknown",
      evidence: { ...eligibility.evidence, reducedFiguresRefused: reduced.reason },
    };
  }

  const updated = await storage.updateServiceBookingStatus(
    input.bookingId,
    PARTIALLY_COMPLETED_STATUS,
    `d34_partial:${input.actor}`,
    PARTIAL_COMPLETION_FROM_STATUSES,
  );
  if (!updated) {
    return { settled: false, bookingId: input.bookingId, reason: "lost_race", evidence: eligibility.evidence };
  }

  const evidence = {
    ...eligibility.evidence,
    reduced: {
      keptFraction: reduced.keptFraction,
      grossAmount: reduced.grossAmount,
      platformFee: reduced.platformFee,
      providerEarnings: reduced.providerEarnings,
      deductedAmount: reduced.deductedAmount,
      undeliveredSnapshotCents: reduced.undeliveredSnapshotCents,
      totalSnapshotCents: reduced.totalSnapshotCents,
    },
  };
  await db
    .update(serviceBookings)
    .set({
      bookingDetails: sql`COALESCE(${serviceBookings.bookingDetails}, '{}'::jsonb) || ${JSON.stringify({
        completion: {
          rule: "bundle_components",
          actor: input.actor,
          at: now.toISOString(),
          partial: true,
          outcome: PARTIALLY_COMPLETED_STATUS,
          failedComponentIds: reduced.undeliveredComponentIds,
          evidence,
        },
      })}::jsonb`,
      updatedAt: now,
    })
    .where(eq(serviceBookings.id, input.bookingId));

  if (updated.tripId) {
    try {
      await logItemTransition(db, {
        tripId: updated.tripId,
        itemId:
          typeof (updated.bookingDetails as any)?.itineraryItemId === "string"
            ? ((updated.bookingDetails as any).itineraryItemId as string)
            : null,
        eventType: "booking_partially_completed",
        fromStatus: "confirmed",
        toStatus: PARTIALLY_COMPLETED_STATUS,
        actorType: DIARY_ACTOR[input.actor],
      });
    } catch (err) {
      console.error("[booking-completion] diary row failed after a successful partial settlement:", err);
    }
  }

  return { settled: true, bookingId: input.bookingId, evidence };
}

export interface SettleBundlePartiallyResult extends SettleBundlePartialResult {
  /** The `confirmed → partially_completed` flip (and its reduced mint) landed on THIS call. */
  flipped: boolean;
  /**
   * D-51: the MONEY LEG's result — the settlement claim, the Stripe refund and the promote — or null
   * when the parent never reached `partially_completed` and there was nothing to settle.
   */
  settlement: BundlePartialSettlementResult | null;
}

/**
 * D-51 (ledger `2026-09-16-bundle-partial-settlement`) — THE ONE SETTLEMENT ENTRY. Two legs, in order:
 *
 *   1. the D-34 flip + D-35 reduced mint (`settleBundlePartialCompletion`, unchanged) — skipped when the
 *      row is ALREADY `partially_completed` (a retry, or the sweep re-driving a row whose money leg the
 *      process died on);
 *   2. the money leg (`issueBundlePartialSettlement`): CLAIM the `bundle_partial_settlements` row →
 *      ONE Stripe refund of the traveler's share through the shared issuer → PROMOTE.
 *
 * Called from the two component recorders exactly where the flip fired before — i.e. only once the ONE
 * derivation says every component is conclusive and at least one failed — and from nowhere else. The
 * nightly sweep (`sweepUnsettledBundlePartials`) drives leg 2 directly for rows the flip already moved.
 * Leg 2 never throws for a money reason: its result is NAMED on the response (§13), and a Stripe
 * failure leaves a reclaimable claim, never a rolled-back mint.
 */
export async function settleBundlePartially(input: {
  bookingId: string;
  actor: CompletionActor;
  now?: Date;
}): Promise<SettleBundlePartiallyResult> {
  const now = input.now ?? new Date();
  const booking = await loadBooking(input.bookingId);
  if (!booking) {
    return { settled: false, flipped: false, bookingId: input.bookingId, reason: "booking_not_found", evidence: {}, settlement: null };
  }
  let flip: SettleBundlePartialResult;
  let flipped = false;
  if (booking.status === PARTIALLY_COMPLETED_STATUS) {
    flip = { settled: true, bookingId: input.bookingId, evidence: { alreadyPartiallyCompleted: true } };
  } else {
    flip = await settleBundlePartialCompletion({ bookingId: input.bookingId, actor: input.actor, now });
    if (flip.settled) {
      flipped = true;
    } else if (flip.reason === "lost_race") {
      // A concurrent caller won the flip. If the row is now `partially_completed`, the money leg is
      // still owed and is idempotent — run it so both callers converge on the one settlement rather
      // than leaving it to the sweep. Any other refusal is returned as-is with nothing to settle.
      const after = await loadBooking(input.bookingId);
      if (after?.status !== PARTIALLY_COMPLETED_STATUS) return { ...flip, flipped: false, settlement: null };
      flip = { settled: true, bookingId: input.bookingId, evidence: { ...flip.evidence, lostFlipRace: true } };
    } else {
      return { ...flip, flipped: false, settlement: null };
    }
  }
  const settlement = await issueBundlePartialSettlement({ bookingId: input.bookingId, now, actor: input.actor });
  return { ...flip, flipped, settlement };
}

/**
 * The auto-complete DETECTOR: bookings a TIMER may fire on. Narrow SQL pre-filter (status +
 * timer-driven service shape), then the same `resolveCompletionEligibility` every other caller
 * uses decides — one predicate, not a second copy in SQL.
 *
 * The SQL floor is a scan-shrinker, never the decision: the resolver above is the only authority
 * on eligibility, so a row this query lets through is still judged by the same predicate every
 * other caller uses.
 */
export async function findAutoCompleteCandidates(now: Date = new Date(), limit = 2000): Promise<string[]> {
  // PER-RULE floors, not one shared cutoff. A pdf booking can never be eligible before
  // `confirmedAt + ARTIFACT_AUTO_COMPLETE_DAYS` (both arms measure from a clock that is itself
  // ≥ confirmedAt — a download requires a confirmed booking), so that floor is exact. A PROPERTY
  // booking has NO such floor: a two-night stay booked on Monday can legitimately complete on
  // Thursday, so applying the artifact window to it would silently strand every short stay. That
  // asymmetry is why this is not one `min`/`max` over both windows.
  const artifactFloor = new Date(now.getTime() - ARTIFACT_AUTO_COMPLETE_DAYS * DAY_MS);
  const nowIso = now.toISOString();
  const rows = await db
    .select({ id: serviceBookings.id })
    .from(serviceBookings)
    .innerJoin(providerServices, eq(serviceBookings.serviceId, providerServices.id))
    .where(
      and(
        inArray(serviceBookings.status, COMPLETION_ALLOWED_FROM_STATUSES),
        // UNPAID-RECHECK exclusion (Aug 12 2026 scheduler unification): a candidate the job found
        // unpaid stamps `autoCompleteUnpaidRecheckAt` on its booking_metadata so the next passes
        // skip it until the window elapses — this is what stops a stale-unpaid backlog from
        // head-of-line-blocking paid bookings behind a per-pass Stripe-lookup budget.
        sql`(
          ${serviceBookings.bookingMetadata}->>'autoCompleteUnpaidRecheckAt' IS NULL
          OR (${serviceBookings.bookingMetadata}->>'autoCompleteUnpaidRecheckAt')::timestamptz <= ${nowIso}::timestamptz
        )`,
        sql`(
          ${providerServices.productShape} IN ('property', 'property_room')
          OR (
            ${providerServices.deliveryMethod} = 'pdf'
            AND ${providerServices.productShape} IS DISTINCT FROM 'bundle'
            AND ${serviceBookings.confirmedAt} IS NOT NULL
            AND ${serviceBookings.confirmedAt} <= ${artifactFloor}
          )
          OR (
            -- Ruling 69 disposition 1: in_person/hybrid. NO time floor, for the same reason the
            -- property row has none — the service date lives in a slot row or in the
            -- bookingDetails snapshot, not in a column this query can compare, and a same-day
            -- in-person booking must not be stranded by a floor derived from purchase time.
            ${providerServices.deliveryMethod} IN ('in_person', 'hybrid')
            AND ${providerServices.productShape} IS DISTINCT FROM 'bundle'
            AND ${providerServices.productShape} IS DISTINCT FROM 'property'
            AND ${providerServices.productShape} IS DISTINCT FROM 'property_room'
          )
        )`,
      ),
    )
    .orderBy(asc(serviceBookings.confirmedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/** Which timer actor a rule belongs to. Keeps the job free of any method knowledge of its own. */
export function timerActorFor(rule: CompletionRule): CompletionActor | null {
  // D-27: `artifact_timer` is no longer in `TIMER_DRIVEN_COMPLETION_RULES`, so it falls out HERE —
  // through the set, not through a second special case. That is the whole retirement: the job asks
  // this function for an actor, gets `null`, and accounts for the booking as
  // `rule_not_timer_driven` instead of completing it.
  if (!TIMER_DRIVEN_COMPLETION_RULES.has(rule)) return null;
  if (rule === "service_date_timer") return "auto_complete_service_date";
  return "auto_complete_property";
}

/** Which owner actor a rule belongs to, or null when the owner may not declare this rule. */
export function ownerActorFor(rule: CompletionRule): CompletionActor | null {
  if (!OWNER_DECLARED_COMPLETION_RULES.has(rule)) return null;
  if (rule === "session_end") return "provider_session_end";
  if (rule === "bundle_components") return "provider_bundle_components";
  return "provider_declared";
}
