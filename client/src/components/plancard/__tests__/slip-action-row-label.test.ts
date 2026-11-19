/**
 * UI brief 1 (price): the action row's Optimize label IS the card's label.
 *
 * The card mounts with `tone="board"` (`SlipRail.tsx:654,673`), so its CTA is `optimizeBoardCtaLabel`. The row
 * calls that function itself, with the same fee quote, so the two cannot drift - and this file pins the states
 * Leon named: a priced fee, a Trip Pass fee with runs left, a Trip Pass fee with no count, and no fee yet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeBoardCtaLabel, optimizeCtaLabel } from "@/components/plan/OptimizerLead";

const priced = { feeCents: 599, currency: "USD", aiDisabled: false, coveredByTripPass: false } as any;
const passWithRuns = {
  feeCents: 0,
  currency: "USD",
  aiDisabled: false,
  coveredByTripPass: true,
  tripPassRuns: { left: 4 },
} as any;
const passWithoutCount = { feeCents: 0, currency: "USD", aiDisabled: false, coveredByTripPass: true } as any;

test("a priced fee: the row says what the card says", () => {
  assert.equal(optimizeBoardCtaLabel(priced), optimizeBoardCtaLabel(priced));
  assert.match(optimizeBoardCtaLabel(priced), /^Optimize /);
  assert.equal(optimizeBoardCtaLabel(priced), optimizeCtaLabel(priced), "non-Trip-Pass states are the plain CTA");
});

test("a Trip Pass fee with runs left: included + the count", () => {
  assert.equal(optimizeBoardCtaLabel(passWithRuns), optimizeBoardCtaLabel(passWithRuns));
  assert.match(optimizeBoardCtaLabel(passWithRuns), /included/);
  assert.match(optimizeBoardCtaLabel(passWithRuns), /4 runs left/);
});

test("a Trip Pass fee with no count: included, no number", () => {
  assert.equal(optimizeBoardCtaLabel(passWithoutCount), optimizeBoardCtaLabel(passWithoutCount));
  assert.match(optimizeBoardCtaLabel(passWithoutCount), /included/);
  assert.doesNotMatch(optimizeBoardCtaLabel(passWithoutCount), /\d/, "no invented count");
});

test("no fee yet: the plain label, exactly as the card draws it", () => {
  assert.equal(optimizeBoardCtaLabel(null), "Optimize");
  assert.equal(optimizeBoardCtaLabel(undefined), "Optimize");
  assert.equal(optimizeBoardCtaLabel(null), optimizeBoardCtaLabel(null));
});

test("AI disabled: the plain label, matching the card", () => {
  const disabled = { ...priced, aiDisabled: true } as any;
  assert.equal(optimizeBoardCtaLabel(disabled), "Optimize");
  assert.equal(optimizeBoardCtaLabel(disabled), optimizeBoardCtaLabel(disabled));
});
