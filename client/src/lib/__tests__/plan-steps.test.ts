/**
 * PLAN STEPS — the door table of the one planning modal, held to its own rules.
 * Ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33.
 *
 * WHY THIS EXISTS. "Which step does this door open on?" is a rule that fails SILENTLY: a wrong
 * answer still renders a modal, still lets the traveler through, and only shows up as a question
 * asked twice or a question never asked. The rule therefore lives in one pure function and is
 * pinned here rather than being read off the rendered modal.
 *
 * What these hold:
 *   D1  a door that carries a RESOLVED occasion skips step 1 and opens at Where; a door that
 *       carries none opens at Occasion.
 *   D2  §13 — a named-but-unresolvable occasion does NOT skip. The skip is keyed on the row, and
 *       an occasion nothing could resolve is not an answer.
 *   D3  step 5 is the occasion's own answer, and a NULL switch is NOT SET ⇒ not shown.
 *   D4  steps 2 and 3 are never skipped, and a city/destination pre-fills Where without removing
 *       it (destination and dates are NOT NULL on `trips`).
 *   D5  step 4 is always visible.
 *   D6  `source.branch` decides the FINISH, never the steps.
 *   D7  the start step is always one of the visible steps, and the next/previous helpers walk the
 *       VISIBLE list (so a hidden step 5 can never be stepped into).
 *
 * Pure unit: no DOM, no DB, no fetch.
 * Run: npx tsx --test client/src/lib/__tests__/plan-steps.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_STEP_LABELS,
  PLAN_STEP_ORDER,
  nextPlanStep,
  previousPlanStep,
  resolvePlanSteps,
  type PlanStepId,
} from "../plan-steps";
import type { OccasionSwitchRow } from "../occasion-switches";

/** A wedding-shaped row: a range, a schedule, guests. */
const WEDDING: OccasionSwitchRow = {
  defaultDuration: "range",
  defaultSchedule: true,
  defaultGuests: true,
  vocabulary: "guests",
  defaultVisibility: "shown",
};

/** A plain travel row: no internal schedule. */
const TRAVEL: OccasionSwitchRow = {
  defaultDuration: "range",
  defaultSchedule: false,
  vocabulary: "travelers",
};

/** Every "the row said nothing" spelling a reader can meet — the columns carry no DB CHECK. */
const NOT_SET: Array<OccasionSwitchRow> = [
  {},
  { defaultSchedule: null },
  // Not a member of any allowed set; reachable because there is no CHECK.
  { defaultDuration: "days", defaultSchedule: undefined },
];

describe("D1 — a door that answered the occasion opens at Where; one that did not opens at Occasion", () => {
  it("a Moment / nav / experience CTA (experienceSlug + a resolved row) opens at Where", () => {
    const { startStep } = resolvePlanSteps({ experienceSlug: "wedding" }, WEDDING, null);
    assert.equal(startStep, "where");
  });

  it("the coarse experienceType alone is enough when it resolves to a row", () => {
    const { startStep } = resolvePlanSteps({ experienceType: "wedding" }, WEDDING, null);
    assert.equal(startStep, "where");
  });

  it("the hero (no source at all) opens at Occasion", () => {
    assert.equal(resolvePlanSteps(null, null, null).startStep, "occasion");
    assert.equal(resolvePlanSteps(undefined, undefined, undefined).startStep, "occasion");
  });

  it("/start/events — a door that deliberately passes NO occasion — opens at Occasion", () => {
    // The page holds none and must not invent one; an absent field is how a door says "not known".
    assert.equal(resolvePlanSteps({}, null, null).startStep, "occasion");
  });

  it("the Trip Strip's Edit door opens at Where when the PLAN holds the occasion", () => {
    const { startStep } = resolvePlanSteps(null, WEDDING, { experienceSlug: "wedding" });
    assert.equal(startStep, "where");
  });

  it("…and at Occasion when the plan holds none", () => {
    const { startStep } = resolvePlanSteps(null, null, { destination: "Kyoto" } as never);
    assert.equal(startStep, "occasion");
  });

  it("a display NAME held in context (experienceType) counts the same as a slug", () => {
    const { startStep } = resolvePlanSteps(null, WEDDING, { experienceType: "Wedding" });
    assert.equal(startStep, "where");
  });
});

describe("D2 — §13: a named-but-unresolvable occasion is NOT an answer", () => {
  it("a door naming a slug the catalog does not carry still opens at Occasion", () => {
    // `experienceType: "retreat"` is one of the five frozen coarse keys but is NOT a seeded slug,
    // so `findOccasionByKey` returns null and the caller passes null here. The question is asked.
    const { startStep } = resolvePlanSteps({ experienceType: "retreat" }, null, null);
    assert.equal(startStep, "occasion");
  });

  it("a blank string names nothing", () => {
    assert.equal(resolvePlanSteps({ experienceSlug: "   " }, WEDDING, null).startStep, "occasion");
    assert.equal(resolvePlanSteps({ experienceSlug: "" }, WEDDING, null).startStep, "occasion");
  });

  it("a row that NOTHING named does not skip the question either", () => {
    // Defensive: a caller that resolved a row by some other route never asked the traveler.
    assert.equal(resolvePlanSteps({ city: "Kyoto" }, WEDDING, {}).startStep, "occasion");
  });
});

describe("D3 — step 5 is the occasion's own answer, and NULL is NOT SET", () => {
  it("an occasion with a schedule shows all five steps", () => {
    const { visibleSteps } = resolvePlanSteps({ experienceSlug: "wedding" }, WEDDING, null);
    assert.deepEqual(visibleSteps, ["occasion", "where", "when", "who", "events"]);
  });

  it("an occasion that says it has none shows four", () => {
    const { visibleSteps } = resolvePlanSteps({ experienceSlug: "travel" }, TRAVEL, null);
    assert.deepEqual(visibleSteps, ["occasion", "where", "when", "who"]);
  });

  it("NULL / absent / unrecognised ⇒ four steps, the plain-plan shape — never a shown step 5", () => {
    for (const row of NOT_SET) {
      const { visibleSteps } = resolvePlanSteps({ experienceSlug: "x" }, row, null);
      assert.deepEqual(
        visibleSteps,
        ["occasion", "where", "when", "who"],
        `not-set row must not show the schedule step: ${JSON.stringify(row)}`,
      );
    }
    const { visibleSteps } = resolvePlanSteps(null, null, null);
    assert.deepEqual(visibleSteps, ["occasion", "where", "when", "who"]);
  });
});

describe("D4/D5 — Where, When and Who are never skipped", () => {
  it("Where and When are in every door's visible list", () => {
    const doors: Array<Parameters<typeof resolvePlanSteps>> = [
      [null, null, null],
      [{ experienceSlug: "wedding" }, WEDDING, null],
      [{ city: "Kyoto", country: "Japan" } as never, null, null],
      [{ destination: "Kyoto, Japan", branch: "ai" }, TRAVEL, null],
    ];
    for (const args of doors) {
      const { visibleSteps } = resolvePlanSteps(...args);
      assert.ok(visibleSteps.includes("where"), `Where missing: ${JSON.stringify(args[0])}`);
      assert.ok(visibleSteps.includes("when"), `When missing: ${JSON.stringify(args[0])}`);
      assert.ok(visibleSteps.includes("who"), `Who missing: ${JSON.stringify(args[0])}`);
    }
  });

  it("a city/destination PRE-FILLS Where but never skips it", () => {
    // A ticker/city-page click knows where, and still has to ask the occasion first.
    assert.equal(resolvePlanSteps({ city: "Kyoto" }, null, null).startStep, "occasion");
    // …and with the occasion answered it lands ON Where, not past it.
    assert.equal(
      resolvePlanSteps({ city: "Kyoto", experienceSlug: "wedding" }, WEDDING, null).startStep,
      "where",
    );
  });
});

describe("D6 — a branch deep-open decides the finish, never the steps", () => {
  for (const branch of ["myself", "ai", "local", "occasion"]) {
    it(`branch "${branch}" leaves the step list and start step untouched`, () => {
      const withBranch = resolvePlanSteps({ experienceSlug: "wedding", branch }, WEDDING, null);
      const without = resolvePlanSteps({ experienceSlug: "wedding" }, WEDDING, null);
      assert.deepEqual(withBranch, without);
    });
  }
});

describe("D7 — the walk is over the VISIBLE list", () => {
  it("the start step is always visible", () => {
    const cases: Array<Parameters<typeof resolvePlanSteps>> = [
      [null, null, null],
      [{ experienceSlug: "wedding" }, WEDDING, null],
      [{ experienceSlug: "travel" }, TRAVEL, null],
    ];
    for (const args of cases) {
      const { startStep, visibleSteps } = resolvePlanSteps(...args);
      assert.ok(visibleSteps.includes(startStep), `start ${startStep} not in ${visibleSteps}`);
    }
  });

  it("next/previous never step into a hidden step 5", () => {
    const { visibleSteps } = resolvePlanSteps({ experienceSlug: "travel" }, TRAVEL, null);
    assert.equal(nextPlanStep(visibleSteps, "who"), null);
    assert.equal(nextPlanStep(visibleSteps, "when"), "who");
    assert.equal(previousPlanStep(visibleSteps, "occasion"), null);
    assert.equal(previousPlanStep(visibleSteps, "where"), "occasion");
  });

  it("with a schedule, Who is followed by What's happening", () => {
    const { visibleSteps } = resolvePlanSteps({ experienceSlug: "wedding" }, WEDDING, null);
    assert.equal(nextPlanStep(visibleSteps, "who"), "events");
    assert.equal(nextPlanStep(visibleSteps, "events"), null);
  });

  it("an unknown step walks to nothing rather than to the first step", () => {
    const { visibleSteps } = resolvePlanSteps(null, null, null);
    assert.equal(nextPlanStep(visibleSteps, "events" as PlanStepId), null);
    assert.equal(previousPlanStep(visibleSteps, "events" as PlanStepId), null);
  });
});

describe("the step vocabulary is written once", () => {
  it("every ordered step has a rail label", () => {
    for (const s of PLAN_STEP_ORDER) {
      assert.equal(typeof PLAN_STEP_LABELS[s], "string");
      assert.ok(PLAN_STEP_LABELS[s].length > 0);
    }
    assert.equal(PLAN_STEP_ORDER.length, 5);
  });
});
