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
 *     shows before it opens. THE BOOKING MARGIN is `bookingMarginFraction` (decision-maker, Oct 11, 2026):
 *     max(band, SSP / net − 1) from the re-quote's own answer; above the band, ONE more re-quote at that
 *     margin, whose offer is prebooked. Refused only when the SSP is unstated or in another currency.
 *   · CLAIM BEFORE EVERY EXTERNAL CALL (§15/§15b): `prebooked → booking` before book, `confirmed →
 *     cancelling` before cancel, each one atomic conditional. A definite LiteAPI refusal of a BOOK ends the claim; a
 *     definite refusal of a CANCEL moves the row to `needs_review` with the reason, never back to `confirmed`
 *     (ledger `2026-10-15-liteapi-cancel-needs-review`); an answer we cannot read leaves the claim for the sync
 *     to DETECT — the sync never books (ruling).
 *   · CONFIRMED is ONE transaction: the row flips, the item becomes `purchased` (so the stay cannot be
 *     swapped under the booking — `chooseOption` refuses a non-`in_planning` item), and the voucher email is
 *     inserted into the outbox. The single confirmed flip is the voucher's dedupe (ruling 5).
 *   · SANDBOX ONLY: every step asks `liteapiBookingEnabled` first.
 */
import crypto from "node:crypto";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { lockTripRow } from "./trip-row-lock";
import { emailOutbox, hotelCache, itineraryItems, liteapiBookings, planOptionSets, planOptions, trips, users } from "@shared/schema";
import { LITEAPI_PROVIDER } from "@shared/liteapi";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import {
  LITEAPI_ITEM_HOLDING_STATUSES,
  LITEAPI_NEEDS_REVIEW,
  bookIsConfirmed,
  bookingStatusOf,
  cancelChargeTerms,
  cancelAmountsOf,
  refundUnverifiedReason,
  type LiteapiCancelAmounts,
  cancelRefusalReason,
  isLiteapiCancelled,
  offerIdFromRates,
  sspFromRates,
  bookingMarginFraction,
  parseBook,
  parsePrebook,
  prebookDiagnostic,
  prebookFloorPercent,
} from "@shared/liteapi-booking";
import {
  liteapiBookingEnabled,
  liteapiConfig,
  liteapiCurrency,
  liteapiGuestNationality,
  liteapiRatesTimeoutMs,
  type LiteapiConfig, liteapiPrebookTimeoutMs, liteapiBookTimeoutMs } from "../config/liteapi.config";
import { createLiteapiClient, LiteapiError, LiteapiTimeoutError, type LiteapiClient } from "./liteapi-client";
import { gatedLiteapiRatesCall, type LiteapiRatesGateDeps } from "./liteapi-rates-gate";
import { publicMarginFraction } from "./liteapi-rates.service";
import { verifyTripOwnership } from "../utils/trip-ownership";

export interface StayBookingDeps {
  config: () => LiteapiConfig | null;
  client: (cfg: LiteapiConfig) => LiteapiClient;
  gate?: LiteapiRatesGateDeps;
  marginFraction: () => Promise<number>;
  timeoutMs: () => number;
  /** S1-d-3c: hard client timeouts on the booking host (config, never literals). */
  prebookTimeoutMs?: () => number;
  bookTimeoutMs?: () => number;
}

export const defaultStayBookingDeps: StayBookingDeps = {
  config: () => liteapiConfig(),
  client: (cfg) => createLiteapiClient(cfg),
  marginFraction: publicMarginFraction,
  timeoutMs: () => liteapiRatesTimeoutMs(),
  prebookTimeoutMs: () => liteapiPrebookTimeoutMs(),
  bookTimeoutMs: () => liteapiBookTimeoutMs(),
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
  | { state: "prebooked"; bookingId: string; amountCents: number; currency: string; transactionId: string; secretKey: string; checkin: string; checkout: string; adults: number; env: string }
  | { state: Refusal }
  // §13 (d-3b): an "unavailable" says which refusal it was — no secret and no price, only the reason.
  | { state: "unavailable"; reason: string; status?: number };

export type BookResult =
  | { state: "confirmed"; bookingId: string; hotelConfirmationCode: string | null }
  | { state: "failed"; bookingId: string }
  | { state: "pending"; bookingId: string }
  | { state: Refusal };

export type CancelResult =
  | { state: "cancelled"; bookingId: string; liteapiStatus: string }
  | { state: "charges_apply"; bookingId: string; policy: string | null; deadline: string | null; amount: number | null; currency: string | null }
  | { state: "needs_review"; bookingId: string }
  | { state: "pending"; bookingId: string }
  | { state: Refusal };

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

/**
 * BP-1 (ledger `2026-10-12-bp1-booking-path`): which items of one plan are bookable LiteAPI stays — booking is on
 * (sandbox only) AND the item resolves to a chosen LiteAPI stay. ONE rule with the sheet's own `bookable`
 * (`stayBookingView`, below): both call `resolveChosenLiteapiStay`; this only pre-filters to the items that have a
 * chosen accommodation option set, so a plan's read asks the chain once per stay, never once per item.
 */
export async function liteapiBookableItemIds(tripId: string, deps: Pick<StayBookingDeps, "config"> = defaultStayBookingDeps): Promise<Set<string>> {
  const out = new Set<string>();
  if (!liteapiBookingEnabled(deps.config())) return out;
  const sets = await db
    .select({ itemId: planOptionSets.itineraryItemId })
    .from(planOptionSets)
    .where(and(eq(planOptionSets.tripId, tripId), eq(planOptionSets.status, "chosen"), eq(planOptionSets.categoryKey, "accommodation")));
  for (const s of sets) {
    if (s.itemId && !out.has(s.itemId) && (await resolveChosenLiteapiStay(tripId, s.itemId)) !== null) out.add(s.itemId);
  }
  return out;
}

async function ownerOf(tripId: string, userId: string | null | undefined): Promise<boolean> {
  return !!userId && (await verifyTripOwnership(tripId, userId));
}

// A live booking OR one awaiting review holds the item (LITEAPI_ITEM_HOLDING_STATUSES).
async function liveBookingFor(itemId: string) {
  const [row] = await db.select().from(liteapiBookings).where(and(eq(liteapiBookings.itineraryItemId, itemId), inArray(liteapiBookings.status, LITEAPI_ITEM_HOLDING_STATUSES as string[]))).limit(1);
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
  // One rates request at a given margin (LiteAPI prices the offer id it returns at that margin).
  const quote = async (marginPercent: number) => {
    const out = await gatedLiteapiRatesCall(
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
    return out;
  };
  let offerId: string | null = null;
  let offerQuote: any = null;
  let marginUsed = 0;
  let bandFraction = 0;
  let quotedSsp: ReturnType<typeof sspFromRates> = null;
  try {
    const band = await deps.marginFraction();
    bandFraction = band;
    const bandPercent = Math.round(band * 10_000) / 100;
    const quoted = await quote(bandPercent);
    if ("refused" in quoted) {
      console.warn(`[liteapi-booking] re-quote ${input.itemId} refused: rates ${quoted.refused}`);
      return { state: "unavailable", reason: "rates_paused" };
    }
    offerId = offerIdFromRates(quoted.value);
    offerQuote = quoted.value;
    marginUsed = bandPercent;
    if (offerId) {
      // The booking margin (decision-maker, Oct 11, 2026): max(band, SSP / net − 1) from THIS answer, so the
      // booked price is never below the SSP nor below our band. Refused only for an unstated SSP or one in
      // another currency.
      const m = bookingMarginFraction(quoted.value, band);
      if (!m.ok) {
        console.warn(`[liteapi-booking] re-quote ${input.itemId}: ${m.reason}`);
        return { state: "unavailable", reason: m.reason };
      }
      quotedSsp = m.ssp;
      if (m.percent > bandPercent) {
        // The band alone prices under the SSP: re-quote ONCE at the floor margin and prebook that offer.
        const raised = await quote(m.percent);
        if ("refused" in raised) {
          console.warn(`[liteapi-booking] floor re-quote ${input.itemId} refused: rates ${raised.refused}`);
          return { state: "unavailable", reason: "rates_paused" };
        }
        offerId = offerIdFromRates(raised.value);
        offerQuote = raised.value;
        marginUsed = m.percent;
        quotedSsp = sspFromRates(raised.value) ?? m.ssp;
        console.info(`[liteapi-booking] ${input.itemId}: margin ${bandPercent}% → ${m.percent}% to meet the SSP`);
      }
    }
  } catch (err: any) {
    console.warn(`[liteapi-booking] re-quote ${input.itemId}: ${err?.message ?? err}`);
    return { state: "unavailable", reason: "rates_error", ...(typeof err?.status === "number" ? { status: err.status } : {}) };
  }
  if (!offerId) {
    // §13: say which refusal it was — LiteAPI answered with no offer for these dates and this party.
    console.warn(`[liteapi-booking] re-quote ${input.itemId}: no offer for ${checkin}→${checkout}, ${adults} adult(s)`);
    return { state: "unavailable", reason: "no_offer" };
  }

  let parsed;
  const prebookTimeout = (deps.prebookTimeoutMs ?? liteapiPrebookTimeoutMs)();
  try {
    const prebookBody = await client.prebook({ offerId }, { timeoutMs: prebookTimeout });
    console.info(`[liteapi-booking] prebook ${input.itemId}: ${prebookDiagnostic(offerQuote, prebookBody, marginUsed)}`);
    parsed = parsePrebook(prebookBody, quotedSsp);
    if (!parsed.ok && parsed.reason === "below_ssp") {
      // S1-d-3c: answered below its own SSP ⇒ ONE re-quote at the margin that floor needs, ONE more prebook,
      // then refuse. Never more than two prebook calls per attempt.
      const fl = prebookFloorPercent(prebookBody, quotedSsp, marginUsed, bandFraction);
      if (fl.ok) {
        console.info(`[liteapi-booking] ${input.itemId}: margin ${marginUsed}% → ${fl.percent}% to meet the prebook's SSP`);
        const again = await quote(fl.percent);
        if ("refused" in again) {
          console.warn(`[liteapi-booking] prebook-floor re-quote ${input.itemId} refused: rates ${again.refused}`);
          return { state: "unavailable", reason: "rates_paused" };
        }
        const retryOffer = offerIdFromRates(again.value);
        if (!retryOffer) return { state: "unavailable", reason: "no_offer" };
        offerId = retryOffer;
        offerQuote = again.value;
        marginUsed = fl.percent;
        quotedSsp = sspFromRates(again.value) ?? quotedSsp;
        const secondBody = await client.prebook({ offerId }, { timeoutMs: prebookTimeout });
        console.info(`[liteapi-booking] prebook ${input.itemId} (retry): ${prebookDiagnostic(offerQuote, secondBody, marginUsed)}`);
        parsed = parsePrebook(secondBody, quotedSsp);
      }
    }
  } catch (err: any) {
    console.warn(`[liteapi-booking] prebook ${input.itemId}: ${err?.message ?? err}`);
    return { state: "unavailable", reason: "prebook_error", ...(typeof err?.status === "number" ? { status: err.status } : {}) };
  }
  if (!parsed.ok) {
    console.warn(`[liteapi-booking] prebook ${input.itemId} refused: ${parsed.reason}`);
    return { state: "unavailable", reason: parsed.reason };
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
  // `env` is the Payment SDK's public key ("sandbox" | "live") — the page never decides it (d-3b).
  return { state: "prebooked", bookingId: row.id, amountCents: f.amountCents, currency: f.currency, transactionId: f.transactionId, secretKey: f.secretKey, checkin, checkout, adults, env: cfg.env };
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

  // The claim (§15): one statement; a second booking holding the item — live or awaiting review — is refused by
  // the partial UNIQUE (migration 377).
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
    answer = await deps.client(cfg).book(
      { prebookId: pre.prebookId, transactionId: pre.transactionId, clientReference: pre.id, holder },
      { timeoutMs: (deps.bookTimeoutMs ?? liteapiBookTimeoutMs)() },
    );
  } catch (err: any) {
    // S1-d-3c: a timeout is UNKNOWN, never failed — a charge may exist (LD 43/44). The row stays `booking`
    // ("still waiting for the hotel's answer") and the sync finds it by our client reference.
    if (err instanceof LiteapiTimeoutError) console.warn(`[liteapi-booking] book ${input.itemId}: ${err.message} — left waiting for the sync`);
    const definite = err instanceof LiteapiError && err.status >= 400 && err.status < 500;
    // One line per book that did not answer CONFIRMED: LiteAPI's status and its own message (the text stored as
    // failure_reason), so a refused book says why in the server log.
    if (!(err instanceof LiteapiTimeoutError)) console.warn(`[liteapi-booking] book ${input.itemId} ${definite ? "refused" : "unanswered"}: ${err instanceof LiteapiError ? `${err.status} ` : ""}${String(err?.message ?? err).slice(0, 300)}`);
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
    console.warn(`[liteapi-booking] book ${input.itemId}: LiteAPI answered ${facts.status || "no status"}`);
    await db
      .update(liteapiBookings)
      .set({ status: failed ? "failed" : "booking", liteapiBookingId: facts.liteapiBookingId, lastSyncStatus: facts.status || null, updatedAt: new Date() })
      .where(and(eq(liteapiBookings.id, pre.id), eq(liteapiBookings.status, "booking")));
    return failed ? { state: "failed", bookingId: pre.id } : { state: "pending", bookingId: pre.id };
  }

  await db.transaction(async (tx) => {
    await lockTripRow(tx, input.tripId);
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
      // d-3b: the hotel's code rides the item's existing `confirmation_number`, so the slip's ONE booking line
      // (`slipItemBookingLine`) reads "booked · #<code>" with no plan-card change (ruling 4).
      .set({ routingStatus: "purchased", ...(facts.hotelConfirmationCode ? { confirmationNumber: facts.hotelConfirmationCode } : {}), updatedAt: new Date() } as any)
      .where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId), sql`routing_status <> 'purchased'`));
    await tx.insert(emailOutbox).values(
      voucherRow({ toEmail: holder.email || null, bookingId: pre.id, hotelName: stay.hotelName, code: facts.hotelConfirmationCode, checkin: String(pre.checkin), checkout: String(pre.checkout), adults: pre.adults }) as any,
    );
  });
  return { state: "confirmed", bookingId: pre.id, hotelConfirmationCode: facts.hotelConfirmationCode };
}

/**
 * Give the item back to the traveler after its LiteAPI booking ended: `purchased → in_planning` (only where no
 * platform booking holds it), and clear the confirmation code THIS booking wrote — never one another rail put
 * there. Inside the caller's transaction, so the row's own status change and the release commit together. The
 * one release rail: `cancelStay` and the admin Resolve (PAY-1) both call it.
 */
export async function releaseLiteapiStayItem(
  tx: Pick<typeof db, "update" | "execute">,
  input: { tripId: string; itemId: string; hotelConfirmationCode: string | null },
): Promise<void> {
  await lockTripRow(tx, input.tripId);
  await tx
    .update(itineraryItems)
    .set({ routingStatus: "in_planning", updatedAt: new Date() } as any)
    .where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId), sql`routing_status = 'purchased'`, sql`booking_id IS NULL`));
  if (input.hotelConfirmationCode) {
    await tx
      .update(itineraryItems)
      .set({ confirmationNumber: null, updatedAt: new Date() } as any)
      .where(and(eq(itineraryItems.id, input.itemId), eq(itineraryItems.tripId, input.tripId), eq(itineraryItems.confirmationNumber, input.hotelConfirmationCode)));
  }
}

/**
 * Cancel the item's confirmed booking. Any refund is Nuitée's: no refund row, no money moved here.
 *
 * CONSENT FIRST (decision-maker, Oct 15, 2026 — ledger `2026-10-15-liteapi-cancel-with-charges`): when the policy
 * the prebook stored says cancelling now costs money (non-refundable, or past the free-cancel deadline), the cancel
 * is answered `charges_apply` with the terms and NO LiteAPI call, unless the traveler sent `acknowledgeCharges`.
 * LiteAPI ends the booking on `CANCELLED` and on `CANCELLED_WITH_CHARGES`; both are a cancellation here, the
 * second with its reported charge stored on the row. Any other status is a refusal.
 */
export async function cancelStay(
  input: { tripId: string; itemId: string; userId: string | null | undefined; acknowledgeCharges?: boolean },
  deps: StayBookingDeps = defaultStayBookingDeps,
): Promise<CancelResult> {
  if (!(await ownerOf(input.tripId, input.userId))) return { state: "not_found" };
  const cfg = deps.config();
  if (!liteapiBookingEnabled(cfg)) return { state: "booking_unavailable" };
  const [row] = await db
    .select()
    .from(liteapiBookings)
    .where(and(eq(liteapiBookings.tripId, input.tripId), eq(liteapiBookings.itineraryItemId, input.itemId), eq(liteapiBookings.status, "confirmed"), eq(liteapiBookings.env, cfg.env)))
    .limit(1);
  if (!row?.liteapiBookingId) return { state: "not_confirmed" };
  const terms = cancelChargeTerms(row.cancellationPolicy, Date.now());
  if (terms.chargesApply && input.acknowledgeCharges !== true) {
    return { state: "charges_apply", bookingId: row.id, policy: terms.policy, deadline: terms.deadline, amount: terms.amount, currency: terms.currency };
  }
  const [claimed] = await db
    .update(liteapiBookings)
    .set({ status: "cancelling", cancellingAt: new Date(), updatedAt: new Date() })
    .where(and(eq(liteapiBookings.id, row.id), eq(liteapiBookings.status, "confirmed")))
    .returning({ id: liteapiBookings.id });
  if (!claimed) return { state: "not_confirmed" };
  // Only a 200 carrying CANCELLED or CANCELLED_WITH_CHARGES ends the booking here. Every other answer — any other
  // status code (204 "not found", 304, 401, any 4xx/5xx), no readable answer, or any other status word — goes to
  // review with the reason, never back to `confirmed` (ledger `2026-10-15-liteapi-cancel-with-charges`, widening
  // `2026-10-15-liteapi-cancel-needs-review`). The item stays held and `purchased` until a person resolves it.
  const toReview = async (reason: string, liteapiStatus: string | null): Promise<CancelResult> => {
    const why = reason.slice(0, 300);
    console.warn(`[liteapi-booking] cancel ${row.id}: refused — ${why}`);
    const [moved] = await db
      .update(liteapiBookings)
      .set({ status: LITEAPI_NEEDS_REVIEW, failureReason: why, ...(liteapiStatus ? { lastSyncStatus: liteapiStatus } : {}), updatedAt: new Date() })
      .where(and(eq(liteapiBookings.id, row.id), eq(liteapiBookings.status, "cancelling")))
      .returning({ id: liteapiBookings.id });
    return moved ? { state: "needs_review", bookingId: row.id } : { state: "pending", bookingId: row.id };
  };
  let status: string | null;
  let amounts: LiteapiCancelAmounts;
  try {
    const body = await deps.client(cfg).cancelBooking(row.liteapiBookingId);
    status = bookingStatusOf(body);
    amounts = cancelAmountsOf(body);
  } catch (err: any) {
    const reason = err instanceof LiteapiError ? `${err.status} ${String(err.message)}` : `no readable answer (${String(err?.message ?? err)})`;
    return toReview(reason, null);
  }
  if (!isLiteapiCancelled(status)) return toReview(cancelRefusalReason(status, row.cancellationPolicy), status);
  // Both words end the booking; the money is whatever `refund_amount` says, never the word (the spec's own example is
  // `CANCELLED` with a fee). The three figures are stored exactly as returned; no refund is computed here — traveler
  // refund maths is a pending founder call.
  const unverified = refundUnverifiedReason(amounts, row.currency);
  let cancelled = false;
  await db.transaction(async (tx) => {
    await lockTripRow(tx, input.tripId);
    const [done] = await tx
      .update(liteapiBookings)
      .set({ status: "cancelled", cancelledAt: new Date(), lastSyncStatus: status, cancelAmounts: amounts as any, updatedAt: new Date() })
      .where(and(eq(liteapiBookings.id, row.id), eq(liteapiBookings.status, "cancelling")))
      .returning({ id: liteapiBookings.id });
    if (!done) return;
    cancelled = true;
    // The stay is the traveler's to change again.
    await releaseLiteapiStayItem(tx, { tripId: input.tripId, itemId: input.itemId, hotelConfirmationCode: row.hotelConfirmationCode });
  });
  console.info(`[liteapi-booking] cancel ${row.id}: LiteAPI answered ${status} — cancelled; amounts ${JSON.stringify(amounts)}`);
  if (cancelled && unverified) {
    // The stay stays cancelled (never re-marked for review); the money is handed to a person through the
    // reconciliation queue. An ancillary write never fails the cancel that authorized it (§15b).
    await openRefundUnverifiedException(row, unverified, status!, amounts).catch((err) =>
      console.error(`[liteapi-booking] cancel ${row.id}: could not open the ${unverified} exception: ${err?.message ?? err}`),
    );
  }
  return { state: "cancelled", bookingId: row.id, liteapiStatus: status! };
}

/**
 * One `reconciliation_exceptions` row (kind `liteapi_refund_unverified`, rail `liteapi`) for a cancelled stay whose
 * refund LiteAPI did not state, or stated in another currency. Exceptions hang off a run, so the cancel writes its
 * own one-row run (`triggered_by = 'liteapi_cancel'`, completed). Append-only and deduped on the booking row (§17).
 */
async function openRefundUnverifiedException(
  row: { id: string; liteapiBookingId: string | null; amountCents: number; currency: string },
  reason: "refund_amount_missing" | "currency_mismatch",
  liteapiStatus: string,
  amounts: LiteapiCancelAmounts,
): Promise<void> {
  const refund = Number(amounts.refund_amount);
  const actual = amounts.refund_amount !== undefined && amounts.refund_amount !== null && Number.isFinite(refund) ? refund.toFixed(2) : null;
  await db.transaction(async (tx) => {
    const runId = crypto.randomUUID();
    await tx.execute(sql`INSERT INTO reconciliation_runs (id, triggered_by, status, finished_at) VALUES (${runId}, 'liteapi_cancel', 'completed', now())`);
    await tx.execute(sql`
      INSERT INTO reconciliation_exceptions (id, run_id, rail, kind, severity, dedupe_key, booking_id, expected_amount, actual_amount, currency, details)
      VALUES (${crypto.randomUUID()}, ${runId}, 'liteapi', 'liteapi_refund_unverified', 'warning', ${`liteapi_refund_unverified:${row.id}`}, ${row.id},
              ${(row.amountCents / 100).toFixed(2)}, ${actual}, ${row.currency},
              ${JSON.stringify({ reason, liteapiStatus, liteapiBookingId: row.liteapiBookingId, chargedCurrency: row.currency, ...amounts })}::jsonb)
      ON CONFLICT (dedupe_key) DO NOTHING`);
  });
}

/** The owner's read of the item's latest booking — status, code, price as booked. Nothing secret. */
export async function stayBookingView(input: { tripId: string; itemId: string; userId: string | null | undefined }, deps: Pick<StayBookingDeps, "config"> = defaultStayBookingDeps) {
  if (!(await ownerOf(input.tripId, input.userId))) return null;
  // d-3b: whether "Book" draws — booking is on (sandbox only) AND the item resolves to a chosen LiteAPI stay.
  const bookable = liteapiBookingEnabled(deps.config()) && (await resolveChosenLiteapiStay(input.tripId, input.itemId)) !== null;
  const [row] = await db
    .select()
    .from(liteapiBookings)
    .where(and(eq(liteapiBookings.tripId, input.tripId), eq(liteapiBookings.itineraryItemId, input.itemId)))
    .orderBy(desc(liteapiBookings.createdAt))
    .limit(1);
  if (!row) return { bookable, booking: null };
  return {
    bookable,
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
