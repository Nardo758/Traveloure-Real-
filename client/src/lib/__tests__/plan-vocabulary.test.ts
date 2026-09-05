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
 *   P6  `partyTotal` (ledger `2026-09-04-one-modal-many-doors`) is the ONE derivation of the plan
 *       modal's Adults+Kids pair into the single `travelers` count the Trip Strip's chip reads,
 *       and it keeps the empty state: neither field stated ⇒ NOT SET, never 0 and never 2. The
 *       "0 = cleared" marker the modal writes into the trip-context blob reads back as NOT SET
 *       here, so a cleared field can never become a count of none.
 *
 * Pure unit, no DOM and no DB.
 * Run: npx tsx --test client/src/lib/__tests__/plan-vocabulary.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADDED_TO_CART_TITLE,
  MAX_PARTY_COUNT,
  eventCountLabel,
  parsePartyCountInput,
  partyTotal,
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

describe("P6 — the party total (Adults + Kids, one derivation)", () => {
  it("adds the two halves the traveler stated", () => {
    assert.equal(partyTotal("2", "1"), 3);
    assert.equal(partyTotal(2, 1), 3);
    assert.equal(partyTotal("2", ""), 2);
    assert.equal(partyTotal("", "1"), 1);
  });

  it("NEITHER stated ⇒ NOT SET — never 0, never a fabricated 2 (§13, migration 241)", () => {
    for (const [a, k] of [
      ["", ""],
      [undefined, undefined],
      [null, null],
      ["  ", ""],
      ["abc", "xyz"],
    ] as Array<[unknown, unknown]>) {
      assert.equal(
        partyTotal(a as string, k as string),
        undefined,
        `unanswered party must be undefined, got a=${String(a)} k=${String(k)}`,
      );
    }
  });

  it("reads the modal's '0 = cleared' blob marker back as NOT SET, never as a count of none", () => {
    assert.equal(partyTotal(0, 0), undefined);
    assert.equal(partyTotal("0", "0"), undefined);
    // A cleared kids field beside a real adults count contributes nothing.
    assert.equal(partyTotal("2", 0), 2);
  });

  it("never tops a stated kids count up with an assumed adult", () => {
    assert.equal(partyTotal(undefined, "2"), 2);
  });
});

/**
 * P6 — THE TYPED PARTY COUNT (decision-maker, step 4: "the traveler must be able to TYPE the
 * number as well as step it").
 *
 * `parsePartyCountInput` is the ONE normaliser shared by the step-4 input and the − / + buttons
 * that sit either side of it (§18 rule 1). Everything asserted here is an invariant the STEPPER
 * already held and which a free-text field is the obvious way to break:
 *
 *   - an empty field stays empty, because Locked Decision 33 says an untouched step-4 field is
 *     NULL, "never 2" — a parser that answered 0 or 1 for "" would put migration 241's mask back;
 *   - there is no explicit ZERO in this model (§13): "not set" and "none" are different answers
 *     and only the first is true of a field nobody filled in, so a typed "0" lands exactly where
 *     `stepDown` lands from 1 — at "";
 *   - the ceiling is the stepper's own `MAX_PARTY_COUNT`, so the two controls on one state cannot
 *     disagree about the maximum;
 *   - and the parsed result is a string, because that is the shape the `adults`/`kids` state and
 *     `partyTotal` already speak. A number here would be a second representation of one value.
 */
describe("parsePartyCountInput (step 4's typed party count)", () => {
  it("P6a: an empty or whitespace field states NOTHING — never a 0, never a 1", () => {
    assert.equal(parsePartyCountInput(""), "");
    assert.equal(parsePartyCountInput("   "), "");
    assert.equal(parsePartyCountInput(undefined), "");
    assert.equal(parsePartyCountInput(null), "");
    // And an unstated field feeds through the existing derivation as "not captured".
    assert.equal(partyTotal(parsePartyCountInput(""), parsePartyCountInput("")), undefined);
  });

  it("P6b: keeps digits and drops everything else rather than clearing the field", () => {
    assert.equal(parsePartyCountInput("12"), "12");
    assert.equal(parsePartyCountInput("12 adults"), "12");
    assert.equal(parsePartyCountInput("1a2"), "12");
    assert.equal(parsePartyCountInput("-3"), "3");
    assert.equal(parsePartyCountInput("2.5"), "25");
    assert.equal(parsePartyCountInput("007"), "7");
  });

  it("P6c: there is no explicit zero — a typed 0 is NOT SET, the same place stepDown lands", () => {
    assert.equal(parsePartyCountInput("0"), "");
    assert.equal(parsePartyCountInput("00"), "");
  });

  it("P6d: clamps to the stepper's own ceiling, and never above it", () => {
    assert.equal(parsePartyCountInput(String(MAX_PARTY_COUNT)), String(MAX_PARTY_COUNT));
    assert.equal(parsePartyCountInput(String(MAX_PARTY_COUNT + 1)), String(MAX_PARTY_COUNT));
    assert.equal(parsePartyCountInput("999999999999999999999999"), String(MAX_PARTY_COUNT));
  });

  it("P6e: returns the string shape the adults/kids state and partyTotal already speak", () => {
    const adults = parsePartyCountInput("3");
    const kids = parsePartyCountInput("2");
    assert.equal(typeof adults, "string");
    assert.equal(partyTotal(adults, kids), 5);
    // A stated adults count beside an untouched kids field totals the adults alone.
    assert.equal(partyTotal(adults, parsePartyCountInput("")), 3);
  });
});
