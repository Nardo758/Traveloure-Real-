/**
 * OPTIMIZE PREVIEW LINE — what the slip is allowed to say about a run nobody has paid for.
 * Ledger `2026-09-05-optimize-preview-on-slip`; CLAUDE.md Locked Decision 41 (d), §13, §14.
 *
 * Pure: no DB, no network, no DOM. Run:
 *   npx tsx --test client/src/lib/__tests__/optimize-preview-line.test.ts
 *
 * The heuristic behind this line reads what each item IS — never where it is or when. So the
 * failure this file exists to catch is a copy edit that quietly promises a delta the heuristic
 * cannot measure ("saves 40 minutes of transit", "cut 12% off"), or a placeholder that renders
 * where an answer is missing. Both are the §13 class, and both look perfectly reasonable in a
 * diff.
 *
 * NEGATIVE SPACE (§18d): this holds the STRINGS and the fee-label branches, not the fetch, the
 * owner gate or the markup — `server/__tests__/optimize-preview-on-slip.test.ts` asserts those
 * against the shipped files.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  OPTIMIZE_PREVIEW_CAVEAT,
  TRIP_PASS_COVERED_LABEL,
  describeOptimizationPreview,
  formatOptimizationFeeLabel,
  type OptimizationFeeQuote,
  type TripOptimizationPreviewComputed,
} from "../optimization-preview";

const COMPUTED: TripOptimizationPreviewComputed = {
  computable: true,
  itemCount: 8,
  dayCount: 3,
  currentScore: 62,
  improvementRoom: 38,
  weakest: { key: "pace", label: "Pace", score: 25 },
  dimensions: [
    { key: "pace", label: "Pace", score: 25 },
    { key: "diversity", label: "Variety", score: 50 },
    { key: "balance", label: "Balance of activity types", score: 70 },
    { key: "wellness", label: "Downtime", score: 88 },
  ],
  fixedCount: 0,
};

const FEE: OptimizationFeeQuote = {
  complexityTier: "standard",
  feeCents: 1499,
  currency: "USD",
  aiDisabled: false,
  coveredByTripPass: false,
};

// ── L — the line ─────────────────────────────────────────────────────────────────────────────

test("L1: a computed preview states the score, the scope and the weakest dimension", () => {
  const line = describeOptimizationPreview(COMPUTED);
  assert.equal(line?.kind, "estimate");
  const headline = line!.kind === "estimate" ? line.headline : "";
  assert.match(headline, /62\/100/);
  assert.match(headline, /8 items over 3 days/);
  assert.match(headline, /pace is its weakest part \(25\/100\)/);
});

test("L2: singulars are singular — a one-day, one-item scope reads correctly", () => {
  const line = describeOptimizationPreview({ ...COMPUTED, itemCount: 1, dayCount: 1 });
  const headline = line!.kind === "estimate" ? line.headline : "";
  assert.match(headline, /1 item over 1 day —/);
});

test("L3: booked items are mentioned only when there are some", () => {
  const none = describeOptimizationPreview(COMPUTED);
  assert.ok(!(none!.kind === "estimate" && /stay put/.test(none.headline)));
  const some = describeOptimizationPreview({ ...COMPUTED, fixedCount: 2 });
  assert.match(some!.kind === "estimate" ? some.headline : "", /2 booked items would stay put\./);
  const one = describeOptimizationPreview({ ...COMPUTED, fixedCount: 1 });
  assert.match(one!.kind === "estimate" ? one.headline : "", /1 booked item would stay put\./);
});

test("L4: the line NEVER claims a distance, a time saved or an amount saved (§13)", () => {
  const line = describeOptimizationPreview({ ...COMPUTED, fixedCount: 3 });
  const text = line!.kind === "estimate" ? `${line.headline} ${line.caveat}` : "";
  for (const claim of [/\bsaves?\b/i, /\bsaving/i, /\bminutes? of\b/i, /\bkm\b/i, /\bmiles\b/i, /\$\d/]) {
    assert.ok(!claim.test(text), `the line must not make a ${claim} claim: ${text}`);
  }
});

test("L5: the caveat says it is a simple heuristic AND what the paid run actually builds", () => {
  assert.match(OPTIMIZE_PREVIEW_CAVEAT, /simple heuristic/i);
  assert.match(OPTIMIZE_PREVIEW_CAVEAT, /up to three anchored versions/i);
  assert.match(OPTIMIZE_PREVIEW_CAVEAT, /real listings/i);
  // "up to three" and never a flat promise of three.
  assert.ok(!/\bexactly three\b/i.test(OPTIMIZE_PREVIEW_CAVEAT));
});

test("L6: a refused preview shows the SERVER's own reason, verbatim and alone", () => {
  const reason = "This plan has nothing the optimizer would read yet.";
  const line = describeOptimizationPreview({ computable: false, reason });
  assert.deepEqual(line, { kind: "reason", reason });
});

test("L7: nothing to say renders NOTHING — never a zero score or a stand-in", () => {
  assert.equal(describeOptimizationPreview(null), null);
  assert.equal(describeOptimizationPreview(undefined), null);
  assert.equal(describeOptimizationPreview({ computable: false, reason: "" }), null);
  // A malformed body (a computable claim with no dimension behind it) is silence, not a guess.
  assert.equal(
    describeOptimizationPreview({ ...COMPUTED, weakest: undefined as any }),
    null,
  );
});

// ── F — the fee chip ─────────────────────────────────────────────────────────────────────────

test("F1: the fee is the server's amount, with the pricing page's own promise attached", () => {
  const label = formatOptimizationFeeLabel(FEE);
  assert.match(label!, /14\.99/);
  assert.match(label!, /charged only when you confirm/);
});

test("F2: Trip Pass coverage shows the existing covered label and no price", () => {
  const label = formatOptimizationFeeLabel({ ...FEE, coveredByTripPass: true });
  assert.equal(label, TRIP_PASS_COVERED_LABEL);
  assert.ok(!/\d/.test(label!), "a covered run states no amount");
});

test("F3: a disabled optimizer states NO price — there is nothing to buy (§13)", () => {
  assert.equal(formatOptimizationFeeLabel({ ...FEE, aiDisabled: true }), null);
});

test("F4: an absent or non-positive fee is omitted rather than rendered as $0.00", () => {
  assert.equal(formatOptimizationFeeLabel(null), null);
  assert.equal(formatOptimizationFeeLabel(undefined), null);
  assert.equal(formatOptimizationFeeLabel({ ...FEE, feeCents: 0 }), null);
  assert.equal(formatOptimizationFeeLabel({ ...FEE, feeCents: Number.NaN }), null);
});

test("F5: an unrecognised currency is stated, never silently printed as dollars", () => {
  const label = formatOptimizationFeeLabel({ ...FEE, currency: "ZZZZ" });
  assert.ok(label && !label.startsWith("$"), `got ${label}`);
  assert.match(label!, /ZZZZ/);
});
