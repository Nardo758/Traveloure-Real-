/**
 * THE SLIP'S TWO ANCHOR PANELS (Lane E1, ledger `2026-10-08-e1-zero-questions`; decision-maker, Oct 8,
 * 2026 — rulings 6 and 7). A plan started from the Experiences page carries an occasion and a city and
 * nothing else; the slip asks the rest, INLINE — nothing leaves the slip.
 *
 *   `InlineDatesPanel` — "Set your dates": the ONE re-date rail (`PATCH /api/trips/:id`), which stamps
 *                        `dates_confirmed_at` server-side (§19). Never a dialog.
 *   `DatesGate`        — wraps an action that needs real dates (Draft it with AI, Optimize, Trip Pass, a
 *                        leg's travel options). Confirmed dates ⇒ the action runs; a placeholder window ⇒
 *                        the dates panel opens right there and, once saved, the action CONTINUES with
 *                        the saved dates.
 *   `InlineWhoPanel`   — "Who's coming?": adults, children and the pets pair (R340: a kind and a count),
 *                        through the existing pick-based occasion PATCH (§19). An empty field is never
 *                        sent as an answer (§13: unanswered is not "no pet", not "0 children").
 */
import { DEFAULT_ADULTS } from "@shared/plan-vocabulary";
import { api } from "@shared/routes";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanDatesCalendar } from "@/components/plan/PlanDatesCalendar";
import { initialRange, isoDay, validateRange, type DayRange } from "@/lib/plan-dates-range";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { writePlanAnswersToContext } from "@/lib/trip-context";
import { PLAN_PARTY_ASK, planDatesGateLine } from "@shared/plan-dates";

export interface PlanWindow {
  startDate: string;
  endDate: string;
}

const dayOf = isoDay;

function invalidatePlan(tripId: string) {
  void queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/plancard`] });
  void queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
  void queryClient.invalidateQueries({ queryKey: [api.trips.get.path, tripId] }); // ENTRY-1: the slip header's trip read
}

/**
 * Pure. Can this window be saved? Both days, leave ON or AFTER arrive (same-day trips allowed —
 * cut-list #1 slice B). `inverted` is the one refusal: a leave day before the arrive day.
 */
export function datesPanelCanSave(start: string, end: string): { ok: boolean; inverted: boolean } {
  const v = validateRange(start, end);
  return { ok: v === "ok", inverted: v === "leave_before_arrive" };
}

/**
 * The slip's dates panel. Cut-list #1 slice B: it draws THE range calendar (`PlanDatesCalendar`) —
 * no second picker — and it no longer seeds dates nobody chose: `datesConfirmed === false` opens on
 * an empty calendar ("Add dates") instead of the placeholder window. Confirmed dates still prefill.
 * The write is unchanged: the ONE re-date rail (`PATCH /api/trips/:id`), or the guest's own rail.
 */
export function InlineDatesPanel({
  tripId,
  startDate,
  endDate,
  datesConfirmed,
  intro,
  onSaved,
  onCancel,
  onSkip,
  testId = "slip-dates-panel",
  submit,
}: {
  tripId: string;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  /** The plan's `datesConfirmed`; `false` opens empty (no prefill). Omitted reads as confirmed. */
  datesConfirmed?: boolean | null;
  /** The sentence above the fields (the gate's line); the header's panel says nothing extra. */
  intro?: string | null;
  onSaved?: (dates: PlanWindow) => void;
  onCancel?: () => void;
  /** Slice C's first add only: renders "Skip for now". */
  onSkip?: () => void;
  testId?: string;
  /** GATE-1B: the guest plan saves through its own rail (PATCH /api/guest-plans/current); the slip omits this. */
  submit?: (dates: PlanWindow) => Promise<void>;
}) {
  const [range, setRange] = useState<DayRange>(() => initialRange({ startDate, endDate, datesConfirmed }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async ({ startDate: start, endDate: end }: PlanWindow) => {
    if (saving || validateRange(start, end) !== "ok") return;
    setSaving(true);
    setError(null);
    try {
      if (submit) {
        await submit({ startDate: start, endDate: end });
      } else {
        // ONLY the two dates: the stamp is the server's (§19); market and zone are re-derived there.
        await apiRequest("PATCH", `/api/trips/${tripId}`, { startDate: start, endDate: end });
        // Row PS-3 (audit D3): the pen carries the dates the row now holds, so the edit window agrees.
        writePlanAnswersToContext(tripId, { startDate: start, endDate: end });
        invalidatePlan(tripId);
      }
      onSaved?.({ startDate: start, endDate: end });
    } catch (e: any) {
      setError(e?.message || "Couldn't save your dates");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2" data-testid={testId}>
      {intro ? (
        <p className="text-sm" data-testid={`${testId}-intro`}>
          {intro}
        </p>
      ) : null}
      <PlanDatesCalendar
        value={range}
        onChange={setRange}
        onSave={(d) => void save(d)}
        saving={saving}
        onSkip={onSkip}
        testId={`${testId}-calendar`}
        trailing={
          onCancel ? (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel} data-testid={`${testId}-cancel`}>
              Not now
            </Button>
          ) : null
        }
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Pure. Does an action need the dates panel first? `undefined` (a payload before the field) reads as confirmed. */
export function datesGateBlocks(datesConfirmed: boolean | undefined): boolean {
  return datesConfirmed === false;
}

export function DatesGate({
  trip,
  action,
  children,
  testId,
}: {
  trip: { id: string; startDate?: string | Date | null; endDate?: string | Date | null; datesConfirmed?: boolean };
  /** The action's own name, for the line ("Draft it with AI"). */
  action: string;
  /** Render the control; call `guard(run)` from its click. `run` receives the window to use. */
  children: (guard: (run: (dates: PlanWindow) => void) => void) => ReactNode;
  testId: string;
}) {
  const [pending, setPending] = useState<((dates: PlanWindow) => void) | null>(null);
  const guard = (run: (dates: PlanWindow) => void) => {
    if (!datesGateBlocks(trip.datesConfirmed)) {
      run({ startDate: dayOf(trip.startDate), endDate: dayOf(trip.endDate) });
      return;
    }
    setPending(() => run);
  };
  return (
    <>
      {children(guard)}
      {pending ? (
        <InlineDatesPanel
          tripId={trip.id}
          startDate={trip.startDate}
          endDate={trip.endDate}
          datesConfirmed={trip.datesConfirmed}
          intro={planDatesGateLine(action)}
          testId={testId}
          onSaved={(dates) => {
            const run = pending;
            setPending(null);
            run(dates);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

export interface PartyAnswers {
  adults?: number | null;
  kids?: number | null;
  petKind?: string | null;
  petCount?: number | null;
}

/**
 * Pure. The occasion-PATCH body for what the traveler typed: a field left EMPTY is not sent at all
 * (§13 — unanswered, never 0); a pet kind with no count, or a count with no kind, is sent as given.
 * Null when nothing was answered.
 */
export function partyPanelBody(input: { adults: string; kids: string; petKind: string; petCount: string }): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  const n = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const adults = n(input.adults);
  const kids = n(input.kids);
  const petCount = n(input.petCount);
  if (adults !== undefined && Number.isInteger(adults) && adults >= 1) body.adults = adults;
  if (kids !== undefined && Number.isInteger(kids) && kids >= 0) body.kids = kids;
  if (input.petKind.trim()) body.petKind = input.petKind.trim().slice(0, 60);
  if (petCount !== undefined && Number.isInteger(petCount) && petCount >= 0) body.petCount = petCount;
  return Object.keys(body).length ? body : null;
}

export function InlineWhoPanel({
  tripId,
  current,
  onSaved,
  onCancel,
  submit,
}: {
  tripId: string;
  current: PartyAnswers;
  onSaved?: () => void;
  onCancel?: () => void;
  /**
   * GATE-1B: the guest plan saves adults and children through its own rail and has no pet columns, so with
   * `submit` the pets fieldset is not drawn and no pet answer is sent.
   */
  submit?: (party: { adults?: number | null; kids?: number | null }) => Promise<void>;
}) {
  const s = (v: number | string | null | undefined) => (v == null ? "" : String(v));
  // R3-4 (round 3 ruling): the panel opens at two adults when the plan states none, so Save is ready. Shown, not
  // stored: nothing is written until the traveler saves (LD 33 — an untouched party is NULL).
  const [adults, setAdults] = useState(s(current.adults ?? DEFAULT_ADULTS));
  const [kids, setKids] = useState(s(current.kids));
  const [petKind, setPetKind] = useState(s(current.petKind));
  const [petCount, setPetCount] = useState(s(current.petCount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setAdults(s(current.adults ?? DEFAULT_ADULTS));
    setKids(s(current.kids));
    setPetKind(s(current.petKind));
    setPetCount(s(current.petCount));
  }, [current.adults, current.kids, current.petKind, current.petCount]);
  const body = partyPanelBody(submit ? { adults, kids, petKind: "", petCount: "" } : { adults, kids, petKind, petCount });

  const save = async () => {
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Row PS-3 (audit D3): the pen carries the party the row now holds, for the keys this save sent.
      const party: { adults?: number | null; kids?: number | null } = {};
      if ("adults" in body) party.adults = body.adults as number | null;
      if ("kids" in body) party.kids = body.kids as number | null;
      if (submit) {
        await submit(party);
      } else {
        await apiRequest("PATCH", `/api/trips/${tripId}/occasion`, body);
        writePlanAnswersToContext(tripId, party);
        invalidatePlan(tripId);
      }
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || "Couldn't save who's coming");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3" data-testid="slip-who-panel">
      <p className="text-sm font-semibold">{PLAN_PARTY_ASK}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="slip-who-adults">Adults</Label>
          <Input id="slip-who-adults" type="number" min={1} inputMode="numeric" value={adults} onChange={(e) => setAdults(e.target.value)} data-testid="input-slip-who-adults" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="slip-who-kids">Children</Label>
          <Input id="slip-who-kids" type="number" min={0} inputMode="numeric" value={kids} onChange={(e) => setKids(e.target.value)} data-testid="input-slip-who-kids" />
        </div>
      </div>
      {submit ? null : (
      <fieldset className="space-y-1">
        <legend className="text-sm">Bringing a pet?</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="slip-who-pet-kind">Kind</Label>
            <Input id="slip-who-pet-kind" placeholder="e.g. dog" maxLength={60} value={petKind} onChange={(e) => setPetKind(e.target.value)} data-testid="input-slip-who-pet-kind" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="slip-who-pet-count">How many</Label>
            <Input id="slip-who-pet-count" type="number" min={0} max={20} inputMode="numeric" value={petCount} onChange={(e) => setPetCount(e.target.value)} data-testid="input-slip-who-pet-count" />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground" data-testid="slip-who-service-animal">
          Service animals aren't pets and aren't counted here.
        </p>
      </fieldset>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive" data-testid="slip-who-error">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={!body || saving} data-testid="button-slip-who-save">
          {saving ? "Saving…" : "Save"}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} data-testid="button-slip-who-cancel">
            Not now
          </Button>
        ) : null}
      </div>
    </div>
  );
}

