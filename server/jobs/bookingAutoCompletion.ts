/**
 * BOOKING AUTO-COMPLETION JOB — D8 timers (docs/DECISIONS.md ruling 63, executed by ruling 66;
 * UNIFIED with the replit line's earnings-mint scheduler on Aug 12 2026 reconciliation, ledger 80).
 *
 * THE ONE PRODUCTION SCHEDULER. Two lines shipped a booking-auto-completion scheduler; this is the
 * merged single one and nothing else flips a booking to `completed` on a timer. It keeps my line's
 * per-METHOD "WHEN" (`findAutoCompleteCandidates` + `resolveCompletionEligibility` — pdf artifact
 * timer / property checkout-date / in_person service-date; NO flat grace) AND the replit line's
 * money-safety + robustness: (a) a PAYMENT GATE so an unpaid `confirmed` booking never mints
 * earnings, (b) UNPAID-RECHECK STAMPING so a stale-unpaid backlog can never head-of-line-block paid
 * bookings, and (c) a PASS 2 that heals `completed` bookings whose ledger rows are (partially)
 * missing after a crash. The other line's `bookingAutoCompleteScheduler` service is retained ONLY
 * for its reconciliation helper (reused here as Pass 2) and its own unit proofs — it is NOT
 * scheduled; there is exactly one flipper in production.
 *
 * The job DETECTS; it does not decide and it does not implement completion. Every flip is driven
 * through the SHARED `completeBooking` in `booking-completion.service.ts` — the same function the
 * owner rail calls — with an actor tag so the diary and the booking row record which signal fired
 * (`auto_complete_property` / `auto_complete_service_date`). It contains NO method list of its own:
 * which rule a booking falls under comes from `completionRuleFor` in `shared/service-fundamentals.ts`.
 *
 * D-27 (ledger `2026-09-15-d27-artifact-timer-acceptance-prompt`): THIS JOB NO LONGER COMPLETES AN
 * ARTIFACT. `artifact_timer` left `TIMER_DRIVEN_COMPLETION_RULES`, so `timerActorFor` returns null
 * for it and pass 1 accounts for every pdf booking as `rule_not_timer_driven`. The same clock now
 * drives PASS 3 instead (`artifact-acceptance-timer.service.ts`): ASK
 * (`confirmed → awaiting_acceptance`) and ESCALATE (`awaiting_acceptance → disputed`, the EXISTING
 * admin dispute queue). Neither completes and neither mints. The `auto_complete_pdf` actor is GONE
 * — one fewer caller of `completeBooking`, never a renamed one.
 *
 * D-7 (ledger `2026-09-15-d36-d39-completion-declared`): THE PLACE-ANCHORED TIMER OPENS THE
 * TRAVELER'S WINDOW; THE WINDOW'S CLOSE MINTS. `service_date_timer` still fires when it always did
 * (ruling 69's N days after the booked service day), but pass 1 now DECLARES it
 * (`confirmed → completion_declared`, `declareBookingCompletion`, mints nothing — so no payment
 * gate is needed there) instead of completing it. PASS 1b then closes every declared window whose
 * derived deadline has passed — seller-declared sessions and async work included —
 * `completion_declared → completed` through the SAME `completeBooking` (actor `window_elapsed`),
 * behind the SAME payment gate, with the held earning anchored to the declaration (D-37).
 * `checkout_date` (property) is unchanged and still completes directly in pass 1. PASS 1c is the
 * coordination rail's close (`runCoordinationWindowPass`) — it mints NOTHING, because no
 * coordinator earning exists (D-39).
 *
 * PAYMENT GATE (money-safety, §14/§15 — the replit line's earnings-mint invariant): a booking can
 * reach `confirmed` UNPAID via the owner-accept rail (§18b maps pending→confirmed; a stamped PI is
 * NOT proof of payment). Completing such a booking would mint phantom held earnings. So an ELIGIBLE
 * candidate is completed only after its own `stripe_payment_intent_id` verifies `succeeded` against
 * Stripe. No PI ⇒ skipped (`no_payment_on_record`); PI present but not succeeded ⇒ skipped
 * (`unpaid`) AND STAMPED (`bookingMetadata.autoCompleteUnpaidRecheckAt`, +24h) so the next pass
 * excludes it until the stamp expires — a stale-unpaid backlog costs at most one Stripe lookup per
 * stale row per day and can never starve paid bookings behind it.
 *
 * §15: re-running is a NO-OP. The completion flip is an atomic conditional
 * (`… WHERE id = ? AND status IN ('confirmed')`), so a second pass — or a pass racing the owner
 * rail, or two overlapping passes — produces exactly one flip, one earning set and one diary row.
 * The mint itself is DB-guarded idempotent (migration 203 partial unique indexes + ON CONFLICT DO
 * NOTHING), so even a lost payment-gate race mints at most once. There is no compensating rollback:
 * a lost race simply changes nothing.
 *
 * §13: a candidate that lacks the data to decide is SKIPPED WITH ITS REASON, never guessed. The
 * reasons are counted and logged every run, so "nothing completed today" is distinguishable from
 * "everything is being skipped for want of a delivery timestamp".
 *
 * OBSERVABILITY (build charter §2, stated deliberately): there is NO runs table. Each flip is
 * durably recorded twice by the shared function (booking row + diary row), and each RUN emits one
 * structured log line including a run on which nothing happened — so a scheduler that has been
 * dead since the last deploy is visible as an absence of lines, not confused with a quiet day.
 * A runs table was considered and rejected as heavier than the fact it would record; if run-level
 * durability is ever needed, `reconciliation_runs` (§17 rule 2) is the precedent to copy.
 */
import { sql } from "drizzle-orm";
import { logger } from "../infrastructure/logger";
import { db } from "../db";
import { storage } from "../storage";
import {
  completeBooking,
  declareBookingCompletion,
  findAutoCompleteCandidates,
  findDeclaredWindowCandidates,
  resolveCompletionEligibility,
  timerActorFor,
  timerOpensDeclaredWindow,
} from "../services/booking-completion.service";
import { bookingAutoCompleteScheduler, type PiVerifier } from "../services/booking-auto-complete.service";
import { runArtifactAcceptancePass } from "../services/artifact-acceptance-timer.service";
import { runCoordinationWindowPass } from "../services/coordination-completion.service";
import { COMPLETION_DECLARED_STATUS } from "@shared/declared-completion-window";

/** How long a non-succeeded-PI candidate stays excluded after a stamp (matches the replit line). */
const UNPAID_RECHECK_HOURS = 24;

/** Default PI verifier — a live Stripe lookup; injectable for tests. */
const stripeVerifier: PiVerifier = async (paymentIntentId) => {
  const { stripe } = await import("../services/stripe-payment.service");
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return pi.status === "succeeded";
};

export interface AutoCompletionRunResult {
  ranAt: string;
  scanned: number;
  completed: number;
  /** reason → count. Every candidate the pass did NOT complete is accounted for here. */
  skipped: Record<string, number>;
  completedBookingIds: string[];
  /** Pass 2: `completed` bookings whose missing ledger rows were healed this run. */
  reconciled: number;
  /**
   * PASS 3 (D-27) — the ARTIFACT ACCEPTANCE arm. `prompted` = `confirmed → awaiting_acceptance`;
   * `escalated` = `awaiting_acceptance → disputed`. Neither completes anything and neither mints,
   * which is why they are counted separately from `completed` rather than folded into it: a run
   * that asked fifty travelers and completed nothing is a healthy run, and a reader must be able to
   * see that (§13).
   */
  prompted: number;
  escalated: number;
  artifactSkipped: Record<string, number>;
  promptedBookingIds: string[];
  escalatedBookingIds: string[];
  /**
   * D-7 (ledger `2026-09-15-d36-d39-completion-declared`). `declared` = pass 1's
   * `confirmed → completion_declared` on the place-anchored timer (mints nothing); `windowClosed` =
   * pass 1b's `completion_declared → completed` (the flip that mints — ALSO counted in `completed`
   * above, because it is a completion; listed separately so a reader can tell "closed a window" from
   * "completed a property stay"). `declaredWindowSkipped` accounts for every declared row pass 1b
   * did not close, by reason. `coordinationCompleted` is pass 1c — it mints nothing (D-39).
   */
  declared: number;
  declaredBookingIds: string[];
  windowClosed: number;
  windowClosedBookingIds: string[];
  declaredWindowSkipped: Record<string, number>;
  coordinationCompleted: number;
  coordinationCompletedIds: string[];
  coordinationSkipped: Record<string, number>;
  error?: string;
}

/**
 * THE PAYMENT GATE, stated ONCE for the two passes that MINT (§18 rule 1). Returns TRUE when the
 * booking's own PaymentIntent verifies `succeeded`. Every refusal is counted through `bump`; an
 * `unpaid` refusal also stamps the recheck marker so a stale-unpaid backlog cannot head-of-line-block
 * paid rows. `expectedStatus` keeps the stamp inside the row's current state, so a stamp can never
 * land on a row another writer has since moved.
 */
async function passesPaymentGate(input: {
  bookingId: string;
  now: Date;
  verifyPi: PiVerifier;
  bump: (reason: string) => void;
  expectedStatus: string;
}): Promise<boolean> {
  const { bookingId, now, verifyPi, bump } = input;
  let booking;
  try {
    booking = await storage.getServiceBooking(bookingId);
  } catch (err) {
    logger.error({ err, bookingId }, "[auto-complete] booking reload failed — left untouched");
    bump("eligibility_error");
    return false;
  }
  if (!booking) {
    bump("booking_not_found");
    return false;
  }
  if (!booking.stripePaymentIntentId) {
    bump("no_payment_on_record");
    return false;
  }
  let paid = false;
  try {
    paid = await verifyPi(booking.stripePaymentIntentId);
  } catch (err) {
    // A Stripe lookup failure is transient — defer (do NOT stamp, so the next pass retries),
    // and never complete on an unverified payment.
    logger.error({ err, bookingId }, "[auto-complete] PI verification failed — deferring");
    bump("pi_lookup_error");
    return false;
  }
  if (!paid) {
    bump("unpaid");
    // Stamp so later passes skip this row until the recheck window elapses (head-of-line-block
    // fix). Both candidate queries exclude rows with an unexpired stamp.
    const recheckAt = new Date(now.getTime() + UNPAID_RECHECK_HOURS * 60 * 60 * 1000).toISOString();
    try {
      await db.execute(sql`
        UPDATE service_bookings
        SET booking_metadata = COALESCE(booking_metadata, '{}'::jsonb)
              || jsonb_build_object('autoCompleteUnpaidRecheckAt', ${recheckAt}::text)
        WHERE id = ${bookingId} AND status = ${input.expectedStatus}
      `);
    } catch (err) {
      logger.error({ err, bookingId }, "[auto-complete] unpaid recheck stamp failed");
    }
    return false;
  }
  return true;
}

export async function runBookingAutoCompletion(
  now: Date = new Date(),
  verifyPi: PiVerifier = stripeVerifier,
): Promise<AutoCompletionRunResult> {
  const result: AutoCompletionRunResult = {
    ranAt: now.toISOString(),
    scanned: 0,
    completed: 0,
    skipped: {},
    completedBookingIds: [],
    reconciled: 0,
    prompted: 0,
    escalated: 0,
    artifactSkipped: {},
    promptedBookingIds: [],
    escalatedBookingIds: [],
    declared: 0,
    declaredBookingIds: [],
    windowClosed: 0,
    windowClosedBookingIds: [],
    declaredWindowSkipped: {},
    coordinationCompleted: 0,
    coordinationCompletedIds: [],
    coordinationSkipped: {},
  };
  const bump = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };
  const bumpDeclared = (reason: string) => {
    result.declaredWindowSkipped[reason] = (result.declaredWindowSkipped[reason] ?? 0) + 1;
  };

  try {
    const candidates = await findAutoCompleteCandidates(now);
    result.scanned = candidates.length;

    for (const bookingId of candidates) {
      let eligibility;
      try {
        eligibility = await resolveCompletionEligibility(bookingId, now);
      } catch (err) {
        logger.error({ err, bookingId }, "[auto-complete] eligibility resolution failed — booking left untouched");
        bump("eligibility_error");
        continue;
      }
      if (!eligibility.rule) {
        bump(eligibility.reason ?? "unclassifiable_service");
        continue;
      }
      const actor = timerActorFor(eligibility.rule);
      if (!actor) {
        // A rule no timer may fire (in_person/hybrid stay traveler-driven; session_end, async and
        // bundles are owner-declared). The SQL pre-filter should not surface these, but the
        // authority is the shared predicate, never the query.
        bump("rule_not_timer_driven");
        continue;
      }
      if (!eligibility.eligible) {
        bump(eligibility.reason ?? "window_open");
        continue;
      }

      // D-7: THE PLACE-ANCHORED TIMER OPENS THE WINDOW, IT DOES NOT END IT. A declaration mints
      // nothing, so it needs no payment gate — the gate stays at the flip that mints (pass 1b),
      // exactly as brief §11 rule 6 requires.
      if (timerOpensDeclaredWindow(eligibility.rule)) {
        try {
          const declared = await declareBookingCompletion({
            bookingId,
            actor,
            now,
            reason: `d7_auto_declare:${eligibility.rule}`,
          });
          if (declared.declared) {
            result.declared += 1;
            result.declaredBookingIds.push(bookingId);
          } else {
            bump(declared.reason ?? "not_declared");
          }
        } catch (err) {
          logger.error({ err, bookingId }, "[auto-complete] declaration failed — booking left untouched");
          bump("declaration_error");
        }
        continue;
      }

      // PAYMENT GATE (money-safety): an eligible booking is only completed once money is verifiably
      // in. A `confirmed` booking can be UNPAID (owner-accept rail, §18b), and completing it would
      // mint phantom held earnings. No PI on record ⇒ never auto-complete; a present-but-not-
      // succeeded PI ⇒ skip AND stamp so a stale-unpaid backlog cannot head-of-line-block paid rows.
      if (!(await passesPaymentGate({ bookingId, now, verifyPi, bump, expectedStatus: "confirmed" }))) {
        continue;
      }

      try {
        const outcome = await completeBooking({
          bookingId,
          actor,
          now,
          reason: `d8_auto_complete:${eligibility.rule}`,
        });
        if (outcome.completed) {
          result.completed += 1;
          result.completedBookingIds.push(bookingId);
        } else {
          bump(outcome.reason ?? "not_completed");
        }
      } catch (err) {
        // One bad booking must never abort the pass — the next run retries it, and the atomic
        // conditional makes that retry safe.
        logger.error({ err, bookingId }, "[auto-complete] completion failed — booking left untouched");
        bump("completion_error");
      }
    }
  } catch (err: any) {
    result.error = err?.message || String(err);
    logger.error({ err }, "[auto-complete] pass failed");
  }

  // PASS 1b — THE DECLARED WINDOW'S CLOSE (D-7; ledger `2026-09-15-d36-d39-completion-declared`).
  // Every booking a seller (or the service-date timer) declared done, whose derived deadline
  // (`completion_declared_at + declaredCompletionWindowDays()`) has passed UNDISPUTED, is completed
  // here through the SAME `completeBooking` — actor `window_elapsed`, from-state
  // `completion_declared` — behind the SAME payment gate, and THIS is the flip that mints (D-37:
  // `availableAt` anchored to the declaration inside the writer). A `disputed` row is not a
  // candidate and cannot win the guarded UPDATE; a double pass is one flip. Its own candidate query
  // rather than a widened `findAutoCompleteCandidates`, whose predicate is also `completeBooking`'s
  // default guard (the D-24 invariant, one state over). A failure here never fails the pass above.
  try {
    const declaredCandidates = await findDeclaredWindowCandidates(now);
    for (const bookingId of declaredCandidates) {
      let eligibility;
      try {
        eligibility = await resolveCompletionEligibility(bookingId, now, { declaredWindow: true });
      } catch (err) {
        logger.error({ err, bookingId }, "[auto-complete] declared-window eligibility failed — left untouched");
        bumpDeclared("eligibility_error");
        continue;
      }
      if (!eligibility.eligible) {
        bumpDeclared(eligibility.reason ?? "window_open");
        continue;
      }
      if (
        !(await passesPaymentGate({
          bookingId,
          now,
          verifyPi,
          bump: bumpDeclared,
          expectedStatus: COMPLETION_DECLARED_STATUS,
        }))
      ) {
        continue;
      }
      try {
        const outcome = await completeBooking({
          bookingId,
          actor: "window_elapsed",
          now,
          reason: `d7_window_elapsed:${eligibility.rule}`,
        });
        if (outcome.completed) {
          result.completed += 1;
          result.completedBookingIds.push(bookingId);
          result.windowClosed += 1;
          result.windowClosedBookingIds.push(bookingId);
        } else {
          bumpDeclared(outcome.reason ?? "not_completed");
        }
      } catch (err) {
        logger.error({ err, bookingId }, "[auto-complete] window close failed — booking left untouched");
        bumpDeclared("completion_error");
      }
    }
  } catch (err) {
    logger.error({ err }, "[auto-complete] declared-window pass failed");
  }

  // PASS 1c — THE COORDINATION RAIL'S CLOSE (D-39). `completion_declared → completed` on
  // `coordination_states` once the traveler's window has passed undisputed. It MINTS NOTHING —
  // no coordinator earning exists — and touches no fee; what the window gates on that rail is the
  // admin refund, read at the refund route.
  try {
    const coordination = await runCoordinationWindowPass(now);
    result.coordinationCompleted = coordination.completed;
    result.coordinationCompletedIds = coordination.completedIds;
    result.coordinationSkipped = coordination.skipped;
  } catch (err) {
    logger.error({ err }, "[auto-complete] coordination window pass failed");
  }

  // PASS 3 — THE ARTIFACT ACCEPTANCE ARM (D-27; ledger
  // `2026-09-15-d27-artifact-timer-acceptance-prompt`). `artifact_timer` is no longer in
  // `TIMER_DRIVEN_COMPLETION_RULES`, so pass 1 above now accounts for every artifact booking it
  // scans as `rule_not_timer_driven` and completes none of them — the retirement falls out of the
  // shared predicate rather than out of a special case in this file. THIS pass is what the clock
  // drives instead: it ASKS (`confirmed → awaiting_acceptance`) and it ESCALATES
  // (`awaiting_acceptance → disputed`, into the EXISTING admin dispute queue). It completes
  // nothing, mints nothing, and touches no amount, rate or fee band.
  //
  // It has its OWN candidate query rather than widening `findAutoCompleteCandidates`, whose
  // predicate is also `completeBooking`'s guard — widening that would hand this job the very
  // bookings D-6 forbids it to complete (the D-24 invariant).
  //
  // A failure here never fails the pass above: the two arms are independent, and the next run
  // retries under the same atomic conditionals.
  try {
    const artifact = await runArtifactAcceptancePass(now, verifyPi);
    result.prompted = artifact.prompted;
    result.escalated = artifact.escalated;
    result.artifactSkipped = artifact.skipped;
    result.promptedBookingIds = artifact.promptedBookingIds;
    result.escalatedBookingIds = artifact.escalatedBookingIds;
  } catch (err) {
    logger.error({ err }, "[auto-complete] artifact acceptance pass failed");
  }

  // PASS 2 — reconciliation (replit line's earnings-mint healing): the flip and its mint commit as
  // one transaction (updateServiceBookingStatus), but a crash between confirm-completion's status
  // set and a prior partial mint, or a legacy pre-merge completion, can leave a `completed` booking
  // with ledger rows missing. Re-run the idempotent mint for those. Reuses the retained scheduler's
  // tested helper so there is ONE reconciliation implementation, not a copy.
  try {
    result.reconciled = await bookingAutoCompleteScheduler.reconcileMissingLedgerRows(now);
  } catch (err) {
    logger.error({ err }, "[auto-complete] ledger reconciliation pass failed");
  }

  // ONE line per pass, including a pass that did nothing (§17 rule 2's spirit: silence must be
  // distinguishable from the job not having run).
  logger.info(
    {
      scanned: result.scanned,
      completed: result.completed,
      skipped: result.skipped,
      reconciled: result.reconciled,
      prompted: result.prompted,
      escalated: result.escalated,
      artifactSkipped: result.artifactSkipped,
      declared: result.declared,
      windowClosed: result.windowClosed,
      declaredWindowSkipped: result.declaredWindowSkipped,
      coordinationCompleted: result.coordinationCompleted,
      coordinationSkipped: result.coordinationSkipped,
      ...(result.error ? { error: result.error } : {}),
    },
    "[auto-complete] D8 booking auto-completion pass",
  );
  return result;
}
