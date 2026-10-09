/**
 * PlanEntry — the ONE way a new plan starts, in the pop-up container (E2, ledger
 * `2026-10-09-e2-plan-entry`). Every door that opens planning for a NEW plan opens this; editing an
 * existing plan opens the edit-only `PlanModal`. The decisions are `@/lib/plan-entry` (pure); this
 * file draws them and hands the answers to the provider, which mints.
 *
 * Step 1 "Plan around…" (a place · a date · an event) → Step 2 "What's the occasion?" → Start a plan.
 * No When, no Who, no plan name, no build chooser, no Clear/Save — zero typed fields on any path (the
 * city typeahead is optional; the eight markets are chips).
 *
 * TWO CONTAINERS, ONE PANEL (E3, ledger `2026-10-09-e3-experiences-inline`): `PlanEntry` is the pop-up
 * (a Dialog); `PlanEntryPanel` is the same steps and the same Start a plan, mounted INLINE on
 * /experiences. The inline mount never auto-starts (a visit writes nothing — a deep link with a city and
 * an occasion lands on Step 2 with Start a plan ready), its Start a plan sits in a sticky footer, and its
 * Place picker is the page's own world map and eight city cards (`placePicker`).
 *
 * Test ids (shared by both containers): `plan-entry` (the pop-up) / `plan-entry-inline` (the page), `plan-entry-around-*`,
 * `plan-entry-city-<marketKey>`, `plan-entry-city-input`, `plan-entry-not-yet`,
 * `plan-entry-date-weekend|next-month|pick`, `plan-entry-date-start|end`, `plan-entry-event-<id>`,
 * `plan-entry-group-<key>`, `plan-entry-more-specific`, `plan-entry-night-<date>|all`,
 * `button-plan-entry-start`, `button-plan-entry-back`, `plan-entry-error`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OccasionPicker } from "@/components/plan/OccasionPicker";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import {
  OCCASION_GROUP_LABELS,
  OCCASION_GROUP_ORDER,
  groupOccasions,
  occasionPickerGroupFor,
  type OccasionPickerGroup,
} from "@shared/experience-group";
import type { CityEventCard, CityEventsPayload } from "@shared/city-events";
import type { ExperienceType } from "@shared/schema";
import {
  asksWhichNight,
  canStartPlan,
  chosenOccasionSlug,
  eventNightDates,
  eventsByMonth,
  eventsOverlapping,
  initialPlanEntry,
  nextMonth,
  planEntryDestination,
  planEntryEventRow,
  planEntryView,
  startsStraightAway,
  thisWeekend,
  typedCity,
  withEvent,
  withNight,
  type PlanAround,
  type PlanEntrySource,
  type PlanEntryState,
  type PlanEntryStep,
} from "@/lib/plan-entry";

const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

/** What Start a plan hands the provider — every value one the traveler chose or the door held. */
export interface PlanEntryStart {
  destination: string;
  city: string;
  country: string;
  /** Both or neither; present only when a date or an event pick chose them (real dates). */
  startDate?: string;
  endDate?: string;
  occasionSlug: string;
  occasionId?: string;
  event?: { title: string; eventDate: string; startTime: string | null; location: string };
  view: "map" | "list";
  /** Funnel fact: was the occasion answered here, or carried by the door. */
  occasionAsked: boolean;
}

export type PlanEntryStartOutcome = { ok: true } | { ok: false; message?: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PlanEntrySource | null;
  onStart: (start: PlanEntryStart) => Promise<PlanEntryStartOutcome>;
}

interface PanelProps {
  /** The panel is showing (the pop-up is open, or the page is mounted). Gates the queries and the reset. */
  active: boolean;
  source: PlanEntrySource | null;
  onStart: (start: PlanEntryStart) => Promise<PlanEntryStartOutcome>;
  /** "dialog" = the pop-up; "page" = inline on /experiences (no auto-start, sticky footer). */
  container: "dialog" | "page";
  /** The page's Place picker (the world map + the eight cards); absent ⇒ the eight city chips. */
  placePicker?: (picked: string | null, pick: (marketKey: string) => void) => ReactNode;
}

const AROUND: Array<{ key: PlanAround; label: string }> = [
  { key: "place", label: "A place" },
  { key: "date", label: "A date" },
  { key: "event", label: "An event" },
];

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function rangeLabel(a: string, b: string): string {
  if (a === b) return dayLabel(a);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${dayLabel(a)}–${Number(b.slice(8, 10))}`;
  return `${dayLabel(a)} – ${dayLabel(b)}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const chip =
  "inline-flex items-center rounded-full border px-3.5 py-2 text-[14px] font-medium transition-colors";

function Chip({ active, onClick, testId, children }: { active: boolean; onClick: () => void; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={chip}
      style={
        active
          ? { background: "var(--coral-fill)", borderColor: "var(--coral-fill)", color: "#fff" }
          : { background: "#fff", borderColor: "var(--earn-line, #E8E8E2)", color: "var(--earn-navy, #1A1A18)" }
      }
    >
      {children}
    </button>
  );
}

/** The pop-up container: the panel in a Dialog. */
export function PlanEntry({ open, onOpenChange, source, onStart }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[640px]" data-testid="plan-entry">
        <PlanEntryPanel active={open} source={source} onStart={onStart} container="dialog" />
      </DialogContent>
    </Dialog>
  );
}

/** The steps and Start a plan, in either container. */
export function PlanEntryPanel({ active, source, onStart, container, placePicker }: PanelProps) {
  const open = active;
  const inline = container === "page";
  const seed = useMemo(() => {
    const s = initialPlanEntry(source);
    // Inline, Step 1 opens on "A place": the page's map and cards ARE its first question.
    return inline && s.state.around === null ? { ...s, state: { ...s.state, around: "place" as const } } : s;
  }, [source, inline]);
  const [state, setState] = useState<PlanEntryState>(seed.state);
  const [step, setStep] = useState<PlanEntryStep>(seed.step);
  const [typed, setTyped] = useState("");
  const [moreSpecific, setMoreSpecific] = useState(false);
  const [pickDates, setPickDates] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Did the door hand us the occasion (funnel `occasionSource`)? */
  const doorOccasion = useRef<boolean>(!!seed.state.occasionSlug);
  const autoStarted = useRef(false);

  // A new door is a new start: reset to what IT holds.
  useEffect(() => {
    if (!open) return;
    setState(seed.state);
    setStep(seed.step);
    setTyped("");
    setMoreSpecific(false);
    setPickDates(false);
    setError(null);
    setStarting(false);
    doorOccasion.current = !!seed.state.occasionSlug;
    autoStarted.current = false;
  }, [open, seed]);

  const { data: occasions, isLoading: occasionsLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const needsEvents = open && (state.around === "date" || state.around === "event");
  const { data: eventsPayload } = useQuery<CityEventsPayload>({
    queryKey: ["/api/city-events/upcoming"],
    enabled: needsEvents,
    staleTime: 5 * 60_000,
  });
  const events: CityEventCard[] = eventsPayload?.events ?? [];

  const occasionRows = occasions ?? [];
  const pickedSlug = chosenOccasionSlug(state);
  const pickedRow = occasionRows.find((o) => o.slug === pickedSlug) ?? null;
  const { groups } = useMemo(() => groupOccasions(occasionRows), [occasionRows]);
  const shownGroups = groups.length > 0 ? groups.map((g) => g.key) : [...OCCASION_GROUP_ORDER];

  // A door-named occasion selects its own group once the catalog is in.
  useEffect(() => {
    if (!state.occasionSlug || occasionRows.length === 0) return;
    const row = occasionRows.find((o) => o.slug === state.occasionSlug);
    // A slug the catalog does not carry ("photo") is not an answer: it is dropped, never minted (§13).
    if (!row) {
      doorOccasion.current = false;
      setState((s) => ({ ...s, occasionSlug: null }));
      return;
    }
    const g = occasionPickerGroupFor(row);
    if (g && g !== state.group) setState((s) => ({ ...s, group: g }));
  }, [state.occasionSlug, occasionRows, state.group]);

  const start = async () => {
    if (!canStartPlan(state) || starting || !state.market) return;
    setStarting(true);
    setError(null);
    const m = state.market;
    const out = await onStart({
      destination: planEntryDestination(m),
      city: m.cityName,
      country: m.country,
      ...(state.startDate && state.endDate ? { startDate: state.startDate, endDate: state.endDate } : {}),
      occasionSlug: pickedSlug,
      ...(pickedRow?.id ? { occasionId: pickedRow.id } : {}),
      ...(planEntryEventRow(state) ? { event: planEntryEventRow(state)! } : {}),
      view: planEntryView(state, pickedRow),
      occasionAsked: !doorOccasion.current || !!state.event,
    });
    if (!out.ok) {
      setStarting(false);
      if (out.message) setError(out.message);
    }
  };

  // Photo tile / Moments / AI panel: the door held the city AND an occasion the catalog carries.
  // Never inline (E3 ruling 3): a visit to /experiences writes nothing; its deep link lands on Step 2.
  useEffect(() => {
    if (inline || !open || autoStarted.current || occasionsLoading || occasionRows.length === 0) return;
    if (startsStraightAway(state, occasionRows.map((o) => o.slug))) {
      autoStarted.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, occasionsLoading, occasionRows.length]);

  const pickMarket = (key: string) => {
    const m = OPERATING_MARKETS.find((x) => x.marketKey === key) ?? null;
    setState((s) => ({ ...s, market: m, event: s.around === "date" ? null : s.event, night: null }));
    if (m && state.around !== "date") setStep("occasion");
  };

  const typedResult = typedCity(typed);

  const goAround = (a: PlanAround) => {
    setState((s) => ({ ...s, around: a }));
    setPickDates(false);
  };

  const title = step === "around" ? "Plan around…" : "What's the occasion?";
  const straight = starting && step !== "occasion";

  const cityChips = (only?: readonly string[]) =>
    !only && placePicker ? (
      <div data-testid="plan-entry-place-picker">{placePicker(state.market?.marketKey ?? null, pickMarket)}</div>
    ) : (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cities">
      {OPERATING_MARKETS.filter((m) => !only || only.includes(m.marketKey)).map((m) => (
        <Chip key={m.marketKey} active={state.market?.marketKey === m.marketKey} onClick={() => pickMarket(m.marketKey)} testId={`plan-entry-city-${m.marketKey}`}>
          {m.cityName}
        </Chip>
      ))}
    </div>
  );

  const eventButton = (e: CityEventCard) => (
    <button
      key={e.id}
      type="button"
      data-testid={`plan-entry-event-${e.id}`}
      onClick={() => {
        setState((s) => withEvent(s, { title: e.series ?? e.title, city: e.city, country: OPERATING_MARKETS.find((m) => m.marketKey === e.marketKey)?.country ?? null, venue: e.venue, firstDate: e.firstDate, lastDate: e.lastDate, startTime: e.startTime }));
        setStep("occasion");
      }}
      className="flex w-full items-baseline justify-between gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-[#FAFAF8]"
      style={{ borderColor: "var(--earn-line, #E8E8E2)" }}
    >
      <span className="text-[14px] font-medium" style={{ color: "var(--earn-navy, #1A1A18)" }}>{e.series ?? e.title}</span>
      <span className="shrink-0 text-[12px]" style={{ fontFamily: MONO, color: "#7A7A72" }}>
        {e.city} · {rangeLabel(e.firstDate, e.lastDate)}
      </span>
    </button>
  );

  const heading = straight ? "Starting your plan…" : title;
  return (
    <>
        <div className={inline ? "space-y-5" : "-mx-1 min-h-0 space-y-5 overflow-y-auto px-1 pb-1"}>
          {inline ? (
            // The page's h1 already asks "Plan around…", so Step 1's three choices sit right under it;
            // only Step 2 carries its own heading inline.
            step === "around" && !straight ? null : <h2 className="text-[22px] font-semibold" style={{ fontFamily: SERIF, color: "var(--earn-navy, #1A1A18)" }} data-testid="plan-entry-title">
              {heading}
            </h2>
          ) : (
            <DialogHeader>
              <span className="text-[10.5px] font-medium uppercase tracking-[0.14em]" style={{ fontFamily: MONO, color: "var(--coral-text)" }}>
                Start a plan
              </span>
              <DialogTitle className="text-[22px] font-semibold" style={{ fontFamily: SERIF, color: "var(--earn-navy, #1A1A18)" }}>
                {heading}
              </DialogTitle>
              <DialogDescription className="sr-only">Choose what to plan around, then the occasion.</DialogDescription>
            </DialogHeader>
          )}

          {straight ? null : step === "around" ? (
            <div className="space-y-4" data-testid="plan-entry-step-around">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Plan around">
                {AROUND.map((a) => (
                  <Chip key={a.key} active={state.around === a.key} onClick={() => goAround(a.key)} testId={`plan-entry-around-${a.key}`}>
                    {a.label}
                  </Chip>
                ))}
              </div>

              {state.around === "place" && (
                <div className="space-y-3">
                  {cityChips()}
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="Or type a city"
                    className="w-full rounded-md border px-3 py-2 text-[14px]"
                    style={{ borderColor: "var(--earn-line, #E8E8E2)" }}
                    data-testid="plan-entry-city-input"
                    aria-label="City"
                  />
                  {typedResult && "market" in typedResult && state.market?.marketKey !== typedResult.market.marketKey && (
                    <Chip active={false} onClick={() => pickMarket(typedResult.market.marketKey)} testId="plan-entry-city-typed">
                      {typedResult.market.cityName}
                    </Chip>
                  )}
                  {typedResult && "notYet" in typedResult && (
                    <div className="space-y-2" data-testid="plan-entry-not-yet">
                      <p className="text-[14px]" style={{ color: "#7A7A72" }}>
                        We're not planning in {typedResult.notYet} yet. Try one of these:
                      </p>
                      {cityChips(typedResult.suggestions.map((m) => m.marketKey))}
                    </div>
                  )}
                </div>
              )}

              {state.around === "date" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip active={false} onClick={() => { setPickDates(false); setState((s) => ({ ...s, ...thisWeekend(new Date()), event: null, night: null })); }} testId="plan-entry-date-weekend">This weekend</Chip>
                    <Chip active={false} onClick={() => { setPickDates(false); setState((s) => ({ ...s, ...nextMonth(new Date()), event: null, night: null })); }} testId="plan-entry-date-next-month">Next month</Chip>
                    <Chip active={pickDates} onClick={() => setPickDates(true)} testId="plan-entry-date-pick">Pick dates</Chip>
                  </div>
                  {pickDates && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" aria-label="Start date" value={state.startDate ?? ""} onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value || null, endDate: s.endDate && e.target.value && s.endDate < e.target.value ? e.target.value : s.endDate }))} className="rounded-md border px-2 py-1.5 text-[14px]" data-testid="plan-entry-date-start" />
                      <span aria-hidden>–</span>
                      <input type="date" aria-label="End date" min={state.startDate ?? undefined} value={state.endDate ?? ""} onChange={(e) => setState((s) => ({ ...s, endDate: e.target.value || null }))} className="rounded-md border px-2 py-1.5 text-[14px]" data-testid="plan-entry-date-end" />
                    </div>
                  )}
                  {state.startDate && state.endDate && (
                    <div className="space-y-3" data-testid="plan-entry-whats-on">
                      <p className="text-[13px] font-semibold" style={{ color: "var(--earn-navy, #1A1A18)" }}>
                        What's on {rangeLabel(state.startDate, state.endDate)}
                      </p>
                      <div className="space-y-2">{eventsOverlapping(events, state.startDate, state.endDate).map(eventButton)}</div>
                      {cityChips()}
                      {state.market && !state.event && (
                        <button type="button" onClick={() => setStep("occasion")} className="text-[14px] font-semibold underline" style={{ color: "var(--coral-text)" }} data-testid="button-plan-entry-next">
                          Next
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {state.around === "event" && (
                <div className="space-y-4" data-testid="plan-entry-events">
                  {events.length === 0 ? (
                    <p className="text-[14px]" style={{ color: "#7A7A72" }}>No upcoming events listed right now.</p>
                  ) : (
                    eventsByMonth(events).map((g) => (
                      <div key={g.month} className="space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "#7A7A72" }}>{monthLabel(g.month)}</p>
                        {g.events.map(eventButton)}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4" data-testid="plan-entry-step-occasion">
              <p className="text-[14px]" style={{ color: "#7A7A72" }} data-testid="plan-entry-summary">
                {[state.event?.title, state.market?.cityName, state.startDate && state.endDate ? rangeLabel(state.startDate, state.endDate) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {state.event && asksWhichNight(state.event) && (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--earn-navy, #1A1A18)" }}>Which night?</p>
                  <div className="flex flex-wrap gap-2">
                    <Chip active={!state.night} onClick={() => setState((s) => withNight(s, null))} testId="plan-entry-night-all">All of it</Chip>
                    {eventNightDates(state.event).map((d) => (
                      <Chip key={d} active={state.night === d} onClick={() => setState((s) => withNight(s, d))} testId={`plan-entry-night-${d}`}>
                        {dayLabel(d)}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2" role="group" aria-label="Occasion">
                {shownGroups.map((key: OccasionPickerGroup) => (
                  <Chip
                    key={key}
                    active={state.group === key && !(moreSpecific && state.occasionSlug)}
                    onClick={() => setState((s) => ({ ...s, group: key, occasionSlug: null }))}
                    testId={`plan-entry-group-${key}`}
                  >
                    {OCCASION_GROUP_LABELS[key]}
                  </Chip>
                ))}
              </div>

              <button type="button" onClick={() => setMoreSpecific((v) => !v)} className="text-[14px] font-semibold underline" style={{ color: "var(--coral-text)" }} data-testid="plan-entry-more-specific" aria-expanded={moreSpecific}>
                More specific
              </button>
              {moreSpecific && (
                <OccasionPicker
                  occasions={occasionRows}
                  loading={occasionsLoading}
                  value={state.occasionSlug ?? ""}
                  initialGroup={state.group}
                  onPick={(slug) => {
                    const row = occasionRows.find((o) => o.slug === slug);
                    const g = row ? occasionPickerGroupFor(row) : null;
                    setState((s) => ({ ...s, occasionSlug: slug, ...(g ? { group: g } : {}) }));
                  }}
                />
              )}
            </div>
          )}

          {error && (
            <p className="text-[14px]" role="alert" style={{ color: "var(--coral-text)" }} data-testid="plan-entry-error">{error}</p>
          )}
        </div>

        {!straight && (
          <div
            className={
              inline
                ? "sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-background py-3"
                : "flex items-center justify-between gap-3 border-t pt-3"
            }
            style={{ borderColor: "var(--earn-line, #E8E8E2)" }}
            data-testid="plan-entry-footer"
          >
            {step === "occasion" ? (
              <button type="button" onClick={() => setStep("around")} className="text-[14px] font-medium" style={{ color: "#7A7A72" }} data-testid="button-plan-entry-back">
                Back
              </button>
            ) : (
              <span />
            )}
            {(inline || step === "occasion" || (state.market && state.occasionSlug)) && (
              <button
                type="button"
                onClick={() => void start()}
                disabled={!canStartPlan(state) || starting}
                className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--coral-fill)" }}
                data-testid="button-plan-entry-start"
              >
                {starting ? "Starting…" : "Start a plan"}
              </button>
            )}
          </div>
        )}
    </>
  );
}
