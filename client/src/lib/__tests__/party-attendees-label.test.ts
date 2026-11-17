/**
 * R1 (Leon, Nov 16 2026) - the party summary follows the PANEL, not a vocabulary table.
 *
 * The panel's fields come from `partyFields(occasion)`. When it asks ONE field, the summary uses that field's
 * own word; when it asks Adults + Kids the summary is unchanged, which is what keeps a wedding reading
 * "30 adults" even though its vocabulary is "guests".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PARTY_COUNT, partyCompositionLabel, parsePartyCountInput } from "../plan-vocabulary";

test("an attendees plan's summary uses the panel's own word", () => {
  assert.equal(partyCompositionLabel(20, null, "attendees"), "20 attendees");
  assert.equal(partyCompositionLabel(1, null, "attendees"), "1 attendee");
});

test("a plan whose panel asks Adults and Kids is unchanged", () => {
  assert.equal(partyCompositionLabel(2, null), "2 adults");
  assert.equal(partyCompositionLabel(2, 3), "2 adults, 3 children");
});

test("a wedding still reads adults: its vocabulary is guests, and its panel asks both fields", () => {
  assert.equal(partyCompositionLabel(30, null, "guests"), "30 adults");
  assert.equal(partyCompositionLabel(30, 4, "guests"), "30 adults, 4 children");
});

test("the ceiling is one shared number, 100,000", () => {
  assert.equal(MAX_PARTY_COUNT, 100_000);
  assert.equal(parsePartyCountInput("600"), "600", "600 is no longer clamped away at 500");
  assert.equal(parsePartyCountInput("100001"), "100000");
});
