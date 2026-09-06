import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Calendar, Clock, MapPin, Minus, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearTripContext,
  getTripContext,
  releasePendingEventsPen,
  switchTripContext,
  updateTripContext,
  useTripContext,
  type TripContext,
} from "@/lib/trip-context";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseTripDate } from "@/lib/calendar-date";
import { eventTypeForSlug, findOccasionByKey } from "@shared/occasions";
import {
  MAX_PARTY_COUNT,
  parsePartyCountInput,
  partyNoun,
  partyTotal,
  travelersForSave,
} from "@/lib/plan-vocabulary";
import { durationShape, guestListSetting, showsSchedule, stopsShape } from "@/lib/occasion-switches";
import {
  MAX_PLAN_STOPS,
  addStop,
  isLocatedStop,
  moveStop,
  namedStops,
  removeStopAt,
  renameStopAt,
  seedStops,
  stopSequence,
  type PlanStop,
} from "@/lib/plan-stops";
import { savePlanStops } from "@/lib/plan-stops-writer";
import { eventsNotYetCreated } from "@/lib/organize-events";
import {
  eventsToCreate,
  hasEventRow,
  planDayOptions,
  planEventRowValues,
  readPendingEvents,
  setEventDetail,
  toggleEventRow,
  type PlanEventDraft,
} from "@/lib/plan-events";
import {
  PLAN_STEP_LABELS,
  asksAccessibilityNote,
  asksBudgetApprover,
  asksKidsCount,
  guestListCopy,
  nextPlanStep,
  partyFields,
  previousPlanStep,
  resolvePlanSteps,
  resolveStep2Destination,
  showsHomeCityDayCaption,
  showsMainMoment,
  type PlanStepId,
} from "@/lib/plan-steps";
import { useAuth } from "@/hooks/use-auth";
import type { PlanningBranch, PlanningSource } from "@/contexts/PlanningContext";
import type { ExperienceType } from "@shared/schema";

/**
 * PlanModal — THE planning modal. One modal, many doors.
 * Ledger `2026-09-04-one-modal-many-doors`; CLAUDE.md Locked Decision 33.
 *
 * This file was `edit-trip-panel.tsx` (the Trip-Strip edit surface) and is the SAME component,
 * given the five ratified steps and the finish it always needed. It was renamed rather than
 * copied on purpose: the panel already owned the ONE save implementation — the trip-context
 * write with REPLACE semantics, the `PATCH /api/trips/:tripId/occasion` write, the main-moment
 * anchor, the per-event `user_experiences` rows and the pre-trip holding pen — and a second
 * component with a second copy of that save is the derivation-drift class §18 rule 1 names.
 * Everything below the "── THE SAVE ──" banner is that logic, extended, not re-implemented.
 *
 * ── WHAT CHANGED, AND WHY IT IS ONE MODAL ───────────────────────────────────────────────────
 *
 * Before this lane there were two unconnected surfaces, each holding a fragment of the ratified
 * flow: the planning CHOOSER (`PlanningContext`), which asked "how do you want to plan?" first
 * and then asked for a destination and dates a second time inside whichever branch you picked;
 * and this panel, which asked the real questions but was reachable only from the Trip Strip, the
 * cart header and the experience-template empty state. A traveler could answer "Kyoto, Oct 2–4"
 * twice and see it land in two different places.
 *
 * Now: every door opens THIS modal through the one opener `usePlanning().open(source)` (ruling
 * `2026-08-28-single-planning-entry` — the OPENER rule is untouched; what it RENDERS is what
 * changed). Doors differ only in what arrives pre-filled and which step opens first, and that
 * decision is `resolvePlanSteps` in `client/src/lib/plan-steps.ts` — never restated here.
 * The chooser's three ways to build (myself / AI / a local expert) are the FINISH of the last
 * visible step, not a sixth step and not a first one: you say what you are planning before you
 * say who should build it.
 *
 * ── THE SWITCH READERS (ledger `2026-09-03-switch-readers`, migration 276) ────────────────────
 * The chosen occasion's ROW decides the shape of three steps. Each reader is called ONCE, and its
 * §13 fallback is stated where it is defined (`client/src/lib/occasion-switches.ts`):
 *
 *   step 3 (When)   `default_duration` — "day" ⇒ one date + a time; "range" ⇒ the first/last pair.
 *                   ADDITIONALLY (the ratified Step3When artboard): an occasion that HAS a
 *                   schedule also gets "The main moment" card on a RANGE, which is the artboard
 *                   resolving what the audit flagged as mutually exclusive branches.
 *   step 4 (Who)    `vocabulary` — Travelers / Guests / Attendees, via `partyNoun`, which also
 *                   honours `default_guests: false` by refusing guest wording outright.
 *   step 5 (Events) `default_schedule` — "What's happening" exists only when the occasion has an
 *                   internal schedule. Its chips are the SERVER's own presets for that occasion.
 *
 * NULL means NOT SET everywhere: the plain-plan shape, never a fabricated answer wearing the
 * row's authority.
 *
 * ── STEP 2 CAN BE A LIST NOW (ledger `2026-09-04-plan-stops-ui`) ──────────────────────────────
 * The Step2Where artboard (formerly ModalWhere) draws "Add another stop" and TravelWhere draws
 * the same step holding three of them; both were OMITTED (never disabled) while
 * `trip_destinations` did not exist,
 * because a control that collects an answer nothing can store is worse than an absent one. The
 * table exists (migration 281, Locked Decision 34), so `default_stops` is read — the SIXTH switch
 * and the last one — through `stopsShape`, and step 2 is:
 *
 *   "many" ⇒ an ORDERED list whose ROW 1 IS THE DESTINATION FIELD. That is not a layout choice:
 *            `trips.destination` is the POSITION-0 MIRROR of the stop rows, so moving another city
 *            to the front really does change the plan's headline destination, its market and its
 *            IANA zone — and the server re-derives all three when it re-mirrors. Rows reorder with
 *            buttons (no drag library) and position IS array order; the server numbers them.
 *   "one"  ⇒ exactly the single field this step has always shown. NOTHING is written to
 *            `trip_destinations` in that shape: the flow asked no stop question, so it states no
 *            answer, and `[]` stays the honest NOT CAPTURED with `trips.destination` as the plan's
 *            one city (§13). It also means a stop added elsewhere — the location-mismatch dialog's
 *            "add this city as a stop" — is never silently erased by a later save under a
 *            single-stop occasion.
 *
 * COORDINATES ARE NOT COLLECTED HERE and are never derived from a name: this lane builds no map
 * and no geocoder, so a stop the traveler has not placed stays UNLOCATED and says so on its own
 * row. The summary renders the list as a SEQUENCE ("A → B → C") and claims no route, distance or
 * duration (Locked Decision 22c). A trip's stops are written through the ONE client writer
 * (`plan-stops-writer.ts`) that the mismatch dialog also uses — never a second rail.
 *
 * ── STEP 4 IS ADULTS + KIDS, AND UNTOUCHED STILL MEANS NULL ───────────────────────────────────
 * `trips.adults` / `trips.kids` exist and were de-masked by migration 241 precisely so an
 * unanswered party stays NULL. The steppers start EMPTY ("—"), never at 2 and never at 1, and a
 * party nobody stated is written as nothing at all. `travelers` — the field the Trip Strip's chip
 * reads — stays DERIVED from the two through `partyTotal`, so the chip and the columns can never
 * disagree, and a party the traveler never touched preserves whatever count the plan already
 * carried rather than being cleared by a step they walked past.
 *
 * ── …AND IT ASKS A SECOND QUESTION THE OCCASION CHOOSES (ledger
 *    `2026-09-04-step4-variants-fields`, migration 284, CLAUDE.md Locked Decision 38) ───────────
 * `2026-09-04-one-modal-many-doors` shipped this step with a ruled omission recorded right here —
 * "the Step4Variants artboard's corporate budget-approver and family accessibility fields are NOT
 * built: no column holds either, and inventing one is a decision, not a side effect of this lane."
 * That decision has now been taken, so the two fields the artboard draws are built:
 *
 *   BUDGET APPROVER (name + optional email) when `asksBudgetApprover(row)` — the party noun is
 *   "attendees". Nobody travels on a corporate plan; somebody off it signs off on the spend.
 *   ACCESSIBILITY NOTE (free text) when `asksAccessibilityNote(row)` — the occasion has a guest
 *   list. It is the PLANNER's note about the party, and is deliberately NOT
 *   `trip_participants.accessibility_needs`: that is a participant's own answer about themself,
 *   given by that person on a different surface (Locked Decision 24 draws the same line).
 *
 * Both predicates live ONCE, in `@/lib/plan-steps` — the same module the door table lives in, and
 * for the same reason: a wrong answer still renders a step, so the rule is pure and pinned. An
 * untouched field is NULL everywhere and is NEVER rendered as "no needs" / "no approver" (§13).
 * The write rides the SAME occasion PATCH the party pair does — one save, one allowlist.
 *
 * ── STEP 2 CAN SUGGEST A CITY, AND A SUGGESTION IS NOT AN ANSWER ──────────────────────────────
 * A day-shaped occasion (a date night) happens where the traveler already is, and for a signed-in
 * member `users.home_city` already says where that is. `homeCitySuggestion` decides whether to
 * suggest it; `destinationSuggested` below is what keeps the shown default and the chosen value
 * apart until the traveler moves FORWARD past step 2 (§13).
 *
 * ── AUTHORING MODE RELABELS STEP 4, AND IS NEVER INFERRED ─────────────────────────────────────
 * An expert building a plan FOR a client is answering about someone else's party, so step 4 asks
 * "Who is traveling with your client?" over "The client's party". That is the `authoring` prop —
 * passed by the door that KNOWS (`PlanningSource.authoring`), never derived from the viewer's role:
 * an expert planning their own holiday is a traveler, and a role check would mislabel them.
 */

/**
 * The `temporal_anchors.description` this modal stamps on the "main moment", and the marker it
 * re-finds that anchor by on a later save. `anchorType` has no member for "the thing this day is
 * about" (see `temporalAnchorTypeEnum`), so the moment is a `custom` anchor and this string is its
 * identity — which is what makes a second save an UPDATE rather than a duplicate.
 */
const MAIN_MOMENT_DESCRIPTION = "The main moment";

/** The server preset shape this modal reads (`GET /api/logistics/presets/:templateSlug`). */
interface LogisticsPresets {
  anchors?: Array<{ anchorType?: string; label?: string }>;
}

/** What the finish hands back to whoever opened the modal, once the plan has been committed. */
export interface CommittedPlan {
  /** The plan row this commit bound to, when one exists. Absent ⇒ nothing was minted or bound. */
  tripId?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  /** The derived party total (`partyTotal`) — absent when nobody stated one (§13). */
  travelers?: number;
  /** The chosen occasion's seeded slug, when one was chosen. */
  occasionSlug?: string;
  /** The chosen occasion's display name, for a surface that labels rather than keys off it. */
  occasionName?: string;
}

/** A mint the finish asks for. Refusals carry the traveler-facing sentence to show inline. */
export type PlanMintOutcome =
  | { ok: true; tripId: string }
  /** `message` absent ⇒ the caller already took over the screen (e.g. opened sign-in). */
  | { ok: false; message?: string };

export interface PlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The door's own context. Null for a door that carries none (the Trip Strip's Edit button). */
  source?: PlanningSource | null;
  /** The build CTAs the finish offers, in order. A `source.branch` deep-open narrows this to one. */
  branches: PlanningBranch[];
  /**
   * AUTHORING MODE — an expert building this plan FOR a client (ledger
   * `2026-09-04-step4-variants-fields`). It changes step 4's ACTOR, never its shape: the same two
   * steppers and the same columns, asked about somebody else's party.
   *
   * IT IS PASSED BY THE DOOR, NEVER INFERRED FROM A ROLE. The expert authoring builds are the ones
   * whose trips carry `userId = NULL` and an `authorId` (migration 133), and only the surface that
   * opened the modal knows which of those it is: an expert planning their own holiday is a
   * TRAVELER, and a role check would relabel their own plan as a client's. So this is an explicit
   * flag on the opener's `PlanningSource`, defaulting to false.
   *
   * It grants NOTHING. Every write below is unchanged and still gated exactly as it was — the
   * owner-gated occasion PATCH, the owner-scoped event POST, the §12 advisor statuses on the item
   * rails. A label is not a permission.
   */
  authoring?: boolean;
  /** "Continue {trip}" for a returning traveler; null when no trip is bound. */
  continueHref?: string | null;
  continueLabel?: string | null;
  /** Navigate to the continue target. Owned by the opener, not by this modal. */
  onContinue?: (href: string) => void;
  /**
   * Mints the plan row for a branch that needs one. THE one mint door lives in the opener
   * (`mintTripSlip` via PlanningContext) — this modal never builds a `POST /api/trips` body.
   */
  mintPlan?: (basics: {
    destination?: string;
    startDate?: string;
    endDate?: string;
    title?: string;
  }) => Promise<PlanMintOutcome>;
  /** Runs the chosen branch, AFTER the plan has been committed. */
  onFinish?: (branch: PlanningBranch, plan: CommittedPlan) => void;
}

const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

/**
 * A party stepper's value: `""` = the traveler has not stated one, and stepping below 1 returns
 * there rather than to a zero.
 *
 * NEITHER FIELD HAS AN EXPLICIT ZERO, deliberately (§13). "Not set" and "zero" are different
 * answers and only one of them is true of a traveler who never touched the control — leaving Kids
 * unset is how "no kids stated" is said, and `trips.kids` then stays NULL, which is exactly what
 * migration 241's de-masking exists to preserve. A stored 0 would claim they answered "none".
 */
function stepDown(raw: string): string {
  if (raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  return n <= 1 ? "" : String(n - 1);
}
/**
 * A plan day as the Day cell reads it — "Fri, Oct 2", the same words the artboards use and the
 * same words the slip's event meta line uses. Parsed with `parseTripDate` so a bare "YYYY-MM-DD"
 * lands on LOCAL midnight: `new Date()` would render the previous day west of UTC (F-1). An
 * unparseable value renders as itself rather than as a fabricated date.
 */
function dayLabel(ymd: string): string {
  const date = parseTripDate(ymd);
  return date ? format(date, "EEE, MMM d") : ymd;
}

function stepUp(raw: string): string {
  if (raw === "") return "1";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "1";
  // The ceiling is stated ONCE, in `plan-vocabulary.ts`, and shared with the typed input beside
  // this stepper — two controls on one state must not carry two different maxima (§18 rule 1).
  return String(Math.min(MAX_PARTY_COUNT, n + 1));
}

export function PlanModal({
  open,
  onOpenChange,
  source = null,
  branches,
  authoring = false,
  continueHref = null,
  continueLabel = null,
  onContinue,
  mintPlan,
  onFinish,
}: PlanModalProps) {
  const [ctx] = useTripContext();
  const [title, setTitle] = useState("");
  /**
   * THE PLAN'S STOPS, and the destination field with them: index 0 IS the destination (the
   * position-0 mirror of `trip_destinations` — Locked Decision 34), so `destination` below is a
   * DERIVED view of `stops[0].name` rather than a second piece of state. One list, one source of
   * truth; the alternative — a `destination` string beside a separate tail list — is two authors
   * of the same fact, which is how the field and the first row come to disagree (§18 rule 1).
   */
  const [stops, setStops] = useState<PlanStop[]>([{ name: "" }]);
  const destination = stops[0]?.name ?? "";
  /**
   * Row 1's writer. A keystroke here is the traveler's OWN text, so it also retires any home-city
   * SUGGESTION sitting in the field — including a clear, which is them saying "not that city".
   * `setDestinationSuggested` is called unconditionally rather than behind a guard because React
   * bails out of a same-value state write anyway, and a guard here would be a second copy of the
   * rule (§18 rule 1).
   */
  const setDestination = (value: string) => {
    setDestinationSuggested(false);
    setStops((prev) => renameStopAt(prev, 0, value));
  };
  /**
   * Has the traveler touched the list in THIS open? Guards the one-shot seed from the plan row
   * below, so a late cache fill can never overwrite stops they are in the middle of typing.
   */
  const [stopsTouched, setStopsTouched] = useState(false);
  /**
   * REPLACE-LIST SAFETY. `PUT /api/trips/:tripId/destinations` deletes whatever it is not sent, so
   * a save must never write a list it could not first READ: a guest 401, a 403, an offline tab
   * would otherwise turn "I could not see your stops" into "you have none". Set only when the
   * plan's own rows have actually been read (or when the trip was minted in this very click, and
   * therefore provably has none yet). A ref, because `commitPlan` reads it outside React's render.
   */
  const stopsReadOk = useRef(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  /**
   * "" = the traveler has not stated a count. Held as STRINGS, not numbers, because the empty
   * state has to be representable: migration 241 de-masked party size so an unanswered question
   * stays NULL. `partyTouched` is what tells a walked-past step apart from a cleared one.
   */
  const [adults, setAdults] = useState("");
  const [kids, setKids] = useState("");
  const [partyTouched, setPartyTouched] = useState(false);
  /**
   * STEP 4's SECOND QUESTION (migration 284). Which of the two is on screen is the occasion row's
   * own answer — see `asksBudgetApprover` / `asksAccessibilityNote`. `""` = the traveler stated
   * nothing, and `variantTouched` is what tells a walked-past step apart from a cleared one, the
   * same distinction `partyTouched` draws for the pair above: `switchTripContext`/the occasion
   * PATCH both write only what the body carried, so an untouched field must send nothing rather
   * than a NULL over a real answer (§13).
   */
  const [budgetApproverName, setBudgetApproverName] = useState("");
  const [budgetApproverEmail, setBudgetApproverEmail] = useState("");
  const [accessibilityNote, setAccessibilityNote] = useState("");
  const [variantTouched, setVariantTouched] = useState(false);
  /**
   * IS ROW 1's CITY A SUGGESTION RATHER THAN AN ANSWER? (§13 — a shown default and a chosen value
   * render identically and must not be the same fact.) Set only when `homeCitySuggestion` filled
   * the empty destination field from the signed-in member's `users.home_city`, and cleared the
   * moment the traveler either EDITS the field (it is now their text) or moves FORWARD past step 2
   * (they read it and kept it). While it is set, the save treats the destination as unstated: a
   * city nobody confirmed must not land on the plan looking like one they named.
   */
  const [destinationSuggested, setDestinationSuggested] = useState(false);
  /** The home-city suggestion is offered at most ONCE per open — see the effect that sets it. */
  const homeCitySeeded = useRef(false);
  /** "" = nothing chosen. Never seeded with a placeholder occasion. */
  const [occasionSlug, setOccasionSlug] = useState("");
  /** "HH:MM" for the main moment. "" = never given — an anchor is not written. */
  const [mainMomentTime, setMainMomentTime] = useState("");
  /** "YYYY-MM-DD" for the main moment of a RANGE-shaped occasion. "" = never given (§13). */
  const [mainMomentDate, setMainMomentDate] = useState("");
  /**
   * Step-5 ROWS — the ratified table (Event · Day · Time · Place), one per ticked chip. Each
   * becomes ONE event (a `user_experiences` row). Ledger `2026-09-04-event-time-ui`: this was a
   * bare `string[]` of chip labels until migration 282 gave an event a `start_time`, which is why
   * the artboards' Day/Time/Place columns shipped unbuilt. A row's day/time/place stay ABSENT
   * until the traveler answers them (§13) — the plan's own day and destination are shown as
   * PLACEHOLDERS and inherited only at create.
   */
  const [pickedEvents, setPickedEvents] = useState<PlanEventDraft[]>([]);
  /** The "Something else" free-text chip — an occasion's presets can never cover everything. */
  const [customEvent, setCustomEvent] = useState("");
  /** Has the "Something else" chip been pressed in this open? It reveals the field (re-audit A8). */
  const [customOpen, setCustomOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [step, setStep] = useState<PlanStepId>("occasion");
  /** The start step is resolved ONCE per open, and only once the catalog has answered. */
  const startResolved = useRef(false);

  // The ONE runtime occasion vocabulary. Same query key IntakePanel and the Trip Strip use, so the
  // cache is shared and no two doors can offer different occasions.
  const { data: occasions, isLoading: occasionsLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: open,
  });

  /**
   * The city THIS DOOR names, if it names one. Hoisted out of the open-effect because the stop
   * list is seeded twice — once from the context on open, once from the plan's own rows when they
   * arrive — and the door's answer has to win row 1 in both, from one derivation (§18 rule 1).
   */
  const doorDestination = useMemo(
    () =>
      source?.destination ||
      (source?.city ? [source.city, source.country].filter(Boolean).join(", ") : ""),
    [source],
  );

  /**
   * SEED THE FORM FROM A CONTEXT SNAPSHOT — the ONE implementation, two callers (§18 rule 1):
   * the open effect below (seeding from the live context), and "Clear plan" (seeding from an
   * EMPTY context, which is what makes a cleared plan actually disappear from the form rather
   * than merely from the store — post-publish QA check 4). A second copy of "what does an empty
   * plan look like on this form?" is exactly how the modal came to re-render a plan the traveler
   * had just deleted.
   */
  // `ctx` deliberately SHADOWS the component's live context here: every line below reads the
  // snapshot it was handed, and a stray read of the live one is exactly the mistake this
  // parameter exists to prevent.
  const seedFormFrom = (ctx: TripContext, sourceDestination: string) => {
    startResolved.current = false;
    setFinishError(null);
    setStep("occasion");
    setTitle(ctx.title || "");
    /**
     * The stop list, seeded from what the context already holds: the pre-trip pen (`ctx.stops`)
     * when there is one, otherwise the single `ctx.destination` — the §13 fallback, stated once in
     * `seedStops` and never re-derived here. A door that NAMES a city then overrides row 1, exactly
     * as it always overrode the destination field, because a door naming a city is describing the
     * plan the traveler just asked for. A bound plan's OWN rows arrive in the effect below and
     * replace this seed — they are the truth once one exists.
     */
    const seeded = seedStops(ctx.destination, ctx.stops);
    setStops(sourceDestination ? renameStopAt(seeded, 0, sourceDestination) : seeded);
    setStopsTouched(false);
    stopsReadOk.current = false;
    setStartDate(ctx.startDate || "");
    setEndDate(ctx.endDate || "");
    // A real stored count seeds a stepper; NO stored count leaves it EMPTY. Never a default of 2 —
    // a number the traveler never typed must not become one they appear to have stated. `travelers`
    // deliberately does NOT seed `adults`: splitting one number into "N adults, 0 kids" would
    // invent a composition nobody gave (§13). It is preserved on save instead, see `commitPlan`.
    setAdults(typeof ctx.adults === "number" && ctx.adults > 0 ? String(ctx.adults) : "");
    setKids(typeof ctx.kids === "number" && ctx.kids > 0 ? String(ctx.kids) : "");
    setPartyTouched(false);
    // Step 4's second question, seeded from the pen exactly like the party pair. `null` is the pen's
    // CLEARED marker and reads back as "" — the same empty the traveler left, never a stale value.
    setBudgetApproverName(ctx.budgetApproverName || "");
    setBudgetApproverEmail(ctx.budgetApproverEmail || "");
    setAccessibilityNote(ctx.accessibilityNote || "");
    setVariantTouched(false);
    setDestinationSuggested(false);
    homeCitySeeded.current = false;
    setMainMomentTime(ctx.mainMomentTime || "");
    setMainMomentDate(ctx.mainMomentDate || "");
    // Reads BOTH pen spellings — the rich rows this release writes and the legacy bare titles a
    // pen written before it still holds — through the ONE shared reader, so nothing a traveler
    // ticked before the deploy is dropped on the floor.
    setPickedEvents(readPendingEvents(ctx));
    setCustomEvent("");
    setCustomOpen(false);
  };

  // Seed the form from the live context each time the modal opens, then let the door's own source
  // pre-fill over it — a door that names a city is describing the plan the traveler just asked for.
  useEffect(() => {
    if (!open) return;
    seedFormFrom(ctx, doorDestination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * THE DOOR TABLE, applied. The occasion can only resolve once the vocabulary has loaded, so the
   * start step resolves with it — the door's own answer first (`source`), then whatever the plan
   * already holds. A door naming an occasion the catalog does not carry resolves to NO row, and
   * `resolvePlanSteps` then opens at step 1: the question is asked rather than skipped under a
   * pill nothing could fill (§13). Runs once per open (`startResolved`), so a traveler who has
   * already navigated is never yanked back by a late cache fill.
   */
  const doorOccasion = useMemo(() => {
    if (!occasions) return null;
    const keys = [
      source?.experienceSlug,
      source?.experienceType,
      ctx.experienceSlug,
      ctx.experienceType,
    ];
    for (const key of keys) {
      const row = findOccasionByKey(occasions, key);
      if (row) return row;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occasions, source, ctx.experienceSlug, ctx.experienceType]);

  useEffect(() => {
    if (!open || !occasions || startResolved.current) return;
    startResolved.current = true;
    setOccasionSlug(doorOccasion ? doorOccasion.slug : "");
    setStep(
      resolvePlanSteps(
        source,
        doorOccasion,
        { experienceSlug: ctx.experienceSlug, experienceType: ctx.experienceType },
      ).startStep,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, occasions, doorOccasion]);

  const selectedOccasion = useMemo(
    () => (occasions ?? []).find((t) => t.slug === occasionSlug) ?? null,
    [occasions, occasionSlug],
  );

  // ── The switch readers. One call each; the fallbacks are stated where they are defined. ──────
  const shape = durationShape(selectedOccasion);
  const wantsSchedule = showsSchedule(selectedOccasion);
  const hasGuestList = guestListSetting(selectedOccasion);
  const noun = partyNoun(selectedOccasion?.vocabulary, hasGuestList);
  /** Step 2's shape. NULL / not set ⇒ "one", the single field — see `stopsShape` for why. */
  const stopsMany = stopsShape(selectedOccasion) === "many";
  /**
   * Step 4's SECOND question — which one, if either, this occasion asks (migration 284). Both
   * predicates live in `plan-steps.ts`; nothing here re-derives them.
   */
  const wantsBudgetApprover = asksBudgetApprover(selectedOccasion);
  const wantsAccessibilityNote = asksAccessibilityNote(selectedOccasion);
  /**
   * THE RE-AUDIT PREDICATES (ledger `2026-09-04-reaudit-fixes`). Each is called ONCE here and
   * never re-derived in the JSX below — the same posture every other switch reader takes.
   *
   * `wantsKids` is load-bearing beyond the render: a step that was never SHOWN states nothing, so
   * the save must not fold a kids count collected under a previously-chosen occasion into a party
   * whose step 4 asked for one number (§13).
   */
  const wantsKids = asksKidsCount(selectedOccasion);
  const wantsMainMoment = showsMainMoment(selectedOccasion);
  const guestCopy = guestListCopy(selectedOccasion);
  /** Step 4's steppers, built from the occasion's noun. Resolved once; the JSX only maps it. */
  const partyStepperFields = partyFields(selectedOccasion);

  /**
   * THE SIGNED-IN MEMBER'S HOME CITY. Read from the payload the client ALREADY fetches — `useAuth`
   * → `GET /api/auth/user`, whose `sanitizeUser` strips only the password and the Instagram token,
   * so `users.home_city` is already on the wire. No new route and no second read (§18 rule 1); a
   * guest simply has no user and therefore no suggestion.
   */
  const { user } = useAuth();
  const homeCity = (user as { homeCity?: string | null } | null | undefined)?.homeCity ?? "";

  /**
   * IS STEP 3's "your own city, one evening" CAPTION TRUE HERE? (re-audit A3.) The predicate lives
   * in `plan-steps.ts` and reads the SAME `homeCity` the step-2 suggestion does, so the caption
   * and the suggestion can never disagree about which city is "own" (§18 rule 1).
   */
  const showsOwnCityCaption = showsHomeCityDayCaption({
    occasion: selectedOccasion,
    homeCity,
    destination,
  });

  /**
   * THE PLAN'S OWN STOPS, when a plan exists. Read only for a `many` occasion, because that is the
   * only shape that writes them back and a replace-list writer must have read what it replaces.
   * The rows are the truth once a trip is bound: they outrank the pre-trip pen, and they carry
   * stops added elsewhere (the location-mismatch dialog's "add this city as a stop") that this
   * modal would otherwise not know about — and would then delete on the next save.
   *
   * A failed read (guest 401, non-owner 403, offline) leaves `data` undefined, `stopsReadOk` false
   * and the save silently skips the stop write. Losing an edit is recoverable; deleting a list we
   * could not see is not (§13).
   */
  const contextTripId = ctx.tripId ?? "";
  const { data: boundTrip } = useQuery<{
    destination?: string | null;
    destinations?: Array<{
      name?: string | null;
      city?: string | null;
      country?: string | null;
      lat?: string | number | null;
      lng?: string | number | null;
    }> | null;
  }>({
    queryKey: ["/api/trips", contextTripId],
    enabled: open && stopsMany && contextTripId !== "",
  });

  useEffect(() => {
    if (!open || !stopsMany || !boundTrip) return;
    const alreadySeeded = stopsReadOk.current;
    // The list has now been READ, whether or not it is safe to overwrite what is on screen —
    // that is what authorizes the save to replace it.
    stopsReadOk.current = true;
    if (alreadySeeded || stopsTouched) return;
    const fromTrip = seedStops(boundTrip.destination, boundTrip.destinations);
    setStops(doorDestination ? renameStopAt(fromTrip, 0, doorDestination) : fromTrip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stopsMany, boundTrip]);

  /**
   * WHAT THIS PLAN STATES ABOUT WHERE IT GOES — the input to step 2's precedence rule, and
   * deliberately NOT the input FIELD (post-publish QA check 4).
   *
   * Three sources, in the order the modal already trusts them: the DOOR's own city (the traveler
   * just asked for it), the BOUND TRIP's row (the truth once a plan exists), then the live trip
   * CONTEXT. A destination that is in none of them is not stated by this plan — a value left in
   * the field by a plan the traveler has since CLEARED is the case that shipped the bug — and the
   * home-city default is then free to fill an empty field (§13).
   */
  const statedDestination = (
    doorDestination ||
    boundTrip?.destination ||
    ctx.destination ||
    ""
  ).trim();

  /**
   * STEP 2's ROW 1, resolved by the ONE precedence function (`resolveStep2Destination`). It reads
   * what the PLAN states, never what the field holds, so neither a cleared plan's leftover city
   * nor the one-commit lag between "the modal re-opened" and "the seed applied" can decide it.
   * `resolveStep2Destination` delegates the day-shaped/home-city half to `homeCitySuggestion` —
   * one implementation of that rule, two readers (§18 rule 1).
   *
   * Only the home-city case is applied here: cases 1 and 3 are already on screen from the seed
   * above, and re-writing them would fight the traveler's own typing. What is written is marked
   * as a SUGGESTION so the save can tell it apart from a city the traveler chose (§13).
   */
  useEffect(() => {
    if (!open || homeCitySeeded.current || stopsTouched) return;
    const resolved = resolveStep2Destination({
      occasion: selectedOccasion,
      statedDestination,
      homeCity,
    });
    if (!resolved.fromHomeCity) return;
    // ONCE PER OPEN. A traveler who CLEARS the suggested city has answered "not that one", and
    // re-offering it on the next render would be the modal arguing with them — the same reason the
    // stop seed is one-shot behind `stopsTouched`.
    homeCitySeeded.current = true;
    setStops((prev) => renameStopAt(prev, 0, resolved.value));
    setDestinationSuggested(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedOccasion, homeCity, statedDestination, stopsTouched]);

  /**
   * The visible steps track the CURRENTLY chosen occasion, not the one the door arrived with —
   * picking a different tile on step 1 has to be able to add or remove step 5. Only the START
   * step is a once-per-open decision.
   */
  const { visibleSteps } = useMemo(
    () =>
      resolvePlanSteps(
        source,
        selectedOccasion,
        { experienceSlug: ctx.experienceSlug, experienceType: ctx.experienceType },
      ),
    [source, selectedOccasion, ctx.experienceSlug, ctx.experienceType],
  );

  // A step that stops being visible (step 5 after switching to an occasion with no schedule) must
  // not strand the traveler on a blank screen.
  useEffect(() => {
    if (!visibleSteps.includes(step)) setStep(visibleSteps[visibleSteps.length - 1]);
  }, [visibleSteps, step]);

  /**
   * Step-5 chips. The occasion's OWN preset anchors, read from the server — the same
   * `TEMPLATE_PRESETS` the wedding presets panel and `generatePresetsForTrip` use, so a chip can
   * never name something the platform does not otherwise know about. An occasion with no presets
   * answers `{ anchors: [] }` and the step renders only the free-text chip, which is honest: the
   * platform has nothing to suggest, not "there is nothing happening".
   */
  const { data: presets } = useQuery<LogisticsPresets>({
    queryKey: ["/api/logistics/presets", occasionSlug],
    enabled: open && wantsSchedule && !!occasionSlug,
  });

  const chipLabels = useMemo(() => {
    const labels = (presets?.anchors ?? [])
      .map((a) => (a.label || "").trim())
      .filter((l) => l.length > 0);
    return Array.from(new Set(labels));
  }, [presets]);

  const toggleChip = (label: string) => setPickedEvents((prev) => toggleEventRow(prev, label));

  /**
   * Turn the confirmed free text into a ROW. Deliberately NOT `toggleEventRow` alone: re-confirming
   * a title that is already a row would UNTICK it, which is the opposite of what pressing Enter
   * means. An already-present title is simply absorbed.
   */
  const commitCustomEvent = () => {
    const title = customEvent.trim();
    if (!title) return;
    setPickedEvents((prev) => (hasEventRow(prev, title) ? prev : toggleEventRow(prev, title)));
    setCustomEvent("");
  };

  /**
   * Everything that would become an event on save — ticked rows plus a typed "something else".
   * ONE derivation, so the CTA's count and what the save actually writes cannot disagree.
   */
  const eventRows = useMemo(
    () => eventsToCreate(pickedEvents, customEvent),
    [pickedEvents, customEvent],
  );
  const eventCount = wantsSchedule ? eventRows.length : 0;

  /**
   * The days an event may be dated to — the PLAN's own days, never a free calendar (an event
   * inside a plan cannot fall outside it). A plan whose range is not yet readable offers none,
   * and the Day cell then simply does not ask (§13).
   */
  const dayOptions = useMemo(
    () => planDayOptions(startDate, shape === "day" ? startDate : endDate),
    [startDate, endDate, shape],
  );
  /** The DEFAULT day, shown as a placeholder and never written until the traveler picks it. */
  const defaultDay = dayOptions[0] ?? "";

  // ── THE SAVE — one implementation, every door ────────────────────────────────────────────────

  /**
   * The single-day / main-moment anchor, written where it BELONGS rather than into a store
   * invented for it.
   *
   * A time the plan has to be built around is a `temporal_anchors` row — the optimizer, the
   * schedule validator and the energy budget all read that table, and `SlipLogisticsSection`
   * already surfaces it. So when a trip row exists the moment goes there, through the existing
   * owner-gated routes; nothing new is created. It is re-found by its `description` marker so a
   * second save UPDATES the moment instead of stacking a duplicate anchor beside it.
   *
   * Best-effort by design: this runs after the context write, and a 4xx (guest, non-owner, a
   * revoked advisor) leaves the context save standing rather than failing the whole modal.
   */
  /**
   * The titles this plan's events already carry, or NULL when they could not be read (ledger
   * `2026-09-06-event-mint-dedupe`).
   *
   * NULL AND [] ARE DIFFERENT ANSWERS (§13): `[]` is "this plan holds no events", which authorizes
   * creating all of them; `null` is "we could not tell", which authorizes nothing and leaves the
   * create exactly as it behaved before this lane. The list route answers the caller's OWN
   * experiences, so it is filtered to this trip here rather than trusting every row it returns.
   *
   * Safe to read straight after a mint: `storage.createTrip` AWAITS the pen drain before it
   * answers, so anything the drain wrote is already visible by the time the mint resolves.
   */
  async function readExistingEventTitles(tripId: string): Promise<string[] | null> {
    try {
      const res = await apiRequest("GET", "/api/user-experiences");
      const rows: Array<{ tripId?: string | null; title?: string | null }> = await res.json();
      if (!Array.isArray(rows)) return null;
      return rows
        .filter((r) => r?.tripId === tripId)
        .map((r) => (typeof r?.title === "string" ? r.title : ""))
        .filter((t) => t.length > 0);
    } catch {
      return null;
    }
  }

  async function writeMainMomentAnchor(tripId: string, dateYmd: string, time: string) {
    // Local wall-clock → instant, the same conversion TemporalAnchorManager does on its
    // `datetime-local` input. The traveler typed a time in their own day, not in UTC.
    const at = new Date(`${dateYmd}T${time}:00`);
    if (isNaN(at.getTime())) return;
    const iso = at.toISOString();
    let existingId: string | undefined;
    try {
      const res = await apiRequest("GET", `/api/trips/${tripId}/anchors`);
      const rows: Array<{ id: string; anchorType?: string; description?: string | null }> =
        await res.json();
      existingId = rows.find(
        (a) => a.anchorType === "custom" && a.description === MAIN_MOMENT_DESCRIPTION,
      )?.id;
    } catch {
      // Could not read the existing anchors — fall through to a create. Worst case is a second
      // anchor the traveler can delete, which beats silently dropping the time they gave us.
    }
    if (existingId) {
      await apiRequest("PUT", `/api/anchors/${existingId}`, { anchorDatetime: iso });
    } else {
      await apiRequest("POST", `/api/trips/${tripId}/anchors`, {
        anchorType: "custom",
        anchorDatetime: iso,
        description: MAIN_MOMENT_DESCRIPTION,
        // The main moment is the fixed point the rest of the day is arranged around — that is
        // what "immovable" means to the schedule validator, and it is the whole reason a
        // scheduled occasion asks for a time at all.
        isImmovable: true,
      });
    }
  }

  /**
   * Everything the modal collected, written once.
   *
   * @param boundTripId the plan row these writes bind to. Undefined ⇒ no plan exists yet and the
   *                    two switch-driven answers are HELD in the pre-trip pen instead.
   * @returns the trip id the commit actually bound to (undefined when it held).
   */
  async function commitPlan(boundTripId?: string): Promise<string | undefined> {
    const start = startDate || undefined;
    let end = endDate || undefined;
    if (shape === "day") {
      // ONE date: the plan starts and ends on it. `default_duration = "day"` is the occasion
      // saying it happens on a day, not across a range — so the end date is not a second question.
      end = start;
    } else if (start && end && new Date(end) < new Date(start)) {
      end = start;
    }
    /**
     * §13 — A SUGGESTION IS NOT AN ANSWER. While `destinationSuggested` stands, row 1 holds the
     * signed-in member's home city because the modal PUT it there, not because the traveler chose
     * it, so the save states nothing: the field reads as empty here exactly as it would have if
     * nothing had been suggested. It can only still be set on a Save from step 1 or 2 — moving
     * forward past step 2 confirms it (see `goToStep`) — and the finish is only reachable from the
     * last step, so a mint never carries an unconfirmed city.
     */
    const trimmedDestination = destinationSuggested ? undefined : destination.trim() || undefined;

    // Read fresh (not the `ctx` React-state snapshot from when the modal opened) —
    // this is the ground truth to compare the edited destination against.
    const liveCtx = getTripContext();
    const destinationChanged = (liveCtx.destination || "") !== (trimmedDestination || "");
    // A freshly minted trip is the plan being described, so it survives a destination change by
    // construction. Otherwise the panel's long-standing policy stands: editing the DESTINATION
    // means the traveler is describing a DIFFERENT trip than the one `tripId` points at, so the
    // stale identity is cleared in the SAME atomic write (money-adjacent — downstream
    // optimize/payment requests derive the target trip from `tripId`).
    const tripId =
      boundTripId ?? (liveCtx.tripId && !destinationChanged ? liveCtx.tripId : undefined);

    /**
     * THE PARTY, derived and never re-masked. `partyTotal` is the one place adults+kids becomes
     * the `travelers` count the Trip Strip's chip reads, so the chip and the columns cannot
     * disagree. A party the traveler never touched preserves whatever the plan already carried —
     * `switchTripContext` has REPLACE semantics, so omitting the field would CLEAR a real stated
     * count just because someone walked past step 4.
     */
    /**
     * A QUESTION THAT WAS NOT ASKED STATES NOTHING (§13; re-audit A4). Under the `attendees`
     * vocabulary step 4 renders ONE stepper and the Kids field is omitted, so whatever `kids`
     * holds — a value typed under an occasion the traveler has since changed away from — is not
     * this plan's answer and must not reach the total, the pen or the row. Resolved once, here,
     * so every write below reads the same fact.
     */
    const kidsStated = wantsKids ? kids : "";
    const partyAnswered = partyTouched || adults !== "" || kidsStated !== "";
    const travelers = partyAnswered ? partyTotal(adults, kidsStated) : liveCtx.travelers;
    /**
     * The same "walked past vs cleared" test for step 4's SECOND question (migration 284). A
     * traveler who never touched the field states nothing at all, so nothing is sent and whatever
     * the plan already carried survives — the occasion PATCH writes only keys the body carries, so
     * an omitted field is never a NULL over a real answer (§13).
     */
    const variantAnswered =
      variantTouched ||
      budgetApproverName !== "" ||
      budgetApproverEmail !== "" ||
      accessibilityNote !== "";

    switchTripContext({
      title: title.trim() || undefined,
      destination: trimmedDestination,
      startDate: start,
      endDate: end,
      travelers,
      // No occasion chosen ⇒ keep whatever was stored. switchTripContext has REPLACE semantics
      // for this field, so omitting it would silently CLEAR an occasion the modal never asked
      // the traveler to clear.
      experienceType: selectedOccasion?.name ?? liveCtx.experienceType,
      tripId,
    });

    /**
     * Fields outside SWITCH_FIELDS need their own merge write. The two party fields ride here for
     * the same reason `eventType` does, and only when the step was actually answered.
     *
     * `0` IS THE CLEARED MARKER **in this jsonb blob only**, and it is written rather than left
     * stale because `updateTripContext` MERGES: it skips `undefined`, so there is no way to delete
     * a key, and a traveler who steps a field back to "not set" would otherwise reopen the modal
     * to the number they just removed. Nothing reads 0 as a count — the seed above requires `> 0`,
     * and `partyTotal` treats it as not-stated — and the TRIP ROW is written `null`, never 0, so
     * the de-masked columns stay honestly NULL (§13).
     */
    if (partyAnswered) {
      updateTripContext({
        adults: travelersForSave(adults) ?? 0,
        kids: travelersForSave(kidsStated) ?? 0,
      });
    }
    /**
     * Step 4's SECOND question rides the same merge write, on the same terms (migration 284).
     * `null` is this blob's CLEARED marker for a string exactly as `0` is for the counts above:
     * `updateTripContext` merges and cannot delete a key, so a field the traveler emptied has to be
     * written back as an explicit nothing or they would reopen the modal to the text they just
     * removed. Every reader — the seed above, the trip-row write below — treats `null` and absent
     * the same, and the ROW is written NULL either way (§13).
     *
     * ONLY WHAT THE OCCASION ACTUALLY ASKED IS SENT. `wantsBudgetApprover` / `wantsAccessibilityNote`
     * gate the two halves separately, so switching from a corporate occasion to a wedding mid-flow
     * cannot carry the approver's name onto a plan whose step 4 never showed that field.
     */
    if (variantAnswered) {
      const held: Record<string, string | null> = {};
      if (wantsBudgetApprover) {
        held.budgetApproverName = budgetApproverName.trim() || null;
        held.budgetApproverEmail = budgetApproverEmail.trim() || null;
      }
      if (wantsAccessibilityNote) held.accessibilityNote = accessibilityNote.trim() || null;
      if (Object.keys(held).length > 0) updateTripContext(held);
    }
    if (selectedOccasion) {
      updateTripContext({
        experienceSlug: selectedOccasion.slug,
        eventType: eventTypeForSlug(selectedOccasion.slug),
      });
    }

    /**
     * …and the trip ROW, which is what the wedding tooling actually reads (`trips.event_type`)
     * and what the demand rollup counts (`trips.adults` / `trips.kids`). ONE owner-gated,
     * §19-allowlisted route carries both; a party or an occasion the traveler did not state is
     * simply not sent. Best-effort: a guest (no session) or a non-owner gets a 4xx and the
     * context write above still stands.
     */
    if (tripId) {
      const body: Record<string, unknown> = {};
      if (selectedOccasion) body.eventType = eventTypeForSlug(selectedOccasion.slug);
      if (partyAnswered) {
        // NULL, never 0: an unanswered party is not a party of none.
        body.adults = travelersForSave(adults) ?? null;
        body.kids = travelersForSave(kidsStated) ?? null;
      }
      /**
       * Step 4's SECOND question, on the SAME route and the same allowlist (migration 284, ledger
       * `2026-09-04-step4-variants-fields`). This is how these three columns reach the trip row at
       * MINT as well as on an edit: the finish mints through `mintTripSlip` — whose body cannot
       * carry them, `insertTripSchema` omits all three — and then re-enters `commitPlan` with the
       * new id, exactly as `adults`/`kids` already do. ONE implementation, one rail.
       *
       * A key is sent ONLY when the occasion asked it and the traveler answered; NULL is how an
       * emptied answer is taken back, and an absent key is a question that was never put (§13).
       */
      if (variantAnswered && wantsBudgetApprover) {
        body.budgetApproverName = budgetApproverName.trim() || null;
        body.budgetApproverEmail = budgetApproverEmail.trim() || null;
      }
      if (variantAnswered && wantsAccessibilityNote) {
        body.accessibilityNote = accessibilityNote.trim() || null;
      }
      if (Object.keys(body).length > 0) {
        void apiRequest("PATCH", `/api/trips/${tripId}/occasion`, body).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[plan-modal] plan details not persisted to the trip row:", err?.message);
        });
      }
    }

    // ── The two switch-driven writes. Both need a trip row; both hold honestly without one. ─────
    // The moment's DATE is the single date for a day-shaped occasion and its own answer for a
    // range-shaped one (the ratified Step3When card). Neither is invented: with no date and no
    // time there is no anchor to write (§13).
    // The main moment is written only for an occasion that HAS one (`showsMainMoment`, re-audit
    // A15 / the re-audit's B4). A golf trip's fixed points are its four rounds, and an unnamed
    // "The main moment" anchor beside them is a claim about the plan nobody made — the optimizer
    // and the schedule validator both read that row, so this is a data consequence, not a pixel
    // one. An occasion that does not ask the question also never renders the inputs, so this
    // guard only matters when the traveler answered under one occasion and switched to another.
    const momentDate = wantsMainMoment ? (shape === "day" ? start || "" : mainMomentDate.trim()) : "";
    const momentTime = wantsMainMoment ? mainMomentTime.trim() : "";
    const rowsToCreate = wantsSchedule ? eventRows : [];
    if (tripId && ((momentDate && momentTime) || rowsToCreate.length > 0)) {
      setSaving(true);
      try {
        if (momentDate && momentTime) {
          await writeMainMomentAnchor(tripId, momentDate, momentTime).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[plan-modal] main moment not saved as an anchor:", err?.message);
          });
        }
        /**
         * ONE event per ticked row, AND ONLY WHAT THE PLAN DOES NOT ALREADY CARRY (ledger
         * `2026-09-06-event-mint-dedupe`). An event inside a plan IS a `user_experiences` row bound
         * to the trip (Locked Decision 29) — there is no second event artifact, and this posts to
         * the SAME owner-scoped, allowlist-bodied route the slip's "set up guest list" already
         * uses. `startTime` rides the SAME pick-based allowlist (`userExperienceBodySchema`),
         * narrowed by the one format authority `userExperienceStartTimeSchema` (migration 282,
         * Locked Decision 35) — no second admission rail was opened for it.
         *
         * THE FILTER IS THE SECOND LAYER, not the fix. The fix is that the finish RELEASES its own
         * pre-trip pen before it mints, so the server-side drain never writes these rows in the
         * first place (Locked Decision 30 (b); the pen and the modal both wrote them, and a plan
         * came back holding "Ceremony, Reception, Ceremony, Reception"). This layer catches what
         * ordering cannot: a release the server never confirmed, a pen left by another session,
         * and a traveler who finishes or saves twice. It is the SAME `eventsNotYetOnPlan` the
         * drain and the slip's "Organize into events" call — one authority (§18 rule 1).
         *
         * §13 — AN UNREADABLE PLAN IS NOT AN EMPTY ONE. When the read fails we do not know what
         * the plan holds, so `existingTitles` is null and every row is created exactly as before
         * this lane: creating a duplicate the traveler can delete beats silently dropping an event
         * they asked for, and the release above has already made the duplicate unlikely.
         */
        const existingTitles =
          rowsToCreate.length > 0 ? await readExistingEventTitles(tripId) : null;
        const eventsToWrite = existingTitles
          ? eventsNotYetCreated(rowsToCreate, existingTitles)
          : rowsToCreate;
        for (const row of eventsToWrite) {
          // The ONE inheritance rule, shared with the pre-trip pen drain: a day or place the
          // traveler answered is kept, one they did not is the PLAN's own (§18 rule 1 — a second
          // copy here is how the two doors would start disagreeing). The TIME has no fallback:
          // absent stays null, never midnight and never "all day" (§13).
          const values = planEventRowValues(row, { startDate: start, destination: trimmedDestination });
          await apiRequest("POST", "/api/user-experiences", {
            tripId,
            title: values.title,
            eventDate: values.eventDate,
            startTime: values.startTime,
            location: values.location,
            experienceTypeId: selectedOccasion?.id,
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`[plan-modal] event "${values.title}" not created:`, err?.message);
          });
        }
        // They exist as rows now; the pre-trip holding pen must not replay them on the next save.
        // BOTH spellings are emptied: the legacy list is read for one release, so a stale one left
        // behind here would be drained again at the next mint.
        updateTripContext({
          pendingEvents: [],
          pendingEventTitles: [],
          mainMomentTime: undefined,
          mainMomentDate: undefined,
        });
      } finally {
        setSaving(false);
      }
    } else {
      /**
       * NO TRIP ROW YET — hold, and be honest about it.
       *
       * The modal runs long before a trip exists (the strip's Edit button on a marketing page, the
       * cart header, the hero). What is held here IS drained at mint by
       * `server/services/pending-events.service.ts` (Locked Decision 30 (b)) for every
       * traveler-owned mint door — including this modal's own "Build it myself" finish, which
       * mints through `mintTripSlip` and then re-commits against the new id below, so the events
       * land as rows in the same click rather than racing the context push.
       */
      updateTripContext({
        mainMomentTime: momentTime || undefined,
        mainMomentDate: shape === "day" ? undefined : momentDate || undefined,
        // The rich shape from this release on; the legacy list is emptied in the same write so a
        // pen written before the deploy cannot drain twice, once through each key.
        pendingEvents: rowsToCreate,
        pendingEventTitles: [],
      });
    }

    /**
     * ── THE STOPS (ledger `2026-09-04-plan-stops-ui`) ────────────────────────────────────────
     * Written HERE, in the one save, through the one client writer — the same
     * `savePlanStops` the location-mismatch dialog's "add this city as a stop" calls. A second
     * writer is the derivation-drift class §18 rule 1 names, and these two are the kind that
     * would drift: only one of them is exercised on any given click.
     *
     * ONLY UNDER `many`. A single-stop occasion never asked the stop question, so it states no
     * answer: `trip_destinations` stays honestly NOT CAPTURED with `trips.destination` as the
     * plan's one city (§13). It also means a stop added from the mismatch dialog survives a later
     * save under a single-stop occasion instead of being silently replaced away.
     *
     * ONLY WHEN THE LIST COULD BE REPLACED SAFELY. The `boundTripId` PARAMETER present ⇒ the trip
     * was minted in this very click and provably has no rows yet; otherwise the plan's own rows
     * must have been READ first (`stopsReadOk`), because the route is a replace-list and sending a
     * list we could not see would delete stops the traveler never asked to lose.
     *
     * Best-effort and awaited, like the anchor and the events above: a refusal is logged and the
     * rest of the save stands.
     */
    if (stopsMany) {
      const canReplaceStops = !tripId || !!boundTripId || stopsReadOk.current;
      if (canReplaceStops) {
        const result = await savePlanStops(tripId, stops);
        if (!result.ok && result.reason === "request_failed") {
          // eslint-disable-next-line no-console
          console.warn("[plan-modal] stops not saved:", result.message);
        }
      }
    }

    /**
     * ── THE CACHE THIS SAVE LEAVES BEHIND (ledger `2026-09-05-slip-events-first-render`) ────────
     * Everything above has just changed what the server would answer for this plan, and the very
     * next thing the "Build it myself" finish does is navigate to `/plans/:tripId`. The surfaces
     * there read three keys, and on a fresh account at least one of them is already in cache with
     * a PRE-PLAN answer: the dashboard fetches `/api/user-experiences` (as `[]`) before any plan
     * exists, nothing invalidated it, and the slip therefore mounted believing the plan had zero
     * events — and offered to organize into events it had just created. Invalidating here is the
     * ONE place that covers BOTH authors of those events: the rows this function POSTs when a trip
     * row already exists, and the server-side pre-trip pen drain that writes them at mint
     * (`server/services/pending-events.service.ts`, Locked Decision 30 (b)), which the client never
     * sees happen at all.
     *
     * It runs at the END of the commit, after every awaited write, so a refetch it triggers reads
     * the finished plan rather than a half-written one. The `PATCH .../occasion` above is
     * deliberately fire-and-forget, so its own effect on `trips` may land after this — that is
     * unchanged behaviour and is why this is not treated as a read-your-writes guarantee.
     * Best-effort like every other write here: a failed invalidation is a stale cache, never a
     * failed save.
     */
    if (tripId) {
      void queryClient.invalidateQueries({ queryKey: ["/api/user-experiences"] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/guests`] });
    }
    return tripId;
  }

  const committedPlan = (tripId?: string): CommittedPlan => ({
    tripId,
    destination: destination.trim() || undefined,
    startDate: startDate || undefined,
    endDate: (shape === "day" ? startDate : endDate) || undefined,
    travelers: partyTotal(adults, kids),
    occasionSlug: selectedOccasion?.slug,
    occasionName: selectedOccasion?.name,
  });

  /** "Save" — commit and close, without choosing a way to build. Every door keeps this. */
  const save = async () => {
    if (saving) return;
    await commitPlan();
    onOpenChange(false);
  };

  /**
   * THE FINISH. Commit first, then run the branch — so whichever surface the traveler lands on is
   * reading the plan they just described, not the one they had before they opened the modal.
   * "Build it myself" is the only branch that needs a plan ROW, so it is the only one that mints,
   * and it mints through the opener's one mint door (`mintTripSlip`), never a body built here.
   */
  const finish = async (branch: PlanningBranch) => {
    if (saving) return;
    setFinishError(null);
    setSaving(true);
    try {
      let bound: string | undefined;
      if (branch === "myself" && !getTripContext().tripId && mintPlan) {
        /**
         * THE MODAL IS THE AUTHOR OF THE EVENTS IT COLLECTED, so it takes its own pen off the
         * table before the mint (ledger `2026-09-06-event-mint-dedupe`, CLAUDE.md Locked
         * Decision 30 (b)). `storage.createTrip` awaits the server-side pen drain, and the rows
         * on screen were SEEDED from that same pen — so without this, every ticked event is
         * created twice in one click: once by the drain, once by `commitPlan` below.
         *
         * The modal wins the authorship because it holds what the drain can only guess at: the
         * occasion resolved on screen (the drain creates NOTHING when a stored slug does not
         * resolve — its rule 5), and an untick the pen still remembers. The pen keeps its whole
         * job for every other mint door and for a pen this modal never comes back for.
         *
         * AWAITED, and its answer is deliberately NOT branched on: a release the server did not
         * confirm leaves `commitPlan`'s idempotency filter to do exactly what it is there for.
         */
        await releasePendingEventsPen();
        const outcome = await mintPlan({
          destination: destination.trim(),
          startDate,
          endDate: shape === "day" ? startDate : endDate,
          title: title.trim() || undefined,
        });
        if (!outcome.ok) {
          // A refusal with no message means the opener already took the screen (sign-in).
          if (outcome.message) setFinishError(outcome.message);
          return;
        }
        bound = outcome.tripId;
      }
      const tripId = await commitPlan(bound);
      onFinish?.(branch, committedPlan(tripId));
    } finally {
      setSaving(false);
    }
  };

  /**
   * "CLEAR PLAN" — the plan goes away everywhere it is held (post-publish QA check 4).
   *
   * THE DEFECT THIS CLOSES: this was `clearTripContext(); onOpenChange(false);`, and BOTH halves
   * were short. `clearTripContext` emptied one sessionStorage key while the server row, an armed
   * debounced push, an in-flight hydrate and the per-slug `searchSettings_<slug>` mirrors all
   * still held the plan and put it back (that module now closes all four). And this component
   * kept its OWN copy: `PlanModal` is mounted permanently by `PlanningProvider` (it is the `open`
   * prop that toggles), so every field the traveler had filled survived the close and was still
   * on screen at the next open — which is how a cleared Kyoto plan came back with its dates and
   * its title intact.
   *
   * So the form is re-seeded from an EMPTY context through the same `seedFormFrom` the open
   * effect uses (§18 rule 1 — one description of what an empty plan looks like), and the occasion
   * is reset with it: `seedFormFrom` does not own `occasionSlug` (the door table sets it, once
   * per open), and leaving it would put a cleared plan back under its old occasion's pill.
   *
   * The two cached READS this modal makes are dropped as well — the bound trip's own row, which
   * the stop seeding reads, and the context endpoint, which nothing caches today but which a
   * later reader would inherit stale. The TRIP ITSELF is not deleted: clearing the planning
   * context is not destroying the traveler's trip (§13 — they are different acts).
   */
  const clearAll = () => {
    const clearedTripId = contextTripId;
    clearTripContext();
    queryClient.removeQueries({ queryKey: ["/api/trip-context"] });
    if (clearedTripId) queryClient.removeQueries({ queryKey: ["/api/trips", clearedTripId] });
    seedFormFrom({}, "");
    setOccasionSlug("");
    onOpenChange(false);
  };

  // ── Presentation ─────────────────────────────────────────────────────────────────────────────

  const isLastStep = nextPlanStep(visibleSteps, step) === null;
  const back = previousPlanStep(visibleSteps, step);
  const next = nextPlanStep(visibleSteps, step);

  /**
   * THE ONE NAVIGATION DOOR — the rail, Back, Next and the occasion pill all go through it, so the
   * "a suggestion becomes an answer when you move past it" rule is written once (§18 rule 1).
   *
   * MOVING FORWARD PAST STEP 2 CONFIRMS a home-city suggestion: the traveler saw the filled field,
   * chose not to change it, and advanced — that is a choice. Moving BACK does not: someone stepping
   * back to the occasion tiles has not agreed to anything, and the field stays a suggestion until
   * they come through it again. §13's whole point here is that the two must stay distinguishable
   * right up to the moment the traveler makes one of them true.
   */
  const goToStep = (target: PlanStepId) => {
    const from = visibleSteps.indexOf(step);
    const to = visibleSteps.indexOf(target);
    if (step === "where" && to > from) setDestinationSuggested(false);
    setStep(target);
  };
  /** The eyebrow, composed ONLY from what the plan actually holds (§13). */
  const eyebrow = useMemo(() => {
    const city = destination.trim().split(",")[0].trim();
    const occ = selectedOccasion?.name?.toLowerCase();
    const lead = city && occ ? `Your ${city} ${occ}` : city ? `Your ${city} plan` : "Your plan";
    /**
     * THE STOP COUNT (re-audit A14, the ratified `TravelWhen` eyebrow "Your golf trip · 3 stops").
     * Counted from the list the traveler actually named — `namedStops`, the same reader the
     * sequence line uses, never a second count (§18 rule 1) — and shown only under `many` and only
     * above one: the eyebrow's own city IS stop 1, so "1 stop" would be repeating it, and a
     * single-stop occasion never asked the question at all.
     */
    const stopCount = stopsMany ? namedStops(stops).length : 0;
    const segments = [lead];
    if (stopCount > 1) segments.push(`${stopCount} stops`);
    if (startDate) {
      const fmt = (ymd: string) => {
        const d = new Date(`${ymd}T00:00:00`);
        return isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      };
      segments.push(
        endDate && endDate !== startDate ? `${fmt(startDate)} to ${fmt(endDate)}` : fmt(startDate),
      );
    }
    return segments.join(" · ");
  }, [destination, selectedOccasion, startDate, endDate, stopsMany, stops]);

  const stepTitle: Record<PlanStepId, string> = {
    occasion: "What are you planning?",
    // STEP 2's TITLE VARIES BY STOPS SHAPE AND BY NOTHING ELSE (re-audit A13). Under `many` the
    // question really is a different one — an ORDER is being asked for, not a place — and that is
    // a fact the occasion's own `default_stops` column already states. The travel artboards' "Where
    // are you going?" is deliberately NOT built: it would need a per-occasion literal, and an
    // occasion is a row carrying defaults, not a class (Locked Decision 28).
    where: stopsMany ? "Where, in order?" : "Where is it happening?",
    when: "When is it?",
    // The artboard's four variants, in the artboard's own words. AUTHORING is a fourth heading
    // rather than a suffix on the other three: an expert building for a client is answering about
    // someone else's party, and "How many attendees? (for your client)" would be a different
    // sentence pretending to be the same one.
    who: authoring
      ? "Who is traveling with your client?"
      : noun === "attendees"
        ? "How many attendees?"
        : noun === "guests"
          ? "Who is coming?"
          : "Who is traveling with you?",
    events: "What's happening?",
  };

  const stepNote: Record<PlanStepId, string> = {
    occasion: "Pick one to continue.",
    // The mismatch confirm compares a listing against EVERY city the plan names (ledger
    // `2026-09-04-plan-stops-ui`), so the note says "these cities" exactly when the plan can have
    // several — it never promises a check narrower or wider than the one that actually runs.
    where: stopsMany
      ? "A vendor outside the cities you list is flagged when you add it to the plan."
      : "A vendor outside this city is flagged when you add it to the plan.",
    when:
      shape === "day"
        ? "Occasions that last a day ask for a date and a time, never a range."
        : "A travel-class plan asks only for the two days.",
    /**
     * STEP 4's NOTE BRANCHES BY THE PARTY NOUN (re-audit A5), the same derived value its TITLE and
     * its steppers already branch on — never a per-occasion literal. The `attendees` line is the
     * ratified Step4Variants footnote for that panel; every other noun keeps the de-masking note,
     * which is the one thing true of all of them.
     */
    who: authoring
      ? "You are building this for someone else; the question changes actor, not shape."
      : noun === "attendees"
        ? "Nobody travels on this plan; attendees RSVP. Left untouched, nothing is assumed."
        : noun === "guests"
          ? "This is the booking party, not the guest list. Left untouched, nothing is assumed."
          : "Left untouched, nothing is assumed: a party you never set is saved as not set.",
    events: "Each one becomes its own part of the plan, with its own place and time.",
  };

  const railDot = (state: "done" | "active" | "todo") =>
    state === "done"
      ? { background: "var(--earn-teal-ink)", border: "none" }
      : state === "active"
        ? { background: "var(--earn-card)", border: "2px solid var(--earn-coral-ink)" }
        : { background: "var(--earn-card)", border: "1.5px solid var(--earn-border-dash)" };

  const stepperButton =
    "flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--earn-border)] text-[color:var(--earn-muted)] transition-colors hover:bg-[color:var(--earn-chip)] disabled:opacity-40";

  const finishRow =
    "flex w-full items-start gap-3 rounded-lg border border-[color:var(--earn-border)] bg-[color:var(--earn-card)] px-4 py-3 text-left transition-colors hover:bg-[color:var(--earn-teal-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const finishMeta = { fontFamily: MONO, color: "var(--earn-muted)" } as const;

  const branchCopy: Record<PlanningBranch, { label: string; meta: string }> = {
    myself: { label: "Build it myself", meta: "free · browse and build your own slip" },
    ai: { label: "Plan with AI", meta: "a full draft itinerary from what you just told us" },
    local: { label: "Get a local expert", meta: "experts who live there build it with you" },
    occasion: { label: "For an occasion", meta: "Plus builds a plan before every date you register" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" data-testid="plan-modal">
        <DialogHeader>
          <span
            className="text-[10.5px] font-medium uppercase tracking-[0.14em]"
            style={{ fontFamily: MONO, color: "var(--earn-coral-ink)" }}
            data-testid="plan-modal-eyebrow"
          >
            {eyebrow}
          </span>
          <div className="flex items-start justify-between gap-4">
            <DialogTitle
              className="text-[22px] font-semibold"
              style={{ fontFamily: SERIF, color: "var(--earn-navy)" }}
            >
              {stepTitle[step]}
            </DialogTitle>
            {/* The occasion pill. Shown once an occasion is chosen and step 1 is behind us —
                "change" is the way back to it, which is what makes skipping step 1 reversible. */}
            {selectedOccasion && step !== "occasion" && (
              <button
                type="button"
                onClick={() => goToStep("occasion")}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold"
                style={{
                  background: "var(--earn-teal-wash)",
                  borderColor: "var(--earn-teal-ink)",
                  color: "var(--earn-teal-ink)",
                }}
                data-testid="plan-modal-occasion-pill"
              >
                {selectedOccasion.name}
                <span className="text-[10px] font-normal" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
                  change
                </span>
              </button>
            )}
          </div>
          <DialogDescription className="sr-only">
            Set your plan once — the whole site uses these details while you plan.
          </DialogDescription>
        </DialogHeader>

        {/* The rail. Every VISIBLE step is reachable from it — that is what makes this the same
            modal for a brand-new plan and for an edit of one that already exists. */}
        <div className="flex flex-wrap gap-4" data-testid="plan-step-rail">
          {visibleSteps.map((s, i) => {
            const activeIndex = visibleSteps.indexOf(step);
            const state = s === step ? "active" : i < activeIndex ? "done" : "todo";
            return (
              <button
                key={s}
                type="button"
                onClick={() => goToStep(s)}
                aria-current={s === step ? "step" : undefined}
                className="flex items-center gap-1.5 text-[10.5px]"
                style={{
                  fontFamily: MONO,
                  color:
                    state === "active"
                      ? "var(--earn-ink)"
                      : state === "done"
                        ? "var(--earn-teal-ink)"
                        : "var(--earn-faint)",
                  fontWeight: state === "active" ? 500 : 400,
                }}
                data-testid={`plan-step-${s}`}
              >
                <i className="inline-block h-4 w-4 rounded-full" style={railDot(state)} />
                {PLAN_STEP_LABELS[s]}
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {/* ── STEP 1 · Occasion ─────────────────────────────────────────────────────────────
              The REAL catalog, from the one runtime vocabulary. Nothing is preselected and
              nothing is hardcoded: if the fetch yields no rows the step says so rather than
              falling back to an invented list (§13). Hidden occasions are NOT filtered out —
              the select this replaced never filtered them either, and `default_visibility`
              governs Share/guests on the plan, not whether the occasion can be chosen. */}
          {step === "occasion" && (
            <div className="space-y-3" data-testid="plan-step-occasion-body">
              {occasionsLoading ? (
                <p className="text-sm" style={{ color: "var(--earn-muted)" }}>Loading occasions…</p>
              ) : (occasions ?? []).length === 0 ? (
                <p className="text-sm" style={{ color: "var(--earn-muted)" }} data-testid="plan-occasions-unavailable">
                  The occasion catalog is unavailable right now. Try again in a moment — nothing
                  here is guessed on your behalf.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {(occasions ?? []).map((t) => {
                    const picked = t.slug === occasionSlug;
                    return (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => setOccasionSlug(t.slug)}
                        aria-pressed={picked}
                        className="flex flex-col gap-1 rounded-xl border p-3.5 text-left transition-colors"
                        style={{
                          borderColor: picked ? "var(--earn-coral-ink)" : "var(--earn-border)",
                          background: picked ? "var(--earn-coral-bg)" : "var(--earn-card)",
                        }}
                        data-testid={`option-occasion-${t.slug}`}
                      >
                        <span className="text-sm font-semibold" style={{ color: "var(--earn-ink)" }}>
                          {t.name}
                        </span>
                        {t.description && (
                          <span className="text-xs" style={{ color: "var(--earn-muted)" }}>
                            {t.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px]" style={{ fontFamily: MONO, color: "var(--earn-faint)" }}>
                Or start from a Moment on the home page — the occasion arrives already set.
              </p>
            </div>
          )}

          {/* ── STEP 2 · Where — one destination, or an ordered list. See the header note. ─── */}
          {step === "where" && (
            <div className="space-y-1.5" data-testid="plan-step-where-body">
              {/* ROW 1's LABEL SAYS WHICH SHAPE THIS IS (re-audit A12). Under `many` the list read
                  *Destination / 02 / 03* — row 1 had a different KIND of name from its own
                  siblings, which reads as a field standing outside the list rather than as its
                  first member. It IS the first member (the position-0 mirror of
                  `trip_destinations`, Locked Decision 34), so under `many` it takes the ordinal
                  "01" and the name "First stop". Under `one` nothing changes: there is no list to
                  be first in, and "Destination" is the honest word. */}
              <Label htmlFor="etp-destination" className="flex items-center gap-2">
                {stopsMany ? (
                  <span
                    className="text-[10.5px] tabular-nums"
                    style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                    data-testid="text-plan-stop-ordinal-0"
                  >
                    01
                  </span>
                ) : (
                  <MapPin className="h-3.5 w-3.5" style={{ color: "var(--earn-muted)" }} />
                )}
                {stopsMany ? "First stop" : "Destination"}
              </Label>
              {/* ROW 1 IS THE DESTINATION FIELD in both shapes, and keeps its id and its testid:
                  under `many` it is simply the first row of the list (the position-0 mirror). */}
              <Input
                id="etp-destination"
                value={destination}
                onChange={(e) => {
                  setStopsTouched(true);
                  setDestination(e.target.value);
                }}
                placeholder="Kyoto, Japan"
                aria-label={stopsMany ? "Stop 1" : undefined}
                data-testid="input-etp-destination"
              />

              {/* §13 — the field says out loud that this city was SUGGESTED, not stated. It is a
                  real, editable, clearable value (the artboard's filled field, not a grey
                  placeholder), and it stays unwritten until the traveler moves forward from this
                  step. The note disappears the instant they type, because it is then their answer. */}
              {destinationSuggested && (
                <p
                  className="text-[11px]"
                  style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                  data-testid="text-etp-destination-suggested"
                >
                  {/* The attribution carries its OWN testid as well as the paragraph's: the
                      walkthrough doc pins `text-etp-destination-suggested`, and the QA check that
                      found this note unreachable asks for it by the name it looked for. One
                      element cannot carry two `data-testid`s, so the sentence is the inner one. */}
                  <span data-testid="text-destination-from-home-city">
                    from the home city in your profile — change it, or continue to keep it
                  </span>
                </p>
              )}

              {stopsMany && (
                <div className="space-y-2 pt-1" data-testid="plan-stops-list">
                  {stops.slice(1).map((stop, i) => {
                    // `index` is the row's real position in the list; `i` counts only the rows
                    // BELOW the destination field, which is rendered above as row 1.
                    const index = i + 1;
                    const named = stop.name.trim() !== "";
                    return (
                      <div
                        key={index}
                        className="flex items-start gap-2"
                        data-testid={`plan-stop-row-${index}`}
                      >
                        <span
                          className="pt-2.5 text-[10.5px] tabular-nums"
                          style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                        >
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Input
                            value={stop.name}
                            onChange={(e) => {
                              setStopsTouched(true);
                              setStops((prev) => renameStopAt(prev, index, e.target.value));
                            }}
                            placeholder="Another city"
                            aria-label={`Stop ${index + 1}`}
                            data-testid={`input-plan-stop-${index}`}
                          />
                          {/* §13: a stop nobody placed is UNLOCATED and says so. It is never
                              guessed onto a map, and this lane collects no coordinates at all. */}
                          {named && !isLocatedStop(stop) && (
                            <span
                              className="block text-[10.5px]"
                              style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                              data-testid={`text-plan-stop-unlocated-${index}`}
                            >
                              not located — no pin has been placed for this stop
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={stepperButton}
                          aria-label={`Move stop ${index + 1} up`}
                          onClick={() => {
                            setStopsTouched(true);
                            setStops((prev) => moveStop(prev, index, "up"));
                          }}
                          data-testid={`button-plan-stop-up-${index}`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={stepperButton}
                          aria-label={`Move stop ${index + 1} down`}
                          disabled={index === stops.length - 1}
                          onClick={() => {
                            setStopsTouched(true);
                            setStops((prev) => moveStop(prev, index, "down"));
                          }}
                          data-testid={`button-plan-stop-down-${index}`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={stepperButton}
                          aria-label={`Remove stop ${index + 1}`}
                          onClick={() => {
                            setStopsTouched(true);
                            setStops((prev) => removeStopAt(prev, index));
                          }}
                          data-testid={`button-plan-stop-remove-${index}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    className="flex items-center gap-2 text-[13px] font-semibold disabled:opacity-40"
                    style={{ color: "var(--earn-teal-ink)" }}
                    disabled={stops.length >= MAX_PLAN_STOPS}
                    onClick={() => {
                      setStopsTouched(true);
                      setStops((prev) => addStop(prev));
                    }}
                    data-testid="button-plan-add-stop"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add another stop
                    <span className="text-[11px] font-normal" style={{ fontFamily: MONO, color: "var(--earn-muted)" }}>
                      for road trips and multi-city plans
                    </span>
                  </button>

                  {/* THE SEQUENCE, AND NOTHING MORE. An order — no route, no distance, no travel
                      time (Locked Decision 22c). Shown only once more than one stop is named:
                      a "sequence" of one is not a sequence. */}
                  {namedStops(stops).length > 1 && (
                    <div className="space-y-0.5 pt-1">
                      <p
                        className="text-[12px]"
                        style={{ color: "var(--earn-ink)" }}
                        data-testid="text-plan-stop-sequence"
                      >
                        {stopSequence(stops)}
                      </p>
                      <p className="text-[10.5px]" style={{ fontFamily: MONO, color: "var(--earn-faint)" }}>
                        the order you'll visit them — no route, distance or travel time is calculated
                      </p>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* ── STEP 3 · When — shape from `default_duration`. ─────────────────────────────── */}
          {step === "when" && (
            <div className="space-y-4" data-testid="plan-step-when-body">
              {shape === "day" ? (
                <div className="grid grid-cols-2 gap-3" data-testid="etp-step3-day">
                  <div className="space-y-1.5">
                    <Label htmlFor="etp-start" className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" style={{ color: "var(--earn-muted)" }} />
                      Date
                    </Label>
                    <Input
                      id="etp-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="input-etp-start-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="etp-main-moment" className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" style={{ color: "var(--earn-muted)" }} />
                      Time (optional)
                    </Label>
                    <Input
                      id="etp-main-moment"
                      type="time"
                      value={mainMomentTime}
                      onChange={(e) => setMainMomentTime(e.target.value)}
                      data-testid="input-etp-main-moment"
                    />
                  </div>
                  {/* THE RATIFIED Step3Day CAPTION, with every clause of it CHECKED (re-audit A3).
                      `showsHomeCityDayCaption` owns the three conditions — day-shaped, no stop
                      list, and the destination on screen really IS the signed-in member's own
                      `users.home_city`. Written as a literal it would tell a traveler flying to a
                      date night in another city that they are staying home (§13). */}
                  {showsOwnCityCaption && (
                    <p
                      className="col-span-2 text-[11px]"
                      style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                      data-testid="text-etp-own-city-caption"
                    >
                      Your own city, one evening. No stops, no range.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3" data-testid="etp-step3-range">
                  <div className="space-y-1.5">
                    <Label htmlFor="etp-start">First day</Label>
                    <Input
                      id="etp-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="input-etp-start-date"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="etp-end">Last day</Label>
                    <Input
                      id="etp-end"
                      type="date"
                      min={startDate || undefined}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      data-testid="input-etp-end-date"
                    />
                  </div>
                </div>
              )}

              {/* THE MAIN MOMENT on a RANGE. The ratified Step3When artboard shows a wedding —
                  a range-shaped occasion — carrying an anchor time, which is what settles the
                  audit's "mutually exclusive branches" finding. Its DATE is its own question:
                  a moment inside a three-day range has no date the plan can derive for it, and
                  a derived one would render exactly like a stated one (§13). Nothing is written
                  until BOTH are given. */}
              {shape !== "day" && wantsMainMoment && (
                <div
                  className="space-y-3 rounded-lg border p-3.5"
                  style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
                  data-testid="etp-main-moment-card"
                >
                  <span
                    className="text-[10.5px] uppercase tracking-[0.1em]"
                    style={{ fontFamily: MONO, color: "var(--earn-teal-ink)" }}
                  >
                    The main moment
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Input
                      type="date"
                      min={startDate || undefined}
                      max={endDate || undefined}
                      value={mainMomentDate}
                      onChange={(e) => setMainMomentDate(e.target.value)}
                      aria-label="Main moment date"
                      data-testid="input-etp-main-moment-date"
                    />
                    <Input
                      type="time"
                      value={mainMomentTime}
                      onChange={(e) => setMainMomentTime(e.target.value)}
                      aria-label="Main moment time"
                      data-testid="input-etp-main-moment"
                    />
                  </div>
                  <p className="text-xs" style={{ color: "var(--earn-muted)" }}>
                    This is the anchor everything else is timed around.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4 · Who — the occasion's own stepper tuple, every field starting NOT SET. ── */}
          {step === "who" && (
            <div className="space-y-3" data-testid="plan-step-who-body">
              {authoring && (
                <p
                  className="text-[10.5px] uppercase tracking-[0.1em]"
                  style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                  data-testid="plan-step-who-authoring-eyebrow"
                >
                  The client's party
                </p>
              )}
              {/* THE STEPPERS ARE THE OCCASION'S OWN TUPLE (re-audit A4). `partyFields` decides
                  how many there are and what they are called; a corporate plan gets ONE, and the
                  Kids stepper is OMITTED rather than disabled — an absent control asks nothing,
                  a greyed-out one asserts the question exists here and cannot be answered. */}
              <div className="flex flex-wrap gap-4">
                {partyStepperFields.map((field) => {
                  const f =
                    field.key === "adults"
                      ? { key: "adults" as const, label: field.label, value: adults, set: setAdults }
                      : { key: "kids" as const, label: field.label, value: kids, set: setKids };
                  return (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`etp-${f.key}-count`} data-testid={`label-etp-${f.key}`}>
                      {f.label}
                    </Label>
                    <div
                      className="flex h-11 w-[148px] items-center gap-1 rounded-lg border p-1"
                      style={{ borderColor: "var(--earn-border)", background: "var(--earn-card)" }}
                    >
                      <button
                        type="button"
                        className={stepperButton}
                        aria-label={`Decrease ${f.label}`}
                        disabled={f.value === ""}
                        onClick={() => {
                          setPartyTouched(true);
                          f.set(stepDown(f.value));
                        }}
                        data-testid={`button-etp-${f.key}-minus`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      {/* THE CENTRE IS TYPEABLE AS WELL AS STEPPABLE (decision-maker, step 4).
                          ONE STATE, TWO CONTROLS (§18 rule 1): this input and the − / + buttons
                          write the same `adults`/`kids` string, and `parsePartyCountInput` is the
                          one normaliser — digits only, empty stays empty, clamped to the same
                          `MAX_PARTY_COUNT` ceiling `stepUp` enforces. The placeholder is the em
                          dash the read-only span used to print: an unstated party still reads as
                          NOT SET, never as a 0 (§13, Locked Decision 33's "untouched ⇒ NULL,
                          never 2"). The wrapper keeps the `value-etp-*` testid the walkthrough
                          doc already names. */}
                      <span className="flex flex-1 items-stretch" data-testid={`value-etp-${f.key}`}>
                        <input
                          id={`etp-${f.key}-count`}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="off"
                          maxLength={3}
                          placeholder="—"
                          value={f.value}
                          className="w-full min-w-0 bg-transparent text-center text-[15px] font-semibold outline-none placeholder:font-semibold placeholder:text-[color:var(--earn-faint)]"
                          style={{ color: "var(--earn-ink)" }}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            setPartyTouched(true);
                            f.set(parsePartyCountInput(e.target.value));
                          }}
                          data-testid={`input-plan-${f.key}`}
                        />
                      </span>
                      <button
                        type="button"
                        className={stepperButton}
                        aria-label={`Increase ${f.label}`}
                        onClick={() => {
                          setPartyTouched(true);
                          f.set(stepUp(f.value));
                        }}
                        data-testid={`button-etp-${f.key}-plus`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
              {/* ── STEP 4's SECOND QUESTION — the occasion picks it (migration 284) ──────────
                  `asksBudgetApprover` / `asksAccessibilityNote` are the two predicates, and they
                  live in `plan-steps.ts`; nothing is re-derived here. Neither field is offered when
                  the occasion's own switches do not ask for it — an OMITTED question and an empty
                  answer are different facts, and only the first is true of an occasion that never
                  put it (§13). */}
              {wantsBudgetApprover && (
                <div className="space-y-1.5 pt-1" data-testid="plan-step-who-approver">
                  <Label htmlFor="etp-budget-approver-name">Who approves the budget?</Label>
                  <Input
                    id="etp-budget-approver-name"
                    value={budgetApproverName}
                    onChange={(e) => {
                      setVariantTouched(true);
                      setBudgetApproverName(e.target.value);
                    }}
                    maxLength={120}
                    placeholder="name or role"
                    data-testid="input-etp-budget-approver-name"
                  />
                  <Input
                    type="email"
                    value={budgetApproverEmail}
                    onChange={(e) => {
                      setVariantTouched(true);
                      setBudgetApproverEmail(e.target.value);
                    }}
                    maxLength={255}
                    placeholder="their email (optional)"
                    aria-label="Budget approver email"
                    data-testid="input-etp-budget-approver-email"
                  />
                  <p className="text-[12px]" style={{ color: "var(--earn-muted)" }}>
                    Nobody travels on this plan; attendees RSVP.
                  </p>
                </div>
              )}

              {wantsAccessibilityNote && (
                <div className="space-y-1.5 pt-1" data-testid="plan-step-who-accessibility">
                  <Label htmlFor="etp-accessibility-note">
                    Anyone need a slower pace or step-free access?
                  </Label>
                  <Input
                    id="etp-accessibility-note"
                    value={accessibilityNote}
                    onChange={(e) => {
                      setVariantTouched(true);
                      setAccessibilityNote(e.target.value);
                    }}
                    maxLength={2000}
                    placeholder="Grandparents — step-free, short walks"
                    data-testid="input-etp-accessibility-note"
                  />
                  {/* Free text, never a checklist: the platform claims no accessibility standard on
                      anyone's behalf. Left blank it is saved as nothing at all and is never shown
                      anywhere as "no needs" (§13). */}
                  <p className="text-[12px]" style={{ color: "var(--earn-muted)" }}>
                    Saved on the plan, shown to your expert. Left blank, nothing is claimed either
                    way.
                  </p>
                </div>
              )}

              {/* THE GUEST-LIST CLAUSE IS DERIVED (re-audit A10). `golf-trip` seeds
                  `default_guests: false`, and this note used to promise that plan a per-event
                  guest list it will never have — one line away from `partyNoun`, which was
                  already refusing it every word of guest vocabulary. ONE helper answers it here
                  and on step 5; a second copy is the drift §18 rule 1 names. */}
              <p className="text-[13px]" style={{ color: "var(--earn-muted)" }} data-testid="text-etp-party-note">
                {guestCopy.partyNote}
                {guestCopy.on && next === "events" ? " — next step." : "."}
              </p>
            </div>
          )}

          {/* ── STEP 5 · What's happening — the SERVER's presets for this occasion. ─────────── */}
          {step === "events" && (
            <div className="space-y-2.5" data-testid="etp-step5-schedule">
              <p className="text-[13px]" style={{ color: "var(--earn-muted)" }} data-testid="text-etp-events-intro">
                {guestCopy.eventsIntro}
              </p>
              <div className="flex flex-wrap gap-2">
                {chipLabels.map((label) => {
                  const picked = hasEventRow(pickedEvents, label);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => toggleChip(label)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        picked
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                      data-testid={`chip-etp-event-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      {label}
                    </button>
                  );
                })}
                {!customOpen && (
                  <button
                    type="button"
                    onClick={() => setCustomOpen(true)}
                    className="rounded-full border border-dashed px-3 py-1.5 text-xs transition-colors bg-background text-muted-foreground hover:bg-muted"
                    data-testid="chip-etp-event-something-else"
                  >
                    + Something else
                  </button>
                )}
              </div>
              {/* "SOMETHING ELSE" IS A CHIP THAT OPENS A FIELD (re-audit A8). The ratified
                  artboards draw it as the last chip in the row, and it belongs there: it is the
                  same kind of answer as the presets beside it — one more thing that is happening —
                  and rendering it as a permanently-open text box made it look like a different
                  question. The BEHAVIOUR is unchanged and is deliberately richer than the artboard:
                  confirmed text becomes a full ROW with the same Day/Time/Place cells every ticked
                  chip gets, because an occasion's presets can never cover everything and a
                  free-text event with no way to say WHEN would be a second-class one.

                  The field, once open, STAYS open — including after a confirm — so a traveler
                  adding three of their own does not re-open it three times. Text left un-confirmed
                  in it is still saved: `eventsToCreate` folds it in, so nothing typed is lost by
                  not pressing Enter, and the chip is therefore never a way to lose an answer. */}
              {customOpen ? (
                <Input
                  autoFocus
                  value={customEvent}
                  onChange={(e) => setCustomEvent(e.target.value)}
                  onBlur={commitCustomEvent}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    commitCustomEvent();
                  }}
                  placeholder="Something else…"
                  data-testid="input-etp-custom-event"
                />
              ) : null}

              {/* ── THE RATIFIED TABLE — Event · Day · Time · Place ────────────────────────────
                  `Step5Events.dc.html` and `TravelEvents.dc.html` both draw this, and both were
                  recorded as HELD because `user_experiences` had no time-of-day column. Migration
                  282 gave it one (Locked Decision 35), so the table is built here.

                  EVERY CELL IS OPTIONAL AND EVERY EMPTY CELL MEANS "NOT ANSWERED" (§13). The Day
                  select's first option and the Place input's placeholder show the PLAN's own
                  answers as DEFAULTS — visible, and not written: they are inherited at create by
                  the one shared `planEventRowValues`, which is also what the pre-trip pen drain
                  uses, so a chip ticked before the plan existed lands identically. The Time has no
                  default at all — a plan carries no hour, and midnight is not "no time given". */}
              {pickedEvents.length > 0 && (
                <div className="space-y-1.5 pt-1" data-testid="etp-step5-rows">
                  {/* FOUR COLUMNS, as ratified (re-audit A7). Day and time were one merged cell;
                      they are two ANSWERS — a plan-day chosen from a select, and a wall-clock time
                      that has no default at all — and merging their headers made the second look
                      like part of the first. The Day column can still be absent for a plan whose
                      range is not readable yet; the grid keeps its slot so the rows stay aligned. */}
                  <div
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10.5px] uppercase tracking-[0.12em]"
                    style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                  >
                    <span>Event</span>
                    <span>Day</span>
                    <span>Time</span>
                    <span>Place</span>
                  </div>
                  {pickedEvents.map((row) => (
                    <div
                      key={row.title}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2"
                      data-testid={`etp-event-row-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    >
                      <span className="truncate text-[13px]" style={{ color: "var(--earn-ink)" }}>
                        {row.title}
                      </span>
                      {/* A SELECT of the plan's own days, not a free calendar: an event inside a
                          plan cannot fall outside it, and `trips.start_date`/`end_date` are the
                          range. No days readable yet ⇒ the cell renders EMPTY rather than asking a
                          question with no answers (§13) — the column keeps its slot so the Time and
                          Place cells below it stay under their own headers. */}
                      <span className="flex items-center">
                        {dayOptions.length > 0 && (
                          <select
                            value={row.eventDate ?? ""}
                            onChange={(e) =>
                              setPickedEvents((prev) =>
                                setEventDetail(prev, row.title, { eventDate: e.target.value }),
                              )
                            }
                            aria-label={`Day for ${row.title}`}
                            className="h-8 rounded-md border border-[color:var(--earn-border)] bg-transparent px-1.5 text-[12px]"
                            style={{ color: row.eventDate ? "var(--earn-ink)" : "var(--earn-faint)" }}
                            data-testid={`select-etp-event-day-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                          >
                            {/* The default, SHOWN and not written — until it is chosen, this row
                                has no day of its own and the plan's first day is inherited at
                                create. The two states stay distinguishable. */}
                            <option value="">{dayLabel(defaultDay)} (default)</option>
                            {dayOptions.map((day) => (
                              <option key={day} value={day}>
                                {dayLabel(day)}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                      <span className="flex items-center">
                        <Input
                          type="time"
                          value={row.startTime ?? ""}
                          onChange={(e) =>
                            setPickedEvents((prev) =>
                              setEventDetail(prev, row.title, { startTime: e.target.value }),
                            )
                          }
                          aria-label={`Start time for ${row.title}`}
                          className="h-8 w-[6.5rem] text-[12px]"
                          data-testid={`input-etp-event-time-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        />
                      </span>
                      <Input
                        value={row.location ?? ""}
                        onChange={(e) =>
                          setPickedEvents((prev) =>
                            setEventDetail(prev, row.title, { location: e.target.value }),
                          )
                        }
                        aria-label={`Place for ${row.title}`}
                        placeholder={destination.trim() || "Add a place"}
                        className="h-8 w-[9rem] text-[12px]"
                        data-testid={`input-etp-event-place-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                      />
                    </div>
                  ))}
                  <p className="text-[11px]" style={{ fontFamily: MONO, color: "var(--earn-faint)" }}>
                    Days and places default to your plan. Change any of them now or later from the
                    slip. A time is only ever the one you set.
                  </p>
                  {/* The ratified Step5Events footer (re-audit A9), on the SAME helper the intro
                      above and step 4's note use. An occasion with `default_guests` false or NOT
                      SET gets nothing here: the sentence is a claim about a capability, and a
                      claim needs an explicit yes (§13). */}
                  {guestCopy.eventsFooter && (
                    <p
                      className="text-[11px]"
                      style={{ fontFamily: MONO, color: "var(--earn-faint)" }}
                      data-testid="text-etp-events-guest-footer"
                    >
                      {guestCopy.eventsFooter}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── THE FINISH — the three ways to build, on the last visible step. ─────────────────
            Not a sixth step and not a first one: you say what you are planning before you say
            who should build it. A `source.branch` deep-open means the "how" is already decided,
            so `branches` arrives narrowed to that one. */}
        {isLastStep && (
          <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--earn-border)" }}>
            {/* THE PLAN'S NAME IS OPTIONAL AND LAST (re-audit A2). It sat on step 2, carried over
                from the edit panel this modal was renamed from, where a second field under
                "Where is it happening?" answered a different question from the one the step asks —
                and the ratified Step2Where artboard draws one field, not two. A name is the one
                thing a plan can be finished without: `trips.title` is derived from the destination
                when it is blank, so asking for it beside the CTA is asking at the only moment it
                costs nothing. The field, its id, its state and its testid are unchanged — it MOVED,
                it was not rebuilt. */}
            <div className="space-y-1.5 pb-1">
              <Label htmlFor="etp-title">Plan name (optional)</Label>
              <Input
                id="etp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={destination ? `Your ${destination.split(",")[0]} plan` : "My plan"}
                data-testid="input-etp-title"
              />
            </div>
            {continueHref && !source?.branch && (
              <button
                type="button"
                className={finishRow}
                onClick={() => {
                  onOpenChange(false);
                  onContinue?.(continueHref);
                }}
                data-testid="planning-option-continue"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold" style={{ color: "var(--earn-ink)" }}>
                    {continueLabel}
                  </span>
                  <span className="block text-[11px]" style={finishMeta}>
                    pick up where you left off
                  </span>
                </span>
              </button>
            )}
            {branches.map((b) =>
              b === "ai" ? (
                /* The one coral primary of the finish (earn grammar). */
                <button
                  key={b}
                  type="button"
                  disabled={saving}
                  className="flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-white transition-colors bg-[color:var(--earn-coral-ink)] border-[color:var(--earn-coral-ink)] hover:bg-[color:var(--earn-coral-ink)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                  onClick={() => void finish(b)}
                  data-testid="planning-option-ai"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{branchCopy.ai.label}</span>
                    <span className="block text-[11px] text-white/80" style={{ fontFamily: MONO }}>
                      {branchCopy.ai.meta}
                    </span>
                  </span>
                </button>
              ) : (
                <button
                  key={b}
                  type="button"
                  disabled={saving}
                  className={`${finishRow} disabled:opacity-60`}
                  onClick={() => void finish(b)}
                  data-testid={`planning-option-${b}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: "var(--earn-ink)" }}>
                      {branchCopy[b].label}
                    </span>
                    <span className="block text-[11px]" style={finishMeta}>
                      {branchCopy[b].meta}
                    </span>
                  </span>
                </button>
              ),
            )}
            {finishError && (
              <p className="text-xs text-destructive" data-testid="text-planning-create-error">
                {finishError}
              </p>
            )}
          </div>
        )}

        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
          style={{ borderColor: "var(--earn-border)" }}
        >
          <span className="text-[11px]" style={{ fontFamily: MONO, color: "var(--earn-faint)" }}>
            {/* The CTA-side note names what the finish will actually do. The event count shows
                only when the occasion HAS a schedule step — a count for a step that is not on
                screen would be describing work nobody asked for. */}
            {eventCount > 0 && isLastStep
              ? `${eventCount} event${eventCount === 1 ? "" : "s"} will be created on your plan.`
              : stepNote[step]}
          </span>
          <span className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={clearAll}
              data-testid="button-etp-clear"
            >
              Clear plan
            </Button>
            {back && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => goToStep(back)}
                data-testid="button-planning-back"
              >
                Back
              </Button>
            )}
            {/* Save exists on every step so an EDIT door (the cart header, the strip) can correct
                a detail and leave, without being made to answer "how should this be built?" —
                a plan already being built has answered that. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void save()}
              disabled={saving}
              data-testid="button-etp-save"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            {next && (
              <Button
                type="button"
                size="sm"
                onClick={() => goToStep(next)}
                disabled={step === "occasion" && !occasionSlug}
                data-testid="button-planning-next"
              >
                Next: {PLAN_STEP_LABELS[next]}
              </Button>
            )}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
