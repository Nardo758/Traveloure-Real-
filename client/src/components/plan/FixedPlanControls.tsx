/**
 * FB-1 step 4 — the slip's two "Your plan, fixed" taps (ledger `2026-10-19-fb1-fixed-by-tap`). Slip only (ruling (b)):
 * the Trip Card is the finalized read-out. CONFIRM BEFORE APPLY: a tap first previews (apply-days with
 * `unchangedSinceRun: true, preview: true` — the same diff, rolled back), shows each day's counts and writes only on
 * Confirm. The server refuses a day changed since the run and reports what the whole-plan tap skipped.
 * Words: `@/lib/fixed-plan`.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  COMPARE_VERSIONS_LABEL,
  FIXED_CANCEL,
  FIXED_CONFIRM,
  FIXED_DAY_BUTTON,
  FIXED_DAY_CHANGED,
  FIXED_PLAN_BUTTON,
  fixedDayResultLine,
  fixedDayState,
  fixedPlanResultLine,
  flaggedPlanDays,
  showsFixedPlanButton,
  type AppliedDay,
  type FixedPlanView,
} from "@/lib/fixed-plan";

type ApplyAnswer = { days: AppliedDay[]; skipped: Array<{ day: number }> };
type Days = Array<{ day: number; variantId: string }>;

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

const post = async (tripId: string, days: Days, preview: boolean): Promise<ApplyAnswer> =>
  (await apiRequest("POST", `/api/trips/${tripId}/versions/apply-days`, { days, unchangedSinceRun: true, ...(preview ? { preview: true } : {}) })).json();

/** Preview → confirm → apply. `pending` holds the preview the traveler is looking at; nothing is written before Confirm. */
function useConfirmedApply(tripId: string) {
  const [pending, setPending] = useState<{ days: Days; answer: ApplyAnswer } | null>(null);
  const preview = useMutation({
    mutationFn: (days: Days) => post(tripId, days, true),
    onError: () => refreshPlan(tripId),
  });
  const apply = useMutation({ mutationFn: (days: Days) => post(tripId, days, false), onSettled: () => refreshPlan(tripId) });
  return {
    pending,
    busy: preview.isPending || apply.isPending,
    ask: (days: Days) => preview.mutate(days, { onSuccess: (answer) => setPending({ days, answer }) }),
    cancel: () => setPending(null),
    confirm: (onDone: (answer: ApplyAnswer) => void) => {
      if (!pending) return;
      // Only the days the preview would change are sent; the preview's skipped days stay skipped.
      const send = pending.days.filter((d) => pending.answer.days.some((a) => a.day === d.day));
      const skipped = pending.answer.skipped;
      setPending(null);
      if (!send.length) return onDone({ days: [], skipped });
      apply.mutate(send, { onSuccess: (answer) => onDone({ days: answer.days, skipped: [...skipped, ...(answer.skipped ?? [])] }) });
    },
  };
}

function ConfirmBox({ answer, onConfirm, onCancel, busy, testId }: { answer: ApplyAnswer; onConfirm: () => void; onCancel: () => void; busy: boolean; testId: string }) {
  const lines = answer.days.map((d) => fixedDayResultLine(d)).filter((x): x is string => !!x);
  return (
    <div className="space-y-1.5 text-xs" data-testid={testId}>
      {lines.map((l) => (
        <p key={l} className="text-[color:var(--slip-ink)]">{l}</p>
      ))}
      {answer.skipped.length ? <p className="text-[color:var(--slip-muted)]">{fixedPlanResultLine(answer.days.length, answer.skipped.map((s) => s.day))}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={onConfirm} data-testid={`${testId}-confirm`}>
          {FIXED_CONFIRM}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onCancel} data-testid={`${testId}-cancel`}>
          {FIXED_CANCEL}
        </Button>
      </div>
    </div>
  );
}

/** The whole-plan button, above the days. Nothing when no flagged day can be fixed. */
export function FixedPlanBar({ tripId, view }: { tripId: string; view: FixedPlanView | null }) {
  const flow = useConfirmedApply(tripId);
  const [report, setReport] = useState<string | null>(null);
  if (!showsFixedPlanButton(view) && !report && !flow.pending) return null;
  return (
    <div className="space-y-1.5 text-xs" data-testid="slip-fixed-plan">
      {flow.pending ? (
        <ConfirmBox
          answer={flow.pending.answer}
          busy={flow.busy}
          onCancel={flow.cancel}
          onConfirm={() => flow.confirm((out) => setReport(fixedPlanResultLine(out.days.length, out.skipped.map((s) => s.day))))}
          testId="slip-fixed-plan-preview"
        />
      ) : showsFixedPlanButton(view) ? (
        <Button size="sm" variant="outline" disabled={flow.busy} onClick={() => flow.ask(flaggedPlanDays(view))} data-testid="slip-fixed-plan-apply">
          {FIXED_PLAN_BUTTON}
        </Button>
      ) : null}
      {report ? (
        <p className="text-[color:var(--slip-muted)]" data-testid="slip-fixed-plan-result">
          {report}
        </p>
      ) : null}
    </div>
  );
}

/** One flagged day's tap, or its stale line; nothing on a day with nothing to fix. */
export function FixedDayControl({ tripId, view, day }: { tripId: string; view: FixedPlanView | null; day: number | null }) {
  const flow = useConfirmedApply(tripId);
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
  if (flow.pending) {
    return (
      <ConfirmBox
        answer={flow.pending.answer}
        busy={flow.busy}
        onCancel={flow.cancel}
        onConfirm={() => flow.confirm((out) => setResult(fixedDayResultLine(out.days.find((d) => d.day === day)) ?? fixedPlanResultLine(out.days.length, [])))}
        testId={`slip-fixed-day-preview-${day}`}
      />
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs"
      disabled={flow.busy}
      onClick={() => flow.ask([{ day, variantId: view.variantId }])}
      data-testid={`slip-fixed-day-apply-${day}`}
    >
      {FIXED_DAY_BUTTON}
    </Button>
  );
}
