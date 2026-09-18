/**
 * QUOTE SURFACE COPY — proofs (ledger `2026-09-17-surfaces-quotes-settlement`).
 *
 * The surfaces LD 49 shipped its rails without. These are pure: the module imports nothing but a
 * type, so every rule below is provable with no database, no browser and no clock.
 *
 * Q1-Q7  every lifecycle the server can send words differently, in BOTH audiences' voices.
 * Q8     an UNKNOWN lifecycle is said as unrecognised — never mapped to a neighbour, because the
 *        status column has no DB CHECK and a value this build does not know is real.
 * A1-A3  §13 — an unquoted row says "no amount yet" and is NEVER $0.00.
 * V1-V5  the validity line is the SERVER's `expiresAt` and nothing else; no day count exists here.
 * B1-B3  the accept / withdraw / issue affordances mirror the server's own claims.
 * D1-D4  the deposit line is the MINTED BOOKING's answer; an unloaded booking yields no line.
 * R1-R3  the seller's validity refusal repeats the SERVER's numbers, never one of its own.
 * C1     the charge is not built, and the note says so rather than promising payment.
 *
 * Run: npx tsx --test client/src/lib/__tests__/quote-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUOTE_CHECKOUT_UNAVAILABLE_NOTE,
  QUOTE_PAY_ACTION_LABEL,
  quoteChargeRefusalLine,
  quoteAmountLine,
  quoteDepositLine,
  quoteIsAcceptable,
  quoteIsIssuable,
  quoteIsWithdrawable,
  quoteIssueRefusalLine,
  quoteStateCopy,
  quoteValidityLine,
  type QuoteCardRow,
} from "../quote-copy";

const row = (over: Partial<QuoteCardRow> = {}): QuoteCardRow => ({
  id: "q1",
  serviceId: "s1",
  status: "quoted",
  lifecycle: "quoted",
  ...over,
});

const day = (iso: string) => `D(${iso})`;

test("Q1-Q7: every lifecycle the server can send has its own words, for both audiences", () => {
  const states = ["requested", "quoted", "expired", "accepted", "declined", "withdrawn", "superseded"];
  const travelerLines = new Set<string>();
  const sellerLines = new Set<string>();
  for (const s of states) {
    const copy = quoteStateCopy(s);
    assert.ok(copy.label.length > 0, `${s} has a label`);
    travelerLines.add(copy.traveler);
    sellerLines.add(copy.seller);
    // A quote is an offer, never a verdict on the traveler — no score/exam/grade vocabulary.
    assert.ok(!/\bscore\b|\bexam\b|\bgrade\b/i.test(copy.traveler + copy.seller), `${s} uses no score vocabulary`);
  }
  assert.equal(travelerLines.size, states.length, "no two states share a traveler sentence");
  assert.equal(sellerLines.size, states.length, "no two states share a seller sentence");
  // `withdrawn` (the provider's no) and `declined` (the traveler's) are DIFFERENT facts.
  assert.notEqual(quoteStateCopy("withdrawn").label, quoteStateCopy("declined").label);
});

test("Q8: an unknown lifecycle is unrecognised, never mapped forward to an acceptable one", () => {
  const copy = quoteStateCopy("some_future_status");
  assert.equal(copy.label, "some future status");
  assert.match(copy.traveler, /does not recognise/);
  assert.equal(quoteStateCopy(undefined).label, "Unrecognised");
  assert.equal(quoteStateCopy("").label, "Unrecognised");
  // And it is never acceptable — an unknown state must not draw an Accept button.
  assert.equal(quoteIsAcceptable(row({ lifecycle: "some_future_status", amountCents: 1000 })), false);
});

test("A1-A3: §13 — an unquoted row says so and is never rendered as zero", () => {
  assert.equal(quoteAmountLine(row({ lifecycle: "requested", status: "requested" })), "No amount yet");
  assert.ok(!quoteAmountLine(row({ lifecycle: "requested", status: "requested" })).includes("0.00"));
  assert.equal(quoteAmountLine(row({ amountCents: 125000, amount: "1250.00" })), "1250.00");
  assert.equal(quoteAmountLine(row({ amountCents: 125000, amount: "1250.00", currency: "USD" })), "1250.00 USD");
});

test("V1-V5: the validity line is the server's expiry, and no day count lives in this module", () => {
  assert.equal(
    quoteValidityLine(row({ lifecycle: "quoted", expiresAt: "2026-10-01T00:00:00.000Z" }), day),
    "Stands until D(2026-10-01T00:00:00.000Z)",
  );
  assert.equal(
    quoteValidityLine(row({ lifecycle: "expired", status: "quoted", expiresAt: "2026-09-01T00:00:00.000Z" }), day),
    "Expired D(2026-09-01T00:00:00.000Z)",
  );
  // A `requested` row has NO offer, so it has no deadline — and that is said as "no offer yet",
  // never as "no deadline", which would describe an open-ended offer nobody made.
  const requested = quoteValidityLine(row({ lifecycle: "requested", status: "requested" }), day);
  assert.match(requested ?? "", /No offer yet/);
  assert.ok(!/no deadline/i.test(requested ?? ""));
  // A dead row with no expiry draws no line at all rather than an invented one.
  assert.equal(quoteValidityLine(row({ lifecycle: "withdrawn", status: "withdrawn" }), day), null);
  // The module never formats a date itself — the caller's formatter is the only one used.
  assert.equal(
    quoteValidityLine(row({ lifecycle: "quoted", expiresAt: "X" }), () => "FORMATTED"),
    "Stands until FORMATTED",
  );
});

test("B1-B3: the affordances mirror the server's own claims", () => {
  // Accept: `quoted`, unaccepted, unsuperseded, and an amount actually exists.
  assert.equal(quoteIsAcceptable(row({ amountCents: 100 })), true);
  assert.equal(quoteIsAcceptable(row({ amountCents: 100, acceptedAt: "2026-09-01" })), false);
  assert.equal(quoteIsAcceptable(row({ amountCents: 100, supersededBy: "q2" })), false);
  assert.equal(quoteIsAcceptable(row({ lifecycle: "expired", amountCents: 100 })), false);
  assert.equal(quoteIsAcceptable(row({})), false, "no amount ⇒ nothing to accept");
  // Withdraw: only a live offer can be taken back; a `requested` row has no offer yet.
  assert.equal(quoteIsWithdrawable(row({})), true);
  assert.equal(quoteIsWithdrawable(row({ lifecycle: "requested", status: "requested" })), false);
  // Issue: a first offer, or a RE-QUOTE of an expired one (LD 49 — never an edit).
  assert.equal(quoteIsIssuable(row({ lifecycle: "requested", status: "requested" })), true);
  assert.equal(quoteIsIssuable(row({ lifecycle: "expired", status: "quoted" })), true);
  assert.equal(quoteIsIssuable(row({})), false);
  assert.equal(quoteIsIssuable(row({ lifecycle: "accepted", status: "accepted" })), false);
});

test("D1-D4: the deposit answer is the minted booking's, and an unloaded booking yields no line", () => {
  // §13: not loaded is NOT "no deposit" — it is no answer, and the line is omitted.
  assert.equal(quoteDepositLine(null), null);
  assert.equal(quoteDepositLine(undefined), null);
  // The row carries a split ⇒ both numbers are the server's, verbatim.
  const split = quoteDepositLine({ depositAmount: "300.00", balanceAmount: "950.00", totalAmount: "1250.00" });
  assert.ok(split?.includes("300.00") && split.includes("950.00"));
  // No split ⇒ payable in full, from the row's own total. No percentage is computed anywhere.
  assert.equal(quoteDepositLine({ totalAmount: "1250.00" }), "Payable in full: 1250.00");
  assert.equal(quoteDepositLine({}), null, "no total either ⇒ no line, never a guess");
});

test("R1-R3: the seller's refusal repeats the SERVER's numbers", () => {
  const line = quoteIssueRefusalLine({ code: "validity_exceeds_ceiling", ceilingDays: 30, requestedDays: 45 });
  assert.ok(line?.includes("30") && line.includes("45"), "both of the server's numbers are stated");
  assert.match(line ?? "", /Nothing was issued/, "the refusal says nothing was written (never clamped)");
  // A different ceiling from the server produces a different sentence — the module knows none.
  const other = quoteIssueRefusalLine({ code: "validity_exceeds_ceiling", ceilingDays: 14, requestedDays: 20 });
  assert.ok(other?.includes("14"));
  // Any other refusal is the server's own sentence, untouched.
  assert.equal(quoteIssueRefusalLine({ message: "Quote not found." }), "Quote not found.");
  assert.equal(quoteIssueRefusalLine(null), null);
});

test("C1: the note still says the booking is UNPAID, and now points at where it is paid", () => {
  assert.match(QUOTE_CHECKOUT_UNAVAILABLE_NOTE, /not paid yet/);
  // Ledger `2026-09-18-quote-born-charge`: the charge landed, so the old "not available on the
  // site yet" half is gone — it stopped being true, and a surface that kept saying it would be
  // the §13 lie in the other direction.
  assert.ok(!/not available/i.test(QUOTE_CHECKOUT_UNAVAILABLE_NOTE));
  // It still never claims the booking is paid or confirmed.
  assert.ok(!/\bpaid in full\b|\bconfirmed\b/i.test(QUOTE_CHECKOUT_UNAVAILABLE_NOTE));
  assert.match(QUOTE_PAY_ACTION_LABEL, /Pay/);
});

test("C2: a charge refusal is the SERVER's fact — the expiry is repeated, never recomputed", () => {
  const fmt = (iso: string) => `on ${iso.slice(0, 10)}`;
  const expired = quoteChargeRefusalLine(
    { code: "quote_expired", expiresAt: "2026-09-01T10:00:00.000Z", message: "ignored" },
    fmt,
  );
  assert.match(expired ?? "", /on 2026-09-01/);
  assert.match(expired ?? "", /not repriced/);
  assert.match(expired ?? "", /nothing was charged/i);
  // No expiry from the server ⇒ the server's own sentence, never a date this module invents.
  assert.equal(
    quoteChargeRefusalLine({ code: "quote_expired", message: "This quote expired." }, fmt),
    "This quote expired.",
  );
  assert.match(
    quoteChargeRefusalLine({ code: "quote_charge_in_progress" }, fmt) ?? "",
    /already been started/,
  );
  assert.equal(quoteChargeRefusalLine(null, fmt), null);
  assert.equal(quoteChargeRefusalLine({}, fmt), null);
});
