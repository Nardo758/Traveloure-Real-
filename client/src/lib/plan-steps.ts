/**
 * PLAN STEPS — the door table of the ONE planning modal, as a pure function.
 * Ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33.
 *
 * THE RULING THIS ENCODES. There is exactly one planning modal in the product — the five ratified
 * steps Occasion → Where → When → Who → What's happening — and every door opens it through the one
 * opener `usePlanning().open(source)` (ruling `2026-08-28-single-planning-entry`, whose OPENER rule
 * is untouched). Doors differ ONLY in two things: what arrives pre-filled, and which step opens
 * first. Those two answers are decided HERE and nowhere else — a second copy of "does this door
 * skip step 1?" written inside a component is the derivation-drift class §18 rule 1 names, and it
 * is exactly the kind of rule that drifts silently because a wrong answer still renders a modal.
 *
 * THE RULES, each one testable in isolation (`client/src/lib/__tests__/plan-steps.test.ts`):
 *
 *   1. STEP 1 IS SKIPPED WHEN THE OCCASION IS ALREADY ANSWERED. A door that carries an occasion
 *      (`source.experienceSlug`, or a `source.experienceType` that resolves to a seeded row) has
 *      answered step 1, so the modal opens at step 2 with an "<Occasion> · change" pill. A plan
 *      that already HOLDS an occasion (the Trip Strip's Edit door, a returning traveler) has
 *      answered it too. Everything else — the hero, `/start/events` — opens at step 1.
 *
 *   2. THE ANSWER MUST BE RESOLVABLE, OR THE QUESTION IS ASKED (§13). The skip is keyed on the
 *      RESOLVED `experience_types` row, not on the presence of a string. A door naming a slug the
 *      catalog does not carry does NOT skip: showing step 2 under a pill for an occasion nothing
 *      could resolve would be presenting a guess with the catalog's authority. There is no mapping
 *      table here — resolution is the existing `findOccasionByKey`, the same normalized match the
 *      edit panel already used to seed its select.
 *
 *   3. STEP 5 IS THE OCCASION'S OWN ANSWER. "What's happening" is visible only when
 *      `showsSchedule(row)` is true. NULL/absent/unrecognised ⇒ false ⇒ the step is not shown, the
 *      plain-plan shape (`occasion-switches.ts` states that fallback at its definition).
 *
 *   4. STEPS 2 AND 3 ARE NEVER SKIPPED. `trips.destination`, `trips.start_date` and
 *      `trips.end_date` are NOT NULL — a plan cannot be minted without them, so no door may skip
 *      the questions that produce them. A `source.city`/`destination` PRE-FILLS step 2; it never
 *      removes it.
 *
 *   5. STEP 4 IS ALWAYS VISIBLE AND ALWAYS SKIPPABLE. Party size is de-masked (migration 241): an
 *      untouched field saves as NULL, never a fabricated 2 — so the step costs nothing to show and
 *      answers nothing on the traveler's behalf.
 *
 *   6. `source.branch` DOES NOT CHANGE THE STEPS. A deep-open only means the "how" is already
 *      decided, so the finish offers that one CTA instead of three. The questions a plan needs are
 *      the same either way.
 *
 * Pure: no React, no fetch, no DB. The caller resolves the occasion row (it owns the catalog
 * query) and hands it in.
 */
import {
  durationShape,
  guestListSetting,
  showsSchedule,
  stopsShape,
  type OccasionSwitchRow,
} from "./occasion-switches";
import { partyNoun } from "./plan-vocabulary";

/** The five ratified steps, in flow order. `where` is step 2 — the artboard filename hides it. */
export type PlanStepId = "occasion" | "where" | "when" | "who" | "events";

/** Flow order, and the ONLY place it is written down. */
export const PLAN_STEP_ORDER: readonly PlanStepId[] = [
  "occasion",
  "where",
  "when",
  "who",
  "events",
];

/** The rail's label for each step — the artboards' own words. */
export const PLAN_STEP_LABELS: Record<PlanStepId, string> = {
  occasion: "Occasion",
  where: "Where",
  when: "When",
  who: "Who",
  events: "What's happening",
};

/**
 * The subset of `PlanningSource` this decision reads. Declared structurally rather than imported
 * so this module stays pure data + pure functions and cannot pull the provider (and its React
 * tree) into a unit test.
 */
export interface PlanStepsSource {
  /** A seeded `experience_types` slug the door already answered. */
  experienceSlug?: string;
  /** One of the five FROZEN coarse keys (ruling `2026-09-01-moment-key`). */
  experienceType?: string;
  city?: string;
  destination?: string;
  /** Deep-open: decides the FINISH, never the steps (rule 6). */
  branch?: string;
}

/** The subset of the held `TripContext` this decision reads. */
export interface PlanStepsContext {
  experienceSlug?: string;
  experienceType?: string;
}

export interface PlanSteps {
  /** The step the modal opens on. Always a member of `visibleSteps`. */
  startStep: PlanStepId;
  /** The steps the rail shows, in flow order. Never empty; always contains `where` and `when`. */
  visibleSteps: PlanStepId[];
}

/** Does this source/context NAME an occasion at all? A blank string names nothing. */
function namesOccasion(o: PlanStepsSource | PlanStepsContext | null | undefined): boolean {
  if (!o) return false;
  for (const v of [o.experienceSlug, o.experienceType]) {
    if (typeof v === "string" && v.trim().length > 0) return true;
  }
  return false;
}

/**
 * Which steps this door shows, and which one it opens on.
 *
 * @param source   the door's own context (`PlanningSource`), or null for a door that carries none.
 * @param occasion the RESOLVED `experience_types` row for whatever occasion the door or the held
 *                 plan names — `null` when nothing names one, or when what they name resolves to
 *                 no row (rule 2). The caller resolves it with `findOccasionByKey`.
 * @param context  the plan already held in trip context. Supplies the occasion identity when the
 *                 door carries none (the Trip Strip's Edit button, a returning traveler).
 */
export function resolvePlanSteps(
  source?: PlanStepsSource | null,
  occasion?: OccasionSwitchRow | null,
  context?: PlanStepsContext | null,
): PlanSteps {
  // Rule 3: the schedule step is the occasion's own answer; NOT SET ⇒ not shown (§13).
  const visibleSteps: PlanStepId[] = PLAN_STEP_ORDER.filter(
    (s) => s !== "events" || showsSchedule(occasion),
  );

  // Rules 1 + 2. A row alone is not enough: something must have NAMED it, or this is a row the
  // caller resolved by some other route and the traveler was never asked.
  const answered = Boolean(occasion) && (namesOccasion(source) || namesOccasion(context));

  return { startStep: answered ? "where" : "occasion", visibleSteps };
}

/** The step after `current` among `visible`, or null when `current` is the last visible step. */
export function nextPlanStep(visible: readonly PlanStepId[], current: PlanStepId): PlanStepId | null {
  const i = visible.indexOf(current);
  return i >= 0 && i < visible.length - 1 ? visible[i + 1] : null;
}

/** The step before `current` among `visible`, or null when `current` is the first visible step. */
export function previousPlanStep(
  visible: readonly PlanStepId[],
  current: PlanStepId,
): PlanStepId | null {
  const i = visible.indexOf(current);
  return i > 0 ? visible[i - 1] : null;
}

// ── STEP 4'S SECOND QUESTION, AND STEP 2'S SUGGESTED CITY ────────────────────────────────────
// Ledger `2026-09-04-step4-variants-fields`; CLAUDE.md Locked Decision 38 (migration 284).
//
// The Step4Variants artboard draws the SAME step-4 control under four occasions, and two of them
// ask a SECOND question the platform had nowhere to put. Migration 284 gave those answers columns;
// the two predicates below are the ONE place that decides WHEN each is asked. They live beside
// `resolvePlanSteps` for the same reason it does: "does this occasion ask about a budget approver?"
// is a rule that fails SILENTLY — a wrong answer still renders a step — so it is a pure function
// with a pinned test rather than a condition written inline in the modal (§18 rule 1).
//
// Both read the occasion's OWN switches, never its class: `2026-09-03-occasion-switches` ruled that
// an occasion is a ROW carrying defaults, and the class survives only as presentation vocabulary.

/**
 * Does this occasion ask WHO APPROVES THE BUDGET (`trips.budget_approver_name` / `_email`)?
 *
 * TRUE exactly when the party noun resolves to **"attendees"** — corporate events and retreats, the
 * occasions where nobody on the plan is "travelling with you" and somebody off the plan signs off
 * on the spend. It delegates to `partyNoun`, the SAME resolver step 4's own label uses, rather than
 * reading `vocabulary` directly: `partyNoun` is where `default_guests === false` is allowed to
 * override the column, and a second reading of that pair would drift from the label it sits under
 * (§18 rule 1).
 *
 * NULL / not set ⇒ `partyNoun` falls back to "travelers" ⇒ **false**: the question is not asked and
 * the column stays NULL — which means "never asked", never "nobody approves it" (§13).
 */
export function asksBudgetApprover(occasion?: OccasionSwitchRow | null): boolean {
  return partyNoun(occasion?.vocabulary, guestListSetting(occasion)) === "attendees";
}

/**
 * Does this occasion ask the ACCESSIBILITY NOTE (`trips.accessibility_note`)?
 *
 * TRUE exactly when `default_guests` is **explicitly true** — weddings, family occasions, parties:
 * the occasions with a guest list, where the party is other people whose pace the planner is
 * answering for. It reads the TRI-STATE `guestListSetting` deliberately: `false` is an occasion
 * that RULED it has no guest list, `null` is nobody having decided, and neither of those is a
 * reason to ask a planner about somebody else's mobility. Only an explicit `true` asks.
 *
 * The answer is the PLANNER's free-text note about the party, and is deliberately NOT
 * `trip_participants.accessibility_needs` — that column is one PARTICIPANT's own stated needs about
 * themself, given by that person on a different surface (CLAUDE.md Locked Decision 24 draws the
 * same line for the provider-side `access_notes`). Merging them would attribute a planner's
 * paraphrase to the participant.
 */
export function asksAccessibilityNote(occasion?: OccasionSwitchRow | null): boolean {
  return guestListSetting(occasion) === true;
}

/**
 * The city step 2 SUGGESTS, or `""` when it suggests nothing.
 *
 * THE CASE THIS EXISTS FOR: a date night. A `default_duration = "day"` occasion happens where the
 * traveler already is — nobody flies to their own date night — and for a signed-in member the
 * platform already knows that city (`users.home_city`, the column the Plus occasion-draft scheduler
 * builds from, CLAUDE.md entry 26). Making them type it is a door asking a question it can answer.
 *
 * §13 — A SHOWN DEFAULT AND A CHOSEN VALUE ARE DIFFERENT FACTS, and this function returns only the
 * first. It says what to SUGGEST; it never says what to save. The modal renders the suggestion as a
 * visibly filled, clearable value and does NOT write it to the pen or the trip row until the
 * traveler moves forward past step 2, at which point it becomes their answer like any other. A
 * suggestion nobody confirmed must not land on the plan looking like a city they named.
 *
 * Returns `""` — never a guess — when ANY of the three conditions is missing:
 *   - the occasion is not day-shaped (a range-shaped plan goes somewhere else; suggesting home
 *     would be wrong far more often than right);
 *   - there is no signed-in home city (a guest, or a member who never set one — `home_city` is
 *     nullable and the scheduler already treats NULL as "skip", never as a city);
 *   - the destination field already holds something (a door's own city, a returning plan, or a
 *     character the traveler typed). A suggestion never overwrites an answer.
 */
export function homeCitySuggestion(input: {
  occasion?: OccasionSwitchRow | null;
  homeCity?: string | null;
  currentDestination?: string | null;
}): string {
  if (durationShape(input.occasion) !== "day") return "";
  const home = (input.homeCity ?? "").trim();
  if (!home) return "";
  if ((input.currentDestination ?? "").trim() !== "") return "";
  return home;
}

// ── THE RE-AUDIT PREDICATES ───────────────────────────────────────────────────────────────────
// Ledger `2026-09-04-reaudit-fixes`. Each one answers a question the modal previously answered
// INLINE with a fixed tuple or a fixed sentence, and each one fails SILENTLY when it is wrong —
// a golf trip is offered a wedding's anchor card, a corporate plan is asked how many kids are
// coming — so they live here beside the door table, as pure functions with pinned tests, rather
// than as conditions written into the JSX (§18 rule 1).
//
// Every one reads the occasion's OWN switch columns (migration 276) through the readers in
// `occasion-switches.ts`. None of them keys on an occasion SLUG or on the presentation class:
// `2026-09-03-occasion-switches` ruled that an occasion is a ROW carrying defaults, and Locked
// Decision 31 warns specifically against answering a new question by growing a seventh switch.

/** One stepper on step 4: which column it writes, and the word above it. */
export interface PartyField {
  key: "adults" | "kids";
  label: string;
}

/**
 * STEP 4's STEPPERS, built from the occasion's own party NOUN (re-audit A4).
 *
 * THE DEFECT THIS CLOSES: the two steppers were a fixed tuple — `[{adults, <Noun>}, {kids, "Kids"}]`
 * — rendered for every occasion, so a corporate event asked "Attendees" and then, underneath it,
 * "Kids". Nobody brings children to an attendee count, and the ratified `Step4Variants` artboard
 * draws exactly one stepper on that panel.
 *
 * THE RULE: **attendees ⇒ ONE count, and the Kids stepper is OMITTED — never disabled.** An
 * absent control asks nothing and writes nothing; a greyed-out one asserts that the question
 * exists here and that the answer is unavailable, which is a different (and false) claim. That is
 * the same posture the add-a-stop control already takes under `default_stops: one`.
 *
 * For every other noun the pair is the artboard's own **Adults / Kids**, which is what the three
 * non-corporate panels draw. The occasion's noun is not repeated on the stepper because the step
 * TITLE already carries it ("How many attendees?" / "Who is coming?" / "Who is traveling with
 * you?"): a label saying "Guests" over a field that means "adults in the party" was the vaguer of
 * the two readings, and step 4 counts the booking party, not the guest list.
 *
 * NULL / not set ⇒ `partyNoun` falls back to "travelers" ⇒ the Adults/Kids pair, the plain-plan
 * shape (§13).
 */
export function partyFields(occasion?: OccasionSwitchRow | null): PartyField[] {
  const noun = partyNoun(occasion?.vocabulary, guestListSetting(occasion));
  if (noun === "attendees") return [{ key: "adults", label: "Attendees" }];
  return [
    { key: "adults", label: "Adults" },
    { key: "kids", label: "Kids" },
  ];
}

/** Does this occasion's step 4 ask a KIDS count at all? Derived from `partyFields`, never twice. */
export function asksKidsCount(occasion?: OccasionSwitchRow | null): boolean {
  return partyFields(occasion).some((f) => f.key === "kids");
}

/**
 * DOES THIS PLAN HAVE A MAIN MOMENT? (re-audit A15; the resolution of the re-audit's open
 * question **B4**, decision-maker delegated 2026-09-04.)
 *
 * THE DEFECT THIS CLOSES: the card's gate was `shape !== "day" && showsSchedule(...)`, so it
 * rendered for a **golf trip** — `range` + `schedule: true` — and a golf plan that answered it
 * acquired an unnamed "The main moment" `temporal_anchors` row beside its four tee-time anchors.
 * A golf trip's fixed points ARE the four rounds; it has no single centre of gravity, and the
 * anchor is read by the optimizer and the schedule validator, so this was a data consequence and
 * not only a pixel one.
 *
 * THE PREDICATE, and why it needs no new column (Locked Decision 31 — do not grow a seventh
 * switch to answer a new question):
 *
 *   - `default_duration = "day"` ⇒ **true**. A one-day occasion IS its moment: the step-3 date is
 *     the moment's date and the optional Time beside it is the moment's time, so the question is
 *     asked inline and the CARD is not drawn (the caller keeps the `shape !== "day"` half of its
 *     own condition — the card would ask the same question twice).
 *   - a RANGE ⇒ true only when the occasion HAS a schedule **and** its party noun is `guests` or
 *     `attendees`. That combination is the occasions whose schedule is arranged around ONE fixed
 *     point other people are invited to — a ceremony, a keynote — which is exactly what "the
 *     anchor everything else is timed around" means. A `travelers` occasion's schedule is a LIST
 *     of appointments (four tee times) with no single anchor among them.
 *
 * The noun is read through `partyNoun`, the same resolver step 4's own label uses, so an occasion
 * that has ruled `default_guests: false` (golf) resolves to "travelers" and is answered here by
 * the SAME rule that already refuses it guest wording — not by a second reading of that column
 * (§18 rule 1).
 *
 * NULL / not set ⇒ `durationShape` falls back to "range" and `showsSchedule` to false ⇒ **false**:
 * an occasion nobody has decided anything about is not given an anchor on its behalf (§13).
 */
export function showsMainMoment(occasion?: OccasionSwitchRow | null): boolean {
  if (durationShape(occasion) === "day") return true;
  if (!showsSchedule(occasion)) return false;
  const noun = partyNoun(occasion?.vocabulary, guestListSetting(occasion));
  return noun === "guests" || noun === "attendees";
}

/**
 * IS THE STEP-3 "your own city, one evening" CAPTION TRUE OF THIS PLAN? (re-audit A3.)
 *
 * The ratified `Step3Day` artboard prints "Your own city, one evening. No stops, no range." The
 * caption makes THREE claims, and a literal would assert all three for every day-shaped occasion —
 * including one a traveler is flying to. So each is checked against what the plan actually holds:
 *
 *   1. "one evening"  ⇒ `default_duration = "day"`;
 *   2. "no stops"     ⇒ `default_stops = "one"` (the stop list is absent for this occasion);
 *   3. "your own city"⇒ the destination on screen IS the signed-in member's `users.home_city` —
 *      the city lane G's `homeCitySuggestion` offers. Compared case-insensitively on the trimmed
 *      strings and nothing cleverer: there is no geocoder here and no alias table, so "Kyoto" and
 *      "Kyoto, Japan" are deliberately NOT matched. A false negative omits a caption; a false
 *      positive tells a traveler that a city they typed is where they live (§13).
 *
 * Any of the three missing ⇒ **false** ⇒ the caption is omitted. A guest, or a member who never
 * set a home city, therefore never sees it — which is correct, since nothing then knows where
 * "own" is.
 */
export function showsHomeCityDayCaption(input: {
  occasion?: OccasionSwitchRow | null;
  homeCity?: string | null;
  destination?: string | null;
}): boolean {
  if (durationShape(input.occasion) !== "day") return false;
  if (stopsShape(input.occasion) !== "one") return false;
  const home = (input.homeCity ?? "").trim();
  const dest = (input.destination ?? "").trim();
  if (!home || !dest) return false;
  return home.toLowerCase() === dest.toLowerCase();
}

/**
 * THE GUEST-LIST CLAUSE — ONE derivation, two callers (re-audit A9/A10).
 *
 * THE DEFECT THIS CLOSES: step 4's note ("Your guest list is separate and per event") and step 5's
 * intro ("…with its own time, place and guest list") both promised a per-event guest list
 * UNCONDITIONALLY. `golf-trip` seeds `default_guests: false`, so a golf plan was told twice that
 * it has a guest list it will never have — while `partyNoun` was, one line away, correctly
 * refusing that same plan every word of guest vocabulary.
 *
 * THE RULE: the clause is promised on an EXPLICIT `true` and omitted otherwise. `guestListSetting`
 * is deliberately tri-state — `false` is an occasion that ruled it has no guest list, `null` is
 * nobody having decided — and a promise is a CLAIM, so neither of those two is a licence to make
 * it (§13). The omission is silent rather than a "no guest list on this plan" line: that sentence
 * would be true of `false` and false of `null`, and one sentence cannot carry both.
 *
 * Returned as one object with all three sentences because they are one decision worn three ways. A
 * second copy of "does this occasion have a guest list?" written at any call site is the
 * derivation-drift class §18 rule 1 names — and it is precisely the drift that produced the defect.
 */
export interface GuestListCopy {
  /** The explicit `true` — a guest list exists and may be named. */
  on: boolean;
  /** Step 4's note under the steppers, WITHOUT its final punctuation (the caller closes it). */
  partyNote: string;
  /** Step 5's intro sentence. */
  eventsIntro: string;
  /** Step 5's footer line, or "" when there is no guest list to describe. */
  eventsFooter: string;
}

export function guestListCopy(occasion?: OccasionSwitchRow | null): GuestListCopy {
  const on = guestListSetting(occasion) === true;
  return {
    on,
    partyNote: on
      ? "This is the party on your booking. Your guest list is separate and per event"
      : "This is the party on your booking",
    eventsIntro: on
      ? "Tick what applies. Each becomes its own event on the plan, with its own day, time, place and guest list."
      : "Tick what applies. Each becomes its own event on the plan, with its own day, time and place.",
    eventsFooter: on ? "Guests are per event. Brunch can be family only." : "",
  };
}
