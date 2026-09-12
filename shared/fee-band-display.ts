/**
 * `fee_bands.rate_type` — the value set, and how each type is READ.
 *
 * WHY THIS IS SHARED AND NOT A CLIENT CONSTANT (§18 rule 1). The /admin/fee-bands page
 * used to partition bands with two hand-written filters (`rate_type === "percent"` and
 * `=== "flat"`). Migration 258 widened the DB CHECK to five values, so every
 * `flat_cents`, `count` and `rule` band — `concierge:ai_task` among them, a price the
 * platform actually charges — rendered NOWHERE (punchlist V-6). A page that enumerates a
 * value set by hand is a page that silently drops the next value added to it.
 *
 * THE AUTHORITY IS THE DB CHECK in `server/migrations/258_plans_reconcile.sql`, and the
 * list below is pinned to it by `server/__tests__/fee-band-admin-guards.test.ts` (derived
 * from that file with comments stripped — never a literal count). A sixth type added by a
 * later migration turns that pin red rather than quietly disappearing from the panel.
 *
 * §13: `unitNote` says what the stored number MEANS. `default_rate` is one column carrying
 * five different units, and an admin editing "299" needs to be told it is cents and not
 * dollars — a units-free number on a fee editor is a guess waiting to be saved.
 */

export const FEE_BAND_RATE_TYPES = ["percent", "flat", "flat_cents", "count", "rule"] as const;

export type FeeBandRateType = (typeof FEE_BAND_RATE_TYPES)[number];

export interface FeeBandRateTypeDisplay {
  /** Card heading for the group. */
  groupLabel: string;
  /** Input label — the unit the operator is typing in. */
  inputLabel: string;
  /** One sentence under the heading saying what the stored number means. */
  unitNote: string;
  /** Input step appropriate to the unit. */
  step: string;
}

export const FEE_BAND_RATE_TYPE_DISPLAY: Record<FeeBandRateType, FeeBandRateTypeDisplay> = {
  percent: {
    groupLabel: "Percent bands",
    inputLabel: "Rate",
    unitNote: "Stored as a fraction of the amount. 0.25 means the platform keeps 25 %.",
    step: "0.0001",
  },
  flat: {
    groupLabel: "Flat USD bands",
    inputLabel: "USD",
    unitNote: "Stored as dollars, not cents. 12.50 means $12.50.",
    step: "0.01",
  },
  flat_cents: {
    groupLabel: "Flat cent bands",
    inputLabel: "Cents",
    unitNote: "Stored as CENTS, not dollars. 299 means $2.99.",
    step: "1",
  },
  count: {
    groupLabel: "Count bands",
    inputLabel: "Count",
    unitNote: "A unitless whole number — an allowance or a step, never money.",
    step: "1",
  },
  rule: {
    groupLabel: "Rule bands",
    inputLabel: "Value",
    unitNote:
      "A rule selector. The number is not money on its own — the rule it names is in the band's description.",
    step: "1",
  },
};

/** True for a rate_type this build knows how to label. Anything else renders in its own honest group. */
export function isKnownFeeBandRateType(rateType: string): rateType is FeeBandRateType {
  return (FEE_BAND_RATE_TYPES as readonly string[]).includes(rateType);
}
