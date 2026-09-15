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
 *   A8  D-10: `confirmed` is not human-settable, and its refusal names the partner rule.
 *
 * REPAIRED, NOT WEAKENED (2026-09-15, punchlist D-10 option A, ledger
 * `2026-09-15-d10-confirmed-needs-partner-evidence`): A5 and A7 asserted the PREVIOUS rule, under
 * which an agent could write `confirmed` and the reader downgraded a reference-less `confirmed` to
 * `purchased_by_human`. D-10 narrowed WHO MAY WRITE that value — only the partner's own reported
 * conversion does — so both assertions now hold the ruling that replaced them. LD 44 (e)'s value
 * set is untouched, which is why A1/A3/A4 are unchanged.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HUMAN_PURCHASE_BOOKING_AGENT_STATUSES,
  HUMAN_SETTABLE_BOOKING_AGENT_STATUSES,
  PARTNER_EVIDENCE_BOOKING_AGENT_STATUSES,
  PURCHASE_CLAIMABLE_FROM_STATUSES,
  LEGACY_BOOKING_AGENT_STATUSES,
  RULED_BOOKING_AGENT_STATUSES,
  SERVER_WRITTEN_BOOKING_AGENT_STATUSES,
  bookingAgentStatusRefusal,
  isHumanPurchaseBookingAgentStatus,
  isHumanSettableBookingAgentStatus,
  isLegacyBookingAgentStatus,
  isPartnerEvidenceBookingAgentStatus,
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

  it("A5: the human allowlist overlaps neither the server-written set nor the partner-evidence set", () => {
    const serverOnly = new Set<string>(SERVER_WRITTEN_BOOKING_AGENT_STATUSES);
    const overlap = HUMAN_SETTABLE_BOOKING_AGENT_STATUSES.filter((s) => serverOnly.has(s));
    assert.deepEqual(overlap, [], `human-settable values that are also server-written: ${overlap}`);

    // D-10: the partner-evidence set is the second thing a human may not write, and for a DIFFERENT
    // reason — the platform does not decide it either, it only records what the partner reported.
    const partnerOnly = new Set<string>(PARTNER_EVIDENCE_BOOKING_AGENT_STATUSES);
    const partnerOverlap = HUMAN_SETTABLE_BOOKING_AGENT_STATUSES.filter((s) => partnerOnly.has(s));
    assert.deepEqual(partnerOverlap, [], `human-settable values that need partner evidence: ${partnerOverlap}`);
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
    // D-10: `confirmed` is the partner's own word, and a legacy row carrying it KEEPS it — with
    // or without a reference, which the matcher never writes. No backfill, and no reader trying to
    // tell a legacy row from a partner-confirmed one.
    assert.equal(readBookingAgentStatus({ status: "confirmed" }).stage, "confirmed");
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

  it("A8: D-10 — `confirmed` needs partner evidence, and the refusal names that rule", () => {
    assert.equal(isPartnerEvidenceBookingAgentStatus("confirmed"), true);
    assert.equal(isHumanSettableBookingAgentStatus("confirmed"), false);
    // The refusal must name WHAT to do instead, and must not read as "the platform writes this" —
    // a `researching`-shaped sentence would be the wrong fact about who decides (§13).
    const refusal = bookingAgentStatusRefusal("confirmed");
    assert.match(refusal, /partner/i);
    assert.match(refusal, /purchased_by_human/);
    assert.doesNotMatch(refusal, /written by the platform/);
    assert.notEqual(refusal, bookingAgentStatusRefusal("researching"));

    // The human purchase values are the two a press may write; the API one stays server-only.
    assert.deepEqual(HUMAN_PURCHASE_BOOKING_AGENT_STATUSES as readonly string[], [
      "purchased_by_human",
      "purchased_by_traveler",
    ]);
    for (const v of HUMAN_PURCHASE_BOOKING_AGENT_STATUSES) {
      assert.equal(isHumanPurchaseBookingAgentStatus(v), true, v);
      assert.equal(isHumanSettableBookingAgentStatus(v), true, v);
    }
    assert.equal(isHumanPurchaseBookingAgentStatus("purchased_by_api"), false);

    // The §15 from-list is DERIVED: it excludes `confirmed` (never pull a row off the partner's
    // word) and every purchase value (so a second press is a zero-row no-op), and it still admits
    // the states an agent really buys from — including `unavailable`/`failed`, a correction.
    assert.equal(PURCHASE_CLAIMABLE_FROM_STATUSES.includes("confirmed"), false);
    for (const purchased of ["purchased_by_human", "purchased_by_traveler", "purchased_by_api"]) {
      assert.equal(PURCHASE_CLAIMABLE_FROM_STATUSES.includes(purchased), false, purchased);
    }
    for (const from of ["pending", "assigned", "received", "researching", "ready_to_buy", "flagged", "unavailable", "failed"]) {
      assert.equal(PURCHASE_CLAIMABLE_FROM_STATUSES.includes(from), true, from);
    }
  });
});
