/**
 * slip-proposal-preview — pure, DB-free deltas behind the slip's REVIEW-FIRST optimize
 * proposal (ledger 2026-08-22-slip-optimize-review-first). When a slip-originated
 * "Optimize this plan" run lands on the comparison page, each AI proposal shows a short
 * preview of what the optimizer FOUND — money saved and drive-time saved — computed here
 * from the two variants' own server-derived figures. The traveler then confirms by applying
 * a proposal; nothing auto-applies.
 *
 * §13 (honest-or-absent) is the whole point of this module: every delta returns `null` when
 * the underlying real figure is missing, and NO baseline is ever invented —
 *   - money: needs a real, positive baseline total (a $0 baseline has nothing to be "less"
 *     than), else `null`;
 *   - drive time: needs BOTH variants to have at least one located transport leg with a real
 *     duration, else `null` (a variant with no located stops can't be compared — the same
 *     posture the comparison page already uses for its per-column leg summary).
 *
 * §14/§18/§19: these are DISPLAY figures over totals the server already derived (the
 * optimizer's `total_cost` metric and the routing provider's leg durations) — not a money
 * decision. Nothing here charges, refunds, or decides ownership, and no rate is applied.
 *
 * §21 (Delta-framework L3, the only surviving fragment): distance is NEVER a headline delta
 * claim to travelers — so this module headlines TIME (transit minutes) only. Distance stays
 * where it's allowed (map annotation / day-km legend) and is deliberately not modelled here.
 */

/** The one leg field these helpers read (kept import-free so the tests need no page types). */
export interface PreviewLegLike {
  estimatedDurationMinutes?: number | null;
}

/**
 * Sum a variant's located-leg transit minutes. `null` when there are no legs carrying a real
 * duration — never 0-as-a-guess for an unlocated plan (§13). Mirrors the comparison page's
 * own `legsSummary` guard (all-null → null).
 */
export function sumLegMinutes(legs: PreviewLegLike[] | null | undefined): number | null {
  if (!legs || legs.length === 0) return null;
  const mins = legs
    .map((l) => (l.estimatedDurationMinutes != null ? Number(l.estimatedDurationMinutes) : null))
    .filter((m): m is number => m != null && !Number.isNaN(m));
  if (mins.length === 0) return null;
  return mins.reduce((s, m) => s + m, 0);
}

/** Parse a decimal-string / number total into a finite number, or `null` (§13 — no guess). */
export function parseTotal(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export interface AnchorLineInputs {
  anchorType?: string | null;
  anchorName?: string | null;
  anchorMedianMeters?: string | number | null;
  /** Optional persisted scoring counts. Omit the fragment when these are unavailable. */
  within15MinCount?: number | null;
  locatedStops?: number | null;
  totalStops?: number | null;
}

export interface CoordinateCoverage {
  locatedStops: number;
  totalStops: number;
  complete: boolean;
}

export function coordinateCoverage(
  items: Array<{ latitude?: string | number | null; longitude?: string | number | null }> | null | undefined,
): CoordinateCoverage {
  const totalStops = items?.length ?? 0;
  const locatedStops = (items ?? []).filter((item) => {
    if (item.latitude == null || item.longitude == null) return false;
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }).length;
  return {
    locatedStops,
    totalStops,
    complete: totalStops > 0 && locatedStops === totalStops,
  };
}

const ANCHOR_TYPE_LABELS: Record<string, string> = {
  hotel: "Hotel",
  neighborhood: "Neighborhood",
  activity: "Activity",
};

/**
 * Format the compact anchor readout shown on a proposal card.
 *
 * `anchorMedianMeters` is a straight-line median from the server's scoring rail. It is shown as
 * distance only when coordinate coverage is complete; partial/legacy coverage never produces a
 * precise headline. Regional spreads are stated plainly rather than converted to walking time.
 */
export function formatAnchorLine(input: AnchorLineInputs): string | null {
  const type = typeof input.anchorType === "string"
    ? ANCHOR_TYPE_LABELS[input.anchorType.trim().toLowerCase()]
    : undefined;
  const name = typeof input.anchorName === "string" ? input.anchorName.trim() : "";
  if (!type || !name) return null;

  const parts = [type, name];
  const medianMeters =
    typeof input.anchorMedianMeters === "number"
      ? input.anchorMedianMeters
      : typeof input.anchorMedianMeters === "string" && input.anchorMedianMeters.trim() !== ""
        ? parseFloat(input.anchorMedianMeters)
        : null;
  const locatedStops = input.locatedStops;
  const totalStops = input.totalStops;
  const hasCoverage = Number.isInteger(locatedStops) && Number.isInteger(totalStops)
    && (locatedStops as number) >= 0 && (totalStops as number) > 0
    && (locatedStops as number) <= (totalStops as number);
  const completeCoverage = hasCoverage && locatedStops === totalStops;

  if (hasCoverage) {
    parts.push(`${locatedStops}/${totalStops} stops located`);
  }
  if (
    completeCoverage &&
    medianMeters != null &&
    Number.isFinite(medianMeters) &&
    medianMeters >= 0
  ) {
    const distance = medianMeters < 1000
      ? `${Math.round(medianMeters)} m`
      : `${(medianMeters / 1000).toFixed(1)} km`;
    if (medianMeters > 25_000) parts.push("regional spread");
    parts.push(`${distance} median direct distance`);
  } else if (hasCoverage && !completeCoverage) {
    parts.push("anchor distance omitted");
  }

  if (input.anchorType?.trim().toLowerCase() === "neighborhood") {
    parts.push("stay anywhere in-area");
  } else if (input.anchorType?.trim().toLowerCase() === "activity") {
    parts.push("the day pivots on it");
  }

  const within15MinCount = input.within15MinCount;
  if (
    completeCoverage &&
    Number.isInteger(within15MinCount) &&
    (within15MinCount as number) >= 0 &&
    (within15MinCount as number) <= (locatedStops as number)
  ) {
    parts.push(`${within15MinCount}/${locatedStops} stops ≤ 15 min`);
  }

  return parts.join(" · ");
}

export type DeltaDirection = "saves" | "worse" | "same";

export interface MoneyDelta {
  /** `saves` = cheaper than the current plan; `worse` = costs more; `same` = within $1. */
  direction: DeltaDirection;
  /** Absolute dollar difference, rounded to whole dollars. 0 when `same`. */
  amountUsd: number;
  /** Whole-percent of the baseline the difference represents. 0 when `same`. */
  percent: number;
}

export interface TimeDelta {
  /** `saves` = less time in transit; `worse` = more; `same` = within a minute. */
  direction: DeltaDirection;
  /** Absolute minute difference, rounded. 0 when `same`. */
  minutes: number;
}

/**
 * Money delta between the current plan's total and a proposal's total (both server-derived).
 * `null` when there is no honest baseline to compare against — an absent total on either side,
 * or a non-positive baseline (a $0 current plan can't be beaten on price, §13).
 */
export function computeMoneyDelta(
  baselineTotalUsd: number | null,
  variantTotalUsd: number | null,
): MoneyDelta | null {
  if (baselineTotalUsd == null || variantTotalUsd == null) return null;
  if (baselineTotalUsd <= 0) return null;
  const diff = baselineTotalUsd - variantTotalUsd; // positive ⇒ the proposal is cheaper
  const amountUsd = Math.round(Math.abs(diff));
  if (amountUsd === 0) return { direction: "same", amountUsd: 0, percent: 0 };
  const percent = Math.round((amountUsd / baselineTotalUsd) * 100);
  return { direction: diff > 0 ? "saves" : "worse", amountUsd, percent };
}

/**
 * Drive-time delta between the current plan's transit minutes and a proposal's. `null` unless
 * BOTH sides have a real summed duration (§13 — an unlocated plan is never treated as 0 min).
 */
export function computeDriveTimeDelta(
  baselineMinutes: number | null,
  variantMinutes: number | null,
): TimeDelta | null {
  if (baselineMinutes == null || variantMinutes == null) return null;
  const diff = baselineMinutes - variantMinutes; // positive ⇒ the proposal is faster
  const minutes = Math.round(Math.abs(diff));
  if (minutes === 0) return { direction: "same", minutes: 0 };
  return { direction: diff > 0 ? "saves" : "worse", minutes };
}

export interface ProposalPreview {
  money: MoneyDelta | null;
  driveTime: TimeDelta | null;
}

export interface ProposalPreviewInputs {
  baselineTotalUsd: number | null;
  variantTotalUsd: number | null;
  baselineDriveMinutes: number | null;
  variantDriveMinutes: number | null;
}

/**
 * Assemble the two deltas for one proposal. Each is independently nullable — a proposal can
 * honestly show a money saving with no drive-time claim (or vice versa) when only one side
 * has the real data.
 */
export function computeProposalPreview(inputs: ProposalPreviewInputs): ProposalPreview {
  return {
    money: computeMoneyDelta(inputs.baselineTotalUsd, inputs.variantTotalUsd),
    driveTime: computeDriveTimeDelta(inputs.baselineDriveMinutes, inputs.variantDriveMinutes),
  };
}

/** True when a preview has at least one real, non-"same" claim worth surfacing to the traveler. */
export function hasHeadlineClaim(preview: ProposalPreview): boolean {
  return (
    (preview.money != null && preview.money.direction !== "same") ||
    (preview.driveTime != null && preview.driveTime.direction !== "same")
  );
}

/** Human minutes → "45 min" / "1 hr 20 min" (no invented precision; whole minutes in). */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m} min`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`;
}
