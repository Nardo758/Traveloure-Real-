/**
 * THE VERSIONS BOARD (surface step 5; spec v1.2 §2.4; boards 4a/4b/4c; R-d, R-ac; ledger
 * `2026-10-04-surface-step5-map-versions`). It reads ONE thing — `GET /api/trips/:tripId/versions`
 * (the latest run's three versions, labelled with the run date, each with its day diff and its one
 * badge) — and writes through two rails: `apply-days` (adopted days only; the draft is never deleted
 * and the run is never touched) and the one-day re-time. Every rule it shows lives in
 * `@/lib/versions-board` / `@shared/version-board` (§18 rule 1).
 *
 *   · 4a CHOOSE — three cards, a badge only where a metric wins, a per-day change line, Adopt all / By day.
 *   · 4b PHONE  — a day selector, A/B/C snap-scrolling columns, "Same as draft" for an identical day,
 *                 "Take this day", the pick strip and "Apply N days".
 *   · 4c DESKTOP (≥ 1024px) — four columns A / B / C / Your plan; the DAY drags across columns; inside
 *                 Your plan a stop reorders within its day, a stop dragged in from a version is a
 *                 swap-in, and both re-time the day — free within the run's re-time allowance, and a
 *                 paid run past it, said BEFORE anything happens.
 *
 * No minute, hour or distance value is shown (R-h): stops carry their clock times only.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MapControlCenter } from "@/components/plancard/MapControlCenter";
import type { PlanCardDay } from "@/components/plancard/plancard-types";
import type { MapVersion } from "@/lib/map-scene";
import { formatMoneyCents } from "@/lib/optimization-preview";
import { retimeLine } from "@shared/version-board";
import {
  BOARD_DRAG_MIME,
  adoptAllPicks,
  applyBody,
  applyLabel,
  boardDays,
  chooseCards,
  dayColumns,
  decodeDrag,
  dropOnPlanDay,
  encodeDrag,
  pickStrip,
  planDayStops,
  releaseDay,
  retimeGate,
  stayVersion,
  takeDay,
  type BoardDrag,
  type DayPicks,
  type VersionsBoardView,
} from "@/lib/versions-board";

const DESKTOP_QUERY = "(min-width: 1024px)";

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const on = () => setDesktop(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return desktop;
}

const runDateLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
};

export function VersionsBoard({
  tripId,
  destination,
  days,
  onPaidRun,
}: {
  tripId: string;
  destination: string;
  /** The live plan's days (the plancard) — "Your plan" and the map's Draft. */
  days: PlanCardDay[];
  /** Past the free re-times, the re-time is the EXISTING paid run — the board routes there. */
  onPaidRun: () => void;
}) {
  const { toast } = useToast();
  const isDesktop = useIsDesktop();
  const versionsKey = [`/api/trips/${tripId}/versions`];
  const { data: view } = useQuery<VersionsBoardView>({ queryKey: versionsKey, retry: false, staleTime: 15_000 });
  const { data: fee } = useQuery<{ feeCents?: number; currency?: string; coveredByTripPass?: boolean }>({
    queryKey: [`/api/optimization-fee?tripId=${encodeURIComponent(tripId)}`],
    retry: false,
    staleTime: 60_000,
  });
  const feeLabel =
    fee?.coveredByTripPass ? "covered by your Trip Pass" : typeof fee?.feeCents === "number" && fee.feeCents > 0 ? formatMoneyCents(fee.feeCents, fee.currency ?? "USD") : null;

  const [mode, setMode] = useState<"choose" | "compare">("choose");
  const [picks, setPicks] = useState<DayPicks>({});
  const [mapVersion, setMapVersion] = useState("draft");
  const sortedDays = useMemo(() => [...days].sort((a, b) => a.dayNum - b.dayNum), [days]);
  const [mapDayIdx, setMapDayIdx] = useState(0);
  const allDays = view ? boardDays(view) : [];
  const [phoneDay, setPhoneDay] = useState<number | null>(null);
  const activePhoneDay = phoneDay ?? allDays[0] ?? 1;
  const [paidGate, setPaidGate] = useState<{ dayNumber: number; line: string } | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: versionsKey });
    void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
  };

  const apply = useMutation({
    mutationFn: async (p: DayPicks) => (await apiRequest("POST", `/api/trips/${tripId}/versions/apply-days`, applyBody(p))).json(),
    onSuccess: (_r, p) => {
      const n = Object.keys(p).length;
      toast({ title: n === 1 ? "1 day adopted" : `${n} days adopted`, description: "Your draft and the run's versions are kept." });
      setPicks({});
      refresh();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Couldn't apply those days", description: e?.message }),
  });

  const retime = useMutation({
    mutationFn: async (input: { dayNumber: number; order: string[]; swapIn: { variantItemId: string } | null }) =>
      (await apiRequest("POST", `/api/trips/${tripId}/days/${input.dayNumber}/retime`, { order: input.order, swapIn: input.swapIn })).json(),
    onSuccess: (_r, input) => {
      toast({ title: `Day ${input.dayNumber} re-timed` });
      refresh();
    },
    onError: (e: any, input) => {
      // A race past the allowance is refused with nothing written — say what it would cost.
      if (/retime_paid|paid run/i.test(String(e?.message ?? ""))) {
        setPaidGate({ dayNumber: input.dayNumber, line: retimeLine({ free: false, remaining: 0, feeLabel }) });
        return;
      }
      toast({ variant: "destructive", title: "Couldn't re-time that day", description: e?.message });
    },
  });

  if (!view || !view.run || view.versions.length === 0) return null;

  const mapVersions: MapVersion[] = view.versions.map((v) => ({
    key: v.variantId,
    label: v.label,
    stops: v.stops,
    days: v.days,
    anchor: v.anchor ? { kind: "stay", name: v.anchor.name, lat: v.anchor.lat, lng: v.anchor.lng } : null,
  }));
  const cards = chooseCards(view);
  const strip = pickStrip(view, picks);
  const stay = stayVersion(view, picks);

  /** A re-time, gated BEFORE it happens: free ⇒ run it; paid ⇒ say so and route to the paid run. */
  const requestRetime = (dayNumber: number, order: string[], swapIn: { variantItemId: string } | null) => {
    const gate = retimeGate(view, dayNumber, new Date(), feeLabel);
    if (!gate.free) {
      setPaidGate({ dayNumber, line: gate.line });
      return;
    }
    setPaidGate(null);
    retime.mutate({ dayNumber, order, swapIn });
  };

  const onDropPlanDay = (dayNumber: number, raw: string, toIndex: number) => {
    const drag = decodeDrag(raw);
    if (!drag) return;
    const out = dropOnPlanDay(view, picks, dayNumber, drag, toIndex);
    if (out.action === "pick") setPicks(out.picks);
    else if (out.action === "retime") requestRetime(dayNumber, out.order, out.swapIn);
  };
  const dragProps = (d: BoardDrag) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(BOARD_DRAG_MIME, encodeDrag(d));
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    },
  });

  return (
    <section className="mb-6 space-y-4" data-testid="versions-board">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Your plan's versions</h2>
        <p className="text-xs text-muted-foreground" data-testid="versions-run-date">
          Run of {runDateLabel(view.run.runAt)}
        </p>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <MapControlCenter
          tripId={tripId}
          tripDestination={destination}
          days={sortedDays}
          selectedDay={Math.min(mapDayIdx, Math.max(0, sortedDays.length - 1))}
          onSelectDay={setMapDayIdx}
          compact
          readOnly
          versions={mapVersions}
          versionKey={mapVersion}
          onVersionChange={setMapVersion}
        />
      </div>

      {mode === "choose" ? (
        <div className="grid gap-3 md:grid-cols-3" data-testid="versions-choose">
          {cards.map((c) => (
            <div key={c.variantId} className="rounded-lg border border-border p-3 space-y-2" data-testid={`versions-card-${c.label}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">
                  Version {c.label} <span className="font-normal text-muted-foreground">· {c.name}</span>
                </p>
                {c.badge ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary" data-testid={`versions-badge-${c.label}`}>
                    {c.badge}
                  </span>
                ) : null}
              </div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {c.days.map((d) => (
                  <li key={d.dayNumber} data-testid={`versions-card-day-${c.label}-${d.dayNumber}`}>
                    Day {d.dayNumber}: {d.summary}
                    {d.matchedByName ? " · matched by name" : ""}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => apply.mutate(adoptAllPicks(view, c.variantId))}
                  disabled={apply.isPending}
                  data-testid={`versions-adopt-all-${c.label}`}
                >
                  Adopt all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMode("compare");
                    setMapVersion(c.variantId);
                  }}
                  data-testid={`versions-by-day-${c.label}`}
                >
                  By day
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : isDesktop ? (
        // ── 4c desktop: A / B / C / Your plan ─────────────────────────────────────────────────
        <div className="space-y-2" data-testid="versions-desktop">
          <div className="grid grid-cols-4 gap-2">
            {view.versions.map((v) => (
              <p key={v.variantId} className="text-sm font-semibold" data-testid={`versions-desk-col-${v.label}`}>
                Version {v.label}
              </p>
            ))}
            <p className="text-sm font-semibold" data-testid="versions-desk-col-plan">
              Your plan
            </p>
          </div>
          {allDays.map((dayNumber) => {
            const cols = dayColumns(view, dayNumber);
            const planStops = planDayStops(view, dayNumber);
            const gate = retimeGate(view, dayNumber, new Date(), feeLabel);
            const pickedFrom = picks[dayNumber] ? view.versions.find((v) => v.variantId === picks[dayNumber])?.label : null;
            return (
              <div key={dayNumber} className="grid grid-cols-4 gap-2" data-testid={`versions-desk-row-${dayNumber}`}>
                {cols.map((c) => (
                  <div
                    key={c.variantId}
                    className="rounded-md border border-border p-2 text-xs"
                    data-testid={`versions-desk-day-${c.label}-${dayNumber}`}
                  >
                    {/* The DAY drags by its header (times, legs and facts travel with it); a stop
                        below drags on its own as a swap-in. */}
                    <p
                      {...dragProps({ kind: "day", variantId: c.variantId, dayNumber })}
                      className="flex cursor-grab items-center gap-1 font-semibold"
                      title={`Drag Version ${c.label}'s day ${dayNumber} onto Your plan`}
                      data-testid={`versions-desk-day-handle-${c.label}-${dayNumber}`}
                    >
                      <span aria-hidden="true">⠿</span> Day {dayNumber}
                    </p>
                    {c.identical ? (
                      <p className="text-muted-foreground" data-testid={`versions-desk-same-${c.label}-${dayNumber}`}>Same as draft</p>
                    ) : (
                      <ol className="mt-1 space-y-0.5">
                        {c.stops.map((st) => (
                          <li
                            key={st.id}
                            {...dragProps({ kind: "swap", variantId: c.variantId, dayNumber, variantItemId: st.id })}
                            className="rounded px-1 hover:bg-muted"
                            data-testid={`versions-desk-stop-${st.id}`}
                          >
                            {st.startTime ? <span className="text-muted-foreground">{st.startTime} </span> : null}
                            {st.name}
                          </li>
                        ))}
                      </ol>
                    )}
                    {c.matchedByName ? <p className="mt-1 text-[10px] text-muted-foreground">Matched by name</p> : null}
                  </div>
                ))}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDropPlanDay(dayNumber, e.dataTransfer.getData(BOARD_DRAG_MIME), planStops.length);
                  }}
                  className="rounded-md border-2 border-dashed border-border p-2 text-xs"
                  data-testid={`versions-desk-plan-day-${dayNumber}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Day {dayNumber}</p>
                    {pickedFrom ? (
                      <button
                        type="button"
                        className="text-[10px] text-primary underline"
                        onClick={() => setPicks(releaseDay(picks, dayNumber))}
                        data-testid={`versions-desk-plan-pick-${dayNumber}`}
                      >
                        From {pickedFrom} · undo
                      </button>
                    ) : null}
                  </div>
                  <ol className="mt-1 space-y-0.5">
                    {planStops.map((st, i) => (
                      <li
                        key={st.id}
                        {...(st.fixed ? {} : dragProps({ kind: "stop", dayNumber, id: st.id }))}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDropPlanDay(dayNumber, e.dataTransfer.getData(BOARD_DRAG_MIME), i);
                        }}
                        className={`rounded px-1 ${st.fixed ? "text-muted-foreground" : "cursor-grab hover:bg-muted"}`}
                        data-testid={`versions-desk-plan-stop-${st.id}`}
                      >
                        {st.startTime ? <span className="text-muted-foreground">{st.startTime} </span> : null}
                        {st.name}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-1 text-[10px] text-muted-foreground" data-testid={`versions-retime-line-${dayNumber}`}>
                    {gate.line}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── 4b phone: day selector, snap columns, Take this day ─────────────────────────────────
        <div className="space-y-2" data-testid="versions-phone">
          <div className="flex flex-wrap gap-1">
            {allDays.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={activePhoneDay === d}
                onClick={() => setPhoneDay(d)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${activePhoneDay === d ? "bg-foreground text-background" : "text-muted-foreground"}`}
                data-testid={`versions-day-${d}`}
              >
                Day {d}
              </button>
            ))}
          </div>
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2" data-testid="versions-columns">
            {dayColumns(view, activePhoneDay).map((c) => (
              <div key={c.variantId} className="w-[85%] shrink-0 snap-center rounded-lg border border-border p-3 text-sm" data-testid={`versions-col-${c.label}`}>
                <p className="font-semibold">Version {c.label}</p>
                {c.identical ? (
                  <p className="text-muted-foreground" data-testid={`versions-same-${c.label}`}>Same as draft</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">{c.summary}{c.matchedByName ? " · matched by name" : ""}</p>
                    <ol className="mt-1 space-y-0.5 text-xs">
                      {c.stops.map((st) => (
                        <li key={st.id}>
                          {st.startTime ? <span className="text-muted-foreground">{st.startTime} </span> : null}
                          {st.name}
                        </li>
                      ))}
                    </ol>
                    <Button
                      size="sm"
                      variant={picks[activePhoneDay] === c.variantId ? "default" : "outline"}
                      className="mt-2"
                      onClick={() => setPicks(takeDay(picks, activePhoneDay, c.variantId))}
                      data-testid={`versions-take-${c.label}`}
                    >
                      {picks[activePhoneDay] === c.variantId ? "Taken" : "Take this day"}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "compare" ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="versions-pick-strip">
          {strip.length === 0 ? <p className="text-xs text-muted-foreground">No days picked yet.</p> : null}
          {strip.map((p) => (
            <span key={p.dayNumber} className="rounded-full border px-2 py-0.5 text-xs" data-testid={`versions-pick-${p.dayNumber}`}>
              Day {p.dayNumber} · {p.label}
            </span>
          ))}
          {stay?.anchor ? (
            <span className="text-xs text-muted-foreground" data-testid="versions-stay">
              Where you stay follows Version {stay.label}: {stay.anchor.name} — you can change it afterwards.
            </span>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMode("choose")} data-testid="versions-back">
              Back
            </Button>
            <Button size="sm" onClick={() => apply.mutate(picks)} disabled={strip.length === 0 || apply.isPending} data-testid="versions-apply">
              {applyLabel(picks)}
            </Button>
          </div>
        </div>
      ) : null}

      {paidGate ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20" data-testid="versions-retime-paid">
          <span>
            Day {paidGate.dayNumber}: {paidGate.line}. Nothing has been changed.
          </span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPaidGate(null)}>
              Not now
            </Button>
            <Button size="sm" onClick={onPaidRun} data-testid="versions-retime-paid-go">
              Go to Optimize
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
