/**
 * T-3 facts re-check (surface spec v1.3.4 R-ad, R-v; step 6 — ledger `2026-10-04-step6-trip-card`).
 * The `facts-recheck` job re-reads a plan's stops 3 days before it starts; a conflict it finds is
 * recorded ONCE per plan as a `trip_recheck_conflict` notice (pushed once), and the Trip Card's banner
 * reads that notice — nothing is computed on page load. Pure: the words and the conflict rule.
 */
import { findingLine, type Finding } from "./optimizer-lead";

export const FACTS_RECHECK_DAYS_BEFORE = 3;
export const FACTS_RECHECK_NOTICE_TYPE = "trip_recheck_conflict";

/**
 * The kinds a re-check reports. FD-3 (ledger `2026-10-10-fd3-feasibility`, ruling 1): the last-entry,
 * visit-end and last-ride checks join the set, so a stored official fact that moved is re-read at T-3.
 */
const RECHECK_CONFLICT_KINDS: ReadonlySet<string> = new Set([
  "closed_on_arrival",
  "after_last_admission",
  "closes_before_visit_end",
  "last_service_missed",
  "timed_entry_conflict",
]);

/** The findings a re-check reports: a stop reached while closed, or a timed entry that clashes. */
export function recheckConflicts(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => RECHECK_CONFLICT_KINDS.has(f.kind) && f.count > 0);
}

export const RECHECK_BANNER_SWAP = "Swap";
export const RECHECK_BANNER_ASK_NOBODY = "Ask a local";

/** The banner's line: "Hours re-checked 8 Nov · 1 stop is reached when it's closed". */
export function recheckBannerLine(conflicts: readonly Finding[], checkedLabel: string | null): string | null {
  if (!conflicts.length) return null;
  const what = conflicts.map((f) => findingLine(f)).join(" · ");
  return checkedLabel ? `Hours re-checked ${checkedLabel} · ${what}` : `Hours re-checked · ${what}`;
}

/** "Ask <expert>" when an advisor is on the plan; otherwise the R-m interest door's words. */
export function recheckAskLabel(expertFirstName: string | null | undefined): string {
  const n = (expertFirstName ?? "").trim();
  return n ? `Ask ${n}` : RECHECK_BANNER_ASK_NOBODY;
}

/** Pure. Is a plan 3 days from starting, on the UTC calendar the job runs on? */
export function isRecheckDay(startDate: string | Date | null | undefined, now: Date): boolean {
  const iso = startDate instanceof Date ? startDate.toISOString().slice(0, 10) : typeof startDate === "string" ? startDate.slice(0, 10) : null;
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + FACTS_RECHECK_DAYS_BEFORE));
  return target.toISOString().slice(0, 10) === iso;
}
