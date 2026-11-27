/**
 * R3 U9 - the ONE stop menu, used by the desktop board and the phone board so the two cannot drift.
 *
 * Entries (Leon, Nov 27 2026): owner - Details, Move, Remove. Expert - Details only. Anyone else: the button is not
 * drawn at all. No Swap, no Move up, no Move down (cut to r3-phase2-list). Idea cards keep their own inert button.
 */
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { BOARD_INK, BOARD_LINE, BOARD_TEXT } from "@/components/r3/tokens";
import { ITEM_MENU_LABELS } from "@/components/plan/ItemRow";
import { MOVE_STOP_COPY } from "@/lib/move-stop";

export type StopMenuRole = "owner" | "expert" | "guest" | string | null | undefined;

export type StopMenuEntry = "details" | "move" | "remove";

export function stopMenuEntries(role: StopMenuRole): StopMenuEntry[] {
  if (role === "owner") return ["details", "move", "remove"];
  if (role === "expert") return ["details"];
  return [];
}

const LABELS: Record<StopMenuEntry, string> = {
  details: ITEM_MENU_LABELS.details,
  move: MOVE_STOP_COPY.menu,
  remove: ITEM_MENU_LABELS.remove,
};

export function StopMenu({
  role,
  variant,
  stopId,
  onSelect,
}: {
  role: StopMenuRole;
  variant: "desktop" | "phone";
  stopId?: string;
  onSelect: (entry: StopMenuEntry, trigger?: HTMLElement | null) => void;
}) {
  const entries = stopMenuEntries(role);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const panel = document.querySelector("[data-r3-stop-menu-panel]");
      if (panel && panel.contains(e.target as Node)) return;
      if (buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (entries.length === 0) return null;

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => itemRefs.current[0]?.focus(), 0);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    const current = itemRefs.current.findIndex((n) => n === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = current < 0 ? 0 : (current + 1) % entries.length;
      itemRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = current <= 0 ? entries.length - 1 : current - 1;
      itemRefs.current[next]?.focus();
    }
  };

  return (
    <div className="relative shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={variant === "phone" ? "w-11 rounded-lg text-muted-foreground" : "mt-0.5 text-muted-foreground"}
        data-testid={variant === "phone" ? "r3-phone-stop-menu" : "r3-stop-menu"}
        data-stop-id={stopId ?? undefined}
      >
        {variant === "phone" ? <MoreHorizontal className="mx-auto h-4 w-4" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
      </button>
      {open ? (
        <div
          role="menu"
          data-r3-stop-menu-panel=""
          data-testid="r3-stop-menu-panel"
          className={
            variant === "phone"
              ? "absolute right-2 top-9 z-20 w-44 rounded-lg border bg-card p-1 shadow-lg"
              : "absolute right-0 top-5 z-30 w-40 rounded-lg border bg-card p-1 shadow-lg"
          }
          style={{ borderColor: BOARD_LINE }}
        >
          {entries.map((entry, i) => (
            <button
              key={entry}
              ref={(n) => {
                itemRefs.current[i] = n;
              }}
              role="menuitem"
              type="button"
              className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] font-medium"
              style={{ color: entry === "remove" ? BOARD_TEXT : BOARD_INK }}
              data-testid={
                entry === "move" && variant === "phone"
                  ? "r3-phone-move"
                  : `r3-stop-menu-${entry}`
              }
              onClick={() => {
                setOpen(false);
                onSelect(entry, buttonRef.current);
              }}
            >
              {LABELS[entry]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
