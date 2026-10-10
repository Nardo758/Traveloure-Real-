/**
 * S1-d-3a — BOOKING THE CHOSEN LITEAPI STAY (decision-maker S1-d-3 rulings, Oct 10, 2026; ledger
 * `2026-10-10-s1-d3a-liteapi-booking`; brief docs/planning/briefs/s1-d3-liteapi-booking.md). The ONE writer of
 * `liteapi_bookings` (migration 371).
 *
 *   · NUITÉE IS MERCHANT OF RECORD. The Payment SDK takes the card on our page; we send LiteAPI only the
 *     SDK's transaction id. No PaymentIntent, no platform_revenue row: our take is the `hotel_margin_public`
 *     band already inside the rate, paid out by Nuitée.
 *   · OWNER ONLY. Booking pays (LD 52: a helper prepares, the traveler pays), so not even the managing
 *     assistant may prebook, book or cancel. Anything else is ONE not_found (LD 40).
 *   · THE STAY IS FOUND BY ITEM ID, SERVER-SIDE: item → its chosen accommodation option set → the chosen
 *     option's `hotel_cache` row → a LiteAPI row in this plan's city (ruling 4).
 *   · THE OFFER ID NEVER COMES FROM THE BROWSER (§14): prebook re-quotes the plan's own dates and party on
 *     the d-2 rates rail (same gate, same cap), and the PREBOOK's price is what the SDK charges and the page
 *     shows before it opens. Below LiteAPI's SSP is refused.
 *   · CLAIM BEFORE EVERY EXTERNAL CALL (§15/§15b): `prebooked → booking` before book, `confirmed →
 *     cancelling` before cancel, each one atomic conditional. A definite LiteAPI refusal ends the claim; an
 *     answer we cannot read leaves it for the sync to DETECT — the sync never books (ruling).
 *   · CONFIRMED is ONE transaction: the row flips, the item becomes `purchased` (so the stay cannot be
 *     swapped under the booking — `chooseOption` refuses a non-`in_planning` item), and the voucher email is
 *     inserted into the outbox. The single confirmed flip is the voucher's dedupe (ruling 5).
 *   · SANDBOX ONLY: every step asks `liteapiBookingEnabled` first.
 */
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox, hotelCache, itineraryItems, liteapiBookings, planOptionSets, planOptions, trips, users } from "@shared/schema";
import { LITEAPI_PROVIDER } from "@shared/liteapi";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import {
  LITEAPI_LIVE_STATUSES,
  bookIsConfirmed,
  bookingStatusOf,
  offerIdFromRates,
  parseBook,
  parsePrebook,
} from "@shared/liteapi-booking";
import {
  liteapiBookingEnabled,
  liteapiConfig,
  liteapiCurrency,
  liteapiGuestNationality,
  liteapiRatesTimeoutMs,
  type LiteapiConfig,
} from "../config/liteapi.config";
import { createLiteapiClient, LiteapiError, type LiteapiClient } from "./liteapi-client";
import { gatedLiteapiRatesCall, type LiteapiRatesGateDeps } from "./liteapi-rates-gate";
import { publicMarginFraction } from "./liteapi-rates.service";
import { verifyTripOwnership } from "../utils/trip-ownership";

export interface StayBookingDeps {
  config: () => LiteapiConfig | null;
  client: (cfg: LiteapiConfig) => LiteapiClient;
  gate?: LiteapiRatesGateDeps;
  marginFraction: () => Promise<number>;
  timeoutMs: () => number;
}

export const defaultStayBookingDeps: StayBookingDeps = {
  config: () => liteapiConfig(),
  client: (cfg) => createLiteapiClient(cfg),
  marginFraction: publicMarginFraction,
  timeoutMs: () => liteapiRatesTimeoutMs(),
};

type Refusal =
  | "not_found"
  | "booking_unavailable"
  | "already_booked"
  | "dates_needed"
  | "party_needed"
  | "unavailable"
  | "no_prebook"
  | "holder_incomplete"
  | "not_confirmed";

export type PrebookResult =
  | { state: "prebooked"; bookingId: string; amountCents: number; currency: string; transactionId: string; secretKey: string; checkin: string; checkout: string; adults: number }
  | { state: Refusal };

export type BookResult =
  | { state: "confirmed"; bookingId: string; hotelConfirmationCode: string | null }
  | { state: "failed"; bookingId: string }
  | { state: "pending"; bookingId: string }
  | { state: Refusal };

export type CancelResult = { state: "cancelled"; bookingId: string } | { state: "cancel_refused"; bookingId: string } | { state: "pending"; bookingId: string } | { state: Refusal };

/** The chosen LiteAPI stay behind one item of one plan, or null (ruling 4). */
export async function resolveChosenLiteapiStay(tripId: string, itemId: string): Promise<{ hotelCacheId: string; providerHotelId: string; hotelName: string } | null> {
  const [trip] = await db.select({ destination: trips.destination }).from(trips).where(eq(trips.id, tripId)).limit(1);
  const city = (trip?.destination ?? "").split(",")[0].trim();
  if (!city) return null;
  const [item] = await db.select({ id: itineraryItems.id }).from(itineraryItems).where(and(eq(itineraryItems.id, itemId), eq(itineraryItems.tripId, tripId))).limit(1);
  if (!item) return null;
  const [set] = await db
    .select({ chosenOptionId: planOptionSets.chosenOptionId })
    .from(planOptionSets)
    .where(and(eq(planOptionSets.tripId, tripId), eq(planOptionSets.itineraryItemId, itemId), eq(planOptionSets.status, "chosen"), eq(planOptionSets.categoryKey, "accommodation")))
    .limit(1);
  if (!set?.chosenOptionId) return null;
  const [opt] = await db.select({ hotelCacheId: planOptions.hotelCacheId }).from(planOptions).where(and(eq(planOptions.id, set.chosenOptionId))).limit(1);
  if (!opt?.hotelCacheId) return null;
  const [h] = await db
    .select({ id: hotelCache.id, providerHotelId: hotelCache.providerHotelId, name: hotelCache.name })
    .from(hotelCache)
    .where(and(eq(hotelCache.id, opt.hotelCacheId), eq(hotelCache.provider, LITEAPI_PROVIDER), or(ilike(hotelCache.city, city), ilike(hotelCache.cityCode, city))))
    .limit(1);
  if (!h?.providerHotelId) return null;
  return { hotelCacheId: h.id, providerHotelId: h.providerHotelId, hotelName: h.name ?? "your hotel" };
}

async function ownerOf(tripId: string, userId: string | null | undefined): Promise<boolean> {
  return !!userId && (await verifyTripOwnership(tripId, userId));
}

async function liveBookingFor(itemId: string) {
  const [row] = await db.select().from(liteapiBookings).where(and(eq(liteapiBookings.itineraryItemId, itemId), inArray(liteapiBookings.status, LITEAPI_LIVE_STATUSES as string[]))).limit(1);
  return row ?? null;
}

const isUniqueViolation = (err: any) => err?.code === "23505" || err?.cause?.code === "23505";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms).unref?.())]);
}

/** Re-quote the plan's own dates and party, then prebook that offer for the Payment SDK. */
export async function prebookStay(input: { tripId: string; itemId: string; userId: string | null | undefined }, deps: StayBookingDeps = defaultStayBookingDeps): Promise<PrebookResult> {
  if (!(await ownerOf(input.tripId, input.userId))) return { state: "not_found" };
  const stay = await resolveChosenLiteapiStay(input.tripId, input.itemId);
  if (!stay) return { state: "not_found" };
  const cfg = deps.config();
  if (!liteapiBookingEnabled(cfg)) return { state: "booking_unavailable" };
  if (await liveBookingFor(input.itemId)) return { state: "already_booked" };
  const [trip] = await db
    .select({ startDate: trips.startDate, endDate: trips.endDate, datesConfirmedAt: trips.datesConfirmedAt, adults: trips.adults })
    .from(trips)
    .where(eq(trips.id, input.tripId))
    .limit(1);
  if (!trip || !planDatesAreConfirmed(trip.datesConfirmedAt as any)) return { state: "dates_needed" };
  const adults = Number(trip.adults);
  if (!Number.isInteger(adults) || adults < 1) return { state: "party_needed" };
  const checkin = String(trip.startDate).slice(0, 10);
  const checkout = String(trip.endDate).slice(0, 10);
  if (!(checkout > checkin)) return { state: "dates_needed" };

  const client = deps.client(cfg);
  const timeoutMs = deps.timeoutMs();
  let offerId: string | null = null;
  try {
    const marginPercent = Math.round((await deps.marginFraction()) * 10_000) / 100;
    const quoted = await gatedLiteapiRatesCall(
      async () => {
        const body = await withTimeout(
          client.hotelRates({
            hotelId: stay.providerHotelId,
            checkin,
            checkout,
            adults,
            currency: liteapiCurrency(),
            guestNationality: liteapiGuestNationality(),
            marginPercent,
            timeoutSeconds: Math.max(1, Math.floor(timeoutMs / 1000)),
          }),
          timeoutMs,
        );
        if (body === "timeout") throw new Error("timeout");
        return body;
      },
      { userId: input.userId ?? null, env: cfg.env, deps: deps.gate },
    );
    if ("refused" in quoted) return { state: "unavailable" };
    offerId = offerIdFromRates(quoted.value);
  } catch (err: any) {
    console.warn(`[liteapi-booking] re-quote ${input.itemId}: ${err?.message ?? err}`);
    return { state: "unavailable" };
  }
  if (!offerId) return { state: "unavailable" };

  let parsed;
  try {
    parsed = parsePrebook(await client.prebook({ offerId }));
  } catch (err: any) {
    console.warn(`[liteapi-booking] prebook ${input.itemId}: ${err?.message ?? err}`);
    return { state: "unavailable" };
  }
  if (!parsed.ok) {
    console.warn(`[liteapi-booking] prebook ${input.itemId} refused: ${parsed.reason}`);
    return { state: "unavailable" };
  }
  const f = parsed.facts;
  // The pair is written BEFORE the SDK opens: LiteAPI cannot hand it back later. The secret key is not stored.
  const [row] = await db
    .insert(liteapiBookings)
    .values({
      tripId: input.tripId,
      itineraryItemId: input.itemId,
      userId: input.userId!,
      hotelCacheId: stay.hotelCacheId,
      providerHotelId: stay.providerHotelId,
      env: cfg.env,
      status: "prebooked",
      offerId,
      prebookId: f.prebookId,
      transactionId: f.transactionId,
      checkin,
      checkout,
      adults,
      amountCents: f.amountCents,
      currency: f.currency,
      cancellationPolicy: (f.cancellationPolicy ?? null) as any,
    })
    .returning({ id: liteapiBookings.id });
  return { state: "prebooked", bookingId: row.id, amountCents: f.amountCents, currency: f.currency, transactionId: f.transactionId, secretKey: f.secretKey, checkin, checkout, adults };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The voucher, inserted inside the confirmed transaction (ruling 5). A missing address is recorded dead. */
function voucherRow(input: { toEmail: string | null; bookingId: string; hotelName: string; code: string | null; checkin: string; checkout: string; adults: number }) {
  const ref = input.code ?? "not stated by the hotel yet";
  const lines = [
    `Your stay at ${input.hotelName} is booked.`,
    `Hotel confirmation code: ${ref}`,
    `Check-in ${input.checkin} · check-out ${input.checkout} · ${input.adults} adult${input.adults === 1 ? "" : "s"}`,
    "Payment was taken by our booking partner Nuitée, who appears on your card statement.",
  ];
  return {
    emailType: "liteapi_stay_voucher",
    toEmail: input.toEmail ?? "",
    subject: `Booked: ${input.hotelName}`,
    html: lines.map((l) => `<p>${esc(l)}</p>`).join(""),
    textBody: lines.join("\n"),
    status: input.toEmail ? "pending" : "dead",
    attemptCount: 0,
    maxAttempts: 6,
    lastError: input.toEmail ? null : "Traveler email missing at booking; voucher was not deliverable.",
    metadata: { source: "liteapi_booking", bookingId: input.bookingId, eventKey: `liteapi_voucher:${input.bookingId}` },
  };
}

/** Book the item's latest prebook, which the Payment SDK has paid. */
export async function bookStay(input: { tripId: string; itemId: string; userId: string | null | undefined }, deps: StayBookingDeps = defaultStayBookingDeps): Promise<BookResult> {
  if (!(await ownerOf(input.tripId, input.userId))) return { state: "not_found" };
  const stay = await resolveChosenLiteapiStay(input.tripId, input.itemId);
  if (!stay) return { state: "not_found" };
  const cfg = deps.config();
  if (!liteapiBookingEnabled(cfg)) return { state: "booking_unavailable" };
  const [pre] = await db
    .select()
    .from(liteapiBookings)
    .where(and(eq(liteapiBookings.itineraryItemId, input.itemId), eq(liteapiBookings.userId, input.userId!), eq(liteapiBookings.status, "prebooked"), eq(liteapiBookings.env, cfg.env)))
    .orderBy(desc(liteapiBookings.createdAt))
    .limit(1);
  if (!pre) return { state: "no_prebook" };
  const [u] = await db.select({ email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, input.userId!)).limit(1);
  const holder = { firstName: (u?.firstName ?? "").trim(), lastName: (u?.lastName ?? "").trim(), email: (u?.email ?? "").trim() };
  // §13: a booking is never made under an invented name.
  if (!holder.firstName || !holder.lastName || !holder.email) return { state: "holder_incomplete" };

  // The claim (§15): one statement; a second live booking for the item is refused by the partial UNIQUE.
  let claimed;
  try {
    [claimed] = await db
      .update(liteapiBookings)
      .set({ status: "booking", claimedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(liteapiBookings.id, pre.id), eq(liteapiBookings.status, "prebooked")))
      .returning({ id: liteapiBookings.id });
  } catch (err) {
    if (isUniqueViolation(err)) return { state: "already_booked" };
    throw err;
  }
  if (!claimed) return { state: "no_prebook" };

  let answer: any;
  try {
    answer = await deps.client(cfg).book({ prebookId: pre.prebookId, transactionId: pre.transactionId, clientReference: pre.id, holder });
  } catch (err: any) {
    const definite = err instanceof LiteapiError && err.status >= 400 && err.status < 500;
    await db
      .update(liteapiBookings)
      .set({ status: definite ? "failed" : "booking", failureReason: String(err?.message ?? err).slice(0, 300), updatedAt: new Date() })
      .where(and(eq(liteapiBookings.id, pre.id), eq(liteapiBookings.status, "booking")));
    return definite ? { state: "failed", bookingId: pre.id } : { state: "pending", bookingId: pre.id };
  }
  const facts = parseBook(answer);
  if (!facts) {
    await db.update(liteapiBookings).set({ failureReason: "unreadable_book_answer", updatedAt: new Date() }).where(and(eq(liteapiBookings.id, pre.id), eq(liteapiBookings.status, "booking")));
    return { state: "pending", bookingId: pre.id };
  }
  if (!bookIsConfirmed(facts)) {
    const failed = facts.status === "FAILED";
    await db
      .update(liteapiBookings)
      .set({ status: failed ? "failed" : "booking", liteapiBookingId: facts.liteapiBookingId, lastSyncStatus: facts.status || null, updatedAt: new Date() })
      .where(and(eq(liteapiBookings.id, pre.id), eq(liteapiBookings.status, "booking")));
    return failed ? { state: "failed", bookingId: pre.id } : { state: "pending", bookingId: pre.id };
  }

  await db.transaction(async (tx) => {
    const [done] = await tx
      .update(liteapiBookings)
      .set({
        status: "confirmed",
        liteapiBookingId: facts.liteapiBookingId,
        hotelConfirmationCode: facts.hotelConfirmationCode,
        commissionCents: facts.commissionCents,
        processingFeeCents: facts.processingFeeCents,
        bookedAt: new Date(),
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(liteapiBookings.id, pre.id), eq(liteapiBookings.status, "booking")))
      .returning({ id: liteapiBookings.id });
    if (!done) return;
    await tx
      .update(itineraryItems)
      .set({ routingStatus: "purchased", updatedAt: new Date() } as any)
      .where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId), sql`routing_status <> 'purchased'`));
    await tx.insert(emailOutbox).values(
      voucherRow({ toEmail: holder.email || null, bookingId: pre.id, hotelName: stay.hotelName, code: facts.hotelConfirmationCode, checkin: String(pre.checkin), checkout: String(pre.checkout), adults: pre.adults }) as any,
    );
  });
  return { state: "confirmed", bookingId: pre.id, hotelConfirmationCode: facts.hotelConfirmationCode };
}

/** Cancel the item's confirmed booking. Any refund is Nuitée's: no refund row, no money moved here. */
export async function cancelStay(input: { tripId: string; itemId: string; userId: string | null | undefined }, deps: StayBookingDeps = defaultStayBookingDeps): Promise<CancelResult> {
  if (!(await ownerOf(input.tripId, input.userId))) return { state: "not_found" };
  const cfg = deps.config();
  if (!liteapiBookingEnabled(cfg)) return { state: "booking_unavailable" };
  const [row] = await db
    .select()
    .from(liteapiBookings)
    .where(and(eq(liteapiBookings.tripId, input.tripId), eq(liteapiBookings.itineraryItemId, input.itemId), eq(liteapiBookings.status, "confirmed"), eq(liteapiBookings.env, cfg.env)))
    .limit(1);
  if (!row?.liteapiBookingId) return { state: "not_confirmed" };
  const [claimed] = await db
    .update(liteapiBookings)
    .set({ status: "cancelling", cancellingAt: new Date(), updatedAt: new Date() })
    .where(and(eq(liteapiBookings.id, row.id), eq(liteapiBookings.status, "confirmed")))
    .returning({ id: liteapiBookings.id });
  if (!claimed) return { state: "not_confirmed" };
  let status: string | null;
  try {
    status = bookingStatusOf(await deps.client(cfg).cancelBooking(row.liteapiBookingId));
  } catch (err: any) {
    const definite = err instanceof LiteapiError && err.status >= 400 && err.status < 500;
    if (definite) {
      await db.update(liteapiBookings).set({ status: "confirmed", failureReason: String(err?.message ?? err).slice(0, 300), updatedAt: new Date() }).where(and(eq(liteapiBookings.id, row.id), eq(liteapiBookings.status, "cancelling")));
      return { state: "cancel_refused", bookingId: row.id };
    }
    // No readable answer: the claim stays; the sync records what LiteAPI says (it never cancels).
    return { state: "pending", bookingId: row.id };
  }
  if (status !== "CANCELLED") {
    await db.update(liteapiBookings).set({ status: "confirmed", lastSyncStatus: status, updatedAt: new Date() }).where(and(eq(liteapiBookings.id, row.id), eq(liteapiBookings.status, "cancelling")));
    return { state: "cancel_refused", bookingId: row.id };
  }
  await db.transaction(async (tx) => {
    const [done] = await tx
      .update(liteapiBookings)
      .set({ status: "cancelled", cancelledAt: new Date(), lastSyncStatus: status, updatedAt: new Date() })
      .where(and(eq(liteapiBookings.id, row.id), eq(liteapiBookings.status, "cancelling")))
      .returning({ id: liteapiBookings.id });
    if (!done) return;
    // The stay is the traveler's to change again.
    await tx
      .update(itineraryItems)
      .set({ routingStatus: "in_planning", updatedAt: new Date() } as any)
      .where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId), sql`routing_status = 'purchased'`, sql`booking_id IS NULL`));
  });
  return { state: "cancelled", bookingId: row.id };
}

/** The owner's read of the item's latest booking — status, code, price as booked. Nothing secret. */
export async function stayBookingView(input: { tripId: string; itemId: string; userId: string | null | undefined }) {
  if (!(await ownerOf(input.tripId, input.userId))) return null;
  const [row] = await db
    .select()
    .from(liteapiBookings)
    .where(and(eq(liteapiBookings.tripId, input.tripId), eq(liteapiBookings.itineraryItemId, input.itemId)))
    .orderBy(desc(liteapiBookings.createdAt))
    .limit(1);
  if (!row) return { booking: null };
  return {
    booking: {
      id: row.id,
      status: row.status,
      hotelConfirmationCode: row.hotelConfirmationCode,
      amountCents: row.amountCents,
      currency: row.currency,
      checkin: String(row.checkin),
      checkout: String(row.checkout),
      adults: row.adults,
      env: row.env,
    },
  };
}
