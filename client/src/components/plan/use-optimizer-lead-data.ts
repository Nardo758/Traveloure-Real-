/**
 * THE OPTIMIZER LEAD'S ONE DATA SOURCE (R321, S11-8; §18 rule 1).
 *
 * `OptimizerLead` mounts in two places — the slip's Build card and the versions board's no-run
 * slot. The board passed `findings={undefined}` and read the fee under a DIFFERENT query key, so
 * the same plan showed two findings on the slip and none on the board (smoke 11). Both mounts now
 * read the SAME three queries through this hook: the free preview, the fee quote, and the
 * plancard's realised delta. Fail-soft as before: a refused read renders nothing, never a zero (§13).
 */
import { useQuery } from "@tanstack/react-query";
import type { OptimizationFeeQuote, TripOptimizationPreview } from "@/lib/optimization-preview";

export interface OptimizerLeadData {
  findings: NonNullable<TripOptimizationPreview["findings"]> | undefined;
  hasPricedItems: boolean;
  fee: OptimizationFeeQuote | null;
  realised: unknown | null;
}

export function useOptimizerLeadData(tripId: string, enabled: boolean): OptimizerLeadData {
  const { data: preview } = useQuery<TripOptimizationPreview>({
    queryKey: ["/api/optimization-preview", { tripId }],
    enabled: enabled && !!tripId,
  });
  const { data: fee } = useQuery<OptimizationFeeQuote>({
    queryKey: ["/api/optimization-fee", { tripId }],
    enabled: enabled && !!tripId,
  });
  // The realised delta after a paid run, from the plancard cache the mounting page already filled.
  const { data: plan } = useQuery<{ optimizationDelta?: unknown; lastOptimizedAt?: string | null }>({
    queryKey: [`/api/trips/${tripId}/plancard`],
    enabled: false,
  });
  return {
    findings: enabled ? preview?.findings : undefined,
    hasPricedItems: !!preview?.hasPricedItems,
    fee: enabled ? fee ?? null : null,
    realised: plan?.lastOptimizedAt ? plan.optimizationDelta ?? null : null,
  };
}
