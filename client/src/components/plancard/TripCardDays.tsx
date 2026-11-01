/**
 * The Trip Card's days (surface spec v1.3.4 §2.5; step 6 — ledger `2026-10-04-step6-trip-card`). The
 * card renders the frozen final on the SAME `DayBlock` and `ItemRow` the slip uses — read mode, no ⋯,
 * no planning control — replacing its own `DaySelector` + `ActivitiesSection` rows (spec §10 Keep:
 * "DayBlock — card step 6"). What only the card adds, each decided by a pure rule in
 * `@/lib/trip-card`:
 *   · provenance — "Finalized Oct 3 · built from Version A, run 1 · planned with … · hours re-checked …
 *     · K of N booked"
 *   · the T-3 banner (R-ad) — the `facts-recheck` job's own finding, read, never computed here
 *   · the free plan's line (R-ay / R-e) — "2 stops may not be reachable in time · Add drive and walk times"
 *   · the day strip, Today first on trip dates; today open
 *   · Navigate — a Google Maps directions deep link per row and per day, no API call (R-ay)
 *   · photos (R-aq) — the day's stored photo, and thumbnails on TODAY's rows only
 *   · legs — the plan's routed legs where they exist (optimized plans); none invented (R-e)
 *   · the `post_trip` feedback tap from T+1
 *
 * THE TRIP CARD BOARD (slip conformance, boards rev 15; ledger `2026-10-08-slip-trip-card-board`): the
 * days take the slip's board look through the ONE row-look context (`PlanRowLookProvider`) — one card
 * per day, the time column and dot rail — and the slip's tokens; the day strip is the board's chips
 * (a past day carries ✓); provenance sits in a card; the re-check banners take the gold wash. Same
 * rows, same testids, same derivations — only the look changes.
 */
import { PlanRowLookProvider } from "@/components/plan/row-look";
import { routedLegLine } from "@shared/routing-engine";
import { TRAVEL_TIME_NOT_CHECKED_LINE, bridgeLegLabel, routedLegBetween } from "@/lib/slip-legs";
import { Fragment, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayBlock } from "@/components/plan/DayBlock";
import { LegRow } from "@/components/plan/LegRow";
import { ItemRow } from "@/components/plan/ItemRow";
import { ItemSheet } from "@/components/plan/ItemSheet";
import { ItemAskLocalPanel } from "@/components/plan/ItemAskLocalPanel";
import { PlacePhoto, usePlacePhotos } from "@/components/plan/PlacePhoto";
import { FeedbackTap } from "@/components/plan/FeedbackTap";
import { cardPanelDayLabel, dayBlockHeading, dayBlockStats } from "@/lib/plan-day";
import { factCheckedLabel, itemFactsLine } from "@/lib/place-facts";
import { CARD_ADD_TRAVEL_TIMES_LINE, cardAirportLegs, cardDayOrder, cardProvenanceLine, legsCheckedLine, readyMadeSourceLine, dayNavigateHref, isCardToday, navigateHref, stayingAtLine, lastServiceLine, liveDirectionsLabel } from "@/lib/trip-card";
import { rideSuggestionFor, rideSwapSummary, type RideSuggestionView } from "@/lib/ride-suggestions";
import type { LegLastService, LegLiveDirections } from "@shared/live-directions";
import { TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";
import { apiRequest } from "@/lib/queryClient";
import { FEEDBACK_CODES } from "@shared/feedback";
import { recheckAskLabel, recheckBannerLine, RECHECK_BANNER_SWAP } from "@shared/facts-recheck";
import { legRecheckLine, type LegRecheckFinding } from "@shared/leg-recheck";
import { freeFindingsPromptLine, type Finding } from "@shared/optimizer-lead";
import { calendarDayOf } from "@shared/plan-timing";
import type { FactView } from "@shared/content-facts";
import type { FinalAirportLeg, FinalCardMeta } from "@shared/trip-card-final";
import type { PlanCardActivity, PlanCardDay } from "./plancard-types";
import { slipItemBookingLine } from "@/lib/item-booking-state";
import { getUpNextInfo, isStayActivity, nowHHMM, useLiveNow, useVisitedActivities } from "./plancard-temporal";
import { legRuleClass } from "@/lib/leg-rule";
import { travelRowTitle } from "@/components/plan/AnchorRow";
import { newSlipViewId, recordRoutedLegsCtaTap, useLocalTeaserShown } from "@/lib/slip-funnel-client";
import { anchorMissedBanner, leaveByMissed, missedLine, type LeaveByRow } from "@shared/leave-by";
import type { UpsellLine } from "@shared/upsell-line";
import { buildServicesBrowseHref } from "@/lib/services-browse";
import { postUpsellClick } from "@/components/UpsellSlot";

export interface TripCardDaysProps {
  tripId: string;
  destination: string | null;
  days: PlanCardDay[];
  timeZone: string | null;
  placeFacts?: Record<string, FactView[]>;
  finalizedAt?: string | null;
  finalVersion?: number | null;
  finalCard?: FinalCardMeta | null;
  /** Row 185 J6 (#1701): the frozen airport leg — present only on the owner's final card read. */
  finalAirportLeg?: FinalAirportLeg | null;
  /** The plan was optimized (a run exists) — otherwise the free plan's lines apply (R-e / R-ay). */
  optimized: boolean;
  /** Minutes on legs only when the travel-time service is on (R-h, the slip's own rule). */
  showTravelMinutes: boolean;
  advisorName: string | null;
  /** R-be (R323): the bought copy's source, from the plancard read; null ⇒ not a copy. */
  readyMadeSource?: { authorDisplayName: string | null; legsCheckedAt?: string | null } | null;
  isOwner: boolean;
  /** Test seam: "now" (defaults to the clock). Today is read in the plan's zone. */
  now?: Date;
  /**
   * P0-e addition 5: the day the card is showing, told to the page so the panels below the days (the
   * "Open in maps" header) follow the selected day instead of staying on the page's own first day.
   */
  onOpenDayChange?: (dayNum: number) => void;
  /** Row 179: the on-trip "Add X for this leg" lines, by item id (the owner's card only). Absent ⇒ none. */
  upsellLines?: ReadonlyMap<string, UpsellLine>;
}

type DayTransport = NonNullable<PlanCardDay["transports"]>[number];

/**
 * The leg after stop `idx` on the card. Step 9a (ledger `2026-10-07-step9a-routing-engine`): a routed
 * plan's legs name their stops, and the engine also writes stay ↔ first/last legs, so a leg is matched
 * to its PAIR by id. A day whose legs name none of its stops (a version's legs, keyed to version items)
 * keeps the position pairing it always had.
 *
 * LG-2 Ask 6 (decision-maker, Oct 19, 2026; supersedes P0-d item 2's bridge): a leg connects ADJACENT stops only —
 * a slot with no leg of its own draws nothing from an earlier stop.
 */
export function cardSlotLeg(legs: DayTransport[], acts: Array<{ id: string }>, idx: number): { leg: DayTransport } | null {
  const from = acts[idx]?.id;
  const to = acts[idx + 1]?.id;
  const idSet = new Set(acts.map((a) => a.id));
  const named = legs.some((l: any) => idSet.has(l.fromActivityId ?? l.from) || idSet.has(l.toActivityId ?? l.to));
  if (!named) return legs[idx] ? { leg: legs[idx] } : null;
  const own = legs.find((l: any) => (l.fromActivityId ?? l.from) === from && (l.toActivityId ?? l.to) === to);
  return own ? { leg: own } : null;
}

/** The leg drawn after stop `idx` — `cardSlotLeg`'s leg. */
export function cardLegAfter(legs: DayTransport[], acts: Array<{ id: string }>, idx: number): DayTransport | null {
  return cardSlotLeg(legs, acts, idx)?.leg ?? null;
}

/** LG-2 Ask 6: the slot after stop `idx` is a leg with no travel time — the server named the pair (a stop with no open point). */
export function cardSlotNotChecked(day: Pick<PlanCardDay, "legsNotChecked">, acts: Array<{ id: string }>, idx: number): boolean {
  const from = acts[idx]?.id;
  const to = acts[idx + 1]?.id;
  return !!from && !!to && (day.legsNotChecked ?? []).some((p) => p.fromActivityId === from && p.toActivityId === to);
}

/**
 * P0-d item 3: the card's leg count — every stop-to-stop slot the day panel draws a leg in, a leg with no travel time
 * included (LG-2 Ask 6: it exists); stay legs are not counted (the panel is the day's stops). The hero reads this, so
 * the two agree.
 */
export function cardLegCount(days: ReadonlyArray<Pick<PlanCardDay, "activities" | "transports" | "legsNotChecked">>): number {
  let n = 0;
  for (const d of days) {
    const acts = (d.activities ?? []).filter((a) => !isStayActivity(a));
    const legs = [...(d.transports ?? [])].sort((a: any, b: any) => (a.legOrder ?? 0) - (b.legOrder ?? 0));
    for (let i = 0; i < acts.length - 1; i++) if (cardSlotLeg(legs as DayTransport[], acts, i) || cardSlotNotChecked(d, acts, i)) n++;
  }
  return n;
}

/**
 * P0-e addition 5 (ledger `2026-10-12-p0e-findings-and-gaps`): the selected day's panel header —
 * "Thu Nov 12 · 2 legs · 6 stops". Legs are the card's own count for that day (`cardLegCount`: stop-to-stop
 * legs, a leg with no travel time included, stays not counted), stops the day's stops with the stay left out, so the header and
 * the hero count the same thing.
 */
export function cardDayPanelLine(day: Pick<PlanCardDay, "dayNum" | "dateIso" | "activities" | "transports" | "legsNotChecked">): string {
  const legs = cardLegCount([day]);
  const stops = (day.activities ?? []).filter((a) => !isStayActivity(a)).length;
  return `${cardPanelDayLabel({ dayNum: day.dayNum, dateIso: day.dateIso ?? null })} · ${legs} ${legs === 1 ? "leg" : "legs"} · ${stops} ${stops === 1 ? "stop" : "stops"}`;
}

/**
 * P0-e addition 5b: the "From → To" line over a stop-to-stop leg (`bridgeLegLabel`, the one formatter), read off the
 * two stops the leg joins.
 */
export function cardLegEndsLabel(fromName: string | null | undefined, toName: string | null | undefined): string {
  return bridgeLegLabel(fromName, toName, []);
}

/**
 * TC-4 (LD 69; ledger `2026-10-11-tc4-live-directions`): under the leg's planning line, the live tier — the
 * server's deep link, the last departure near the stop the leg leaves, and (owner only, read-only) "A better way
 * there". Drawn only from what the server sent; an absent field draws nothing (§13).
 */
function LegLiveTier({ leg, ride }: { leg: DayTransport; ride?: RideSuggestionView | null }) {
  const live = (leg as any).liveDirections as LegLiveDirections | undefined;
  const last = (leg as any).lastService as LegLastService | undefined;
  if (!live && !last && !ride) return null;
  const id = (leg as any).id;
  return (
    <div className="ml-6 pl-3 pb-1 space-y-0.5 text-xs" data-testid={`card-leg-live-${id}`}>
      {live ? (
        <a href={live.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2" data-testid={`card-leg-live-link-${id}`}>
          {liveDirectionsLabel(live)} ↗
        </a>
      ) : null}
      {last ? (
        <p className="text-muted-foreground" data-testid={`card-leg-last-service-${id}`}>
          {lastServiceLine(last)}
        </p>
      ) : null}
      {ride ? (
        <p className="text-muted-foreground" data-testid={`card-leg-better-way-${id}`}>
          {rideSwapSummary(ride)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * 9b-c — one stop's leave-by line on today's view (LB2/LB3/LB3a/LB5/LB8). A time reads "leave by about 10:10 · <provenance>"
 * (planning) or "leave by 10:14 · checked today 9:40 AM" (live); a passed one is struck with "missed · next: HH:MM"; an
 * anchor's passed one is a conflict banner instead; no time says why, or draws nothing (§13).
 */
export function LeaveByLine({ row, rows, nowMinute, stopName, stopId }: { row: LeaveByRow | null; rows: readonly LeaveByRow[]; nowMinute: number | null; stopName: string; stopId: string }) {
  if (!row) return null;
  if (row.kind === "conflict") {
    return (
      <p className="pl-2 text-xs font-medium text-amber-800 dark:text-amber-300" data-testid={`card-leave-by-conflict-${stopId}`}>
        {row.line}
      </p>
    );
  }
  if (row.kind === "none") {
    return row.line ? (
      <p className="pl-2 text-xs text-muted-foreground" data-testid={`card-leave-by-none-${stopId}`} data-reason={row.reason}>
        {row.line}
      </p>
    ) : null;
  }
  const banner = nowMinute != null ? anchorMissedBanner(row, nowMinute, stopName) : null;
  if (banner) {
    return (
      <p className="pl-2 text-xs font-semibold text-red-700 dark:text-red-300" data-testid={`card-leave-by-anchor-missed-${stopId}`} role="alert">
        {banner}
      </p>
    );
  }
  const missed = nowMinute != null && leaveByMissed(row, nowMinute);
  return (
    <p className="pl-2 text-xs font-medium text-amber-800 dark:text-amber-300" data-testid={`card-leave-by-${stopId}`} data-tier={row.tier}>
      <span className={missed ? "line-through opacity-70" : undefined}>{row.line}</span>
      {missed ? <span className="ml-1 no-underline" data-testid={`card-leave-by-missed-${stopId}`}>{missedLine(rows, nowMinute!)}</span> : null}
    </p>
  );
}

export function LegLine({ leg, showMinutes, timeZone, ride }: { leg: DayTransport; showMinutes: boolean; timeZone?: string | null; ride?: RideSuggestionView | null }) {
  const mode = String((leg as any).userSelectedMode ?? (leg as any).recommendedMode ?? (leg as any).mode ?? "");
  const label = (TRANSPORT_MODE_LABELS as Record<string, string>)[mode] ?? mode;
  // Step 9a (ledger `2026-10-07-step9a-routing-engine`): a routed leg reads the slip's own line, from
  // the one helper — duration · line · fare · provenance. The server sends `routed` only on a routed plan.
  const fromId = (leg as any).fromActivityId ?? (leg as any).from;
  const toId = (leg as any).toActivityId ?? (leg as any).to;
  const routed = fromId && toId ? routedLegBetween([{ transports: [leg as any] }], fromId, toId) : null;
  if (routed) {
    return (
      <>
        <p className={`ml-6 ${legRuleClass(true)} pl-3 py-1 text-xs text-muted-foreground`} data-testid={`card-leg-${(leg as any).id}`} data-leg-source={routed.route.provenance.source}>
          {routedLegLine({ mode: routed.mode, route: routed.route }, timeZone ?? null)}
        </p>
        <LegLiveTier leg={leg} ride={ride} />
      </>
    );
  }
  if (!label) return <LegLiveTier leg={leg} ride={ride} />;
  return (
    <>
      <p className={`ml-6 ${legRuleClass(false)} pl-3 py-1 text-xs text-muted-foreground`} data-testid={`card-leg-${(leg as any).id}`}>
        {label}
        {/* Audit B8: a non-routed leg prints its mode only — an unchecked travel time is not shown. */}
      </p>
      <LegLiveTier leg={leg} ride={ride} />
    </>
  );
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1" data-testid="now-line">
      <div className="flex-1 h-px bg-red-400/60" />
      <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
        {nowHHMM(now)} now
      </span>
      <div className="flex-1 h-px bg-red-400/60" />
    </div>
  );
}

export function TripCardDays(props: TripCardDaysProps) {
  const { tripId, days, timeZone } = props;
  // §3.14–3.15 (ledger `2026-10-18-teaser-copy-events`): the teaser view and the "Add drive and walk
  // times" tap on the Trip Card.
  const [funnelViewId] = useState(newSlipViewId);
  useLocalTeaserShown(tripId, days, "trip_card", funnelViewId);
  const todayIso = calendarDayOf(props.now ?? new Date(), timeZone);
  // Row 179: an item's "Add X for this leg" line, linked to the services browse for its category on this plan. A tap
  // is recorded through the existing upsell click event on the on-trip surface (decision-maker, Oct 31, 2026); a
  // failed record never blocks the link.
  const upsellFor = (itemId: string) => {
    const line = props.upsellLines?.get(itemId);
    if (!line) return null;
    return {
      line,
      href: buildServicesBrowseHref({ categoryKey: line.categoryKey, tripId, location: props.destination }),
      onClick: () => {
        void postUpsellClick("plancard_ontrip", line.offeringType, tripId).catch(() => {});
      },
    };
  };
  const order = cardDayOrder(days, todayIso);
  const [openDay, setOpenDay] = useState<number | null>(() => {
    const t = days.findIndex((d) => isCardToday(d, todayIso));
    return t >= 0 ? days[t].dayNum : days[order[0]]?.dayNum ?? null;
  });
  // The page's callback is read through a ref so a new function each render never re-fires this.
  const onOpenDayChange = useRef(props.onOpenDayChange);
  onOpenDayChange.current = props.onOpenDayChange;
  useEffect(() => {
    if (openDay != null) onOpenDayChange.current?.(openDay);
  }, [openDay]);
  const [sheetFor, setSheetFor] = useState<PlanCardActivity | null>(null);
  // R321 (S11-5): the card's sheet carries "Ask a local about this" (owner), recording the question
  // on the same `expert_interest` rail the slip uses.
  const [askOpenFor, setAskOpenFor] = useState<string | null>(null);

  // Photos: the day's stored photo (the final's own references), and live-resolved thumbnails for
  // TODAY's rows only — none on other rows, versions or the map (R-aq).
  const today = days.find((d) => isCardToday(d, todayIso)) ?? null;
  const todayIds = (today?.activities ?? []).map((a) => a.id);
  const livePhotos = usePlacePhotos(tripId, sheetFor ? [...todayIds, sheetFor.id] : todayIds);
  // R297: today's now-line and the visited tick — the SAME temporal engine the old card rows used
  // (`plancard-temporal`), read in the plan's zone; visited is device-local and writes nothing.
  const [visited, toggleVisited] = useVisitedActivities(tripId, today ?? undefined);
  const liveNow = useLiveNow();
  const now = props.now ?? liveNow;
  const todayLegs = [...(today?.transports ?? [])].sort((a: any, b: any) => (a.legOrder ?? 0) - (b.legOrder ?? 0)) as any[];
  // R321 (S11-2): the stay is the day's anchor, not a stop — the engine sees the stop list only, so its
  // indices are the rendered rows' and Up next is the next timed stop.
  const upNext = today ? getUpNextInfo({ ...today, activities: (today.activities ?? []).filter((a) => !isStayActivity(a)) }, todayLegs, now, visited, timeZone, props.placeFacts ?? null) : null;
  const stored = props.finalCard?.photos ?? {};
  // Row 185 J6: the airport ↔ stay rows from the trip_finals snapshot only (no live read, no Book on the
  // card). Arrival opens the plan's first day; departure closes its last day.
  const airportLegs = cardAirportLegs(days, props.finalAirportLeg, { isOwner: props.isOwner });
  const firstDayNum = days.length ? Math.min(...days.map((d) => d.dayNum)) : null;
  const lastDayNum = days.length ? Math.max(...days.map((d) => d.dayNum)) : null;
  const photoOf = (id: string) => livePhotos[id] ?? stored[id] ?? null;

  // T-3 banner (R-ad): the job's recorded finding, read.
  const { data: recheck } = useQuery<{
    conflict: { findings: Finding[]; checkedAt: string | null } | null;
    // Step 9b (D5, ledger `2026-10-07-step9b-optimizer-and-rechecks`): changed or broken legs the
    // re-checks found — read, never recomputed here; the plan itself was not rewritten.
    legs?: Array<LegRecheckFinding & { dayNumber: number | null; checkedAt: string | null }>;
  }>({
    queryKey: [`/api/trips/${tripId}/recheck`],
    retry: false,
  });
  const conflict = recheck?.conflict ?? null;
  const [asked, setAsked] = useState(false);
  const ask = useMutation({
    mutationFn: async (question: string) =>
      (await apiRequest("POST", `/api/trips/${tripId}/slip-events`, { type: "expert_interest", level: "question", question })).json(),
    onSuccess: () => setAsked(true),
  });

  // The free plan's prompt (R-ay): the same findings the slip's Optimize card reads.
  const { data: preview } = useQuery<{ findings?: Finding[] }>({
    queryKey: ["/api/optimization-preview", { tripId }],
    enabled: !props.optimized && props.isOwner,
    retry: false,
  });
  const freeLine = !props.optimized ? freeFindingsPromptLine(preview?.findings) : null;

  const all = days.flatMap((d) => d.activities ?? []);
  const hoursChecked = all
    .flatMap((a) => (props.placeFacts?.[a.id] ?? []).filter((f) => f.factType === "hours").map((f) => f.checkedAt ?? null))
    .filter((x): x is string => !!x)
    .sort()
    .pop();
  const booked = all.filter((a) => /booked/.test(slipItemBookingLine(a) ?? "")).length;
  const provenance = cardProvenanceLine({
    finalizedAt: props.finalizedAt ?? null,
    finalVersion: props.finalVersion ?? null,
    builtFrom: props.finalCard?.builtFrom ?? null,
    advisorName: props.advisorName,
    hoursCheckedAt: conflict?.checkedAt ?? hoursChecked ?? null,
    booked,
    total: all.length,
    timeZone,
  });

  return (
    <PlanRowLookProvider look="board">
    <div className="slip-surface space-y-3 px-3 pt-3 font-[family-name:var(--slip-font-body)] sm:px-5" data-testid="card-days">
      {provenance || readyMadeSourceLine(props.readyMadeSource) ? (
        <div className="space-y-0.5 rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)] px-4 py-3">
          {provenance ? (
            <p className="text-[13px] font-semibold text-[color:var(--slip-ink)]" data-testid="card-provenance">
              {provenance}
            </p>
          ) : null}
          {readyMadeSourceLine(props.readyMadeSource) ? (
            <p className="text-xs text-[color:var(--slip-muted)]" data-testid="card-ready-made-source">
              {readyMadeSourceLine(props.readyMadeSource)}
              {legsCheckedLine(props.readyMadeSource, timeZone) ? ` · ${legsCheckedLine(props.readyMadeSource, timeZone)}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {conflict ? (
        <div className="rounded-xl border border-[color:var(--slip-gold)] bg-[color:var(--slip-gold-wash)] p-3 text-sm text-[color:var(--slip-ink)]" data-testid="card-recheck-banner">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-[color:var(--slip-gold-ink)]" />
            <span>{recheckBannerLine(conflict.findings, factCheckedLabel(conflict.checkedAt, timeZone))}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/plans/${tripId}`} data-testid="card-recheck-swap">
                {RECHECK_BANNER_SWAP}
              </Link>
            </Button>
            {asked ? (
              <span className="text-xs text-muted-foreground self-center" data-testid="card-recheck-asked">
                Question saved · we'll tell you when a local can answer
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={ask.isPending}
                onClick={() => ask.mutate(recheckBannerLine(conflict.findings, null) ?? "A stop on my plan changed")}
                data-testid="card-recheck-ask"
              >
                {recheckAskLabel(props.advisorName ? props.advisorName.split(" ")[0] : null)}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {recheck?.legs?.length ? (
        <div className="rounded-xl border border-[color:var(--slip-gold)] bg-[color:var(--slip-gold-wash)] p-3 text-sm text-[color:var(--slip-ink)]" data-testid="card-recheck-legs">
          {recheck.legs.map((l, i) => (
            <p key={i} className="flex items-start gap-1.5" data-testid={`card-recheck-leg-${i}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-[color:var(--slip-gold-ink)]" />
              <span>{legRecheckLine(l, factCheckedLabel(l.checkedAt, timeZone))}</span>
            </p>
          ))}
          <div className="mt-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/plans/${tripId}`} data-testid="card-recheck-legs-swap">
                {RECHECK_BANNER_SWAP}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {freeLine || (!props.optimized && props.isOwner) ? (
        <p className="text-xs text-[color:var(--slip-muted)]" data-testid="card-free-line">
          <Link
            href={`/plans/${tripId}?optimize=1`}
            className="underline underline-offset-2"
            onClick={() => recordRoutedLegsCtaTap(tripId, "trip_card", funnelViewId)}
          >
            {freeLine ?? CARD_ADD_TRAVEL_TIMES_LINE}
          </Link>
        </p>
      ) : null}

      <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="card-day-strip">
        {order.map((i) => {
          const d = days[i];
          const isToday = isCardToday(d, todayIso);
          const on = openDay === d.dayNum;
          // A day already behind today carries the board's ✓ (machine dates only — §13).
          const past = !!(todayIso && d.dateIso && d.dateIso < todayIso);
          return (
            <button
              key={d.dayNum}
              type="button"
              className={`min-h-[44px] flex-shrink-0 rounded-xl border px-3 text-xs ${
                on
                  ? "border-[color:var(--slip-teal-ink)] bg-[color:var(--slip-teal-ink)] font-semibold text-white"
                  : past
                    ? "border-[color:var(--slip-line)] bg-[color:var(--slip-card)] text-[color:var(--slip-muted)]"
                    : "border-[color:var(--slip-line)] bg-[color:var(--slip-card)] text-[color:var(--slip-navy)]"
              }`}
              aria-pressed={on}
              onClick={() => setOpenDay(d.dayNum)}
              data-testid={`card-day-chip-${d.dayNum}`}
            >
              {isToday ? "Today" : dayBlockHeading({ dayNum: d.dayNum, date: d.date, dateIso: d.dateIso ?? null })}
              {past ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      {order.map((i) => {
        const d = days[i];
        // R321 (S11-2): the stay renders as "Staying at …" in the day header, never as a stop.
        const stays = (d.activities ?? []).filter(isStayActivity);
        const acts = (d.activities ?? []).filter((a) => !isStayActivity(a));
        const isToday = isCardToday(d, todayIso);
        const legs = [...(d.transports ?? [])].sort((a: any, b: any) => (a.legOrder ?? 0) - (b.legOrder ?? 0));
        const dayHref = dayNavigateHref(acts.map((a) => ({ name: a.name, lat: a.lat ?? null, lng: a.lng ?? null })), props.destination);
        const firstPhotoId = acts.find((a) => stored[a.id])?.id ?? null;
        return (
          <DayBlock
            key={d.dayNum}
            dayKey={`card-${d.dayNum}`}
            heading={`${isToday ? "Today · " : ""}${dayBlockHeading({ dayNum: d.dayNum, date: d.date, dateIso: d.dateIso ?? null })}`}
            stats={dayBlockStats({ stops: acts.length, hoursOn: acts.filter((a) => itemFactsLine(props.placeFacts?.[a.id], d.dateIso ?? null)).length })}
            open={openDay === d.dayNum}
            onOpenChange={(o) => setOpenDay(o ? d.dayNum : null)}
            feasibility={d.feasibility ?? null}
            localTeaser={d.localTeaser ?? null}
            busyBus={d.busyBus ?? null}
            photo={
              firstPhotoId ? (
                <PlacePhoto
                  photo={stored[firstPhotoId]}
                  testId={`card-day-photo-${d.dayNum}`}
                  // R321 (S11-4): the day's photo opens its stop's ItemSheet.
                  onClick={() => setSheetFor(acts.find((a) => a.id === firstPhotoId) ?? null)}
                />
              ) : null
            }
            aside={
              stays.length || dayHref ? (
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                  {stays.length ? (
                    <span className="text-muted-foreground" data-testid={`card-day-stay-${d.dayNum}`}>
                      {stayingAtLine(stays[0].name)}
                    </span>
                  ) : null}
                  {dayHref ? (
                    <a href={dayHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[color:var(--slip-navy)] hover:underline" data-testid={`card-day-navigate-${d.dayNum}`}>
                      <Navigation className="w-3 h-3" /> Navigate the day
                    </a>
                  ) : null}
                </span>
              ) : null
            }
          >
            {d.dayNum === firstDayNum && airportLegs.arrival ? (
              <LegRow
                direction="arrival"
                stayName={airportLegs.arrival.stayName}
                airport={airportLegs.arrival.airport}
                modes={airportLegs.arrival.modes}
                routedMinutes={airportLegs.arrival.routedMinutes}
                canBook={false}
              />
            ) : null}
            {acts.map((a, idx) => (
              <Fragment key={a.id}>
                {isToday && upNext?.nowLineIndex === idx ? <NowLine now={now} /> : null}
                <ItemRow
                  item={a}
                  facts={props.placeFacts?.[a.id]}
                  dateIso={d.dateIso ?? null}
                  timeZone={timeZone}
                  mode="read"
                  role="traveler"
                  bookingState={slipItemBookingLine(a)}
                  expertNote={a.expertNote ? { note: a.expertNote, author: props.advisorName } : null}
                  photo={isToday ? photoOf(a.id) : null}
                  navigateHref={navigateHref({ name: a.name, lat: a.lat ?? null, lng: a.lng ?? null }, props.destination)}
                  onOpenDetails={() => setSheetFor(a)}
                  visited={isToday ? { checked: visited.has(a.id), onToggle: () => toggleVisited(a.id) } : null}
                  upsell={upsellFor(a.id)}
                />
                {/* 9b-c (LB1–LB9): today's leave-by for this stop, derived at read from the ONE core (never stored). */}
                {isToday && upNext ? <LeaveByLine row={upNext.leaveByRows.find((r) => r.stopId === a.id) ?? null} rows={upNext.leaveByRows} nowMinute={upNext.nowMinute} stopName={a.name} stopId={a.id} /> : null}
                {idx < acts.length - 1 && (cardSlotLeg(legs, acts, idx) || cardSlotNotChecked(d, acts, idx)) ? (
                  <p className="ml-6 pl-3 pt-1 text-xs font-medium text-muted-foreground" data-testid={`card-leg-ends-${(cardSlotLeg(legs, acts, idx)?.leg as any)?.id ?? `${a.id}-${acts[idx + 1].id}`}`}>
                    {cardLegEndsLabel(a.name, acts[idx + 1].name)}
                  </p>
                ) : null}
                {/* LG-2 Ask 6: a stop with no open point — the leg exists with no time. */}
                {idx < acts.length - 1 && !cardSlotLeg(legs, acts, idx) && cardSlotNotChecked(d, acts, idx) ? (
                  <p className="ml-6 pl-3 py-1 text-xs text-muted-foreground" data-testid={`card-leg-not-checked-${a.id}-${acts[idx + 1].id}`}>
                    {TRAVEL_TIME_NOT_CHECKED_LINE}
                  </p>
                ) : null}
                {idx < acts.length - 1 && cardLegAfter(legs, acts, idx) ? (
                  <LegLine
                    leg={cardLegAfter(legs, acts, idx)!}
                    showMinutes={props.showTravelMinutes}
                    timeZone={timeZone}
                    ride={props.isOwner ? rideSuggestionFor(days as any, a.id, acts[idx + 1].id) : null}
                  />
                ) : null}
              </Fragment>
            ))}
            {d.dayNum === lastDayNum && airportLegs.departure ? (
              <LegRow
                direction="departure"
                stayName={airportLegs.departure.stayName}
                airport={airportLegs.departure.airport}
                modes={airportLegs.departure.modes}
                routedMinutes={airportLegs.departure.routedMinutes}
                canBook={false}
              />
            ) : null}
            {isToday && acts.length > 0 && upNext?.nowLineIndex === acts.length ? <NowLine now={now} /> : null}
            {/* 9b-c LB8 (ledger `2026-10-18-lb8-lb9-card-wiring`): today's flight departure, measured against its R-i
                buffered time — the travel row's own title, then its leave-by line from the ONE core. */}
            {isToday && upNext
              ? (d.anchorStops ?? []).map((an) => (
                  <div key={an.id} className="pt-2" data-testid={`card-anchor-stop-${an.id}`}>
                    <p className="pl-2 text-sm font-semibold">{travelRowTitle("departure", props.destination) ?? an.name}</p>
                    <LeaveByLine row={upNext.leaveByRows.find((r) => r.stopId === an.id) ?? null} rows={upNext.leaveByRows} nowMinute={upNext.nowMinute} stopName={an.name} stopId={an.id} />
                  </div>
                ))
              : null}
          </DayBlock>
        );
      })}

      {sheetFor ? (
        <ItemSheet
          open={!!sheetFor}
          onOpenChange={(o) => {
            if (!o) {
              setSheetFor(null);
              setAskOpenFor(null);
            }
          }}
          item={{ id: sheetFor.id, name: sheetFor.name, time: sheetFor.time, location: sheetFor.location }}
          facts={props.placeFacts?.[sheetFor.id]}
          timeZone={timeZone}
          photo={photoOf(sheetFor.id)}
          expertNote={sheetFor.expertNote ? { note: sheetFor.expertNote, author: props.advisorName } : null}
          navigateHref={navigateHref({ name: sheetFor.name, lat: sheetFor.lat ?? null, lng: sheetFor.lng ?? null }, props.destination)}
          bookingLine={slipItemBookingLine(sheetFor)}
          onAskLocal={props.isOwner ? () => setAskOpenFor((cur) => (cur === sheetFor.id ? null : sheetFor.id)) : null}
          askLocalPanel={
            props.isOwner && askOpenFor === sheetFor.id ? (
              <ItemAskLocalPanel tripId={tripId} itemId={sheetFor.id} onClose={() => setAskOpenFor(null)} />
            ) : null
          }
        />
      ) : null}

      {props.isOwner ? <FeedbackTap tripId={tripId} moment="post_trip" codes={FEEDBACK_CODES.post_trip} /> : null}
    </div>
    </PlanRowLookProvider>
  );
}
