/**
 * Audit B8 (ledger `2026-10-26-b8-remaining-unchecked-minutes`): the optimizer's `travel_time` metric is a
 * model-computed total ("N minutes between locations"), not a checked route time. The comparison page does
 * not draw it. The server still writes it (itinerary-optimizer.ts); only the client drops it.
 */
export const UNCHECKED_TRAVEL_METRIC_KEY = "travel_time";

export function withoutUncheckedTravelMetrics<T extends { metricKey: string }>(metrics: readonly T[]): T[] {
  return metrics.filter((m) => m.metricKey !== UNCHECKED_TRAVEL_METRIC_KEY);
}
