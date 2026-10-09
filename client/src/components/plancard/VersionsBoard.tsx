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
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  boardDayDateLabel,
  boardDayLabel,
  byDayHeadline,
  optimizedHeadline,
  yourPlanSummary,
  versionTotalChips,
  versionTotals,
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
  noRunCta,
  headerOffer = null,
}: {
  tripId: string;
  destination: string;
  /** The live plan's days (the plancard) — "Your plan" and the map's Draft. */
  days: PlanCardDay[];
  /** Past the free re-times, the re-time is the EXISTING paid run — the board routes there. */
  onPaidRun: () => void;
  /**
   * Smoke 10 S10-2: with NO run the board is Draft-only — the map of the plan as it stands, no
   * A/B/C toggle — and this is its call to action (the Optimize card). Absent ⇒ nothing renders.
   */
  noRunCta?: ReactNode;
  /** Ruling 3: the Trip Pass offer in the Versions header (the page owner-gates it). */
  headerOffer?: ReactNode;
}) {
  const { toast } = useToast();
  const isDesktop = useIsDesktop();
  const versionsKey = [`/api/trips/${tripId}/versions`];
  const { data: view } = useQuery<VersionsBoardView>({ queryKey: versionsKey, retry: false, staleTime: 15_000 });
  const { data: fee } = useQuery<{ feeCents?: number; currency?: string; coveredByTripPass?: boolean }>({
    // R321 S11-8: the SAME cache key the OptimizerLead's one data source reads.
    queryKey: ["/api/optimization-fee", { tripId }],
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

  if (!view) return null;
  if (!view.run || view.versions.length === 0) {
    if (!noRunCta) return null;
    return (
      <section className="mb-6 space-y-4" data-testid="versions-board" data-board-state="draft-only">
        <h2 className="text-lg font-semibold">Your plan's versions</h2>
        <p className="text-sm text-muted-foreground" data-testid="versions-draft-only">
          Only your draft so far. Optimize builds up to three versions to compare with it.
        </p>
        {sortedDays.length ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <MapControlCenter
              tripId={tripId}
              tripDestination={destination}
              days={sortedDays}
              selectedDay={Math.min(mapDayIdx, Math.max(0, sortedDays.length - 1))}
              onSelectDay={setMapDayIdx}
              compact
              readOnly
            />
          </div>
        ) : null}
        {noRunCta}
      </section>
    );
  }

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

  const dateOf = new Map(sortedDays.map((d) => [d.dayNum, d.dateIso ?? null] as const));
  const allAnchored = view.versions.length > 0 && view.versions.every((v) => !!v.anchor?.name);
  // ONE mount for the map in both modes: choose mode moves it below the cards with CSS `order`, never by
  // re-parenting it — a remount re-sizes the map mid-drag on the By day board (kyoto-slice §6 step 5).
  const map = (
    <div className={`overflow-hidden rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)]${mode === "choose" ? " order-2" : ""}`}>
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
  );

  return (
    <section className="mb-6 flex flex-col gap-4" data-testid="versions-board">
      {/* The Optimized board (ledger `2026-10-08-slip-optimized-board`): the run's eyebrow, the
          headline counted from the run's own versions and the plan's days, and what adopting does. */}
      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--slip-muted)]" data-testid="versions-run-date">
          Optimized · Run of {runDateLabel(view.run.runAt)}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="slip-display text-[28px] font-semibold leading-tight text-[color:var(--slip-ink)]" data-testid="versions-headline">
            {mode === "compare" && !isDesktop ? byDayHeadline(view.versions.length) : optimizedHeadline(view.versions.length, allDays.length)}
          </h2>
          {mode === "compare" && isDesktop ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-4 text-sm font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)]"
                onClick={() => setMode("choose")}
                data-testid="versions-back"
              >
                Back
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center rounded-[var(--slip-radius-button)] bg-[color:var(--slip-primary)] px-4 text-sm font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60"
                onClick={() => apply.mutate(picks)}
                disabled={strip.length === 0 || apply.isPending}
                data-testid="versions-apply"
              >
                {applyLabel(picks)}
              </button>
            </div>
          ) : null}
        </div>
        <p className="text-[15px] leading-snug text-[color:var(--slip-muted)]">
          {mode === "compare"
            ? isDesktop
              ? "Drag a whole day into Your plan. Reorder stops inside a day and it re-times itself."
              : "Swipe across the versions. Days that match your draft say so. Take a single day from any column."
            : `${allAnchored ? "Each version is built around one place to stay. " : ""}Adopt a whole version, or take single days from different ones. Your draft is kept.`}
        </p>
      </div>
      {headerOffer}

      {mode === "choose" ? (
        <>
        <div className="order-1 grid gap-3 lg:grid-cols-3" data-testid="versions-choose">
          {cards.map((c) => {
            const v = view.versions.find((x) => x.variantId === c.variantId);
            const chips = versionTotalChips(versionTotals(v?.days ?? []));
            return (
            <div
              key={c.variantId}
              className="overflow-hidden rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)]"
              data-testid={`versions-card-${c.label}`}
            >
              <div className="flex items-start justify-between gap-2 border-b border-[color:var(--slip-line)] px-4 pb-3 pt-3.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-muted)]">
                    Version {c.label}
                    {v?.anchor?.name ? ` · around ${v.anchor.name}` : ""}
                  </p>
                  <p className="slip-display text-xl font-semibold leading-tight text-[color:var(--slip-ink)]">{c.name}</p>
                </div>
                {c.badge ? (
                  <span
                    className="flex-shrink-0 rounded-full bg-[color:var(--slip-gold-wash)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--slip-gold-ink)]"
                    data-testid={`versions-badge-${c.label}`}
                  >
                    {c.badge}
                  </span>
                ) : null}
              </div>
              <div className="space-y-3 px-4 py-3">
                <ul className="space-y-1.5 text-sm">
                  {c.days.map((d) => {
                    const same = !!v?.days.find((x) => x.dayNumber === d.dayNumber)?.identical;
                    return (
                      <li key={d.dayNumber} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2" data-testid={`versions-card-day-${c.label}-${d.dayNumber}`}>
                        <span className="font-semibold text-[color:var(--slip-navy)]">{boardDayLabel(d.dayNumber, dateOf.get(d.dayNumber))}</span>
                        <span className={same ? "text-[color:var(--slip-muted)]" : "text-[color:var(--slip-ink)]"}>
                          {d.summary}
                          {d.matchedByName ? " · matched by name" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap gap-1.5" data-testid={`versions-totals-${c.label}`}>
                  {chips.map((ch) => (
                    <span
                      key={ch.key}
                      className={`rounded-md px-2 py-1 text-xs ${ch.warn ? "bg-[color:var(--slip-wash)] font-semibold text-[color:var(--coral-text)]" : "bg-[color:var(--slip-wash)] text-[color:var(--slip-muted)]"}`}
                    >
                      {ch.text}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-[46px] flex-1 items-center justify-center rounded-[var(--slip-radius-button)] border border-[color:var(--coral-accent)] bg-[color:var(--slip-card)] px-4 text-[15px] font-semibold text-[color:var(--coral-text)] hover:bg-[color:var(--slip-wash)] disabled:opacity-60"
                    onClick={() => apply.mutate(adoptAllPicks(view, c.variantId))}
                    disabled={apply.isPending}
                    data-testid={`versions-adopt-all-${c.label}`}
                  >
                    Adopt all {allDays.length === 1 ? "of it" : `${allDays.length} days`}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-[46px] flex-shrink-0 items-center justify-center rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] bg-[color:var(--slip-card)] px-4 text-[15px] font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)]"
                    onClick={() => {
                      setMode("compare");
                      setMapVersion(c.variantId);
                    }}
                    data-testid={`versions-by-day-${c.label}`}
                  >
                    By day
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        <p className="order-3 text-xs leading-snug text-[color:var(--slip-muted)]" data-testid="versions-keep-note">
          Versions are kept with the run. Adopting never deletes your draft.
        </p>
        </>
      ) : isDesktop ? (
        // ── 4c desktop: A / B / C / Your plan — one column per version, the days stacked ─────────
        <div className="grid grid-cols-4 items-start gap-3" data-testid="versions-desktop">
          {view.versions.map((v) => (
            <div
              key={v.variantId}
              className="overflow-hidden rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)]"
              data-testid={`versions-desk-col-${v.label}`}
            >
              <div className="flex items-start justify-between gap-2 border-b border-[color:var(--slip-line)] px-3.5 pb-2.5 pt-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-muted)]">
                    {v.label}
                    {v.anchor?.name ? ` · around ${v.anchor.name}` : ""}
                  </p>
                  <p className="slip-display text-lg font-semibold leading-tight text-[color:var(--slip-ink)]">{v.name}</p>
                </div>
                <button
                  type="button"
                  className="flex-shrink-0 rounded-lg border border-[color:var(--slip-line-strong)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)] disabled:opacity-60"
                  onClick={() => apply.mutate(adoptAllPicks(view, v.variantId))}
                  disabled={apply.isPending}
                  data-testid={`versions-desk-adopt-all-${v.label}`}
                >
                  Adopt all
                </button>
              </div>
              <div className="space-y-2 p-2.5">
                {allDays.map((dayNumber) => {
                  const c = dayColumns(view, dayNumber).find((x) => x.variantId === v.variantId)!;
                  const inPlan = picks[dayNumber] === v.variantId;
                  return (
                    <div
                      key={dayNumber}
                      className={`rounded-xl border p-2.5 text-xs ${inPlan ? "border-[color:var(--slip-teal)] bg-[color:var(--slip-teal-wash)]" : "border-[color:var(--slip-line)] bg-[color:var(--slip-ground)]"}`}
                      data-testid={`versions-desk-day-${c.label}-${dayNumber}`}
                    >
                      {/* The DAY drags by its header (times, legs and facts travel with it); a stop
                          below drags on its own as a swap-in. */}
                      <p
                        {...dragProps({ kind: "day", variantId: c.variantId, dayNumber })}
                        className="flex cursor-grab items-center gap-1.5 text-[13px] font-semibold text-[color:var(--slip-ink)]"
                        title={`Drag Version ${c.label}'s day ${dayNumber} onto Your plan`}
                        data-testid={`versions-desk-day-handle-${c.label}-${dayNumber}`}
                      >
                        <span aria-hidden="true" className="text-[color:var(--slip-muted)]">⠿</span>
                        <span className="flex-1">{boardDayDateLabel(dayNumber, dateOf.get(dayNumber))}</span>
                        <span className={`text-[11px] font-semibold ${inPlan ? "text-[color:var(--slip-teal-ink)]" : c.identical ? "text-[color:var(--slip-muted)]" : "text-[color:var(--slip-gold-ink)]"}`}>
                          {inPlan ? "in Your plan" : c.identical ? "same as draft" : c.summary}
                        </span>
                      </p>
                      {c.identical ? (
                        <p className="mt-0.5 text-[color:var(--slip-muted)]" data-testid={`versions-desk-same-${c.label}-${dayNumber}`}>Same as draft</p>
                      ) : (
                        <ol className="mt-1 space-y-0.5">
                          {c.stops.map((st) => (
                            <li
                              key={st.id}
                              {...dragProps({ kind: "swap", variantId: c.variantId, dayNumber, variantItemId: st.id })}
                              className="rounded px-1 text-[color:var(--slip-ink)] hover:bg-[color:var(--slip-wash)]"
                              data-testid={`versions-desk-stop-${st.id}`}
                            >
                              {st.startTime ? <span className="text-[color:var(--slip-muted)]">{st.startTime} </span> : null}
                              {st.name}
                            </li>
                          ))}
                        </ol>
                      )}
                      {c.matchedByName ? <p className="mt-1 text-[10px] text-[color:var(--slip-muted)]">Matched by name</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div
            className="overflow-hidden rounded-[var(--slip-radius-card)] border-2 border-dashed border-[color:var(--slip-teal)] bg-[color:var(--slip-card)]"
            data-testid="versions-desk-col-plan"
          >
            <div className="flex items-start justify-between gap-2 bg-[color:var(--slip-teal-wash)] px-3.5 pb-2.5 pt-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-teal-ink)]">Your plan</p>
                <p className="slip-display text-lg font-semibold leading-tight text-[color:var(--slip-ink)]">{yourPlanSummary(strip.length, allDays.length)}</p>
              </div>
              {stay?.anchor ? (
                <p className="max-w-[45%] text-right text-[11px] text-[color:var(--slip-teal-ink)]" data-testid="versions-stay">
                  Stays at {stay.anchor.name}
                </p>
              ) : null}
            </div>
            <div className="space-y-2 p-2.5">
              {allDays.map((dayNumber) => {
                const planStops = planDayStops(view, dayNumber);
                const gate = retimeGate(view, dayNumber, new Date(), feeLabel);
                const pickedFrom = picks[dayNumber] ? view.versions.find((v) => v.variantId === picks[dayNumber])?.label : null;
                return (
                  <div
                    key={dayNumber}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDropPlanDay(dayNumber, e.dataTransfer.getData(BOARD_DRAG_MIME), planStops.length);
                    }}
                    className={`rounded-xl p-2.5 text-xs ${pickedFrom ? "border border-[color:var(--slip-navy)] bg-[color:var(--slip-card)]" : "border border-dashed border-[color:var(--slip-line-strong)] bg-[color:var(--slip-ground)]"}`}
                    data-testid={`versions-desk-plan-day-${dayNumber}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[color:var(--slip-ink)]">{boardDayDateLabel(dayNumber, dateOf.get(dayNumber))}</p>
                      {pickedFrom ? (
                        <button
                          type="button"
                          className="rounded-md bg-[color:var(--slip-navy)] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          onClick={() => setPicks(releaseDay(picks, dayNumber))}
                          data-testid={`versions-desk-plan-pick-${dayNumber}`}
                        >
                          From {pickedFrom} · undo
                        </button>
                      ) : (
                        <span className="text-[11px] text-[color:var(--slip-muted)]">draft · drop a day here</span>
                      )}
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
                          className={`rounded px-1 ${st.fixed ? "text-[color:var(--slip-muted)]" : "cursor-grab text-[color:var(--slip-ink)] hover:bg-[color:var(--slip-wash)]"}`}
                          data-testid={`versions-desk-plan-stop-${st.id}`}
                        >
                          {st.startTime ? <span className="text-[color:var(--slip-muted)]">{st.startTime} </span> : null}
                          {st.name}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1 text-[10px] text-[color:var(--slip-gold-ink)]" data-testid={`versions-retime-line-${dayNumber}`}>
                      {gate.line}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        // ── 4b phone: day chips, snap columns, Take this day ────────────────────────────────────
        <div className="space-y-3" data-testid="versions-phone">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(allDays.length, 1), 5)}, minmax(0, 1fr))` }}>
            {allDays.map((d) => {
              const on = activePhoneDay === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPhoneDay(d)}
                  className={`min-h-[44px] rounded-xl border text-sm ${on ? "border-[color:var(--slip-navy)] bg-[color:var(--slip-navy)] font-semibold text-white" : "border-[color:var(--slip-line)] bg-[color:var(--slip-card)] text-[color:var(--slip-navy)]"}`}
                  data-testid={`versions-day-${d}`}
                >
                  {on ? boardDayDateLabel(d, dateOf.get(d)) : boardDayLabel(d, dateOf.get(d))}
                </button>
              );
            })}
          </div>
          <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2" data-testid="versions-columns">
            {dayColumns(view, activePhoneDay).map((c) => {
              const v = view.versions.find((x) => x.variantId === c.variantId);
              const taken = picks[activePhoneDay] === c.variantId;
              return (
                <div
                  key={c.variantId}
                  className="w-[85%] shrink-0 snap-center overflow-hidden rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] text-sm"
                  data-testid={`versions-col-${c.label}`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-[color:var(--slip-line)] px-4 pb-2.5 pt-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--slip-muted)]">
                        {c.label}
                        {v?.anchor?.name ? ` · ${v.anchor.name}` : ""}
                      </p>
                      <p className="slip-display text-lg font-semibold leading-tight text-[color:var(--slip-ink)]">{v?.name ?? `Version ${c.label}`}</p>
                    </div>
                    {!c.identical ? (
                      <span className="flex-shrink-0 rounded-full bg-[color:var(--slip-gold-wash)] px-2 py-1 text-[11px] font-semibold text-[color:var(--slip-gold-ink)]">
                        {c.summary}
                        {c.matchedByName ? " · matched by name" : ""}
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-3 px-4 py-3">
                    {c.identical ? (
                      <p className="text-[color:var(--slip-muted)]" data-testid={`versions-same-${c.label}`}>Same as draft</p>
                    ) : (
                      <ol className="divide-y divide-[color:var(--slip-line)]">
                        {c.stops.map((st) => (
                          <li key={st.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1.5">
                            <span className="text-[13px] font-semibold tabular-nums text-[color:var(--slip-navy)]">{st.startTime ?? ""}</span>
                            <span className="font-semibold text-[color:var(--slip-ink)]">{st.name}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="flex gap-2">
                      {!c.identical ? (
                        <button
                          type="button"
                          className={`inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--slip-radius-button)] px-3 text-sm font-semibold ${taken ? "bg-[color:var(--slip-teal-wash)] text-[color:var(--slip-teal-ink)]" : "bg-[color:var(--slip-primary)] text-[color:var(--slip-primary-ink)] hover:brightness-95"}`}
                          aria-pressed={taken}
                          onClick={() => setPicks(takeDay(picks, activePhoneDay, c.variantId))}
                          data-testid={`versions-take-${c.label}`}
                        >
                          {taken ? "Taken" : "Take this day"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex min-h-[44px] flex-shrink-0 items-center justify-center rounded-[var(--slip-radius-button)] border border-[color:var(--slip-line-strong)] px-3 text-sm font-semibold text-[color:var(--slip-navy)] hover:bg-[color:var(--slip-wash)] disabled:opacity-60"
                        onClick={() => apply.mutate(adoptAllPicks(view, c.variantId))}
                        disabled={apply.isPending}
                        data-testid={`versions-col-adopt-all-${c.label}`}
                      >
                        Adopt all of {c.label}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mode === "compare" && !isDesktop ? (
        <div className="space-y-3 rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] p-4" data-testid="versions-pick-strip">
          <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[color:var(--slip-muted)]">Your pick so far</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(allDays.length, 1), 5)}, minmax(0, 1fr))` }}>
            {allDays.map((d) => {
              const label = picks[d] ? view.versions.find((v) => v.variantId === picks[d])?.label ?? "?" : null;
              return (
                <div
                  key={d}
                  className={`flex flex-col items-center rounded-lg py-1.5 text-xs ${label ? "bg-[color:var(--slip-teal-wash)] text-[color:var(--slip-teal-ink)]" : "bg-[color:var(--slip-wash)] text-[color:var(--slip-muted)]"}`}
                  data-testid={label ? `versions-pick-${d}` : undefined}
                >
                  <span>{boardDayLabel(d, dateOf.get(d))}</span>
                  <span className="font-semibold">{label ?? "draft"}</span>
                </div>
              );
            })}
          </div>
          {stay?.anchor ? (
            <p className="text-xs text-[color:var(--slip-muted)]" data-testid="versions-stay">
              Where you stay follows Version {stay.label}: {stay.anchor.name} — you can change it afterwards.
            </p>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-[var(--slip-radius-button)] bg-[color:var(--slip-primary)] px-4 text-[15px] font-semibold text-[color:var(--slip-primary-ink)] hover:brightness-95 disabled:opacity-60"
            onClick={() => apply.mutate(picks)}
            disabled={strip.length === 0 || apply.isPending}
            data-testid="versions-apply"
          >
            {strip.length === 0 ? "Take a day to apply it" : `${applyLabel(picks)} to my plan`}
          </button>
          <button type="button" className="text-sm font-semibold text-[color:var(--slip-navy)] underline-offset-2 hover:underline" onClick={() => setMode("choose")} data-testid="versions-back">
            Back to the versions
          </button>
        </div>
      ) : null}

      {/* By day: the map sits under the columns (the boards draw the days first). ONE mount in both modes —
          choose mode places it with CSS `order`, never by re-parenting it. */}
      {map}

      {paidGate ? (
        <div className="order-4 flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--slip-gold)] bg-[color:var(--slip-gold-wash)] p-3 text-sm text-[color:var(--slip-ink)]" data-testid="versions-retime-paid">
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
