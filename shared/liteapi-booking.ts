/**
 * S1-d-3a — BOOKING A LITEAPI STAY, the pure rules (decision-maker S1-d-3 rulings, Oct 10, 2026; ledger
 * `2026-10-10-s1-d3a-liteapi-booking`; brief docs/planning/briefs/s1-d3-liteapi-booking.md). Every rule the
 * service, the sync, the check script and the tests read is stated here ONCE (§18 rule 1). No db, no clock.
 *
 *   · NUITÉE IS MERCHANT OF RECORD: the Payment SDK takes the card, so the ONLY payment method this platform
 *     ever sends to `/rates/book` is `TRANSACTION_ID` (guarded by scripts/check-liteapi-payment-method.cjs).
 *   · THE OFFER ID COMES FROM A SERVER RE-QUOTE, never the browser (§14) — `offerIdFromRates`.
 *   · THE PRICE SHOWN BEFORE THE SDK OPENS IS THE PREBOOK'S, and a prebook below LiteAPI's suggested selling
 *     price is refused, never shown (the d-2 SSP floor, kept at the moment of sale).
 *   · A field LiteAPI's answer does not state is NULL, never guessed (§13).
 */

/** The one payment method ever sent to LiteAPI's book call. */
export const LITEAPI_PAYMENT_METHOD = "TRANSACTION_ID" as const;

export const LITEAPI_BOOKING_STATUSES = ["prebooked", "booking", "confirmed", "failed", "cancelling", "cancelled"] as const;
export type LiteapiBookingStatus = (typeof LITEAPI_BOOKING_STATUSES)[number];
/** A live booking holds the item: at most one per item (the partial UNIQUE in migration 371). */
export const LITEAPI_LIVE_STATUSES: readonly LiteapiBookingStatus[] = ["booking", "confirmed", "cancelling"];

const toCents = (n: number) => Math.round(n * 100);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const money = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const ccy = (v: unknown): string | null => {
  const c = str(v)?.toUpperCase() ?? null;
  return c && /^[A-Z]{3}$/.test(c) ? c : null;
};

/** The cheapest offer's id from a `/hotels/rates` answer (`maxRatesPerHotel: 1`), or null. */
export function offerIdFromRates(body: any): string | null {
  return str(body?.data?.[0]?.roomTypes?.[0]?.offerId);
}

export interface PrebookFacts {
  prebookId: string;
  transactionId: string;
  /** Handed to the Payment SDK on the owner's page only; never stored. */
  secretKey: string;
  amountCents: number;
  currency: string;
  cancellationPolicy: unknown | null;
}

export type PrebookParse = { ok: true; facts: PrebookFacts } | { ok: false; reason: "no_prebook" | "no_payment_sdk" | "no_price" | "below_ssp" };

/**
 * Pure: a `/rates/prebook` answer (`usePaymentSdk: true`) → what is stored and what the SDK needs. A price
 * below LiteAPI's suggested selling price in the same currency is refused (`below_ssp`); an SSP in another
 * currency cannot be compared honestly and is refused too.
 */
export function parsePrebook(body: any): PrebookParse {
  const d = body?.data;
  const prebookId = str(d?.prebookId);
  if (!prebookId) return { ok: false, reason: "no_prebook" };
  const transactionId = str(d?.transactionId);
  const secretKey = str(d?.secretKey);
  if (!transactionId || !secretKey) return { ok: false, reason: "no_payment_sdk" };
  const price = money(d?.price);
  const currency = ccy(d?.currency);
  if (price === null || price <= 0 || !currency) return { ok: false, reason: "no_price" };
  const ssp = money(d?.suggestedSellingPrice);
  if (ssp !== null && ssp > price) return { ok: false, reason: "below_ssp" };
  const policy = d?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies ?? d?.cancellationPolicies ?? null;
  return { ok: true, facts: { prebookId, transactionId, secretKey, amountCents: toCents(price), currency, cancellationPolicy: policy ?? null } };
}

export interface BookFacts {
  liteapiBookingId: string;
  status: string;
  hotelConfirmationCode: string | null;
  commissionCents: number | null;
  processingFeeCents: number | null;
}

/** Pure: a `/rates/book` answer → the booking's facts, or null when it names no booking. */
export function parseBook(body: any): BookFacts | null {
  const d = body?.data;
  const id = str(d?.bookingId);
  if (!id) return null;
  const commission = money(d?.clientCommission);
  const fee = money(d?.processingFee);
  return {
    liteapiBookingId: id,
    status: (str(d?.status) ?? "").toUpperCase(),
    hotelConfirmationCode: str(d?.hotelConfirmationCode),
    commissionCents: commission === null ? null : toCents(commission),
    processingFeeCents: fee === null ? null : toCents(fee),
  };
}

/** A book answer counts as confirmed only when LiteAPI says CONFIRMED. */
export function bookIsConfirmed(f: BookFacts): boolean {
  return f.status === "CONFIRMED";
}

/** Pure: a cancel (or booking read) answer's status, upper-cased; null when it states none. */
export function bookingStatusOf(body: any): string | null {
  return str(body?.data?.status)?.toUpperCase() ?? null;
}

/** The item row's booking line once confirmed (S1-d-3 ruling 3). No code ⇒ no line (§13). */
export function liteapiBookedLine(code: string | null | undefined): string | null {
  return str(code) ? `Booked · ${str(code)}` : null;
}
