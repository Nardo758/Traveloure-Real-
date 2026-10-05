/**
 * `LegReviewDrawer` — the leg review stepper (work plan L2-4, enhancement 2; ledger
 * `2026-10-05-leg-review-stepper`). A drawer over the Workstation's own leg rows: it walks the same
 * day pairs `WorkstationDays` draws (`buildLegReviewSteps`), one at a time, and renders each leg with
 * step 7a's ONE leg renderer (`LegRow` kind "stops", expert role — mode picker, tip, Confirm). Nothing
 * here writes a leg any other way: every change is the caller's `onLegPatch`, the same rail the rows use.
 *
 * Ruled constraints (decision-maker, Oct 5, 2026):
 *   · a pending advisor sees no edit controls — `canEdit` comes from `workstationCanEdit` and the row
 *     renders read-only without it (the server's `requireWriteAccess` is still the guard);
 *   · a stop with no coordinates is never placed — the step asks for a location and offers to show
 *     that stop (§13);
 *   · the hop map is inline SVG: two stops and a dashed straight line labelled as stop order, not a
 *     route — no tiles and no map component (R-d: one map).
 * `picked` is the server's own answer (R303's review read), never re-derived here.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PlanCardActivity, PlanCardDay } from "@/components/plancard/plancard-types";
import { LegRow, type StopLeg } from "./LegRow";
import { legGapLine } from "./WorkstationDays";
import { buildLegReviewSteps, firstReviewStep, hopMapPoints, nextOpenStep, type PointLike } from "@/lib/leg-review";

/** A row of `GET /api/trips/:tripId/transport-legs/review` (R303) — only what the stepper reads. */
interface ReviewRow {
  id: string;
  dayNumber: number;
  fromActivityId: string | null;
  toActivityId: string | null;
  from: { lat: number | null; lng: number | null };
  to: { lat: number | null; lng: number | null };
  picked: boolean;
}

export type LegPatchFn = (legId: string, patch: Record<string, unknown>) => Promise<unknown>;

export interface LegReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  days: readonly PlanCardDay[];
  /** The Workstation's own leg list (the rows render from these). */
  legs: readonly StopLeg[];
  canEdit: boolean;
  onLegPatch: LegPatchFn;
  /** "Show this stop" from a locate step: the Workstation's focus one-shot. */
  onShowStop: (itemId: string) => void;
  /** The last open step confirmed: back to the readiness checklist. */
  onFinished: () => void;
  /** Open on this leg (else the first step that still needs the author). */
  startLegId?: string | null;
  busy?: boolean;
}

const MAP_W = 320;
const MAP_H = 150;

/** The hop map: two numbered stops and a dashed straight line, labelled as order, not a route. */
export function HopMap({ from, to, fromName, toName }: { from: PointLike; to: PointLike; fromName: string; toName: string }) {
  const pts = hopMapPoints(from, to, MAP_W, MAP_H);
  if (!pts) return null;
  return (
    <figure className="space-y-1" data-testid="leg-review-hop-map">
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        width="100%"
        role="img"
        aria-label={`Stop order: ${fromName}, then ${toName}`}
        className="rounded-md border border-border bg-muted/30"
      >
        <line
          x1={pts.a.x} y1={pts.a.y} x2={pts.b.x} y2={pts.b.y}
          stroke="currentColor" strokeWidth={2} strokeDasharray="6 5" className="text-muted-foreground"
          data-testid="leg-review-hop-line"
        />
        {[{ p: pts.a, n: 1 }, { p: pts.b, n: 2 }].map(({ p, n }) => (
          <g key={n}>
            <circle cx={p.x} cy={p.y} r={10} className="fill-primary" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="white">{n}</text>
          </g>
        ))}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground" data-testid="leg-review-hop-caption">
        1 {fromName} → 2 {toName} · stop order, not a route
      </figcaption>
    </figure>
  );
}

export function LegReviewDrawer(props: LegReviewDrawerProps) {
  const { open, tripId, days, legs, canEdit } = props;
  const { data: review, refetch } = useQuery<{ legs: ReviewRow[]; firstUnpickedIndex: number | null }>({
    queryKey: [`/api/trips/${tripId}/transport-legs/review`],
    enabled: open && !!tripId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const reviewRows = review?.legs ?? [];
  const steps = useMemo(
    () => buildLegReviewSteps<PlanCardActivity, ReviewRow>(days.map((d) => ({ dayNum: d.dayNum, activities: d.activities })), reviewRows),
    [days, reviewRows],
  );
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!open) { setStarted(false); return; }
    if (!started && review) {
      setIndex(firstReviewStep(steps, props.startLegId));
      setStarted(true);
    }
  }, [open, review, started, steps, props.startLegId]);

  const step = steps[index];
  const legById = new globalThis.Map(legs.map((l) => [l.id, l] as const));

  const confirm = async (legId: string) => {
    try {
      await props.onLegPatch(legId, { proposalStatus: "confirmed" });
    } catch {
      return; // the caller's rail already said why; stay on this leg
    }
    await refetch();
    const next = nextOpenStep(steps, index, legId);
    if (next == null) {
      props.onOpenChange(false);
      props.onFinished();
    } else {
      setIndex(next);
    }
  };

  return (
    <Sheet open={open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="leg-review-drawer">
        <SheetHeader>
          <SheetTitle>Review legs</SheetTitle>
          <SheetDescription>
            {steps.length === 0
              ? "No legs to review yet — a leg sits between two stops on the same day."
              : `Leg ${Math.min(index + 1, steps.length)} of ${steps.length}`}
          </SheetDescription>
        </SheetHeader>
        {step ? (
          <div className="mt-4 space-y-3" data-testid={`leg-review-step-${index}`} data-step-kind={step.kind}>
            <p className="text-xs font-semibold text-muted-foreground">Day {step.dayNumber}</p>
            {step.kind === "leg" ? (
              <>
                <HopMap from={step.leg.from} to={step.leg.to} fromName={step.from.name} toName={step.to.name} />
                {legById.get(step.leg.id) ? (
                  <LegRow
                    kind="stops"
                    leg={legById.get(step.leg.id)!}
                    role={canEdit ? "expert" : "traveler"}
                    onModeChange={canEdit ? (m) => void props.onLegPatch(step.leg.id, { userSelectedMode: m }) : undefined}
                    onTipSave={canEdit ? (tip) => void props.onLegPatch(step.leg.id, { authorTip: tip }) : undefined}
                    onPickupDetailsSave={canEdit ? (p) => void props.onLegPatch(step.leg.id, p) : undefined}
                    onConfirm={canEdit ? () => void confirm(step.leg.id) : undefined}
                    busy={props.busy}
                    domIds={false}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Loading this leg…</p>
                )}
                {step.leg.picked ? (
                  <p className="text-[11px] text-green-700" data-testid="leg-review-picked">Picked — nothing left to do on this leg.</p>
                ) : null}
              </>
            ) : step.kind === "locate" ? (
              <div className="rounded-md border border-dashed border-border p-3 space-y-2" data-testid="leg-review-locate">
                <p className="text-sm">{step.from.name} → {step.to.name}</p>
                <p className="text-xs text-muted-foreground">
                  {step.unlocated.map((s) => s.name).join(" and ")} {step.unlocated.length > 1 ? "have" : "has"} no location yet, so this leg can't be placed or routed. Add a location to {step.unlocated.length > 1 ? "them" : "it"} first.
                </p>
                <div className="flex flex-wrap gap-2">
                  {step.unlocated.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="h-8 rounded border border-border px-2 text-xs"
                      onClick={() => { props.onOpenChange(false); props.onShowStop(s.id); }}
                      data-testid={`leg-review-show-stop-${s.id}`}
                    >
                      Show {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-3 space-y-1" data-testid="leg-review-unrouted">
                <p className="text-sm">{step.from.name} → {step.to.name}</p>
                <p className="text-xs text-muted-foreground">{legGapLine(step.from, step.to)}</p>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="h-8 rounded border border-border px-3 text-xs disabled:opacity-40"
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                data-testid="leg-review-back"
              >
                Back
              </button>
              <button
                type="button"
                className="h-8 rounded border border-border px-3 text-xs disabled:opacity-40"
                disabled={index >= steps.length - 1}
                onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
                data-testid="leg-review-next"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
