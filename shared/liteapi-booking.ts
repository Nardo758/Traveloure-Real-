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

export const LITEAPI_BOOKING_STATUSES = ["prebooked", "booking", "confirmed", "failed", "cancelling", "cancelled", "needs_review"] as const;
export type LiteapiBookingStatus = (typeof LITEAPI_BOOKING_STATUSES)[number];
/** A live booking holds the item: at most one per item (the partial UNIQUE in migration 371). */
export const LITEAPI_LIVE_STATUSES: readonly LiteapiBookingStatus[] = ["booking", "confirmed", "cancelling"];
/**
 * A cancel LiteAPI refused with a definite 4xx: whether the hotel booking still stands is unknown, so the row is
 * never put back to `confirmed` (decision-maker, Oct 15, 2026 — ledger `2026-10-15-liteapi-cancel-needs-review`).
 * It keeps holding the item: no new prebook or book while one exists. Only a person moves a row out of it.
 */
export const LITEAPI_NEEDS_REVIEW = "needs_review" as const;
/** Every status that holds the item against a second booking: the live set plus `needs_review`. */
export const LITEAPI_ITEM_HOLDING_STATUSES: readonly LiteapiBookingStatus[] = [...LITEAPI_LIVE_STATUSES, LITEAPI_NEEDS_REVIEW];

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
 * Pure: a `/rates/prebook` answer (`usePaymentSdk: true`) → what is stored and what the SDK needs.
 *
 * THE FLOOR IS THE PREBOOK'S OWN SSP (S1-d-3c, Oct 12, 2026). The sandbox prebook does state
 * `suggestedSellingPrice`, and it can differ from the re-quote's (CI run 38258094086: re-quote 327.31, prebook
 * 284.58 for the same offer). The prebook prices the offer being sold, so its SSP is the floor; the re-quote's
 * SSP, passed in, is the fallback only when the prebook states none. A price below the floor is refused
 * (`below_ssp`); an SSP in another currency cannot be compared honestly and is refused too.
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
  const floor = prebookSspFloor(body, quotedSsp);
  if (floor && (floor.currency !== currency || floor.amount > price)) return { ok: false, reason: "below_ssp" };
  const policy = d?.roomTypes?.[0]?.rates?.[0]?.cancellationPolicies ?? d?.cancellationPolicies ?? null;
  return { ok: true, facts: { prebookId, transactionId, secretKey, amountCents: toCents(price), currency, cancellationPolicy: policy ?? null } };
}

/**
 * The SSP a prebook answer is held to: its own `suggestedSellingPrice` (in the answer's currency) when stated,
 * else the re-quote's. null when neither states one.
 */
export function prebookSspFloor(body: any, quotedSsp: { amount: number; currency: string } | null = null): { amount: number; currency: string } | null {
  const d = body?.data;
  const own = money(d?.suggestedSellingPrice);
  const currency = ccy(d?.currency);
  if (own !== null && own > 0 && currency) return { amount: own, currency };
  return quotedSsp;
}

/**
 * THE ONE RE-PREBOOK (S1-d-3c, Oct 12, 2026): a prebook answered below its floor is re-quoted ONCE at
 * max(our band, floor / net − 1), where net = the prebook's price / (1 + the margin it was quoted at), and prebooked
 * again; a second answer below its floor is refused. Rounded UP to LiteAPI's two decimals, and always above the
 * margin already tried — LiteAPI priced the 15% margin cents under its own SSP in CI (202.27 vs 202.30), so the
 * same margin again would answer the same. Refused by name when the answer states no price or the floor is in
 * another currency.
 */
export function prebookFloorPercent(
  body: any,
  quotedSsp: { amount: number; currency: string } | null,
  marginUsedPercent: number,
  bandFraction: number,
): { ok: true; percent: number } | { ok: false; reason: "no_price" | "no_ssp" | "ssp_currency" } {
  const d = body?.data;
  const price = money(d?.price);
  const currency = ccy(d?.currency);
  if (price === null || price <= 0 || !currency) return { ok: false, reason: "no_price" };
  const floor = prebookSspFloor(body, quotedSsp);
  if (!floor) return { ok: false, reason: "no_ssp" };
  if (floor.currency !== currency) return { ok: false, reason: "ssp_currency" };
  const used = Number.isFinite(marginUsedPercent) && marginUsedPercent > 0 ? marginUsedPercent : 0;
  const band = Number.isFinite(bandFraction) && bandFraction > 0 ? bandFraction : 0;
  const net = price / (1 + used / 100);
  const needed = floor.amount / net - 1;
  let percent = Math.ceil(Math.max(band, needed) * 10_000 - 1e-9) / 100;
  if (percent <= used) percent = Math.round((used + 0.01) * 100) / 100;
  return { ok: true, percent };
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
/**
 * S1-d-3c: the booking a `GET /bookings?clientReference=` answer holds for OUR reference — its LiteAPI id and
 * status — or null. Only an entry that names our reference exactly counts (one per row id); an answer in another
 * shape finds nothing rather than a guess (§13). The list shape is read defensively (`data` an array, or
 * `data.bookings`) and is proven against fakes only until a sandbox answer is recorded.
 */
export function bookingForClientReference(body: any, clientReference: string): { liteapiBookingId: string; status: string | null } | null {
  const list: any[] = Array.isArray(body?.data) ? body.data : Array.isArray(body?.data?.bookings) ? body.data.bookings : [];
  const hit = list.find((b) => str(b?.clientReference) === clientReference && str(b?.bookingId));
  if (!hit) return null;
  return { liteapiBookingId: str(hit.bookingId)!, status: str(hit.status)?.toUpperCase() ?? null };
}

export function bookingStatusOf(body: any): string | null {
  return str(body?.data?.status)?.toUpperCase() ?? null;
}
