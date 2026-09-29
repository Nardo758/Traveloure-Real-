/**
 * /plans/:tripId/compare/:setId — COMPARE THE PLACES, LED BY PLAN-FIT (Track A step A4; ledger
 * `2026-09-29-a4-plan-fit-compare`; product map §E4, §M3, §M9; golden path Step 3; Part 6 mock
 * screen 2, "Hotel compare at 375 px").
 *
 * Built ahead of the Part 6 sessions under R211 — NOT RATIFIED until they run; their findings are an
 * A4 follow-up, not a rewrite.
 *
 * Every figure is the SERVER's: minutes per day, walkable areas, "N of M located", "est.", the rank,
 * the "Easiest days" badge, the neighbourhood, a price for the plan's own dates and M9's "less travel
 * than your choice" all arrive on `GET /api/trips/:tripId/option-sets` (§E4 — the view computes
 * nothing). Every sentence is `@/lib/plan-compare` or `planFitLine` (§18 rule 1).
 *
 * Controls mirror the rails and never widen them: Choose / Compare again for the owner or delegate
 * (R129), from the server's own `viewer` answer. A render rule grants nothing.
 *
 * Phone first: one card per place, stacked, no horizontal scroll at 375 px; three columns from `sm`.
 * A place's whole name wraps — never truncated (the A4 list's 390 px item).
 */
import { useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { compareIntroLine, planFitLine } from "@shared/plan-fit";
import {
  invalidatePlan,
  serverMessage,
  useOptionSets,
  usePlanFitShown,
  useViewId,
  type SlipOption,
  type SlipOptionSet,
} from "@/components/plancard/SlipOptionSets";
import {
  areasCell,
  compareFootLine,
  compareTitle,
  easierLine,
  optionLetter,
  priceCell,
  savesLine,
  travelCell,
  type Cell,
} from "@/lib/plan-compare";

function Metric({ label, cell, testId }: { label: string; cell: Cell; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[17px] font-semibold text-foreground" data-testid={`${testId}-value`}>
        {cell.value}
      </span>
      <span className="text-[11px] text-muted-foreground break-words" data-testid={`${testId}-note`}>
        {cell.note}
      </span>
    </div>
  );
}

function CompareCard({
  tripId,
  set,
  option,
  canChoose,
  reveal,
  viewId,
}: {
  tripId: string;
  set: SlipOptionSet;
  option: SlipOption;
  canChoose: boolean;
  reveal: boolean;
  viewId: string;
}) {
  const { toast } = useToast();
  const fitRef = useRef<HTMLDivElement>(null);
  usePlanFitShown(fitRef, { tripId, setId: set.id, optionId: option.id, surface: "compare_view", viewId, enabled: option.fit.scored });
  const choose = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/${set.id}/choose`, { optionId: option.id })).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't choose this place"), variant: "destructive" }),
  });
  // Only a CHOSEN set has a choice: a reopened set keeps `chosen_option_id` as history, and
  // drawing "Chosen" there would contradict the foot line ("Not chosen yet").
  const chosen = set.status === "chosen" && set.chosenOptionId === option.id;
  const area = option.neighborhood ?? option.locationName;
  return (
    <li
      className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-card p-3.5 ${option.easiest ? "border-2 border-foreground" : "border border-border"}`}
      data-testid={`compare-option-${option.id}`}
      data-fit-rank={option.fitRank ?? ""}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-background"
          aria-hidden="true"
        >
          {optionLetter(option.position)}
        </span>
        <div className="flex min-w-0 flex-grow flex-col gap-0.5">
          <span className="text-base font-semibold text-foreground break-words" data-testid={`compare-name-${option.id}`}>
            {option.title}
          </span>
          {area ? <span className="text-[13px] text-muted-foreground break-words">{area}</span> : null}
        </div>
        {option.easiest ? (
          <span
            className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
            data-testid={`compare-easiest-${option.id}`}
          >
            Easiest days
          </span>
        ) : null}
      </div>
      <div ref={fitRef} className="grid grid-cols-3 gap-2" data-testid={`compare-metrics-${option.id}`}>
        <Metric label="Travel / day" cell={travelCell(option.fit)} testId={`compare-travel-${option.id}`} />
        <Metric label="Walkable" cell={areasCell(option.fit)} testId={`compare-areas-${option.id}`} />
        <Metric label="Price" cell={priceCell(option)} testId={`compare-price-${option.id}`} />
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`compare-fit-${option.id}`}>
        {planFitLine(option.fit)}
      </p>
      {reveal && option.easierByMinutes != null ? (
        <p className="text-[13px] text-emerald-800 dark:text-emerald-300" data-testid={`compare-saves-${option.id}`}>
          {savesLine(option.easierByMinutes, option.fit)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button asChild variant="outline" className="min-h-[44px] flex-1">
          <Link href={`/plans/${tripId}`}>See my days</Link>
        </Button>
        {chosen ? (
          <Button className="min-h-[44px] flex-1" aria-pressed="true" disabled data-testid={`compare-chosen-${option.id}`}>
            Chosen
          </Button>
        ) : set.status === "open" && canChoose ? (
          <Button
            variant="outline"
            className="min-h-[44px] flex-1"
            aria-pressed="false"
            onClick={() => choose.mutate()}
            disabled={choose.isPending}
            data-testid={`compare-choose-${option.id}`}
          >
            Choose this place
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export default function PlanComparePage() {
  const { tripId = "", setId = "" } = useParams<{ tripId: string; setId: string }>();
  const { toast } = useToast();
  const viewId = useViewId();
  const [reveal, setReveal] = useState(false);
  const query = useOptionSets(tripId, !!tripId);
  const set = query.data?.sets.find((s) => s.id === setId) ?? null;
  const canChoose = !!query.data?.viewer?.canChoose;
  const reopen = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/trips/${tripId}/option-sets/${setId}/reopen`, {})).json(),
    onSuccess: () => invalidatePlan(tripId),
    onError: (e) => toast({ title: serverMessage(e, "Couldn't reopen this comparison"), variant: "destructive" }),
  });

  const back = (
    <Link
      href={`/plans/${tripId}`}
      aria-label="Back to your plan"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      data-testid="compare-back"
    >
      <ArrowLeft className="h-[18px] w-[18px]" />
    </Link>
  );

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the comparison…
      </div>
    );
  }
  if (!set) {
    return (
      <main className="mx-auto max-w-5xl space-y-3 p-4" data-testid="compare-not-found">
        <div className="flex items-center gap-2">
          {back}
          <h1 className="font-serif text-[22px] font-semibold text-foreground">Comparison not found</h1>
        </div>
        <p className="text-sm text-muted-foreground">This comparison isn't on your plan, or it has been removed.</p>
      </main>
    );
  }

  const chosen = set.status === "chosen" ? set.options.find((o) => o.id === set.chosenOptionId) ?? null : null;
  const stops = set.stops ?? { located: 0, total: 0 };
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col" data-testid={`compare-view-${set.id}`} data-set-status={set.status}>
      <div className="flex items-center gap-2 border-b border-border px-4 pb-3 pt-4 sm:px-5">
        {back}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {set.label ?? "Where you'll stay"}
          </span>
          <h1 className="m-0 font-serif text-[22px] font-semibold text-foreground" data-testid="compare-title">
            {compareTitle(set.options.length)}
          </h1>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
        <p className="text-sm leading-snug text-muted-foreground" data-testid="compare-intro">
          {compareIntroLine(stops.located, stops.total)}
        </p>
        {set.options.length ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="compare-list">
            {set.options.map((o) => (
              <CompareCard key={o.id} tripId={tripId} set={set} option={o} canChoose={canChoose} reveal={reveal} viewId={viewId} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No places in this comparison yet — add them on your plan.</p>
        )}
        {set.status === "chosen" && set.easierCount ? (
          <button
            type="button"
            className="min-h-[44px] self-start text-left text-sm text-emerald-800 underline dark:text-emerald-300"
            onClick={() => setReveal(true)}
            data-testid="compare-easier"
          >
            {easierLine(set.easierCount)}
          </button>
        ) : null}
        {set.status === "chosen" && canChoose ? (
          <Button
            variant="outline"
            className="min-h-[44px] self-start"
            onClick={() => reopen.mutate()}
            disabled={reopen.isPending}
            data-testid="compare-reopen"
          >
            Compare again
          </Button>
        ) : null}
        <p className="text-xs leading-snug text-muted-foreground" data-testid="compare-foot">
          {compareFootLine(set.status, chosen?.title ?? null, set.options.length)}
        </p>
      </div>
    </main>
  );
}
