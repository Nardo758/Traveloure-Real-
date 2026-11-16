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
import { asksKidsCount, partyFields } from "../plan-steps";

// NO SOURCE MATCHES HERE ANY MORE. `assert.match(PANEL, /partyFields\(occasion\)/)` proved the panel
// WOULD use a row and never that one was passed, which is how #2020 shipped green with `occasion` null.
// The panel's behaviour is rendered in
// client/src/components/plancard/__tests__/e9-party-ask-wired.test.ts; this file keeps the pure rule.

test("the rule itself: attendees is one field, a plain trip is Adults + Kids", () => {
  const attendees = partyFields({ vocabulary: "attendees" } as any);
  assert.deepEqual(attendees.map((f) => f.label), ["Attendees"]);
  const plain = partyFields(null);
  assert.deepEqual(plain.map((f) => f.label), ["Adults", "Kids"]);
  assert.equal(asksKidsCount({ vocabulary: "attendees" } as any), false, "attendees asks no kids count");
  assert.equal(asksKidsCount(null), true, "a plain trip still asks it");
});
