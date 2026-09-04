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
 * It lives beside `groupItemsByEvent` because the slip's event heading and the "Which event?"
 * picker (ledger `2026-09-04-which-event-picker`) must say the SAME thing about the same row —
 * two surfaces deriving one label two ways is the drift class §18 rule 1 names, and the second
 * copy is exactly where a clock time gets invented out of something that is not a clock.
 */
export function eventMetaLine(event: PlanEvent | null | undefined): string {
  if (!event) return "";
  const date = parseTripDate(event.eventDate);
  const day = date ? format(date, "EEE, MMM d") : null;
  // Shape-checked before it is shown: the column carries no DB CHECK (publish-trap posture), so a
  // value that is not a wall clock is not rendered as one. A malformed row shows its day and its
  // place, exactly as a row with no time does.
  const time = /^\d{2}:\d{2}$/.test((event.startTime || "").trim())
    ? (event.startTime as string).trim()
    : null;
  const when = [day, time].filter(Boolean).join(" ");
  return [when || null, event.location || null].filter(Boolean).join(" · ");
}
