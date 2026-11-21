/**
 * DRAGGING A STOP ON THE DESKTOP DAYS BOARD (A2 part 2; Leon, Nov 20, 2026; board R3_DaysBoard).
 *
 * `StopDragProvider` holds what is being dragged and where it would land; a row draws its handle and reports
 * the pointer (`StopDragRow`), a day column takes the drop (`useDayDropZone`), and `StopDropSlot` draws the
 * dashed "Drop here" box at the landing place. Native drag and drop: desktop only, which is where the board
 * is. The Move sheet stays the way to move a stop without a pointer, and on a phone.
 *
 * The rules and the words are `lib/stop-drag.ts`'s; the writes are the caller's (`onDrop`).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SLIP_ITEM_ENDPOINTS } from "@/lib/slip-item-tools";
import { invalidatePlan } from "@/components/plancard/SlipItemTools";
import { MOVE_STOP_COPY } from "@/lib/move-stop";
import { afterIdForRow, dropHereLabel, dropPlan, type DragDay, type DropPlan, type DropTarget } from "@/lib/stop-drag";

interface Dragging {
  itemId: string;
  fromDay: number;
}

interface StopDragApi {
  days: readonly DragDay[];
  dragging: Dragging | null;
  target: DropTarget | null;
  start: (d: Dragging) => void;
  over: (t: DropTarget) => void;
  end: () => void;
  drop: () => void;
}

const StopDragContext = createContext<StopDragApi | null>(null);

/** Null off the days board: nothing is draggable and nothing is a drop zone. */
export function useStopDrag(): StopDragApi | null {
  return useContext(StopDragContext);
}

/** `enabled` false (off the board, or not the owner) draws the children with no drag at all. */
export function StopDragProvider({ enabled, days, onDrop, children }: { enabled: boolean; days: readonly DragDay[]; onDrop: (itemId: string, plan: DropPlan) => void; children: ReactNode }) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const over = useCallback((t: DropTarget) => {
    setTarget((prev) => (prev && prev.dayNumber === t.dayNumber && prev.afterId === t.afterId ? prev : t));
  }, []);
  const end = useCallback(() => {
    setDragging(null);
    setTarget(null);
  }, []);
  const drop = useCallback(() => {
    if (dragging) {
      const plan = dropPlan({ itemId: dragging.itemId, fromDay: dragging.fromDay, target, days });
      if (plan) onDrop(dragging.itemId, plan);
    }
    end();
  }, [dragging, target, days, onDrop, end]);
  const api = useMemo<StopDragApi>(() => ({ days, dragging, target, start: setDragging, over, end, drop }), [days, dragging, target, over, end, drop]);
  return <StopDragContext.Provider value={enabled ? api : null}>{children}</StopDragContext.Provider>;
}

/** The dashed landing box, drawn only at the place the dragged stop would actually move to. */
export function StopDropSlot({ dayNumber, afterId }: { dayNumber: number; afterId: string | null }) {
  const drag = useStopDrag();
  if (!drag?.dragging || !drag.target || drag.target.dayNumber !== dayNumber || drag.target.afterId !== afterId) return null;
  const day = drag.days.find((d) => d.dayNumber === dayNumber);
  if (!day || !dropPlan({ itemId: drag.dragging.itemId, fromDay: drag.dragging.fromDay, target: drag.target, days: drag.days })) return null;
  return (
    <div
      className="my-2 rounded-xl border-2 border-dashed border-[color:var(--slip-navy)] bg-[color:var(--slip-wash)] px-2.5 py-3.5 text-center text-[12.5px] font-semibold text-[color:var(--slip-navy)]"
      // The box sits under the pointer once drawn: it keeps the landing place it marks, so the column's own
      // "after the last stop" rule never moves it out from under the pointer.
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      data-testid="stop-drop-slot"
    >
      {dropHereLabel(day, afterId)}
    </div>
  );
}

/**
 * A stop's row on the board: its handle (when it may be dragged), the row, and the landing box after it. Every
 * row reports the pointer, draggable or not, so a stop can be dropped after a stop that cannot itself move.
 */
export function StopDragRow({ itemId, dayNumber, dayItemIds, draggable, children }: { itemId: string; dayNumber: number | null; dayItemIds: readonly string[]; draggable: boolean; children: ReactNode }) {
  const drag = useStopDrag();
  const rowRef = useRef<HTMLDivElement>(null);
  if (!drag || dayNumber == null) return <>{children}</>;
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!drag.dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.getBoundingClientRect();
    drag.over({ dayNumber, afterId: afterIdForRow({ rowId: itemId, dayItemIds, upperHalf: e.clientY < box.top + box.height / 2 }) });
  };
  return (
    <>
      <div ref={rowRef} className="flex items-start gap-1" onDragOver={onDragOver} data-testid={`stop-drag-row-${itemId}`}>
        {draggable ? (
          <span
            aria-hidden="true"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", itemId);
              if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 12, 12);
              drag.start({ itemId, fromDay: dayNumber });
            }}
            onDragEnd={drag.end}
            className="mt-3 cursor-grab select-none font-mono text-sm leading-none tracking-[-2px] text-[color:var(--slip-muted)]"
            data-testid={`stop-drag-handle-${itemId}`}
          >
            ⋮⋮
          </span>
        ) : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <StopDropSlot dayNumber={dayNumber} afterId={itemId} />
    </>
  );
}

/**
 * A day column as a drop zone. Over the column's own space (not a row) the stop lands after the day's last
 * stop; the drop itself is taken here for the whole column, rows included.
 */
export function useDayDropZone(dayNumber: number | null, lastItemId: string | null): { onDragOver?: (e: DragEvent<HTMLElement>) => void; onDrop?: (e: DragEvent<HTMLElement>) => void } {
  const drag = useStopDrag();
  if (!drag || dayNumber == null) return {};
  return {
    onDragOver: (e) => {
      if (!drag.dragging) return;
      e.preventDefault();
      drag.over({ dayNumber, afterId: lastItemId });
    },
    onDrop: (e) => {
      if (!drag.dragging) return;
      e.preventDefault();
      drag.drop();
    },
  };
}

/**
 * A drop's writes, in order: the item PATCH moves the stop to the day (the server keeps its time), then the
 * reorder route sets that day's order. The plan is re-read whether or not they both land, so the board never
 * shows a place the server does not hold.
 */
export function useStopDrop(tripId: string) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ itemId, plan }: { itemId: string; plan: DropPlan }) => {
      if (plan.move) await apiRequest("PATCH", SLIP_ITEM_ENDPOINTS.edit(tripId, itemId), plan.move);
      if (plan.reorder) await apiRequest("POST", SLIP_ITEM_ENDPOINTS.reorder(tripId), plan.reorder);
    },
    onError: (err: any) => toast({ title: MOVE_STOP_COPY.failed, description: err?.message || "Please try again.", variant: "destructive" }),
    onSettled: () => invalidatePlan(tripId),
  });
}
