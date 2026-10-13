/**
 * AP-1 — the ONE save-then-warn confirmation for the three slip add surfaces (the add form, saved places, the
 * map add; ledger `2026-10-13-ap1-save-then-warn`). The stop is already SAVED when this draws: it never blocks,
 * offers no undo, and says what the checks found — the stop's hours and the way into it — asking the check
 * read again every 2 s, at most 5 times, while something is still arriving. When it settles it refreshes the
 * plan once, so the Optimize card and the rows show the same answer.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ADD_CHECKS_POLL_MS, type StopChecks } from "@shared/add-checks";
import { ADDED_TO_PLAN_TITLE } from "@/lib/plan-vocabulary";
import { addChecksLines, pollAddChecks } from "@/lib/add-checks";

export interface AddedStop {
  itemId: string;
  checks: StopChecks;
}

/** The check read's URL — one home for the surfaces and the hook. */
export function addChecksUrl(tripId: string, itemId: string): string {
  return `/api/trips/${tripId}/itinerary-items/${itemId}/checks`;
}

/**
 * Poll the check read from the POST's first answer. `fetcher` is injectable for tests; `onSettled` fires once
 * when nothing more is arriving (or the polls ran out).
 */
export function useAddChecks(
  tripId: string,
  added: AddedStop | null,
  opts: { fetcher?: (url: string) => Promise<StopChecks | null>; intervalMs?: number; onSettled?: () => void } = {},
): StopChecks | null {
  const [checks, setChecks] = useState<StopChecks | null>(added?.checks ?? null);
  const onSettled = useRef(opts.onSettled);
  onSettled.current = opts.onSettled;
  const fetcher = useRef(opts.fetcher);
  fetcher.current = opts.fetcher;
  const interval = opts.intervalMs ?? ADD_CHECKS_POLL_MS;

  useEffect(() => {
    setChecks(added?.checks ?? null);
    if (!added) return;
    const url = addChecksUrl(tripId, added.itemId);
    return pollAddChecks({
      initial: added.checks,
      read: async () => {
        if (fetcher.current) return fetcher.current(url);
        const res = await fetch(url, { credentials: "include" });
        return res.ok ? ((await res.json()) as StopChecks) : null;
      },
      onUpdate: setChecks,
      onSettled: () => onSettled.current?.(),
      intervalMs: interval,
    });
  }, [tripId, added?.itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  return checks;
}

export function AddChecksNotice({
  tripId,
  added,
  title,
  onDismiss,
  onSettled,
  fetcher,
  intervalMs,
  testId = "add-checks-notice",
}: {
  tripId: string;
  added: AddedStop | null;
  /** The confirmation's heading; defaults to "Added to your plan". */
  title?: string;
  onDismiss: () => void;
  onSettled?: () => void;
  fetcher?: (url: string) => Promise<StopChecks | null>;
  intervalMs?: number;
  testId?: string;
}) {
  const checks = useAddChecks(tripId, added, { fetcher, intervalMs, onSettled });
  if (!added || !checks) return null;
  const { lines, footer } = addChecksLines(checks);
  return (
    <div role="status" aria-live="polite" className="mt-2 w-full rounded-md border border-border bg-background p-2.5 text-xs" data-testid={testId}>
      <div className="flex items-start gap-2">
        <p className="flex-1 font-semibold text-foreground" data-testid={`${testId}-title`}>
          {title ?? ADDED_TO_PLAN_TITLE}
        </p>
        <button type="button" aria-label="Dismiss" className="text-muted-foreground hover:text-foreground" onClick={onDismiss} data-testid={`${testId}-dismiss`}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {lines.map((l, i) => (
          <li key={i} data-testid={`${testId}-line`}>
            {l}
          </li>
        ))}
      </ul>
      {footer && (
        <p className="mt-1 text-[11px] text-muted-foreground" data-testid={`${testId}-footer`}>
          {footer}
        </p>
      )}
    </div>
  );
}
