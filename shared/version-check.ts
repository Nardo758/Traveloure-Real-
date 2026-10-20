/**
 * FB-1 step 3 (decision-maker Leon Dixon, Oct 18, 2026 — step 3 rulings 1–5; ledger `2026-10-18-fb1-version-gate`):
 * a paid version is checked with the ONE plan checker (`checkPlan`) and compared with the draft it came from.
 *
 *   • FAILS when it leaves a draft issue unresolved or adds an issue the draft did not have (ruling 2).
 *   • NOT CHECKED never fails. A version on which fewer checks ran than on the draft still passes, and says so
 *     (`coverage.reduced`).
 *   • A failing version is HELD (ruling 1): stored with status `held`, never shown or adopted; its findings are
 *     metric rows (ruling 3). Regeneration is step 3b.
 *   • Version A is "Your plan, fixed" (ruling 5): the draft with its own fixes applied, gated like B and C.
 *
 * Pure — no database, no network.
 */
import { clockLabel, parseDayHours, type FindingKind } from "./optimizer-lead";
import { isPlanAnchorItemType } from "./draft-basis";
import { optionPickOf } from "./version-options";
import { checkPlan, feasibilityView, isFlagOnlyIssue, type PlanCheckInput, type PlanCheckResult, type PlanIssue } from "./plan-check";

/** The status a version is stored with when it fails the check. The board, adopt and apply never read it. */
export const HELD_VARIANT_STATUS = "held" as const;

/** True for a version a traveler may see or adopt. */
export function isShownVariantStatus(status: string | null | undefined): boolean {
  return status !== HELD_VARIANT_STATUS;
}

/** A version row that is a stay pick or a plan anchor (lodging), never a stop — the board and the check read this one rule. */
export const isVersionStayPick = (r: { sortOrder: number | null; serviceType: string | null; metadata: unknown }): boolean =>
  (r.sortOrder ?? 0) < 0 || !!optionPickOf(r.metadata) || isPlanAnchorItemType(r.serviceType);

/** Version A's name (ruling 5). B and C keep their strategy names. */
export const FIXED_VERSION_NAME = "Your plan, fixed";

/**
 * Pure. How many checks ran on a plan: a stop's hours read for its date, its last entry, a ride whose last
 * departures were known, a day the path findings read, a day with an energy row. Used only to tell whether a
 * version was checked less than its draft.
 */
export function checkCoverage(input: PlanCheckInput): number {
  const ctx = feasibilityView(input);
  let n = 0;
  for (const t of ctx.timed) {
    const h = ctx.hours.get(t.id);
    if (h && t.startTime && t.dateIso && parseDayHours(h.weekdayDescriptions, new Date(`${t.dateIso}T00:00:00Z`).getUTCDay())) n += 1;
    if (t.startTime && ctx.lastEntry.has(t.id)) n += 1;
  }
  n += ctx.rides.filter((r) => r.lastDepartures.length > 0).length;
  const days = new Map<number, boolean>();
  for (const s of input.stops) days.set(s.dayNumber, (days.get(s.dayNumber) ?? true) && s.point !== null);
  n += Array.from(days.values()).filter(Boolean).length;
  n += new Set(input.energy.map((e) => e.dayNumber)).size;
  return n;
}

export interface CheckedPlan {
  input: PlanCheckInput;
  result: PlanCheckResult;
}

export interface VersionVerdict {
  passes: boolean;
  /** Draft issues the version still has. */
  unresolved: PlanIssue[];
  /** Issues the version has that the draft did not. */
  added: PlanIssue[];
  /** Draft finding kinds the version could not check at all — never a failure (ruling 2). */
  notCheckable: FindingKind[];
  coverage: { draft: number; version: number; reduced: boolean };
}

/**
 * The key an issue is matched by across the draft and a version. A stop issue is about the PLACE — the draft item
 * the version stop keeps (`sourceItemId`), whatever day it moved to; a stop the version added is its own. A day issue
 * (path, pace) is about its day.
 */
function issueKey(issue: PlanIssue, sourceOf: ReadonlyMap<string, string | null> | null): string {
  if (!issue.stop) return `${issue.type}|day:${issue.day}`;
  const source = sourceOf ? sourceOf.get(issue.stop.itemId) ?? `new:${issue.stop.itemId}` : issue.stop.itemId;
  return `${issue.type}|item:${source}`;
}

/** Finding kinds a plan can check at all, from its inputs. Pace needs energy rows; the rest run on any plan. */
function checkableKinds(input: PlanCheckInput): Set<FindingKind> {
  const all: FindingKind[] = [
    "leg_unreachable", "closed_on_arrival", "after_last_admission", "closes_before_visit_end", "last_service_missed",
    "timed_entry_conflict", "city_crossing", "walking_saved_km", "pace_over",
  ];
  return new Set(all.filter((k) => k !== "pace_over" || input.energy.length > 0));
}

/**
 * Pure. THE GATE (ruling 2). `sourceOf` maps each version stop id to the draft item it keeps (null for a new stop).
 */
export function compareVersionToDraft(draft: CheckedPlan, version: CheckedPlan, sourceOf: ReadonlyMap<string, string | null>): VersionVerdict {
  const versionCan = checkableKinds(version.input);
  // FB-1 step 5c: a flag-only issue (`isFlagOnlyIssue`) is shown on every version but never resolved, added or
  // counted as not checkable here — no version can reserve a slot.
  const draftIssues = draft.result.issues.filter((i) => !isFlagOnlyIssue(i));
  const versionIssues = version.result.issues.filter((i) => !isFlagOnlyIssue(i));
  const notCheckable = Array.from(new Set(draftIssues.map((i) => i.type).filter((k) => !versionCan.has(k))));
  const draftKeys = new Set(draftIssues.map((i) => issueKey(i, null)));
  const versionKeys = new Map(versionIssues.map((i) => [issueKey(i, sourceOf), i] as const));
  const unresolved = draftIssues.filter((i) => versionCan.has(i.type) && versionKeys.has(issueKey(i, null))).map((i) => versionKeys.get(issueKey(i, null))!);
  const added = versionIssues.filter((i) => !draftKeys.has(issueKey(i, sourceOf)));
  const d = checkCoverage(draft.input);
  const v = checkCoverage(version.input);
  return {
    passes: unresolved.length === 0 && added.length === 0,
    unresolved,
    added,
    notCheckable,
    coverage: { draft: d, version: v, reduced: v < d || notCheckable.length > 0 },
  };
}

/** Pure. Check a version and compare it with its draft in one call. */
export function gateVersion(draft: CheckedPlan, versionInput: PlanCheckInput, sourceOf: ReadonlyMap<string, string | null>): { result: PlanCheckResult; verdict: VersionVerdict } {
  const result = checkPlan(versionInput);
  return { result, verdict: compareVersionToDraft(draft, { input: versionInput, result }, sourceOf) };
}

export interface CheckMetricRow {
  metricKey: string;
  metricLabel: string;
  value: string;
  unit: string;
  betterIsLower: boolean;
  description: string | null;
}

/** The metric key prefix every check row carries; nothing else in `itinerary_variant_metrics` starts with it. */
export const CHECK_METRIC_PREFIX = "check_";

/**
 * Pure. Ruling 3: one row per finding kind the version has (`check_<kind>`, value = count, the why codes in the
 * description), plus `check_unresolved`, `check_added` and `check_coverage_reduced` (1 when reduced, else 0).
 * `stage` names the point in the run the check was made at (`sequencing` rows carry the suffix `_after_sequencing`).
 */
export function versionCheckMetricRows(result: PlanCheckResult, verdict: VersionVerdict, stage: "legs" | "sequencing" = "legs"): CheckMetricRow[] {
  const suffix = stage === "sequencing" ? "_after_sequencing" : "";
  const whys = (issues: readonly PlanIssue[]) => Array.from(new Set(issues.map((i) => i.why))).join(", ") || null;
  const rows: CheckMetricRow[] = [];
  if (stage === "legs") {
    for (const f of result.allFindings) {
      const of = result.issues.filter((i) => i.type === f.kind);
      rows.push({ metricKey: `${CHECK_METRIC_PREFIX}${f.kind}`, metricLabel: `Check: ${f.kind}`, value: String(f.count), unit: "count", betterIsLower: true, description: whys(of) });
    }
  }
  rows.push(
    { metricKey: `${CHECK_METRIC_PREFIX}unresolved${suffix}`, metricLabel: "Check: draft issues unresolved", value: String(verdict.unresolved.length), unit: "count", betterIsLower: true, description: whys(verdict.unresolved) },
    { metricKey: `${CHECK_METRIC_PREFIX}added${suffix}`, metricLabel: "Check: issues added", value: String(verdict.added.length), unit: "count", betterIsLower: true, description: whys(verdict.added) },
  );
  if (stage === "legs") {
    rows.push({
      metricKey: `${CHECK_METRIC_PREFIX}coverage_reduced`,
      metricLabel: "Check: fewer checks than the draft",
      value: verdict.coverage.reduced ? "1" : "0",
      unit: "flag",
      betterIsLower: true,
      description: `checks ${verdict.coverage.version} of the draft's ${verdict.coverage.draft}${verdict.notCheckable.length ? `; not checkable: ${verdict.notCheckable.join(", ")}` : ""}`,
    });
  }
  return rows;
}

function hhmm(min: number): string {
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Pure. One fix as an instruction for the model, naming the stop by its [S#] tag (`refOf`). */
export function fixPromptLine(issue: PlanIssue, refOf: (itemId: string) => string | null): string {
  const stop = issue.stop ? `${refOf(issue.stop.itemId) ? `[${refOf(issue.stop.itemId)}] ` : ""}${issue.stop.title}` : null;
  const f = issue.fix;
  switch (f.action) {
    case "retime": {
      const parts = [f.notBeforeMin != null ? `no earlier than ${hhmm(f.notBeforeMin)}` : null, f.notAfterMin != null ? `no later than ${hhmm(f.notAfterMin)}` : null].filter(Boolean);
      return `Day ${f.day}: start ${stop} ${parts.join(" and ")} (${issue.why}).`;
    }
    case "move_day":
      return `Day ${f.day}: move ${stop} to another day of the trip (${issue.why}).`;
    case "move_clear_of_anchor":
      return `Day ${f.day}: keep ${stop} clear of the fixed time it overlaps (${issue.why}).`;
    case "reorder_day":
      return `Day ${f.day}: re-sequence the day's stops so it does not double back across the city (${issue.why}).`;
    case "lighten_day":
      return `Day ${f.day}: move one stop off this day to ease the pace (${issue.why}).`;
    // Flag-only: `fixedVersionDescriptor` never passes one; a line only because the switch is exhaustive.
    case "book_ahead":
      return `Day ${f.day}: keep ${stop}; its timed slot is reserved on the official site (${issue.why}).`;
  }
}

/** Pure. Version A's descriptor for the prompt (ruling 5): the traveler's plan with the draft's own fixes applied. */
export function fixedVersionDescriptor(draftIssues: readonly PlanIssue[], refOf: (itemId: string) => string | null): { name: string; goal: string; strategy: string } {
  // FB-1 step 5c: a flag-only issue is never a change the model is asked to make.
  const fixes = draftIssues.filter((i) => !isFlagOnlyIssue(i)).map((i) => fixPromptLine(i, refOf));
  return {
    name: FIXED_VERSION_NAME,
    goal: "Keep the traveler's own plan and fix the problems found in it — change nothing else.",
    strategy: fixes.length
      ? `Keep every stop the traveler chose, in their days, and make only these changes:\n  ${fixes.join("\n  ")}`
      : "No problems were found in the plan; keep it as it is, with the same stops on the same days.",
  };
}

// ── FB-1 step 3 ruling 4: the words when no version clears every problem (FOUNDER WORDING REVIEW on the PR) ──

/** The lead line, verbatim from ruling 4. No retry, no apology, nothing partial shown as passed. */
export const NO_VERSION_PASSES_LEAD = "We couldn’t make a version of this plan that clears every problem. Here’s what’s still in the way:";

/** A passing version on which fewer checks ran than on the draft says so (ruling 2). */
export const COVERAGE_REDUCED_LINE = "Fewer checks could run on this version than on your plan.";

const WHY_TEXT: Record<PlanIssue["why"], string> = {
  before_opening: "starts before it opens",
  after_closing: "starts after it closes",
  closed_day: "is closed that day",
  closed_date: "is closed on that date",
  closes_early: "closes before your visit ends",
  after_last_entry: "starts after last entry",
  leg_too_long: "can’t be reached in time from the stop before",
  after_last_service: "the ride after it leaves after the last departure",
  overlaps_anchor: "overlaps a fixed time on your plan",
  crosses_city: "crosses the city more than once",
  walking_saved: "has a shorter walking order",
  recovery_needed: "is too full",
  timed_entry_required: "needs a timed slot reserved on the official site",
};

/** Pure. One open issue, as the traveler reads it: "Stop · Day N — why", or "Day N — why" for a day issue. */
export function issueLine(issue: PlanIssue): string {
  const why = WHY_TEXT[issue.why];
  return issue.stop ? `${issue.stop.title} · Day ${issue.day} — ${why}` : `Day ${issue.day} — ${why}`;
}

/** Pure. The issue's one fix, as the traveler reads it. Clock times are 12-hour (`clockLabel`). */
export function fixLine(issue: PlanIssue): string {
  const f = issue.fix;
  switch (f.action) {
    case "retime":
      if (f.notBeforeMin != null && f.notAfterMin != null) return `Fix: start it between ${clockLabel(f.notBeforeMin)} and ${clockLabel(f.notAfterMin)}.`;
      if (f.notBeforeMin != null) return `Fix: start it at ${clockLabel(f.notBeforeMin)} or later.`;
      return `Fix: start it by ${clockLabel(f.notAfterMin!)}.`;
    case "move_day":
      return "Fix: move it to another day.";
    case "move_clear_of_anchor":
      return "Fix: move it clear of that fixed time.";
    case "reorder_day":
      return "Fix: reorder this day’s stops.";
    case "lighten_day":
      return "Fix: move a stop off this day.";
    // FB-1 step 5c (FOUNDER WORDING REVIEW on the PR).
    case "book_ahead":
      return "Fix: reserve a slot on the official site.";
  }
}

/**
 * FB-1 step 3b: the draft's `retime` fixes as one start window per draft item (minutes after midnight). Several fixes on
 * one stop combine — the latest `notBefore`, the earliest `notAfter`. Read by the paid run's sequencing.
 */
export function retimeWindowsByItem(issues: readonly PlanIssue[]): Map<string, { notBeforeMin?: number; notAfterMin?: number }> {
  const out = new Map<string, { notBeforeMin?: number; notAfterMin?: number }>();
  for (const i of issues) {
    if (i.fix.action !== "retime" || !i.stop) continue;
    const w = out.get(i.stop.itemId) ?? {};
    if (i.fix.notBeforeMin != null) w.notBeforeMin = Math.max(w.notBeforeMin ?? -Infinity, i.fix.notBeforeMin);
    if (i.fix.notAfterMin != null) w.notAfterMin = Math.min(w.notAfterMin ?? Infinity, i.fix.notAfterMin);
    out.set(i.stop.itemId, w);
  }
  return out;
}
