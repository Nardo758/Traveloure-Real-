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
import { useMemo, useState } from "react";
import { useMinWidth } from "@/hooks/use-min-width";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type { SlipData } from "@/components/plancard/SlipView";
import { NEXT_QUESTION_COPY, NEXT_QUESTION_SKIP, type NextQuestionFacts, type NextQuestionKey } from "@/lib/next-question";
import { r3IdeaCount, r3Stops } from "@/lib/r3-surface";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The board's palette, as hex, in one place.
const BOARD = { text: "#5B4B8A", fill: "#EEEAF6", border: "#D8CFEE", ink: "#1B2430" } as const;
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
      className="inline-flex items-baseline gap-1 rounded-full border px-3 py-1.5"
      style={{ borderColor: BOARD.border }}
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
  const [skipped, setSkipped] = useState<NextQuestionKey[]>([]);
  const question = order.find((k) => !answered[k] && !skipped.includes(k)) ?? null;
  const copy = question ? NEXT_QUESTION_COPY[question] : null;

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
      className="h-11 rounded-lg border px-3 text-[13px] font-medium"
      style={active ? boardOutline : { borderColor: BOARD.border, color: BOARD.ink }}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1152px] px-4 py-6" data-testid="r3-surface" data-r3-part="p0">
      <header className={desktop ? "flex items-start justify-between gap-4" : "space-y-2"}>
        {desktop ? (
          <>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: BOARD.text }} data-testid="r3-eyebrow">
                {trip?.occasionLabel ?? "Your plan"}
              </p>
              <h1 className="mt-1 text-[34px] font-bold leading-[1.1] text-foreground" data-testid="r3-title">{trip?.title ?? "Your plan"}</h1>
            </div>
            <div className="flex items-center gap-2">
              {pill("Days and map", true, "r3-view-days-map")}
              {pill("Days only", false, "r3-view-days")}
              {pill("Map only", false, "r3-view-map")}
              {pill("Calendar", false, "r3-view-calendar")}
              <button type="button" className="h-11 rounded-lg border px-3 text-[13px] font-medium" style={{ borderColor: BOARD.border, color: BOARD.ink }} data-testid="r3-share">Share</button>
              <button type="button" aria-label="More" className="h-11 w-11 rounded-lg border" style={{ borderColor: BOARD.border, color: BOARD.ink }} data-testid="r3-menu">
                <MoreHorizontal className="mx-auto h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Back" className="p-1 text-foreground" data-testid="r3-back"><ArrowLeft className="h-5 w-5" /></button>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: BOARD.text }} data-testid="r3-eyebrow">{trip?.occasionLabel ?? "Your plan"}</p>
              <button type="button" aria-label="More" className="p-1 text-foreground" data-testid="r3-menu"><MoreHorizontal className="h-5 w-5" /></button>
            </div>
            <h1 className="text-[26px] font-bold leading-[1.15] text-foreground" data-testid="r3-title">{trip?.title ?? "Your plan"}</h1>
          </>
        )}
      </header>

      <section className="mt-5 rounded-xl border border-border bg-card p-4" data-testid="r3-strip">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" data-testid="r3-strip-title">What you've told us</p>
          <button type="button" className="text-[13px] font-medium underline-offset-2 hover:underline" style={{ color: BOARD.text }} data-testid="r3-strip-change">Change any of these</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
            <div className="flex items-center gap-2">
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

      <section className="mt-4 rounded-xl border p-4" style={{ backgroundColor: BOARD.fill, borderColor: BOARD.border }} data-testid="r3-optimize-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: BOARD.text }}>What Optimize found in your plan</p>
      </section>

      <section className="mt-4" data-testid="r3-days" data-day-count={dayCount} data-stop-count={stops.length} />

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
    </div>
  );
}
