/**
 * Judgement metrics for a city-knowledge plan. Measurable metrics are already scored
 * before this runs. Missing credentials do not invent a score: every judgement metric
 * comes back unverifiable and the attempt is flagged.
 */
import { METRIC_IDS, capTimingScore, parseMetricReviews, type MetricId, type MetricReview } from "@shared/city-knowledge";

export interface PlanReviewInput {
  briefTitle: string;
  briefPrompt: string;
  claims: readonly { id: string; text: string }[];
  planText: string;
  autoFindings: readonly string[];
  timingViolations: number;
  timingUnverifiable: boolean;
  routingUnverifiable: boolean;
  routingScore: number | null;
}

export type ReviewComplete = (user: string) => Promise<unknown>;

const SYSTEM = [
  "You score one local-expert plan against the claims you are given.",
  "Score each metric from 0 to 4. 4 is fully met. 0 is missed or infeasible.",
  "If you cannot check a claim from the text you were given, set unverifiable true, confidence low, and score null.",
  "Do not invent travel minutes, famous-place lists, or hours that are not in the claims.",
  "Return JSON: {\"metrics\":{\"a\":{...},\"b\":{...},\"c\":{...},\"d\":{...},\"e\":{...},\"f\":{...}}}",
  "Each metric is {score, rationale, sourcesChecked, confidence, unverifiable}.",
  "confidence is \"high\" or \"low\". sourcesChecked is an array of short source labels.",
].join(" ");

export function reviewPrompt(input: PlanReviewInput): string {
  return [
    `Brief: ${input.briefTitle}`,
    input.briefPrompt,
    "Claims you may use:",
    ...input.claims.map((claim) => `- ${claim.id}: ${claim.text}`),
    "Automatic checks already done:",
    ...input.autoFindings.map((line) => `- ${line}`),
    "The applicant's plan:",
    input.planText,
    "Metric a is routing. Metric b is hours, closures, and reservations. Metric c is seasonal fit. Metric d is etiquette. Metric e is judgement. Metric f is the backup.",
  ].join("\n");
}

function unverifiableReview(rationale: string): MetricReview {
  return { score: null, rationale, sourcesChecked: [], confidence: "low", unverifiable: true };
}

export async function reviewPlan(
  input: PlanReviewInput,
  complete: ReviewComplete | null,
): Promise<{ metrics: Record<MetricId, MetricReview>; attention: boolean }> {
  let parsed = parseMetricReviews({});
  if (complete) {
    try {
      const raw = await complete(reviewPrompt(input));
      parsed = parseMetricReviews(raw);
    } catch {
      parsed = parseMetricReviews({});
    }
  } else {
    for (const id of METRIC_IDS) {
      parsed.metrics[id] = unverifiableReview("No reviewer is configured, so this metric was not scored.");
    }
    parsed.attention = true;
  }

  const metrics = parsed.metrics;
  if (input.routingUnverifiable || input.routingScore == null) {
    metrics.a = unverifiableReview("Travel minutes were not available, so the routing ratio was not scored.");
  } else {
    metrics.a = {
      score: input.routingScore,
      rationale: "Scored from the supplied minutes and the zone sequence.",
      sourcesChecked: [],
      confidence: "high",
      unverifiable: false,
    };
  }

  const capped = capTimingScore(metrics.b.score, input.timingViolations);
  metrics.b = {
    ...metrics.b,
    score: capped,
    unverifiable: input.timingUnverifiable || metrics.b.unverifiable || capped == null,
    confidence: input.timingUnverifiable || capped == null ? "low" : metrics.b.confidence,
  };
  if (input.timingViolations > 0 && metrics.b.rationale.trim().length === 0) {
    metrics.b.rationale = "A closure, last entry, or fixed-slot buffer was missed.";
  }

  let attention = false;
  for (const id of METRIC_IDS) {
    const review = metrics[id];
    if (review.score == null || review.unverifiable || review.confidence !== "high") attention = true;
  }
  return { metrics, attention };
}
