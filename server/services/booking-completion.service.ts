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
  bundleComponents,
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
  serviceDateCompletionDays,
} from "../config/completion-windows.config";
import { acceptanceModeFor, type DeliveryInstantSource } from "@shared/acceptance-window";
import { ACCEPTANCE_FROM_STATUSES } from "../utils/booking-from-states";
import { logItemTransition, type TransitionActorType } from "./item-transition-log.service";
import { storage } from "../storage";

/**
 * The ONLY from-states a D8 completion may claim. `confirmed` = paid (cart rail) or accepted
 * (request rail). Everything else is deliberately absent: `payment_pending` belongs to the claim
 * machine (§15b/§18b), and `cancelled`/`refunded`/`disputed`/`expired`/`completed` are terminal
 * or under another rail's authority.
 */
export const COMPLETION_ALLOWED_FROM_STATUSES: readonly string[] = ["confirmed"];

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
   * D-6 (ledger `2026-09-15-d24-d26-acceptance-columns`): THE TRAVELER ACCEPTED THE ARTIFACT.
   * A new CALLER of the ONE completion implementation, with its own actor tag — never a second
   * minting path (§18 rule 1, and the brief's own non-negotiable rule 3). It is the only actor
   * whose from-state is `awaiting_acceptance` rather than `confirmed`, and the only one that
   * stamps `accepted_at`.
   */
  | "traveler_accepted";

const DIARY_ACTOR: Record<CompletionActor, TransitionActorType> = {
  auto_complete_property: "auto_complete",
  auto_complete_service_date: "auto_complete",
  provider_session_end: "provider",
  provider_declared: "provider",
  provider_bundle_components: "provider",
  traveler_accepted: "traveler",
};

/** TRUE for the ONE actor whose completion is a traveler's acceptance rather than a rule firing. */
function isAcceptanceActor(actor: CompletionActor): boolean {
  return actor === "traveler_accepted";
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
  | "artifact_takes_acceptance";

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
  confirmedAt: Date | null;
  /** D-26's per-booking delivery instant. NULL = the per-booking source has no answer (§13). */
  deliveredAt: Date | null;
  slotId: string | null;
  bookingDetails: Record<string, any> | null;
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
      confirmedAt: serviceBookings.confirmedAt,
      deliveredAt: serviceBookings.deliveredAt,
      slotId: serviceBookings.slotId,
      bookingDetails: serviceBookings.bookingDetails,
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
  } = {},
): Promise<CompletionEligibility> {
  const forAcceptance = opts.acceptance === true;
  const allowedFrom = forAcceptance ? ACCEPTANCE_FROM_STATUSES : COMPLETION_ALLOWED_FROM_STATUSES;
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

    // ── bundle: "ALL components complete; partial routes to the EXISTING refund lane, never a
    // partial payout." The component list is the snapshot locked into bookingDetails at purchase
    // (payments.routes.ts §17); per-component completions are recorded on the same jsonb by
    // `recordBundleComponentCompletion` below — no new table, no new column. ──────────────────
    case "bundle_components": {
      const snapshot = Array.isArray(details.bundleComponents) ? details.bundleComponents : null;
      const componentIds = snapshot
        ? snapshot.map((c: any) => String(c?.id ?? "")).filter(Boolean)
        : await db
            .select({ id: bundleComponents.componentServiceId })
            .from(bundleComponents)
            .where(eq(bundleComponents.bundleServiceId, service.id))
            .orderBy(asc(bundleComponents.position))
            .then((rows) => rows.map((r) => r.id));
      if (componentIds.length === 0) {
        // §13: a bundle whose contents we cannot enumerate is never "all complete" by default.
        return no(bookingId, rule, "bundle_components_unknown");
      }
      const done = (details.componentCompletions ?? {}) as Record<string, unknown>;
      const missing = componentIds.filter((id: string) => !done[id]);
      const evidence = {
        componentIds,
        completedComponentIds: componentIds.filter((id: string) => !!done[id]),
        missingComponentIds: missing,
      };
      if (missing.length > 0) {
        // PARTIAL COMPLETION NEVER PAYS OUT. There is no partial release path here by design —
        // a bundle the provider only half-delivered goes to the EXISTING refund lane
        // (admin refund / owner-cancel-with-refund), which this module deliberately does not
        // duplicate.
        return no(bookingId, rule, "bundle_components_incomplete", evidence);
      }
      return { bookingId, rule, eligible: true, evidence };
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
  const eligibility = await resolveCompletionEligibility(input.bookingId, now, {
    acceptance: forAcceptance,
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
    forAcceptance ? ACCEPTANCE_FROM_STATUSES : COMPLETION_ALLOWED_FROM_STATUSES,
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
        // The state this flip actually consumed — `awaiting_acceptance` on the acceptance rail.
        // A diary row that always said "confirmed" would misreport the one transition that is not.
        fromStatus: forAcceptance ? "awaiting_acceptance" : "confirmed",
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

/**
 * Record ONE bundle component as delivered, then complete the booking if that was the last one.
 * State lives on the existing `bookingDetails` jsonb — no new table, no new column (build charter
 * §5: prefer existing state). The write is a jsonb merge keyed by component id, so a repeat
 * declaration is idempotent (same key, same-or-later timestamp, still one component).
 */
export async function recordBundleComponentCompletion(input: {
  bookingId: string;
  componentServiceId: string;
  actor: CompletionActor;
  now?: Date;
}): Promise<CompleteBookingResult & { recorded: boolean; unknownComponent?: boolean }> {
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

  // All components in? Then — and only then — the SAME shared completion event fires.
  const result = await completeBooking({ bookingId: input.bookingId, actor: input.actor, now });
  return { ...result, recorded: true };
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
