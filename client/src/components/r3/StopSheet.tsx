/**
 * R3 U9 - the stop sheet. A right-side panel at 1280, a bottom sheet at 390, as V5 v2 draws the phone.
 *
 * Ruled cut (Leon, Nov 27 2026): header (with the origin chip and, when locked, "Pinned to {day}"), the facts each with
 * their source and checked date, the owner-only "Keep this where it is" switch, the existing ask door, and the
 * "asked" note. Nothing priced, no backup, no Ideas, no host, no booking control, no Details or Official site link.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BOARD_CELL, BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import { itemOriginChip } from "@/lib/item-origin";
import { sheetFactLines } from "@/lib/place-facts";
import { ItemAskLocalPanel } from "@/components/plan/ItemAskLocalPanel";

function pinnedTag(dayLabel: string | null): string | null {
  return dayLabel ? `Pinned to ${dayLabel}` : null;
}

export function StopSheet({
  open,
  tripId,
  stop,
  state,
  dayLabel,
  timeZone,
  role,
  placeFacts,
  askOpen,
  onAskOpen,
  onAskClose,
  onClose,
  onLockedChange,
}: {
  open: boolean;
  tripId: string;
  stop: any;
  state?: "asked" | "quote" | "booked" | null;
  dayLabel: string | null;
  timeZone: string | null | undefined;
  role: string | null | undefined;
  placeFacts: readonly any[] | undefined;
  askOpen: boolean;
  onAskOpen: () => void;
  onAskClose: () => void;
  onClose: () => void;
  onLockedChange?: (locked: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [locked, setLocked] = useState<boolean>(!!stop?.locked);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocked(!!stop?.locked);
    setAskOpen(false);
  }, [stop?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setAskOpen = (v: boolean) => {
    if (v) onAskOpen();
    else onAskClose();
  };

  if (!open) return null;

  const facts = sheetFactLines(placeFacts, timeZone);
  const chip = itemOriginChip(stop?.origin);
  const pinned = stop?.locked ? pinnedTag(dayLabel) : null;
  const isOwner = role === "owner";
  const time = String(stop?.startTime ?? "").slice(0, 5);

  const toggleLock = async () => {
    if (busy) return;
    const next = !locked;
    setBusy(true);
    setLocked(next);
    try {
      const res = await fetch(
        `/api/trips/${encodeURIComponent(tripId)}/itinerary-items/${encodeURIComponent(String(stop?.id ?? ""))}/lock`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locked: next }),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      onLockedChange?.(next);
    } catch {
      // The switch snaps back and no copy is invented.
      setLocked(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="r3-stop-sheet">
      <div
        className="absolute inset-0 bg-black/30"
        data-testid="r3-stop-sheet-backdrop"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={String(stop?.name ?? "Stop")}
        data-sheet="stop"
        className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-2xl border p-4 shadow-xl md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-2xl"
        style={{ backgroundColor: BOARD_CELL, borderColor: BOARD_LINE }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground" data-testid="r3-sheet-time">
              {time}
            </p>
            <p className="text-[16px] font-semibold leading-snug" style={{ color: BOARD_INK }} data-testid="r3-sheet-name">
              {String(stop?.name ?? stop?.title ?? "Stop")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {chip ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ backgroundColor: "rgba(0,0,0,0.05)", color: BOARD_TEXT }}
                  data-testid="r3-sheet-origin"
                >
                  {chip.label}
                </span>
              ) : null}
              {pinned ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ backgroundColor: "rgba(0,0,0,0.05)", color: BOARD_TEXT }}
                  data-testid="r3-sheet-pinned"
                >
                  {pinned}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-muted-foreground"
            data-testid="r3-sheet-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {state === "asked" ? (
          <p className="mt-2 text-[12px] text-muted-foreground" data-testid="r3-sheet-asked-note">
            The host accepts first. Nothing is charged until then.
          </p>
        ) : null}

        {facts.length > 0 ? (
          <ul className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: BOARD_LINE }} data-testid="r3-sheet-facts">
            {facts.map((f: any) => (
              <li key={f.label} data-testid="r3-sheet-fact">
                <p className="text-[13px]" style={{ color: BOARD_INK }}>
                  <span className="text-muted-foreground">{f.label}: </span>
                  {f.text}
                </p>
                <p className="text-[11px] text-muted-foreground">{f.source}</p>
              </li>
            ))}
          </ul>
        ) : null}

        {isOwner ? (
          <div className="mt-3 border-t pt-3" style={{ borderColor: BOARD_LINE }}>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium" style={{ color: BOARD_INK }} data-testid="r3-sheet-keep-label">
                Keep this where it is
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={locked}
                checked={locked}
                disabled={busy}
                onChange={toggleLock}
                className="h-5 w-9"
                data-testid="r3-sheet-keep-switch"
              />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">Optimize and redrafts won't move or remove it</p>
          </div>
        ) : null}

        <div className="mt-3 border-t pt-3" style={{ borderColor: BOARD_LINE }}>
          <button
            type="button"
            className="w-full rounded-lg border px-3 py-2 text-left text-[13px] font-medium"
            style={{ borderColor: BOARD_LINE, color: BOARD_INK }}
            onClick={() => setAskOpen(true)}
            data-testid="r3-sheet-ask"
          >
            Ask an expert
          </button>
          {askOpen ? (
            <div className="mt-2" data-testid="r3-sheet-ask-panel">
              <ItemAskLocalPanel
                tripId={tripId}
                itemId={String(stop?.id ?? "")}
                onClose={() => setAskOpen(false)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
