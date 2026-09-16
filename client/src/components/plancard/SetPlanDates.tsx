/**
 * SetPlanDates — THE MOMENT A TRAVELER PICKS REAL DATES.
 *
 * Punchlist **R-4**, migration 302, ledger `2026-09-15-d22-dates-confirmed`; CLAUDE.md §13, §19,
 * Locked Decisions 30, 34, 42 D16.
 *
 * WHAT WAS MISSING, and it is the whole of R-4's blocker. Dates reached a `trips` row at MINT and
 * never again. The one plan modal's step 3 writes its dates into the `trip_contexts` jsonb for a
 * plan that already exists; `PATCH /api/trips/:tripId/occasion` carries no dates at all; and the
 * owner-gated `PATCH /api/trips/:id` — which always could have taken them — had NO client caller:
 * `useUpdateTrip` had zero call sites anywhere in `client/`, `e2e/` or `playwright/`. So a plan
 * born on a placeholder window (a ready-made clone's `new Date()` + `duration_days - 1`, an
 * authoring build's synthetic anchor, a cart mint's today-fallback) could never stop being one.
 * This is that caller.
 *
 * ONE WRITER, NOT A SECOND RAIL (§18 rule 1). It calls `useUpdateTrip`, which posts to the ONE
 * re-date rail, which writes through `storage.updateTrip` — so Locked Decision 30's `timezone`
 * derivation and Locked Decision 42 D12's `market_slug` one still hang off the same write, and the
 * `dates_confirmed_at` stamp is applied SERVER-SIDE by that one writer. This component sends
 * `startDate` and `endDate` and NOTHING ELSE: a client may change its dates and may never certify
 * them (§19 — `insertTripSchema` omits the column and no pick re-admits it).
 *
 * OWNER ONLY (Locked Decision 42 D16). The slip's edit controls are the owner's; an advisor reads,
 * notes, suggests and messages. The render rule is not the thing that keeps a write out — the
 * route's own gate is — but an advisor pressing "Set your dates" would be choosing the traveler's
 * dates for them, which is not a thing this product does.
 *
 * §13 — WHAT IT SAYS AND WHAT IT REFUSES TO SAY.
 *   * The CHIP, the NOTE and the CTA come from `planDatesLabel` (`shared/plan-dates.ts`) — the ONE
 *     derivation, so the slip, the Trip Card and any later surface word this the same way.
 *   * A CONFIRMED plan renders NOTHING here. "Confirmed dates" is a label nobody needs and the
 *     unmarked case must stay the quiet one.
 *   * The inputs are PRE-FILLED from the plan's current window, and that is honest precisely
 *     because the window is visible beside them: it is a SHOWN DEFAULT the traveler can overwrite,
 *     and nothing is written until they press Save (the one confirmation point Locked Decision 38
 *     draws for the home-city default).
 *   * An inverted range is REFUSED in the dialog rather than repaired. The server refuses it too;
 *     saying so here means the traveler learns which end was wrong instead of watching a request
 *     fail.
 */
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateTrip } from "@/hooks/use-trips";
import { planDatesLabel, type PlanDatesConfirmedAt } from "@shared/plan-dates";

/** `YYYY-MM-DD` for an `<input type="date">`, or "" for anything that is not a real day. */
function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export interface SetPlanDatesProps {
  tripId: string;
  /** `trips.start_date` as the DTO carries it. NOT NULL on the row, so this is always a real day. */
  startDate: string | Date | null | undefined;
  endDate: string | Date | null | undefined;
  /** The plancard DTO's `trip.datesConfirmed` (a boolean), or the raw stamp on a server-ish caller. */
  datesConfirmedAt: PlanDatesConfirmedAt;
  /** Locked Decision 42 D16 — the CTA is the owner's and nobody else's. */
  isOwner: boolean;
}

export function SetPlanDates({
  tripId,
  startDate,
  endDate,
  datesConfirmedAt,
  isOwner,
}: SetPlanDatesProps) {
  const label = planDatesLabel(datesConfirmedAt, isOwner);
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(() => toDateInputValue(startDate));
  const [end, setEnd] = useState(() => toDateInputValue(endDate));
  const updateTrip = useUpdateTrip();

  // Re-seed the shown defaults whenever the plan's own window changes underneath (a refetch after
  // a save, or another surface moving it). Only while CLOSED, so a half-typed answer is never
  // overwritten mid-edit.
  useEffect(() => {
    if (open) return;
    setStart(toDateInputValue(startDate));
    setEnd(toDateInputValue(endDate));
  }, [open, startDate, endDate]);

  // A confirmed plan says nothing at all here.
  if (label.confirmed) return null;

  const inverted = Boolean(start && end && end < start);
  const canSave = Boolean(start && end) && !inverted && !updateTrip.isPending;

  const save = () => {
    if (!canSave) return;
    // ONLY the two dates. The stamp is the server's (§19), and `market_slug`/`timezone` are
    // re-derived by `storage.updateTrip` — nothing about them is sent from here.
    updateTrip.mutate(
      { id: tripId, startDate: start, endDate: end },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <span className="inline-flex items-center gap-1.5" data-testid="slip-dates-placeholder">
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border border-border text-muted-foreground"
        title={label.note ?? undefined}
        data-testid="slip-dates-placeholder-chip"
      >
        <CalendarDays className="w-3 h-3" />
        {label.chip}
      </span>
      {label.cta && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] font-semibold underline underline-offset-2 hover:text-foreground"
          data-testid="slip-dates-set-cta"
        >
          {label.cta}
        </button>
      )}

      {label.cta && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md" data-testid="slip-dates-dialog">
            <DialogHeader>
              <DialogTitle>{label.cta}</DialogTitle>
              <DialogDescription>{label.note}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="slip-dates-start">Start</Label>
                <Input
                  id="slip-dates-start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  data-testid="input-slip-dates-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slip-dates-end">End</Label>
                <Input
                  id="slip-dates-end"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  data-testid="input-slip-dates-end"
                />
              </div>
            </div>
            {inverted && (
              <p className="text-xs text-destructive" data-testid="slip-dates-inverted">
                The end date can't be before the start date.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                onClick={save}
                disabled={!canSave}
                data-testid="button-slip-dates-save"
              >
                {updateTrip.isPending ? "Saving…" : "Save dates"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </span>
  );
}
