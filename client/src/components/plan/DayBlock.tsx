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
import { usePlanRowLook } from "./row-look";

export interface DayBlockProps {
  /** Stable key for testids — the plan day number, or the slot key for an event-only slot. */
  dayKey: string;
  heading: string;
  stats: string | null;
  defaultOpen?: boolean;
  /** Controlled open state, when the caller needs it (e.g. to open the day a link points into). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Step 6 R-aq: the day's one image (slip: first located stop), drawn under the header when open. */
  photo?: ReactNode;
  /** Step 6: a line beside the header (the Trip Card's "Today", the day's Navigate link). */
  aside?: ReactNode;
  /** R322: the day's jump target (`planDayDomId`), stamped as the section's `id`. */
  domId?: string;
  /** Board look: the day's image as a thumbnail, drawn beside the header while the day is closed. */
  thumb?: ReactNode;
  children: ReactNode;
}

export function DayBlock({ dayKey, heading, stats, defaultOpen = false, open, onOpenChange, photo = null, aside = null, domId, thumb = null, children }: DayBlockProps) {
  const look = usePlanRowLook();
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  if (look === "board") {
    // The Main board's day (ledger `2026-10-08-slip-main-rows`): one card per day, the photo as a
    // band when open and a thumbnail when closed, the day in Fraunces. Same testids, same toggle.
    return (
      <section
        id={domId}
        className="mb-3 overflow-hidden rounded-[var(--slip-radius-card)] border border-[color:var(--slip-line)] bg-[color:var(--slip-card)]"
        data-testid={`slip-day-${dayKey}`}
        data-open={isOpen ? "true" : "false"}
      >
        {isOpen && photo ? <div data-testid={`slip-day-band-${dayKey}`}>{photo}</div> : null}
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 pt-3.5 pb-2.5 text-left"
          onClick={toggle}
          aria-expanded={isOpen}
          data-testid={`slip-day-toggle-${dayKey}`}
        >
          {!isOpen && thumb ? <span className="flex-shrink-0">{thumb}</span> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="slip-display text-xl font-semibold text-[color:var(--slip-ink)]" data-testid={`slip-day-heading-${dayKey}`}>
              {heading}
            </span>
            {stats ? (
              <span className="text-[13px] text-[color:var(--slip-muted)]" data-testid={`slip-day-stats-${dayKey}`}>
                {stats}
              </span>
            ) : null}
          </span>
          <Chevron className="h-5 w-5 flex-shrink-0 text-[color:var(--slip-muted)]" aria-hidden="true" />
        </button>
        {aside ? <div className="px-4 pb-2 text-xs" data-testid={`slip-day-aside-${dayKey}`}>{aside}</div> : null}
        {isOpen ? (
          <div className="pb-1" data-testid={`slip-day-body-${dayKey}`}>
            {children}
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <section id={domId} className="py-2 first:pt-0 last:pb-0" data-testid={`slip-day-${dayKey}`} data-open={isOpen ? "true" : "false"}>
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
      {aside ? <div className="px-3 pl-8 text-xs" data-testid={`slip-day-aside-${dayKey}`}>{aside}</div> : null}
      {isOpen ? (
        <div data-testid={`slip-day-body-${dayKey}`}>
          {photo ? <div className="px-3 pt-1 pb-2">{photo}</div> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
