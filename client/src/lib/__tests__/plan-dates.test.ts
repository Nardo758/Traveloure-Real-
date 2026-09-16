/**
 * plan-dates.test.ts — the ONE placeholder-dates derivation, exercised directly.
 *
 * Punchlist **D-22** / **R-4**; migration 302; ledger `2026-09-15-d22-dates-confirmed`.
 * CLAUDE.md §13, §18 rule 1, Locked Decisions 30, 42 D16, 45 (6).
 *
 * WHY A PURE SUITE, AND WHY IT IS THE ONE THAT MATTERS ON THE CLIENT. "Are these dates real?" is
 * asked by the slip header, the My-plans row, the Trip Card, the `.ics` exporter, the Home time
 * axis and the countdown. If each answers it locally they drift, and the failure mode is a surface
 * quietly re-certifying a window nobody picked. `shared/plan-dates.ts` is that single answer, so it
 * is proved here rather than inside any one surface's render.
 *
 *   P1  the predicate: a real stamp is YES; NULL, undefined, "" and an unparseable value are all
 *       NO — a stamp we cannot read is a stamp we cannot vouch for.
 *   P2  the boolean passthrough: a CLIENT surface holds the plancard DTO's `trip.datesConfirmed`,
 *       which is this same predicate already run once on the server. Accepting it keeps the answer
 *       in one place instead of making the client re-derive it.
 *   P3  §13 — a CONFIRMED plan renders NOTHING. No "confirmed dates" label: the unmarked case is
 *       the quiet one, and an extra chip on a correct plan is noise that teaches people to ignore
 *       the chip that matters.
 *   P4  §13 — an UNCONFIRMED plan gets the chip AND the sentence, and neither of them says "no
 *       dates". The plan HAS a window (`start_date`/`end_date` are NOT NULL); what it lacks is
 *       anybody's answer.
 *   P5  Locked Decision 42 D16 — the CTA is the OWNER's alone. An advisor sees the placeholder and
 *       no button: they read, note, suggest and message, and choosing the traveler's dates for
 *       them is not one of those.
 *   P6  the instant gate: BOTH halves are required (Locked Decision 30's zone AND this ruling's
 *       day), so three of the four combinations withhold the claim.
 *   P7  ONE SPELLING. The chip, the note and the CTA are constants, not literals re-typed per
 *       surface — the thing §18 rule 1 exists to keep true.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_DATES_PLACEHOLDER_CHIP,
  PLAN_DATES_PLACEHOLDER_NOTE,
  PLAN_DATES_SET_CTA,
  planDatesAreConfirmed,
  planDatesLabel,
  planInstantIsClaimable,
} from "@shared/plan-dates";

test("P1 · the predicate answers YES only for a stamp it can read", () => {
  assert.equal(planDatesAreConfirmed(new Date("2026-09-15T10:00:00Z")), true);
  assert.equal(planDatesAreConfirmed("2026-09-15T10:00:00.000Z"), true);

  assert.equal(planDatesAreConfirmed(null), false, "NULL = never confirmed");
  assert.equal(planDatesAreConfirmed(undefined), false, "an un-widened payload claims nothing");
  assert.equal(planDatesAreConfirmed(""), false);
  assert.equal(planDatesAreConfirmed("   "), false);
  assert.equal(planDatesAreConfirmed("not a date"), false, "an unreadable stamp is not a claim");
  assert.equal(planDatesAreConfirmed(new Date("nope")), false);
});

test("P2 · the server's own already-resolved boolean passes straight through", () => {
  assert.equal(planDatesAreConfirmed(true), true);
  assert.equal(planDatesAreConfirmed(false), false);
});

test("P3 · a confirmed plan renders nothing at all", () => {
  const label = planDatesLabel(new Date("2026-09-15T10:00:00Z"), true);
  assert.equal(label.confirmed, true);
  assert.equal(label.chip, null, "a confirmed plan must not carry a 'confirmed dates' label");
  assert.equal(label.note, null);
  assert.equal(label.cta, null, "there is nothing to set — the dates are already the traveler's");
});

test("P4 · an unconfirmed plan is labelled a placeholder, and never as having no dates", () => {
  const label = planDatesLabel(null, false);
  assert.equal(label.confirmed, false);
  assert.equal(label.chip, PLAN_DATES_PLACEHOLDER_CHIP);
  assert.equal(label.note, PLAN_DATES_PLACEHOLDER_NOTE);

  // §13 in the direction that matters: the plan HAS a window (`start_date`/`end_date` are NOT
  // NULL). Saying "no dates" would be false, and saying nothing would present the fulfilment
  // job's `new Date()` as the traveler's answer.
  for (const text of [label.chip, label.note]) {
    assert.ok(text, "the unconfirmed case must say something");
    assert.ok(!/no dates|dates missing|not set/i.test(text!), `"${text}" claims the plan has no dates`);
  }
});

test("P5 · the CTA is the owner's alone (Locked Decision 42 D16)", () => {
  assert.equal(planDatesLabel(null, true).cta, PLAN_DATES_SET_CTA);
  assert.equal(planDatesLabel(null, false).cta, null, "an advisor may not choose the traveler's dates");
  // The default is the non-owner answer: a caller that forgets to say who is looking shows no
  // button, which is the harmless failure.
  assert.equal(planDatesLabel(null).cta, null);
  // A non-owner still SEES the placeholder — they are told the truth, just not offered the write.
  assert.equal(planDatesLabel(null, false).chip, PLAN_DATES_PLACEHOLDER_CHIP);
});

test("P6 · an instant may be pinned only when BOTH the zone and the day are real", () => {
  assert.equal(planInstantIsClaimable(true, true), true);
  assert.equal(planInstantIsClaimable(true, false), false, "a known zone over a guessed day is still a guess");
  assert.equal(planInstantIsClaimable(false, true), false, "Locked Decision 30: no zone, no instant");
  assert.equal(planInstantIsClaimable(false, false), false);
});

test("P7 · the chip, the note and the CTA are stated once", () => {
  for (const s of [PLAN_DATES_PLACEHOLDER_CHIP, PLAN_DATES_PLACEHOLDER_NOTE, PLAN_DATES_SET_CTA]) {
    assert.equal(typeof s, "string");
    assert.ok(s.trim().length > 0);
  }
  // The label derivation returns the constants themselves — a surface reading `label.chip` and a
  // surface reading the constant can never disagree (§18 rule 1).
  const label = planDatesLabel(undefined, true);
  assert.equal(label.chip, PLAN_DATES_PLACEHOLDER_CHIP);
  assert.equal(label.note, PLAN_DATES_PLACEHOLDER_NOTE);
  assert.equal(label.cta, PLAN_DATES_SET_CTA);
});
