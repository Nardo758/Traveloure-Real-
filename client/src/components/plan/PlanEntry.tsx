/**
 * PlanEntry — the ONE way a new plan starts, in the pop-up container (E2, ledger
 * `2026-10-09-e2-plan-entry`). Every door that opens planning for a NEW plan opens this; editing an
 * existing plan opens the edit-only `PlanModal`. The decisions are `@/lib/plan-entry` (pure); this
 * file draws them and hands the answers to the provider, which mints.
 *
 * Step 1 "Plan around…" (a place · a date · an event) → Step 2 "What's the occasion?" → Start a plan.
 * No When, no Who, no plan name, no build chooser, no Clear/Save on that path (the city typeahead is
 * optional; the eight markets are chips). H-10: when an experience and a city are already chosen, the
 * next step asks dates and party (`plan-entry-step-details`) and nothing else.
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
 * `plan-entry-step-details`, `plan-entry-carried-group`, `plan-entry-party-adults|kids`,
 * `button-plan-entry-start`, `button-plan-entry-back`, `plan-entry-error`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OccasionPicker } from "@/components/plan/OccasionPicker";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { Link, useLocation } from "wouter";
import { MARKET_STATUS_COPY, marketIsOpen, marketPickerOrder, marketStatusLabel } from "@shared/ticker";
import { useMarketStatusSettings, useMarqueeMarket } from "@/lib/signup-mode";
import { notPlanningInLine } from "@/lib/trip-slip";
import { waitlistMarketPath } from "@/lib/waitlist-markets";
import {
  OCCASION_GROUP_LABELS,
  OCCASION_GROUP_ORDER,
  groupOccasions,
  occasionPickerGroupFor,
  type OccasionPickerGroup,
} from "@shared/experience-group";
import { countdownLabel, type CityEventCard, type CityEventsPayload } from "@shared/city-events";
import { EventRow } from "@/components/events/EventRow";
import { planAroundEventTitle } from "@/components/landing/events-strip";
import { marketToday } from "@shared/market-today";
import type { ExperienceType } from "@shared/schema";
import { PLAN_DATES_SET_CTA, PLAN_PARTY_ASK } from "@shared/plan-dates";
import { partyFields } from "@/lib/plan-steps";
import { partyFieldShown } from "@/lib/party-default";
import { travelersForSave } from "@/lib/plan-vocabulary";
import {
  EVENT_OCCASION_SLUG,
  canStartPlan,
  choosePlanEntryGroup,
  chosenOccasionSlug,
  doorChoseGroup,
  eventPickerGroups,
  eventsOverlapping,
  planEntryChoiceLabel,
  initialPlanEntry,
  nextMonthScope,
  nightPickerOptions,
  eventAllOfIt,
  withSeriesShows,
  planEntryDestination,
  planEntryMintDates,
  planEntryEventRow,
  planEntryView,
  startsStraightAway,
  thisWeekend,
  typedCity,
  withEvent,
  withMarqueeCity,
  withNight,
  type ExperiencesPick,
  type PlanAround,
  type PlanEntrySource,
  type PlanEntryState,
  type PlanEntryStep,
  shownOccasionGroups,
} from "@/lib/plan-entry";

const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

/**
 * ENTRY-1: the footer button's label. HELD for "Wording approved — Leon".
 * The default group is not drawn as chosen until the traveler picks one; picking does not advance.
 */
export const PLAN_ENTRY_CONTINUE = "Continue";

/** What Start a plan hands the provider — every value one the traveler chose or the door held. */
export interface PlanEntryStart {
  destination: string;
  city: string;
  country: string;
  /** Both or neither; present only when a date or an event pick chose them (real dates). */
  startDate?: string;
  endDate?: string;
  /** A-8: null when nothing was picked — the plan stores no occasion. */
  occasionSlug: string | null;
  occasionId?: string;
  /**
   * E-1/E-5/E-8 (round 2 ruling, Nov 4, 2026): what the traveler chose, in words (`planEntryChoiceLabel`) — the event's
   * title, a "More specific" occasion's name, or the chosen group's label. The plan's title and banner lead with it.
   * Never a group's default occasion.
   */
  occasionName?: string;
  event?: { title: string; eventDate: string; startTime: string | null; location: string };
  /** SH-1 Launch Q14.3: the `city_events.source_id` the plan is built around — the server refuses an ended one. */
  eventSourceId?: string;
  view: "map" | "list";
  /** Funnel fact: was the occasion answered here, or carried by the door. */
  occasionAsked: boolean;
  /** Party the traveler typed on the details step. Absent = not answered, never 0. */
  adults?: number;
  kids?: number;
  /** TG-1: the picker group the plan was started in (an analytics label; the mint does not read it). */
  group?: OccasionPickerGroup;
}

export type PlanEntryStartOutcome = { ok: true } | { ok: false; message?: string; waitlistMarket?: string };

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
  /**
   * Inline only. The city and experience the panel is holding, so the nav pop-up can open on
   * them. The dialog does not report — a second panel must not clobber the page's pick.
   */
  onHeldChange?: (pick: ExperiencesPick | null) => void;
  /** ENTRY-1: the pop-up reports its step so the provider can mirror it to the URL. */
  onStepChange?: (step: PlanEntryStep) => void;
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

/**
 * R3-20 (round 3, ledger `2026-11-05-r3-followups-2`): the ONE date-preset row — This weekend · Next month · Pick dates ·
 * What's on — drawn by every entry path (the "A date" step and the dates-and-party step). "This weekend" is
 * `thisWeekend` (the coming Saturday–Sunday; on a Saturday or Sunday the rest of that weekend), and it sets both dates.
 */
export const DATE_PRESET_LABELS = ["This weekend", "Next month", "Pick dates", "What's on"] as const;
export function DatePresets(props: {
  nextMonthActive: boolean;
  pickActive: boolean;
  whatsOnActive: boolean;
  onWeekend: () => void;
  onNextMonth: () => void;
  onPick: () => void;
  onWhatsOn: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="plan-entry-date-presets">
      <Chip active={false} onClick={props.onWeekend} testId="plan-entry-date-weekend">{DATE_PRESET_LABELS[0]}</Chip>
      {/* R3-8: opens the picker scoped to next month; the traveler picks the days. */}
      <Chip active={props.nextMonthActive} onClick={props.onNextMonth} testId="plan-entry-date-next-month">{DATE_PRESET_LABELS[1]}</Chip>
      <Chip active={props.pickActive} onClick={props.onPick} testId="plan-entry-date-pick">{DATE_PRESET_LABELS[2]}</Chip>
      {/* E-7 (round 2 rulings): the same event list as "An event". */}
      <Chip active={props.whatsOnActive} onClick={props.onWhatsOn} testId="plan-entry-date-whats-on">{DATE_PRESET_LABELS[3]}</Chip>
    </div>
  );
}

/** CITY-1: a non-open market's chip — a link to its waitlist, never a selection. */
function WaitlistChip({ marketKey, testId, children }: { marketKey: string; testId: string; children: React.ReactNode }) {
  return (
    <Link
      href={waitlistMarketPath(marketKey)}
      data-testid={testId}
      className={chip}
      style={{ background: "#fff", borderColor: "var(--earn-line, #E8E8E2)", color: "var(--earn-navy, #1A1A18)" }}
    >
      {children}
    </Link>
  );
}

/** The pop-up container: the panel in a Dialog. */
export function PlanEntry({ open, onOpenChange, source, onStart, onStepChange }: Props & { onStepChange?: (step: PlanEntryStep) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[640px]" data-testid="plan-entry">
        <PlanEntryPanel active={open} source={source} onStart={onStart} container="dialog" onStepChange={onStepChange} />
      </DialogContent>
    </Dialog>
  );
}

/** The steps and Start a plan, in either container. */
export function PlanEntryPanel({ active, source, onStart, container, placePicker, onHeldChange, onStepChange }: PanelProps) {
  const open = active;
  const inline = container === "page";
  const seed = useMemo(() => {
    const s = initialPlanEntry(source);
    // Inline, Step 1 opens on "A place": the page's map and cards ARE its first question.
    return inline && s.state.around === null ? { ...s, state: { ...s.state, around: "place" as const } } : s;
  }, [source, inline]);
  // CITY-1 (ledger `2026-11-04-city1-marquee-defaults`): the marquee is first and pre-selected; a market that is not
  // open (neither the marquee nor live) links to its waitlist. Until the answer loads every market is selectable —
  // the trip mint refuses a non-open market on the server either way.
  const { settings: marketSettings, loaded: marketSettingsLoaded } = useMarketStatusSettings();
  const isOpenMarket = (key: string) => !marketSettingsLoaded || marketIsOpen(key, marketSettings);
  const marquee = marketSettingsLoaded ? marketSettings.launch : null;
  // E-7 (ruling, Nov 5, 2026): the "What's on" list groups by the ONE launch-market resolver with the marquee fallback —
  // the same market the landing strip reads — so an unresolved setting never empties or reorders it differently.
  const whatsOnMarquee = useMarqueeMarket().slug;
  const [state, setState] = useState<PlanEntryState>(() => withMarqueeCity(seed.state, marquee));
  const [step, setStep] = useState<PlanEntryStep>(seed.step);
  useEffect(() => {
    if (active) onStepChange?.(step);
  }, [active, step, onStepChange]);
  const [typed, setTyped] = useState("");
  const [moreSpecific, setMoreSpecific] = useState(false);
  const [pickDates, setPickDates] = useState(false);
  // R3-8: "Next month" scopes the picker (min/max) and sets no dates; null = the picker is unscoped.
  const [dateScope, setDateScope] = useState<{ min: string; max: string } | null>(null);
  /** E-7: the "A date" step's "What's on" list is open. */
  const [whatsOn, setWhatsOn] = useState(false);
  const [, setLocation] = useLocation();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** CITY-1: the server refused the market (409 market_not_open) — show its waitlist link. */
  const [waitlistMarket, setWaitlistMarket] = useState<string | null>(null);
  const doorParty = (n: number | undefined) => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? String(n) : "");
  const [adults, setAdults] = useState(doorParty(source?.adults));
  // R3-16 (round 3 ruling, Nov 5, 2026): the adults field SHOWS two when nobody has stated a party, and nothing is sent
  // for it until the traveler types one (LD 33: an untouched party is stored NULL, never 2). `adults` holds only what
  // the door passed or the traveler typed; `partyFieldShown` draws the default.
  const [adultsEdited, setAdultsEdited] = useState(false);
  const [kids, setKids] = useState(doorParty(source?.kids));
  /** A group chip was pressed. The untouched default group is not a choice. */
  const [groupChosen, setGroupChosen] = useState(doorChoseGroup(source));
  /** Did the door hand us the occasion (funnel `occasionSource`)? */
  const doorOccasion = useRef<boolean>(!!seed.state.occasionSlug);
  const autoStarted = useRef(false);

  // A new door is a new start: reset to what IT holds.
  useEffect(() => {
    if (!open) return;
    setState(withMarqueeCity(seed.state, marquee));
    setStep(seed.step);
    setTyped("");
    setMoreSpecific(false);
    setPickDates(false);
    setDateScope(null);
    setWhatsOn(false);
    setError(null);
    setStarting(false);
    setAdults(doorParty(source?.adults));
    setKids(doorParty(source?.kids));
    setAdultsEdited(false);
    setGroupChosen(doorChoseGroup(source));
    doorOccasion.current = !!seed.state.occasionSlug;
    autoStarted.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);
  // CITY-1: when the market answer arrives after the panel opened, the marquee is pre-selected then — unless a city
  // is already held (a door's, or the traveler's own pick).
  useEffect(() => {
    if (!active || !marquee) return;
    setState((s) => withMarqueeCity(s, marquee));
  }, [active, marquee]);

  const { data: occasions, isLoading: occasionsLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: open,
    staleTime: 5 * 60_000,
  });
  // SH-1 Q14.1: a series' show dates come from its sibling rows in the same upcoming list.
  const needsEvents = open && (state.around === "date" || state.around === "event" || whatsOn || !!state.event?.seriesKey);
  const { data: eventsPayload } = useQuery<CityEventsPayload>({
    queryKey: ["/api/city-events/upcoming"],
    enabled: needsEvents,
    staleTime: 5 * 60_000,
  });
  const events: CityEventCard[] = eventsPayload?.events ?? [];
  useEffect(() => {
    if (state.event?.seriesKey && !state.event.showDates && events.length > 0) setState((s) => withSeriesShows(s, events));
  }, [state.event, events]);

  const occasionRows = occasions ?? [];
  // A-8: nothing picked (no chip, no "More specific", no event, no door group) ⇒ no occasion.
  const pickedSlug = chosenOccasionSlug(state, groupChosen);
  const pickedRow = occasionRows.find((o) => o.slug === pickedSlug) ?? null;
  // E-1/E-5/E-8: the traveler's own choice in words. An event's carried "show" slug and a group's default are never
  // shown — only a door-named or "More specific" occasion is (`state.occasionSlug` without an event).
  const specificRow = state.occasionSlug && !state.event ? occasionRows.find((o) => o.slug === state.occasionSlug) ?? null : null;
  const choiceLabel = planEntryChoiceLabel({
    eventTitle: state.event?.title ?? null,
    specificOccasionName: specificRow?.name ?? null,
    groupLabel: OCCASION_GROUP_LABELS[state.group],
  });
  const { groups } = useMemo(() => groupOccasions(occasionRows), [occasionRows]);
  // OCC-1: /experiences?group= shows only that group (`shownOccasionGroups`); any other door shows all.
  const shownGroups = shownOccasionGroups(groups.length > 0 ? groups.map((g) => g.key) : [...OCCASION_GROUP_ORDER], source?.onlyGroup);

  // A door-named occasion selects its own group once the catalog is in.
  useEffect(() => {
    if (!state.occasionSlug || occasionRows.length === 0) return;
    const row = occasionRows.find((o) => o.slug === state.occasionSlug);
    // A slug the catalog does not carry ("photo") is not an answer: it is dropped, never minted (§13).
    if (!row) {
      doorOccasion.current = false;
      setState((s) => ({ ...s, occasionSlug: null }));
      // E-2: the door's occasion did not resolve, so it was never known — ask it.
      if (!state.event && !doorChoseGroup(source)) setStep((st) => (st === "details" ? "occasion" : st));
      return;
    }
    // SH-1 Q16.1: around an event the group follows the nights; the carried event slug does not move it.
    if (state.event && state.occasionSlug === EVENT_OCCASION_SLUG) return;
    const g = occasionPickerGroupFor(row);
    if (g && g !== state.group) setState((s) => ({ ...s, group: g }));
  }, [state.occasionSlug, occasionRows, state.group, state.event]);

  const start = async () => {
    if (!canStartPlan(state) || starting || !state.market) return;
    setStarting(true);
    setError(null);
    setWaitlistMarket(null);
    const m = state.market;
    const fields = partyFields(pickedRow);
    const party: { adults?: number; kids?: number } = {};
    for (const field of fields) {
      const n = travelersForSave(field.key === "adults" ? adults : kids);
      if (n !== undefined) party[field.key] = n;
    }
    const out = await onStart({
      destination: planEntryDestination(m),
      city: m.cityName,
      country: m.country,
      // E-1: the chosen dates (an event's own run) carry verbatim.
      ...(planEntryMintDates(state) ?? {}),
      occasionSlug: pickedSlug,
      ...(state.event?.eventSourceId ? { eventSourceId: state.event.eventSourceId } : {}),
      ...(pickedRow?.id ? { occasionId: pickedRow.id } : {}),
      // A-8 / A-34: the title names an occasion only when one was picked; otherwise it is neutral.
      ...(pickedSlug ? { occasionName: choiceLabel } : {}),
      ...(planEntryEventRow(state) ? { event: planEntryEventRow(state)! } : {}),
      view: planEntryView(state, pickedRow),
      occasionAsked: !doorOccasion.current || !!state.event,
      group: state.group,
      ...party,
    });
    if (!out.ok) {
      setStarting(false);
      if (out.waitlistMarket) setWaitlistMarket(out.waitlistMarket);
      else if (out.message) setError(out.message);
    }
  };

  // Photo tile / Moments / AI panel: the door held the city AND an occasion the catalog carries.
  // Never inline (E3 ruling 3): a visit to /experiences writes nothing; its deep link lands on Step 2.
  useEffect(() => {
    if (inline || !open || autoStarted.current || occasionsLoading || occasionRows.length === 0) return;
    // H-10: a carried experience stops on dates and party. Auto-start would skip that question,
    // and it would also mint a carried slug the moment the catalog loads.
    if (source?.askDatesAndParty) return;
    // CITY-1: only a city the DOOR held may start a plan straight away — never the pre-selected marquee.
    if (startsStraightAway(seed.state, occasionRows.map((o) => o.slug))) {
      autoStarted.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, occasionsLoading, occasionRows.length]);

  // Inline only: the pick the nav pop-up reads. The dialog has no callback, so it cannot clobber this.
  useEffect(() => {
    if (!inline || !onHeldChange) return;
    const chosenGroup = groupChosen ? state.group : null;
    onHeldChange({
      city: state.market?.cityName ?? null,
      country: state.market?.country ?? null,
      group: chosenGroup,
      occasionSlug: state.occasionSlug,
    });
  }, [inline, onHeldChange, groupChosen, state.market, state.group, state.occasionSlug]);
  useEffect(() => {
    if (!inline || !onHeldChange) return;
    return () => onHeldChange(null);
  }, [inline, onHeldChange]);

  const pickMarket = (key: string) => {
    const m = OPERATING_MARKETS.find((x) => x.marketKey === key) ?? null;
    setState((s) => ({ ...s, market: m, event: s.around === "date" ? null : s.event, night: null }));
    // E-2: on the page the city cards stay in view and show the pick; Continue moves on.
    if (!m || state.around === "date" || inline) return;
    if (state.event) {
      setStep("details");
      return;
    }
    const specificSlug = !!(source?.experienceSlug || source?.carriedOccasionSlug || state.occasionSlug);
    const chosenGroup = groupChosen;
    // A route slug stays on the occasion step. A chosen group (and the pop-up's carry) asks dates and party.
    if (source?.askDatesAndParty || (chosenGroup && !specificSlug)) setStep("details");
    else setStep("occasion");
  };

  /** E-2: Step 1 → the next question. A known occasion (an event, a door's, a chosen group) goes to the party. */
  const advanceFromAround = () => {
    if (!state.market) return;
    const known = !!state.event || !!state.occasionSlug || groupChosen || !!source?.askDatesAndParty;
    setStep(known ? "details" : "occasion");
  };

  const typedResult = typedCity(typed, isOpenMarket);

  const goAround = (a: PlanAround) => {
    setState((s) => ({ ...s, around: a }));
    setPickDates(false);
  };

  const title = step === "around" ? "Plan around…" : step === "details" ? PLAN_DATES_SET_CTA : "What's the occasion?";
  // Step 1's carried line: shown only once something was chosen, in the traveler's words (E-1).
  const experienceLabel = state.occasionSlug || groupChosen || source?.askDatesAndParty ? choiceLabel : null;
  const straight = starting && step !== "occasion";

  const cityChips = (only?: readonly string[]) =>
    !only && placePicker ? (
      <div data-testid="plan-entry-place-picker">{placePicker(state.market?.marketKey ?? null, pickMarket)}</div>
    ) : (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cities">
      {(marketSettingsLoaded ? marketPickerOrder(marketSettings) : OPERATING_MARKETS.map((m) => m.marketKey))
        .map((key) => OPERATING_MARKETS.find((m) => m.marketKey === key)!)
        .filter((m) => !only || only.includes(m.marketKey))
        .map((m) =>
          isOpenMarket(m.marketKey) ? (
            <Chip key={m.marketKey} active={state.market?.marketKey === m.marketKey} onClick={() => pickMarket(m.marketKey)} testId={`plan-entry-city-${m.marketKey}`}>
              {m.cityName}
            </Chip>
          ) : (
            <WaitlistChip key={m.marketKey} marketKey={m.marketKey} testId={`plan-entry-city-${m.marketKey}`}>
              {`${m.cityName} · ${marketStatusLabel(m.marketKey, marketSettings)}`}
            </WaitlistChip>
          ),
        )}
    </div>
  );

  // SH-1 Launch item 13: the picker's rows are the shared EventRow (DateBlock and countdown chip on every row).
  const eventButton = (e: CityEventCard) => (
    <EventRow
      key={e.id}
      id={e.id}
      testIdPrefix="plan-entry-event"
      selectTestId={`plan-entry-event-${e.id}`}
      onSelect={() => {
        // E-6: an event in a market that is not open goes to that market's waitlist, never into a plan the mint refuses.
        if (e.marketKey && !isOpenMarket(e.marketKey)) {
          setLocation(waitlistMarketPath(e.marketKey));
          return;
        }
        // SH-1 Q14.1: a series of shows (sibling rows on one series_key) offers its shows; Q16.2: the pick carries "show".
        setState((s) =>
          withSeriesShows(
            withEvent(
              s,
              {
                title: planAroundEventTitle(e),
                city: e.city,
                country: OPERATING_MARKETS.find((m) => m.marketKey === e.marketKey)?.country ?? null,
                venue: e.venue,
                firstDate: e.firstDate,
                lastDate: e.lastDate,
                startTime: e.startTime,
                ...(e.sourceId ? { eventSourceId: e.sourceId } : {}),
                seriesKey: e.seriesKey ?? null,
              },
              EVENT_OCCASION_SLUG,
            ),
            events,
          ),
        );
        // E-2: the event carries its occasion — never asked again; the next step is the party (and the night).
        setStep("details");
      }}
      firstDate={e.firstDate}
      countdown={countdownLabel(e.daysUntil)}
      title={e.series ?? e.title}
      lines={[
        { text: `${e.city} · ${rangeLabel(e.firstDate, e.lastDate)}`, tone: "muted" },
        // E-6: every row says its market's status (Live / Beta / Opening {Month yyyy} / Join the waitlist).
        ...(e.marketKey && marketSettingsLoaded ? [{ text: marketStatusLabel(e.marketKey, marketSettings), tone: "muted" as const }] : []),
      ]}
    />
  );

  // SH-1 Q14.1/Q14.2: the nights still to come in the market's today; no market ⇒ no picker.
  const nightOptions = nightPickerOptions(state);
  const allOfIt = eventAllOfIt(state.event, marketToday(state.market?.marketKey));
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
              <DialogDescription className="sr-only">
                {step === "details" ? `${PLAN_DATES_SET_CTA}. ${PLAN_PARTY_ASK}` : "Choose what to plan around, then the occasion."}
              </DialogDescription>
            </DialogHeader>
          )}

          {straight ? null : step === "around" ? (
            <div className="space-y-4" data-testid="plan-entry-step-around">
              {experienceLabel && (groupChosen || state.occasionSlug) && (
                <p className="text-[14px] font-medium" style={{ color: "var(--earn-navy, #1A1A18)" }} data-testid="plan-entry-carried-group">
                  {experienceLabel}
                </p>
              )}
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
                  {typedResult && "waitlist" in typedResult && (
                    <WaitlistChip marketKey={typedResult.waitlist.marketKey} testId="plan-entry-city-typed-waitlist">
                      {`${typedResult.waitlist.cityName} · ${marketStatusLabel(typedResult.waitlist.marketKey, marketSettings)}`}
                    </WaitlistChip>
                  )}
                  {typedResult && "notYet" in typedResult && (
                    <div className="space-y-2" data-testid="plan-entry-not-yet">
                      <p className="text-[14px]" style={{ color: "#7A7A72" }}>
                        {notPlanningInLine(typedResult.notYet)} Try one of these:
                      </p>
                      {cityChips(typedResult.suggestions.map((m) => m.marketKey))}
                    </div>
                  )}
                </div>
              )}

              {state.around === "date" && (
                <div className="space-y-3">
                  {/* R3-20: the ONE preset row, the same component on every entry path. */}
                  <DatePresets
                    nextMonthActive={pickDates && !!dateScope}
                    pickActive={pickDates && !dateScope}
                    whatsOnActive={whatsOn}
                    onWeekend={() => { setPickDates(false); setDateScope(null); setState((s) => ({ ...s, ...thisWeekend(new Date()), event: null, night: null })); }}
                    onNextMonth={() => { setPickDates(true); setDateScope(nextMonthScope(new Date())); }}
                    onPick={() => { setPickDates(true); setDateScope(null); }}
                    onWhatsOn={() => setWhatsOn((v) => !v)}
                  />
                  {whatsOn && !(state.startDate && state.endDate) && (
                    <div className="space-y-4" data-testid="plan-entry-date-whats-on-list">
                      {events.length === 0 ? (
                        <p className="text-[14px]" style={{ color: "#7A7A72" }}>No upcoming events listed right now.</p>
                      ) : (
                        eventPickerGroups(events, whatsOnMarquee).map((g) => (
                          <div key={g.key} className="space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "#7A7A72" }}>{g.city ?? (g.month ? monthLabel(g.month) : "")}</p>
                            {g.events.map(eventButton)}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {pickDates && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" aria-label="Start date" min={dateScope?.min} max={dateScope?.max} value={state.startDate ?? ""} onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value || null, endDate: s.endDate && e.target.value && s.endDate < e.target.value ? e.target.value : s.endDate }))} className="rounded-md border px-2 py-1.5 text-[14px]" data-testid="plan-entry-date-start" />
                      <span aria-hidden>–</span>
                      <input type="date" aria-label="End date" min={state.startDate ?? dateScope?.min ?? undefined} max={dateScope?.max} value={state.endDate ?? ""} onChange={(e) => setState((s) => ({ ...s, endDate: e.target.value || null }))} className="rounded-md border px-2 py-1.5 text-[14px]" data-testid="plan-entry-date-end" />
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
                    eventPickerGroups(events, whatsOnMarquee).map((g) => (
                      <div key={g.key} className="space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "#7A7A72" }}>{g.city ?? (g.month ? monthLabel(g.month) : "")}</p>
                        {g.events.map(eventButton)}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : step === "details" ? (
            <div className="space-y-4" data-testid="plan-entry-step-details">
              <p className="text-[14px]" style={{ color: "#7A7A72" }} data-testid="plan-entry-summary">
                {/* E-1: the traveler's choice leads (the event, a picked occasion, or the group) — never a default. */}
                <span data-testid="plan-entry-carried-group">{choiceLabel}</span>
                {state.market?.cityName ? " · " : null}
                {state.market?.cityName}
              </p>
              {nightOptions && (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--earn-navy, #1A1A18)" }}>Which night?</p>
                  <div className="flex flex-wrap gap-2">
                    {/* R3-14: "All of it" only when what is left of the event is 14 days or fewer. */}
                    {allOfIt && (
                      <Chip active={!state.night && state.startDate === allOfIt.startDate && state.endDate === allOfIt.endDate} onClick={() => setState((s) => withNight(s, null))} testId="plan-entry-night-all">All of it</Chip>
                    )}
                    {nightOptions.map((d) => (
                      <Chip key={d} active={state.night === d} onClick={() => setState((s) => withNight(s, d))} testId={`plan-entry-night-${d}`}>
                        {dayLabel(d)}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {/* R3-20: the same preset row as "A date"; here the picker is always open, so Pick dates only unscopes it. */}
                <DatePresets
                  nextMonthActive={!!dateScope}
                  pickActive={false}
                  whatsOnActive={whatsOn}
                  onWeekend={() => { setDateScope(null); setState((s) => ({ ...s, ...thisWeekend(new Date()) })); }}
                  onNextMonth={() => setDateScope(nextMonthScope(new Date()))}
                  onPick={() => setDateScope(null)}
                  onWhatsOn={() => setWhatsOn((v) => !v)}
                />
                {whatsOn && (
                  <div className="space-y-4" data-testid="plan-entry-details-whats-on-list">
                    {events.length === 0 ? (
                      <p className="text-[14px]" style={{ color: "#7A7A72" }}>No upcoming events listed right now.</p>
                    ) : (
                      eventPickerGroups(events, whatsOnMarquee).map((g) => (
                        <div key={g.key} className="space-y-2">
                          <p className="text-[11px] uppercase tracking-[0.12em]" style={{ fontFamily: MONO, color: "#7A7A72" }}>{g.city ?? (g.month ? monthLabel(g.month) : "")}</p>
                          {g.events.map(eventButton)}
                        </div>
                      ))
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" aria-label="Start date" min={dateScope?.min} max={dateScope?.max} value={state.startDate ?? ""} onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value || null, endDate: s.endDate && e.target.value && s.endDate < e.target.value ? e.target.value : s.endDate }))} className="rounded-md border px-2 py-1.5 text-[14px]" data-testid="plan-entry-date-start" />
                  <span aria-hidden>–</span>
                  <input type="date" aria-label="End date" min={state.startDate ?? dateScope?.min ?? undefined} max={dateScope?.max} value={state.endDate ?? ""} onChange={(e) => setState((s) => ({ ...s, endDate: e.target.value || null }))} className="rounded-md border px-2 py-1.5 text-[14px]" data-testid="plan-entry-date-end" />
                </div>
              </div>
              <div className="space-y-2" data-testid="plan-entry-party">
                <p className="text-[13px] font-semibold" style={{ color: "var(--earn-navy, #1A1A18)" }}>{PLAN_PARTY_ASK}</p>
                <div className="flex flex-wrap gap-3">
                  {partyFields(pickedRow).map((field) => (
                    <label key={field.key} className="flex flex-col gap-1 text-[14px]" style={{ color: "var(--earn-navy, #1A1A18)" }}>
                      {field.label}
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={field.key === "adults" ? partyFieldShown(adults, adultsEdited) : kids}
                        onChange={(e) => {
                          if (field.key === "adults") {
                            setAdultsEdited(true);
                            setAdults(e.target.value);
                          } else setKids(e.target.value);
                        }}
                        className="w-24 rounded-md border px-2 py-1.5 text-[14px]"
                        style={{ borderColor: "var(--earn-line, #E8E8E2)" }}
                        data-testid={`plan-entry-party-${field.key}`}
                        aria-label={field.label}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4" data-testid="plan-entry-step-occasion">
              <p className="text-[14px]" style={{ color: "#7A7A72" }} data-testid="plan-entry-summary">
                {[state.event?.title, state.market?.cityName, state.startDate && state.endDate ? rangeLabel(state.startDate, state.endDate) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {nightOptions && (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--earn-navy, #1A1A18)" }}>Which night?</p>
                  <div className="flex flex-wrap gap-2">
                    {/* R3-14: "All of it" only when what is left of the event is 14 days or fewer. */}
                    {allOfIt && (
                      <Chip active={!state.night && state.startDate === allOfIt.startDate && state.endDate === allOfIt.endDate} onClick={() => setState((s) => withNight(s, null))} testId="plan-entry-night-all">All of it</Chip>
                    )}
                    {nightOptions.map((d) => (
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
                    active={(groupChosen || !!state.occasionSlug) && state.group === key && !(moreSpecific && state.occasionSlug)}
                    onClick={() => {
                      setGroupChosen(true);
                      setState((s) => ({ ...s, ...choosePlanEntryGroup(s, key) }));
                    }}
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
                  followGroup={state.group}
                  onlyGroup={shownGroups.length === 1 && source?.onlyGroup ? source.onlyGroup : null}
                  onPick={(slug) => {
                    setGroupChosen(true);
                    const row = occasionRows.find((o) => o.slug === slug);
                    const g = row ? occasionPickerGroupFor(row) : null;
                    setState((s) => ({ ...s, occasionSlug: slug, ...(g ? { group: g } : {}) }));
                  }}
                />
              )}
            </div>
          )}

          {waitlistMarket && (
            <Link href={waitlistMarketPath(waitlistMarket)} className="text-[14px] underline" style={{ color: "var(--coral-text)" }} data-testid="plan-entry-waitlist-link">
              {MARKET_STATUS_COPY.waitlist}
            </Link>
          )}
          {error && (
            <p className="text-[14px]" role="alert" style={{ color: "var(--coral-text)" }} data-testid="plan-entry-error">{error}</p>
          )}
        </div>

        {!straight && (
          <div
            className={
              inline
                ? // R3-11 (round 3 ruling): sticky at phone width only (E3 ruling 1), so on a wider screen the bar sits after
                  // the city cards and never covers the last row.
                  "max-md:sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-background py-3"
                : "flex items-center justify-between gap-3 border-t pt-3"
            }
            style={{ borderColor: "var(--earn-line, #E8E8E2)" }}
            data-testid="plan-entry-footer"
          >
            {step === "occasion" || step === "details" ? (
              <button type="button" onClick={() => setStep("around")} className="text-[14px] font-medium" style={{ color: "#7A7A72" }} data-testid="button-plan-entry-back">
                Back
              </button>
            ) : (
              <span />
            )}
            {(inline || step === "occasion" || step === "details" || (state.market && state.occasionSlug)) && (
              <button
                type="button"
                // E-2: on Step 1, Continue moves to the next question — never a plan minted on an occasion nobody chose.
                onClick={() => (step === "around" ? advanceFromAround() : void start())}
                disabled={!canStartPlan(state) || starting}
                className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--coral-fill)" }}
                data-testid="button-plan-entry-start"
              >
                {starting ? "Starting…" : PLAN_ENTRY_CONTINUE}
              </button>
            )}
          </div>
        )}
    </>
  );
}
