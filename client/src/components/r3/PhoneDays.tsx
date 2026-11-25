/**
 * R3 U3 - the phone surface, board V22 v2.
 *
 * Days: the two pills, the strip card, a sideways-scrolling day strip (Ideas first, the open day scrolled into view), the
 * hint line, the open day's stops with a Move menu, then the Optimize card and the footer.
 * Map: the pills, the map's own chips in one scrolling row, the map sized to the first screen, the count line, the footer.
 *
 * Phone only (<1024). Tokens only - no hex in this file. Every string is listed as DRAFT in the PR body.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { BOARD_CELL, BOARD_FILL, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import type { SlipData } from "@/components/plancard/SlipView";
import { r3Columns } from "@/lib/r3-surface";
import { MoveStopSheet } from "@/components/plan/MoveStopSheet";

export const PHONE_HINT = "Tap a day to see it. Hold a stop to drag it onto a day above.";
export const PHONE_ADD = "+ Add to this day";

export type PhoneTab = "days" | "map";

/** 44px hit area on every pill and control (board note 8). */
const HIT = "h-11 min-h-11";

export function PhoneTabs({ tab, onChange }: { tab: PhoneTab; onChange: (t: PhoneTab) => void }) {
  const pill = (key: PhoneTab, label: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={tab === key}
      onClick={() => onChange(key)}
      className={`${HIT} rounded-full border px-4 text-[13px] font-medium`}
      style={tab === key ? { borderColor: BOARD_LINE, backgroundColor: BOARD_FILL, color: BOARD_TEXT } : { borderColor: BOARD_LINE, color: BOARD_INK }}
      data-testid={`r3-phone-tab-${key}`}
    >
      {label}
    </button>
  );
  return (
    <div className="mt-3 flex items-center gap-2" data-testid="r3-phone-tabs">
      {pill("days", "Days")}
      {pill("map", "Map")}
    </div>
  );
}

/**
 * One scrolling row. Cells are equal and fixed, sized so four fit at 390 and five only when the trip is short; a longer
 * trip scrolls, the last cell cut off at the edge, and the open day is scrolled into view.
 */
export function PhoneDayStrip({
  data,
  openDay,
  onOpen,
  ideas,
}: {
  data: SlipData;
  openDay: number;
  onOpen: (day: number) => void;
  ideas: number;
}) {
  const columns = r3Columns(data);
  const total = columns.length + 1;
  // <= 5 cells: they share the width (the row fills the screen). Longer trips: fixed cells that scroll, Ideas pinned.
  const fill = total <= 5;
  const cell = fill ? undefined : "70px";
  const openRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    openRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [openDay]);

  const chip = (day: number, label: string, count: number) => {
    const active = openDay === day;
    return (
      <button
        key={day}
        ref={day === openDay ? openRef : undefined}
        type="button"
        aria-pressed={active}
        onClick={() => onOpen(day)}
        className={`${HIT} shrink-0 rounded-xl border px-2 text-center`}
        style={{
          flex: fill ? "1 1 0" : "0 0 84px",
          width: fill ? undefined : 84,
          minWidth: fill ? 0 : 84,
          flexShrink: 0,
          borderColor: active ? BOARD_INK : BOARD_LINE,
          backgroundColor: active ? BOARD_INK : day === 0 ? BOARD_CELL : undefined,
          color: active ? "var(--r3-pin-text)" : BOARD_INK,
          ...(day === 0 ? { position: "sticky", left: 0, zIndex: 30 } : {}),
        }}
        data-testid="r3-phone-day-chip"
        data-day={day}
      >
        <span className="block whitespace-nowrap text-[12px] font-semibold">{label}</span>
        <span className="block text-[11px] opacity-80">{`${count}`}</span>
      </button>
    );
  };

  return (
    <div className={fill ? "mt-3 flex items-stretch gap-2 pb-1" : "mt-3 flex items-stretch gap-2 overflow-x-auto pb-1"} data-testid="r3-phone-day-strip">
      {chip(0, "Ideas", ideas)}
      {columns.map((c) => chip(c.day, c.shortLabel, c.stops.length))}
    </div>
  );
}

/** The open day's stops (or the ideas list), each with the approved Move entry in its menu. */
export function PhoneDayBody({
  data,
  openDay,
  onMoveRequested,
  hasDates = true,
}: {
  data: SlipData;
  openDay: number;
  onMoveRequested: (stop: any) => void;
  hasDates?: boolean;
}) {
  const columns = r3Columns(data);
  const ideas = ((data as any)?.ideas ?? []) as any[];
  const stops = openDay === 0 ? ideas : columns.find((c) => c.day === openDay)?.stops ?? [];
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<any | null>(null);
  const days = columns.map((c) => ({ dayNumber: c.day, label: c.label, count: c.stops.length }));

  return (
    <div className="mt-2 space-y-2" data-testid="r3-phone-day-body" data-day={openDay}>
      {stops.map((stop: any, i: number) => {
        const id = String(stop?.id ?? `${openDay}-${i}`);
        return (
          <article key={id} className="relative rounded-xl border bg-card p-3" style={{ borderColor: BOARD_LINE }} data-testid="r3-phone-stop-card">
            <div className="flex items-start gap-2">
              <GripVertical className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-muted-foreground" data-testid="r3-phone-stop-time">{String(stop?.startTime ?? "").slice(0, 5)}</p>
                <p className="text-[15px] font-medium leading-snug text-foreground" data-testid="r3-phone-stop-name">{String(stop?.name ?? stop?.title ?? "")}</p>
              </div>
              <button
                type="button"
                aria-label="More"
                aria-expanded={menuFor === id}
                onClick={() => setMenuFor((m) => (m === id ? null : id))}
                className={`${HIT} w-11 shrink-0 rounded-lg text-muted-foreground`}
                data-testid="r3-phone-stop-menu"
              >
                <MoreHorizontal className="mx-auto h-4 w-4" />
              </button>
            </div>
            {menuFor === id ? (
              <div className="absolute right-2 top-12 z-20 w-44 rounded-lg border bg-card p-1 shadow-lg" style={{ borderColor: BOARD_LINE }} data-testid="r3-phone-stop-menu-panel">
                <button
                  type="button"
                  className={`${HIT} w-full rounded-lg px-2 text-left text-[14px] font-medium`}
                  style={{ color: BOARD_TEXT }}
                  onClick={() => {
                    setMenuFor(null);
                    setSheetFor(stop);
                  }}
                  data-testid="r3-phone-move"
                >
                  Move
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
      {sheetFor ? (
        <MoveStopSheet
          itemId={String(sheetFor.id)}
          stopName={String(sheetFor.name ?? sheetFor.title ?? "")}
          currentDay={Number(sheetFor.dayNumber ?? openDay)}
          time={String(sheetFor.startTime ?? "") || null}
          timeEditable={false}
          booked={false}
          days={days as any}
          pending={false}
          onMove={(body) => {
            onMoveRequested({ ...sheetFor, dayNumber: body.dayNumber, startTime: body.startTime ?? sheetFor.startTime });
            setSheetFor(null);
          }}
          onClose={() => setSheetFor(null)}
        />
      ) : null}
      <button
        type="button"
        className="flex w-full items-center justify-center rounded-xl border border-dashed py-3 text-[13px] font-medium"
        style={{ borderColor: BOARD_LINE }}
        data-testid="r3-phone-add"
      >
        {openDay === 0 || !hasDates ? "+ Add" : PHONE_ADD}
      </button>
    </div>
  );
}

/** The hint line under the strip; gone after the first successful move. */
export function PhoneHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-2 text-[12px] text-muted-foreground" data-testid="r3-phone-hint">
      {PHONE_HINT}
    </p>
  );
}

export function PhoneBack({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Back" onClick={onClick} className={`${HIT} w-11 rounded-lg text-foreground`} data-testid="r3-phone-back">
      <ArrowLeft className="mx-auto h-5 w-5" />
    </button>
  );
}
