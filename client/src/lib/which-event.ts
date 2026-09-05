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
 * 3. **NOTHING IS PRE-SELECTED — AND A HINT IS NOT A SELECTION.**
 *    `INITIAL_WHICH_EVENT_SELECTION` is `null` and stays `null`. A pre-selected row is a guess
 *    presented as the platform's answer, and no amount of evidence changes that: the traveler's
 *    first click is still the first answer that exists.
 *
 *    What HAS changed since this module was written is the evidence available to MARK a row.
 *    Migration 280 (`experience_types.roles_needed`, CLAUDE.md Locked Decision 31, ledger
 *    `2026-09-04-roles-needed`) gave every occasion the list of disciplines it typically hires,
 *    written in `service_categories.category_key` — the same vocabulary a listing's category is
 *    written in. So the ratified mock's "suggested for florists" hint now has a real source and
 *    is built here as `hintForEvent`. Three things about it must not be weakened:
 *
 *      · **It reads the SERVER's list and restates nothing.** The event row carries its occasion's
 *        `rolesNeeded` on the wire (`GET /api/user-experiences`, and the plancard `events` DTO).
 *        No role→occasion table exists in client code, and none may be added — a second copy of
 *        that mapping is the derivation-drift class §18 rule 1 names, and it would be wrong the
 *        day an occasion's roles are re-seeded.
 *      · **It MARKS, it never CHOOSES.** The hint is a string a row may display. It is not a
 *        field on `WhichEventChoice`, it does not order the rows, and nothing downstream reads it
 *        — so it cannot quietly become a default. `whichEventChoices` still returns rows with no
 *        preference on them at all.
 *      · **Silence is the answer to every absence (§13).** No `rolesNeeded` (NOT SET, or no
 *        resolvable occasion), no category on the listing, no match, or a matched key this build
 *        cannot name — every one of those produces NO hint. Nothing is ever inferred from an
 *        event's title, its date or its place: keyword-matching a category against a name is
 *        exactly the fabricated authority §13 forbids, and it is no more allowed now than it was
 *        when the hint had no source at all.
 *
 * 4. **A CLOCK TIME COMES FROM THE CLOCK COLUMN, OR NOT AT ALL.** A row's supporting line is
 *    `eventMetaLine` — the ONE derivation, shared with the slip's event heading — which renders
 *    the DAY when set, the TIME when set, and the PLACE when set.
 *
 *    This rule USED to read "no clock time, ever", and that was correct for as long as it was
 *    true of the data: `user_experiences.event_date` is a DATE column, so the artboard's
 *    "Sat 15:00 · Nanzen-ji" had no source and drawing it would have been a schedule the traveler
 *    never gave us. Migration 282 (`user_experiences.start_time`, ledger
 *    `2026-09-04-stops-and-event-time`, CLAUDE.md Locked Decision 35) gave it one, and ledger
 *    `2026-09-04-event-time-ui` builds it. **What did NOT change is the reason the rule existed:**
 *    the time may come from `start_time` and from nowhere else. It is never read out of
 *    `event_date`, never inferred from the plan's main moment, never defaulted to midnight and
 *    never rendered as "all day" — a row whose `start_time` is NULL shows its day and no clock,
 *    exactly as every row did before this lane (§13).
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
import { occasionRoleNoun } from "@shared/occasion-role-nouns";

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
   * Day-and-time-when-set · place-when-set, from the ONE shared derivation. `""` when the row has
   * told us none of them. The clock reads ONLY `user_experiences.start_time` (rule 4) — a row
   * with no time set shows none, and never a midnight standing in for one.
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
 * A choice carries NO preference of any kind and none is pre-selected (rule 3). The role hint is
 * deliberately NOT a field here: it is computed per row by `hintForEvent`, which needs the listing
 * being added and this function has no business knowing about. Keeping it off the shape is what
 * stops a mark from being mistaken for — or quietly promoted into — a default selection.
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
      // SHORT form — the ratified `WhichEvent` artboard's "Sat 15:00 · Nanzen-ji" (re-audit A18).
      // Same ONE derivation as the slip's event heading, called with the option rather than
      // re-implemented: a second copy is where a clock gets invented out of something that is not
      // one (§18 rule 1).
      meta: eventMetaLine(event, { format: "short" }),
      value: event.id,
    });
  }
  return choices;
}

/**
 * The hint's fixed opening. Kept as a constant so the ONE claim this surface makes is stated in
 * ONE place: the occasion SUGGESTS this kind of listing. Never "best for", never "recommended",
 * never "the right event" — the platform is reporting what the occasion asks for, not judging the
 * traveler's plan.
 */
export const ROLE_HINT_PREFIX = "suggested for";

/**
 * RULE 3's MARK — does THIS event's occasion ask for the discipline being added?
 *
 * The whole decision, in one pure function, so the picker cannot grow a second copy of it at the
 * call site (§18 rule 1) and so every way of answering "no" is pinned by a test.
 *
 * @param event               the row being marked, or `null` for the plan's implicit unnamed
 *                            event — which is not an occasion and therefore asks for nothing.
 * @param serviceCategoryKey  the LISTING's `service_categories.category_key`, as the server sends
 *                            it. Never a name, a slug or a description: the key is the only thing
 *                            `roles_needed` is written in, and comparing anything else would be a
 *                            keyword guess.
 * @returns the hint to display, e.g. `"suggested for florists"`, or `null` for SAY NOTHING.
 *
 * Every "no" is silence, never a negative claim (§13). An event whose occasion does not list this
 * discipline is not "wrong" for it — a traveler may put a florist under the farewell brunch, and
 * this surface must not argue. So there is no "not suggested" counterpart and there never will be.
 */
export function hintForEvent(
  event: PlanEvent | null | undefined,
  serviceCategoryKey: string | null | undefined,
): string | null {
  // The implicit event, or no listing category at all (a listing whose category predates the key
  // column, or a shape that has none) ⇒ there is nothing to compare.
  if (!event || !serviceCategoryKey) return null;
  const roles = event.rolesNeeded;
  // NOT SET, or no resolvable occasion behind the row. Never read as "needs nobody".
  if (!Array.isArray(roles) || roles.length === 0) return null;
  if (!roles.includes(serviceCategoryKey)) return null;
  // A match we cannot put into words stays unsaid — the column has no DB CHECK, so a value this
  // build has never heard of is possible, and printing the raw key at a traveler is worse than
  // printing nothing.
  const noun = occasionRoleNoun(serviceCategoryKey);
  return noun ? `${ROLE_HINT_PREFIX} ${noun}` : null;
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
