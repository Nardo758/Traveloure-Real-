import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearTripContext,
  getTripContext,
  switchTripContext,
  updateTripContext,
  useTripContext,
} from "@/lib/trip-context";
import { apiRequest } from "@/lib/queryClient";
import { eventTypeForSlug, normalizeOccasionKey } from "@shared/occasions";
import { partyNoun, travelersForSave } from "@/lib/plan-vocabulary";
import { durationShape, guestListSetting, showsSchedule } from "@/lib/occasion-switches";
import type { ExperienceType } from "@shared/schema";

/**
 * EditTripPanel — THE shared edit surface for the site-wide trip context
 * (Trip-Strip program, P2). One form behind every entry point: the cart header
 * today; the P3 strip popover and the experience-template empty state next.
 *
 * Writes via switchTripContext (REPLACE semantics for the identity-coupled
 * fields), not a plain merge: once a trip row exists (`tripId` bound —
 * Server-truth mode), editing the DESTINATION here means the user is now
 * describing a DIFFERENT trip than the one `tripId` points at, so `tripId` is
 * cleared in the SAME atomic write — a stale identity must never survive a
 * destination edit and end up paired with a destination it no longer matches
 * (money-adjacent: downstream optimize/payment requests derive the target trip
 * from `tripId`, so a stale one silently operates on the wrong trip while the
 * screen shows the right destination). Editing only dates/travelers/title
 * (destination unchanged) keeps the bound trip — this is not a blanket clear.
 *
 * OCCASION (ledger `2026-09-03-occasion-vocabulary`) — two things changed here:
 *
 * 1. THE LIST IS THE TABLE. The occasion select was a hand-typed six-item list whose
 *    default value ("trip") was not a member of ANY of the platform's occasion
 *    vocabularies, so the commonest saved value was one nothing downstream could read.
 *    It now renders rows from `GET /api/experience-types` — the same query key IntakePanel
 *    uses, so the two entry points can never offer different occasions — labelled by `name`
 *    and valued by `slug`. Nothing is hardcoded and nothing is dropped (§13); if the fetch
 *    yields no rows the control says so rather than falling back to an invented list.
 *
 * 2. IT WRITES THE TRIP ROW, NOT ONLY THE CONTEXT. The save persisted the occasion into
 *    `trip_contexts.context` (jsonb) and nowhere else, while `SlipLogisticsSection` gates the
 *    wedding Guest/Anchor tooling on `trips.event_type` — a different table. Correcting "A
 *    trip" to "A wedding" therefore never unlocked the wedding tools. When a `tripId` is bound
 *    the save now ALSO calls `PATCH /api/trips/:tripId/occasion` (owner-gated, allowlist body)
 *    with the mapped `eventTypeForSlug(slug)`. The context write is unchanged and still
 *    authoritative for the strip; this is an ADDITIONAL write, never a replacement.
 *
 * NOTHING IS PRESELECTED (§13). There is no "A trip" default: an occasion the traveler has not
 * chosen stays unchosen, and a save that carries no occasion leaves the stored one alone rather
 * than clearing it — the control never asked to clear anything.
 *
 * ── THE FIRST READER OF THE OCCASION SWITCHES (ledger `2026-09-03-switch-readers`) ────────────
 *
 * Migration 276 gave every occasion six switch columns and no reader; Locked Decision 28 states
 * why they are columns and not a class. This panel is that reader. The chosen occasion's ROW now
 * decides the shape of three of this form's five steps:
 *
 *   step 3 (dates)     `default_duration` — "day" collapses the first/last-day pair to ONE date
 *                      plus an optional time for the main moment; "range" is the pair as before.
 *   step 4 (party)     `vocabulary` — the label is Travelers / Guests / Attendees, resolved by
 *                      `partyNoun` (plan-vocabulary.ts), which also honours `default_guests:false`
 *                      by refusing guest wording outright.
 *   step 5 (schedule)  `default_schedule` — "What's happening" appears only when the occasion HAS
 *                      an internal schedule. Its chips are the SERVER's own presets for this
 *                      occasion (`GET /api/logistics/presets/:slug`), never a list restated here:
 *                      restating them is the derivation-drift class §18 rule 1 names.
 *
 * Steps 1–2 are untouched: `default_stops` is deliberately NOT read, because an ordered stop list
 * is unratified — step 2 stays one place.
 *
 * EVERY switch is NULLABLE and a NULL means NOT SET, so each reader falls back to the PLAIN-PLAN
 * shape and says so at its definition (§13, `client/src/lib/occasion-switches.ts`). Nothing here
 * fabricates a value for a row that has none.
 */

/**
 * The `temporal_anchors.description` this panel stamps on the single-day "main moment", and the
 * marker it re-finds that anchor by on a later save. `anchorType` has no member for "the thing
 * this day is about" (see `temporalAnchorTypeEnum`), so the moment is a `custom` anchor and this
 * string is its identity — which is what makes a second save an UPDATE rather than a duplicate.
 */
const MAIN_MOMENT_DESCRIPTION = "The main moment";

/** The server preset shape this panel reads (`GET /api/logistics/presets/:templateSlug`). */
interface LogisticsPresets {
  anchors?: Array<{ anchorType?: string; label?: string }>;
}

export function EditTripPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [ctx] = useTripContext();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  /**
   * "" = the traveler has not stated a party size. Held as a STRING, not a number, because the
   * empty state has to be representable: migration 241 de-masked party size so an unanswered
   * question stays NULL, and this input used to seed a literal `2` and write it on every save —
   * re-masking one layer up (§13). See `travelersForSave`.
   */
  const [travelers, setTravelers] = useState("");
  /** "" = nothing chosen. Never seeded with a placeholder occasion. */
  const [occasionSlug, setOccasionSlug] = useState("");
  /** "HH:MM" for a single-day occasion's main moment. "" = never given — an anchor is not written. */
  const [mainMomentTime, setMainMomentTime] = useState("");
  /** Step-5 chip labels the traveler ticked. Each becomes ONE event (a `user_experiences` row). */
  const [pickedEvents, setPickedEvents] = useState<string[]>([]);
  /** The "Something else" free-text chip — an occasion's presets can never cover everything. */
  const [customEvent, setCustomEvent] = useState("");
  const [saving, setSaving] = useState(false);

  // The ONE runtime occasion vocabulary. Same query key as IntakePanel so the cache is shared
  // and the two doors can never drift apart.
  const { data: occasions, isLoading: occasionsLoading } = useQuery<ExperienceType[]>({
    queryKey: ["/api/experience-types"],
    enabled: open,
  });

  // Seed the form from the live context each time the panel opens.
  useEffect(() => {
    if (!open) return;
    setTitle(ctx.title || "");
    setDestination(ctx.destination || "");
    setStartDate(ctx.startDate || "");
    setEndDate(ctx.endDate || "");
    // A real stored count seeds the input; NO stored count leaves it EMPTY. Never a default of 2 —
    // a number the traveler never typed must not become one they appear to have stated.
    setTravelers(ctx.travelers && ctx.travelers > 0 ? String(ctx.travelers) : "");
    // Same posture for the two switch-driven fields: a held value seeds them, nothing seeds an
    // invented one. `pendingEventTitles` only ever holds chips ticked while no trip row existed.
    setMainMomentTime(ctx.mainMomentTime || "");
    setPickedEvents(Array.isArray(ctx.pendingEventTitles) ? [...ctx.pendingEventTitles] : []);
    setCustomEvent("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The occasion seeds SEPARATELY, because it can only resolve once the vocabulary has loaded.
  // The stored context may carry a slug (`experienceSlug`) or a display name (`experienceType`,
  // which experience-template.tsx writes) or a legacy value from the old hand-typed list — match
  // any of them against the real rows, and leave the control EMPTY when none matches rather than
  // showing a nearest-looking occasion the traveler never picked (§13).
  useEffect(() => {
    if (!open || !occasions) return;
    const wanted = [ctx.experienceSlug, ctx.experienceType]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map(normalizeOccasionKey);
    const match = occasions.find(
      (t) =>
        wanted.includes(normalizeOccasionKey(t.slug)) || wanted.includes(normalizeOccasionKey(t.name)),
    );
    setOccasionSlug(match ? match.slug : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, occasions]);

  const selectedOccasion = useMemo(
    () => (occasions ?? []).find((t) => t.slug === occasionSlug),
    [occasions, occasionSlug],
  );

  // ── The switch readers. One call each; the fallbacks are stated where they are defined. ──────
  const shape = durationShape(selectedOccasion);
  const wantsSchedule = showsSchedule(selectedOccasion);
  const hasGuestList = guestListSetting(selectedOccasion);
  const noun = partyNoun(selectedOccasion?.vocabulary, hasGuestList);
  const partyLabel = noun.charAt(0).toUpperCase() + noun.slice(1);

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

  /**
   * The single-day main moment, written where it BELONGS rather than into a store invented for it.
   *
   * A time the plan has to be built around is a `temporal_anchors` row — the optimizer, the
   * schedule validator and the energy budget all read that table, and `SlipLogisticsSection`
   * already surfaces it. So when a trip row exists the moment goes there, through the existing
   * owner-gated routes; nothing new is created. It is re-found by its `description` marker so a
   * second save UPDATES the moment instead of stacking a duplicate anchor beside it.
   *
   * Best-effort by design: this runs after the context write, and a 4xx (guest, non-owner, a
   * revoked advisor) leaves the context save standing rather than failing the whole panel.
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
        // single-day occasion asks for a time at all.
        isImmovable: true,
      });
    }
  }

  const save = async () => {
    if (saving) return;
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

    // Read fresh (not the `ctx` React-state snapshot from when the panel opened) —
    // this is the ground truth to compare the edited destination against.
    const liveCtx = getTripContext();
    const destinationChanged = (liveCtx.destination || "") !== (trimmedDestination || "");
    const preservedTripId = liveCtx.tripId && !destinationChanged ? liveCtx.tripId : undefined;

    switchTripContext({
      title: title.trim() || undefined,
      destination: trimmedDestination,
      startDate: start,
      endDate: end,
      // UNTOUCHED ⇒ NOT SET. `travelersForSave` returns undefined for an empty/zero/unparseable
      // input, and switchTripContext's SWITCH_FIELDS are REPLACE semantics, so the field is
      // CLEARED rather than re-asserted as a fabricated 2 (§13, migration 241's de-masking).
      travelers: travelersForSave(travelers),
      // No occasion chosen ⇒ keep whatever was stored. switchTripContext has REPLACE semantics
      // for this field, so omitting it would silently CLEAR an occasion the panel never asked
      // the traveler to clear.
      experienceType: selectedOccasion?.name ?? liveCtx.experienceType,
      tripId: preservedTripId,
    });

    if (selectedOccasion) {
      const eventType = eventTypeForSlug(selectedOccasion.slug);
      // `eventType` is outside SWITCH_FIELDS, so it needs its own merge write.
      updateTripContext({ eventType });
      // …and the trip ROW, which is what the wedding tooling actually reads. Best-effort: a
      // guest (no session) or a non-owner gets a 4xx and the context write above still stands.
      if (preservedTripId) {
        void apiRequest("PATCH", `/api/trips/${preservedTripId}/occasion`, { eventType }).catch(
          (err) => {
            // eslint-disable-next-line no-console
            console.warn("[edit-trip-panel] occasion not persisted to the trip row:", err?.message);
          },
        );
      }
    }

    // ── The two switch-driven writes. Both need a trip row; both hold honestly without one. ─────
    const moment = shape === "day" ? mainMomentTime.trim() : "";
    const titlesToCreate = wantsSchedule ? eventTitles : [];
    if (preservedTripId && (moment || titlesToCreate.length > 0)) {
      setSaving(true);
      try {
        if (moment && start) {
          await writeMainMomentAnchor(preservedTripId, start, moment).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[edit-trip-panel] main moment not saved as an anchor:", err?.message);
          });
        }
        // ONE event per ticked chip. An event inside a plan IS a `user_experiences` row bound to
        // the trip (Locked Decision 29) — there is no second event artifact, and this posts to the
        // SAME owner-scoped, allowlist-bodied route the slip's "set up guest list" already uses.
        for (const t of titlesToCreate) {
          await apiRequest("POST", "/api/user-experiences", {
            tripId: preservedTripId,
            title: t,
            eventDate: start,
            location: trimmedDestination,
            experienceTypeId: selectedOccasion?.id,
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`[edit-trip-panel] event "${t}" not created:`, err?.message);
          });
        }
        // They exist as rows now; the pre-trip holding pen must not replay them on the next save.
        updateTripContext({ pendingEventTitles: [], mainMomentTime: undefined });
      } finally {
        setSaving(false);
      }
    } else {
      /**
       * NO TRIP ROW YET — hold, and be honest about it.
       *
       * The panel can run long before a trip exists (the strip's Edit button on a marketing page,
       * the cart header), and there is no trip-mint path for it to hook: trips are minted by
       * checkout, the ready-made clone, the experience-template flow and the AI rail, each with
       * its own insert site under the L10 owner-guard. Draining this holding pen at every one of
       * them is a server-side lane of its own, not a side effect of this one.
       *
       * **KNOWN GAP, tracked rather than hidden (§13):** what is held here is NOT yet promoted
       * into `user_experiences` / `temporal_anchors` when a trip is later minted. It survives the
       * session (and, for a signed-in user, the `trip_contexts` row — both keys are on that
       * route's allowlist), it re-seeds this panel, and it is never silently discarded; it simply
       * does not create rows on its own. Reported with the lane.
       */
      updateTripContext({
        mainMomentTime: moment || undefined,
        pendingEventTitles: titlesToCreate,
      });
    }
    onOpenChange(false);
  };

  const clearAll = () => {
    clearTripContext();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="edit-trip-panel">
        <DialogHeader>
          <DialogTitle>Your plan details</DialogTitle>
          <DialogDescription>
            Set once — the whole site uses these while you plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="etp-destination">Destination</Label>
            <Input
              id="etp-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Kyoto, Japan"
              data-testid="input-etp-destination"
            />
          </div>

          {/* STEP 3 — shape from `default_duration`. "day" asks one date and an optional time;
              "range" (and every undecided occasion, §13) asks the first/last-day pair. */}
          {shape === "day" ? (
            <div className="grid grid-cols-2 gap-3" data-testid="etp-step3-day">
              <div className="space-y-1.5">
                <Label htmlFor="etp-start">Date</Label>
                <Input
                  id="etp-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  data-testid="input-etp-start-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="etp-main-moment">Main moment (optional)</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              {/* STEP 4 — the noun is the occasion's `vocabulary` column, resolved once in
                  plan-vocabulary.ts. NULL there ⇒ "Travelers", the plain-plan word (§13). */}
              <Label htmlFor="etp-travelers" data-testid="label-etp-party">{partyLabel}</Label>
              <Input
                id="etp-travelers"
                type="number"
                min={1}
                max={500}
                value={travelers}
                placeholder="Not set"
                // Raw passthrough: clearing the field must be possible, so the old
                // `Math.max(1, parseInt(...) || 1)` coercion — which turned an empty box straight
                // back into a 1 — is gone. `travelersForSave` is the single normalizer, at save.
                onChange={(e) => setTravelers(e.target.value)}
                data-testid="input-etp-travelers"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="etp-event-type">What are you planning?</Label>
              <Select
                value={occasionSlug || undefined}
                onValueChange={setOccasionSlug}
                disabled={occasionsLoading || (occasions ?? []).length === 0}
              >
                <SelectTrigger id="etp-event-type" data-testid="select-etp-event-type">
                  <SelectValue
                    placeholder={
                      occasionsLoading
                        ? "Loading…"
                        : (occasions ?? []).length === 0
                          ? "Unavailable"
                          : "What are you planning?"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(occasions ?? []).map((t) => (
                    <SelectItem key={t.slug} value={t.slug} data-testid={`option-etp-${t.slug}`}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* STEP 5 — "What's happening", shown ONLY when the occasion says it has an internal
              schedule (`default_schedule = true`). Every chip label comes from the server's own
              presets for this occasion; none is written here (§18 rule 1). */}
          {wantsSchedule && (
            <div className="space-y-1.5" data-testid="etp-step5-schedule">
              <Label>What's happening?</Label>
              <div className="flex flex-wrap gap-2">
                {chipLabels.map((label) => {
                  const picked = pickedEvents.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={picked}
                      onClick={() => toggleChip(label)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
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
              <p className="text-xs text-muted-foreground">
                Each one becomes its own part of the plan, with its own place and time.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="etp-title">Plan name (optional)</Label>
            <Input
              id="etp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={destination ? `Your ${destination} plan` : "My plan"}
              data-testid="input-etp-title"
            />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={clearAll}
            data-testid="button-etp-clear"
          >
            Clear plan
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            data-testid="button-etp-save"
          >
            {/* The CTA names what the save will actually do. It counts events only when the
                occasion HAS a schedule step — a count for a step that is not on screen would be
                describing work nobody asked for. */}
            {saving
              ? "Saving…"
              : eventCount > 0
                ? `Create plan · ${eventCount} event${eventCount === 1 ? "" : "s"}`
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
