/**
 * BOOKING-MODE PROVENANCE — lane OC-A0b (ledger `2026-09-11-booking-mode-provenance`;
 * punchlist V-9; offering-commerce implementation plan §1).
 *
 * WHAT THIS PINS, AND WHY EACH HALF MATTERS.
 *
 * (1) NO BEHAVIOUR CHANGE. `resolveBookingMode` is ruling 75's ONE derivation and the answer it
 *     gives is load-bearing for every buy button on the platform. The provenance work refactored
 *     its membership test to read `bookingModeEnum` instead of three inline literals, so B1-B6
 *     re-pin the whole truth table — including the three falsy spellings of "no account flag",
 *     which must all keep resolving to `request`. A change here is a changed button.
 *
 * (2) THE THREE FACTS ARE DISTINGUISHED. `request` is the right answer for an unset listing, and
 *     the lane deliberately did NOT change it — but "the seller chose request", "the seller's
 *     account says no instant booking" and "nobody ever answered" are three different facts and
 *     the code could not tell them apart. P1-P6 pin the distinction, P4 in particular: a listing
 *     whose owner has NO `service_provider_forms` row is `platform_default`, which on production
 *     2026-09-11 was 64 of 67 active listings (ledger `2026-09-11-oc-a1-ratified`).
 *
 * NEGATIVE SPACE: this is a pure unit test of two shared functions. It says nothing about how the
 * payload builder queries the flag, and nothing about what any surface renders.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bookingModeEnum,
  bookingModeProvenanceEnum,
  resolveBookingMode,
  resolveBookingModeWithProvenance,
} from "../schema";

// ─── (1) The resolver's answer is exactly what it always was ────────────────────────────────

test("B1 · a stored mode wins outright, whatever the account flag says", () => {
  for (const stored of bookingModeEnum) {
    for (const flag of [true, false, null, undefined]) {
      assert.equal(resolveBookingMode(stored, flag), stored);
    }
  }
});

test("B2 · an unset listing with a true account flag resolves to instant", () => {
  assert.equal(resolveBookingMode(null, true), "instant");
  assert.equal(resolveBookingMode(undefined, true), "instant");
});

test("B3 · every falsy spelling of the account flag resolves to request", () => {
  for (const flag of [false, null, undefined]) {
    assert.equal(resolveBookingMode(null, flag), "request");
  }
});

test("B4 · an unrecognised stored value is not a declaration — it falls to the account flag", () => {
  assert.equal(resolveBookingMode("INSTANT", true), "instant");
  assert.equal(resolveBookingMode("INSTANT", false), "request");
  assert.equal(resolveBookingMode("", true), "instant");
});

test("B5 · hidden is only ever explicit, never derived", () => {
  assert.equal(resolveBookingMode(null, true), "instant");
  assert.equal(resolveBookingMode(null, false), "request");
  assert.equal(resolveBookingMode("hidden", true), "hidden");
});

test("B6 · the provenance wrapper never changes the mode the resolver gives", () => {
  const storedValues = [...bookingModeEnum, null, undefined, "nonsense", ""];
  for (const stored of storedValues) {
    for (const flag of [true, false, null, undefined]) {
      assert.equal(
        resolveBookingModeWithProvenance(stored, flag).mode,
        resolveBookingMode(stored, flag),
        `mode drifted for stored=${String(stored)} flag=${String(flag)}`,
      );
    }
  }
});

// ─── (2) The three provenances are distinguished ────────────────────────────────────────────

test("P1 · a stored mode is listing_declared, at any account flag", () => {
  for (const stored of bookingModeEnum) {
    for (const flag of [true, false, null, undefined]) {
      assert.equal(resolveBookingModeWithProvenance(stored, flag).provenance, "listing_declared");
    }
  }
});

test("P2 · unset + a real true flag is account_declared", () => {
  const r = resolveBookingModeWithProvenance(null, true);
  assert.deepEqual(r, { mode: "instant", provenance: "account_declared" });
});

test("P3 · unset + a real FALSE flag is account_declared, not platform_default", () => {
  // The seller answered "no instant booking". That is a declaration, and it resolves to the same
  // mode as never having answered — which is exactly why the two must not be collapsed (§13).
  const r = resolveBookingModeWithProvenance(null, false);
  assert.deepEqual(r, { mode: "request", provenance: "account_declared" });
});

test("P4 · unset + NO account flag is platform_default — 64 of 67 production listings", () => {
  for (const flag of [null, undefined]) {
    const r = resolveBookingModeWithProvenance(null, flag);
    assert.deepEqual(r, { mode: "request", provenance: "platform_default" });
  }
});

test("P5 · platform_default and account_declared(false) give the SAME mode and DIFFERENT provenance", () => {
  const nobody = resolveBookingModeWithProvenance(null, undefined);
  const seller = resolveBookingModeWithProvenance(null, false);
  assert.equal(nobody.mode, seller.mode);
  assert.notEqual(nobody.provenance, seller.provenance);
});

test("P6 · every provenance value the enum declares is reachable, and nothing else is emitted", () => {
  const seen = new Set(
    [
      resolveBookingModeWithProvenance("instant", undefined),
      resolveBookingModeWithProvenance(null, true),
      resolveBookingModeWithProvenance(null, undefined),
    ].map((r) => r.provenance),
  );
  assert.deepEqual([...seen].sort(), [...bookingModeProvenanceEnum].sort());
});
