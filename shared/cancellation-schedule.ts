/**
 * THE cancellation schedule — the ONE statement of how much a traveler gets back when they cancel,
 * by policy tier and time remaining before the scheduled start (§18 rule 1).
 *
 * Read by:
 *   - the server's refund math (`refundPercentFor`, server/services/cancellation-policy.service.ts),
 *     which delegates here and adds nothing of its own;
 *   - the tier labels (`CANCELLATION_POLICY_TYPE_LABELS` in shared/schema.ts, the seller form's
 *     `CANCELLATION_POLICY_TYPE_OPTIONS`, the service page);
 *   - help article 7 (`cancellations-and-refunds`, shared/help-articles.ts).
 *
 * Before this module the windows were typed out four times (the server switch, the schema labels,
 * the seller form and the service page), each carrying a comment asking the reader to keep it in
 * step with the others. A label that says "24 hours" while the refund path checks 48 is the drift
 * this file exists to make impossible — and `shared/__tests__/cancellation-schedule.test.ts` pins the
 * boundaries (23.99 h / 24 h / 47.99 h / 48 h / 119.99 h / 120 h / 167.99 h / 168 h / undated).
 *
 * The percent applies to what the booking charged, INCLUDING the traveler service fee, refunded at
 * the same percent (R156; ledger `2026-09-27-cancel-preview-equals-refund`, R166). That rule lives in
 * `server/services/refund-breakdown.ts`; this module only answers "what percent".
 */

export const CANCELLATION_POLICY_TYPES = ["flexible", "moderate", "strict", "non_refundable"] as const;
export type CancellationPolicyType = (typeof CANCELLATION_POLICY_TYPES)[number];

/** One refund step: at least `minHoursBefore` hours before the start refunds `percent`. */
export interface CancellationStep {
  readonly minHoursBefore: number;
  readonly percent: number;
}

export interface CancellationTier {
  readonly policy: CancellationPolicyType;
  readonly name: string;
  /** Descending by `minHoursBefore`. Inside the last step's window the refund is 0%. */
  readonly steps: readonly CancellationStep[];
  /**
   * The percent when the booking has NO parseable scheduled start: we cannot compute the time left,
   * so we cannot justify a deduction — the tier's most generous step applies (non-refundable stays 0).
   */
  readonly percentWhenUndated: number;
}

export const CANCELLATION_SCHEDULE: Readonly<Record<CancellationPolicyType, CancellationTier>> = {
  flexible: {
    policy: "flexible",
    name: "Flexible",
    steps: [{ minHoursBefore: 24, percent: 100 }],
    percentWhenUndated: 100,
  },
  moderate: {
    policy: "moderate",
    name: "Moderate",
    steps: [
      { minHoursBefore: 120, percent: 100 },
      { minHoursBefore: 48, percent: 50 },
    ],
    percentWhenUndated: 100,
  },
  strict: {
    policy: "strict",
    name: "Strict",
    steps: [{ minHoursBefore: 168, percent: 50 }],
    percentWhenUndated: 50,
  },
  non_refundable: {
    policy: "non_refundable",
    name: "Non-refundable",
    steps: [],
    percentWhenUndated: 0,
  },
};

/** Whole-percent refund for a tier, given the hours left before the start (null = undated). */
export function scheduleRefundPercent(policy: CancellationPolicyType, hoursUntilStart: number | null): number {
  const tier = CANCELLATION_SCHEDULE[policy];
  if (hoursUntilStart === null) return tier.percentWhenUndated;
  for (const step of tier.steps) {
    if (hoursUntilStart >= step.minHoursBefore) return step.percent;
  }
  return 0;
}

/** "24 hours", "48 hours", "5 days", "7 days" — whole days above 48 hours, hours at or below. */
export function formatHoursBefore(hours: number): string {
  if (hours > 48 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function percentPhrase(percent: number): string {
  return percent === 100 ? "full refund" : `${percent}% refund`;
}

/**
 * The seller-facing one-liner used as the tier's label everywhere a tier is chosen or displayed,
 * e.g. "Moderate — full refund at least 5 days before the start; 50% refund at least 48 hours before".
 * `startPhrase` names the start for a surface that has a better word for it ("check-in" for a stay).
 */
export function cancellationTierLabel(policy: CancellationPolicyType, startPhrase = "the start"): string {
  const tier = CANCELLATION_SCHEDULE[policy];
  if (tier.steps.length === 0) return `${tier.name} — no refund once booked`;
  const parts = tier.steps.map((s, i) =>
    `${percentPhrase(s.percent)} at least ${formatHoursBefore(s.minHoursBefore)} before${i === 0 ? ` ${startPhrase}` : ""}`,
  );
  return `${tier.name} — ${parts.join("; ")}`;
}

/**
 * The traveler-facing full schedule for one tier, every window stated including the 0% one,
 * e.g. "100% at least 5 days before; 50% from 48 hours to 5 days before; 0% inside 48 hours."
 * Help article 7 renders exactly this.
 */
export function cancellationTierSchedule(policy: CancellationPolicyType): string {
  const tier = CANCELLATION_SCHEDULE[policy];
  if (tier.steps.length === 0) return "no automatic refund; contact support about an exception.";
  const parts: string[] = [];
  tier.steps.forEach((s, i) => {
    const at = formatHoursBefore(s.minHoursBefore);
    if (i === 0) parts.push(`${s.percent}% at least ${at} before`);
    else parts.push(`${s.percent}% from ${at} to ${formatHoursBefore(tier.steps[i - 1].minHoursBefore)} before`);
  });
  const last = tier.steps[tier.steps.length - 1];
  parts.push(tier.steps.length === 1 ? "0% after" : `0% inside ${formatHoursBefore(last.minHoursBefore)}`);
  return `${parts.join("; ")}.`;
}

/** Every tier's label, keyed by policy — the shape `CANCELLATION_POLICY_TYPE_LABELS` has always had. */
export const CANCELLATION_TIER_LABELS: Readonly<Record<CancellationPolicyType, string>> = Object.fromEntries(
  CANCELLATION_POLICY_TYPES.map((p) => [p, cancellationTierLabel(p)]),
) as Record<CancellationPolicyType, string>;

/**
 * The SHORT label a filter chip shows, e.g. "Strict (50% refund at least 7 days before)" — the
 * tier's first window only, generated from the schedule like every other tier label (ledger
 * `2026-09-27-cancel-filter-labels`). A filter must never name a refund the schedule does not pay.
 */
export function cancellationTierFilterLabel(policy: CancellationPolicyType): string {
  const tier = CANCELLATION_SCHEDULE[policy];
  if (tier.steps.length === 0) return `${tier.name} (no refund once booked)`;
  const first = tier.steps[0];
  return `${tier.name} (${percentPhrase(first.percent)} at least ${formatHoursBefore(first.minHoursBefore)} before)`;
}
