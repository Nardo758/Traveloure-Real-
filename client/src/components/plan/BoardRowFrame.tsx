/**
 * THE MAIN BOARD'S ROW GRID (slip conformance, boards rev 15; ledger `2026-10-08-slip-main-rows`):
 * a 52px time column, an 18px dot rail, the stop, and a 44px ⋯. Used by `ItemRow` and by the travel
 * rows that are not items (`TravelAnchorPlaceholder`), under the board look only (`./row-look`).
 */
import type { ReactNode } from "react";

/** The rail's dot: a FIXED point (teal, haloed), a travel row nothing has fixed (navy), a stop whose
 *  hours were checked (teal), a stop with no checked hours (an open navy ring), or — the Handoff
 *  board — a stop whose pen an expert holds (gold). */
export type BoardDot = "anchor" | "travel" | "checked" | "open" | "pen";

export function boardDotFor(input: { anchorFromTool?: string | null; isAnchor: boolean; hasFacts: boolean; withExpert?: boolean }): BoardDot {
  if (input.isAnchor) return input.anchorFromTool ? "anchor" : "travel";
  if (input.withExpert) return "pen";
  return input.hasFacts ? "checked" : "open";
}

const BOARD_DOT_CLASS: Record<BoardDot, string> = {
  anchor: "mt-[5px] h-3 w-3 rounded-full bg-[color:var(--slip-teal)] shadow-[0_0_0_3px_var(--slip-teal-halo)]",
  travel: "mt-[5px] h-2.5 w-2.5 rounded-full bg-[color:var(--slip-navy)]",
  checked: "mt-[5px] h-2.5 w-2.5 rounded-full bg-[color:var(--slip-teal)]",
  open: "mt-[5px] h-2.5 w-2.5 rounded-full border-2 border-[color:var(--slip-navy)] bg-[color:var(--slip-card)]",
  pen: "mt-[5px] h-2.5 w-2.5 rounded-full bg-[color:var(--slip-gold)]",
};

export function BoardRowFrame({
  time,
  timeTestId,
  dot,
  menu = null,
  children,
}: {
  time: string | null;
  timeTestId?: string;
  dot: BoardDot;
  menu?: ReactNode;
  children: ReactNode;
}) {
  const fixed = dot === "anchor";
  return (
    <div
      className={`grid grid-cols-[52px_18px_minmax(0,1fr)_44px] gap-x-2 pl-4 pr-3 ${fixed ? "bg-[color:var(--slip-anchor-wash)] pt-2" : ""}`}
      data-board-dot={dot}
    >
      <div
        className={`pt-0.5 text-[13px] font-semibold tabular-nums ${fixed ? "text-[color:var(--slip-teal-ink)]" : "text-[color:var(--slip-navy)]"}`}
        data-testid={time ? timeTestId : undefined}
      >
        {time}
      </div>
      <div className="flex flex-col items-center" aria-hidden="true">
        <div className={BOARD_DOT_CLASS[dot]} />
        <div className="mt-1 w-0.5 flex-1 bg-[color:var(--slip-line)]" />
      </div>
      <div className="flex min-w-0 flex-col gap-1 pb-3">{children}</div>
      <div className="-mt-2">{menu}</div>
    </div>
  );
}

