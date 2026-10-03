/**
 * `DayBlock` — the ONE day renderer (surface spec v1.2 §3 / §10, R-c; step 1, ledger
 * `2026-10-03-surface-step1-item-row`). Replaces the slip's inline day loop; the Trip Card's
 * `DaySelector` and the Workstation's grouping move onto it in steps 6–7.
 *
 * Header: "<Wkd> · <Mon d>" and, under it, "N stops · <areas> · hours on K" (`@/lib/plan-day`).
 * Collapsible; the caller decides which day starts open (the slip opens the first). `LegRow`s between
 * rows arrive with step 3/9 — the day's legs render where the caller puts them today.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface DayBlockProps {
  /** Stable key for testids — the plan day number, or the slot key for an event-only slot. */
  dayKey: string;
  heading: string;
  stats: string | null;
  defaultOpen?: boolean;
  /** Controlled open state, when the caller needs it (e.g. to open the day a link points into). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function DayBlock({ dayKey, heading, stats, defaultOpen = false, open, onOpenChange, children }: DayBlockProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  return (
    <section className="py-2 first:pt-0 last:pb-0" data-testid={`slip-day-${dayKey}`} data-open={isOpen ? "true" : "false"}>
      <button
        type="button"
        className="flex w-full items-start gap-1.5 px-3 pt-1 pb-0.5 text-left"
        onClick={toggle}
        aria-expanded={isOpen}
        data-testid={`slip-day-toggle-${dayKey}`}
      >
        <Chevron className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0">
          <span
            className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            data-testid={`slip-day-heading-${dayKey}`}
          >
            {heading}
          </span>
          {stats ? (
            <span className="block text-xs text-muted-foreground" data-testid={`slip-day-stats-${dayKey}`}>
              {stats}
            </span>
          ) : null}
        </span>
      </button>
      {isOpen ? <div data-testid={`slip-day-body-${dayKey}`}>{children}</div> : null}
    </section>
  );
}
