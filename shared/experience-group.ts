/**
 * WHICH EXPERIENCE GROUP A PLAN BELONGS TO, AND WHAT ITS EMPTY SLIP ASKS FIRST (Track A step A1,
 * ledger `2026-09-29-a1-trips-frame`; product map §B2, §M2, §M7 as ratified
 * `2026-09-29-m7-m9-ratified`; R127, R132).
 *
 * Pure: no React, no fetch, no DB. The slip reads the group to choose its frame; the group NAME is
 * an internal key (R127) and is never rendered as text — the traveler sees the occasion's own name.
 *
 * §B2, evaluated in order, reading the occasion ROW's switches (Locked Decision 28):
 *   0. no row, or any of the three switches (`default_duration`, `default_guests`, `default_stops`)
 *      NULL ⇒ plain plan (LD 28 fallback)
 *   1. day + no guests ⇒ moments        2. day + guests ⇒ celebrations
 *   3. range + no guests ⇒ trips        4. range + guests + `venue` role ⇒ hosted events
 *   5. range + guests, no `venue` ⇒ group travel
 * R132: with NO row, a coarse event type that only one group can mean still names the group
 * (`vacation` ⇒ trips, `birthday` ⇒ celebrations) without claiming an occasion. Anything else stays
 * plain plan — never a nearest-looking group (§13).
 */

export type ExperienceGroup =
  | "plain_plan"
  | "moments"
  | "celebrations"
  | "trips"
  | "hosted_events"
  | "group_travel";

/** The subset of an `experience_types` row the group rule reads. */
export interface ExperienceGroupRow {
  slug?: string | null;
  name?: string | null;
  defaultDuration?: string | null;
  defaultGuests?: boolean | null;
  defaultStops?: string | null;
  defaultSchedule?: boolean | null;
  rolesNeeded?: readonly string[] | null;
}

/** R132: coarse event types that name exactly one group when no occasion row resolved. */
const GROUP_FOR_UNRESOLVED_EVENT_TYPE: Readonly<Record<string, ExperienceGroup>> = {
  vacation: "trips",
  birthday: "celebrations",
};

export function experienceGroupFor(
  row: ExperienceGroupRow | null | undefined,
  eventType?: string | null,
): ExperienceGroup {
  if (!row) {
    const key = (eventType || "").trim().toLowerCase();
    return GROUP_FOR_UNRESOLVED_EVENT_TYPE[key] ?? "plain_plan";
  }
  const duration = row.defaultDuration;
  const guests = row.defaultGuests;
  const stops = row.defaultStops;
  if ((duration !== "day" && duration !== "range") || typeof guests !== "boolean" || (stops !== "one" && stops !== "many")) {
    return "plain_plan";
  }
  if (duration === "day") return guests ? "celebrations" : "moments";
  if (!guests) return "trips";
  return (row.rolesNeeded ?? []).includes("venue") ? "hosted_events" : "group_travel";
}

/**
 * M7 — what a Trip is built around. `schedule: true` ⇒ its fixed dated items (the rounds, the
 * match) are the primary anchor and lodging is secondary; `false` ⇒ lodging is primary. NULL (or
 * no row) ⇒ lodging, and `fromFallback` says the switch was not set, so the surface can say so.
 */
export type TripsAnchorKind = "lodging" | "fixed_item";

export interface TripsAnchor {
  kind: TripsAnchorKind;
  /** True when the row did not state `default_schedule` — the answer is the plain-trip fallback. */
  fromFallback: boolean;
}

export function tripsAnchorFor(row: ExperienceGroupRow | null | undefined): TripsAnchor {
  const schedule = row?.defaultSchedule;
  if (schedule === true) return { kind: "fixed_item", fromFallback: false };
  return { kind: "lodging", fromFallback: schedule !== false };
}

/**
 * R215 (ledger `2026-09-29-a1-trips-frame`): a plan is a Trip ONLY when its occasion RESOLVED to a real
 * row whose switches say Trips. `trips.event_type` is deliberately NOT passed: that column DEFAULTS to
 * `vacation`, and a column default is not the traveler's answer (§13). ONE predicate for every reader
 * that asks "is this a Trip, and what is it built around?" — the slip and the free draft (A5, ledger
 * `2026-09-29-a5-draft-open-set`) both import it (§18 rule 1). `null` = not a resolved Trip.
 */
export function resolvedTripsAnchor(row: ExperienceGroupRow | null | undefined): TripsAnchor | null {
  return experienceGroupFor(row) === "trips" ? tripsAnchorFor(row) : null;
}

/** The empty slip's first question for a Trip (§M2's Trips row as amended by M7). ONE home for the words. */
export interface TripsAnchorQuestion {
  question: string;
  detail: string;
}

export function tripsAnchorQuestion(anchor: TripsAnchor): TripsAnchorQuestion {
  if (anchor.kind === "fixed_item") {
    return {
      question: "What's fixed on these dates?",
      detail: "Add what's already booked — the rounds, the match, the show. Where you stay is chosen around it.",
    };
  }
  return {
    question: "Where are you staying?",
    detail: "Add up to three places you're considering. We'll show which one makes your days easiest before you choose.",
  };
}

/**
 * The header's anchor state: none / an open set of N / chosen. A3 supplies `openSetSize` (option
 * sets do not exist before it, so until then it is always 0 and the state is never "open").
 *   · lodging — chosen when the plan holds an `item_type = 'accommodation'` item (the column).
 *   · fixed item — chosen when the plan holds at least one DATED event (`user_experiences.event_date`,
 *     the schedule rows ruling 29 makes events of). An undated event is not a fixed point.
 * §13: no source ⇒ "none", never a guessed choice.
 */
export type TripsAnchorState =
  | { state: "none" }
  | { state: "open"; count: number }
  | { state: "chosen"; label: string | null; count: number };

export function tripsAnchorState(input: {
  anchor: TripsAnchor;
  items?: ReadonlyArray<{ type?: string | null; name?: string | null }> | null;
  events?: ReadonlyArray<{ eventDate?: string | null; title?: string | null }> | null;
  openSetSize?: number;
}): TripsAnchorState {
  const { anchor, items, events } = input;
  if (anchor.kind === "lodging") {
    const stays = (items ?? []).filter((i) => (i.type || "").toLowerCase() === "accommodation");
    if (stays.length > 0) return { state: "chosen", label: stays[0].name?.trim() || null, count: stays.length };
  } else {
    const fixed = (events ?? []).filter((e) => typeof e.eventDate === "string" && e.eventDate.trim().length > 0);
    if (fixed.length > 0) return { state: "chosen", label: fixed[0].title?.trim() || null, count: fixed.length };
  }
  const open = input.openSetSize ?? 0;
  if (open > 0) return { state: "open", count: open };
  return { state: "none" };
}

/** The header line for that state. ONE home; the slip renders it verbatim. */
export function tripsAnchorLine(anchor: TripsAnchor, s: TripsAnchorState): string {
  const lodging = anchor.kind === "lodging";
  if (s.state === "open") return lodging ? `Where you'll stay: ${s.count} to compare` : `Built around: ${s.count} to compare`;
  if (s.state === "chosen") {
    if (lodging) return s.label ? `Staying at ${s.label}` : "Where you'll stay: chosen";
    const more = s.count > 1 ? ` + ${s.count - 1} more` : "";
    return s.label ? `Built around ${s.label}${more}` : `Built around ${s.count} fixed ${s.count === 1 ? "event" : "events"}`;
  }
  return lodging ? "Where you'll stay: not chosen yet" : "Built around: nothing fixed yet";
}
