/**
 * E9 (Leon, Nov 13): ONE party ask.
 *
 * The editor's Who step already reads `partyFields(selectedOccasion)` / `asksKidsCount(...)`
 * (`plan-modal.tsx:578-582`). The slip's "Who's coming?" panel used to hardcode "Adults" and "Children", so
 * an attendees occasion was asked the wrong question and a no-kids occasion was asked for a kids count.
 *
 * The panel now reads the same rule. The testids do not move: `input-slip-who-adults`,
 * `input-slip-who-kids`, `input-slip-who-pet-kind`, `input-slip-who-pet-count`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { asksKidsCount, partyFields } from "../plan-steps";

const PANEL = fs.readFileSync("client/src/components/plan/SlipAnchorPanels.tsx", "utf8");
const MODAL = fs.readFileSync("client/src/components/trip/plan-modal.tsx", "utf8");

test("both surfaces read the one rule", () => {
  assert.match(MODAL, /partyFields\(selectedOccasion\)/, "the editor step reads partyFields");
  assert.match(MODAL, /asksKidsCount\(selectedOccasion\)/, "and asksKidsCount");
  assert.match(PANEL, /partyFields\(partyOccasion\)/, "the slip panel reads the same rule");
  assert.match(PANEL, /asksKidsCount\(partyOccasion\)/, "and the same kids question");
});

test("the panel's labels come from the rule, not literals", () => {
  assert.match(PANEL, /adultsLabel/, "the adults label is derived");
  assert.match(PANEL, /\{adultsLabel\}/, "and rendered");
  assert.doesNotMatch(PANEL, />Adults</, "no hardcoded Adults label left in the panel");
  assert.doesNotMatch(PANEL, />Children</, "no hardcoded Children label left in the panel");
});

test("the kids field is drawn only when the occasion asks for one", () => {
  assert.match(PANEL, /\{wantsKids \? \(/, "the field is conditional");
  assert.match(PANEL, /data-testid="input-slip-who-kids"/, "and keeps its testid when drawn");
});

test("the rule itself: attendees is one field, a plain trip is Adults + Kids", () => {
  const attendees = partyFields({ vocabulary: "attendees" } as any);
  assert.deepEqual(attendees.map((f) => f.label), ["Attendees"]);
  const plain = partyFields(null);
  assert.deepEqual(plain.map((f) => f.label), ["Adults", "Kids"]);
  assert.equal(asksKidsCount({ vocabulary: "attendees" } as any), false, "attendees asks no kids count");
  assert.equal(asksKidsCount(null), true, "a plain trip still asks it");
});
