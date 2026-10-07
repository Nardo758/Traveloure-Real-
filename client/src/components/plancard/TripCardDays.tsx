/**
 * The Trip Card's days (surface spec v1.3.4 §2.5; step 6 — ledger `2026-10-04-step6-trip-card`). The
 * card renders the frozen final on the SAME `DayBlock` and `ItemRow` the slip uses — read mode, no ⋯,
 * no planning control — replacing its own `DaySelector` + `ActivitiesSection` rows (spec §10 Keep:
 * "DayBlock — card step 6"). What only the card adds, each decided by a pure rule in
 * `@/lib/trip-card`:
 *   · provenance — "Finalized Oct 3 · built from Version A, run 1 · planned with … · hours re-checked …
 *     · K of N booked"
 *   · the T-3 banner (R-ad) — the `facts-recheck` job's own finding, read, never computed here
 *   · the free plan's line (R-ay / R-e) — "2 stops may not be reachable in time · Add travel times"
 *   · the day strip, Today first on trip dates; today open
 *   · Navigate — a Google Maps directions deep link per row and per day, no API call (R-ay)
 *   · photos (R-aq) — the day's stored photo, and thumbnails on TODAY's rows only
 *   · legs — the plan's routed legs where they exist (optimized plans); none invented (R-e)
 *   · the `post_trip` feedback tap from T+1
 */
import { routedLegLine } from "@shared/routing-engine";
import { routedLegBetween } from "@/lib/slip-legs";
import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayBlock } from "@/components/plan/DayBlock";
import { ItemRow } from "@/components/plan/ItemRow";
import { ItemSheet } from "@/components/plan/ItemSheet";
import { ItemAskLocalPanel } from "@/components/plan/ItemAskLocalPanel";
import { PlacePhoto, usePlacePhotos } from "@/components/plan/PlacePhoto";
import { FeedbackTap } from "@/components/plan/FeedbackTap";
import { dayBlockHeading, dayBlockStats } from "@/lib/plan-day";
import { factCheckedLabel, itemFactsLine } from "@/lib/place-facts";
import { CARD_ADD_TRAVEL_TIMES_LINE, cardDayOrder, cardProvenanceLine, legsCheckedLine, readyMadeSourceLine, dayNavigateHref, isCardToday, navigateHref, stayingAtLine } from "@/lib/trip-card";
import { TRANSPORT_MODE_LABELS } from "@/lib/maps-platform";
import { apiRequest } from "@/lib/queryClient";
import { FEEDBACK_CODES } from "@shared/feedback";
import { recheckAskLabel, recheckBannerLine, RECHECK_BANNER_SWAP } from "@shared/facts-recheck";
import { legRecheckLine, type LegRecheckFinding } from "@shared/leg-recheck";
import { freeFindingsPromptLine, type Finding } from "@shared/optimizer-lead";
import { calendarDayOf } from "@shared/plan-timing";
import type { FactView } from "@shared/content-facts";
import type { FinalCardMeta } from "@shared/trip-card-final";
import type { PlanCardActivity, PlanCardDay } from "./plancard-types";
import { slipItemBookingLine } from "@/lib/item-booking-state";
import { getUpNextInfo, isStayActivity, nowHHMM, useLiveNow, useVisitedActivities } from "./plancard-temporal";

export interface TripCardDaysProps {
  tripId: string;
  destination: string | null;
  days: PlanCardDay[];
  timeZone: string | null;
  placeFacts?: Record<string, FactView[]>;
  finalizedAt?: string | null;
  finalVersion?: number | null;
  finalCard?: FinalCardMeta | null;
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
}

type DayTransport = NonNullable<PlanCardDay["transports"]>[number];

/**
 * The leg after stop `idx` on the card. Step 9a (ledger `2026-10-07-step9a-routing-engine`): a routed
 * plan's legs name their stops, and the engine also writes stay ↔ first/last legs, so a leg is matched
 * to its PAIR by id. A day whose legs name none of its stops (a version's legs, keyed to version items)
 * keeps the position pairing it always had.
 */
export function cardLegAfter(legs: DayTransport[], acts: Array<{ id: string }>, idx: number): DayTransport | null {
  const from = acts[idx]?.id;
  const to = acts[idx + 1]?.id;
  const ids = new Set(acts.map((a) => a.id));
  const named = legs.some((l: any) => ids.has(l.fromActivityId ?? l.from) || ids.has(l.toActivityId ?? l.to));
  if (!named) return legs[idx] ?? null;
  return legs.find((l: any) => (l.fromActivityId ?? l.from) === from && (l.toActivityId ?? l.to) === to) ?? null;
}

export function LegLine({ leg, showMinutes, timeZone }: { leg: DayTransport; showMinutes: boolean; timeZone?: string | null }) {
  const mode = String((leg as any).userSelectedMode ?? (leg as any).recommendedMode ?? (leg as any).mode ?? "");
  const label = (TRANSPORT_MODE_LABELS as Record<string, string>)[mode] ?? mode;
  const minutes = Number((leg as any).estimatedDurationMinutes ?? (leg as any).duration);
  // Step 9a (ledger `2026-10-07-step9a-routing-engine`): a routed leg reads the slip's own line, from
  // the one helper — duration · line · fare · provenance. The server sends `routed` only on a routed plan.
  const fromId = (leg as any).fromActivityId ?? (leg as any).from;
  const toId = (leg as any).toActivityId ?? (leg as any).to;
  const routed = fromId && toId ? routedLegBetween([{ transports: [leg as any] }], fromId, toId) : null;
  if (routed) {
    return (
      <p className="ml-6 border-l-2 border-dashed border-border pl-3 py-1 text-xs text-muted-foreground" data-testid={`card-leg-${(leg as any).id}`} data-leg-source={routed.route.provenance.source}>
        {routedLegLine({ mode: routed.mode, route: routed.route }, timeZone ?? null)}
      </p>
    );
  }
  if (!label) return null;
  return (
    <p className="ml-6 border-l-2 border-dashed border-border pl-3 py-1 text-xs text-muted-foreground" data-testid={`card-leg-${(leg as any).id}`}>
      {label}
      {showMinutes && Number.isFinite(minutes) && minutes > 0 ? ` · ${Math.round(minutes)} min` : ""}
    </p>
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
  const todayIso = calendarDayOf(props.now ?? new Date(), timeZone);
  const order = cardDayOrder(days, todayIso);
  const [openDay, setOpenDay] = useState<number | null>(() => {
    const t = days.findIndex((d) => isCardToday(d, todayIso));
    return t >= 0 ? days[t].dayNum : days[order[0]]?.dayNum ?? null;
  });
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
  const upNext = today ? getUpNextInfo({ ...today, activities: (today.activities ?? []).filter((a) => !isStayActivity(a)) }, todayLegs, now, visited, timeZone) : null;
  const stored = props.finalCard?.photos ?? {};
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
    <div className="space-y-2 px-3 sm:px-5 pt-3" data-testid="card-days">
      {provenance ? (
        <p className="text-xs text-muted-foreground" data-testid="card-provenance">
          {provenance}
        </p>
      ) : null}
      {readyMadeSourceLine(props.readyMadeSource) ? (
        <p className="text-xs text-muted-foreground" data-testid="card-ready-made-source">
          {readyMadeSourceLine(props.readyMadeSource)}
          {legsCheckedLine(props.readyMadeSource, timeZone) ? ` · ${legsCheckedLine(props.readyMadeSource, timeZone)}` : ""}
        </p>
      ) : null}

      {conflict ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20" data-testid="card-recheck-banner">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
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
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20" data-testid="card-recheck-legs">
          {recheck.legs.map((l, i) => (
            <p key={i} className="flex items-start gap-1.5" data-testid={`card-recheck-leg-${i}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
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
        <p className="text-xs text-muted-foreground" data-testid="card-free-line">
          <Link href={`/plans/${tripId}?optimize=1`} className="underline underline-offset-2">
            {freeLine ?? CARD_ADD_TRAVEL_TIMES_LINE}
          </Link>
        </p>
      ) : null}

      <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="card-day-strip">
        {order.map((i) => {
          const d = days[i];
          const isToday = isCardToday(d, todayIso);
          return (
            <Button
              key={d.dayNum}
              size="sm"
              variant={openDay === d.dayNum ? "default" : "secondary"}
              className="flex-shrink-0 text-xs"
              onClick={() => setOpenDay(d.dayNum)}
              data-testid={`card-day-chip-${d.dayNum}`}
            >
              {isToday ? "Today" : dayBlockHeading({ dayNum: d.dayNum, date: d.date, dateIso: d.dateIso ?? null })}
            </Button>
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
                    <a href={dayHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline" data-testid={`card-day-navigate-${d.dayNum}`}>
                      <Navigation className="w-3 h-3" /> Navigate the day
                    </a>
                  ) : null}
                </span>
              ) : null
            }
          >
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
                />
                {/* Step 9b D7: "Leave by" — today's up-next row only, from the leg into it (never stored). */}
                {isToday && upNext?.leaveBy && upNext.upNextActivity?.id === a.id ? (
                  <p className="pl-2 text-xs font-medium text-amber-800 dark:text-amber-300" data-testid={`card-leave-by-${a.id}`}>
                    Leave by {upNext.leaveBy}
                  </p>
                ) : null}
                {idx < acts.length - 1 && cardLegAfter(legs, acts, idx) ? (
                  <LegLine leg={cardLegAfter(legs, acts, idx)!} showMinutes={props.showTravelMinutes} timeZone={timeZone} />
                ) : null}
              </Fragment>
            ))}
            {isToday && acts.length > 0 && upNext?.nowLineIndex === acts.length ? <NowLine now={now} /> : null}
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
  );
}
