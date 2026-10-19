/**
 * FB-1 step 4 — the slip's two "Your plan, fixed" taps (ledger `2026-10-19-fb1-fixed-by-tap`). Slip only (ruling (b)):
 * the Trip Card is the finalized read-out. Both post to apply-days with `unchangedSinceRun: true`; the server refuses
 * a day changed since the run and reports what the whole-plan tap skipped. Words: `@/lib/fixed-plan`.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  COMPARE_VERSIONS_LABEL,
  FIXED_DAY_BUTTON,
  FIXED_DAY_CHANGED,
  FIXED_PLAN_BUTTON,
  flaggedPlanDays,
  fixedDayResultLine,
  fixedDayState,
  fixedPlanResultLine,
  showsFixedPlanButton,
  type AppliedDay,
  type FixedPlanView,
} from "@/lib/fixed-plan";

/** The flagged days "Your plan, fixed" can fix. Only for a viewer who may edit the plan's items. */
export function useFixedPlan(tripId: string, enabled: boolean) {
  const { data } = useQuery<{ fixed: FixedPlanView | null }>({
    queryKey: [`/api/trips/${tripId}/versions/fixed`],
    enabled: enabled && !!tripId,
    retry: false,
    staleTime: 15_000,
  });
  return data?.fixed ?? null;
}

function refreshPlan(tripId: string) {
  void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
  void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/versions/fixed`] });
  void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/versions`] });
}

function useApplyFixed(tripId: string) {
  return useMutation({
    mutationFn: async (days: Array<{ day: number; variantId: string }>) =>
      (await apiRequest("POST", `/api/trips/${tripId}/versions/apply-days`, { days, unchangedSinceRun: true })).json() as Promise<{
        days: AppliedDay[];
        skipped: Array<{ day: number }>;
      }>,
    onSettled: () => refreshPlan(tripId),
  });
}

/** The whole-plan button, above the days. Nothing when no flagged day can be fixed. */
export function FixedPlanBar({ tripId, view }: { tripId: string; view: FixedPlanView | null }) {
  const apply = useApplyFixed(tripId);
  const [report, setReport] = useState<string | null>(null);
  if (!showsFixedPlanButton(view) && !report) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="slip-fixed-plan">
      {showsFixedPlanButton(view) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={apply.isPending}
          onClick={() =>
            apply.mutate(flaggedPlanDays(view), {
              onSuccess: (out) => setReport(fixedPlanResultLine(out.days.length, out.skipped?.length ?? 0)),
            })
          }
          data-testid="slip-fixed-plan-apply"
        >
          {FIXED_PLAN_BUTTON}
        </Button>
      ) : null}
      {report ? (
        <span className="text-[color:var(--slip-muted)]" data-testid="slip-fixed-plan-result">
          {report}
        </span>
      ) : null}
    </div>
  );
}

/** One flagged day's tap, or its stale line; nothing on a day with nothing to fix. */
export function FixedDayControl({ tripId, view, day }: { tripId: string; view: FixedPlanView | null; day: number | null }) {
  const apply = useApplyFixed(tripId);
  const [result, setResult] = useState<string | null>(null);
  const state = fixedDayState(view, day);
  if (result) {
    return (
      <p className="text-xs text-[color:var(--slip-muted)]" data-testid={`slip-fixed-day-result-${day}`}>
        {result}
      </p>
    );
  }
  if (!state || !view || day == null) return null;
  if (state === "changed") {
    return (
      <p className="text-xs text-[color:var(--slip-muted)]" data-testid={`slip-fixed-day-changed-${day}`}>
        {FIXED_DAY_CHANGED}{" "}
        <Link href={`/itinerary-comparison/${view.comparisonId}`} className="font-semibold underline underline-offset-2" data-testid={`slip-fixed-day-compare-${day}`}>
          {COMPARE_VERSIONS_LABEL}
        </Link>
      </p>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs"
      disabled={apply.isPending}
      onClick={() =>
        apply.mutate([{ day, variantId: view.variantId }], {
          onSuccess: (out) => setResult(fixedDayResultLine(out.days.find((d) => d.day === day)) ?? fixedPlanResultLine(out.days.length, 0)),
        })
      }
      data-testid={`slip-fixed-day-apply-${day}`}
    >
      {FIXED_DAY_BUTTON}
    </Button>
  );
}
