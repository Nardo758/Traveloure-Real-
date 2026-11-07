/**
 * PLAN-3 (P2-D): one day's body inside a version column of the by-day compare.
 *
 * Collapsed, an unchanged day is a line ("Same as draft") and a reveal control; revealed, it draws the
 * version's stops for that day. Extracted from `VersionsBoard` so the reveal can be rendered and
 * asserted directly — an identical day used to carry no stops at all, so revealing it drew nothing.
 */
import type { DayColumn } from "@/lib/versions-board";
import { BOARD_DRAG_MIME, encodeDrag, type BoardDrag } from "@/lib/versions-board";

/** A draggable element's props. Shared by the board's day handles and this body's stops. */
export function dragProps(d: BoardDrag) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(BOARD_DRAG_MIME, encodeDrag(d));
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    },
  };
}

export function VersionDayBody({
  c,
  dayNumber,
  expanded,
  onReveal,
}: {
  c: DayColumn;
  dayNumber: number;
  expanded: boolean;
  onReveal: () => void;
}) {
  if (c.identical && !expanded) {
    return (
      <div className="mt-0.5">
        <p className="text-[color:var(--slip-muted)]" data-testid={`versions-desk-same-${c.label}-${dayNumber}`}>
          Same as draft
        </p>
        <button
          type="button"
          className="mt-1 text-[11px] font-semibold text-[color:var(--slip-navy)] underline-offset-2 hover:underline"
          onClick={onReveal}
          data-testid={`versions-desk-show-${c.label}-${dayNumber}`}
        >
          Show the day anyway
        </button>
      </div>
    );
  }
  return (
    <ol className="mt-1 space-y-0.5">
      {c.stops.map((st) => (
        <li
          key={st.id}
          {...dragProps({ kind: "swap", variantId: c.variantId, dayNumber, variantItemId: st.id })}
          className="rounded px-1 text-[color:var(--slip-ink)] hover:bg-[color:var(--slip-wash)]"
          data-testid={`versions-desk-stop-${st.id}`}
        >
          {st.startTime ? <span className="text-[color:var(--slip-muted)]">{st.startTime} </span> : null}
          {st.name}
        </li>
      ))}
    </ol>
  );
}
