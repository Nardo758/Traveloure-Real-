/**
 * SLIP FIRST PAINT — nothing is CLAIMED before the data that would answer it has arrived.
 * QA check 3 (post-publish walkthrough of a freshly minted wedding plan, adults = 3).
 * CLAUDE.md §13, §18 rule 1; Locked Decision 28; ledger `2026-09-05-slip-events-first-render`.
 *
 * THE TWO DEFECTS, and the one thing they have in common.
 *
 *   (a) For a few seconds after mint the slip said "No items on this plan yet" and then filled in
 *       three event cards. The day list is built with `groupByEvent`, which needs the occasion row;
 *       while that lookup was in flight there was no row, `showsSchedule` correctly fell back to
 *       false, `buildSlipDaySlots` correctly returned the plan's own (empty) day list — and the
 *       composition told the traveler their brand-new plan was empty.
 *   (b) The party chip read "3 travelers" and settled to "3 guests". `partyNoun`'s NULL ⇒
 *       "travelers" is ruling 28's honest default for an occasion that HAS resolved and states no
 *       vocabulary. It is not an answer for one still in flight.
 *
 * Both are the SAME conflation: an absence that is a finished answer and an absence that is a
 * request in flight arrive at every reader as the same `null`. The fix is one signal
 * (`useOccasionSwitches().isResolved`) and two pure gates, and these are the pins for them.
 *
 * What these hold:
 *   P1-P6  `partyCountOnly` / `partyLabelForOccasion` — no noun before the row resolves, the
 *          SETTLED behaviour byte-identical to `partyCountLabel` (fallback included), and the
 *          honest-or-absent posture surviving into the placeholder ("" never becomes "0").
 *   E1-E4  `showsSlipEmptyState` — the sentence is a claim about the plan, so it waits; a real
 *          slot list is never gated on the occasion, and a resolved-empty plan still says it.
 *   A1-A5  the SHIPPED artifacts. A pure helper nobody calls fixes nothing, and the whole defect
 *          class here is a call site reaching past the gate — so these assert that the slip's
 *          empty-state line and both party labels actually go through it, and that the hook
 *          exposes ONE resolution signal rather than each surface re-deriving one (§18 rule 1).
 *
 * NEGATIVE SPACE (§18d's posture, applied to a pin): these are the RULES and the WIRING, not the
 * rendering. Whether the skeleton looks right, and how long the queries actually take, are browser
 * questions. Nothing here proves React Query's own `isLoading` semantics either — the hook's
 * choice of that flag over `isFetching` is asserted as a shipped fact (A5), not re-implemented.
 *
 * Pure: no DOM, no DB, no fetch. Run:
 *   npx tsx --test client/src/lib/__tests__/slip-first-paint.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  partyCountLabel,
  partyCountOnly,
  partyLabelForOccasion,
} from "../plan-vocabulary";
import { showsSlipEmptyState } from "../slip-events";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const slipViewSrc = readFileSync(
  join(ROOT, "client", "src", "components", "plancard", "SlipView.tsx"),
  "utf-8",
);
const tripStripSrc = readFileSync(
  join(ROOT, "client", "src", "components", "trip", "trip-strip.tsx"),
  "utf-8",
);
const hookSrc = readFileSync(
  join(ROOT, "client", "src", "hooks", "use-occasion-switches.ts"),
  "utf-8",
);

/**
 * Source with its comments removed, so an assertion about what the CODE does is not satisfied (or
 * defeated) by prose describing it. These files explain their own reasoning at length — the hook's
 * header names `isFetching` precisely to say it is NOT used — so an un-stripped grep would read
 * the explanation as the implementation.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ── P — the noun waits for its row ────────────────────────────────────────────────────────────

describe("P — an unresolved occasion renders NO noun", () => {
  it("P1: the wedding defect itself — unresolved says '3', never '3 travelers'", () => {
    // The row that has not arrived yet looks exactly like the row that says nothing.
    assert.equal(partyLabelForOccasion(3, null, null, false), "3");
    assert.equal(partyLabelForOccasion(3, undefined, undefined, false), "3");
    // …and once it lands, the occasion's own word.
    assert.equal(partyLabelForOccasion(3, "guests", null, true), "3 guests");
  });

  it("P2: an unresolved lookup ignores a vocabulary it happens to have been handed", () => {
    // A caller must not be able to smuggle a noun past the gate by passing one: while the lookup
    // is unsettled the row is not this surface's answer, whatever spelling reached the argument.
    assert.equal(partyLabelForOccasion(4, "attendees", true, false), "4");
    assert.equal(partyLabelForOccasion(1, "guests", null, false), "1");
  });

  it("P3: RESOLVED is byte-identical to partyCountLabel, ruling 28's fallback included", () => {
    const cases: Array<[number | null | undefined, string | null, boolean | null]> = [
      [3, "guests", null],
      [1, "guests", null],
      [2, "attendees", null],
      // A resolved row with NO vocabulary is a FINISHED answer: "travelers" is correct here and
      // this gate must never suppress it. That is the half of ruling 28 the fix must not break.
      [2, null, null],
      [2, "nonsense-not-in-the-set", null],
      // `default_guests: false` still beats the column, inside the helper and not at a call site.
      [3, "guests", false],
    ];
    for (const [count, vocabulary, hasGuestList] of cases) {
      assert.equal(
        partyLabelForOccasion(count, vocabulary, hasGuestList, true),
        partyCountLabel(count, vocabulary, hasGuestList),
      );
    }
    assert.equal(partyLabelForOccasion(2, null, null, true), "2 travelers");
  });

  it("P4: honest-or-absent survives the placeholder — a count nobody stated stays ''", () => {
    // §13: the gate may only remove the NOUN. It must never turn an unstated count into "0",
    // which is the failure `partyCountLabel` already refuses on the settled side.
    for (const n of [0, -1, null, undefined, NaN, Infinity]) {
      assert.equal(partyCountOnly(n as number | null | undefined), "");
      assert.equal(partyLabelForOccasion(n as number | null | undefined, "guests", null, false), "");
      assert.equal(partyLabelForOccasion(n as number | null | undefined, "guests", null, true), "");
    }
  });

  it("P5: partyCountOnly is the count and NOTHING else", () => {
    assert.equal(partyCountOnly(1), "1");
    assert.equal(partyCountOnly(3), "3");
    assert.equal(partyCountOnly(12), "12");
    // No noun, singular or plural, in any form.
    for (const n of [1, 2, 3]) {
      assert.ok(!/[a-z]/i.test(partyCountOnly(n)), `partyCountOnly(${n}) must carry no word`);
    }
  });

  it("P6: the two states are DIFFERENT for the row that matters, and equal where they should be", () => {
    // The defect in one line: same inputs, one flag apart, different words.
    assert.notEqual(
      partyLabelForOccasion(3, "guests", null, false),
      partyLabelForOccasion(3, "guests", null, true),
    );
    // And the plain-plan case is only a suffix apart — the count never changes, ever.
    assert.ok(partyLabelForOccasion(3, null, null, true).startsWith(partyCountOnly(3)));
  });
});

// ── E — "no items" waits for the data that would show them ────────────────────────────────────

describe("E — the empty-state sentence is a claim, and waits for its data", () => {
  it("E1: the defect itself — an unresolved occasion with no slots says NOTHING", () => {
    assert.equal(showsSlipEmptyState(0, false), false);
  });

  it("E2: a resolved plan with genuinely no slots still says it", () => {
    assert.equal(showsSlipEmptyState(0, true), true);
  });

  it("E3: real slots are NEVER gated on the occasion — items render the moment they exist", () => {
    // A plan with items must not lose them to this gate in either state; the predicate answers
    // only whether the SENTENCE may be shown.
    for (const resolved of [true, false]) {
      for (const slots of [1, 3, 20]) {
        assert.equal(showsSlipEmptyState(slots, resolved), false);
      }
    }
  });

  it("E4: it is exactly 'resolved AND empty' — no other combination says it", () => {
    const shown: Array<[number, boolean]> = [];
    for (const slots of [0, 1, 2]) {
      for (const resolved of [true, false]) {
        if (showsSlipEmptyState(slots, resolved)) shown.push([slots, resolved]);
      }
    }
    assert.deepEqual(shown, [[0, true]]);
  });
});

// ── A — the shipped artifacts actually go through the gates ───────────────────────────────────

describe("A — the call sites use the gate rather than reaching past it", () => {
  it("A1: SlipView's empty-state line is behind showsSlipEmptyState, not a bare length check", () => {
    assert.ok(
      slipViewSrc.includes("showsSlipEmptyState(daySlots.length, occasionResolved)"),
      "SlipView must gate its empty-state on the shared predicate",
    );
    // The pre-fix condition must be gone: a bare `daySlots.length === 0 &&` directly wrapping the
    // sentence is the exact shape that shipped the defect.
    assert.ok(
      !/\{daySlots\.length === 0 && \(\s*<p/.test(slipViewSrc),
      "the ungated `daySlots.length === 0 && <p…>` empty-state must not come back",
    );
    assert.ok(
      slipViewSrc.includes("No items on this plan yet."),
      "the settled copy itself is unchanged",
    );
  });

  it("A2: the loading placeholder is a placeholder — it makes no claim about the plan", () => {
    const start = slipViewSrc.indexOf('data-testid="slip-day-list-loading"');
    assert.ok(start > 0, "SlipView must render a neutral loading stand-in for the day list");
    const block = slipViewSrc.slice(start, start + 600);
    for (const claim of ["No items", "empty", "Nothing"]) {
      assert.ok(
        !block.includes(claim),
        `the loading stand-in must not say "${claim}" — it states nothing at all`,
      );
    }
  });

  it("A3: SlipView's party line goes through partyLabelForOccasion with the resolved flag", () => {
    assert.ok(
      slipViewSrc.includes("partyLabelForOccasion("),
      "SlipView must render its party label through the gated helper",
    );
    assert.ok(
      /partyLabelForOccasion\([\s\S]{0,240}?occasionResolved,\s*\)/.test(slipViewSrc),
      "…and must pass the resolution signal into it",
    );
    // The ungated helper must no longer be reachable from this surface at all.
    assert.ok(
      !/\bpartyCountLabel\(/.test(slipViewSrc),
      "SlipView must not call partyCountLabel directly — that is the ungated rail",
    );
  });

  it("A4: the Trip Strip chip uses the SAME helper, not a second answer of its own", () => {
    assert.ok(
      tripStripSrc.includes("partyCountOnly(ctx.travelers)"),
      "the strip must render the count alone while the occasion lookup is in flight",
    );
    assert.ok(
      tripStripSrc.includes("const occasionResolved = !occasionsLoading;"),
      "…gated on its own query's settled state",
    );
    // The class-based fallback is the SETTLED answer and must survive untouched.
    for (const settled of ["Party of ${ctx.travelers}", "${ctx.travelers} guests"]) {
      assert.ok(tripStripSrc.includes(settled), `the settled fallback ${settled} must survive`);
    }
  });

  it("A5: ONE resolution signal, owned by the hook that owns the lookup (§18 rule 1)", () => {
    assert.ok(hookSrc.includes("isResolved: boolean"), "the hook must expose the signal");
    assert.ok(
      hookSrc.includes("isResolved: !tripLoading && !occasionsLoading"),
      "…computed from BOTH of its own queries, once",
    );
    // `isLoading`, deliberately: a disabled query has nothing to wait for and a background
    // refetch over cached rows is already resolved. `isFetching` would strip the noun on every
    // revalidation of a row we already have.
    assert.ok(
      !/isFetching/.test(codeOnly(hookSrc)),
      "the hook must key on isLoading, not isFetching",
    );
    // And no surface re-derives it: SlipView reads the hook's field rather than watching queries.
    assert.ok(
      slipViewSrc.includes("isResolved: occasionResolved"),
      "SlipView must consume the hook's signal rather than deriving a second one",
    );
  });
});
