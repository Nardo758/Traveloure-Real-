/**
 * UI brief 1 (price): the action row's Optimize label IS the card's label.
 *
 * The card mounts with `tone="board"` (`SlipRail.tsx:654,673`), so its CTA is `optimizeBoardCtaLabel`. The row
 * calls that function through `optimizeRowCtaLabel`, with the same fee quote, so the two cannot drift - and this
 * file pins the four states Leon named: a priced fee, a Trip Pass fee with runs left, a Trip Pass fee with no
 * count, and no fee yet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizeBoardCtaLabel, optimizeCtaLabel } from "@/components/plan/OptimizerLead";
import { optimizeRowCtaLabel } from "../SlipActionRow";

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
  assert.equal(optimizeRowCtaLabel(priced), optimizeBoardCtaLabel(priced));
  assert.match(optimizeRowCtaLabel(priced), /^Optimize /);
  assert.equal(optimizeRowCtaLabel(priced), optimizeCtaLabel(priced), "non-Trip-Pass states are the plain CTA");
});

test("a Trip Pass fee with runs left: included + the count", () => {
  assert.equal(optimizeRowCtaLabel(passWithRuns), optimizeBoardCtaLabel(passWithRuns));
  assert.match(optimizeRowCtaLabel(passWithRuns), /included/);
  assert.match(optimizeRowCtaLabel(passWithRuns), /4 runs left/);
});

test("a Trip Pass fee with no count: included, no number", () => {
  assert.equal(optimizeRowCtaLabel(passWithoutCount), optimizeBoardCtaLabel(passWithoutCount));
  assert.match(optimizeRowCtaLabel(passWithoutCount), /included/);
  assert.doesNotMatch(optimizeRowCtaLabel(passWithoutCount), /\d/, "no invented count");
});

test("no fee yet: the plain label, exactly as the card draws it", () => {
  assert.equal(optimizeRowCtaLabel(null), "Optimize");
  assert.equal(optimizeRowCtaLabel(undefined), "Optimize");
  assert.equal(optimizeRowCtaLabel(null), optimizeBoardCtaLabel(null));
});

test("AI disabled: the plain label, matching the card", () => {
  const disabled = { ...priced, aiDisabled: true } as any;
  assert.equal(optimizeRowCtaLabel(disabled), "Optimize");
  assert.equal(optimizeRowCtaLabel(disabled), optimizeBoardCtaLabel(disabled));
});
