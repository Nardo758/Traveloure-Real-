/**
 * TRIP CARD STATUS READERS — the booking-agent vocabulary map and the purchase-status label.
 * Lane L9 of the Console & AI Concierge brief; ledger `2026-09-07-trip-card-one-page`.
 * CLAUDE.md Locked Decision 44 (e), Locked Decision 42 D9, §15b, §13.
 *
 * What these hold:
 *   B1  the legacy four map EXPLICITLY: pending→received; assigned→a legacy stage that is NOT
 *       "researching"; confirmed→confirmed, naming the partner (D-10, see below); failed→a legacy
 *       stage that is neither flagged nor unavailable
 *   B6  D-10: a purchase is never rendered as booked, and the agent's typed reference is said
 *       without being turned into the partner's word
 *   B2  the ruled values pass through by name once phase 0 writes them
 *   B3  an unknown or empty status is shown as itself, never as the nearest ruled state
 *   B4  the reading is per ROW (the board draws one row per request) — a row's stage never
 *       depends on its neighbours
 *   B5  "Booked" is never the word for a claim: payment_pending reads as prepared; the paid
 *       statuses read as booked; anything else verbatim; NULL ⇒ no label
 *
 * REPAIRED, NOT WEAKENED (2026-09-15 — punchlist D-10 option A, ledger
 * `2026-09-15-d10-confirmed-needs-partner-evidence`): B1 and B4 held the PREVIOUS rule, under
 * which a human agent wrote `confirmed` and a reference-less `confirmed` was downgraded to
 * `purchased_by_human`. D-10 narrowed who may WRITE `confirmed` to the partner's own reported
 * conversion, and the matcher never writes a reference — so that downgrade would now hide the one
 * reading the ruling exists to protect. The assertions hold the new invariant.
 *
 * Pure: no DOM, no DB, no network.
 * Run: npx tsx --test client/src/lib/__tests__/trip-card-status.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readBookingAgentStatus } from "../booking-agent-status";
import { readPurchaseStatus } from "../purchase-status";

describe("B1 the legacy four, mapped explicitly", () => {
  it("pending → received (ruled)", () => {
    assert.deepEqual(readBookingAgentStatus({ status: "pending" }), { stage: "received", label: "Received", ruled: true });
  });
  it("assigned → a legacy stage, never 'researching' (a copilot verb the row does not record)", () => {
    const r = readBookingAgentStatus({ status: "assigned" });
    assert.equal(r.stage, "assigned_legacy");
    assert.equal(r.ruled, false);
    assert.notEqual(r.stage, "researching");
    assert.doesNotMatch(r.label.toLowerCase(), /research|copilot|ai/);
  });
  it("confirmed → confirmed, naming the partner the row carries, with or without a reference", () => {
    const named = readBookingAgentStatus({ status: "confirmed", partnerName: "WeGoTrip" });
    assert.equal(named.stage, "confirmed");
    assert.equal(named.label, "Confirmed by WeGoTrip");
    // A legacy row written under the old human rail carries the same string and KEEPS it — there
    // is no backfill and nothing distinguishes the two, which is why the human rail stopped
    // being able to write it at all.
    const legacy = readBookingAgentStatus({ status: "confirmed", confirmationRef: "  " });
    assert.equal(legacy.stage, "confirmed");
    // §13: a row stating no partner is never given one.
    assert.equal(legacy.label, "Confirmed by the partner");
  });
  it("failed → a legacy stage that is neither flagged nor unavailable", () => {
    const r = readBookingAgentStatus({ status: "failed" });
    assert.equal(r.stage, "failed_legacy");
    assert.equal(r.ruled, false);
  });
});

describe("B2 the ruled values pass through by name", () => {
  for (const s of ["received", "researching", "ready_to_buy", "purchased_by_human", "purchased_by_traveler", "purchased_by_api", "flagged", "unavailable"] as const) {
    it(`${s} is itself`, () => {
      const r = readBookingAgentStatus({ status: s });
      assert.equal(r.stage, s);
      assert.equal(r.ruled, true);
    });
  }
});

describe("B3 unknown and empty", () => {
  it("an unrecognised status is shown verbatim under 'unknown'", () => {
    assert.deepEqual(readBookingAgentStatus({ status: "on_hold" }), { stage: "unknown", label: "on_hold", ruled: false });
  });
  it("an empty or absent status is 'unknown', not 'received'", () => {
    assert.equal(readBookingAgentStatus({ status: null }).stage, "unknown");
    assert.equal(readBookingAgentStatus({}).stage, "unknown");
    assert.equal(readBookingAgentStatus({ status: "   " }).stage, "unknown");
  });
});

describe("B4 a list of rows reads row by row", () => {
  // The rail draws ONE ROW PER REQUEST (the ratified `TripCard` board), so the reading is applied
  // per row and never aggregated: two rows in the same legacy state stay two rows, and a row's
  // stage never depends on its neighbours.
  it("each row keeps its own stage", () => {
    const rows = [
      { status: "confirmed", confirmationRef: "X" },
      { status: "pending" },
      { status: "pending" },
      { status: "assigned" },
      { status: "confirmed" },
    ];
    assert.deepEqual(
      rows.map((r) => readBookingAgentStatus(r).stage),
      ["confirmed", "received", "received", "assigned_legacy", "confirmed"],
    );
  });
});

describe("B5 purchase status", () => {
  it("payment_pending is PREPARED, never booked", () => {
    const r = readPurchaseStatus("payment_pending");
    assert.equal(r?.kind, "prepared");
    assert.doesNotMatch(r!.label, /Booked/);
  });
  it("the paid statuses are BOOKED", () => {
    assert.equal(readPurchaseStatus("confirmed")?.kind, "booked");
    assert.equal(readPurchaseStatus("deposit_paid")?.kind, "booked");
    assert.match(readPurchaseStatus("deposit_paid")!.label, /balance due/);
    assert.equal(readPurchaseStatus("completed")?.kind, "booked");
  });
  it("anything else is verbatim; NULL is no label", () => {
    assert.deepEqual(readPurchaseStatus("refunded"), { kind: "other", label: "refunded" });
    assert.equal(readPurchaseStatus(null), null);
    assert.equal(readPurchaseStatus(""), null);
  });
});

describe("B6 D-10 — a purchase is never booked, and a reference is said without being the partner's word", () => {
  it("purchased_by_human WITH a reference says the reference is recorded, and still waits", () => {
    const r = readBookingAgentStatus({ status: "purchased_by_human", confirmationRef: "ABC123" });
    assert.equal(r.stage, "purchased_by_human");
    assert.equal(r.ruled, true);
    assert.match(r.label, /reference recorded/i);
    assert.match(r.label, /awaiting the partner's confirmation/i);
    assert.doesNotMatch(r.label, /Booked|Confirmed by/i);
  });
  it("purchased_by_human WITHOUT a reference says only that it was purchased, and waits", () => {
    const r = readBookingAgentStatus({ status: "purchased_by_human", confirmationRef: "   " });
    assert.equal(r.stage, "purchased_by_human");
    assert.doesNotMatch(r.label, /reference recorded/i);
    assert.match(r.label, /awaiting the partner's confirmation/i);
  });
  it("no purchase stage is ever the word 'booked'", () => {
    for (const s of ["purchased_by_human", "purchased_by_traveler", "purchased_by_api"] as const) {
      assert.doesNotMatch(readBookingAgentStatus({ status: s }).label, /booked/i, s);
    }
  });
  it("the confirmed label never claims a partner the row does not name", () => {
    assert.equal(readBookingAgentStatus({ status: "confirmed", partnerName: "  " }).label, "Confirmed by the partner");
  });
});
