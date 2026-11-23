/**
 * Revision 3 planning surface - P0, board V1 (`board-V1-days-board-1280.png`) and V2 at 390.
 *
 * Frame, as the board draws it: eyebrow, title, four view pills, Share and the ⋯ menu; a white bordered strip card with
 * the "What you've told us" heading, "Change any of these" as a link, five value chips, a divider and the one question;
 * the Optimize card; the days slot (P1); a white bordered footer card with real counts and a dark Finalize button.
 *
 * Reuses the plancard DTO the old page already fetches, `nextQuestionSkipping`-style selection from `next-question.ts`,
 * and the app's own theme tokens (`--card`, `--border`, `--primary`, `--muted-foreground`). It does NOT reuse SlipView's
 * layout. Every string here is board text and stays DRAFT until Leon approves it.
 */
import { useMemo, useState } from "react";
import { useMinWidth } from "@/hooks/use-min-width";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type { SlipData } from "@/components/plancard/SlipView";
import { NEXT_QUESTION_COPY, NEXT_QUESTION_SKIP, type NextQuestionFacts, type NextQuestionKey } from "@/lib/next-question";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DASH = "\u2014"; // "—" pending wording approval (Leon, Nov 22 2026)

/** "Tue 8 – Thu 10 Dec" from the plan's own dates; "" when the plan has none (the chip then shows "—"). */
function whenLine(start?: string | null, end?: string | null): string {
  const s = start ? new Date(`${start}T00:00:00`) : null;
  const e = end ? new Date(`${end}T00:00:00`) : null;
  if (!s || Number.isNaN(s.getTime())) return "";
  const left = `${WEEKDAY[s.getDay()]} ${s.getDate()}`;
  if (!e || Number.isNaN(e.getTime())) return left;
  const right = `${WEEKDAY[e.getDay()]} ${e.getDate()} ${MONTH[e.getMonth()]}`;
  return `${left} \u2013 ${right}`;
}

function Chip({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full border border-border px-3 py-1.5" data-testid={testId}>
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-semibold text-foreground">{value || DASH}</span>
    </span>
  );
}

export function R3PlanningSurface({ data, tripId }: { data: SlipData; tripId: string }) {
  const desktop = useMinWidth(1024);
  const trip: any = (data as any)?.trip ?? {};
  const items: any[] = ((data as any)?.items ?? (data as any)?.activities ?? []) as any[];
  const lodging = items.find((i) => i?.type === "lodging");
  const stops = items.filter((i) => !i?.type || i.type !== "lodging");
  const ideas = stops.filter((s) => s?.dayNumber == null || Number(s.dayNumber) === 0);
  const days = useMemo(() => {
    const start = trip?.startDate ? new Date(`${trip.startDate}T00:00:00`) : null;
    const end = trip?.endDate ? new Date(`${trip.endDate}T00:00:00`) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    const count = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [trip?.startDate, trip?.endDate]);

  const facts: NextQuestionFacts = {
    datesConfirmed: trip?.datesConfirmed === true,
    travelers: Number(trip?.numberOfTravelers ?? trip?.travelers ?? 0) || null,
    stayChosen: !!lodging,
    flightKnown: items.some((i) => /flight/i.test(String(i?.type ?? "")) || /flight/i.test(String(i?.name ?? ""))),
  };
  // One bounded pass over the board's fixed order; Skip remembers in this visit only (no storage).
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

  const pill = (label: string, active: boolean, testId: string) => (
    <button
      key={label}
      type="button"
      data-testid={testId}
      className={
        active
          ? "rounded-full bg-purple-600 px-3 py-1.5 text-[13px] font-semibold text-white"
          : "rounded-full border border-border px-3 py-1.5 text-[13px] font-medium text-foreground"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1152px] px-4 py-6" data-testid="r3-surface" data-r3-part="p0">
      {/* header: phone = back, centred eyebrow, ⋯, then the title on its own line; desktop = eyebrow, title, pills, Share, ⋯ */}
      <header className={desktop ? "flex items-start justify-between gap-4" : "space-y-2"}>
        {desktop ? (
          <>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-purple-700" data-testid="r3-eyebrow">
                {trip?.occasionLabel ?? "Your plan \u00b7 Trip"}
              </p>
              <h1 className="mt-1 text-[34px] font-bold leading-[1.1]" data-testid="r3-title">{trip?.title ?? "Your plan"}</h1>
            </div>
            <div className="flex items-center gap-2">
              {pill("Days and map", true, "r3-view-days-map")}
              {pill("Days only", false, "r3-view-days")}
              {pill("Map only", false, "r3-view-map")}
              {pill("Calendar", false, "r3-view-calendar")}
              <button type="button" className="rounded-full border border-border px-3 py-1.5 text-[13px] font-medium text-foreground" data-testid="r3-share">
                Share
              </button>
              <button type="button" aria-label="More" className="rounded-full border border-border p-2" data-testid="r3-menu">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Back" className="p-1" data-testid="r3-back">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-purple-700" data-testid="r3-eyebrow">
                {trip?.occasionLabel ?? "Your plan \u00b7 Trip"}
              </p>
              <button type="button" aria-label="More" className="p-1" data-testid="r3-menu">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
            <h1 className="text-[26px] font-bold leading-[1.15]" data-testid="r3-title">{trip?.title ?? "Your plan"}</h1>
          </>
        )}
      </header>

      {/* strip: white bordered card, heading, the link top-right, five value chips, a divider, then the one question */}
      <section className="mt-5 rounded-xl border border-border bg-card p-4" data-testid="r3-strip">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground" data-testid="r3-strip-title">
            What you've told us
          </p>
          <button type="button" className="text-[13px] font-medium text-purple-700 underline-offset-2 hover:underline" data-testid="r3-strip-change">
            Change any of these
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip label="Where" value={String(trip?.destination ?? "")} testId="r3-chip-where" />
          <Chip label="When" value={whenLine(trip?.startDate, trip?.endDate)} testId="r3-chip-when" />
          <Chip label="Who" value={facts.travelers ? `${facts.travelers} travelers` : ""} testId="r3-chip-who" />
          <Chip label="Staying" value={String(lodging?.neighbourhood ?? lodging?.area ?? lodging?.name ?? "")} testId="r3-chip-staying" />
          <Chip label="Pace" value={String(trip?.energyProfile ?? trip?.pace ?? "")} testId="r3-chip-pace" />
        </div>
        <div className="my-3 border-t border-border" />
        {copy ? (
          <div className="flex flex-wrap items-center justify-between gap-2" data-testid="r3-question">
            <p className="text-[13px] text-foreground">
              <span className="font-semibold">Next:</span>{" "}
              {copy.sentence.replace(/^Next:\s*/, "")}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-full bg-purple-600 px-3 py-1.5 text-[13px] font-semibold text-white" data-testid="r3-question-action">
                {copy.action}
              </button>
              <button type="button" className="rounded-full border border-border px-3 py-1.5 text-[13px] font-medium" data-testid="r3-question-skip" onClick={() => setSkipped((s) => [...s, question!])}>
                {NEXT_QUESTION_SKIP}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Optimize card: purple-tinted, its title an uppercase purple label; the body is V8's */}
      <section className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-4" data-testid="r3-optimize-card">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-purple-700">
          What Optimize found in your plan
        </p>
      </section>

      {/* the days board slot: P1 replaces it; no counts line here - the footer carries the counts */}
      <section className="mt-4" data-testid="r3-days" data-day-count={days.length} data-stop-count={stops.length} />

      {/* footer: white bordered card, real counts, dark Finalize */}
      <footer className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card p-4" data-testid="r3-footer">
        <span className="text-[13px] text-muted-foreground" data-testid="r3-footer-counts">
          {days.length} days \u00b7 {stops.length} stops \u00b7 {ideas.length} ideas
        </span>
        <button type="button" className="rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background" data-testid="r3-finalize">
          Finalize plan
        </button>
      </footer>
    </div>
  );
}
