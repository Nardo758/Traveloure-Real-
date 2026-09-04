/**
 * PLAN VOCABULARY — the container noun is universal, and the occasion classifier did not move
 * behaviourally. Ledger `2026-09-03-plan-vocabulary`.
 *
 * What these hold:
 *   P1  the add labels never say "Trip" — travelers build Experiences too, which is the whole
 *       reason this module exists. A grep for the word is the assertion.
 *   P2  the trip-less / guest path still says CART, not "plan" — the sanctioned fallback is
 *       named honestly (ledger row 5, §13). Renaming it would be the same dishonesty inverted.
 *   P3  `classify` moved from trip-strip.tsx VERBATIM: the three classes, every keyword in both
 *       lists, and the travel-is-the-default fallback still resolve exactly as before, so the
 *       possessive occasion lead ("Your Kyoto wedding") is untouched by the label change.
 *   P5  `eventCountLabel` (ledger `2026-09-04-slip-events`) agrees in number and says NOTHING for
 *       a count of zero or one nobody resolved — the same honest-or-absent posture
 *       `partyCountLabel` enforces, and the reason the Trip Strip's chip can be hidden by an
 *       empty string alone. It is deliberately NOT the party vocabulary: an event is a thing,
 *       not a person, so "3 guests" must never come out of it.
 *
 *   P4  the two nouns agree with each other, so a future edit cannot leave the button saying one
 *       word and the toast another — which is precisely the split this lane found in the wild
 *       (title "…your trip", description "…on your plan").
 *
 * Pure unit, no DOM and no DB.
 * Run: npx tsx --test client/src/lib/__tests__/plan-vocabulary.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADDED_TO_CART_TITLE,
  eventCountLabel,
  ADDED_TO_PLAN_TITLE,
  ADD_TO_CART_LABEL,
  ADD_TO_PLAN_FAILED_TITLE,
  ADD_TO_PLAN_LABEL,
  PLAN_NOUN,
  PLAN_NOUN_LOWER,
  addLabel,
  addedTitle,
  classify,
} from "../plan-vocabulary";

describe("plan vocabulary", () => {
  // P1 — the reason the module exists.
  it("P1: no plan-side label names a Trip", () => {
    for (const s of [ADD_TO_PLAN_LABEL, ADDED_TO_PLAN_TITLE, ADD_TO_PLAN_FAILED_TITLE, addLabel(true), addedTitle(true)]) {
      assert.ok(!/trip/i.test(s), `plan-side label must not say "trip": ${s}`);
      assert.ok(new RegExp(PLAN_NOUN_LOWER, "i").test(s), `plan-side label should name the plan: ${s}`);
    }
  });

  // P2 — the guest / trip-less fallback is still the cart, and says so.
  it("P2: the trip-less path still says cart", () => {
    assert.equal(addLabel(false), ADD_TO_CART_LABEL);
    assert.equal(addedTitle(false), ADDED_TO_CART_TITLE);
    for (const s of [ADD_TO_CART_LABEL, ADDED_TO_CART_TITLE]) {
      assert.ok(/cart/i.test(s), `fallback label should name the cart: ${s}`);
      assert.ok(!new RegExp(PLAN_NOUN_LOWER, "i").test(s), `fallback must not claim the plan: ${s}`);
    }
  });

  // P3 — the classifier moved without changing meaning. Every keyword from both original lists.
  it("P3: classify still resolves every original keyword to its class", () => {
    const couple = ["proposal", "date night", "date-night", "anniversary", "honeymoon"];
    const event = [
      "wedding", "birthday", "corporate", "party", "reunion", "shower", "graduation",
      "retirement", "farewell", "housewarming", "achievement", "holiday", "bachelor",
      "engagement", "retreat",
    ];
    for (const k of couple) assert.equal(classify(k), "couple", `"${k}" should be couple-class`);
    for (const k of event) assert.equal(classify(k), "event", `"${k}" should be event-class`);

    // Travel is the default, including for absent/empty input — never a thrown error, never a guess.
    for (const k of [undefined, "", "   ", "family vacation", "city break"]) {
      assert.equal(classify(k), "travel", `"${String(k)}" should fall back to travel-class`);
    }

    // Couple wins over event where both could match — the original ordering, preserved.
    assert.equal(classify("engagement proposal"), "couple");
    // Matching is substring + case-insensitive, as before ("anniversar" catches both spellings).
    assert.equal(classify("10th ANNIVERSARIES trip"), "couple");
    assert.equal(classify("Corporate Offsite"), "event");
  });

  // P4 — button and toast can never drift apart.
  it("P4: the button noun and the sentence noun are the same word", () => {
    assert.equal(PLAN_NOUN.toLowerCase(), PLAN_NOUN_LOWER);
    assert.ok(ADD_TO_PLAN_LABEL.includes(PLAN_NOUN));
    assert.ok(ADDED_TO_PLAN_TITLE.includes(PLAN_NOUN_LOWER));
  });
});

describe("P5 — the event noun (the Trip Strip's chip)", () => {
  it("agrees in number", () => {
    assert.equal(eventCountLabel(1), "1 event");
    assert.equal(eventCountLabel(2), "2 events");
    assert.equal(eventCountLabel(11), "11 events");
  });

  it("says nothing for a count that is zero, negative or never resolved", () => {
    for (const n of [0, -1, undefined, null, NaN]) {
      assert.equal(eventCountLabel(n as number), "", `must be silent for ${String(n)}`);
    }
  });

  it("is the EVENT noun, never the party noun", () => {
    // migration 276's `vocabulary` column names the PEOPLE on a plan; borrowing it here would
    // print "3 guests" for three ceremonies.
    assert.doesNotMatch(eventCountLabel(3), /guest|traveler|attendee/);
  });
});
