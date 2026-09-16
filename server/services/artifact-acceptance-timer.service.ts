/**
 * THE ARTIFACT ACCEPTANCE-PROMPT ARM — D-27 (punchlist D-27, ruled A; ledger
 * `2026-09-15-d27-artifact-timer-acceptance-prompt`). Content of record:
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` §3 (state machine, rule 7), §5, §6, §7 lane 3.
 *
 * ══ WHAT THIS REPLACES ═══════════════════════════════════════════════════════════════════════
 * `artifact_timer` used to COMPLETE a pdf booking — flipping it to `completed` and minting the
 * seller's held earning — seven days after a download or an undownloaded delivery, with the
 * traveler never having answered. D-6 forbids exactly that: *"a silent timeout never completes in
 * the seller's favour"*. So the rule left `TIMER_DRIVEN_COMPLETION_RULES` (`shared/service-
 * fundamentals.ts`), the `auto_complete_pdf` actor is GONE, and the same clock now drives two
 * transitions that complete nothing and mint nothing:
 *
 *   (a) ASK       `confirmed → awaiting_acceptance`, once a delivery instant EXISTS.
 *   (b) ESCALATE  `awaiting_acceptance → disputed`, once the derived acceptance deadline passed
 *                 with no answer — into the EXISTING admin dispute queue
 *                 (`GET /api/admin/disputes`, `WHERE status = 'disputed'`), with the system reason
 *                 `acceptance_window_elapsed`. NEVER a second queue, and never a new
 *                 `admin_review` status.
 *
 * ══ §15 / §18b — BOTH TRANSITIONS ARE ATOMIC CONDITIONALS ════════════════════════════════════
 * Each is `storage.updateServiceBookingStatus(id, <target>, reason, <named from-state list>)` —
 * `UPDATE … WHERE id = ? AND status IN (…)`, so THE TRANSITION IS THE GUARD. A double run, two
 * overlapping passes, or a pass racing the traveler's own accept produce exactly ONE flip and ONE
 * diary row; the loser sees `undefined` and does nothing. There is no check-then-update anywhere
 * here, and no compensating rollback: a lost race changes nothing. The from-state lists live in
 * `server/utils/booking-from-states.ts` — this module declares none of its own (§18 rule 1).
 *
 * ══ ONE DISPUTE WRITER, ONE MORE CALLER ══════════════════════════════════════════════════════
 * (b) reuses the SAME writer the traveler's `POST /api/bookings/:id/dispute` uses (V-23's
 * from-state-guarded `updateServiceBookingStatus(… 'disputed' …)`), with a NARROWER named list.
 * A second UPDATE that set `status = 'disputed'` beside it is the derivation-drift class §18
 * rule 1 names.
 *
 * NO EARNING IS MARKED, AND THAT IS NOT AN OMISSION. The traveler's rail calls
 * `setBookingEarningsDispute` to pull a MINTED earning back to `held`. Nothing has minted here by
 * construction — `awaiting_acceptance` descends from `confirmed`, and the only thing that mints on
 * this rail is `completeBooking` — so there is nothing to mark, and calling it would be a money
 * action with no subject.
 *
 * ══ §13 — THE ABSENCES ARE ANSWERS ═══════════════════════════════════════════════════════════
 * A booking with NO delivery instant from either source is SKIPPED with `no_delivery_timestamp`
 * and is never put on a clock: neither `confirmed_at` alone nor "now" is a delivery, and a booking
 * that was never delivered must not start a window that ends in a dispute. Every skip carries a
 * machine-readable reason and is counted in the pass result, so "nothing was prompted today" stays
 * distinguishable from "everything is being skipped".
 *
 * ══ THE PAYMENT GATE, AND WHY IT MOVED HERE ══════════════════════════════════════════════════
 * The old timer verified the PaymentIntent before completing, because completion mints. The prompt
 * mints nothing — but it OPENS the acceptance rail, and acceptance mints, so an unpaid `confirmed`
 * booking (reachable through the owner-accept rail, §18b) prompted into `awaiting_acceptance` would
 * hand the traveler a button that mints a phantom held earning. The gate therefore stays on the ASK
 * (same verifier, same `autoCompleteUnpaidRecheckAt` stamp, same head-of-line-block fix), and the
 * ESCALATION carries none — it takes money-nowhere, and a booking nobody answered should reach a
 * human whether or not Stripe is reachable tonight.
 *
 * ══ NO BACKFILL (LD 44(e)) ═══════════════════════════════════════════════════════════════════
 * Bookings completed under the old timer are NOT rewritten. This arm reads only rows still
 * `confirmed` or `awaiting_acceptance`.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../infrastructure/logger";
import { providerServices, serviceBookings } from "@shared/schema";
import { completionRuleFor } from "@shared/service-fundamentals";
import { acceptanceDeadline } from "@shared/acceptance-window";
import { acceptanceWindowDays } from "../config/completion-windows.config";
import {
  ACCEPTANCE_ESCALATION_FROM_STATUSES,
  ACCEPTANCE_PROMPT_FROM_STATUSES,
} from "../utils/booking-from-states";
import { resolveArtifactDeliveryInstant } from "./booking-completion.service";
import { logItemTransition } from "./item-transition-log.service";
import { storage } from "../storage";

/**
 * The system reason an escalation records. It is written to
 * `booking_metadata.systemDisputeReason` — DELIBERATELY NOT `disputeReason`, which is where the
 * traveler's OWN WORDS live (`POST /api/bookings/:id/dispute`). §13: nobody typed this sentence, so
 * presenting it in the field a person's reason is read from would attribute a claim to a traveler
 * who never made one. The admin queue reads both and can render "window elapsed, no one answered"
 * distinctly from a traveler-raised dispute.
 */
export const ACCEPTANCE_WINDOW_ELAPSED_REASON = "acceptance_window_elapsed";

/** Why a candidate was NOT moved. Stable, machine-readable, counted in the pass result (§13). */
export type ArtifactAcceptanceSkipReason =
  | "booking_not_found"
  | "service_not_found"
  | "not_an_artifact"
  | "wrong_status"
  | "no_delivery_timestamp"
  | "window_open"
  | "no_payment_on_record"
  | "unpaid"
  | "pi_lookup_error"
  | "lost_race";

export type ArtifactAcceptanceOutcome =
  | { moved: true; bookingId: string; to: "awaiting_acceptance"; deliveredAt: string; source: string }
  | { moved: true; bookingId: string; to: "disputed"; deadline: string; reason: string }
  | { moved: false; bookingId: string; reason: ArtifactAcceptanceSkipReason };

/** Verifies a PaymentIntent has succeeded. Injected so a test never reaches Stripe. */
export type PaymentVerifier = (paymentIntentId: string) => Promise<boolean>;

/** How long a non-succeeded-PI candidate stays excluded after a stamp — the job's own constant. */
const UNPAID_RECHECK_HOURS = 24;

interface ArtifactBookingRow {
  id: string;
  status: string | null;
  tripId: string | null;
  serviceId: string | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  stripePaymentIntentId: string | null;
  bookingDetails: Record<string, any> | null;
  deliveryMethod: string | null;
  productShape: string | null;
  deliverableUploadedAt: Date | null;
}

/**
 * The candidates this arm may act on: artifact-shaped listings whose bookings are still
 * `confirmed` or `awaiting_acceptance`.
 *
 * DELIBERATELY ITS OWN QUERY, NOT A WIDENING OF `findAutoCompleteCandidates`. That function's
 * predicate is `COMPLETION_ALLOWED_FROM_STATUSES`, which is also the list `completeBooking` guards
 * on — adding `awaiting_acceptance` there would hand the nightly completion job the very bookings
 * D-6 forbids it to complete (the D-24 invariant, stated in that list's own comment).
 *
 * The SQL is a scan-shrinker, never the decision: every row it returns is judged again below by the
 * shared derivations (`completionRuleFor`, `resolveArtifactDeliveryInstant`, `acceptanceDeadline`).
 */
export async function findArtifactAcceptanceCandidates(
  now: Date = new Date(),
  limit = 2000,
): Promise<ArtifactBookingRow[]> {
  const nowIso = now.toISOString();
  const rows = await db
    .select({
      id: serviceBookings.id,
      status: serviceBookings.status,
      tripId: serviceBookings.tripId,
      serviceId: serviceBookings.serviceId,
      confirmedAt: serviceBookings.confirmedAt,
      deliveredAt: serviceBookings.deliveredAt,
      stripePaymentIntentId: serviceBookings.stripePaymentIntentId,
      bookingDetails: serviceBookings.bookingDetails,
      deliveryMethod: providerServices.deliveryMethod,
      productShape: providerServices.productShape,
      deliverableUploadedAt: providerServices.deliverableUploadedAt,
    })
    .from(serviceBookings)
    .innerJoin(providerServices, eq(serviceBookings.serviceId, providerServices.id))
    .where(
      and(
        inArray(serviceBookings.status, [
          ...ACCEPTANCE_PROMPT_FROM_STATUSES,
          ...ACCEPTANCE_ESCALATION_FROM_STATUSES,
        ]),
        // The same unpaid-recheck exclusion the completion pass applies, for the same reason: a
        // stale-unpaid backlog must not head-of-line-block payable rows behind a per-pass Stripe
        // lookup budget. An `awaiting_acceptance` row never carries the stamp (only the ASK arm
        // writes it, and only on `confirmed`), so this narrows the prompt arm and nothing else.
        sql`(
          ${serviceBookings.bookingMetadata}->>'autoCompleteUnpaidRecheckAt' IS NULL
          OR (${serviceBookings.bookingMetadata}->>'autoCompleteUnpaidRecheckAt')::timestamptz <= ${nowIso}::timestamptz
        )`,
        sql`${providerServices.deliveryMethod} = 'pdf'`,
        sql`${providerServices.productShape} IS DISTINCT FROM 'bundle'`,
        sql`${providerServices.productShape} IS DISTINCT FROM 'property'`,
        sql`${providerServices.productShape} IS DISTINCT FROM 'property_room'`,
      ),
    )
    .orderBy(asc(serviceBookings.confirmedAt))
    .limit(limit);
  return rows as ArtifactBookingRow[];
}

/** One durable provenance stamp on the booking row, merged into the existing jsonb (never assigned). */
async function stampProvenance(bookingId: string, key: string, value: unknown, now: Date): Promise<void> {
  await db
    .update(serviceBookings)
    .set({
      bookingDetails: sql`COALESCE(${serviceBookings.bookingDetails}, '{}'::jsonb) || ${JSON.stringify({
        [key]: value,
      })}::jsonb`,
      updatedAt: now,
    })
    .where(eq(serviceBookings.id, bookingId));
}

/**
 * ONE booking, ONE decision. Exported so a proof exercises the same function production runs
 * rather than a reconstruction of it.
 */
export async function advanceArtifactAcceptance(input: {
  booking: ArtifactBookingRow;
  now: Date;
  verifyPi: PaymentVerifier;
}): Promise<ArtifactAcceptanceOutcome> {
  const { booking, now, verifyPi } = input;
  const bookingId = booking.id;

  // The RULE is the shared derivation's answer, never this module's own method list.
  const rule = completionRuleFor({
    deliveryMethod: booking.deliveryMethod,
    productShape: booking.productShape,
  });
  if (rule !== "artifact_timer") return { moved: false, bookingId, reason: "not_an_artifact" };

  // ── (b) ESCALATE ────────────────────────────────────────────────────────────────────────────
  if (ACCEPTANCE_ESCALATION_FROM_STATUSES.includes(booking.status ?? "")) {
    const instant = await resolveArtifactDeliveryInstant(booking, booking);
    if (!instant) {
      // §13: a booking already in `awaiting_acceptance` whose delivery instant we cannot resolve is
      // NOT escalated on a guessed clock. It stays where it is and says why.
      return { moved: false, bookingId, reason: "no_delivery_timestamp" };
    }
    const deadline = acceptanceDeadline({ at: instant.at, source: instant.source }, acceptanceWindowDays());
    if (!deadline) return { moved: false, bookingId, reason: "no_delivery_timestamp" };
    if (now.getTime() < Date.parse(deadline)) return { moved: false, bookingId, reason: "window_open" };

    // The SYSTEM reason, recorded where a person's words are NOT read from (see the constant).
    await stampProvenance(
      bookingId,
      "acceptanceEscalation",
      {
        reason: ACCEPTANCE_WINDOW_ELAPSED_REASON,
        at: now.toISOString(),
        deliveredAt: instant.at.toISOString(),
        deliveryInstantSource: instant.source,
        acceptanceDeadline: deadline,
        windowDays: acceptanceWindowDays(),
      },
      now,
    );
    await db
      .update(serviceBookings)
      .set({
        bookingMetadata: sql`COALESCE(${serviceBookings.bookingMetadata}, '{}'::jsonb) || ${JSON.stringify({
          systemDisputeReason: ACCEPTANCE_WINDOW_ELAPSED_REASON,
        })}::jsonb`,
      })
      .where(eq(serviceBookings.id, bookingId));

    // §15/§18b: THE ONE dispute writer, with the narrower named list. The traveler's rail passes
    // `DISPUTABLE_FROM_STATUSES`; this one may consume `awaiting_acceptance` and nothing else.
    const moved = await storage.updateServiceBookingStatus(
      bookingId,
      "disputed",
      ACCEPTANCE_WINDOW_ELAPSED_REASON,
      ACCEPTANCE_ESCALATION_FROM_STATUSES,
    );
    if (!moved) return { moved: false, bookingId, reason: "lost_race" };

    await writeDiary(booking.tripId, booking.bookingDetails, "booking_acceptance_elapsed", "awaiting_acceptance", "disputed");
    return { moved: true, bookingId, to: "disputed", deadline, reason: ACCEPTANCE_WINDOW_ELAPSED_REASON };
  }

  // ── (a) ASK ─────────────────────────────────────────────────────────────────────────────────
  if (!ACCEPTANCE_PROMPT_FROM_STATUSES.includes(booking.status ?? "")) {
    return { moved: false, bookingId, reason: "wrong_status" };
  }
  const instant = await resolveArtifactDeliveryInstant(booking, booking);
  if (!instant) return { moved: false, bookingId, reason: "no_delivery_timestamp" };

  // The payment gate — see the header. The prompt opens the rail that mints, so it carries the
  // same verification the completion pass did, and the same stamp so an unpaid backlog cannot
  // head-of-line-block the rows behind it.
  if (!booking.stripePaymentIntentId) return { moved: false, bookingId, reason: "no_payment_on_record" };
  let paid = false;
  try {
    paid = await verifyPi(booking.stripePaymentIntentId);
  } catch (err) {
    logger.error({ err, bookingId }, "[artifact-acceptance] PI verification failed — deferring");
    return { moved: false, bookingId, reason: "pi_lookup_error" };
  }
  if (!paid) {
    const recheckAt = new Date(now.getTime() + UNPAID_RECHECK_HOURS * 60 * 60 * 1000).toISOString();
    try {
      await db.execute(sql`
        UPDATE service_bookings
        SET booking_metadata = COALESCE(booking_metadata, '{}'::jsonb)
              || jsonb_build_object('autoCompleteUnpaidRecheckAt', ${recheckAt}::text)
        WHERE id = ${bookingId} AND status = 'confirmed'
      `);
    } catch (err) {
      logger.error({ err, bookingId }, "[artifact-acceptance] unpaid recheck stamp failed");
    }
    return { moved: false, bookingId, reason: "unpaid" };
  }

  await stampProvenance(
    bookingId,
    "acceptancePrompt",
    {
      at: now.toISOString(),
      deliveredAt: instant.at.toISOString(),
      deliveryInstantSource: instant.source,
      ...(instant.arm ? { arm: instant.arm } : {}),
      acceptanceDeadline: acceptanceDeadline({ at: instant.at, source: instant.source }, acceptanceWindowDays()),
      windowDays: acceptanceWindowDays(),
    },
    now,
  );

  // §15/§18b: the ONE status writer, atomic conditional over the named list. NOTHING mints here —
  // `updateServiceBookingStatus` mints only on `completed`.
  //
  // D-26 HOLDS: `delivered_at` is NOT stamped from a `listing_clock` instant. The provider's own
  // deliver rail stamps it; a derivation must never be written back as the seller's act.
  const moved = await storage.updateServiceBookingStatus(
    bookingId,
    "awaiting_acceptance",
    "d27_acceptance_prompt",
    ACCEPTANCE_PROMPT_FROM_STATUSES,
  );
  if (!moved) return { moved: false, bookingId, reason: "lost_race" };

  await writeDiary(booking.tripId, booking.bookingDetails, "booking_acceptance_prompted", "confirmed", "awaiting_acceptance");
  return { moved: true, bookingId, to: "awaiting_acceptance", deliveredAt: instant.at.toISOString(), source: instant.source };
}

/**
 * The diary row. Trip-scoped by construction (`item_transition_log.trip_id` NOT NULL), so a booking
 * with no trip honestly gets the booking-row provenance only — the same constraint `completeBooking`
 * and `voidClaim` live with. A diary failure never un-does the flip that already happened.
 */
async function writeDiary(
  tripId: string | null,
  bookingDetails: Record<string, any> | null,
  eventType: "booking_acceptance_prompted" | "booking_acceptance_elapsed",
  fromStatus: string,
  toStatus: string,
): Promise<void> {
  if (!tripId) return;
  try {
    await logItemTransition(db, {
      tripId,
      itemId: typeof bookingDetails?.itineraryItemId === "string" ? bookingDetails.itineraryItemId : null,
      eventType,
      fromStatus,
      toStatus,
      actorType: "scheduler",
    });
  } catch (err) {
    logger.error({ err, tripId, eventType }, "[artifact-acceptance] diary row failed after a successful flip");
  }
}

export interface ArtifactAcceptanceRunResult {
  scanned: number;
  prompted: number;
  escalated: number;
  /** reason → count. Every candidate NOT moved is accounted for here (§13). */
  skipped: Record<string, number>;
  promptedBookingIds: string[];
  escalatedBookingIds: string[];
}

/** The pass. One booking's failure never aborts it — the next run retries, and every write is idempotent. */
export async function runArtifactAcceptancePass(
  now: Date,
  verifyPi: PaymentVerifier,
): Promise<ArtifactAcceptanceRunResult> {
  const result: ArtifactAcceptanceRunResult = {
    scanned: 0,
    prompted: 0,
    escalated: 0,
    skipped: {},
    promptedBookingIds: [],
    escalatedBookingIds: [],
  };
  const bump = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  const candidates = await findArtifactAcceptanceCandidates(now);
  result.scanned = candidates.length;
  for (const booking of candidates) {
    let outcome: ArtifactAcceptanceOutcome;
    try {
      outcome = await advanceArtifactAcceptance({ booking, now, verifyPi });
    } catch (err) {
      logger.error({ err, bookingId: booking.id }, "[artifact-acceptance] booking left untouched");
      bump("transition_error");
      continue;
    }
    if (!outcome.moved) {
      bump(outcome.reason);
      continue;
    }
    if (outcome.to === "awaiting_acceptance") {
      result.prompted += 1;
      result.promptedBookingIds.push(outcome.bookingId);
    } else {
      result.escalated += 1;
      result.escalatedBookingIds.push(outcome.bookingId);
    }
  }
  return result;
}
