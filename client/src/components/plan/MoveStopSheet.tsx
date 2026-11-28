/**
 * THE MOVE SHEET (A2; Leon, Nov 20, 2026; board R3_MovePhone) - pick a day, keep the stop's time or pick one,
 * then "Move to {day}". A booked stop shows the one sentence saying why it cannot move, and no choices.
 *
 * The sheet is presentational; `useMoveStop` is its one write - the existing item PATCH, then the plan re-read.
 * The words and the PATCH body are `lib/move-stop.ts`'s.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SLIP_ITEM_ENDPOINTS } from "@/lib/slip-item-tools";
import { invalidatePlan } from "@/components/plancard/SlipItemTools";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MOVE_STOP_COPY, moveDayLong, moveDayOption, moveStopBody, moveStopRefusal, type MoveDay } from "@/lib/move-stop";

export interface MoveStopSheetProps {
  itemId: string;
  stopName: string;
  currentDay: number;
  /** The stop's stored "HH:MM", or null when it has none. */
  time: string | null;
  /** False when the stop's time is not the traveler's to change (a ride, a locked stop): the sheet only keeps it. */
  timeEditable: boolean;
  booked: boolean;
  days: readonly MoveDay[];
  pending: boolean;
  onMove: (body: { dayNumber: number; startTime?: string }) => void;
  onClose: () => void;
}

export function MoveStopSheet({ itemId, stopName, currentDay, time, timeEditable, booked, days, pending, onMove, onClose }: MoveStopSheetProps) {
  const [toDay, setToDay] = useState<number | null>(null);
  // null = keep the stop's time; a string = the picked time (possibly still empty).
  const [picked, setPicked] = useState<string | null>(null);
  const refusal = moveStopRefusal({ booked });
  const target = days.find((d) => d.dayNumber === toDay) ?? null;
  const body = moveStopBody({ currentDay, toDay, pickedTime: picked });
  const choice = "min-h-[44px] rounded-lg border px-3 text-left text-sm";
  const on = "border-[color:var(--slip-navy)] bg-[color:var(--slip-wash)] font-semibold";
  const off = "border-[color:var(--slip-line)]";

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined} data-testid={`move-stop-sheet-${itemId}`}>
        <DialogHeader>
          <DialogTitle>{MOVE_STOP_COPY.title(stopName)}</DialogTitle>
        </DialogHeader>
        {refusal ? (
          <p className="text-sm text-[color:var(--slip-muted)]" data-testid={`move-stop-refusal-${itemId}`}>
            {refusal}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={MOVE_STOP_COPY.title(stopName)}>
              {days.map((d) => {
                const here = d.dayNumber === currentDay;
                const chosen = d.dayNumber === toDay;
                return (
                  <button
                    key={d.dayNumber}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    disabled={here || pending}
                    aria-disabled={here || undefined}
                    // The stop's own day is not a choice, and has to look like one that is not: the sheet is
                    // drawn outside the plan page's colour scope, so the look is opacity, not a slip colour.
                    className={`${choice} ${chosen ? on : off} ${here ? "cursor-not-allowed opacity-50" : ""}`}
                    onClick={() => setToDay(d.dayNumber)}
                    data-testid={`move-stop-day-${d.dayNumber}`}
                  >
                    {moveDayOption(d, currentDay)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {time ? (
                <button type="button" className={`${choice} ${picked == null ? on : off}`} aria-pressed={picked == null} disabled={pending} onClick={() => setPicked(null)} data-testid="move-stop-keep-time">
                  {MOVE_STOP_COPY.keepTime(time)}
                </button>
              ) : null}
              {timeEditable ? (
                <button type="button" className={`${choice} ${picked != null ? on : off}`} aria-pressed={picked != null} disabled={pending} onClick={() => setPicked(picked ?? time ?? "")} data-testid="move-stop-pick-time">
                  {MOVE_STOP_COPY.pickTime}
                </button>
              ) : null}
              {picked != null ? (
                <input
                  type="time"
                  step={300}
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                  disabled={pending}
                  aria-label={MOVE_STOP_COPY.pickTime}
                  className="h-11 rounded-lg border border-[color:var(--slip-line)] px-2 text-sm"
                  data-testid="move-stop-time-input"
                />
              ) : null}
            </div>
            {target ? (
              <Button type="button" className="min-h-[44px]" disabled={!body || pending} onClick={() => body && onMove(body)} data-testid="move-stop-confirm">
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {MOVE_STOP_COPY.confirm(moveDayLong(target))}
              </Button>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The Move sheet's write: PATCH the stop's day (and time, when one was picked), re-read the plan, close. */
export function useMoveStop({ tripId, itemId, onDone }: { tripId: string; itemId: string; onDone: () => void }) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: { dayNumber: number; startTime?: string }) => (await apiRequest("PATCH", SLIP_ITEM_ENDPOINTS.edit(tripId, itemId), body)).json(),
    onSuccess: () => {
      invalidatePlan(tripId);
      onDone();
    },
    onError: (err: any) => toast({ title: MOVE_STOP_COPY.failed, description: err?.message || "Please try again.", variant: "destructive" }),
  });
}
