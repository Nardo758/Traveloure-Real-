/**
 * Row 193 (dispatch CB-2026-10-25-A): the context line on the Optimize comparison
 * page. It replaces the removed destination reads with what the plan itself knows.
 *
 * BUSY AROUND YOUR DATES reads ONLY the plancard's per-day `busyBus` flag (row 58, ledger
 * `2026-10-19-fb1-busy-bus`): the committed official holiday list, the ruled fixed spans and the
 * admin-entered `season_windows_<market>` setting, on a plan with confirmed dates. A day without the
 * flag, or without a calendar day (`dateIso`), contributes nothing; no flagged day ⇒ `null` and the
 * page renders nothing — never a placeholder (§13).
 */
import type { BusyBusReason } from "@shared/busy-bus";

export const BUSY_AROUND_DATES_LABEL = "Busy around your dates";

export interface BusyBearingDay {
  /** The producer's display day ("Fri, Oct 2"). */
  date: string;
  dateIso?: string | null;
  busyBus?: { reason: BusyBusReason; cityName: string } | null;
}

export function busyAroundDatesLine(days: readonly BusyBearingDay[] | null | undefined): string | null {
  const parts: string[] = [];
  for (const d of days ?? []) {
    if (!d?.dateIso || !d.date || !d.busyBus?.reason) continue;
    parts.push(`${d.date} (${d.busyBus.reason})`);
  }
  if (parts.length === 0) return null;
  return `${BUSY_AROUND_DATES_LABEL}: ${parts.join(" · ")}`;
}
