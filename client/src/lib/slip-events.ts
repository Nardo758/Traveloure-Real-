/**
 * SLIP EVENTS — the client's ONE reader of migration 277's `itinerary_items.user_experience_id`.
 * Ledger `2026-09-04-slip-events`; CLAUDE.md Locked Decision 29.
 *
 * Migration 277 gave every plan item a nullable link naming the EVENT inside the plan it sits
 * under, and the plancard payload already ships both halves of the pair — `events` (the trip's
 * `user_experiences` rows, behind the route's owner/advisor/author gate) and, on each activity,
 * `userExperienceId` present-only-when-set. Until this lane nothing read either. This module is
 * that reader: items + events in, grouped structure out. Pure — no React, no fetch, no DB — so
 * the rule below is testable on its own and cannot drift into a second copy at a call site
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

/** The `events` projection the plancard route ships (id, title, eventDate, location, guestCount, experienceTypeId). */
export interface PlanEvent {
  id: string;
  title?: string | null;
  /**
   * `user_experiences.event_date` — a DATE column, so a bare "YYYY-MM-DD" with NO time of day.
   * There is no time column on the row: a renderer shows the date and nothing else, and never
   * manufactures a clock time for an event (§13).
   */
  eventDate?: string | null;
  location?: string | null;
  guestCount?: number | null;
  experienceTypeId?: string | null;
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
