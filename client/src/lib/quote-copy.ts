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
 * THE CHARGE IS NOT BUILT, AND THE SURFACE SAYS SO (§13).
 *
 * LD 49: "The quote-born booking is born UNPAID; the charge through `/api/checkout` is its own
 * lane." That lane has not landed — `POST /api/checkout` prices cart lines from the listing and
 * has no quote arm — so an accepted quote produces a `pending` booking that no rail can charge
 * yet. The honest answer is to say that in the sentence, not to draw a Pay button that leads
 * nowhere and not to pretend the booking is paid.
 */
export const QUOTE_CHECKOUT_UNAVAILABLE_NOTE =
  "Your booking is recorded at this amount and is not paid yet. Paying for a quoted booking is not available on the site yet — your provider will be in touch about payment.";

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
