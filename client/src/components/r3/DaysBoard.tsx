/**
 * R3 P1 - the V1 days board (`board-V1-days-board-1280.png`).
 *
 * Ideas FIRST, then one 180px column per day, each stop a card with its handle and menu, and a dashed Add at every
 * column's foot. The grouping is `r3Columns` (the `r3Stops` source), so the board and the footer count one list.
 *
 * Board text only, all DRAFT: `Ideas`, `{n} · no day yet`, `Add`, `{n} stops`, `Nothing here yet`, the date heading.
 */
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { BOARD_COLUMN, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import type { SlipData } from "@/components/plancard/SlipView";
import { r3Columns, r3Ideas } from "@/lib/r3-surface";

function stopTime(stop: any): string {
  const raw = stop?.startTime ?? stop?.time ?? null;
  if (typeof raw !== "string" || !raw) return "";
  return raw.slice(0, 5);
}

const COLUMN = { width: 180 } as const;

export function DaysBoard({ data }: { data: SlipData }) {
  const columns = r3Columns(data);
  const ideas = r3Ideas(data);

  return (
    <div className="mt-4 flex items-start gap-3 overflow-x-auto pb-1" data-testid="r3-days-board">
      {/* Ideas first (board V1): heading, "{n} · no day yet", its cards, and a dashed Add. Empty = heading + Add only. */}
      <section
        className="shrink-0 rounded-xl border p-3"
        style={{ ...COLUMN, borderColor: BOARD_LINE, backgroundColor: BOARD_COLUMN }}
        data-testid="r3-ideas-column"
      >
        <header className="flex items-baseline justify-between gap-1">
          <p className="text-[12px] font-semibold" style={{ color: BOARD_INK }} data-testid="r3-ideas-title">Ideas</p>
          <span className="text-[11px] text-muted-foreground" data-testid="r3-ideas-count">{`${ideas.length} \u00b7 no day yet`}</span>
        </header>
        <div className="mt-2 space-y-2">
          {ideas.map((idea: any, i: number) => (
            <article key={idea?.id ?? `idea-${i}`} className="rounded-lg border bg-card p-2" style={{ borderColor: BOARD_LINE }} data-testid="r3-idea-card">
              <div className="flex items-start gap-1">
                <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">{String(idea?.name ?? idea?.title ?? "")}</p>
                <button type="button" aria-label="More" className="mt-0.5 shrink-0 text-muted-foreground" data-testid="r3-idea-menu"><MoreHorizontal className="h-3.5 w-3.5" /></button>
              </div>
            </article>
          ))}
          <button type="button" className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-[12px] text-muted-foreground" style={{ borderColor: BOARD_LINE }} data-testid="r3-ideas-add">
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
      </section>

      {columns.map((col) => (
        <section
          key={col.day}
          className="shrink-0 rounded-xl border p-3"
          style={{ ...COLUMN, borderColor: BOARD_LINE, backgroundColor: BOARD_COLUMN }}
          data-testid="r3-day-column"
          data-day={col.day}
        >
          <header className="flex items-baseline justify-between gap-1">
            <p className="text-[12px] font-semibold" style={{ color: BOARD_INK }} data-testid="r3-day-label">{col.label}</p>
            <span className="text-[11px] text-muted-foreground" data-testid="r3-day-count">{`${col.stops.length} stops`}</span>
          </header>
          <div className="mt-2 space-y-2">
            {col.stops.map((stop: any, i: number) => (
              <article key={stop?.id ?? `${col.day}-${i}`} className="rounded-lg border bg-card p-2" style={{ borderColor: BOARD_LINE }} data-testid="r3-stop-card">
                <div className="flex items-start gap-1">
                  <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground" data-testid="r3-stop-time">{stopTime(stop)}</p>
                    <p className="text-[13px] font-medium leading-snug text-foreground" data-testid="r3-stop-name">{String(stop?.name ?? stop?.title ?? "")}</p>
                  </div>
                  <button type="button" aria-label="More" className="mt-0.5 shrink-0 text-muted-foreground" data-testid="r3-stop-menu"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                </div>
              </article>
            ))}
            {col.stops.length === 0 ? <p className="text-[12px] text-muted-foreground" data-testid="r3-day-empty">Nothing here yet</p> : null}
            <button type="button" className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-[12px] text-muted-foreground" style={{ borderColor: BOARD_LINE }} data-testid="r3-day-add">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
