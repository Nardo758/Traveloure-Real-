/**
 * SLIP EVENTS — the client's ONE reader of migration 277's `itinerary_items.user_experience_id`.
 * Ledger `2026-09-04-slip-events`; CLAUDE.md Locked Decision 29.
 *
 * Migration 277 gave every plan item a nullable link naming the EVENT inside the plan it sits
 * under, and the plancard payload already ships both halves of the pair — `events` (the trip's
 * `user_experiences` rows, behind the route's owner/advisor/author gate) and, on each activity,
 * `userExperienceId` present-only-when-set. Until this lane nothing read either. This module is
 * that reader: items + events in, grouped structure out. Pure — no React, no fetch, no DB (its
 * only imports are date formatting, for the ONE event meta-line derivation at the bottom) — so
 * the rules below are testable on their own and cannot drift into a second copy at a call site
 * (§18 rule 1).
 *
 * THE ONE RULE (Locked Decision 29, and §13):
 *
 *   **Every plan has ONE implicit unnamed event, and `NULL` IS that event.** An item with no link
 *   is not unassigned, not orphaned and not an error — it belongs to the plan's own unnamed
 *   event, which is why the ruling made the FK `ON DELETE SET NULL` in the first place. So the
 *   implicit group carries NO heading: a label there would be a name nobody wrote. It is never
 *   called "unassigned", "other" or "ungrouped", all of which read as a failure state for what
 *   is the ordinary shape of every plan that exists today.
 *
 *   The same group is the landing place for an item whose `userExperienceId` names a row that is
 *   NOT in `events` — a row deleted between the two reads, or one the viewer's gate did not
 *   return. An item must NEVER disappear from the plan because its event could not be resolved
 *   (§13): a missing label is honest, a missing item is data loss on screen. And this reader
 *   does not invent a placeholder event for the dangling id either — it has no title, no date
 *   and no place to show, so there is nothing truthful to draw.
 *
 * ORDERING is the server's, not ours. `getUserExperiencesByTrip` returns rows
 * `event_date ASC NULLS LAST, created_at ASC`, so the named groups render in that order; the
 * implicit group leads, because those items are the plan's plain body and the named events read
 * as the structure laid over it. No group is invented for an event with no items on the day
 * being grouped — an empty event card would claim a schedule the day does not have.
 */
import { format } from "date-fns";
import { parseTripDate } from "@/lib/calendar-date";

/** The `events` projection the plancard route ships (id, title, eventDate, location, guestCount, experienceTypeId). */
export interface PlanEvent {
  id: string;
  title?: string | null;
  /**
   * `user_experiences.event_date` — a DATE column, so a bare "YYYY-MM-DD" with NO time of day.
   * The time of day is its OWN column (`startTime`, below) and is never read out of this one: a
   * value that somehow arrives here carrying a timestamp still renders as a calendar day, because
   * a clock read off a DATE column is manufactured (§13).
   */
  eventDate?: string | null;
  /**
   * `user_experiences.start_time` — the event's OWN wall-clock "HH:MM" (migration 282, ledger
   * `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 35). Read in the plan's
   * `trips.timezone` (ruling 30); where that is NULL the time is honestly zone-less and a reader
   * keeps its zone-free behaviour rather than substituting UTC.
   *
   * `null` / absent = NOT SET, and it is NEVER rendered as midnight, "00:00" or "all day" — all
   * three are claims nobody made. This is the column whose absence kept clock times off the
   * `WhichEvent` and `TravelEvents` artboards; it is not the plan's main moment, which stays a
   * `temporal_anchors` row.
   */
  startTime?: string | null;
  location?: string | null;
  guestCount?: number | null;
  /**
   * `user_experiences.budget` — the EVENT'S OWN stated budget (ledger `2026-09-04-event-budget`,
   * CLAUDE.md Locked Decision 29). A `decimal` column, so it arrives as a STRING; a number is
   * tolerated in the type because no reader here should care which spelling the wire used, and
   * the ONE parse lives in `plan-budget.ts`.
   *
   * `null` / absent = NOT STATED, and it is NEVER rendered as 0, "no budget" or "free" — all
   * three are claims the traveler did not make (§13). The PLAN's total is DERIVED from these
   * rows at read time and is never stored, so there is no second number to disagree with them.
   *
   * It is planning content, not money: no charge, fee, payout or rate path reads it (§14).
   */
  budget?: string | number | null;
  experienceTypeId?: string | null;
  /**
   * `experience_types.roles_needed` for the occasion this event names — the disciplines it
   * typically hires, as `service_categories.category_key` values (migration 280, CLAUDE.md Locked
   * Decision 31, ledger `2026-09-04-which-event-hint`). The SERVER resolves it and ships it on the
   * row; no client reader may reconstruct it from an occasion slug, a title or a keyword.
   *
   * `null` / absent = NOT SET, or no resolvable occasion behind the event ⇒ the reader says NOTHING
   * about roles for this event. It is never read as "this event needs nobody" (§13), and it is
   * never a supply claim: it names disciplines, not providers.
   */
  rolesNeeded?: readonly string[] | null;
}

/** The structural subset of a plan item this module reads (kept import-free so the test is pure). */
export interface EventLinkedItem {
  id: string;
  /**
   * `itinerary_items.user_experience_id`, present-only-when-set on the DTO. Absent OR null both
   * mean the plan's ONE implicit unnamed event — the DTO's absent key and the column's NULL are
   * the same fact wearing two spellings, and neither is "unknown".
   */
  userExperienceId?: string | null;
}

/** The stable React key for the implicit group. Not a label — nothing renders this string. */
export const IMPLICIT_EVENT_GROUP_KEY = "__implicit_event__";

export interface SlipEventGroup<T extends EventLinkedItem> {
  /** Stable render key: the event's id, or `IMPLICIT_EVENT_GROUP_KEY` for the unnamed group. */
  key: string;
  /** `null` = the plan's ONE implicit unnamed event. A renderer must draw NO heading for it. */
  event: PlanEvent | null;
  items: T[];
}

/**
 * Group a day's items under the events they name.
 *
 * @param items  the day's items, already in the order they should render within a group (this
 *               function never re-sorts them — the caller's time sort is preserved).
 * @param events the plan's events, in the server's order.
 * @returns the implicit group first (when it has items), then one group per event that actually
 *          has items here, in `events` order. Every input item appears in exactly one group.
 */
export function groupItemsByEvent<T extends EventLinkedItem>(
  items: readonly T[],
  events: readonly PlanEvent[] | null | undefined,
): SlipEventGroup<T>[] {
  // Seeded in `events` order so the named groups keep the server's ordering without a second
  // sort here. A duplicate id in the payload is collapsed to its first occurrence rather than
  // rendering the same event twice.
  const buckets = new Map<string, SlipEventGroup<T>>();
  for (const event of events ?? []) {
    if (!event || !event.id || buckets.has(event.id)) continue;
    buckets.set(event.id, { key: event.id, event, items: [] });
  }

  const implicit: SlipEventGroup<T> = { key: IMPLICIT_EVENT_GROUP_KEY, event: null, items: [] };

  for (const item of items) {
    const id = item.userExperienceId;
    // No link, or a link to an event this payload does not carry ⇒ the implicit group. The item
    // is ALWAYS placed; it can never be dropped for want of a resolvable event (§13).
    const bucket = (id && buckets.get(id)) || implicit;
    bucket.items.push(item);
  }

  const groups: SlipEventGroup<T>[] = [];
  if (implicit.items.length > 0) groups.push(implicit);
  // `Array.from` rather than iterating the Map directly: this project's tsconfig target predates
  // downlevel iteration of Map iterators, and Map preserves insertion order either way.
  for (const bucket of Array.from(buckets.values())) {
    if (bucket.items.length > 0) groups.push(bucket);
  }
  return groups;
}

/**
 * How many events this plan has — the count the Trip Strip's chip renders. A plan with no
 * `user_experiences` row has ZERO events (it has only its one implicit unnamed event, which is
 * not a row and is never counted as one), and the chip is hidden rather than showing "0 events".
 */
export function countPlanEvents(events: readonly PlanEvent[] | null | undefined): number {
  return (events ?? []).length;
}

/**
 * THE ONE DERIVATION OF AN EVENT'S META LINE — its DAY and TIME when set, its PLACE when set,
 * and NOTHING else.
 *
 * WHAT MAY APPEAR HERE (§13, and the reason this is a function rather than three inline copies):
 *  - the DATE. `user_experiences.event_date` is a Postgres DATE column, so the format string is a
 *    calendar day and a clock is never read out of it. Parsed with `parseTripDate` so a bare
 *    "YYYY-MM-DD" lands on LOCAL midnight — `new Date()` would render the previous day west of
 *    UTC (F-1).
 *  - the TIME, and ONLY from `start_time` (migration 282, ledger `2026-09-04-event-time-ui`).
 *    This is the one thing that changed here: until that column existed the answer to "what time
 *    is this event?" was that nothing on the row could say, so the ratified `WhichEvent` and
 *    `TravelEvents` clock times ("Sat 15:00 · Nanzen-ji", the tee times) were a ruled omission
 *    rather than a gap. They are now read from the column and NOWHERE else — a row with
 *    `startTime` null renders exactly as it did before, with the day and no clock, and is NEVER
 *    given a midnight or an "all day" (§13). It is printed VERBATIM, as the wall clock it is: no
 *    conversion, no zone suffix, because the zone it is read in is the PLAN's (`trips.timezone`,
 *    ruling 30) and this line does not have the plan.
 *  - the PLACE, when the row has one.
 *  - nothing else. A row that has told us none of them returns `""`, and its caller draws a bare
 *    row: no "Untitled event", no "Date TBD", no placeholder of any kind.
 *
 * The day and the time are ONE segment ("Sat, Oct 3 15:00") because they are one fact — WHEN —
 * and the place is the next. A time with no day still renders, alone: "15:00" is true of a row
 * that was given an hour and no date, and hiding it would lose an answer the traveler gave.
 *
 * ── THE DAY'S TWO FORMS (re-audit A18, ledger `2026-09-04-reaudit-fixes`) ─────────────────────
 * `format: "long"` (the default, and what every existing caller got) prints the full calendar day,
 * "Sat, Oct 3". `format: "short"` prints the WEEKDAY ALONE, "Sat" — for a caller that has already
 * named the date somewhere the reader can see it, which is what both ratified artboards draw:
 * the slip prints the date in the DAY HEADING above the event, and the "Which event?" picker
 * prints it in the plan's own dates above the list.
 *
 * IT IS AN OPTION, NOT A SECOND FUNCTION. Both artboards describe the same row, and two surfaces
 * deriving one label two ways is the drift class §18 rule 1 names — the second copy is exactly
 * where a clock time gets invented out of something that is not a clock. So the *substance* is
 * identical in both forms: the same date parse, the same shape-checked `start_time`, the same
 * place, the same §13 silences. Only how much of the day is spelled out differs.
 *
 * It lives beside `groupItemsByEvent` for the same reason.
 */
export interface EventMetaOptions {
  /**
   * "long" (default) ⇒ "Sat, Oct 3"; "short" ⇒ "Sat".
   *
   * Both ratified artboards draw the SHORT form, and both are surfaces where the calendar date is
   * already on screen: the slip prints it in the day heading directly above the event, and the
   * picker lists only the events of the ONE plan whose dates the traveler just set. STATED LIMIT
   * (§18d's posture, applied to a format rather than a guard): on a plan spanning more than a week
   * two events on different Saturdays render the same weekday, so "short" is a presentation choice
   * for a caller that can place the day from its surroundings — never a claim that the weekday
   * identifies the date on its own. "long" stays the default for exactly that reason.
   */
  format?: "long" | "short";
}

export function eventMetaLine(
  event: PlanEvent | null | undefined,
  options?: EventMetaOptions,
): string {
  if (!event) return "";
  const date = parseTripDate(event.eventDate);
  const day = date ? format(date, options?.format === "short" ? "EEE" : "EEE, MMM d") : null;
  // Shape-checked before it is shown: the column carries no DB CHECK (publish-trap posture), so a
  // value that is not a wall clock is not rendered as one. A malformed row shows its day and its
  // place, exactly as a row with no time does.
  const time = /^\d{2}:\d{2}$/.test((event.startTime || "").trim())
    ? (event.startTime as string).trim()
    : null;
  const when = [day, time].filter(Boolean).join(" ");
  return [when || null, event.location || null].filter(Boolean).join(" · ");
}

/**
 * ── THE SLIP'S DAY SLOTS — what a plan renders BEFORE anything has been added ─────────────────
 * Ledger `2026-09-05-slip-events-first-render`. NO SCHEMA CHANGE; this is a second reader of the
 * same two arrays `groupItemsByEvent` already reads.
 *
 * THE DEFECT IT CLOSES. The slip's day list is built from ITEMS — the plancard's `days` array is
 * `Array.from(new Set(items.map(i => i.dayNumber)))`, so a plan with no items has NO days — while
 * the header's event count is built from EVENTS. A freshly minted wedding plan is exactly that
 * state: four events ticked at step 5, zero items. The header said "4 events" and the body said
 * "No items on this plan yet", with no `slip-event-<id>` card anywhere. The very first thing a
 * traveler saw after "Build it myself" contradicted itself. Both halves were individually correct;
 * what was missing was a day list that can be derived from the EVENTS as well as from the items.
 *
 * `groupItemsByEvent` IS NOT FORKED. It still answers exactly what it answered before — which of a
 * DAY'S items belong to which event — and it still never invents a group for an event with no items
 * on that day. This function COMPOSES it: it calls it per day, unchanged, and then places the
 * events that have NO items ANYWHERE on the plan as their own empty-bodied groups. A second copy of
 * the grouping rule would be the drift class §18 rule 1 names.
 *
 * ── THE RULES, AND WHY EACH IS ONE ────────────────────────────────────────────────────────────
 * 1. **AN EVENT WITH ITEMS IS NEVER GIVEN A SECOND CARD.** It renders where its items are, exactly
 *    as it did before this lane. Only an event with nothing anywhere on the plan gets an empty
 *    card, so a plan whose events all carry items comes out of here byte-identical to today.
 * 2. **AN EMPTY EVENT IS PLACED ON THE DAY IT NAMES, AND NOWHERE ELSE (§13).** Its `event_date` is
 *    matched against the day's own `dateIso` — both are "YYYY-MM-DD" machine days from the same
 *    producer, which is why neither side re-parses a localised string. A date naming no day of the
 *    plan gets its own slot on that real calendar day rather than being folded into a day it does
 *    not fall on.
 * 3. **AN EVENT WITH NO DATE GOES IN A TRAILING UNDATED SLOT, NOT ON DAY 1.** `event_date` NULL
 *    means the traveler never gave the event a day; filing it under the plan's first day would put
 *    a date in their mouth, which is the fabrication §13 forbids everywhere else on this surface.
 *    The slot's heading names OUR KNOWLEDGE ("Undated"), never the plan's schedule. A value whose
 *    SHAPE is not a calendar day is treated as no date at all, for the same reason `eventMetaLine`
 *    refuses to print a malformed clock: nothing here repairs a value it cannot read.
 * 4. **THE PLAN'S OWN DAYS KEEP THEIR ORDER.** Extra slots merge into the sequence by date only
 *    when EVERY plan day has a machine date to merge against; a plan that does not know its dates
 *    keeps its ordinal days first and takes the dated event slots after them, because there is no
 *    honest place to wedge them in between.
 *
 * STATED NEGATIVE SPACE (§18d's posture, applied to a helper): this function decides WHICH DAY an
 * event card appears under and NOTHING about whether the plan should be grouped at all — that stays
 * the caller's `showsSchedule` read (Locked Decision 28) — and it never creates, edits or orders
 * events. The `events` order is the server's, preserved, exactly as `groupItemsByEvent` preserves
 * it.
 */

/** The ONE empty-body line an event card renders when nothing is planned under it yet. */
export const SLIP_EMPTY_EVENT_BODY = "Nothing added under this event yet";

/**
 * The stable key of the trailing slot holding events the traveler gave no day. It cannot collide
 * with the `day-<n>` / `date-<YYYY-MM-DD>` keys of the other two slot shapes, and it is also what
 * the heading's `data-testid` suffix becomes (`slip-day-heading-undated`).
 */
export const SLIP_UNDATED_SLOT_KEY = "undated";

/** That slot's heading. It names OUR KNOWLEDGE — these events have no day — and is never a claim
 *  about when they happen. */
export const SLIP_UNDATED_SLOT_HEADING = "Undated";

/** A day of the plan, reduced to what this function reads. The caller's item order is preserved. */
export interface SlipDayItems<T extends EventLinkedItem> {
  dayNum: number;
  /** The MACHINE day, "YYYY-MM-DD", or null when the plan has no start date to count from. */
  dateIso?: string | null;
  /** The day's items, already in the order they should render. */
  items: readonly T[];
}

export interface SlipDaySlot<T extends EventLinkedItem> {
  /** Stable render key. */
  key: string;
  /** The plan day this slot renders, or `null` for a slot the EVENTS alone brought into being. */
  dayNum: number | null;
  /** The machine calendar day this slot names, or `null` when it has none. */
  dateIso: string | null;
  /** `true` for the ONE trailing slot holding events with no `event_date` (rule 3). */
  undated: boolean;
  /** The groups to render, in order. A group with `items: []` is an event with nothing under it. */
  groups: SlipEventGroup<T>[];
}

/** "YYYY-MM-DD" out of a DATE column's value, or null when it is not one. Never repaired. */
function calendarDayOf(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function buildSlipDaySlots<T extends EventLinkedItem>(
  days: readonly SlipDayItems<T>[],
  events: readonly PlanEvent[] | null | undefined,
  options?: { groupByEvent?: boolean },
): SlipDaySlot<T>[] {
  const groupByEvent = options?.groupByEvent === true;

  // The plan's own days, exactly as they rendered before this lane. The ungrouped branch is the
  // same single implicit group the slip used to build inline, so a plan with no events — or one
  // whose occasion states no internal schedule — is untouched.
  const slots: SlipDaySlot<T>[] = days.map((day) => ({
    key: `day-${day.dayNum}`,
    dayNum: day.dayNum,
    dateIso: day.dateIso ?? null,
    undated: false,
    groups: groupByEvent
      ? groupItemsByEvent(day.items, events)
      : [{ key: IMPLICIT_EVENT_GROUP_KEY, event: null, items: [...day.items] }],
  }));

  if (!groupByEvent) return slots;

  const planEvents = (events ?? []).filter((e) => !!e && !!e.id);
  if (planEvents.length === 0) return slots;

  // Rule 1: an event that any item on the plan names already renders beside those items.
  const linked = new Set<string>();
  for (const day of days) {
    for (const item of day.items) {
      if (item.userExperienceId) linked.add(item.userExperienceId);
    }
  }

  const byDate = new Map<string, SlipDaySlot<T>>();
  for (const slot of slots) {
    if (slot.dateIso && !byDate.has(slot.dateIso)) byDate.set(slot.dateIso, slot);
  }

  const extra: SlipDaySlot<T>[] = [];
  let undatedSlot: SlipDaySlot<T> | null = null;
  const placed = new Set<string>();

  for (const event of planEvents) {
    if (linked.has(event.id) || placed.has(event.id)) continue;
    placed.add(event.id);
    const day = calendarDayOf(event.eventDate);
    let target = day ? byDate.get(day) : undefined;
    if (!target && day) {
      // Rule 2: a real calendar day the plan's item-derived days do not cover still gets named.
      target = extra.find((s) => s.dateIso === day);
      if (!target) {
        target = { key: `date-${day}`, dayNum: null, dateIso: day, undated: false, groups: [] };
        extra.push(target);
      }
    }
    if (!target) {
      // Rule 3: no day was given, so no day is invented.
      if (!undatedSlot) {
        undatedSlot = {
          key: SLIP_UNDATED_SLOT_KEY,
          dayNum: null,
          dateIso: null,
          undated: true,
          groups: [],
        };
      }
      target = undatedSlot;
    }
    target.groups.push({ key: event.id, event, items: [] });
  }

  // Rule 4. With no extra dated slots there is nothing to merge, so the plan's days are returned in
  // the order they arrived — never re-sorted for the sake of a sort.
  const byDay = (a: SlipDaySlot<T>, b: SlipDaySlot<T>) =>
    (a.dateIso || "").localeCompare(b.dateIso || "");
  let ordered: SlipDaySlot<T>[];
  if (extra.length === 0) {
    ordered = slots;
  } else if (slots.every((s) => !!s.dateIso)) {
    ordered = [...slots, ...extra].sort(byDay);
  } else {
    ordered = [...slots, ...extra.slice().sort(byDay)];
  }
  return undatedSlot ? [...ordered, undatedSlot] : ordered;
}

/**
 * ── "NO ITEMS" IS A CLAIM, AND A CLAIM NEEDS ITS DATA (QA check 3, post-publish walkthrough) ──
 *
 * THE DEFECT, and why the previous lane did not close it. `2026-09-05-slip-events-first-render`
 * gave a plan with events and no items a day list (`buildSlipDaySlots` above), so the header's
 * "3 events" and the body finally agreed — ONCE everything had loaded. But the slot list is built
 * with `groupByEvent`, and `groupByEvent` is `showsSchedule(occasion) && events.length > 0`: while
 * the occasion lookup is still in flight there is no row, `showsSchedule` correctly falls back to
 * FALSE, `buildSlipDaySlots` correctly returns the plan's own (empty) day list, and the slip
 * printed "No items on this plan yet" for as long as the lookup took. Every step was right; the
 * composition told the traveler their brand-new plan was empty and then filled it in.
 *
 * THE RULE (§13). An empty list and a list we do not have yet are DIFFERENT FACTS. The empty-state
 * copy is a statement about the plan, so it is said only once the data behind it has SETTLED; until
 * then the surface renders a neutral placeholder, which states nothing at all. Nothing about the
 * settled render changes — a plan that really has no slots still says exactly what it said before.
 *
 * It lives here, beside the slot builder whose output it reads, so the condition cannot be
 * restated at the call site and drift from the thing it guards (§18 rule 1).
 *
 * STATED NEGATIVE SPACE (§18d's posture, applied to a predicate): this answers ONLY whether the
 * empty-state SENTENCE may be shown. It says nothing about what the loading placeholder looks
 * like, and it is not a gate on the slot list itself — real slots render the moment they exist,
 * whether or not the occasion has resolved.
 */
export function showsSlipEmptyState(
  slotCount: number,
  occasionResolved: boolean,
): boolean {
  return occasionResolved && slotCount === 0;
}
