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
 * (`auto_complete_pdf` / `auto_complete_property`). It contains NO method list of its own: which
 * rule a booking falls under comes from `completionRuleFor` in `shared/service-fundamentals.ts`.
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
  findAutoCompleteCandidates,
  resolveCompletionEligibility,
  timerActorFor,
} from "../services/booking-completion.service";
import { bookingAutoCompleteScheduler, type PiVerifier } from "../services/booking-auto-complete.service";

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
  error?: string;
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
  };
  const bump = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
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

      // PAYMENT GATE (money-safety): an eligible booking is only completed once money is verifiably
      // in. A `confirmed` booking can be UNPAID (owner-accept rail, §18b), and completing it would
      // mint phantom held earnings. No PI on record ⇒ never auto-complete; a present-but-not-
      // succeeded PI ⇒ skip AND stamp so a stale-unpaid backlog cannot head-of-line-block paid rows.
      let booking;
      try {
        booking = await storage.getServiceBooking(bookingId);
      } catch (err) {
        logger.error({ err, bookingId }, "[auto-complete] booking reload failed — left untouched");
        bump("eligibility_error");
        continue;
      }
      if (!booking) {
        bump("booking_not_found");
        continue;
      }
      if (!booking.stripePaymentIntentId) {
        bump("no_payment_on_record");
        continue;
      }
      let paid = false;
      try {
        paid = await verifyPi(booking.stripePaymentIntentId);
      } catch (err) {
        // A Stripe lookup failure is transient — defer (do NOT stamp, so the next pass retries),
        // and never complete on an unverified payment.
        logger.error({ err, bookingId }, "[auto-complete] PI verification failed — deferring");
        bump("pi_lookup_error");
        continue;
      }
      if (!paid) {
        bump("unpaid");
        // Stamp so later passes skip this row until the recheck window elapses (head-of-line-block
        // fix). findAutoCompleteCandidates excludes rows with an unexpired stamp.
        const recheckAt = new Date(now.getTime() + UNPAID_RECHECK_HOURS * 60 * 60 * 1000).toISOString();
        try {
          await db.execute(sql`
            UPDATE service_bookings
            SET booking_metadata = COALESCE(booking_metadata, '{}'::jsonb)
                  || jsonb_build_object('autoCompleteUnpaidRecheckAt', ${recheckAt}::text)
            WHERE id = ${bookingId} AND status = 'confirmed'
          `);
        } catch (err) {
          logger.error({ err, bookingId }, "[auto-complete] unpaid recheck stamp failed");
        }
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
      ...(result.error ? { error: result.error } : {}),
    },
    "[auto-complete] D8 booking auto-completion pass",
  );
  return result;
}
