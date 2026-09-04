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
  switchTripContext,
  updateTripContext,
  useTripContext,
} from "@/lib/trip-context";
import { apiRequest } from "@/lib/queryClient";
import { eventTypeForSlug, findOccasionByKey } from "@shared/occasions";
import { partyNoun, partyTotal, travelersForSave } from "@/lib/plan-vocabulary";
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
import {
  PLAN_STEP_LABELS,
  nextPlanStep,
  previousPlanStep,
  resolvePlanSteps,
  type PlanStepId,
} from "@/lib/plan-steps";
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
 * The ModalWhere artboard draws "Add another stop" and TravelWhere draws the same step holding
 * three of them; both were OMITTED (never disabled) while `trip_destinations` did not exist,
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
 * The Step4Variants artboard's corporate budget-approver and family accessibility fields are NOT
 * built: no column holds either, and inventing one is a decision, not a side effect of this lane.
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
function stepUp(raw: string): string {
  if (raw === "") return "1";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "1";
  return String(Math.min(500, n + 1));
}

export function PlanModal({
  open,
  onOpenChange,
  source = null,
  branches,
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
  const setDestination = (value: string) => setStops((prev) => renameStopAt(prev, 0, value));
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
  /** "" = nothing chosen. Never seeded with a placeholder occasion. */
  const [occasionSlug, setOccasionSlug] = useState("");
  /** "HH:MM" for the main moment. "" = never given — an anchor is not written. */
  const [mainMomentTime, setMainMomentTime] = useState("");
  /** "YYYY-MM-DD" for the main moment of a RANGE-shaped occasion. "" = never given (§13). */
  const [mainMomentDate, setMainMomentDate] = useState("");
  /** Step-5 chip labels the traveler ticked. Each becomes ONE event (a `user_experiences` row). */
  const [pickedEvents, setPickedEvents] = useState<string[]>([]);
  /** The "Something else" free-text chip — an occasion's presets can never cover everything. */
  const [customEvent, setCustomEvent] = useState("");
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

  // Seed the form from the live context each time the modal opens, then let the door's own source
  // pre-fill over it — a door that names a city is describing the plan the traveler just asked for.
  useEffect(() => {
    if (!open) return;
    startResolved.current = false;
    setFinishError(null);
    setStep("occasion");
    setTitle(ctx.title || "");
    const sourceDestination = doorDestination;
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
    setMainMomentTime(ctx.mainMomentTime || "");
    setMainMomentDate(ctx.mainMomentDate || "");
    setPickedEvents(Array.isArray(ctx.pendingEventTitles) ? [...ctx.pendingEventTitles] : []);
    setCustomEvent("");
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

  const toggleChip = (label: string) =>
    setPickedEvents((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );

  /** Everything that would become an event on save — ticked chips plus a typed "something else". */
  const eventTitles = useMemo(() => {
    const extra = customEvent.trim();
    const all = extra ? [...pickedEvents, extra] : pickedEvents;
    return Array.from(new Set(all));
  }, [pickedEvents, customEvent]);
  const eventCount = wantsSchedule ? eventTitles.length : 0;

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
    const trimmedDestination = destination.trim() || undefined;

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
    const partyAnswered = partyTouched || adults !== "" || kids !== "";
    const travelers = partyAnswered ? partyTotal(adults, kids) : liveCtx.travelers;

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
        kids: travelersForSave(kids) ?? 0,
      });
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
        body.kids = travelersForSave(kids) ?? null;
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
    const momentDate = shape === "day" ? start || "" : mainMomentDate.trim();
    const momentTime = mainMomentTime.trim();
    const titlesToCreate = wantsSchedule ? eventTitles : [];
    if (tripId && ((momentDate && momentTime) || titlesToCreate.length > 0)) {
      setSaving(true);
      try {
        if (momentDate && momentTime) {
          await writeMainMomentAnchor(tripId, momentDate, momentTime).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[plan-modal] main moment not saved as an anchor:", err?.message);
          });
        }
        // ONE event per ticked chip. An event inside a plan IS a `user_experiences` row bound to
        // the trip (Locked Decision 29) — there is no second event artifact, and this posts to the
        // SAME owner-scoped, allowlist-bodied route the slip's "set up guest list" already uses.
        for (const t of titlesToCreate) {
          await apiRequest("POST", "/api/user-experiences", {
            tripId,
            title: t,
            eventDate: start,
            location: trimmedDestination,
            experienceTypeId: selectedOccasion?.id,
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`[plan-modal] event "${t}" not created:`, err?.message);
          });
        }
        // They exist as rows now; the pre-trip holding pen must not replay them on the next save.
        updateTripContext({
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
        pendingEventTitles: titlesToCreate,
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

  const clearAll = () => {
    clearTripContext();
    onOpenChange(false);
  };

  // ── Presentation ─────────────────────────────────────────────────────────────────────────────

  const isLastStep = nextPlanStep(visibleSteps, step) === null;
  const back = previousPlanStep(visibleSteps, step);
  const next = nextPlanStep(visibleSteps, step);
  const partyLabelNoun = noun.charAt(0).toUpperCase() + noun.slice(1);

  /** The eyebrow, composed ONLY from what the plan actually holds (§13). */
  const eyebrow = useMemo(() => {
    const city = destination.trim().split(",")[0].trim();
    const occ = selectedOccasion?.name?.toLowerCase();
    const lead = city && occ ? `Your ${city} ${occ}` : city ? `Your ${city} plan` : "Your plan";
    if (!startDate) return lead;
    const fmt = (ymd: string) => {
      const d = new Date(`${ymd}T00:00:00`);
      return isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };
    const span =
      endDate && endDate !== startDate ? `${fmt(startDate)} to ${fmt(endDate)}` : fmt(startDate);
    return `${lead} · ${span}`;
  }, [destination, selectedOccasion, startDate, endDate]);

  const stepTitle: Record<PlanStepId, string> = {
    occasion: "What are you planning?",
    where: "Where is it happening?",
    when: "When is it?",
    who:
      noun === "attendees"
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
    who: "Left untouched, nothing is assumed: a party you never set is saved as not set.",
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
                onClick={() => setStep("occasion")}
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
                onClick={() => setStep(s)}
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
              <Label htmlFor="etp-destination" className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" style={{ color: "var(--earn-muted)" }} />
                Destination
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

              <Label htmlFor="etp-title" className="pt-2 block">Plan name (optional)</Label>
              <Input
                id="etp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={destination ? `Your ${destination.split(",")[0]} plan` : "My plan"}
                data-testid="input-etp-title"
              />
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
              {shape !== "day" && wantsSchedule && (
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

          {/* ── STEP 4 · Who — Adults and Kids, both starting at NOT SET. ──────────────────── */}
          {step === "who" && (
            <div className="space-y-3" data-testid="plan-step-who-body">
              <div className="flex flex-wrap gap-4">
                {([
                  { key: "adults", label: partyLabelNoun, value: adults, set: setAdults },
                  { key: "kids", label: "Kids", value: kids, set: setKids },
                ] as const).map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label data-testid={`label-etp-${f.key}`}>{f.label}</Label>
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
                      <span
                        className="flex-1 text-center text-[15px] font-semibold"
                        style={{ color: f.value === "" ? "var(--earn-faint)" : "var(--earn-ink)" }}
                        data-testid={`value-etp-${f.key}`}
                      >
                        {f.value === "" ? "—" : f.value}
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
                ))}
              </div>
              <p className="text-[13px]" style={{ color: "var(--earn-muted)" }}>
                This is the party on your booking. Your guest list is separate and per event
                {next === "events" ? " — next step." : "."}
              </p>
            </div>
          )}

          {/* ── STEP 5 · What's happening — the SERVER's presets for this occasion. ─────────── */}
          {step === "events" && (
            <div className="space-y-2.5" data-testid="etp-step5-schedule">
              <p className="text-[13px]" style={{ color: "var(--earn-muted)" }}>
                Tick what applies. Each becomes its own event on the plan, with its own time, place
                and guest list.
              </p>
              <div className="flex flex-wrap gap-2">
                {chipLabels.map((label) => {
                  const picked = pickedEvents.includes(label);
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
              </div>
              <Input
                value={customEvent}
                onChange={(e) => setCustomEvent(e.target.value)}
                placeholder="Something else…"
                data-testid="input-etp-custom-event"
              />
            </div>
          )}
        </div>

        {/* ── THE FINISH — the three ways to build, on the last visible step. ─────────────────
            Not a sixth step and not a first one: you say what you are planning before you say
            who should build it. A `source.branch` deep-open means the "how" is already decided,
            so `branches` arrives narrowed to that one. */}
        {isLastStep && (
          <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--earn-border)" }}>
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
                onClick={() => setStep(back)}
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
                onClick={() => setStep(next)}
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
