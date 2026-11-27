/**
 * Revision 3 planning surface - P0, board V1 (`board-V1-days-board-1280.png`) and V2 at 390.
 *
 * Board colours are the board's own hex values (Leon, Nov 22 2026): text #5B4B8A, fill #EEEAF6, border #D8CFEE -
 * no Tailwind purple shades. Buttons are rounded rectangles 44px tall; Skip is plain grey text.
 *
 * The stop list is `data.days[].activities`, exactly as `SlipView` reads it (`r3Stops`), and the footer counts, the stay
 * check and the flight check all read that one list. A chip with no answer is HIDDEN (board V23) - no placeholders.
 *
 * Reuses the plancard DTO the old page already fetches and the app's own theme tokens; it does NOT reuse SlipView's
 * layout. Every string is board text and stays DRAFT until Leon approves it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMinWidth } from "@/hooks/use-min-width";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type { SlipData } from "@/components/plancard/SlipView";
import { NEXT_QUESTION_COPY, NEXT_QUESTION_SKIP, type NextQuestionFacts, type NextQuestionKey } from "@/lib/next-question";
import { OCCASION_GROUP_LABELS } from "@shared/experience-group";
import { planEyebrowLabel } from "@shared/plan-dates";
import { DaysBoard } from "@/components/r3/DaysBoard";
import { OptimizeCard } from "@/components/r3/OptimizeCard";
import { PhoneDayBody, PhoneDayStrip, PhoneHint, PhoneTabs, type PhoneTab } from "@/components/r3/PhoneDays";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { StopSheet } from "@/components/r3/StopSheet";
import { BOARD_CELL, BOARD_INK, BOARD_LINE } from "@/components/r3/tokens";
import { stopStateFor } from "@/lib/r3-stop-state";
import { apiRequest } from "@/lib/queryClient";
import { DaysMapPanel } from "@/components/plan/DaysMapPanel";
import { r3Columns, r3IdeaCount, r3MapCounts, r3Stops } from "@/lib/r3-surface";
import { daysMapCountLine } from "@/lib/days-map";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The board's palette, as hex, in one place.
// The board's palette, as tokens: the hex values live in `index.css` as `--r3-board-*`, because the page-hex guard
// refuses literals in `client/src/pages`.
const BOARD = {
  text: "var(--r3-board-text)",
  fill: "var(--r3-board-fill)",
  border: "var(--r3-board-border)",
  line: "var(--r3-board-line)",
  column: "var(--r3-board-col)",
  ink: "var(--r3-board-ink)",
} as const;
const boardOutline = { borderColor: BOARD.border, backgroundColor: BOARD.fill, color: BOARD.text } as const;

/** "Tue 8 \u2013 Thu 10 Dec" from the plan's own dates; "" when the plan has none (the chip is then hidden). */
function whenLine(start?: string | null, end?: string | null): string {
  const s = start ? new Date(`${start}T00:00:00`) : null;
  const e = end ? new Date(`${end}T00:00:00`) : null;
  if (!s || Number.isNaN(s.getTime())) return "";
  const left = `${WEEKDAY[s.getDay()]} ${s.getDate()}`;
  if (!e || Number.isNaN(e.getTime())) return left;
  return `${left} \u2013 ${WEEKDAY[e.getDay()]} ${e.getDate()} ${MONTH[e.getMonth()]}`;
}

function Chip({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap rounded-full border px-3 py-1.5"
      style={{ borderColor: BOARD.line }}
      data-testid={testId}
    >
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-semibold" style={{ color: BOARD.ink }}>{value}</span>
    </span>
  );
}

export function R3PlanningSurface({ data, tripId }: { data: SlipData; tripId: string }) {
  const desktop = useMinWidth(1024);
  const trip: any = (data as any)?.trip ?? {};
  const stops = r3Stops(data);
  const columns = r3Columns(data);
  const mapCounts = r3MapCounts(data);
  const countLine = daysMapCountLine(mapCounts.located, mapCounts.total);
  // U1: the plan's own lodging item is the map's anchor, so the stay ring draws when the plan has one (null otherwise).
  // The stay is the RING, never a numbered pin: the map's day rows drop the accommodation item, and the anchor below
  // draws it. (Board V1 numbers the stops only.)
  const mapDays = (((data as any)?.days ?? []) as any[]).map((d: any) => ({
    ...d,
    activities: (Array.isArray(d?.activities) ? d.activities : []).filter((a: any) => a?.type !== "accommodation" && a?.itemType !== "accommodation"),
  }));
  const mapAnchor = (() => {
    // The stay is the `accommodation` row; the day columns drop it (it is the ring), so it is found in the raw DTO.
    const rawStops = ((data as any)?.days ?? []).flatMap((d: any) => (Array.isArray(d?.activities) ? d.activities : []));
    const stay = rawStops.find((s: any) => s?.type === "accommodation" || s?.itemType === "accommodation");
    if (!stay) return null;
    const lat = Number((stay as any)?.lat ?? (stay as any)?.latitude);
    const lng = Number((stay as any)?.lng ?? (stay as any)?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { kind: "stay" as const, name: String((stay as any)?.name ?? (stay as any)?.title ?? "Your stay"), lat, lng, coordSource: (stay as any)?.coordSource ?? null };
  })();
  const ideas = r3IdeaCount(data);
  const lodging = stops.find((s) => /lodging|hotel|stay/i.test(String(s?.type ?? ""))) ??
    stops.find((s) => /lodging|hotel|stay/i.test(String(s?.kind ?? "")));
  const dayCount = Math.max(0, ((data as any)?.days ?? []).length);

  const facts: NextQuestionFacts = {
    datesConfirmed: trip?.datesConfirmed === true,
    travelers: Number(trip?.numberOfTravelers ?? trip?.travelers ?? 0) || null,
    stayChosen: !!lodging,
    flightKnown: stops.some((s) => /flight/i.test(String(s?.type ?? "")) || /flight/i.test(String(s?.name ?? ""))),
  };
  const order: readonly NextQuestionKey[] = ["dates", "party", "stay", "flight"];
  const answered: Record<NextQuestionKey, boolean> = {
    dates: facts.datesConfirmed,
    party: (facts.travelers ?? 0) > 0,
    stay: facts.stayChosen,
    flight: facts.flightKnown,
  };
  const [mapDay, setMapDay] = useState<"all" | number>("all");
  // U3 (board V22): the phone's two tabs and the one open day.
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("days");
  const [openDay, setOpenDay] = useState(1);
  const [hintShown, setHintShown] = useState(true);
  const queryClient = useQueryClient();
  // The approved Move: the same PATCH the old page's move sheet sends. On success the hint goes (first move only).
  /**
   * The move sheet already names the day it wants (`stop.dayNumber` after its own override). A stop with no day on it
   * falls back to the next day, which is what the phone's older "Move" entry has always done.
   */
  const handleMove = async (stop: any) => {
    const chosen = typeof stop?.dayNumber === "number" ? stop.dayNumber : null;
    const target = chosen ?? Number(openDay) + 1;
    try {
      const res = await fetch(`/api/trips/${tripId}/itinerary-items/${stop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ dayNumber: target }),
      });
      if (res.ok) {
        setHintShown(false);
        await queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      }
    } catch {
      /* a failed move leaves the plan and the hint untouched */
    }
  };
  const [skipped, setSkipped] = useState<NextQuestionKey[]>([]);

  // R3 U9: role and the one "asked for" source. Quotes are read once per page, owners only, never in waitlist mode.
  const role = (data as any)?.tripRole as string | null | undefined;
  const waitlist = (data as any)?.optimizerWaitlist === true;
  const quotesEnabled = role === "owner" && !waitlist;
  const { data: quotesData } = useQuery<{ quotes?: Array<{ itineraryItemId?: string | null; lifecycle?: string | null }> }>({
    queryKey: ["/api/me/quotes"],
    enabled: quotesEnabled,
  });
  const quotes = quotesData?.quotes ?? [];
  const [sheetFor, setSheetFor] = useState<{ stop: any; dayLabel: string } | null>(null);
  const sheetTrigger = useRef<{ id: string; phone: boolean; el: HTMLElement | null } | null>(null);
  // The ask row needs a plan owner AND a city with an expert the door can reach.
  const { data: expertHelp } = useQuery<{ levels?: Array<{ expertCount?: number }> }>({
    queryKey: [`/api/trips/${tripId}/expert-help`],
    enabled: role === "owner" && !waitlist,
  });
  const expertCount = (expertHelp?.levels ?? []).reduce((n, l) => n + Number(l?.expertCount ?? 0), 0);
  const canAsk = role === "owner" && !waitlist && expertCount > 0;
  const [askOpen, setAskOpen] = useState(false);
  const { toast } = useToast();
  const [pendingRemoval, setPendingRemoval] = useState<{ stop: any; dayLabel: string } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const removalTimer = useRef<number | null>(null);
  const removalRef = useRef<{ stop: any; dayLabel: string } | null>(null);

  const commitRemoval = (target?: { stop: any; dayLabel: string } | null) => {
    const item = target ?? removalRef.current;
    if (!item) return;
    if (removalTimer.current) window.clearTimeout(removalTimer.current);
    removalTimer.current = null;
    removalRef.current = null;
    setPendingRemoval(null);
    void (async () => {
      try {
        await apiRequest("DELETE", `/api/trips/${tripId}/itinerary-items/${String(item.stop.id)}`);
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(String(item.stop.id));
          return next;
        });
      } catch (err: any) {
        // The stop comes back and the old slip's sentence shows.
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(String(item.stop.id));
          return next;
        });
        // The stamped sentence only; the raw error goes to the console.
        console.error("[r3-stop-remove]", err);
        toast({ title: "Couldn't remove that", variant: "destructive" });
      }
    })();
  };

  const requestRemoval = (stop: any, dayLabel: string) => {
    if (removalRef.current) commitRemoval(removalRef.current);
    const item = { stop, dayLabel };
    removalRef.current = item;
    setPendingRemoval(item);
    setHiddenIds((prev) => new Set(prev).add(String(stop.id)));
    removalTimer.current = window.setTimeout(() => commitRemoval(item), 10_000);
  };

  const undoRemoval = () => {
    if (!removalRef.current) return;
    if (removalTimer.current) window.clearTimeout(removalTimer.current);
    removalTimer.current = null;
    const item = removalRef.current;
    removalRef.current = null;
    setPendingRemoval(null);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(String(item.stop.id));
      return next;
    });
  };

  useEffect(() => {
    const onHide = () => {
      const item = removalRef.current;
      if (!item) return;
      try {
        void fetch(`/api/trips/${tripId}/itinerary-items/${String(item.stop.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
        });
      } catch {
        // Leaving the page is best-effort.
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [tripId]);

  const openSheet = (stop: any, dayLabel: string, trigger?: HTMLElement | null) => {
    setAskOpen(false);
    const el = trigger ?? (document.activeElement as HTMLElement | null);
    sheetTrigger.current = {
      id: String(stop?.id ?? ""),
      phone: el?.getAttribute("data-testid") === "r3-phone-stop-menu",
      el,
    };
    setSheetFor({ stop, dayLabel });
  };
  const question = order.find((k) => !answered[k] && !skipped.includes(k)) ?? null;
  const copy = question ? NEXT_QUESTION_COPY[question] : null;

  // The eyebrow is the app's own label (shared/plan-dates.ts:222), never `trip.occasionLabel` and never a hard-coded
  // "Your plan": a plan whose occasion did not resolve reads as the board's "YOUR PLAN · TRIP", anything else reads as
  // the label it resolves to (a group's own label, or an occasion such as Proposal).
  const eyebrowLabel = planEyebrowLabel({
    datesConfirmed: trip?.datesConfirmed,
    occasionName: trip?.occasionName ?? null,
    occasionSlug: trip?.occasionSlug ?? null,
  });
  // The suffix is the catalog's own word, never a literal: the last word of the trips label, so the guard that forbids
  // spelling a group label outside the catalog still passes and no new string is added.
  const tripWord = OCCASION_GROUP_LABELS.trips.split(/\s+/).pop() ?? "";
  const eyebrow = (eyebrowLabel === "Your plan" ? `${eyebrowLabel} \u00b7 ${tripWord}` : eyebrowLabel).toUpperCase();

  const stayingArea = String(lodging?.neighbourhood ?? lodging?.area ?? lodging?.city ?? "");
  const when = whenLine(trip?.startDate, trip?.endDate);
  const where = String(trip?.destination ?? "");
  const who = facts.travelers ? `${facts.travelers} travelers` : "";
  const pace = String(trip?.energyProfile ?? trip?.pace ?? "");

  const pill = (label: string, active: boolean, testId: string) => (
    <button
      key={label}
      type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      className="h-11 rounded-full border px-3 text-[13px] font-medium"
      style={active ? boardOutline : { borderColor: BOARD.line, color: BOARD.ink }}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1152px] px-4 py-6" data-testid="r3-surface" data-removing={pendingRemoval ? "true" : undefined} data-r3-part="p0">
      <header className={desktop ? "flex items-start justify-between gap-4" : "space-y-2"}>
        {desktop ? (
          <>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: BOARD.text }} data-testid="r3-eyebrow">
                {eyebrow}
              </p>
              <h1 className="mt-1 text-[34px] font-bold leading-[1.1] text-foreground" data-testid="r3-title">{trip?.title ?? "Your plan"}</h1>
            </div>
            <div className="flex items-center gap-2">
              {pill("Days and map", true, "r3-view-days-map")}
              {pill("Days only", false, "r3-view-days")}
              {pill("Map only", false, "r3-view-map")}
              {pill("Calendar", false, "r3-view-calendar")}
              <button type="button" className="h-11 rounded-lg border px-3 text-[13px] font-medium" style={{ borderColor: BOARD.line, color: BOARD.ink }} data-testid="r3-share">Share</button>
              <button type="button" aria-label="More" className="h-11 w-11 rounded-lg border" style={{ borderColor: BOARD.line, color: BOARD.ink }} data-testid="r3-menu">
                <MoreHorizontal className="mx-auto h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Back" className="p-1 text-foreground" data-testid="r3-back"><ArrowLeft className="h-5 w-5" /></button>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: BOARD.text }} data-testid="r3-eyebrow">{eyebrow}</p>
              <button type="button" aria-label="More" className="p-1 text-foreground" data-testid="r3-menu"><MoreHorizontal className="h-5 w-5" /></button>
            </div>
            <h1 className="text-[26px] font-bold leading-[1.15] text-foreground" data-testid="r3-title">{trip?.title ?? "Your plan"}</h1>
          </>
        )}
      </header>

      {desktop ? null : <PhoneTabs tab={phoneTab} onChange={setPhoneTab} />}

      {desktop || phoneTab === "days" ? (
<section className="mt-5 rounded-xl border border-border bg-card p-4" data-testid="r3-strip">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" data-testid="r3-strip-title">What you've told us</p>
          <button type="button" className="text-[13px] font-medium underline-offset-2 hover:underline" style={{ color: BOARD.text }} data-testid="r3-strip-change">Change any of these</button>
        </div>
        <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto" data-testid="r3-strip-chips">
          {where ? <Chip label="Where" value={where} testId="r3-chip-where" /> : null}
          {when ? <Chip label="When" value={when} testId="r3-chip-when" /> : null}
          {who ? <Chip label="Who" value={who} testId="r3-chip-who" /> : null}
          {stayingArea ? <Chip label="Staying" value={stayingArea} testId="r3-chip-staying" /> : null}
          {pace ? <Chip label="Pace" value={pace} testId="r3-chip-pace" /> : null}
        </div>
        <div className="my-3 border-t border-border" />
        {copy ? (
          <div className="flex flex-wrap items-center justify-between gap-2" data-testid="r3-question">
            <p className="text-[13px] text-foreground">
              <span className="font-semibold">Next:</span> {copy.sentence.replace(/^Next:\s*/, "")}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className="h-11 rounded-lg border px-3 text-[13px] font-semibold" style={boardOutline} data-testid="r3-question-action">
                {copy.action}
              </button>
              <button type="button" className="h-11 px-2 text-[13px] font-medium text-muted-foreground" data-testid="r3-question-skip" onClick={() => setSkipped((s) => [...s, question!])}>
                {NEXT_QUESTION_SKIP}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="mt-4" data-testid="r3-days" data-day-count={dayCount} data-stop-count={stops.length}>
        {desktop ? null : phoneTab === "days" ? (
          <>
            <PhoneDayStrip data={data} openDay={openDay} onOpen={setOpenDay} ideas={ideas} />
            <PhoneHint show={hintShown && openDay >= 1 && (columns.find((c) => c.day === openDay)?.stops.length ?? 0) > 0} />
            <PhoneDayBody
          data={data}
          openDay={openDay}
          onMoveRequested={handleMove}
          hasDates={!!trip?.startDate && !!trip?.endDate}
          role={role}
          quotes={quotes}
          hiddenIds={hiddenIds}
          onDetails={openSheet}
          onRemove={requestRemoval}
        />
          </>
        ) : null}
        <div className={desktop ? "flex items-start gap-3" : "mt-3 flex flex-col gap-3"}>
          {desktop ? (
        <DaysBoard
          data={data}
          role={role}
          quotes={quotes}
          hiddenIds={hiddenIds}
          onDetails={openSheet}
          onRemove={requestRemoval}
          onMoveRequested={handleMove}
        />
      ) : null}
          {desktop || phoneTab === "map" ? (
          <div className="min-w-0 flex-1" data-testid="r3-map">
            {/* ONE chrome row (board V1): All days, the weekdays, then Browse nearby. */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid="r3-map-chips">
              <button
                type="button"
                aria-pressed={mapDay === "all"}
                onClick={() => setMapDay("all")}
                className="min-h-11 rounded-full border px-3 py-1 text-[12px] font-medium"
                style={mapDay === "all" ? { borderColor: BOARD.border, backgroundColor: BOARD.fill, color: BOARD.text } : { borderColor: BOARD.line, color: BOARD.ink }}
                data-testid="r3-map-chip-all"
              >
                All days
              </button>
              {columns.map((c) => (
                <button
                  key={c.day}
                  type="button"
                  aria-pressed={mapDay === c.day}
                  onClick={() => setMapDay(c.day)}
                  className="min-h-11 rounded-full border px-3 py-1 text-[12px] font-medium"
                  style={mapDay === c.day ? { borderColor: BOARD.border, backgroundColor: BOARD.fill, color: BOARD.text } : { borderColor: BOARD.line, color: BOARD.ink }}
                  data-testid="r3-map-chip-day"
                  data-day={c.day}
                >
                  {c.label.split(" ")[0]}
                </button>
              ))}
              <button type="button" className="ml-auto flex min-h-11 items-center rounded-full border px-3 py-1 text-[12px] font-medium text-foreground" style={{ borderColor: BOARD.line }} data-testid="r3-map-browse">
                Browse nearby
              </button>
            </div>
            {/* the chart itself: beige panel, pins and the stay ring, with the caption bottom-left and the ONE count line bottom-right */}
            <div className="relative overflow-hidden rounded-xl" style={{ backgroundColor: BOARD.column }} data-testid="r3-map-canvas-wrap" data-r3-map>
              <DaysMapPanel tripId={tripId} days={mapDays as any} anchor={mapAnchor as any} emptyNote={null} chrome="bare" r3 dayKey={mapDay === "all" ? ("all" as any) : (mapDay as any)} />
              <p className="pointer-events-none absolute bottom-8 left-3 z-[600] rounded bg-white/85 px-2 py-0.5 text-[11px] text-muted-foreground" data-testid="r3-map-caption">
                Pins only. Numbers follow the days, left to right.
              </p>
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground" data-testid="r3-map-count">
              {`${countLine ?? ""}${countLine ? " \u00b7 " : ""}the ring is where you're staying${ideas > 0 ? " \u00b7 Ideas aren't shown until they have a day" : ""}`}
            </p>
          </div>
          ) : null}
        </div>
      </section>


      {pendingRemoval ? (
        <div
          className="relative left-1/2 z-40 mt-3 flex w-screen max-w-[100vw] -translate-x-1/2 items-center justify-between gap-3 px-4 py-3 text-[13px]"
          style={{ backgroundColor: BOARD_INK }}
          data-testid="r3-stop-removed"
        >
          <span className="text-white">{`Removed ${String(pendingRemoval.stop?.name ?? pendingRemoval.stop?.title ?? "stop")}`}</span>
          <button
            type="button"
            className="min-h-[44px] rounded-lg px-3 text-[13px] font-semibold text-white underline underline-offset-2"
            onClick={undoRemoval}
            data-testid="r3-stop-undo"
          >
            Undo
          </button>
        </div>
      ) : null}
      {(desktop || (phoneTab === "days" && openDay >= 1)) ? (
        <OptimizeCard tripId={tripId} enabled isOwner={(data as any)?.tripRole === "owner"} />
      ) : null}

      <footer
        className={desktop ? "mt-6 flex items-center justify-between rounded-xl border border-border bg-card p-4" : "mt-6 flex flex-nowrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"}
        data-testid="r3-footer"
      >
        <span className={desktop ? "text-[13px] text-muted-foreground" : "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted-foreground"} data-testid="r3-footer-counts">
          {`${dayCount} days \u00b7 ${stops.length} stops \u00b7 ${ideas} ideas`}
        </span>
        <button
          type="button"
          className="shrink-0 whitespace-nowrap rounded-lg px-4 text-[13px] font-semibold text-white"
          style={{ backgroundColor: BOARD.ink, height: 44 }}
          data-testid="r3-finalize"
        >
          Finalize plan
        </button>
      </footer>
      {sheetFor ? (
        <StopSheet
          open
          tripId={tripId}
          stop={{ ...sheetFor.stop, tripId }}
          state={stopStateFor(sheetFor.stop, quotes)}
          dayLabel={sheetFor.dayLabel}
          timeZone={(data as any)?.timeZone ?? null}
          role={role}
          placeFacts={(data as any)?.placeFacts?.[String(sheetFor.stop.id)]}
          askOpen={askOpen}
          canAsk={canAsk}
          returnFocusTo={sheetTrigger.current?.el ?? null}
          onAskOpen={() => setAskOpen(true)}
          onAskClose={() => setAskOpen(false)}
          onClose={() => {
            setAskOpen(false);
            setSheetFor(null);
            // Back to the very control that opened it (Step 2 item 5), at both widths. The boards re-render while the
            // sheet is open, so the button is found again by its test id and stop id rather than by the stale node.
            const trigger = sheetTrigger.current;
            if (!trigger) return;
            // The boards re-render as the sheet unmounts, so keep trying for a few frames until the button holds focus.
            let tries = 0;
            const refocus = () => {
              const sel = trigger.phone ? "r3-phone-stop-menu" : "r3-stop-menu";
              const live = document.querySelector(
                `[data-testid="${sel}"][data-stop-id="${trigger.id}"]`,
              ) as HTMLElement | null;
              (live ?? trigger.el)?.focus();
              tries += 1;
              if (document.activeElement !== (live ?? trigger.el) && tries < 30) {
                requestAnimationFrame(refocus);
              }
            };
            requestAnimationFrame(refocus);
          }}
          onLockedChange={() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] })}
        />
      ) : null}


    </div>
  );
}
