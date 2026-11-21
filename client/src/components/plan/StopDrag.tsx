/**
 * DRAGGING A STOP ON THE DESKTOP DAYS BOARD (A2 part 2; Leon, Nov 20, 2026; board R3_DaysBoard).
 *
 * `StopDragProvider` holds what is being dragged and where it would land; a row draws its handle and reports
 * the pointer (`StopDragRow`), a day column takes the drop (`useDayDropZone`), and `StopDropSlot` draws the
 * dashed "Drop here" box at the landing place. A mouse drags by the handle (native drag and drop); a finger
 * drags by HOLDING the stop (`useHoldDrag`). Both work in every layout of the plan's days - the desktop
 * board, the phone's strip (whose day chips are landing places too) and the stacked day cards - because the
 * stop menu no longer reorders for the owner (A3; Leon, Nov 21, 2026). The Move sheet stays the way to move
 * a stop with no pointer.
 *
 * The rules and the words are `lib/stop-drag.ts`'s; the writes are the caller's (`onDrop`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SLIP_ITEM_ENDPOINTS } from "@/lib/slip-item-tools";
import { invalidatePlan } from "@/components/plancard/SlipItemTools";
import { MOVE_STOP_COPY } from "@/lib/move-stop";
import { HOLD_DRAG_MS, afterIdForRow, dropHereLabel, dropPlan, holdStillHolding, type DragDay, type DropPlan, type DropTarget } from "@/lib/stop-drag";

interface Dragging {
  itemId: string;
  fromDay: number;
  /** A booked stop: it may take a new place in its own day, never another day. */
  ownDayOnly: boolean;
}

interface StopDragApi {
  days: readonly DragDay[];
  dragging: Dragging | null;
  target: DropTarget | null;
  /** What dropping at `target` would write, or null when it would change nothing or is not allowed. */
  plan: DropPlan | null;
  start: (d: Dragging) => void;
  /** Null = the pointer is over nothing a stop can land on. */
  over: (t: DropTarget | null) => void;
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
  const over = useCallback((t: DropTarget | null) => {
    setTarget((prev) => (prev && t && prev.dayNumber === t.dayNumber && prev.afterId === t.afterId && !!prev.byTime === !!t.byTime ? prev : t));
  }, []);
  const end = useCallback(() => {
    setDragging(null);
    setTarget(null);
  }, []);
  const plan = useMemo(
    () => (dragging ? dropPlan({ itemId: dragging.itemId, fromDay: dragging.fromDay, ownDayOnly: dragging.ownDayOnly, target, days }) : null),
    [dragging, target, days],
  );
  const drop = useCallback(() => {
    if (dragging && plan) onDrop(dragging.itemId, plan);
    end();
  }, [dragging, plan, onDrop, end]);
  const api = useMemo<StopDragApi>(() => ({ days, dragging, target, plan, start: setDragging, over, end, drop }), [days, dragging, target, plan, over, end, drop]);
  return <StopDragContext.Provider value={enabled ? api : null}>{children}</StopDragContext.Provider>;
}

/** The dashed landing box, drawn only at the place the dragged stop would actually move to. */
export function StopDropSlot({ dayNumber, afterId }: { dayNumber: number; afterId: string | null }) {
  const drag = useStopDrag();
  if (!drag?.dragging || !drag.target || drag.target.byTime || drag.target.dayNumber !== dayNumber || drag.target.afterId !== afterId) return null;
  const day = drag.days.find((d) => d.dayNumber === dayNumber);
  if (!day || !drag.plan) return null;
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
export function StopDragRow({ itemId, dayNumber, dayItemIds, draggable, ownDayOnly = false, children }: { itemId: string; dayNumber: number | null; dayItemIds: readonly string[]; draggable: boolean; ownDayOnly?: boolean; children: ReactNode }) {
  const drag = useStopDrag();
  const rowRef = useRef<HTMLDivElement>(null);
  useHoldDrag(rowRef, { enabled: !!drag && draggable && dayNumber != null, itemId, dayNumber, ownDayOnly });
  if (!drag || dayNumber == null) return <>{children}</>;
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!drag.dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const box = e.currentTarget.getBoundingClientRect();
    drag.over({ dayNumber, afterId: afterIdForRow({ rowId: itemId, dayItemIds, upperHalf: e.clientY < box.top + box.height / 2 }) });
  };
  const lifted = drag.dragging?.itemId === itemId;
  return (
    <>
      <div
        ref={rowRef}
        // On a touch screen a held finger is a drag here, so the stop's text is not selectable by it.
        className={`flex items-start gap-1 ${draggable ? "[-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none" : ""} ${lifted ? "rounded-xl opacity-60 ring-2 ring-[color:var(--slip-navy)]" : ""}`}
        onDragOver={onDragOver}
        data-drag-row={itemId}
        data-drag-day={dayNumber}
        data-testid={`stop-drag-row-${itemId}`}
      >
        {draggable ? (
          <span
            aria-hidden="true"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", itemId);
              if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 12, 12);
              drag.start({ itemId, fromDay: dayNumber, ownDayOnly });
            }}
            onDragEnd={drag.end}
            className="mt-3 cursor-grab select-none font-mono text-sm leading-none tracking-[-2px] text-[color:var(--slip-muted)]"
            data-drag-handle=""
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
 * What is under the finger: a day chip (`data-drop-day`), a place among a day's stops (`data-drag-row`), a
 * day's own space (`data-drop-column`), the landing box itself (undefined = keep the place it marks), or
 * nothing (null).
 */
function holdTargetAt(x: number, y: number, days: readonly DragDay[]): DropTarget | null | undefined {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest('[data-testid="stop-drop-slot"]')) return undefined;
  const chip = el.closest<HTMLElement>("[data-drop-day]");
  if (chip) return { dayNumber: Number(chip.dataset.dropDay), afterId: null, byTime: true };
  const row = el.closest<HTMLElement>("[data-drag-row]");
  if (!row) {
    // A day's own space (the board's column, a day card): after that day's last stop.
    const column = el.closest<HTMLElement>("[data-drop-column]");
    return column ? { dayNumber: Number(column.dataset.dropColumn), afterId: column.dataset.dropLast || null } : null;
  }
  const dayNumber = Number(row.dataset.dragDay);
  const dayItemIds = days.find((d) => d.dayNumber === dayNumber)?.items.map((i) => i.id) ?? [];
  const box = row.getBoundingClientRect();
  return { dayNumber, afterId: afterIdForRow({ rowId: row.dataset.dragRow!, dayItemIds, upperHalf: y < box.top + box.height / 2 }) };
}

/**
 * The phone's hold-to-drag. A finger that rests on the stop for `HOLD_DRAG_MS` without drifting starts the
 * drag; one that moves first is a scroll and is left alone. Once dragging, the page no longer scrolls under
 * the finger (the touchmove listener is non-passive for exactly that), the target is whatever is under it,
 * and lifting the finger drops. Native listeners: React's own touch handlers are passive and cannot hold
 * the page still.
 */
function useHoldDrag(rowRef: RefObject<HTMLDivElement>, opts: { enabled: boolean; itemId: string; dayNumber: number | null; ownDayOnly: boolean }) {
  const drag = useStopDrag();
  const live = useRef(drag);
  live.current = drag;
  const { enabled, itemId, dayNumber, ownDayOnly } = opts;
  useEffect(() => {
    const el = rowRef.current;
    if (!enabled || !el || dayNumber == null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startAt: { x: number; y: number } | null = null;
    let active = false;
    const cancelTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    // The handle is also a mouse-drag source. While a finger is down it is not, so a touch screen's own
    // long-press drag never runs beside this one; nor does its long-press menu.
    const handle = () => el.querySelector<HTMLElement>("[data-drag-handle]");
    const onMenu = (e: Event) => {
      if (startAt) e.preventDefault();
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startAt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      handle()?.setAttribute("draggable", "false");
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        active = true;
        live.current?.start({ itemId, fromDay: dayNumber, ownDayOnly });
      }, HOLD_DRAG_MS);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (!active) {
        if (startAt && !holdStillHolding(startAt, { x: t.clientX, y: t.clientY })) cancelTimer();
        return;
      }
      e.preventDefault();
      const target = holdTargetAt(t.clientX, t.clientY, live.current?.days ?? []);
      if (target !== undefined) live.current?.over(target);
    };
    const finish = (drop: boolean) => {
      cancelTimer();
      startAt = null;
      handle()?.setAttribute("draggable", "true");
      if (!active) return;
      active = false;
      if (drop) live.current?.drop();
      else live.current?.end();
    };
    const onEnd = () => finish(true);
    const onCancel = () => finish(false);
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    el.addEventListener("contextmenu", onMenu);
    return () => {
      cancelTimer();
      el.removeEventListener("contextmenu", onMenu);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [rowRef, enabled, itemId, dayNumber, ownDayOnly]);
}

/**
 * A day column as a drop zone. Over the column's own space (not a row) the stop lands after the day's last
 * stop; the drop itself is taken here for the whole column, rows included.
 */
export function useDayDropZone(
  dayNumber: number | null,
  lastItemId: string | null,
): { onDragOver?: (e: DragEvent<HTMLElement>) => void; onDrop?: (e: DragEvent<HTMLElement>) => void; "data-drop-column"?: number; "data-drop-last"?: string; "data-drop-over"?: "true" } {
  const drag = useStopDrag();
  if (!drag || dayNumber == null) return {};
  const over = !!drag.plan && !drag.target?.byTime && drag.target?.dayNumber === dayNumber;
  return {
    // Read by the finger's hit test (`holdTargetAt`); the mouse uses the two handlers below.
    "data-drop-column": dayNumber,
    "data-drop-last": lastItemId ?? "",
    "data-drop-over": over ? "true" : undefined,
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
