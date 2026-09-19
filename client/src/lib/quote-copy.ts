/**
 * QUOTE SURFACE COPY — the ONE place a `service_quotes` row becomes words, for BOTH audiences.
 *
 * Ledger `2026-09-17-surfaces-quotes-settlement`; the rulings are Locked Decision 49 (a custom
 * quote is a row with an expiry, never a price on the listing) and §13/§14.
 *
 * WHY ONE MODULE (§18 rule 1). Two surfaces read the same rows — the traveler's quote list on
 * `/my-bookings` and the seller's quote queue on their Catalog — and both must say the same thing
 * about the same row. A second status→label table beside this one is the derivation-drift class
 * §18 rule 1 names: the day `withdrawn` gains a sentence, one surface keeps the old one.
 *
 * WHAT IT REFUSES TO AUTHOR:
 *  · THE LIFECYCLE. `expired` is DERIVED by `quoteLifecycle` in `shared/service-quotes.ts` and is
 *    never re-derived here — this module is handed the server's `lifecycle` field and words it.
 *    A client that recomputed "expired" from its own clock would be a second authority on the one
 *    fact the accept claim enforces in its WHERE clause.
 *  · ANY NUMBER. No validity day count, no amount, no fee, no rate (§8/§14). The amount is the
 *    server's `amount` string off the row; the window is the server's `expiresAt`; the ceiling a
 *    seller may choose is whatever the server refuses above, quoted back from its own refusal.
 *  · ANY ABSENT FACT (§13). `amountCents` NULL = NOT YET QUOTED and is never rendered as $0.00;
 *    `expiresAt` NULL on a `requested` row = no offer exists yet, never "no deadline".
 *
 * Run: npx tsx --test client/src/lib/__tests__/quote-copy.test.ts
 */
import type { ServiceQuoteLifecycle } from "@shared/service-quotes";

/** What a card draws: the server's own projection (`ServiceQuoteView`), nothing added. */
export interface QuoteCardRow {
  id: string;
  serviceId: string;
  serviceName?: string;
  status: string;
  lifecycle: ServiceQuoteLifecycle | string;
  /** Integer cents. ABSENT = not yet quoted (§13) — never rendered as zero. */
  amountCents?: number;
  /** The `decimal(10,2)` string the server derived from the cents. */
  amount?: string;
  currency?: string;
  requestNote?: string;
  note?: string;
  quotedAt?: string;
  expiresAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  withdrawnAt?: string;
  supersededBy?: string;
  bookingId?: string;
  createdAt?: string;
}

export type QuoteTone = "waiting" | "live" | "done" | "dead";

export interface QuoteStateCopy {
  /** The badge word. Two words at most; never "score", never a verb the row did not do. */
  label: string;
  tone: QuoteTone;
  /** The traveler's sentence for this state. */
  traveler: string;
  /** The seller's sentence for the SAME row — a different person, a different fact to state. */
  seller: string;
}

/**
 * The six stored statuses plus the ONE derived state. A value outside this set is UNRESOLVED, not
 * "quoted": a reader that guesses forward is how an unknown status starts looking acceptable.
 */
const QUOTE_STATE_COPY: Record<string, QuoteStateCopy> = {
  requested: {
    label: "Requested",
    tone: "waiting",
    traveler: "You asked for a price. Nothing is booked or charged — the provider answers with an amount and how long it stands.",
    seller: "A traveler asked for a price on this listing. Issue an amount and the window it stands for.",
  },
  quoted: {
    label: "Quoted",
    tone: "live",
    traveler: "This offer stands until the date shown. Accepting creates your booking at this amount.",
    seller: "Your offer stands until the date shown. You can withdraw it until the traveler accepts.",
  },
  expired: {
    label: "Expired",
    tone: "dead",
    traveler: "This offer has passed its date and can no longer be accepted. Ask the provider for a new one.",
    seller: "This offer passed its date without an answer. A new price is a NEW quote — this row is never edited.",
  },
  accepted: {
    label: "Accepted",
    tone: "done",
    traveler: "You accepted this offer and a booking was created at this amount.",
    seller: "The traveler accepted. A booking was created at the amount you quoted.",
  },
  declined: {
    label: "Declined",
    tone: "dead",
    traveler: "You said no to this offer.",
    seller: "The traveler said no to this offer.",
  },
  withdrawn: {
    label: "Withdrawn",
    tone: "dead",
    traveler: "The provider took this offer back.",
    seller: "You took this offer back.",
  },
  superseded: {
    label: "Replaced",
    tone: "dead",
    traveler: "A newer quote replaced this one.",
    seller: "You replaced this one with a newer quote.",
  },
};

/**
 * §13 — an unknown lifecycle is said out loud as unrecognised rather than mapped to a neighbour.
 * The status vocabulary has no DB CHECK (the publish-trap posture), so a value this build does not
 * know is a real possibility and must not render as one it does.
 */
export function quoteStateCopy(lifecycle: string | null | undefined): QuoteStateCopy {
  const known = lifecycle ? QUOTE_STATE_COPY[lifecycle] : undefined;
  if (known) return known;
  const raw = (lifecycle ?? "").trim();
  return {
    label: raw.length > 0 ? raw.replace(/_/g, " ") : "Unrecognised",
    tone: "waiting",
    traveler: "This quote is in a state this page does not recognise. Nothing is assumed about it.",
    seller: "This quote is in a state this page does not recognise. Nothing is assumed about it.",
  };
}

/**
 * Whether the ACCEPT button may draw. A mirror of the server's own claim, read off the projection
 * — the server's WHERE clause is still the guard (§15): this only decides whether to offer.
 */
export function quoteIsAcceptable(row: QuoteCardRow): boolean {
  return row.lifecycle === "quoted" && !row.acceptedAt && !row.supersededBy && row.amountCents !== undefined;
}

/** Whether the seller's WITHDRAW may draw. `requested` has no offer to take back. */
export function quoteIsWithdrawable(row: QuoteCardRow): boolean {
  return row.lifecycle === "quoted";
}

/** Whether the seller's ISSUE may draw — a first offer, or a re-quote of a dead one. */
export function quoteIsIssuable(row: QuoteCardRow): boolean {
  return row.lifecycle === "requested" || row.lifecycle === "expired";
}

/**
 * §13 — the AMOUNT LINE. An absent `amount` is NOT YET QUOTED and says so; it is never "$0.00",
 * which is a price the provider never named. The currency is the row's own; absent, none is added.
 */
export function quoteAmountLine(row: QuoteCardRow): string {
  if (row.amount === undefined || row.amountCents === undefined) return "No amount yet";
  return row.currency ? `${row.amount} ${row.currency}` : row.amount;
}

/**
 * §13 — the VALIDITY LINE, from the SERVER's `expiresAt` and nothing else. No 7, no 30 and no
 * arithmetic: a client that computed the window from a day count would be a second authority on
 * the deadline the accept claim enforces. An absent expiry on a row with no offer is stated as
 * "no offer yet", never as "no deadline".
 */
export function quoteValidityLine(row: QuoteCardRow, formatDate: (iso: string) => string): string | null {
  if (!row.expiresAt) {
    return row.lifecycle === "requested" ? "No offer yet, so no date to stand until." : null;
  }
  if (row.lifecycle === "expired") return `Expired ${formatDate(row.expiresAt)}`;
  if (row.lifecycle === "quoted") return `Stands until ${formatDate(row.expiresAt)}`;
  return `Offer window ended ${formatDate(row.expiresAt)}`;
}

/**
 * THE TRAVELER SERVICE FEE, read from the SERVER's own numbers (ledger
 * `2026-09-19-quote-born-traveler-fee`, decision-maker ruling): a quote-born booking carries the
 * SAME ruled fee (§8/§14) as every other service booking, resolved by
 * `resolveTravelerServiceFeeSnapshot` and echoed on the `POST /api/checkout` response's
 * `travelerServiceFee` / `coveredByTripPass` fields. No 7%, no $25 — both live in `fee_bands` and
 * this module knows neither; it only words the figures the server already sent.
 */
export interface QuoteTravelerServiceFee {
  /** What rides the Stripe total. 0 when waived. */
  charged: number;
  /** The band-priced amount, resolved UNCONDITIONALLY — the real figure even on a waived line. */
  wouldHaveBeen: number;
  waived: boolean;
  waiverBasis: "rails" | "trip_pass" | null;
}

/**
 * §13: a `pay` response the panel has not yet received carries NO fee figures, and this renders
 * NOTHING — never a guessed "$0.00 fee", which is a different fact from "not yet known". A charge
 * that genuinely resolved to $0 (a $0-fee band, if one ever exists) also renders nothing: there is
 * nothing to disclose on top of the quoted amount.
 */
export function quoteTravelerFeeLine(fee: QuoteTravelerServiceFee | null | undefined): string | null {
  if (!fee) return null;
  if (fee.waived) {
    return fee.wouldHaveBeen > 0
      ? `Your Trip Pass covers the traveler service fee (${fee.wouldHaveBeen.toFixed(2)}) — nothing added.`
      : null;
  }
  if (fee.charged <= 0) return null;
  return `Plus a ${fee.charged.toFixed(2)} traveler service fee, charged with this payment.`;
}

/**
 * THE CHARGE IS BUILT, AND THE SURFACE HANDS OFF TO IT (ledger `2026-09-18-quote-born-charge`).
 *
 * LD 49: "The quote-born booking is born UNPAID; the charge through `/api/checkout` is its own
 * lane." That lane has landed: `POST /api/checkout` takes `{ quoteBookingId }` on a second arm
 * and drives the SAME §15 claim → authorize → promote spine the cart does, so the accepted quote
 * now has a real Pay control instead of a sentence explaining why it has none.
 *
 * §13 — THE SENTENCE STILL SAYS THE ROW IS UNPAID, because it is: this note sits beside the Pay
 * control on a booking that has not been charged, and it must never read as a receipt. What
 * changed is only the second half — from "payment is not available" (which stopped being true)
 * to where the traveler pays. The amount itself is NOT restated here: it is the server's answer
 * and is read off the minted row by `quoteDepositLine`.
 */
export const QUOTE_CHECKOUT_UNAVAILABLE_NOTE =
  "Your booking is recorded at this amount and is not paid yet. Pay for it here when you are ready — your card is charged only when you complete the payment.";

/** The Pay control's own label. One spelling, so the card and any later surface agree (§18 rule 1). */
export const QUOTE_PAY_ACTION_LABEL = "Pay for this booking";

/**
 * The server's refusal, worded from its OWN code (§13 — a refusal names WHICH fact refused it, and
 * this module invents none of them). `quote_expired` is the one that carries an expiry; the rest
 * are handed back as the server's sentence.
 */
export interface QuoteChargeRefusal {
  code?: string;
  message?: string;
  expiresAt?: string;
}

export function quoteChargeRefusalLine(
  refusal: QuoteChargeRefusal | null | undefined,
  formatDate: (iso: string) => string,
): string | null {
  if (!refusal) return null;
  if (refusal.code === "quote_expired" && refusal.expiresAt) {
    return `This quote expired ${formatDate(refusal.expiresAt)} and is not repriced. Ask the provider for a new one — nothing was charged.`;
  }
  if (refusal.code === "quote_charge_in_progress") {
    return "A payment for this booking has already been started. Reload the page and complete that one — nothing was charged twice.";
  }
  return refusal.message ?? null;
}

/**
 * WHAT THE SERVER ANSWERED ABOUT DEPOSIT vs FULL (LD 49 D-31). The accept rail resolves the
 * listing's deposit plan through the ONE `resolveDepositPlan` and writes the split onto the minted
 * `service_bookings` row. This reads THAT ROW — it re-derives nothing and knows no percentage.
 *
 * §13: a booking this page has not loaded is NOT "no deposit" — it is no answer, and returns null
 * so the line is OMITTED rather than claiming the full amount is due.
 */
export interface MintedBookingDepositRow {
  depositAmount?: string | null;
  balanceAmount?: string | null;
  totalAmount?: string | null;
}

export function quoteDepositLine(booking: MintedBookingDepositRow | null | undefined): string | null {
  if (!booking) return null;
  const deposit = booking.depositAmount ?? null;
  const balance = booking.balanceAmount ?? null;
  if (deposit === null || balance === null) {
    // The row carries no split: the listing takes the full amount. That IS the server's answer.
    return booking.totalAmount ? `Payable in full: ${booking.totalAmount}` : null;
  }
  return `Deposit ${deposit} now, ${balance} as the balance — the split your provider's listing sets.`;
}

/**
 * The seller's VALIDITY refusal, worded from the server's OWN numbers. D-29 refuses a choice above
 * the platform ceiling WITH the ceiling stated and never silently clamps, so the surface repeats
 * the server's figures rather than knowing a ceiling of its own.
 */
export interface QuoteValidityRefusal {
  code?: string;
  message?: string;
  ceilingDays?: number;
  requestedDays?: number;
}

export function quoteIssueRefusalLine(refusal: QuoteValidityRefusal | null | undefined): string | null {
  if (!refusal) return null;
  if (refusal.code === "validity_exceeds_ceiling" && typeof refusal.ceilingDays === "number") {
    const asked = typeof refusal.requestedDays === "number" ? `${refusal.requestedDays} days` : "that window";
    return `A quote may stand for at most ${refusal.ceilingDays} days; you asked for ${asked}. Nothing was issued — choose a shorter window.`;
  }
  return refusal.message ?? null;
}
