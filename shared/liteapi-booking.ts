/**
 * S1-d-3a — BOOKING A LITEAPI STAY, the pure rules (decision-maker S1-d-3 rulings, Oct 10, 2026; ledger
 * `2026-10-10-s1-d3a-liteapi-booking`; brief docs/planning/briefs/s1-d3-liteapi-booking.md). Every rule the
 * service, the sync, the check script and the tests read is stated here ONCE (§18 rule 1). No db, no clock.
 *
 *   · NUITÉE IS MERCHANT OF RECORD: the Payment SDK takes the card, so the ONLY payment method this platform
 *     ever sends to `/rates/book` is `TRANSACTION_ID` (guarded by scripts/check-liteapi-payment-method.cjs).
 *   · THE OFFER ID COMES FROM A SERVER RE-QUOTE, never the browser (§14) — `offerIdFromRates`.
 *   · THE PRICE SHOWN BEFORE THE SDK OPENS IS THE PREBOOK'S, and it is never below LiteAPI's suggested selling
 *     price nor below our band: the margin sent on the offer's rates request is `bookingMarginFraction`
 *     (decision-maker, Oct 11, 2026 — the d-2 display floor, kept at the moment of sale). Refused only when the
 *     re-quote states no SSP or states it in another currency.
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

/**
 * The suggested selling price from the re-quote's cheapest room type (verified against sandbox 2026-10-09,
 * founder run: `roomTypes[].suggestedSellingPrice`), read as `{ amount, currency }` or an array of them;
 * the d-2 rate-level `retailRate.suggestedSellingPrice` is the fallback. null when unstated.
 */
export function sspFromRates(body: any): { amount: number; currency: string } | null {
  const rt = body?.data?.[0]?.roomTypes?.[0];
  for (const v of [rt?.suggestedSellingPrice, rt?.rates?.[0]?.retailRate?.suggestedSellingPrice]) {
    const one = Array.isArray(v) ? v[0] : v;
    const amount = money(one?.amount);
    const currency = ccy(one?.currency);
    if (amount !== null && amount > 0 && currency) return { amount, currency };
  }
  return null;
}

/** A money field read as `{ amount, currency }` or the first of an array of them; null when unstated. */
function moneyOf(v: unknown): { amount: number; currency: string } | null {
  const one: any = Array.isArray(v) ? v[0] : v;
  const amount = money(one?.amount);
  const currency = ccy(one?.currency);
  return amount !== null && amount > 0 && currency ? { amount, currency } : null;
}

/**
 * The re-quote's retail price for the cheapest room type — `offerRetailRate`, else the rate's `retailRate.total`
 * (the same order `bookingMarginFraction` reads). null when unstated (§13).
 */
export function quoteRetail(body: any): { amount: number; currency: string } | null {
  const rt = body?.data?.[0]?.roomTypes?.[0];
  return moneyOf(rt?.offerRetailRate) ?? moneyOf(rt?.rates?.[0]?.retailRate?.total);
}

/**
 * S1-d-3c diagnostic: the facts compared at prebook, as one log line. Reads the re-quote that produced the offer
 * and the raw prebook answer; computes nothing that is acted on.
 */
export function prebookDiagnostic(quoteBody: any, prebookBody: any, marginPercent: number): string {
  const r = quoteRetail(quoteBody);
  const q = sspFromRates(quoteBody);
  const d = prebookBody?.data;
  const p = money(d?.price);
  const ps = money(d?.suggestedSellingPrice);
  const f = (v: number | null | undefined) => (v === null || v === undefined ? "none" : String(v));
  return `requote retail=${f(r?.amount)} ${r?.currency ?? ""} requote ssp=${f(q?.amount)} ${q?.currency ?? ""} prebook price=${f(p)} prebook ssp=${f(ps)} currency=${ccy(d?.currency) ?? "none"} margin=${marginPercent}%`;
}

export type BookingMargin =
  | { ok: true; fraction: number; percent: number; ssp: { amount: number; currency: string } }
  | { ok: false; reason: "no_ssp" | "ssp_currency" | "no_price" };

/**
 * THE MARGIN SENT FOR A BOOKING (decision-maker, Oct 11, 2026): max(our band, SSP / net − 1), computed from the
 * re-quote's own answer, so the booked price is never below the SSP and never below our band — the same floor
 * d-2 applies on display. LiteAPI takes the margin on the RATES request and prices the offer id that request
 * returns; the prebook only takes that offer id. So when this exceeds the band, the service re-quotes once at
 * this margin and prebooks THAT answer's offer.
 *
 *   · retail = the room type's `offerRetailRate` (verified sandbox 2026-10-09), else the rate's `retailRate.total`;
 *   · net    = retail − LiteAPI's stated `commission` (our margin amount) in the same currency; where none is
 *              stated, retail / (1 + band) — the margin the request carried;
 *   · percent is rounded UP to LiteAPI's two decimals, so rounding never lands the price under the SSP.
 * Refused, by name, only when the SSP is unstated (`no_ssp`) or in another currency (`ssp_currency`); a re-quote
 * with no readable price is `no_price`.
 */
export function bookingMarginFraction(body: any, bandFraction: number): BookingMargin {
  const band = Number.isFinite(bandFraction) && bandFraction > 0 ? bandFraction : 0;
  const ssp = sspFromRates(body);
  if (!ssp) return { ok: false, reason: "no_ssp" };
  const rt = body?.data?.[0]?.roomTypes?.[0];
  const rate = rt?.rates?.[0];
  const retail = moneyOf(rt?.offerRetailRate) ?? moneyOf(rate?.retailRate?.total);
  if (!retail) return { ok: false, reason: "no_price" };
  if (ssp.currency !== retail.currency) return { ok: false, reason: "ssp_currency" };
  const commission = moneyOf(rt?.commission) ?? moneyOf(rate?.commission);
  const net = commission && commission.currency === retail.currency && commission.amount < retail.amount ? retail.amount - commission.amount : retail.amount / (1 + band);
  const needed = net > 0 ? ssp.amount / net - 1 : band;
  const fraction = Math.max(band, needed);
  const percent = Math.ceil(fraction * 10_000 - 1e-9) / 100;
  return { ok: true, fraction: percent / 100, percent, ssp };
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
 * Pure: a `/rates/prebook` answer (`usePaymentSdk: true`) → what is stored and what the SDK needs. The prebook
 * answer states no SSP (founder sandbox run, 2026-10-09), so the floor is the RE-QUOTE's SSP, passed in; a
 * prebook-level `suggestedSellingPrice` is honoured too if LiteAPI ever states one. A price below the SSP is
 * refused (`below_ssp`); an SSP in another currency cannot be compared honestly and is refused too.
 */
export function parsePrebook(body: any, quotedSsp: { amount: number; currency: string } | null = null): PrebookParse {
  const d = body?.data;
  const prebookId = str(d?.prebookId);
  if (!prebookId) return { ok: false, reason: "no_prebook" };
  const transactionId = str(d?.transactionId);
  const secretKey = str(d?.secretKey);
  if (!transactionId || !secretKey) return { ok: false, reason: "no_payment_sdk" };
  const price = money(d?.price);
  const currency = ccy(d?.currency);
  if (price === null || price <= 0 || !currency) return { ok: false, reason: "no_price" };
  const prebookSsp = money(d?.suggestedSellingPrice);
  if (prebookSsp !== null && prebookSsp > price) return { ok: false, reason: "below_ssp" };
  if (quotedSsp && (quotedSsp.currency !== currency || quotedSsp.amount > price)) return { ok: false, reason: "below_ssp" };
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
