/**
 * R1 (Leon, Nov 16 2026) - the party summary reads the SAME inputs as the panel.
 *
 * The panel's fields come from `partyFields(occasion)`, whose rule is
 * `partyNoun(vocabulary, guestListSetting(row))`. `partyNoun` returns "travelers" whenever the guest list is
 * explicitly OFF (`plan-vocabulary.ts:150`), so an attendees occasion with its guest list off asks Adults and
 * Kids in the panel and must read "20 adults" in the summary. The three cases below are that rule, not a
 * hope about it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PARTY_COUNT, partyCompositionLabel, parsePartyCountInput } from "../plan-vocabulary";

const row = (defaultGuests: boolean | null, vocabulary = "attendees") =>
  ({ slug: "corporate", vocabulary, defaultGuests }) as any;

test("attendees with the guest list OFF reads adults, exactly as the panel asks", () => {
  assert.equal(partyCompositionLabel(20, null, row(false)), "20 adults");
});

test("attendees with the guest list ON reads attendees", () => {
  assert.equal(partyCompositionLabel(20, null, row(true)), "20 attendees");
});

test("attendees with the guest list UNSET reads attendees (the vocabulary speaks)", () => {
  assert.equal(partyCompositionLabel(20, null, row(null)), "20 attendees");
});

test("a guest-list occasion is unchanged, and no row is unchanged", () => {
  assert.equal(partyCompositionLabel(30, null, row(true, "guests")), "30 adults");
  assert.equal(partyCompositionLabel(30, 4, row(true, "guests")), "30 adults, 4 children");
  assert.equal(partyCompositionLabel(2, null), "2 adults");
  assert.equal(partyCompositionLabel(2, 3), "2 adults, 3 children");
  assert.equal(partyCompositionLabel(1, null, row(true)), "1 attendee");
});

test("the ceiling is one shared number, 100,000", () => {
  assert.equal(MAX_PARTY_COUNT, 100_000);
  assert.equal(parsePartyCountInput("600"), "600");
  assert.equal(parsePartyCountInput("100001"), "100000");
});
