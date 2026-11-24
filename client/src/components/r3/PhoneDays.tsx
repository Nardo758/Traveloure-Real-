/**
 * R3 U3 - the phone surface (board V22): the Days / Map tabs, the day strip, and ONE day open under it.
 *
 * Phone only; the desktop board keeps its own layout. Tokens only (no hex here), and the strings below are DRAFT.
 */
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { BOARD_FILL, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import type { SlipData } from "@/components/plancard/SlipView";
import { r3Columns } from "@/lib/r3-surface";

export type PhoneTab = "days" | "map";

/** "Days" / "Map" - V22's two tabs, drawn as pills under the title. */
export function PhoneTabs({ tab, onChange }: { tab: PhoneTab; onChange: (t: PhoneTab) => void }) {
  const pill = (key: PhoneTab, label: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={tab === key}
      onClick={() => onChange(key)}
      className="h-9 rounded-full border px-4 text-[13px] font-medium"
      style={
        tab === key
          ? { borderColor: BOARD_LINE, backgroundColor: BOARD_FILL, color: BOARD_TEXT }
          : { borderColor: BOARD_LINE, color: BOARD_INK }
      }
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

/** The day strip: Ideas first, then one chip per day, the open day filled with ink. */
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
  return (
    <div className="mt-3 flex items-stretch gap-2 overflow-x-auto pb-1" data-testid="r3-phone-day-strip">
      <button
        type="button"
        aria-pressed={openDay === 0}
        onClick={() => onOpen(0)}
        className="shrink-0 rounded-xl border px-3 py-2 text-center"
        style={
          openDay === 0
            ? { borderColor: BOARD_INK, backgroundColor: BOARD_INK, color: "var(--r3-pin-text)" }
            : { borderColor: BOARD_LINE, color: BOARD_INK }
        }
        data-testid="r3-phone-day-chip"
        data-day="0"
      >
        <span className="block text-[12px] font-semibold">Ideas</span>
        <span className="block text-[11px] opacity-80">{`${ideas}`}</span>
      </button>
      {columns.map((c) => (
        <button
          key={c.day}
          type="button"
          aria-pressed={openDay === c.day}
          onClick={() => onOpen(c.day)}
          className="shrink-0 rounded-xl border px-3 py-2 text-center"
          style={
            openDay === c.day
              ? { borderColor: BOARD_INK, backgroundColor: BOARD_INK, color: "var(--r3-pin-text)" }
              : { borderColor: BOARD_LINE, color: BOARD_INK }
          }
          data-testid="r3-phone-day-chip"
          data-day={c.day}
        >
          <span className="block text-[12px] font-semibold">{c.label.replace(" \u00b7 ", " ")}</span>
          <span className="block text-[11px] opacity-80">{`${c.stops.length}`}</span>
        </button>
      ))}
    </div>
  );
}

/** The open day's stops, or the ideas list when day 0 is open. */
export function PhoneDayBody({ data, openDay }: { data: SlipData; openDay: number }) {
  const columns = r3Columns(data);
  const ideas = ((data as any)?.ideas ?? []) as any[];
  const stops = openDay === 0 ? ideas : columns.find((c) => c.day === openDay)?.stops ?? [];
  return (
    <div className="mt-2 space-y-2" data-testid="r3-phone-day-body" data-day={openDay}>
      {stops.length === 0 ? (
        <p className="text-[12px] text-muted-foreground" data-testid="r3-phone-day-empty">
          {openDay === 0 ? "No ideas saved" : "Nothing here yet"}
        </p>
      ) : null}
      {stops.map((stop: any, i: number) => (
        <article
          key={stop?.id ?? `${openDay}-${i}`}
          className="rounded-xl border bg-card p-3"
          style={{ borderColor: BOARD_LINE }}
          data-testid="r3-phone-stop-card"
        >
          <div className="flex items-start gap-2">
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted-foreground" data-testid="r3-phone-stop-time">{String(stop?.startTime ?? "").slice(0, 5)}</p>
              <p className="text-[15px] font-medium leading-snug text-foreground">{String(stop?.name ?? stop?.title ?? "")}</p>
            </div>
            <button type="button" aria-label="More" className="shrink-0 text-muted-foreground" data-testid="r3-phone-stop-menu">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </article>
      ))}
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed py-2 text-[13px] text-muted-foreground"
        style={{ borderColor: BOARD_LINE }}
        data-testid="r3-phone-add"
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
    </div>
  );
}
