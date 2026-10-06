/**
 * EventsCalendar.tsx — the /events page body: the year ahead as the stage, "What's on" for the
 * selected period, and "Where to go" (ledger `2026-10-06-events-calendar`; events-page brief 2a;
 * boards `Main`, `Mobile`). REPLACES the old GlobalCalendar and the /events "Coming up" block.
 *
 * ONE read (`GET /api/city-events/calendar`) feeds the marks, the list and the destinations, and
 * the marks and the list go through the same range test, so they cannot disagree (§18 rule 1).
 *
 * The root keeps `data-testid="global-calendar"`, which the marketplace-surface specs require to
 * be visible at every width — including 375px: the calendar is on the page on phones (the old one
 * was hidden below 1024px).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CITY_EVENT_VERTICALS } from "@shared/city-events";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import {
  bandMatches,
  bandsInPeriod,
  eventsInPeriod,
  matchesCity,
  matchesKind,
  monthFirst,
  monthLast,
  MONTH_NAMES,
  nextUp,
  periodRange,
  periodTitle,
  VERTICAL_LABELS,
  weekStartOf,
  whereToGo,
  type EventsCalendarPayload,
  type KindFilter,
  type PeriodKind,
} from "@shared/events-calendar";
import { usePlanning } from "@/contexts/PlanningContext";
import { MonthGrid, MONO } from "./MonthGrid";
import { WhatsOn } from "./WhatsOn";
import { WhereToGo } from "./WhereToGo";

const FRAUNCES = "'Fraunces', Georgia, serif";
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** The viewer's own calendar date — used only for the "today" mark and the Today button. */
function viewerToday(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const monthLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function FilterChip({ on, label, count, onClick, testId }: { on: boolean; label: string; count: number; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px]"
      style={{
        borderColor: on ? "var(--earn-teal-ink)" : "var(--earn-border)",
        background: on ? "var(--earn-teal-ink)" : "var(--earn-card)",
        color: on ? "var(--earn-card)" : "var(--earn-ink)",
      }}
      data-testid={testId}
    >
      {label}
      <span className="text-[11px]" style={{ fontFamily: MONO, opacity: 0.8 }}>
        {count}
      </span>
    </button>
  );
}

export function EventsCalendar() {
  const { open } = usePlanning();
  const { data, isLoading, isError } = useQuery<EventsCalendarPayload>({ queryKey: ["/api/city-events/calendar"] });

  const [mode, setMode] = useState<PeriodKind>("month");
  const [monthIdx, setMonthIdx] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [city, setCity] = useState("all");
  const [vibe, setVibe] = useState("all");
  const [showGrid, setShowGrid] = useState(false);
  const today = viewerToday();

  const months = data?.months ?? [];
  const ym = months[monthIdx] ?? months[0] ?? today.slice(0, 7);
  const monthName = MONTH_NAMES[Number(ym.slice(5, 7)) - 1];

  const events = useMemo(() => (data?.events ?? []).filter((e) => matchesKind(e, kind) && matchesCity(e, city)), [data, kind, city]);
  const bands = useMemo(() => (data?.bands ?? []).filter((b) => bandMatches(b, kind, city)), [data, kind, city]);

  // Counts for the chips: "What" counts within the chosen city, "Where" counts everything.
  const cityEvents = (data?.events ?? []).filter((e) => matchesCity(e, city));
  const cityBands = (data?.bands ?? []).filter((b) => bandMatches(b, "all", city));
  const kindChips: { id: KindFilter; label: string; n: number }[] = [
    { id: "all" as KindFilter, label: "All", n: cityEvents.length + cityBands.length },
    ...CITY_EVENT_VERTICALS.map((v) => ({ id: v as KindFilter, label: VERTICAL_LABELS[v], n: cityEvents.filter((e) => e.vertical === v).length })),
    // Ruling E7: a band-only filter, labelled so it reads as the band, not as events.
    { id: "season" as KindFilter, label: "All-month seasons", n: cityBands.length },
  ].filter((k) => k.id === "all" || k.n > 0);
  const allEvents = data?.events ?? [];
  const allBands = data?.bands ?? [];
  const cityChips = [
    { id: "all", label: "All eight cities", n: allEvents.length + allBands.length },
    ...OPERATING_MARKETS.map((m) => ({
      id: m.marketKey,
      label: m.cityName,
      n: allEvents.filter((e) => e.marketKey === m.marketKey).length + allBands.filter((b) => b.marketKeys.includes(m.marketKey)).length,
    })),
  ];

  const selKind: PeriodKind = mode === "day" && day ? "day" : mode === "week" && weekStart ? "week" : "month";
  const range = periodRange(selKind, ym, day, weekStart);
  const rows = eventsInPeriod(events, range.from, range.to);
  const periodBands = bandsInPeriod(bands, range.from, range.to);
  const next = nextUp(events);
  const jumpIdx = months.findIndex(
    (m, i) => i > monthIdx && (eventsInPeriod(events, monthFirst(m), monthLast(m)).length > 0 || bandsInPeriod(bands, monthFirst(m), monthLast(m)).length > 0),
  );

  const pickMonth = (i: number) => {
    setMonthIdx(i);
    setDay(null);
    setWeekStart(null);
  };
  const pickMode = (m: PeriodKind) => {
    setMode(m);
    setDay(null);
    setWeekStart(null);
  };
  const pickDay = (i: number, date: string) => {
    setMonthIdx(i);
    if (mode === "week") {
      setWeekStart(weekStartOf(date));
      setDay(null);
    } else {
      setMode("day");
      setDay(date);
      setWeekStart(null);
    }
  };
  const goToday = () => {
    const i = months.indexOf(today.slice(0, 7));
    if (i < 0) return;
    setMode("day");
    setMonthIdx(i);
    setDay(today);
    setWeekStart(null);
  };
  const hint = mode === "month" ? "Pick a month, or a date inside it." : mode === "week" ? "Pick a week in any month." : "Pick a date.";
  const gridOpen = showGrid || mode !== "month";

  const bandLabel = (m: string) => {
    const bs = bandsInPeriod(bands, monthFirst(m), monthLast(m));
    if (bs.length === 0) return null;
    return `${bs[0].title} · ${bs[0].place}${bs.length > 1 ? ` +${bs.length - 1}` : ""}`;
  };
  const countIn = (m: string) => eventsInPeriod(events, monthFirst(m), monthLast(m)).length;

  const modeButtons = (
    <div role="group" aria-label="Select by" className="inline-flex overflow-hidden rounded-[8px] border" style={{ borderColor: "var(--earn-border)" }}>
      {(["month", "week", "day"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => pickMode(m)}
          aria-pressed={mode === m}
          className="px-3 py-1 text-[12.5px] capitalize"
          style={{ background: mode === m ? "var(--earn-navy)" : "var(--earn-card)", color: mode === m ? "var(--earn-card)" : "var(--earn-ink)" }}
          data-testid={`events-mode-${m}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
  const todayButton = (
    <button type="button" onClick={goToday} className="rounded-[8px] border px-3 py-1 text-[12.5px]" style={{ borderColor: "var(--earn-border)", color: "var(--earn-ink)", background: "var(--earn-card)" }} data-testid="events-today">
      Today
    </button>
  );

  return (
    <section data-testid="global-calendar" className="flex min-h-[200px] flex-col gap-5">
      {/* What / Where */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2" data-testid="events-filter-what">
          <span className="w-[52px] text-[10.5px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
            What
          </span>
          {kindChips.map((k) => (
            <FilterChip key={k.id} on={kind === k.id} label={k.label} count={k.n} onClick={() => setKind(k.id)} testId={`events-kind-${k.id}`} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="events-filter-where">
          <span className="w-[52px] text-[10.5px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
            Where
          </span>
          {cityChips.map((c) => (
            <FilterChip key={c.id} on={city === c.id} label={c.label} count={c.n} onClick={() => setCity(c.id)} testId={`events-city-${c.id}`} />
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-[13px]" style={{ color: "var(--earn-muted)" }}>
          Loading the calendar…
        </p>
      )}
      {isError && (
        <p className="text-[13px]" style={{ color: "var(--earn-muted)" }} data-testid="events-calendar-error">
          The events calendar could not be loaded right now.
        </p>
      )}

      {data && months.length > 0 && (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10.5px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
                  The year ahead
                </span>
                <h2 className="text-[22px] font-semibold leading-tight" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }} data-testid="events-year-title">
                  {monthLabel(months[0])} to {monthLabel(months[11])}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="hidden text-[12px] sm:inline" style={{ color: "var(--earn-muted)" }}>
                  {hint}
                </span>
                {modeButtons}
                {todayButton}
              </div>
            </div>

            {/* Desktop: all twelve months on the stage. */}
            <div className="hidden gap-x-5 gap-y-4 lg:grid lg:grid-cols-3 xl:grid-cols-4" data-testid="events-year-grid">
              {months.map((m, i) => {
                const band = bandLabel(m);
                const n = countIn(m);
                const on = i === monthIdx;
                return (
                  <div key={m} className="flex flex-col gap-1.5 rounded-[10px] border p-2" style={{ borderColor: on ? "var(--earn-navy)" : "transparent", background: on ? "var(--earn-ground)" : "transparent" }}>
                    <button
                      type="button"
                      onClick={() => pickMonth(i)}
                      aria-pressed={on}
                      aria-label={`${monthLabel(m)}, ${n} ${n === 1 ? "event" : "events"}`}
                      className="flex items-baseline justify-between text-left"
                      data-testid={`events-month-${m}`}
                    >
                      <span className="text-[12px] tracking-[0.1em]" style={{ fontFamily: MONO, color: n > 0 || band || on ? "var(--earn-navy)" : "var(--earn-muted)" }}>
                        {MON[Number(m.slice(5, 7)) - 1]} {i === 0 || m.endsWith("-01") ? m.slice(0, 4) : ""}
                      </span>
                      {n > 0 && (
                        <span className="text-[11px]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
                          {n}
                        </span>
                      )}
                    </button>
                    <MonthGrid ym={m} events={events} mode={mode} selectedDay={day} selectedWeek={weekStart} today={today} onPickDay={(d) => pickDay(i, d)} testIdPrefix="events-day" />
                    <div className="min-h-[16px]">
                      {band && (
                        <span className="text-[9.5px] uppercase tracking-[0.08em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }} data-testid={`events-month-band-${m}`}>
                          All month · {band}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Phones and tablets: the twelve months as a strip, one month's dates below. */}
            <div className="flex flex-col gap-3 lg:hidden" data-testid="events-year-strip">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {months.map((m, i) => {
                  const n = countIn(m);
                  const on = i === monthIdx;
                  const hasBand = !!bandLabel(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => pickMonth(i)}
                      aria-pressed={on}
                      aria-label={`${monthLabel(m)}, ${n} ${n === 1 ? "event" : "events"}`}
                      className="flex min-w-[52px] shrink-0 flex-col items-center rounded-[8px] border px-2 py-1"
                      style={{ borderColor: on ? "var(--earn-navy)" : "var(--earn-border)", background: on ? "var(--earn-navy)" : "var(--earn-card)", color: on ? "var(--earn-card)" : "var(--earn-ink)" }}
                      data-testid={`events-month-pill-${m}`}
                    >
                      <span className="text-[11px] tracking-[0.08em]" style={{ fontFamily: MONO }}>
                        {MON[Number(m.slice(5, 7)) - 1]}
                      </span>
                      <span className="text-[10px]" style={{ fontFamily: MONO, opacity: 0.85 }}>
                        {n > 0 ? n : hasBand ? "season" : "–"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <b className="text-[17px]" style={{ fontFamily: FRAUNCES, color: "var(--earn-navy)" }}>
                    {monthLabel(ym)}
                  </b>
                  <span className="text-[11.5px]" style={{ color: "var(--earn-muted)" }}>
                    {hint}
                  </span>
                </div>
                {mode === "month" && (
                  <button type="button" onClick={() => setShowGrid(!showGrid)} aria-expanded={gridOpen} className="rounded-[8px] border px-3 py-1 text-[12.5px]" style={{ borderColor: "var(--earn-border)", color: "var(--earn-ink)" }} data-testid="events-toggle-grid">
                    {gridOpen ? "Hide dates" : "Show dates"}
                  </button>
                )}
              </div>
              {gridOpen && (
                <MonthGrid ym={ym} events={events} mode={mode} selectedDay={day} selectedWeek={weekStart} today={today} onPickDay={(d) => pickDay(monthIdx, d)} testIdPrefix="events-day-m" />
              )}
              {bandLabel(ym) && (
                <span className="text-[10px] uppercase tracking-[0.08em]" style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}>
                  All month · {bandLabel(ym)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--earn-muted)" }} aria-label="Legend">
              <span>Light: one event</span>
              <span>Strong: two or more</span>
              <span>Underline: long run (11+ days)</span>
              <span>Band: in season all month</span>
              <span>Filled: today</span>
              <span>Outline: selected</span>
            </div>
          </div>

          <div className="w-full lg:w-[380px] lg:shrink-0">
            <WhatsOn
              kind={selKind}
              title={periodTitle(selKind, ym, day, weekStart)}
              rows={rows}
              nextId={next?.id ?? null}
              bands={periodBands}
              monthName={monthName}
              cityLabel={city === "all" ? "our cities" : OPERATING_MARKETS.find((m) => m.marketKey === city)?.cityName ?? "this city"}
              showBack={selKind !== "month"}
              onBack={() => {
                setDay(null);
                setWeekStart(null);
              }}
              jump={jumpIdx >= 0 ? { label: `Go to ${monthLabel(months[jumpIdx])}`, go: () => pickMonth(jumpIdx) } : null}
              onPlanAround={(source) => open(source)}
            />
          </div>
        </div>
      )}

      {data && <WhereToGo monthName={monthName} rows={whereToGo(data.places, ym, data.events, vibe)} vibe={vibe} onVibe={setVibe} />}
    </section>
  );
}
