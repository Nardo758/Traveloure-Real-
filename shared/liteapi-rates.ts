/**
 * S1-d-2 — LIVE RATES ON THE STAY CARD, the pure rules (ledger `2026-10-10-s1-d2-liteapi-rates`;
 * brief `docs/planning/briefs/s1-d2-liteapi-rates.md`). Read by the rates service (server) and the card
 * (client) — one home for each rule (§18 rule 1). Rates are never stored anywhere.
 *
 *   · THE SSP FLOOR: the price shown publicly is never below LiteAPI's suggested selling price.
 *   · THE OFFER: the cheapest rate (`maxRatesPerHotel: 1`), parsed from LiteAPI's own fields; a field the
 *     answer does not state is OMITTED, never guessed (§13).
 *   · THE DEADLINE LINE: with the plan's zone, the local date-time and its abbreviation; with none,
 *     relative to check-in ("Free cancellation until 2 days before check-in") — never a bare UTC stamp.
 */

/** What the rates route answers. Only `ok` carries a price; every other state draws no number. */
export type StayRatesState =
  | { state: "ok"; offer: StayRateOffer; checkin: string; timezone: string | null }
  | { state: "dates_needed" }
  | { state: "party_needed" }
  | { state: "unavailable" };

export interface StayRateOffer {
  /** The public price, in minor units ×100 of `currency` (the slip's one money formatter reads cents). */
  amountCents: number;
  currency: string;
  /** LiteAPI's own board name ("Room Only", "Breakfast Included"); null when the answer states none. */
  boardName: string | null;
  /** `true` refundable (RFN), `false` non-refundable (NRFN), null when the answer does not say. */
  refundable: boolean | null;
  /** The free-cancellation deadline as LiteAPI states it (an instant, GMT); null when none. */
  cancelDeadline: string | null;
  /** Taxes and fees NOT included in the price, payable at the property (city tax and the like). */
  payAtProperty: Array<{ label: string; amountCents: number; currency: string }>;
  /** The party the price is for. Children are not priced in S1-d-2 (no ages are recorded). */
  adults: number;
  childrenNotPriced: boolean;
}

const toCents = (n: number) => Math.round(n * 100);
/** LiteAPI states `cancelTime` in GMT, often without a zone marker ("2027-05-06 12:00:00"): read it as UTC. */
export function gmtInstant(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let t = raw.trim().replace(" ", "T");
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) t += "Z";
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
const firstMoney = (v: unknown): { amount: number; currency: string } | null => {
  const a = Array.isArray(v) ? v[0] : null;
  const amount = Number(a?.amount);
  const currency = typeof a?.currency === "string" ? a.currency.toUpperCase() : "";
  return Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency) ? { amount, currency } : null;
};

/**
 * The public sell price: the retail total (which carries the request's `margin`) floored at the SSP, in the
 * SAME currency. A missing SSP leaves the retail total as it is; an SSP in another currency is not
 * compared (it cannot be honestly floored) and the offer is refused rather than shown below it.
 */
export function publicSellAmount(retail: { amount: number; currency: string }, ssp: { amount: number; currency: string } | null): number | null {
  if (!ssp) return retail.amount;
  if (ssp.currency !== retail.currency) return null;
  return Math.max(retail.amount, ssp.amount);
}

/** Pure: LiteAPI's `/hotels/rates` body → the cheapest offer, or null when it holds none we can show. */
export function parseCheapestOffer(body: any, party: { adults: number; kids: number }): StayRateOffer | null {
  const rate = body?.data?.[0]?.roomTypes?.[0]?.rates?.[0];
  if (!rate) return null;
  const retail = firstMoney(rate?.retailRate?.total);
  if (!retail) return null;
  const sell = publicSellAmount(retail, firstMoney(rate?.retailRate?.suggestedSellingPrice));
  if (sell === null) return null;
  const tag = rate?.cancellationPolicies?.refundableTag;
  const refundable = tag === "RFN" ? true : tag === "NRFN" ? false : null;
  const deadline = Array.isArray(rate?.cancellationPolicies?.cancelPolicyInfos)
    ? rate.cancellationPolicies.cancelPolicyInfos
        .map((c: any) => gmtInstant(c?.cancelTime))
        .filter((t: string | null): t is string => !!t)
        .sort()[0] ?? null
    : null;
  const payAtProperty = (Array.isArray(rate?.retailRate?.taxesAndFees) ? rate.retailRate.taxesAndFees : [])
    .filter((t: any) => t?.included === false)
    .map((t: any) => {
      const amount = Number(t?.amount);
      const currency = typeof t?.currency === "string" ? t.currency.toUpperCase() : "";
      const label = typeof t?.description === "string" && t.description.trim() ? t.description.trim() : null;
      return Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency) && label ? { label, amountCents: toCents(amount), currency } : null;
    })
    .filter(Boolean) as StayRateOffer["payAtProperty"];
  return {
    amountCents: toCents(sell),
    currency: retail.currency,
    boardName: typeof rate?.boardName === "string" && rate.boardName.trim() ? rate.boardName.trim() : null,
    refundable,
    cancelDeadline: refundable === false ? null : deadline,
    payAtProperty,
    adults: party.adults,
    childrenNotPriced: party.kids > 0,
  };
}

/** Whole days from the deadline's calendar day (UTC, as LiteAPI states it) to the check-in date. */
export function daysBeforeCheckin(deadlineIso: string, checkin: string): number | null {
  const d = Date.parse(deadlineIso);
  const c = Date.parse(`${checkin}T00:00:00Z`);
  if (!Number.isFinite(d) || !Number.isFinite(c)) return null;
  const deadlineDay = Date.UTC(new Date(d).getUTCFullYear(), new Date(d).getUTCMonth(), new Date(d).getUTCDate());
  return Math.round((c - deadlineDay) / 86_400_000);
}

/**
 * The cancellation line the card draws. `local` formats an instant in the plan's zone (date-time plus
 * abbreviation) and is only called when the plan HAS a zone; with none, the line is relative to check-in.
 * null = draw nothing (§13: an unstated policy is not "free cancellation").
 */
export function cancellationLine(
  offer: Pick<StayRateOffer, "refundable" | "cancelDeadline">,
  ctx: { checkin: string; timezone: string | null; local: (iso: string, tz: string) => string | null },
): string | null {
  if (offer.refundable === false) return "Non-refundable";
  if (offer.refundable !== true || !offer.cancelDeadline) return null;
  if (ctx.timezone) {
    const at = ctx.local(offer.cancelDeadline, ctx.timezone);
    if (at) return `Free cancellation until ${at}`;
  }
  const days = daysBeforeCheckin(offer.cancelDeadline, ctx.checkin);
  if (days === null || days < 0) return null;
  if (days === 0) return "Free cancellation until the day of check-in";
  return `Free cancellation until ${days} day${days === 1 ? "" : "s"} before check-in`;
}
