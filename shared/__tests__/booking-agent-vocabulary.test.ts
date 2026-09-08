/**
 * LD 44 (e) phase 0 — the booking-agent status vocabulary.
 * Ledger `2026-09-08-agent-phase-zero`. Pure; no DB, no network.
 *
 * Run: npx tsx --test shared/__tests__/booking-agent-vocabulary.test.ts
 *
 * WHAT THESE PROVE, and each is a RULE rather than a spelling:
 *   A1  the nine ruled values are exactly LD 44 (e)'s pipeline, in order.
 *   A2  `researching` and `purchased_by_api` are refused to a human (the machine-state rule).
 *   A3  `confirmed` and `purchased_by_*` are DIFFERENT values and are never collapsed.
 *   A4  the legacy four survive as legal stored values — no backfill, no rewriting (§13).
 *   A5  the human allowlist and the server-written set do not overlap.
 *   A6  an unknown string is refused, and the refusal names WHY rather than listing the set.
 *   A7  the ONE reader maps the legacy four explicitly and never invents a ruled state.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HUMAN_SETTABLE_BOOKING_AGENT_STATUSES,
  LEGACY_BOOKING_AGENT_STATUSES,
  RULED_BOOKING_AGENT_STATUSES,
  SERVER_WRITTEN_BOOKING_AGENT_STATUSES,
  bookingAgentStatusRefusal,
  isHumanSettableBookingAgentStatus,
  isLegacyBookingAgentStatus,
  isRuledBookingAgentStatus,
  isServerWrittenBookingAgentStatus,
} from "../booking-agent-vocabulary";
import { readBookingAgentStatus } from "../../client/src/lib/booking-agent-status";

describe("LD 44 (e) booking-agent status vocabulary", () => {
  it("A1: the ruled set is LD 44 (e)'s pipeline, in order", () => {
    assert.deepEqual(RULED_BOOKING_AGENT_STATUSES as readonly string[], [
      "received",
      "researching",
      "ready_to_buy",
      "purchased_by_human",
      "purchased_by_traveler",
      "purchased_by_api",
      "confirmed",
      "flagged",
      "unavailable",
    ]);
  });

  it("A2: a human may not type themselves into a machine state", () => {
    for (const machine of SERVER_WRITTEN_BOOKING_AGENT_STATUSES) {
      assert.equal(isHumanSettableBookingAgentStatus(machine), false, machine);
      assert.match(bookingAgentStatusRefusal(machine), /written by the platform/);
    }
    // …and both of the two LD 44 names by name, so a later edit to the set is visible here.
    assert.equal(isServerWrittenBookingAgentStatus("researching"), true);
    assert.equal(isServerWrittenBookingAgentStatus("purchased_by_api"), true);
  });

  it("A3: purchased_by_* and confirmed are different facts, never collapsed", () => {
    // "Booked" is said only with a confirmation in hand — so the vocabulary must carry BOTH, and
    // a purchase value must never be an alias of `confirmed`.
    for (const purchased of ["purchased_by_human", "purchased_by_traveler", "purchased_by_api"]) {
      assert.equal(isRuledBookingAgentStatus(purchased), true, purchased);
      assert.notEqual(purchased, "confirmed");
    }
    assert.equal(isRuledBookingAgentStatus("confirmed"), true);
  });

  it("A4: the legacy four stay legal stored values — no backfill, no rewriting", () => {
    assert.deepEqual(LEGACY_BOOKING_AGENT_STATUSES as readonly string[], [
      "pending",
      "assigned",
      "confirmed",
      "failed",
    ]);
    for (const legacy of LEGACY_BOOKING_AGENT_STATUSES) {
      assert.equal(isLegacyBookingAgentStatus(legacy), true, legacy);
    }
    // `failed` is the live agent inbox's own write and therefore stays settable; it is NOT
    // silently re-pointed at `flagged` or `unavailable`, which it cannot distinguish.
    assert.equal(isHumanSettableBookingAgentStatus("failed"), true);
  });

  it("A5: the human allowlist and the server-written set never overlap", () => {
    const serverOnly = new Set<string>(SERVER_WRITTEN_BOOKING_AGENT_STATUSES);
    const overlap = HUMAN_SETTABLE_BOOKING_AGENT_STATUSES.filter((s) => serverOnly.has(s));
    assert.deepEqual(overlap, [], `human-settable values that are also server-written: ${overlap}`);
  });

  it("A6: an unknown string is refused, and the refusal says which kind of refusal it is", () => {
    assert.equal(isHumanSettableBookingAgentStatus("booked"), false);
    assert.equal(isHumanSettableBookingAgentStatus(""), false);
    assert.equal(isHumanSettableBookingAgentStatus(undefined), false);
    assert.equal(isHumanSettableBookingAgentStatus(42), false);
    assert.match(bookingAgentStatusRefusal("booked"), /not a booking-request status/);
    // A machine state and an unknown string get DIFFERENT sentences — refused-because-machine and
    // refused-because-unknown are different facts (§13).
    assert.notEqual(bookingAgentStatusRefusal("researching"), bookingAgentStatusRefusal("booked"));
  });

  it("A7: the ONE reader maps the legacy four explicitly and invents no ruled state", () => {
    assert.equal(readBookingAgentStatus({ status: "pending" }).stage, "received");
    assert.equal(readBookingAgentStatus({ status: "assigned" }).stage, "assigned_legacy");
    assert.equal(readBookingAgentStatus({ status: "failed" }).stage, "failed_legacy");
    // "Booked" only with a reference in hand.
    assert.equal(readBookingAgentStatus({ status: "confirmed" }).stage, "purchased_by_human");
    assert.equal(readBookingAgentStatus({ status: "confirmed", confirmationRef: "ABC" }).stage, "confirmed");
    // Every ruled value the vocabulary carries is readable — no second list to keep in step.
    for (const ruled of RULED_BOOKING_AGENT_STATUSES) {
      if (ruled === "confirmed") continue; // decided by the reference, asserted above
      const reading = readBookingAgentStatus({ status: ruled });
      assert.equal(reading.stage, ruled, ruled);
      assert.equal(reading.ruled, true, ruled);
    }
    // §13: an unrecognised value is shown as itself, never folded into a ruled state.
    assert.equal(readBookingAgentStatus({ status: "booked" }).stage, "unknown");
    assert.equal(readBookingAgentStatus({ status: null }).label, "Status not recorded");
  });
});
