/**
 * Revision 3 planning surface - P0, the shell.
 *
 * Board: `project/V01_DaysBoard.dc.html` (crop `board-V1-days-board-1280.png`). The frame is five things in order:
 * header (eyebrow, title, view switch, Share, menu), the strip, one "What Optimize found" card, the days with the map,
 * and the footer. This part draws the frame and the strip from the plan's own facts; the days board is P1 and the phone
 * board is P2, so the middle is a labelled slot rather than a guess.
 *
 * Reuses: the plancard DTO (`SlipData`) the old page already fetches - no new request; `nextQuestionSkipping` for the
 * one question; the strip's five chips read the same facts the old strip reads. It does NOT reuse `SlipView`'s layout.
 *
 * Every string here is board text and stays DRAFT until Leon approves it.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import type { SlipData } from "@/components/plancard/SlipView";
import { NEXT_QUESTION_COPY, NEXT_QUESTION_SKIP, type NextQuestionFacts, type NextQuestionKey } from "@/lib/next-question";

const chip = "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px]";

export function R3PlanningSurface({ data, tripId }: { data: SlipData; tripId: string }) {
  const trip: any = (data as any)?.trip ?? {};
  const items: any[] = ((data as any)?.items ?? (data as any)?.activities ?? []) as any[];
  const stops = items.filter((i) => !i?.type || i.type !== "lodging");
  const days = useMemo(() => {
    const start = trip?.startDate ? new Date(trip.startDate) : null;
    const end = trip?.endDate ? new Date(trip.endDate) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [] as { n: number; stops: any[] }[];
    const count = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    return Array.from({ length: count }, (_, i) => ({ n: i + 1, stops: stops.filter((s) => Number(s?.dayNumber) === i + 1) }));
  }, [trip?.startDate, trip?.endDate, items.length]);

  const facts: NextQuestionFacts = {
    datesConfirmed: trip?.datesConfirmed === true,
    travelers: Number(trip?.numberOfTravelers ?? trip?.travelers ?? 0) || null,
    stayChosen: items.some((i) => i?.type === "lodging"),
    flightKnown: items.some((i) => /flight/i.test(String(i?.type ?? "")) || /flight/i.test(String(i?.name ?? ""))),
  };
  // One pass over the board's fixed order. `nextQuestionSkipping` (the A10 fix on PR #2091) takes over once it lands;
  // today the order and the "answered" test are spelled here, bounded, with no loop.
  const order: readonly NextQuestionKey[] = ["dates", "party", "stay", "flight"];
  const answered: Record<NextQuestionKey, boolean> = {
    dates: facts.datesConfirmed,
    party: (facts.travelers ?? 0) > 0,
    stay: facts.stayChosen,
    flight: facts.flightKnown,
  };
  // TODO(P1): wire the Skip press to `nextQuestionSkipping` when #2091 merges; P0 draws the control, it does not move.
  const question: NextQuestionKey | null = order.find((k) => !answered[k]) ?? null;
  const copy = question ? NEXT_QUESTION_COPY[question] : null;

  return (
    <div className="mx-auto max-w-[1152px] px-4 py-6" data-testid="r3-surface" data-r3-part="p0">
      {/* header: eyebrow, title, switch, Share, menu - the board has no dates, party, status line or phase tag here */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground" data-testid="r3-eyebrow">
            {trip?.occasionLabel ?? "Your plan · Trip"}
          </p>
          <h1 className="text-2xl font-semibold" data-testid="r3-title">{trip?.title ?? "Your plan"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={chip} data-testid="r3-view-switch">Days and map</button>
          <Link href={`/plans/${tripId}`} className={chip} data-testid="r3-leave">Share</Link>
        </div>
      </header>

      {/* the strip: one question, then the five chips the board draws with VALUES */}
      <section className="mt-5 space-y-2" data-testid="r3-strip">
        {copy ? (
          <p className="text-[13px]" data-testid="r3-question">
            {copy.sentence}{" "}
            <button type="button" className="underline" data-testid="r3-question-action">{copy.action}</button>{" "}
            <button type="button" className="underline" data-testid="r3-question-skip">{NEXT_QUESTION_SKIP}</button>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className={chip} data-testid="r3-chip-where">Where · {trip?.destination ?? "not set"}</span>
          <span className={chip} data-testid="r3-chip-when">When · {trip?.startDate ?? "no dates"}</span>
          <span className={chip} data-testid="r3-chip-who">Who · {facts.travelers ?? 0} travelers</span>
          <span className={chip} data-testid="r3-chip-staying">Staying · {facts.stayChosen ? "chosen" : "not set"}</span>
          <span className={chip} data-testid="r3-chip-pace">Pace · Easy</span>
        </div>
        <p className="text-[12px] text-muted-foreground" data-testid="r3-strip-change">Change any of these</p>
      </section>

      {/* one "What Optimize found" card: the card body is P1's (V8 draws its final wording) */}
      <section className="mt-5 rounded-xl border p-4" data-testid="r3-optimize-card">
        <p className="text-sm font-medium">What Optimize found in your plan</p>
        <p className="mt-1 text-[13px] text-muted-foreground" data-testid="r3-optimize-slot">
          Placeholder in P0: the findings list and the Optimize control arrive with P1.
        </p>
      </section>

      {/* the days board: P1 fills this slot; the frame reserves it so the page's shape is right today */}
      <section className="mt-5" data-testid="r3-days">
        <p className="text-[13px] text-muted-foreground" data-testid="r3-days-slot">
          {days.length} days · {stops.length} stops
        </p>
      </section>

      <footer className="mt-6 flex items-center justify-between text-[13px]" data-testid="r3-footer">
        <span data-testid="r3-footer-counts">{days.length} days · {stops.length} stops · 0 ideas</span>
        <button type="button" className={chip} data-testid="r3-finalize">Finalize plan</button>
      </footer>
    </div>
  );
}
