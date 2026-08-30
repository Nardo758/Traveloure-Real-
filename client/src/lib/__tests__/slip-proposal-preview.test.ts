/**
 * Review-first slip proposal preview (client/src/lib/slip-proposal-preview.ts) — §13 proofs.
 *
 * The whole reason this module exists is honest omission: a preview delta must be `null`
 * whenever the real figure behind it is missing, and NO baseline is ever invented. These
 * proofs pin exactly that:
 *   - money needs a real, positive baseline (a $0 / absent current plan ⇒ null);
 *   - drive time needs BOTH sides to have located legs with real durations (⇒ null otherwise);
 *   - each delta reports the true DIRECTION (saves / worse / same) — a proposal that costs
 *     more or drives longer is stated honestly, never hidden;
 *   - the two deltas are independently nullable (one real, one absent).
 *
 * DB-free by construction. Run:
 *   npx tsx --test client/src/lib/__tests__/slip-proposal-preview.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  sumLegMinutes,
  parseTotal,
  computeMoneyDelta,
  computeDriveTimeDelta,
  computeProposalPreview,
  hasHeadlineClaim,
  formatMinutes,
  formatAnchorLine,
  coordinateCoverage,
} from "../slip-proposal-preview.ts";

describe("sumLegMinutes — located-leg transit minutes, §13 omission", () => {
  it("returns null for no legs / empty legs", () => {
    assert.strictEqual(sumLegMinutes(null), null);
    assert.strictEqual(sumLegMinutes(undefined), null);
    assert.strictEqual(sumLegMinutes([]), null);
  });

  it("returns null when every leg has a null duration (unlocated — never 0-as-guess)", () => {
    assert.strictEqual(
      sumLegMinutes([{ estimatedDurationMinutes: null }, { estimatedDurationMinutes: null }]),
      null,
    );
  });

  it("sums only the legs that carry a real duration", () => {
    assert.strictEqual(
      sumLegMinutes([
        { estimatedDurationMinutes: 15 },
        { estimatedDurationMinutes: null },
        { estimatedDurationMinutes: 30 },
      ]),
      45,
    );
  });
});

describe("parseTotal", () => {
  it("parses decimal strings and numbers", () => {
    assert.strictEqual(parseTotal("1200.50"), 1200.5);
    assert.strictEqual(parseTotal(980), 980);
  });
  it("returns null for absent / non-numeric", () => {
    assert.strictEqual(parseTotal(null), null);
    assert.strictEqual(parseTotal(undefined), null);
    assert.strictEqual(parseTotal("abc"), null);
  });
});

describe("computeMoneyDelta — needs a real positive baseline", () => {
  it("null when either total is absent", () => {
    assert.strictEqual(computeMoneyDelta(null, 900), null);
    assert.strictEqual(computeMoneyDelta(1000, null), null);
  });

  it("null when the baseline is non-positive (a $0 plan can't be beaten on price)", () => {
    assert.strictEqual(computeMoneyDelta(0, 900), null);
    assert.strictEqual(computeMoneyDelta(-50, 900), null);
  });

  it("reports a real saving with a whole-percent", () => {
    assert.deepStrictEqual(computeMoneyDelta(1000, 850), {
      direction: "saves",
      amountUsd: 150,
      percent: 15,
    });
  });

  it("reports a cost increase honestly (never hidden)", () => {
    assert.deepStrictEqual(computeMoneyDelta(1000, 1200), {
      direction: "worse",
      amountUsd: 200,
      percent: 20,
    });
  });

  it("collapses a sub-dollar difference to 'same'", () => {
    assert.deepStrictEqual(computeMoneyDelta(1000, 1000.4), {
      direction: "same",
      amountUsd: 0,
      percent: 0,
    });
  });
});

describe("computeDriveTimeDelta — needs BOTH sides located", () => {
  it("null when either side is absent", () => {
    assert.strictEqual(computeDriveTimeDelta(null, 60), null);
    assert.strictEqual(computeDriveTimeDelta(90, null), null);
  });

  it("reports transit minutes saved", () => {
    assert.deepStrictEqual(computeDriveTimeDelta(120, 75), { direction: "saves", minutes: 45 });
  });

  it("reports transit minutes added honestly", () => {
    assert.deepStrictEqual(computeDriveTimeDelta(60, 95), { direction: "worse", minutes: 35 });
  });

  it("equal minutes ⇒ 'same'", () => {
    assert.deepStrictEqual(computeDriveTimeDelta(60, 60), { direction: "same", minutes: 0 });
  });
});

describe("computeProposalPreview — deltas independently nullable", () => {
  it("money real, drive-time absent (proposal has no located legs)", () => {
    const p = computeProposalPreview({
      baselineTotalUsd: 1000,
      variantTotalUsd: 800,
      baselineDriveMinutes: 90,
      variantDriveMinutes: null,
    });
    assert.deepStrictEqual(p.money, { direction: "saves", amountUsd: 200, percent: 20 });
    assert.strictEqual(p.driveTime, null);
    assert.strictEqual(hasHeadlineClaim(p), true);
  });

  it("drive-time real, money absent (no baseline cost)", () => {
    const p = computeProposalPreview({
      baselineTotalUsd: null,
      variantTotalUsd: 800,
      baselineDriveMinutes: 120,
      variantDriveMinutes: 90,
    });
    assert.strictEqual(p.money, null);
    assert.deepStrictEqual(p.driveTime, { direction: "saves", minutes: 30 });
    assert.strictEqual(hasHeadlineClaim(p), true);
  });

  it("the baseline column vs itself ⇒ both 'same' ⇒ no headline claim", () => {
    const p = computeProposalPreview({
      baselineTotalUsd: 1000,
      variantTotalUsd: 1000,
      baselineDriveMinutes: 90,
      variantDriveMinutes: 90,
    });
    assert.strictEqual(p.money?.direction, "same");
    assert.strictEqual(p.driveTime?.direction, "same");
    assert.strictEqual(hasHeadlineClaim(p), false);
  });

  it("nothing real at all ⇒ no headline claim", () => {
    const p = computeProposalPreview({
      baselineTotalUsd: null,
      variantTotalUsd: null,
      baselineDriveMinutes: null,
      variantDriveMinutes: null,
    });
    assert.strictEqual(hasHeadlineClaim(p), false);
  });
});

describe("formatMinutes", () => {
  it("renders sub-hour as minutes", () => {
    assert.strictEqual(formatMinutes(45), "45 min");
  });
  it("renders whole hours", () => {
    assert.strictEqual(formatMinutes(120), "2 hr");
  });
  it("renders hours + minutes", () => {
    assert.strictEqual(formatMinutes(80), "1 hr 20 min");
  });
});

describe("formatAnchorLine — honest anchor metadata", () => {
  it("formats complete coverage and median direct distance", () => {
    assert.strictEqual(
      formatAnchorLine({
        anchorType: "hotel",
        anchorName: "Hotel Kanra Kyoto",
        anchorMedianMeters: 2240,
        within15MinCount: 3,
        locatedStops: 5,
        totalStops: 5,
      }),
      "Hotel · Hotel Kanra Kyoto · 5/5 stops located · 2.2 km median direct distance · 3/5 stops ≤ 15 min",
    );
  });

  it("uses the human label for neighborhood and activity anchors", () => {
    assert.strictEqual(
      formatAnchorLine({ anchorType: "neighborhood", anchorName: "Gion", anchorMedianMeters: "720", locatedStops: 4, totalStops: 4 }),
      "Neighborhood · Gion · 4/4 stops located · 720 m median direct distance · stay anywhere in-area",
    );
    assert.strictEqual(
      formatAnchorLine({ anchorType: "activity", anchorName: "Tea ceremony", anchorMedianMeters: 0, locatedStops: 2, totalStops: 2 }),
      "Activity · Tea ceremony · 2/2 stops located · 0 m median direct distance · the day pivots on it",
    );
  });

  it("omits a precise median when located-stop counts are unavailable", () => {
    assert.strictEqual(
      formatAnchorLine({
        anchorType: "hotel",
        anchorName: "A real hotel",
        anchorMedianMeters: 800,
        within15MinCount: null,
        locatedStops: null,
      }),
      "Hotel · A real hotel",
    );
  });

  it("qualifies partial coverage and regional spread", () => {
    assert.strictEqual(
      formatAnchorLine({
        anchorType: "activity",
        anchorName: "Regional base",
        anchorMedianMeters: 220_000,
        locatedStops: 2,
        totalStops: 10,
      }),
      "Activity · Regional base · 2/10 stops located · anchor distance omitted · the day pivots on it",
    );
    assert.strictEqual(
      formatAnchorLine({
        anchorType: "hotel",
        anchorName: "Regional hotel",
        anchorMedianMeters: 220_000,
        locatedStops: 10,
        totalStops: 10,
      }),
      "Hotel · Regional hotel · 10/10 stops located · regional spread · 220.0 km median direct distance",
    );
  });

  it("omits the whole line when the type or name is absent, and never fabricates a median", () => {
    assert.strictEqual(formatAnchorLine({ anchorType: null, anchorName: "Hotel" }), null);
    assert.strictEqual(formatAnchorLine({ anchorType: "hotel", anchorName: " " }), null);
    assert.strictEqual(
      formatAnchorLine({ anchorType: "hotel", anchorName: "Unscored hotel", anchorMedianMeters: null }),
      "Hotel · Unscored hotel",
    );
    assert.strictEqual(
      formatAnchorLine({ anchorType: "hotel", anchorName: "Bad data", anchorMedianMeters: "not-a-number" }),
      "Hotel · Bad data",
    );
  });
});

describe("coordinateCoverage", () => {
  it("counts only complete, finite, in-range coordinate pairs", () => {
    assert.deepStrictEqual(coordinateCoverage([
      { latitude: "35.0", longitude: "135.7" },
      { latitude: null, longitude: null },
      { latitude: 91, longitude: 20 },
    ]), { locatedStops: 1, totalStops: 3, complete: false });
  });
});
