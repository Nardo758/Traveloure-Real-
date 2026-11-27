/**
 * R3 P1 - the V1 days board (`board-V1-days-board-1280.png`).
 *
 * Ideas FIRST, then one 180px column per day, each stop a card with its handle and menu, and a dashed Add at every
 * column's foot. The grouping is `r3Columns` (the `r3Stops` source), so the board and the footer count one list.
 *
 * U9: the menu is `StopMenu` (owner: Details, Move, Remove; expert: Details only), a stop can carry one "asked for"
 * tag, and a removed stop is filtered out while its 10 seconds run. Board text only, all DRAFT.
 */
import { useState } from "react";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { BOARD_COLUMN, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import type { SlipData } from "@/components/plancard/SlipView";
import { r3Columns, r3Ideas } from "@/lib/r3-surface";
import { StopMenu, type StopMenuEntry } from "@/components/r3/StopMenu";
import { MoveStopSheet } from "@/components/plan/MoveStopSheet";
import { stopStateFor, stopStateTagLabel, type StopState, type QuoteForState } from "@/lib/r3-stop-state";

function stopTime(stop: any): string {
  const raw = stop?.startTime ?? stop?.time ?? null;
  if (typeof raw !== "string" || !raw) return "";
  return raw.slice(0, 5);
}

const COLUMN = { width: 180 } as const;

/** V5 names the day by its weekday ("Pinned to Tue"), so both boards pass the same word. */
export function weekdayOf(column: { shortLabel?: string; label?: string }): string {
  const short = String(column?.shortLabel ?? "").trim();
  if (short) return short.split(/\s+/)[0];
  return String(column?.label ?? "").split(/\s+/)[0] ?? "";
}

export function DaysBoard({
  data,
  role,
  quotes,
  hiddenIds,
  onDetails,
  onRemove,
  onMoveRequested,
}: {
  data: SlipData;
  role?: string | null;
  quotes?: readonly QuoteForState[];
  hiddenIds?: ReadonlySet<string>;
  onDetails?: (stop: any, dayLabel: string, trigger?: HTMLElement | null) => void;
  onRemove?: (stop: any, dayLabel: string) => void;
  onMoveRequested?: (stop: any) => void;
}) {
  const columns = r3Columns(data);
  const ideas = r3Ideas(data);
  const [moveStop, setMoveStop] = useState<any | null>(null);

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
          <span className="text-[11px] text-muted-foreground" data-testid="r3-ideas-count">{`${ideas.length} · no day yet`}</span>
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
            {col.stops.filter((s: any) => !hiddenIds?.has(String(s?.id ?? ""))).map((stop: any, i: number) => {
              const state: StopState | null = stopStateFor(stop, quotes);
              return (
                <article key={stop?.id ?? `${col.day}-${i}`} className="rounded-lg border bg-card p-2" style={{ borderColor: BOARD_LINE }} data-testid="r3-stop-card" data-stop-id={String(stop?.id ?? "")}>
                  <div className="flex items-start gap-1">
                    <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground" data-testid="r3-stop-time">{stopTime(stop)}</p>
                      <div className="flex flex-wrap items-start gap-x-1">
                        <p className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug text-foreground" data-testid="r3-stop-name">{String(stop?.name ?? stop?.title ?? "")}</p>
                        {state ? (
                          <span className="mt-0.5 max-w-full shrink-0 whitespace-normal break-words rounded-full px-1.5 py-0.5 text-left text-[10px] leading-tight" style={{ backgroundColor: "rgba(0,0,0,0.05)", color: BOARD_TEXT }} data-testid="r3-stop-state" data-state={state}>
                            {stopStateTagLabel(state)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <StopMenu
                      role={role}
                      variant="desktop"
                      stopId={String(stop?.id ?? "")}
                      onSelect={(entry: StopMenuEntry, trigger) => {
                        if (entry === "details") onDetails?.(stop, weekdayOf(col), trigger);
                        else if (entry === "move") setMoveStop(stop);
                        else if (entry === "remove") onRemove?.(stop, col.label);
                      }}
                    />
                  </div>
                </article>
              );
            })}
            {col.stops.length === 0 ? <p className="text-[12px] text-muted-foreground" data-testid="r3-day-empty">Nothing here yet</p> : null}
            <button type="button" className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-[12px] text-muted-foreground" style={{ borderColor: BOARD_LINE }} data-testid="r3-day-add">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </section>
      ))}

      {moveStop ? (
        <MoveStopSheet
          itemId={String(moveStop.id)}
          stopName={String(moveStop.name ?? moveStop.title ?? "")}
          currentDay={Number(moveStop.dayNumber ?? 1)}
          time={String(moveStop.startTime ?? "") || null}
          timeEditable={false}
          booked={!!moveStop.booking}
          days={columns.map((c) => ({ dayNumber: c.day, label: c.label })) as any}
          pending={false}
          onMove={(body: any) => {
            onMoveRequested?.({ ...moveStop, dayNumber: body.dayNumber, startTime: body.startTime ?? moveStop.startTime });
            setMoveStop(null);
          }}
          onClose={() => setMoveStop(null)}
        />
      ) : null}
    </div>
  );
}
