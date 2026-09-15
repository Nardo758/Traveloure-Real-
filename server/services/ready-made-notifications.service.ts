/**
 * ready-made-notifications.service.ts — the ready-made store rail's two traveler/expert-facing
 * notifications, in ONE place.
 *
 * (punchlist R-5, ledger `2026-09-14-readymade-notifications`; CLAUDE.md §13, §15b, §18 rule 1,
 *  Locked Decision 26 — the Resend outbox pattern)
 *
 * WHAT WAS MISSING. The only notification anywhere on the ready-made rail was an
 * `admin_notifications` row on a buyer CONCERN. A buyer whose purchase was captured, cloned and
 * delivered was told nothing — no bell row, no email (ledger `2026-09-12-readymade-recovery-path`
 * recorded exactly that and refused to add one without a ruling) — and an expert whose buyer
 * spent their included revision learned about it only if they happened to open the workspace: the
 * request stored a message on the advisor row and stopped there.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * §15b — AN ANCILLARY EFFECT FOLLOWS THE OPERATION THAT AUTHORIZES IT, AND MAY NEVER BREAK IT.
 *
 * Neither function below is ever reached before its authorizing write has committed, and neither
 * can fail its caller: every path is caught here and logged. A purchase is delivered whether or
 * not the buyer's email is enqueued; a revision entitlement is spent whether or not the expert's
 * bell rings.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * EXACTLY-ONCE, WITH NO SCHEMA CHANGE, AND THE LIMIT IS STATED.
 *
 * Each send is reached only by the winner of an ATOMIC CONDITIONAL its caller already performs —
 * the `paid → cloned` claim for the delivery, the `revision_status IS NULL → 'requested'` claim
 * for the revision — so the callers are structurally once-only (§15). On top of that, the in-app
 * row is written by `storage.createNotificationOnce`, whose `ON CONFLICT DO NOTHING` against
 * migration 209's partial UNIQUE index on `notifications.dedupe_key` is the guard, and **the
 * EMAIL is gated on that insert having actually happened**. That is what makes the non-idempotent
 * half exactly-once too, using an index that already exists: if the notification row was already
 * there, somebody already notified, and no second email is enqueued.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * THE LIVENESS LIMIT IS NOW CLOSED (ruling 2026-09-15, punchlist **D-18** = option A; ledger
 * `2026-09-15-d18-announced-marker`; migration 297).
 *
 * This header used to read: "a process that dies between the authorizing claim and this call
 * leaves a delivered purchase that was never announced, and NOTHING retries it — there is no
 * `notified` column on `ready_made_purchases`, and adding one is a migration nobody has ratified.
 * … The `occasion_drafts.notified_at` ledger (LD 26) is the shape that would close it if a ruling
 * ever calls for it." There is one now, on exactly that shape.
 *
 * `notifyBuyerOfReadyMadeDelivery` IS ITS ONE WRITER (§18 rule 1). It stamps
 * `ready_made_purchases.notified_at` through `storage.markReadyMadePurchaseNotified` — an ATOMIC
 * CONDITIONAL (`WHERE id = ? AND notified_at IS NULL`; §15, the statement is the guard, never a
 * check-then-update) — the moment it knows the buyer's notification row EXISTS.
 *
 * "EXISTS" AND "WE INSERTED IT" ARE DELIBERATELY DIFFERENT TESTS HERE, and the difference is the
 * whole reason the column earns its keep. A pass that finds the bell row ALREADY THERE is looking
 * at the precise half-finished state the marker records: the row was written and the stamp was
 * never reached. So it stamps and does NOT re-send — the email stays gated on the insert, exactly
 * as before. Only a THROW from the insert, where the row may genuinely not exist, leaves the
 * marker alone; stamping there would claim an announcement on the strength of a failure.
 *
 * WHO CALLS IT, AND WHO MAY NOT WRITE THE COLUMN. Two callers: the `paid → cloned` claim winner
 * inside `fulfillReadyMadePurchase`, and §17's drift job, which DETECTS a delivered purchase whose
 * marker is still NULL past `READY_MADE_ANNOUNCE_GRACE_MS` and hands the row BACK HERE. That is
 * §17's ONE narrow exception — an existing shared writer's own logic arriving late, the same
 * standing `promotePaidCheckout` has on the cart rail — and it is exactly why the JOB never writes
 * the column itself: a detector that stamped "announced" without sending anything would silence
 * the very finding it exists to raise.
 */
import { storage } from "../storage";
import { logger } from "../infrastructure/logger";
import { enqueueEmail } from "./email-outbox.service";
import {
  buildReadyMadeDeliveredEmailPayload,
  buildReadyMadeRevisionRequestedEmailPayload,
} from "./email.service";

const TAG = "[ready-made-notify]";

/** `notifications.dedupe_key` shapes — one per EVENT, never per attempt. */
export const readyMadeDeliveredDedupeKey = (purchaseId: string) =>
  `ready_made_purchase:${purchaseId}:delivered`;
export const readyMadeRevisionDedupeKey = (purchaseId: string) =>
  `ready_made_purchase:${purchaseId}:revision_requested`;

export interface ReadyMadeDeliveryNotice {
  purchaseId: string;
  buyerId: string;
  cloneTripId: string;
  listingTitle: string;
  market?: string | null;
  /** Straight off `ready_made_purchases` — the row records what Stripe captured (§14). */
  pricePaidCents: number;
  currency: string;
}

/**
 * What one call did. Four facts, because they are four DIFFERENT facts and collapsing any pair
 * would cost a reader the distinction it needs (§13).
 */
export interface ReadyMadeDeliveryNotifyResult {
  /** THIS call inserted the bell row. It is what gates the email — a second sender must not mail. */
  notified: boolean;
  /** This call enqueued the email. */
  emailed: boolean;
  /**
   * The buyer's notification row EXISTS as of this call — inserted here, or already present.
   * FALSE only when the insert threw, i.e. when we cannot say whether it exists. This, and not
   * `notified`, is what §17's drift job reads to decide whether a delivery is still unannounced:
   * "somebody already told them" and "nobody has told them" are opposite answers and `notified`
   * reports the same `false` for both.
   */
  announced: boolean;
  /** THIS call won the `notified_at IS NULL` stamp. A later pass truthfully reports `false`. */
  stamped: boolean;
}

/**
 * The buyer's purchase confirmation: ONE bell row + ONE email.
 *
 * DELIVERY AND PROMOTION ARE THE SAME EVENT ON THIS RAIL, so this is ONE notice and not two. The
 * clone trip and its items are committed BEFORE the `paid → cloned` claim; the claim is both the
 * moment the purchase is promoted and the moment the product exists in the buyer's account. There
 * is no later "delivered" transition to hang a second message on, and inventing one would tell the
 * buyer the same fact twice.
 *
 * Never throws. Returns what it did, for the caller's log, for §17's drift job and for tests.
 */
export async function notifyBuyerOfReadyMadeDelivery(
  notice: ReadyMadeDeliveryNotice,
): Promise<ReadyMadeDeliveryNotifyResult> {
  let notified = false;
  try {
    const { inserted } = await storage.createNotificationOnce({
      userId: notice.buyerId,
      type: "ready_made_purchase",
      title: "Your plan is in your account",
      // §13: what is TRUE today — a copied, editable plan on placeholder dates. Not a booked trip.
      message:
        `"${notice.listingTitle}" is now your own editable plan, on placeholder dates you can ` +
        `change. Nothing in it is booked yet.`,
      relatedId: notice.purchaseId,
      relatedType: "ready_made_purchase",
      // `workspacePath` does not start with "/trip/", so resolveNotificationLink uses it verbatim —
      // the slip is where a ready-made purchase lands (ledger 2026-08-22-readymade-slip-delivery).
      data: { tripId: notice.cloneTripId, workspacePath: `/plans/${notice.cloneTripId}` },
      dedupeKey: readyMadeDeliveredDedupeKey(notice.purchaseId),
    } as any);
    notified = inserted;
  } catch (err) {
    logger.error({ err, purchaseId: notice.purchaseId }, `${TAG} buyer delivery notification failed (non-fatal)`);
    // Fall through WITHOUT emailing: the notification row is this send's exactly-once marker, and
    // an email with no marker behind it is an email nothing can stop from being sent again.
    // AND WITHOUT STAMPING: the insert threw, so we cannot say the announcement exists, and
    // `notified_at` is a record of a fact — never of an attempt (§13, D-18).
    return { notified: false, emailed: false, announced: false, stamped: false };
  }

  // ── THE MARKER (migration 297, D-18) ────────────────────────────────────────────────────────
  // Reached whether or not THIS call inserted the row, because the insert did not throw and the
  // row is therefore there either way. `inserted === false` is exactly the state the column exists
  // to close: the bell row was written by a process that died before it could stamp. §15 — the
  // `notified_at IS NULL` predicate inside the statement is the guard, so a recovery pass racing a
  // live fulfilment moves no timestamp somebody already wrote, and reports `stamped: false`
  // truthfully rather than claiming the write.
  //
  // NEVER FAILS THE CALLER (§15b): a marker that could not be written leaves the announcement
  // itself intact and the row eligible for one more detector pass, which is the harmless failure.
  let stamped = false;
  try {
    ({ stamped } = await storage.markReadyMadePurchaseNotified(notice.purchaseId));
  } catch (err) {
    logger.error({ err, purchaseId: notice.purchaseId }, `${TAG} announce marker stamp failed (non-fatal)`);
  }

  // The EMAIL stays gated on the INSERT, unchanged: if the row was already there somebody already
  // notified, and no second email is enqueued. Only the marker treats the two cases alike.
  if (!notified) return { notified: false, emailed: false, announced: true, stamped };

  try {
    const buyer = await storage.getUser(notice.buyerId);
    if (!buyer?.email) {
      // §13: no address is not a failure to report as one — there is simply nowhere to send.
      logger.warn({ purchaseId: notice.purchaseId }, `${TAG} buyer has no email address — bell row only`);
      return { notified: true, emailed: false, announced: true, stamped };
    }
    const payload = buildReadyMadeDeliveredEmailPayload({
      firstName: buyer.firstName ?? null,
      listingTitle: notice.listingTitle,
      market: notice.market ?? null,
      tripId: notice.cloneTripId,
      pricePaidCents: notice.pricePaidCents,
      currency: notice.currency,
    });
    await enqueueEmail({
      emailType: "ready_made_purchase_delivered",
      to: buyer.email,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      metadata: { purchaseId: notice.purchaseId, tripId: notice.cloneTripId },
    });
    return { notified: true, emailed: true, announced: true, stamped };
  } catch (err) {
    logger.error({ err, purchaseId: notice.purchaseId }, `${TAG} buyer delivery email failed (non-fatal)`);
    return { notified: true, emailed: false, announced: true, stamped };
  }
}

export interface ReadyMadeRevisionNotice {
  purchaseId: string;
  expertUserId: string;
  cloneTripId: string;
  listingTitle: string;
  note?: string | null;
}

/**
 * The selling expert's revision notice: ONE bell row + ONE email, on the same shape the plan-review
 * rail already uses for an expert (`booking-actions.ts` — bell insert then a best-effort email).
 *
 * Never throws.
 */
export async function notifyExpertOfReadyMadeRevisionRequest(
  notice: ReadyMadeRevisionNotice,
): Promise<{ notified: boolean; emailed: boolean }> {
  const note = notice.note?.trim() ? notice.note.trim() : null;
  let notified = false;
  try {
    const { inserted } = await storage.createNotificationOnce({
      userId: notice.expertUserId,
      type: "ready_made_revision_requested",
      title: "Revision requested",
      // §13: a buyer who sent no note is quoted as nothing, never as "no note provided".
      message: note
        ? `A buyer of "${notice.listingTitle}" requested their included revision: ${note.slice(0, 200)}`
        : `A buyer of "${notice.listingTitle}" requested their included revision.`,
      relatedId: notice.purchaseId,
      relatedType: "ready_made_purchase",
      data: { tripId: notice.cloneTripId, workspacePath: `/expert/workspace/${notice.cloneTripId}` },
      dedupeKey: readyMadeRevisionDedupeKey(notice.purchaseId),
    } as any);
    notified = inserted;
  } catch (err) {
    logger.error({ err, purchaseId: notice.purchaseId }, `${TAG} expert revision notification failed (non-fatal)`);
    return { notified: false, emailed: false };
  }

  if (!notified) return { notified: false, emailed: false };

  try {
    const expert = await storage.getUser(notice.expertUserId);
    if (!expert?.email) {
      logger.warn({ purchaseId: notice.purchaseId }, `${TAG} expert has no email address — bell row only`);
      return { notified: true, emailed: false };
    }
    const payload = buildReadyMadeRevisionRequestedEmailPayload({
      firstName: expert.firstName ?? null,
      listingTitle: notice.listingTitle,
      tripId: notice.cloneTripId,
      note,
    });
    await enqueueEmail({
      emailType: "ready_made_revision_requested",
      to: expert.email,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      metadata: { purchaseId: notice.purchaseId, tripId: notice.cloneTripId },
    });
    return { notified: true, emailed: true };
  } catch (err) {
    logger.error({ err, purchaseId: notice.purchaseId }, `${TAG} expert revision email failed (non-fatal)`);
    return { notified: true, emailed: false };
  }
}
