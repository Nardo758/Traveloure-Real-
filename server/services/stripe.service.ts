/**
 * Stripe Service — Transport Booking Checkout & Webhook Utilities
 *
 * OWNERSHIP: This service is the canonical owner of Stripe Checkout Sessions for
 * platform-managed transport bookings (booking type "platform" in transportBookingOptions).
 * It creates checkout sessions, retrieves session details, confirms transport bookings on
 * payment success, and verifies incoming Stripe webhook signatures. It also exports the
 * shared `getBaseUrl()` helper used across Stripe services for constructing redirect URLs.
 *
 * DOES NOT OWN: PaymentIntents (owned by stripe-payment.service.ts), Checkout Sessions for
 * expert services or cart bookings (owned by stripe-payment.service.ts), Connect accounts or
 * transfers to experts/providers (owned by stripe-connect.service.ts).
 *
 * Stripe API calls made here:
 *   - stripe.checkout.sessions.create    — transport booking checkout
 *   - stripe.checkout.sessions.retrieve  — payment confirmation + session status
 *   - stripe.webhooks.constructEvent     — webhook signature verification
 */

import Stripe from "stripe";
import { db } from "../db";
import { transportBookingOptions, serviceBookings } from "@shared/schema";
import { users } from "@shared/models/auth";
import { noItemBookingDetail } from "@shared/no-item-booking";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getStripeSecretKey } from "../utils/stripe-key";
import { checkStripeKeyPrefix } from "../utils/stripe-key-policy";
// Ruling 2026-09-02-traveler-fee-applies-everywhere (path 4 — platform transport is merchant-of-record,
// so the traveler service fee applies). ONE band-driven resolver (§8/§14), Trip-Pass suppression via
// coversAction, and the shared service_bookings fee-ledger writer at confirmation.
import { resolveTravelerServiceFee } from "./fee-resolution.service";
import { coversAction } from "./trip-entitlement.service";
import { recordTravelerServiceFeeLedger } from "./fee-ledger.service";
// §19a — `service_bookings.stripe_payment_intent_id` has ONE writer module. The transport rail's
// stamp lives there beside the cart's (`stampAuthorization`) rather than as a second UPDATE site
// here; see `stampTransportPaymentIntent`'s docblock for why the two carry different from-states.
import { stampTransportPaymentIntent } from "./checkout-claim.service";
import { paidChargeMergeSql } from "./payment-on-record";

const key = getStripeSecretKey();

if (!key) {
  throw new Error("STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_TEST) is not set");
}

// Primary enforcement lives in server/validate-env.ts (imported first in
// server/index.ts, before this or any other Stripe-constructing module).
// This is defense in depth on ENVIRONMENT === "PROD" — not NODE_ENV, which is
// unset on this deployment. The prefix list itself is checkStripeKeyPrefix, so
// sk_ and rk_ cannot drift from the boot policy.
const isProd = process.env.ENVIRONMENT === "PROD";
const prefixCheck = checkStripeKeyPrefix(key, isProd);
if (!prefixCheck.ok) {
  throw new Error(
    `${prefixCheck.reason} stripe.service.ts refuses to start (ENVIRONMENT=${process.env.ENVIRONMENT || "undefined"}).`,
  );
}

const stripe = new Stripe(key, {
  apiVersion: "2024-12-18.acacia" as any,
});

export function getBaseUrl(): string {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    return `https://${replitDomains.split(",")[0].trim()}`;
  }
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }
  return "http://localhost:5173";
}

export interface BookingCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
  bookingId: string;
}

/**
 * Creates a Stripe checkout session for a transport booking
 */
export async function createTransportBookingCheckout(
  optionId: string,
  tripId: string | null,
  userId: string,
  travelers: number = 1,
  specialRequests?: string
): Promise<BookingCheckoutSession> {
  // Fetch the booking option
  const option = await db.query.transportBookingOptions.findFirst({
    where: eq(transportBookingOptions.id, optionId),
  });

  if (!option) {
    throw new Error(`Booking option ${optionId} not found`);
  }

  if (option.bookingType !== "platform") {
    throw new Error("Not a platform booking option");
  }

  // Fetch user email for Stripe checkout
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const userEmail = user?.email || undefined;

  // Calculate line items for Stripe. Ledger `2026-10-03-transport-price-literals` (§14): the option's
  // OWN listed price, or no checkout at all — never an estimate and never $0 (second layer; the
  // route refuses first with 409 no_listed_price).
  if (!option.priceCentsLow || option.priceCentsLow <= 0) {
    throw new Error("Booking option has no listed price");
  }
  const priceCents = option.priceCentsLow;
  const totalAmount = priceCents * travelers;

  // ── Traveler service fee (ruling 2026-09-02, path 4) ──────────────────────────────────────────
  // On the transport subtotal, from the ONE band-driven resolver (§8/§14), $25 cap. Trip Pass
  // suppression via the same coversAction the other rails use (transport has no rails ref, so
  // trip_pass is the only coverage). Covered → charged 0, waiver recorded.
  const feeCovered = tripId
    ? await coversAction(tripId, "traveler_service_fee").catch(() => false)
    : false;
  const travelerFeeResolved = await resolveTravelerServiceFee(totalAmount / 100);
  const feeChargedCents = feeCovered ? 0 : Math.round(travelerFeeResolved.amount * 100);
  const travelerServiceFeeSnapshot = {
    charged: feeCovered ? 0 : travelerFeeResolved.amount,
    wouldHaveBeen: travelerFeeResolved.amount,
    rate: travelerFeeResolved.rate,
    bandId: travelerFeeResolved.bandId,
    bandKey: travelerFeeResolved.bandKey,
    capApplied: travelerFeeResolved.capApplied,
    waived: feeCovered,
    waiverBasis: feeCovered ? "trip_pass" : null,
  };

  // Create a service booking record first
  const bookingId = `booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // NOTE: serviceBookings.providerId is a users.id varchar FK; transportBookingOptions.providerId
  // is an unrelated integer column that platform options never populate (always null here), so it
  // is intentionally NOT mapped. tripId links the booking to its trip when available (nullable).
  await db.insert(serviceBookings).values({
    id: bookingId,
    travelerId: userId,
    tripId: tripId ?? undefined,
    status: "pending",
    totalAmount: String(totalAmount / 100),
    bookingDetails: {
      bookingType: "transport",
      // D-11 (ledger `2026-09-15-d11-no-item-booking-exception`): the NAMED-CLASS mark. This rail
      // sells a `transport_booking_options` row, which no `itinerary_items` column points at, so
      // the booking it births can never carry a plan item — and when the caller names a trip, the
      // row is a trip-level obligation the plan does not know about. Composed SERVER-SIDE through
      // the ONE composer (§18 rule 1); the key is in `SERVER_AUTHORED_BOOKING_DETAIL_KEYS`, so no
      // client body can plant it and exempt itself from the `trip_booking_without_item` detector.
      ...noItemBookingDetail("transport_commerce"),
      optionId,
      travelers,
      specialRequests,
      transportMode: option.modeType,
      source: option.source,
      currency: option.currency || "USD",
      // Locked snapshot (like the cart path) — read back at confirmation by the fee-ledger writer.
      travelerServiceFee: travelerServiceFeeSnapshot,
    },
  });

  // Create Stripe checkout session. The traveler fee (when not covered) is a SEPARATE, disclosed
  // line item — not folded into the transport unit price (which is the provider's amount).
  // LD 43 audit note — NOT a PaymentIntent site and deliberately UNCHANGED by that lane. This is
  // a hosted Stripe Checkout Session: wallets there are enabled by DASHBOARD configuration, not by
  // `automatic_payment_methods`, and dropping this pin would also admit delayed-notification
  // methods whose `checkout.session.completed` arrives unpaid — a webhook-behaviour change this
  // rail has not been audited for. Recorded, not silently left: widening it is an operator +
  // webhook decision, not a find-replace.
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: (option.currency || "USD").toLowerCase(),
          product_data: {
            name: option.title,
            description: option.description || undefined,
          },
          unit_amount: priceCents,
        },
        quantity: travelers,
      },
      ...(feeChargedCents > 0
        ? [
            {
              price_data: {
                currency: (option.currency || "USD").toLowerCase(),
                product_data: { name: "Traveloure service fee" },
                unit_amount: feeChargedCents,
              },
              quantity: 1,
            },
          ]
        : []),
    ],
    mode: "payment",
    success_url: `${getBaseUrl()}/itinerary/${tripId}?booking=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getBaseUrl()}/itinerary/${tripId}?booking=cancelled`,
    customer_email: userEmail,
    metadata: {
      type: "transport_booking", // For webhook routing
      bookingId,
      tripId,
      optionId,
      userId,
    },
  });

  if (!session.url) {
    throw new Error("Failed to create Stripe checkout session");
  }

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    bookingId,
  };
}

/**
 * THE STATES A TRANSPORT PROMOTION MAY LEAVE (V-8, ledger
 * `2026-09-12-transport-status-self-report-gate`).
 *
 * Written down ONCE, beside the one statement that reads each, because the whole point of §15's
 * atomic conditional is that the FROM-state list and the UPDATE are the same expression — a list
 * restated somewhere else is a second answer to "may this be promoted?" (§18 rule 1).
 *
 * `service_bookings`: the transport rail births its row `pending` (see
 * `createTransportBookingCheckout` above) and this promotion moves it to `confirmed`.
 * `payment_pending` is DELIBERATELY ABSENT — that state with a NULL PaymentIntent is the cart
 * checkout's unauthorized claim and belongs to `checkout-claim.service.ts`, which §18b keeps as its
 * SOLE author; admitting it here would make this a second writer of someone else's transition.
 *
 * `transport_booking_options`: `available` is the column default ("nothing reserved yet", true while
 * a checkout is in flight — ledger `2026-09-08-transport-confirm-timing`) and `booked` is the
 * traveller's own self-report. NULL is admitted separately in the statement, because in SQL a NULL
 * column matches neither an `IN` list nor a `<>`. `cancelled` and `confirmed` are both absent, for
 * different reasons: a CANCELLED option must never be resurrected by a late paid signal (the V-8
 * defect), and a `confirmed` one has already been promoted, so a replay is a no-op rather than a
 * second flip.
 */
const TRANSPORT_BOOKING_PROMOTABLE_FROM = ["pending"] as const;
export const TRANSPORT_OPTION_PROMOTABLE_FROM = ["available", "booked"] as const;

/**
 * PAY-1 §1 — the ONE writer that holds a paid transport booking for review. Atomic conditional on
 * `pending` (§15/§18b): a row that already moved (confirmed by an earlier delivery, cancelled) is
 * never pulled back. The reason is MERGED into `booking_details.needsReview`, never assigned, so a
 * repeat delivery keeps the first record. Returns whether this call moved the row.
 */
export async function holdTransportBookingForReview(
  bookingId: string,
  hold: { reason: string; sessionId: string; paymentIntentId: string | null; amountDollars: number | null },
): Promise<boolean> {
  const res: any = await db.execute(sql`
    UPDATE service_bookings
    SET status = 'needs_review',
        booking_details = COALESCE(booking_details, '{}'::jsonb) || jsonb_build_object(
          'needsReview', jsonb_build_object(
            'reason', ${hold.reason}::text,
            'source', 'transport_checkout_session'::text,
            'sessionId', ${hold.sessionId}::text,
            'paymentIntentId', ${hold.paymentIntentId}::text,
            'amount', ${hold.amountDollars === null ? null : String(hold.amountDollars)}::numeric,
            'at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          )
        ),
        updated_at = NOW()
    WHERE id = ${bookingId} AND status = 'pending'
    RETURNING id
  `);
  const rows = Array.isArray(res) ? res : (res?.rows ?? []);
  return rows.length > 0;
}

/**
 * Handles Stripe webhook for payment completion
 *
 * V-8 (ledger `2026-09-12-transport-status-self-report-gate`) — A LATE PAID SIGNAL NO LONGER
 * PROMOTES A CANCELLED ROW. Both writes below used to be unconditional on the row's CURRENT state:
 * §15's atomic conditional was present for the PAYMENT check (`payment_status !== "paid"`) and
 * absent for the STATUS this handler overwrites. A `checkout.session.completed` that arrived after
 * the traveller cancelled — a delayed delivery, a webhook replay, a reconciliation re-drive — flipped
 * a cancelled booking and a cancelled transport option back to `confirmed`, and the green badge came
 * back on a reservation nobody holds.
 *
 * Each write is now ONE statement carrying its own from-state list: the UPDATE **is** the guard, and
 * a pre-check would only be the error message (§15). A refused promotion is LOGGED rather than
 * silently swallowed — money has moved and the row says otherwise, which is a human's problem, and
 * this handler DETECTS rather than repairs (§17's posture: a detector that also repairs is another
 * unreviewed writer on the money path).
 *
 * §13 — THE FEE LEDGER FOLLOWS THE BOOKING, NOT THE SIGNAL. The traveler-service-fee row is written
 * only when the booking IS confirmed — promoted by this call, or already confirmed by an earlier
 * delivery (the writer is idempotent per booking id, so a replay that lost its first ledger write
 * still gets one). A booking this handler REFUSED to promote gets no fee event: recording a fee
 * against a cancelled reservation would be the money-side of the same claim.
 */
export async function handleStripePaymentSuccess(sessionId: string): Promise<void> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return;
    }

    const bookingId = session.metadata?.bookingId;
    const optionId = session.metadata?.optionId;

    if (!bookingId || !optionId) {
      console.error("Missing metadata in Stripe session", { sessionId });
      return;
    }

    // ── The PaymentIntent id, recorded BEFORE the status flip (R-1, ledger
    //    `2026-09-14-transport-confirm-stamps-pi`) ─────────────────────────────────
    //
    // This handler used to write `confirmationCode: session.id` and NOTHING ELSE about the payment,
    // so a paid transport booking reached `confirmed` with `stripe_payment_intent_id` NULL. Two
    // consumers key on that column and both were wrong for these rows: `POST /api/bookings/:id/cancel`
    // gates its refund on `!!booking.stripePaymentIntentId`, so a refund the policy OWED went
    // status-only; and the drift job raised `booking_confirmed_no_pi` at CRITICAL for every one.
    //
    // ORDER IS DELIBERATE. The stamp runs FIRST: a death between the two leaves `pending` + an id
    // (tolerated by the paid-equivalent invariant, and a replay promotes it), whereas the reverse
    // leaves `confirmed` + no id — the exact row this lane exists to stop creating.
    //
    // §13 — THE ABSENCE IS AN ANSWER. A paid session carrying no `payment_intent` records NOTHING
    // and says so; no id is derived, guessed or invented from the session id, which is a different
    // object entirely — the conflation the old `confirmationCode: session.id` write already made.
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    // PAY-1 §1 (ledger `2026-10-15-pay1-payment-checks`): a paid session whose PaymentIntent cannot
    // be recorded is HELD, never confirmed. Confirming it would leave `confirmed` + no id — a row the
    // cancel route cannot refund — so the booking moves `pending → needs_review` with the reason,
    // the option is left alone, and an admin resolves it on /admin/bookings/service/:id.
    let holdReason: string | null = null;
    if (!paymentIntentId) {
      holdReason = "no_payment_intent";
      console.error(
        `[transport] paid session ${sessionId} carries no payment_intent — booking=${bookingId} has ` +
          `no payment id to point at; nothing is invented. Held for review.`,
      );
    } else {
      const stamp = await stampTransportPaymentIntent(bookingId, paymentIntentId);
      if (!stamp.stamped && !stamp.alreadyStamped) {
        holdReason = `stamp_refused:${stamp.refusedReason ?? "unknown"}`;
        console.error(
          `[transport] REFUSED to record payment_intent=${paymentIntentId} on booking=${bookingId} ` +
            `(reason="${stamp.refusedReason}", status="${stamp.status}", ` +
            `existing="${stamp.existingPaymentIntentId ?? "none"}") on paid session ${sessionId} — ` +
            `detected, never repaired; held for review.`,
        );
      }
    }

    if (holdReason) {
      const held = await holdTransportBookingForReview(bookingId, {
        reason: holdReason,
        sessionId,
        paymentIntentId,
        // Stripe's own total for the paid session, in dollars; absent ⇒ null, never 0 (§13).
        amountDollars: typeof session.amount_total === "number" ? Math.round(session.amount_total) / 100 : null,
      });
      if (!held) {
        console.error(
          `[transport] booking=${bookingId} was not in "pending", so it was not moved to needs_review ` +
            `(reason="${holdReason}", session ${sessionId}); nothing else is written.`,
        );
      }
      return;
    }

    // ── The booking row: atomic conditional, never a check-then-write (§15) ──────────────────────
    const [promotedBooking] = await db
      .update(serviceBookings as any)
      .set({
        status: "confirmed",
        // PAYMENT ON RECORD (ledger `2026-09-28-no-payment-no-earnings`): this is a paid transition,
        // so it stamps `booking_details.paidCharge` in the SAME statement as its flip — merged, never
        // assigned. The amount is the session's own `amount_total` (Stripe's word, §14), in dollars;
        // absent ⇒ recorded as null, never 0 (§13).
        bookingDetails: paidChargeMergeSql(
          "confirmed",
          typeof session.amount_total === "number" ? Math.round(session.amount_total) / 100 : null,
        ),
        // INERT, AND RECORDED RATHER THAN QUIETLY REPAIRED (R-1, ledger
        // `2026-09-14-transport-confirm-stamps-pi`). `service_bookings` has no `confirmation_code`
        // column — `shared/schema.ts` declares none — and because this UPDATE is written
        // `serviceBookings as any`, drizzle DROPS the unknown key without complaint, so this line
        // has never stored anything (the V-14 shape: an `as any` hiding a write that does nothing).
        // It is LEFT IN PLACE deliberately: whether a transport booking should carry a confirmation
        // code at all, and whether a CHECKOUT SESSION id is the right value for one, is a
        // decision-maker's ruling (ledger `2026-09-08-confirmation-code-is-the-server-s` governs the
        // legacy `bookings` rail, a different table), and deleting the only marker of that intent
        // would erase the question. `transport-payment-intent.db.test.ts` T1 pins the absence.
        confirmationCode: session.id,
      })
      .where(
        and(
          eq(serviceBookings.id as any, bookingId),
          inArray(serviceBookings.status as any, [...TRANSPORT_BOOKING_PROMOTABLE_FROM]),
        ),
      )
      .returning({ id: serviceBookings.id } as any);

    let bookingIsConfirmed = !!promotedBooking;
    if (!promotedBooking) {
      // Zero rows means one of three things, and they are different facts (§13): the row is gone,
      // it was promoted by an earlier delivery (idempotent replay), or it has moved somewhere this
      // promotion may not leave — a cancellation a late signal must not undo.
      const [current] = await db
        .select({ status: serviceBookings.status })
        .from(serviceBookings)
        .where(eq(serviceBookings.id as any, bookingId))
        .limit(1);
      bookingIsConfirmed = current?.status === "confirmed";
      if (!current) {
        console.error(`[transport] paid session ${sessionId} names booking=${bookingId}, which does not exist`);
      } else if (!bookingIsConfirmed) {
        console.error(
          `[transport] REFUSED to promote booking=${bookingId} from status="${current.status}" ` +
            `on paid session ${sessionId} — a late payment signal does not resurrect a booking that ` +
            `left the promotable set; needs a human.`,
        );
      }
    }

    // ── The transport option: same shape, its own from-state list ────────────────────────────────
    const [promotedOption] = await db
      .update(transportBookingOptions)
      .set({
        // Status only (PAY-1b): `booking_id` is int4, nothing reads it, and the parsed epoch overflowed it.
        bookingStatus: "confirmed",
      })
      .where(
        and(
          eq(transportBookingOptions.id, optionId),
          // NULL is the un-stamped row and has to be admitted explicitly — `NULL IN (…)` is NULL,
          // not TRUE, so a bare `inArray` would silently refuse every option nobody has touched.
          or(
            isNull(transportBookingOptions.bookingStatus),
            inArray(transportBookingOptions.bookingStatus, [...TRANSPORT_OPTION_PROMOTABLE_FROM]),
          ),
        ),
      )
      .returning({ id: transportBookingOptions.id, bookingStatus: transportBookingOptions.bookingStatus });

    if (!promotedOption) {
      const [currentOption] = await db
        .select({ bookingStatus: transportBookingOptions.bookingStatus })
        .from(transportBookingOptions)
        .where(eq(transportBookingOptions.id, optionId))
        .limit(1);
      if (!currentOption) {
        console.error(`[transport] paid session ${sessionId} names option=${optionId}, which does not exist`);
      } else if (currentOption.bookingStatus !== "confirmed") {
        console.error(
          `[transport] REFUSED to promote option=${optionId} from booking_status=` +
            `"${currentOption.bookingStatus}" on paid session ${sessionId} — a cancelled option is ` +
            `never resurrected by a late signal; needs a human.`,
        );
      }
    }

    // Ruling 2026-09-02 (path 4): record the traveler service fee event for this transport booking —
    // idempotent per booking id, best-effort (payment is confirmed; a recording failure is logged,
    // never re-throws). The row is a service_bookings row, so the shared writer reads its snapshot.
    // Gated on the BOOKING being confirmed — see the header note on §13.
    if (bookingIsConfirmed) {
      try {
        // ONE derivation of this id per delivery (§18 rule 1) — the same value the stamp above
        // recorded, never a second read of `session.payment_intent` that could disagree with it.
        await recordTravelerServiceFeeLedger({
          bookingIds: [bookingId],
          stripePaymentRef: paymentIntentId,
          actor: "transport_confirm",
        });
      } catch (ledgerErr: any) {
        console.error(`[transport] traveler-fee ledger write failed for booking=${bookingId} (payment CONFIRMED):`, ledgerErr?.message ?? ledgerErr);
      }

      console.log("Booking confirmed:", { bookingId, optionId });
    }
  } catch (error) {
    console.error("Error handling Stripe payment:", error);
    throw error;
  }
}

/**
 * Retrieves Stripe session details
 */
export async function getStripeSessionDetails(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      status: session.payment_status,
      paymentStatus: session.payment_status,
      customerId: session.customer,
      amount: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
    };
  } catch (error) {
    console.error("Error retrieving Stripe session:", error);
    throw error;
  }
}

