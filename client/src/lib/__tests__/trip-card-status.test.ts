/**
 * TRIP CARD STATUS READERS — the booking-agent vocabulary map and the purchase-status label.
 * Lane L9 of the Console & AI Concierge brief; ledger `2026-09-07-trip-card-one-page`.
 * CLAUDE.md Locked Decision 44 (e), Locked Decision 42 D9, §15b, §13.
 *
 * What these hold:
 *   B1  the legacy four map EXPLICITLY: pending→received; assigned→a legacy stage that is NOT
 *       "researching"; confirmed WITH a reference→Booked; confirmed WITHOUT→purchased, never
 *       Booked; failed→a legacy stage that is neither flagged nor unavailable
 *   B2  the ruled values pass through by name once phase 0 writes them
 *   B3  an unknown or empty status is shown as itself, never as the nearest ruled state
 *   B4  the reading is per ROW (the board draws one row per request) — a row's stage never
 *       depends on its neighbours
 *   B5  "Booked" is never the word for a claim: payment_pending reads as prepared; the paid
 *       statuses read as booked; anything else verbatim; NULL ⇒ no label
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
  it("confirmed WITH a reference → Booked; WITHOUT → purchased, awaiting confirmation", () => {
    const withRef = readBookingAgentStatus({ status: "confirmed", confirmationRef: "ABC123" });
    assert.equal(withRef.stage, "confirmed");
    assert.equal(withRef.label, "Booked");
    const noRef = readBookingAgentStatus({ status: "confirmed", confirmationRef: "  " });
    assert.equal(noRef.stage, "purchased_by_human");
    assert.doesNotMatch(noRef.label, /Booked/);
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
      ["confirmed", "received", "received", "assigned_legacy", "purchased_by_human"],
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
