/**
 * WHICH EVENT? — the decision behind the picker that asks which event an item is being added
 * under. Ledger `2026-09-04-which-event-picker`; migration 277; CLAUDE.md Locked Decision 29.
 *
 * WHAT WAS MISSING. Migration 277 gave `itinerary_items.user_experience_id` its column, its §19
 * pick-based allowlist (`itineraryItemEventLinkSchema`) and its server-side pairing check
 * (`resolveItemEventLink`); ledger `2026-09-04-slip-events` gave the slip a reader that GROUPS by
 * that column. Nothing anywhere let a traveler SAY which event an item belongs to, so the column
 * could only ever be NULL on a traveler-authored add. This module is that write surface's brain —
 * pure, so the rules below are testable on their own and cannot drift into a second copy at a
 * call site (§18 rule 1).
 *
 * THE RULES IT ENCODES:
 *
 * 1. **NULL IS A REAL ANSWER.** Every plan has ONE implicit unnamed event and `NULL` *is* that
 *    event — the reason the FK is `ON DELETE SET NULL` (Locked Decision 29). So the picker always
 *    offers it, and choosing it sends an EXPLICIT `null`, not an omitted key: absent and null are
 *    two different instructions to `resolveItemEventLink` ("ignore" vs "set to the implicit
 *    event"). It is never called "Unassigned", "Other" or "None" — words that read as a failure
 *    state for what is the ordinary shape of every plan that exists today, and the slip
 *    deliberately renders that same group with no heading at all.
 *
 * 2. **SKIP THE QUESTION WHEN THERE IS NOTHING TO ASK.** Zero or one named event ⇒ no picker;
 *    the add proceeds and never mentions the link at all. A one-option dialog is not a choice.
 *
 * 3. **NOTHING IS PRE-SELECTED.** `INITIAL_WHICH_EVENT_SELECTION` is `null` and stays `null`.
 *    A pre-selected row is a guess presented as the platform's answer, and this codebase has no
 *    source for one: **there is no mapping from a service's category to the event it belongs
 *    to.** The column that would carry it (`experience_types.roles_needed`) does not exist in
 *    this repo and is HELD pending decision-maker ratification, so the ratified mock's
 *    "suggested for florists" hint is deliberately NOT built — keyword-matching a category
 *    against an event title would be exactly the fabricated authority §13 forbids.
 *
 * 4. **NO CLOCK TIME, EVER.** A row's supporting line is `eventMetaLine` — the ONE derivation,
 *    shared with the slip's event heading — which renders the DATE when set and the PLACE when
 *    set and nothing else. `user_experiences.event_date` is a DATE column with no time-of-day
 *    column anywhere on the row, so a start time on any surface would be manufactured.
 *
 * 5. **ORDERING IS THE SERVER'S.** `eventsForTrip` filters and never sorts; `whichEventChoices`
 *    preserves the order it is handed. The implicit choice LEADS, matching `groupItemsByEvent`'s
 *    group order — one ordering rule across both surfaces, not two.
 *
 *    The CANONICAL server order is **`event_date ASC NULLS LAST`, then `created_at ASC`**
 *    (ledger `2026-09-04-event-order`; decision-maker ratified Sep 4 2026). A plan reads forward
 *    in time, and an undated event sorts last rather than jumping the queue on a NULL. When this
 *    module shipped, the two servers disagreed — `getUserExperiencesByTrip` (the slip's DTO) was
 *    already chronological while `getUserExperiences` (`/api/user-experiences`, which feeds this
 *    picker) was `created_at DESC` — so the same events rendered in two orders on two surfaces of
 *    one plan. Putting ordering in the server's hands is only ONE authority if the server has one
 *    answer; both readers now share it. **Do not "fix" an ordering complaint by sorting here** —
 *    a client-side sort would make this module a second authority, which is the drift rule 5
 *    exists to prevent (§18 rule 1).
 */
import { eventMetaLine, IMPLICIT_EVENT_GROUP_KEY, type PlanEvent } from "@/lib/slip-events";
import { ADD_TO_PLAN_LABEL } from "@/lib/plan-vocabulary";

/**
 * A row as `GET /api/user-experiences` returns it — the caller's own experiences, of which the
 * ones bound to a plan by `trip_id` are that plan's events. `PlanEvent` is the narrower shape the
 * plancard DTO ships; this adds the binding column the user-scoped list needs to be filtered by.
 */
export interface PlanEventRow extends PlanEvent {
  tripId?: string | null;
}

/**
 * Re-exported so a picker surface has ONE import site for the implicit-group key and the event
 * shape, both shared verbatim with the slip's reader.
 */
export { IMPLICIT_EVENT_GROUP_KEY };
export type { PlanEvent };

/**
 * The implicit choice's visible label.
 *
 * The slip draws the implicit group with NO heading, because there a heading would be a name
 * nobody wrote. A picker row must be clickable and therefore must say something, so it says the
 * plainest true thing: this item is not going under any of the named events. It is phrased as a
 * CHOICE, never as a failure ("Unassigned" / "Other" / "None"), because it is the ordinary shape
 * of every plan that has no events at all.
 */
export const IMPLICIT_EVENT_CHOICE_LABEL = "No particular event";

/**
 * What a bare row says to a screen reader. An event row with no title and no date and no place
 * has told us NOTHING, and this is a description of what the control is — not a name for the
 * event, which nobody wrote. Never "Untitled event".
 */
export const UNLABELLED_EVENT_DESCRIPTION = "An event on this plan";

/** Rule 3: the picker opens with nothing chosen, and this is the single source of that fact. */
export const INITIAL_WHICH_EVENT_SELECTION: string | null = null;

/**
 * The events of ONE plan, out of the user-scoped `/api/user-experiences` list.
 *
 * ONE definition of "the events of this plan", shared with the Trip Strip's count chip — the
 * strip filtered inline before this module existed, and two copies of the same filter is the
 * drift §18 rule 1 names. Order is the SERVER's (`getUserExperiences` returns
 * `created_at DESC`); a filter preserves relative order and nothing here re-sorts.
 *
 * A missing/never-loaded list and a plan with no events both yield `[]` — the same honest
 * absence, never a fabricated row.
 */
export function eventsForTrip<T extends PlanEventRow>(
  rows: readonly T[] | null | undefined,
  tripId: string | null | undefined,
): T[] {
  if (!tripId) return [];
  return (rows ?? []).filter((row) => !!row && row.tripId === tripId);
}

/**
 * Rule 2 — is the question worth asking?
 *
 * ZERO events: the plan has only its ONE implicit unnamed event, so there is nothing to choose
 * between and the add lands there by construction. ONE event: the mock's own footnote says a
 * plan with one event skips this question — offering a single option plus "no particular event"
 * would be asking the traveler to ratify a decision the plan already made. Only from TWO named
 * events on is there a real choice.
 */
export function shouldAskWhichEvent(events: readonly PlanEvent[] | null | undefined): boolean {
  return (events ?? []).length >= 2;
}

/** One selectable row in the picker. */
export interface WhichEventChoice {
  /** Stable render key: the event's id, or `IMPLICIT_EVENT_GROUP_KEY` for the implicit choice. */
  key: string;
  /** The event row, or `null` for the plan's ONE implicit unnamed event. */
  event: PlanEvent | null;
  /**
   * The row's visible label: the event's own title, or `""` for a row that has no title. A bare
   * row is honest; "Untitled event" is a name nobody wrote (§13).
   */
  label: string;
  /**
   * Date-when-set · place-when-set, from the ONE shared derivation. `""` when the row has told us
   * neither. NEVER a clock time — there is no time column on `user_experiences`.
   */
  meta: string;
  /**
   * The exact value to send as `userExperienceId`. `null` for the implicit choice — an EXPLICIT
   * null, which is how a traveler names the plan's own unnamed event (Locked Decision 29).
   */
  value: string | null;
}

/**
 * Build the picker's rows: the implicit choice first, then one row per event in the order it was
 * handed (rule 5). A duplicate id is collapsed to its first occurrence, exactly as
 * `groupItemsByEvent` collapses it, so the same row cannot be offered twice.
 *
 * No row carries a "suggested" or "recommended" mark and none is pre-selected — see rule 3.
 */
export function whichEventChoices(
  events: readonly PlanEvent[] | null | undefined,
): WhichEventChoice[] {
  const choices: WhichEventChoice[] = [
    {
      key: IMPLICIT_EVENT_GROUP_KEY,
      event: null,
      label: IMPLICIT_EVENT_CHOICE_LABEL,
      meta: "",
      value: null,
    },
  ];
  const seen = new Set<string>();
  for (const event of events ?? []) {
    if (!event || !event.id || seen.has(event.id)) continue;
    seen.add(event.id);
    choices.push({
      key: event.id,
      event,
      label: event.title || "",
      meta: eventMetaLine(event),
      value: event.id,
    });
  }
  return choices;
}

/** Find a choice by its render key. `null` for a key that is not on the list. */
export function findWhichEventChoice(
  choices: readonly WhichEventChoice[],
  key: string | null | undefined,
): WhichEventChoice | null {
  if (!key) return null;
  return choices.find((choice) => choice.key === key) ?? null;
}

/**
 * The confirm button's label.
 *
 * "Add to Ceremony" when the chosen event actually has a name. Everything else — nothing chosen
 * yet, the implicit choice, or an event whose row carries no title — falls back to the platform's
 * universal action label from `plan-vocabulary.ts` (never spelled out here, §18 rule 1). A
 * fallback is the honest answer for a row with no name; "Add to Untitled event" is not.
 */
export function whichEventCtaLabel(choice: WhichEventChoice | null | undefined): string {
  const title = choice?.event?.title;
  return title ? `Add to ${title}` : ADD_TO_PLAN_LABEL;
}
