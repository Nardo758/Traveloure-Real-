/**
 * ST-1 — the stop's time, edited in place on the slip (decision-maker, Oct 12, 2026 — ledger
 * `2026-10-12-st1-stop-time-edit`). Owner only; the caller decides who sees it.
 *
 *   cell   the time column's content: a button at least 44px tall showing the time, or "Add a time"
 *   panel  under the title: the reason a time can't change (a ride, a past day, a booking), or the editor —
 *          a time input in 5-minute steps, the lock's note when locked, Save / Cancel
 *
 * Save sends `{ startTime }` (rounded to the nearest 5 minutes) through the EXISTING item PATCH, which moves
 * the end with the stop's own duration (P0-b item 10; a stop with no duration keeps its end), re-sorts the
 * day by time and queues the leg recompute. The rule and every word are `@shared/stop-time-edit`'s.
 */
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SLIP_ITEM_ENDPOINTS } from "@/lib/slip-item-tools";
import { invalidatePlan } from "@/components/plancard/SlipItemTools";
import { STOP_TIME_ADD_LABEL, roundToFiveMinutes, type StopTimeRule } from "@shared/stop-time-edit";

export function useStopTimeEdit({
  tripId,
  itemId,
  time,
  rule,
}: {
  tripId: string;
  itemId: string;
  /** The stop's stored "HH:MM", or empty/null when it has none. */
  time: string | null | undefined;
  rule: StopTimeRule;
}): { cell: ReactNode; panel: ReactNode } {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const save = useMutation({
    mutationFn: async (startTime: string) => {
      const res = await apiRequest("PATCH", SLIP_ITEM_ENDPOINTS.edit(tripId, itemId), { startTime });
      return res.json();
    },
    onSuccess: () => {
      invalidatePlan(tripId);
      setOpen(false);
      toast({ title: "Time saved" });
    },
    onError: (err: any) => toast({ title: "Couldn't save that time", description: err?.message || "Please try again.", variant: "destructive" }),
  });
  const shown = (time ?? "").trim();
  const cell = (
    <button
      type="button"
      className={`-ml-1 flex min-h-[44px] w-full items-start rounded-md px-1 pt-0.5 text-left tabular-nums hover:bg-[color:var(--slip-wash)] ${shown ? "" : "text-xs font-medium text-[color:var(--slip-muted)]"}`}
      onClick={() => {
        if (!open) setValue(shown);
        setOpen((o) => !o);
      }}
      aria-expanded={open}
      aria-label={shown ? `Change the time, ${shown}` : STOP_TIME_ADD_LABEL}
      data-testid={`button-edit-time-${itemId}`}
    >
      {shown ? <span data-testid={`slip-item-time-${itemId}`}>{shown}</span> : STOP_TIME_ADD_LABEL}
    </button>
  );
  if (!open) return { cell, panel: null };
  if (!rule.editable) {
    return {
      cell,
      panel: (
        <p className="text-xs text-[color:var(--slip-muted)]" data-testid={`slip-item-time-reason-${itemId}`}>
          {rule.reason}
        </p>
      ),
    };
  }
  const rounded = roundToFiveMinutes(value);
  return {
    cell,
    panel: (
      <div className="mt-1 flex flex-wrap items-center gap-2" data-testid={`slip-item-time-editor-${itemId}`}>
        <input
          type="time"
          step={300}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Time"
          data-testid={`input-item-time-${itemId}`}
        />
        <Button
          size="sm"
          className="h-9 px-3"
          disabled={!rounded || save.isPending}
          onClick={() => rounded && save.mutate(rounded)}
          data-testid={`button-save-time-${itemId}`}
        >
          {save.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-9 px-2" onClick={() => setOpen(false)} data-testid={`button-cancel-time-${itemId}`}>
          Cancel
        </Button>
        {rule.note ? (
          <p className="basis-full text-xs text-[color:var(--slip-muted)]" data-testid={`slip-item-time-note-${itemId}`}>
            {rule.note}
          </p>
        ) : null}
      </div>
    ),
  };
}
