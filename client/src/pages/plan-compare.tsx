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
 * Phone first: one card per place, stacked, no horizontal scroll at 375 px. A place's whole name
 * wraps — never truncated (the A4 list's 390 px item).
 *
 * THE COMPARE BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-compare-board`): the
 * slip's tokens and ONE centered column at every width (ruling 7, as on the slip); the easiest place
 * leads its card with the teal "Easiest days" band and its area; each card states the server's
 * minutes per day as a strip; "Stay here" is the coral primary (ruling 2). Every pinned sentence and
 * figure is unchanged.
 */
import "@/styles/slip-tokens.css";
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
  compareEyebrow,
  compareTitle,
  dayStripCells,
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
      <span className="text-[11px] font-semibold text-[color:var(--slip-muted)]">{label}</span>
      <span className="text-[17px] font-semibold text-[color:var(--slip-ink)]" data-testid={`${testId}-value`}>
        {cell.value}
      </span>
      <span className="text-[11px] text-[color:var(--slip-muted)] break-words" data-testid={`${testId}-note`}>
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
  const strip = dayStripCells(option.fit);
  const primaryBtn =
    "inline-flex min-h-[48px] flex-1 items-center justify-center rounded-[var(--slip-radius-button)] bg-[color:var(--slip-primary)] px-4 text-[15px] font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60";
  const quietBtn =
    "inline-flex min-h-[48px] flex-shrink-0 items-center justify-center rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-4 text-[15px] font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)]";
  return (
    <li
      className={`flex min-w-0 flex-col overflow-hidden rounded-[var(--slip-radius-card)] bg-[color:var(--slip-card)] ${option.easiest ? "border-2 border-[color:var(--slip-teal)]" : "border border-[color:var(--slip-line)]"}`}
      data-testid={`compare-option-${option.id}`}
      data-fit-rank={option.fitRank ?? ""}
    >
      {option.easiest ? (
        <div className="flex items-center justify-between gap-3 bg-[color:var(--slip-teal-wash)] px-4 py-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-teal-ink)]"
            data-testid={`compare-easiest-${option.id}`}
          >
            Easiest days
          </span>
          {area ? <span className="min-w-0 truncate text-xs text-[color:var(--slip-teal-ink)]">{area}</span> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="slip-display text-xl font-semibold leading-tight text-[color:var(--slip-ink)] break-words" data-testid={`compare-name-${option.id}`}>
            {option.title}
          </span>
          {area && !option.easiest ? <span className="text-[13px] text-[color:var(--slip-muted)] break-words">{area}</span> : null}
        </div>
        <div ref={fitRef} className="grid grid-cols-3 gap-2" data-testid={`compare-metrics-${option.id}`}>
          <Metric label="Travel / day" cell={travelCell(option.fit)} testId={`compare-travel-${option.id}`} />
          <Metric label="Walkable" cell={areasCell(option.fit)} testId={`compare-areas-${option.id}`} />
          <Metric label="Price" cell={priceCell(option)} testId={`compare-price-${option.id}`} />
        </div>
        {strip.length ? (
          <div className="flex flex-col gap-1.5" data-testid={`compare-days-${option.id}`}>
            <span className="text-[13px] font-semibold text-[color:var(--slip-navy)]">Plan-fit by day</span>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(strip.length, 7)}, minmax(0, 1fr))` }}>
              {strip.map((c) => (
                <div key={c.day} className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg bg-[color:var(--slip-wash)] px-1 py-1.5" data-testid={`compare-day-${option.id}-${c.day}`}>
                  <span className="text-[11px] text-[color:var(--slip-muted)]">{c.label}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-[color:var(--slip-navy)]">{c.minutes}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <p className="text-xs text-[color:var(--slip-muted)]" data-testid={`compare-fit-${option.id}`}>
          {planFitLine(option.fit)}
        </p>
        {reveal && option.easierByMinutes != null ? (
          <p className="text-[13px] text-[color:var(--slip-teal-ink)]" data-testid={`compare-saves-${option.id}`}>
            {savesLine(option.easierByMinutes, option.fit)}
          </p>
        ) : null}
        <div className="flex gap-2">
          {chosen ? (
            <button
              type="button"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-[var(--slip-radius-button)] bg-[color:var(--slip-teal-wash)] px-4 text-[15px] font-semibold text-[color:var(--slip-teal-ink)]"
              aria-pressed="true"
              disabled
              data-testid={`compare-chosen-${option.id}`}
            >
              Chosen
            </button>
          ) : set.status === "open" && canChoose ? (
            <button
              type="button"
              // The board's one primary is the best fit's; the other places offer the same choice quietly.
              className={option.easiest ? primaryBtn : `${quietBtn} flex-1`}
              aria-pressed="false"
              onClick={() => choose.mutate()}
              disabled={choose.isPending}
              data-testid={`compare-choose-${option.id}`}
            >
              Stay here
            </button>
          ) : null}
          <Link href={`/plans/${tripId}`} className={quietBtn}>
            See my days
          </Link>
        </div>
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
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)]"
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
    <main
      className="slip-surface mx-auto flex w-full max-w-[680px] flex-col bg-[color:var(--slip-ground)] font-[family-name:var(--slip-font-body)]"
      data-testid={`compare-view-${set.id}`}
      data-set-status={set.status}
    >
      <div className="flex items-center gap-2 px-4 pt-4">
        {back}
        <span className="flex-1 text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--slip-muted)]" data-testid="compare-eyebrow">
          {compareEyebrow(set.label, set.options.length)}
        </span>
        <span className="h-11 w-11 shrink-0" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
        <h1 className="slip-display m-0 text-[28px] font-semibold leading-tight text-[color:var(--slip-ink)]" data-testid="compare-title">
          {compareTitle(set.options.length)}
        </h1>
        <p className="text-[15px] leading-snug text-[color:var(--slip-muted)]" data-testid="compare-intro">
          {compareIntroLine(stops.located, stops.total)}
        </p>
        {set.options.length ? (
          <ul className="grid grid-cols-1 gap-3" data-testid="compare-list">
            {set.options.map((o) => (
              <CompareCard key={o.id} tripId={tripId} set={set} option={o} canChoose={canChoose} reveal={reveal} viewId={viewId} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[color:var(--slip-muted)]">No places in this comparison yet — add them on your plan.</p>
        )}
        {set.status === "chosen" && set.easierCount ? (
          <button
            type="button"
            className="min-h-[44px] self-start text-left text-sm font-semibold text-[color:var(--slip-teal-ink)] underline"
            onClick={() => setReveal(true)}
            data-testid="compare-easier"
          >
            {easierLine(set.easierCount)}
          </button>
        ) : null}
        {set.status === "chosen" && canChoose ? (
          <Button
            variant="outline"
            className="min-h-[44px] self-start rounded-[var(--slip-radius-button)] border-[color:var(--slip-line-strong)] text-[color:var(--slip-navy)]"
            onClick={() => reopen.mutate()}
            disabled={reopen.isPending}
            data-testid="compare-reopen"
          >
            Compare again
          </Button>
        ) : null}
        <p className="text-xs leading-snug text-[color:var(--slip-muted)]" data-testid="compare-foot">
          {compareFootLine(set.status, chosen?.title ?? null, set.options.length)}
        </p>
      </div>
    </main>
  );
}
