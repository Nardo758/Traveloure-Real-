/**
 * FB-1 step 2 (decision-maker, Oct 17, 2026 — ledger `2026-10-18-fb1-pure-checker`): THE PLAN CHECKER, pure.
 *
 * One function over the plan's stops, stored facts, anchors, legs and energy rows, with no database and no network.
 * `loadPlanCheckInput` (server/services/optimizer-lead.service.ts) reads those inputs for a trip; `checkPlan` decides.
 * The free preview, the day line and a stop's hours read this one decision through the trip wrapper, and the paid
 * versions (step 3) call it directly on a version's stops (§18 rule 1).
 *
 * Every finding rule is the existing one in `shared/optimizer-lead.ts` / `shared/leg-reachability.ts`, unchanged.
 * What this module adds:
 *   • the uncapped list (`allFindings`) beside the card's three (`findings`);
 *   • one ISSUE per thing found — type, day, stop, why, source, checked date and ONE suggested fix;
 *   • the open-coordinate rule for EVERY point-reading check: the path findings (step 1) and now the rides that
 *     `last_service_missed` reads. A stop's `point` is its OPEN coordinate (LG-1) or null — never a Google point.
 */
import {
  FINDING_ORDER,
  afterLastAdmission,
  anchorConflicts,
  cityCrossings,
  closedOnArrival,
  closesBeforeVisitEnd,
  lastServiceMissed,
  leadFindings,
  openPathDays,
  paceOver,
  pathNotChecked,
  timedEntryConflicts,
  visitEndMinutes,
  walkingSavedKm,
  type AnchorWindow,
  type Finding,
  type FindingKind,
  type HoursFact,
  type NotChecked,
  type RideCheck,
} from "./optimizer-lead";
import { legUnreachableFinding, unreachableStops, wallClockMinutes } from "./leg-reachability";
import { closedOnDate, hoursFactForDate, parseTimedEntryRequired, lastAdmissionMinutes, lastServiceMinutes, parseClosedDates, parseLastAdmission, parseLastService, SERVICE_DAY_START_MIN } from "./feasibility-facts";
import { isRideMode } from "./plan-feasibility";
import { haversineMeters } from "./geo";
import { ROUTED_WALK_MAX_METERS, defaultRoutedMode } from "./routing-engine";

// ── input ─────────────────────────────────────────────────────────────────────────────────────

/** A plan stop in plan order (day, start, sort order); lodging is not a stop. */
export interface PlanCheckStop {
  id: string;
  title: string;
  dayNumber: number;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  /** The stop's OPEN coordinate (LG-1: an admin row, an OSM match, a ride's OSM node) — null otherwise, never Google. */
  point: { lat: number; lng: number } | null;
}

/** Where a fact came from, for the issue it supports. */
export interface FactProvenance {
  checkedAt: string | null;
  sourceUrl?: string | null;
  /** The fact's own provenance line ("<source> · checked <date>"), when the loader has one. */
  provenance?: string | null;
}

export interface PlanCheckHours extends HoursFact, FactProvenance {
  season?: { from: string; to: string } | null;
  /** An official-licence source, or a person's check; absent ⇒ a tagged fact of neither kind. */
  sourceKind?: "official_fact" | "person_checked_fact";
}

export interface PlanCheckLastAdmission extends FactProvenance {
  value: unknown;
}

export interface PlanCheckLastService extends Partial<FactProvenance> {
  lat: number;
  lng: number;
  value: unknown;
}

/** A leg the traveler sees (`tripLegsShown`). */
export interface PlanCheckLeg {
  id: string;
  dayNumber: number;
  fromActivityId: string | null;
  toActivityId: string | null;
  estimatedDurationMinutes: number | null;
  /** The leg's own mode (user-selected, else selected, else recommended). */
  mode: string | null;
  /** `legIsRouted` — the ONE answer. */
  routed: boolean;
  checkedAt?: string | null;
}

export interface PlanCheckInput {
  /** The plan's first day, YYYY-MM-DD; null ⇒ no date-bound check can run. */
  tripStartIso: string | null;
  /** The market's transport profile lists transit (`marketHasTransitCoverage`). */
  transitCoverage: boolean;
  stops: PlanCheckStop[];
  /** Every usable hours fact per stop, in precedence order. */
  hours: ReadonlyMap<string, readonly PlanCheckHours[]>;
  /** Every admitted last-admission fact per stop, in precedence order. */
  lastAdmission: ReadonlyMap<string, readonly PlanCheckLastAdmission[]>;
  /** FB-1 step 5b: every admitted `closed_dates` fact per stop, in precedence order; absent ⇒ none stored. */
  closedDates?: ReadonlyMap<string, readonly PlanCheckLastAdmission[]>;
  /** FB-1 step 5c: every admitted `timed_entry_required` fact per stop, in precedence order; absent ⇒ none stored. */
  timedEntry?: ReadonlyMap<string, readonly PlanCheckLastAdmission[]>;
  /** The market's official last departures, each at its station's point. */
  lastServices: readonly PlanCheckLastService[];
  anchors: readonly AnchorWindow[];
  legs: readonly PlanCheckLeg[];
  energy: ReadonlyArray<{ dayNumber: number; recoveryNeeded: boolean | null }>;
}

// ── the feasibility context (hours, last entry, rides) ─────────────────────────────────────────

export interface TimedStop {
  id: string;
  title: string;
  dayNumber: number;
  dateIso: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
}

/** A ride with the stops it joins and the facts that apply. */
export interface CheckedRide extends RideCheck {
  fromItemId: string;
  fromTitle: string;
  toItemId: string;
  /** The departure facts considered, with the minute each states for the date. */
  services: Array<{ minute: number; provenance: FactProvenance }>;
}

export interface FeasibilityView {
  timed: TimedStop[];
  /** The hours fact that applies on each stop's date. */
  hours: Map<string, PlanCheckHours>;
  /** The last-entry minute that applies on each stop's date, with the fact it came from. */
  lastEntry: Map<string, { minute: number; fact: PlanCheckLastAdmission }>;
  /** FB-1 step 5b: the stops whose own date a stored `closed_dates` fact names, with the first such fact. */
  closedOn: Map<string, PlanCheckLastAdmission>;
  rides: CheckedRide[];
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Pure. The first last-admission candidate that applies on the date (the `lastAdmissionForDate` order). */
function lastEntryFor(candidates: readonly PlanCheckLastAdmission[], dateIso: string): { minute: number; fact: PlanCheckLastAdmission } | null {
  for (const c of candidates) {
    const v = parseLastAdmission(c.value);
    const m = v ? lastAdmissionMinutes(v, dateIso) : null;
    if (m !== null) return { minute: m, fact: c };
  }
  return null;
}

/**
 * Pure. The ONE assembly of the feasibility inputs (§18 rule 1): the findings, the day line and a stop's hours read the
 * same hours, last entries and rides. A ride is derived between two consecutive LOCATED stops of a day — located = an
 * OPEN point (FB-1 step 2); a leg the plan shows for the pair wins with its own mode, else the engine's default-mode
 * rule. It departs when the stop it leaves ends; no end ⇒ unchecked.
 */
export function feasibilityView(input: PlanCheckInput): FeasibilityView {
  const start = input.tripStartIso;
  const timed: TimedStop[] = input.stops.map((r) => ({
    id: r.id,
    title: r.title,
    dayNumber: r.dayNumber,
    dateIso: start ? addDays(start, r.dayNumber - 1) : null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
    durationMinutes: r.durationMinutes ?? null,
  }));
  const hours = new Map<string, PlanCheckHours>();
  const lastEntry = new Map<string, { minute: number; fact: PlanCheckLastAdmission }>();
  const closedOn = new Map<string, PlanCheckLastAdmission>();
  for (const it of timed) {
    if (it.dateIso) {
      const closed = (input.closedDates?.get(it.id) ?? []).find((c) => {
        const v = parseClosedDates(c.value);
        return v !== null && closedOnDate(v, it.dateIso!);
      });
      if (closed) closedOn.set(it.id, closed);
    }
    const h = hoursFactForDate(input.hours.get(it.id) ?? [], it.dateIso);
    if (h) hours.set(it.id, h);
    const m = it.dateIso ? lastEntryFor(input.lastAdmission.get(it.id) ?? [], it.dateIso) : null;
    if (m) lastEntry.set(it.id, m);
  }

  const shownMode = new Map<string, string | null>();
  for (const l of input.legs) shownMode.set(`${l.dayNumber}|${l.fromActivityId}|${l.toActivityId}`, l.mode);
  const byId = new Map(timed.map((t) => [t.id, t]));
  const services = input.lastServices
    .map((s) => ({ s, v: parseLastService(s.value) }))
    .filter((x): x is { s: PlanCheckLastService; v: NonNullable<ReturnType<typeof parseLastService>> } => x.v !== null);
  const rides: CheckedRide[] = [];
  const byDay = new Map<number, PlanCheckStop[]>();
  for (const r of input.stops) byDay.set(r.dayNumber, [...(byDay.get(r.dayNumber) ?? []), r]);
  byDay.forEach((list, dayNumber) => {
    const located = list.filter((r): r is PlanCheckStop & { point: { lat: number; lng: number } } => r.point !== null);
    for (let i = 0; i + 1 < located.length; i++) {
      const a = located[i];
      const b = located[i + 1];
      const key = `${dayNumber}|${a.id}|${b.id}`;
      const inferred = !shownMode.has(key);
      const mode = inferred ? defaultRoutedMode(a.point, b.point, input.transitCoverage) : shownMode.get(key) ?? null;
      if (!isRideMode(mode)) continue;
      const from = byId.get(a.id);
      let departMin = from ? visitEndMinutes(from) : null;
      if (departMin !== null && departMin < SERVICE_DAY_START_MIN) departMin += 24 * 60;
      const dateIso = from?.dateIso ?? null;
      const applied =
        departMin === null || !dateIso
          ? []
          : services
              .filter(({ s }) => haversineMeters(a.point.lat, a.point.lng, s.lat, s.lng) <= ROUTED_WALK_MAX_METERS)
              .flatMap(({ s, v }) => {
                const minute = lastServiceMinutes(v, dateIso);
                return minute === null ? [] : [{ minute, provenance: { checkedAt: s.checkedAt ?? null, sourceUrl: s.sourceUrl ?? null, provenance: s.provenance ?? null } as FactProvenance }];
              });
      rides.push({
        dayNumber,
        departMin: departMin ?? -1,
        lastDepartures: applied.map((x) => x.minute),
        inferred,
        fromItemId: a.id,
        fromTitle: a.title,
        toItemId: b.id,
        services: applied,
      });
    }
  });
  return { timed, hours, lastEntry, closedOn, rides };
}

// ── issues ─────────────────────────────────────────────────────────────────────────────────────

/** Why an issue was raised — the rule's own reason, one code per case. */
export type PlanIssueWhy =
  | "before_opening"
  | "after_closing"
  | "closed_day"
  | "closed_date"
  | "closes_early"
  | "after_last_entry"
  | "leg_too_long"
  | "after_last_service"
  | "overlaps_anchor"
  | "crosses_city"
  | "walking_saved"
  | "recovery_needed"
  | "timed_entry_required";

export type PlanIssueSourceKind = "official_fact" | "person_checked_fact" | "fact" | "plan_leg" | "anchor" | "energy" | "open_coordinates";

export interface PlanIssueSource {
  kind: PlanIssueSourceKind;
  url: string | null;
  provenance: string | null;
}

/**
 * ONE suggested fix — an instruction a version can carry out (step 3), never a write. Minutes are the plan's own
 * wall-clock minutes on the stop's day (a time after midnight is past 24:00).
 *   retime               start the stop no earlier than `notBeforeMin` and/or no later than `notAfterMin`
 *   move_day             the stop cannot happen on this day (a closed weekday, or a closed date) — another day of the plan
 *   move_clear_of_anchor keep the stop clear of the anchor's window
 *   reorder_day          re-sequence the day's stops (a path finding — no stop named)
 *   lighten_day          move a stop off the day (pace)
 *   book_ahead           reserve a timed slot on the official site — FLAG-ONLY (`isFlagOnlyIssue`): no version can do it
 */
export type PlanFix =
  | { action: "retime"; itemId: string; day: number; notBeforeMin?: number; notAfterMin?: number }
  | { action: "move_day"; itemId: string; day: number }
  | { action: "move_clear_of_anchor"; itemId: string; day: number; anchorId: string }
  | { action: "reorder_day"; day: number }
  | { action: "lighten_day"; day: number }
  | { action: "book_ahead"; itemId: string; day: number };

export interface PlanIssue {
  type: FindingKind;
  day: number;
  /** The stop it is about; null for a day-level issue (a path finding, pace). */
  stop: { itemId: string; title: string } | null;
  why: PlanIssueWhy;
  source: PlanIssueSource;
  /** When the fact behind it was checked; null when the source carries no date (a leg, an anchor, energy). */
  checkedAt: string | null;
  fix: PlanFix;
}

export interface PlanCheckResult {
  /** The card's list: problems first, then gains, at most three (`leadFindings`) — unchanged. */
  findings: Finding[];
  /** Every finding, in the card's order, uncapped. */
  allFindings: Finding[];
  issues: PlanIssue[];
  notChecked: NotChecked[];
}

function hoursSource(f: PlanCheckHours | undefined): PlanIssueSource {
  return { kind: f?.sourceKind ?? "fact", url: f?.sourceUrl ?? null, provenance: f?.provenance ?? null };
}

function visitLength(t: TimedStop | undefined): number | null {
  if (!t) return null;
  const s = wallClockMinutes(t.startTime);
  const e = visitEndMinutes(t);
  return s !== null && e !== null ? e - s : null;
}

/**
 * FB-1 step 5c (ledger `2026-10-19-fb1-timed-entry`; decision-maker, Oct 19, 2026): THE ONE PREDICATE for a flag-only
 * issue — a fix no version, retime or model change can carry out (reserving a slot). It is shown, and it counts in none
 * of: the step 3 gate's unresolved/added/coverage, "Your plan, fixed"'s flagged days, the paid run's change list, or free
 * retime's no-new-problem test.
 */
export function isFlagOnlyIssue(issue: Pick<PlanIssue, "fix">): boolean {
  return issue.fix.action === "book_ahead";
}

/**
 * FB-1 step 5c: one `timed_entry_required` issue per stop carrying an admitted fact — fix `book_ahead`, the fact's
 * official link as its source. Not a card finding (ruling 3: the slip's per-stop warning only). Pure.
 */
function timedEntryIssues(input: PlanCheckInput): PlanIssue[] {
  const out: PlanIssue[] = [];
  for (const s of input.stops) {
    const fact = (input.timedEntry?.get(s.id) ?? []).find((c) => parseTimedEntryRequired(c.value) !== null);
    if (!fact) continue;
    out.push({
      type: "timed_entry_required",
      day: s.dayNumber,
      stop: { itemId: s.id, title: s.title },
      why: "timed_entry_required",
      source: { kind: "official_fact", url: fact.sourceUrl ?? null, provenance: fact.provenance ?? null },
      checkedAt: fact.checkedAt ?? null,
      fix: { action: "book_ahead", itemId: s.id, day: s.dayNumber },
    });
  }
  return out;
}

/**
 * FB-1 step 5b (ledger `2026-10-19-fb1-closed-dates`): a stop on a date a stored `closed_dates` fact names is counted
 * in `closed_on_arrival` with reason `closed_date` (fix `move_day`), whether or not it states a time. It replaces any
 * hours reason for that stop — a closed place has no opening time to start by. Pure.
 */
function withClosedDates(hoursFinding: Finding | null, ctx: FeasibilityView): Finding | null {
  if (!ctx.closedOn.size) return hoursFinding;
  const closed: NonNullable<Finding["stops"]> = ctx.timed
    .filter((t) => ctx.closedOn.has(t.id) && t.dateIso)
    .map((t) => {
      const at = wallClockMinutes(t.startTime);
      return { itemId: t.id, title: t.title ?? "This stop", day: t.dayNumber, reason: "closed_date" as const, dateIso: t.dateIso!, ...(at !== null ? { startMin: at } : {}) };
    });
  const rest = (hoursFinding?.stops ?? []).filter((s) => !ctx.closedOn.has(s.itemId));
  const stops = [...closed, ...rest].sort((a, b) => a.day - b.day);
  const days = Array.from(new Set(stops.map((s) => s.day))).sort((x, y) => x - y);
  return {
    kind: "closed_on_arrival",
    count: stops.length,
    days,
    stops,
    ...(rest.length && hoursFinding?.caveat ? { caveat: hoursFinding.caveat } : {}),
  };
}

/**
 * Pure. THE PLAN CHECK. Findings are the existing rules over the same inputs the trip loader used to read itself;
 * `findings` is exactly what the free preview returned before the split (the parity test pins it).
 */
export function checkPlan(input: PlanCheckInput): PlanCheckResult {
  const ctx = feasibilityView(input);
  const start = input.tripStartIso;
  const hoursFacts = new Map<string, HoursFact>(Array.from(ctx.hours.entries()));
  const lastMinute = new Map<string, number>(Array.from(ctx.lastEntry.entries()).map(([k, v]) => [k, v.minute]));

  // timed_entry_conflict reads every stop with its date (the validate-schedule rule).
  const scheduled = input.stops.map((r) => ({
    title: r.title,
    dayNumber: r.dayNumber,
    date: start ? addDays(start, r.dayNumber - 1) : null,
    startTime: r.startTime ?? null,
    endTime: r.endTime ?? null,
  }));

  const { days, notCheckedDays } = openPathDays(input.stops.map((r) => ({ dayNumber: r.dayNumber, open: r.point })));
  const reach = unreachableStops(
    input.stops.map((r) => ({ id: r.id, title: r.title, dayNumber: r.dayNumber, startTime: r.startTime, endTime: r.endTime, durationMinutes: r.durationMinutes })),
    input.legs.map((l) => ({ id: l.id, dayNumber: l.dayNumber, fromActivityId: l.fromActivityId, toActivityId: l.toActivityId, estimatedDurationMinutes: l.estimatedDurationMinutes, routed: l.routed })),
  );

  const found = [
    legUnreachableFinding(reach.unreachable),
    withClosedDates(closedOnArrival(ctx.timed, hoursFacts, start), ctx),
    afterLastAdmission(ctx.timed, lastMinute),
    closesBeforeVisitEnd(ctx.timed, hoursFacts, start),
    lastServiceMissed(ctx.rides.filter((r) => r.lastDepartures.length > 0)),
    timedEntryConflicts(input.anchors as AnchorWindow[], scheduled),
    cityCrossings(days),
    walkingSavedKm(days),
    paceOver(input.energy.map((e) => ({ dayNumber: e.dayNumber, recoveryNeeded: e.recoveryNeeded ?? null }))),
  ].filter((f): f is Finding => !!f && f.count > 0);
  const allFindings = [...found].sort((a, b) => FINDING_ORDER.indexOf(a.kind) - FINDING_ORDER.indexOf(b.kind));

  // ── one issue per thing found ──
  const byId = new Map(ctx.timed.map((t) => [t.id, t]));
  const issues: PlanIssue[] = [];
  for (const f of allFindings) {
    switch (f.kind) {
      case "closed_on_arrival":
      case "closes_before_visit_end":
      case "after_last_admission":
        for (const s of f.stops ?? []) {
          const t = byId.get(s.itemId);
          const len = visitLength(t);
          const lastEntry = ctx.lastEntry.get(s.itemId);
          const hours = ctx.hours.get(s.itemId);
          const why = (s.reason ?? "after_closing") as PlanIssueWhy;
          let fix: PlanFix;
          if (why === "closed_day" || why === "closed_date") fix = { action: "move_day", itemId: s.itemId, day: s.day };
          else if (why === "before_opening") fix = { action: "retime", itemId: s.itemId, day: s.day, notBeforeMin: s.atMin! };
          else if (why === "after_last_entry") fix = { action: "retime", itemId: s.itemId, day: s.day, notAfterMin: s.atMin! };
          // after_closing / closes_early: start early enough to finish by the close (by the close, when no length is stated).
          else fix = { action: "retime", itemId: s.itemId, day: s.day, notAfterMin: s.atMin! - (len ?? 0) };
          const fact: FactProvenance | undefined = why === "after_last_entry" ? lastEntry?.fact : why === "closed_date" ? ctx.closedOn.get(s.itemId) : hours;
          issues.push({
            type: f.kind,
            day: s.day,
            stop: { itemId: s.itemId, title: s.title },
            why,
            source: why === "after_last_entry" || why === "closed_date" ? { kind: "official_fact", url: fact?.sourceUrl ?? null, provenance: fact?.provenance ?? null } : hoursSource(hours),
            checkedAt: fact?.checkedAt ?? null,
            fix,
          });
        }
        break;
      case "leg_unreachable":
        for (const u of reach.unreachable) {
          const toStart = wallClockMinutes(byId.get(u.toItemId)?.startTime ?? null);
          const leg = input.legs.find((l) => l.id === u.legId);
          issues.push({
            type: f.kind,
            day: u.dayNumber,
            stop: { itemId: u.toItemId, title: u.toTitle },
            why: "leg_too_long",
            source: { kind: "plan_leg", url: null, provenance: null },
            checkedAt: leg?.checkedAt ?? null,
            fix: toStart !== null
              ? { action: "retime", itemId: u.toItemId, day: u.dayNumber, notBeforeMin: toStart + u.shortByMinutes }
              : { action: "reorder_day", day: u.dayNumber },
          });
        }
        break;
      case "last_service_missed":
        for (const r of ctx.rides) {
          if (!r.lastDepartures.length || r.lastDepartures.some((m) => r.departMin <= m)) continue;
          const latest = r.services.reduce((best, s) => (best && best.minute >= s.minute ? best : s), null as CheckedRide["services"][number] | null)!;
          const len = visitLength(byId.get(r.fromItemId));
          issues.push({
            type: f.kind,
            day: r.dayNumber,
            stop: { itemId: r.fromItemId, title: r.fromTitle },
            why: "after_last_service",
            source: { kind: "official_fact", url: latest.provenance.sourceUrl ?? null, provenance: latest.provenance.provenance ?? null },
            checkedAt: latest.provenance.checkedAt ?? null,
            fix: { action: "retime", itemId: r.fromItemId, day: r.dayNumber, notAfterMin: latest.minute - (len ?? 0) },
          });
        }
        break;
      case "timed_entry_conflict":
        input.stops.forEach((s, i) => {
          for (const c of anchorConflicts(input.anchors, [scheduled[i]])) {
            issues.push({
              type: f.kind,
              day: s.dayNumber,
              stop: { itemId: s.id, title: s.title },
              why: "overlaps_anchor",
              source: { kind: "anchor", url: null, provenance: null },
              checkedAt: null,
              fix: { action: "move_clear_of_anchor", itemId: s.id, day: s.dayNumber, anchorId: c.anchorId },
            });
          }
        });
        break;
      case "city_crossing":
      case "walking_saved_km":
        for (const d of f.days) {
          issues.push({
            type: f.kind,
            day: d,
            stop: null,
            why: f.kind === "city_crossing" ? "crosses_city" : "walking_saved",
            source: { kind: "open_coordinates", url: null, provenance: null },
            checkedAt: null,
            fix: { action: "reorder_day", day: d },
          });
        }
        break;
      case "pace_over":
        for (const d of f.days) {
          issues.push({ type: f.kind, day: d, stop: null, why: "recovery_needed", source: { kind: "energy", url: null, provenance: null }, checkedAt: null, fix: { action: "lighten_day", day: d } });
        }
        break;
    }
  }

  issues.push(...timedEntryIssues(input));
  return { findings: leadFindings(found), allFindings, issues, notChecked: pathNotChecked(notCheckedDays) };
}
