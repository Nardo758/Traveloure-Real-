/**
 * "Restore my draft" on the Versions board (audit D3 screen slice; fix-queue row 249; ledger
 * `2026-10-26-d3-restore-my-draft-screen`). Pure: no React. The strip (`VersionsRestoreStrip.tsx`) reads
 * these, so what the GET answer means, which days get a button and which line a POST answer earns are
 * written once.
 *
 * The server's rules are already built (ledger `2026-10-25-d3-restore-day`): an edited day is refused with
 * 409 and never overwritten, a snapshot lives DAY_RESTORE_RETENTION_DAYS, only the newest per day is live,
 * and a finalized plan is refused. This screen only shows them. Every answer it does not understand reads
 * as a failure, never as a restore (§13).
 */
import { DAY_RESTORE_RETENTION_MS, type DayRestoreState } from "@shared/version-board";

// Wording held for owner approval: proposed placeholders, R1-R11.
/** Every traveler-facing sentence the restore strip says. `{day}` and `{date}` are filled by `fillRestoreCopy`. */
export const VERSIONS_RESTORE_UI_COPY = Object.freeze({
  heading: "Your draft before you adopted a version", // R1
  dayLine: "Day {day} was replaced when you adopted a version.", // R2
  savedUntil: "Your draft is saved until {date}.", // R3
  button: "Restore my draft", // R4
  preview: "Day {day} goes back to your draft from before you adopted the version.", // R5
  done: "Day {day} is back to your draft.", // R6
  changed: "You’ve changed Day {day} since you adopted the version, so we didn’t restore your draft. Nothing was overwritten.", // R7
  // R8 → W13 (Wording approved — Leon, Nov 7, 2026): said once per expired snapshot, and for a 409 restore_expired.
  expired: "Your draft for Day {day} is no longer saved. Nothing on your plan changed.", // R8 / W13
  finalized: "This plan is finalized. Reopen it to restore a draft.", // R9
  failed: "We couldn’t restore Day {day} just now. Nothing was changed.", // R10
  notFound: "There’s no saved draft to restore for Day {day}.", // R11
});

/** Fills `{day}` and `{date}`; a token with no value is left out rather than printed. */
export function fillRestoreCopy(template: string, vars: { day?: number; date?: string }): string {
  return template
    .replace(/\{day\}/g, vars.day === undefined ? "" : String(vars.day))
    .replace(/\{date\}/g, vars.date ?? "");
}

/** Keyed under the board's own versions key, so the board's refresh() invalidates it by prefix. */
export function restorableKey(tripId: string): [string, string] {
  return [`/api/trips/${tripId}/versions`, "restorable"];
}

export function restoreUrl(tripId: string, day: number): string {
  return `/api/trips/${tripId}/versions/days/${day}/restore`;
}

/** The POST body; null for an empty id, so nothing is ever sent without the row's own snapshot. */
export function restoreRequestBody(snapshotId: string): { snapshotId: string } | null {
  return typeof snapshotId === "string" && snapshotId.length > 0 ? { snapshotId } : null;
}

export interface RestorableRow {
  day: number;
  snapshotId: string;
  appliedAt: string;
  state: DayRestoreState;
}

const STATES: readonly DayRestoreState[] = ["restorable", "changed_since", "expired", "finalized"];

/** The GET answer, checked. null for anything that is not `{ days: [...] }`; bad rows are dropped. */
export function readRestorable(data: unknown): RestorableRow[] | null {
  if (!data || typeof data !== "object" || !Array.isArray((data as { days?: unknown }).days)) return null;
  const byDay = new Map<number, RestorableRow>();
  for (const raw of (data as { days: unknown[] }).days) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const day = r.day;
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 60) continue;
    if (typeof r.snapshotId !== "string" || r.snapshotId.length === 0) continue;
    if (typeof r.appliedAt !== "string") continue;
    if (!STATES.includes(r.state as DayRestoreState)) continue;
    if (byDay.has(day)) continue;
    byDay.set(day, { day, snapshotId: r.snapshotId, appliedAt: r.appliedAt, state: r.state as DayRestoreState });
  }
  return Array.from(byDay.values()).sort((a, b) => a.day - b.day);
}

export interface RestoreRowView {
  day: number;
  snapshotId: string;
  appliedAt: string;
  /** `restorable` gets a button; `changed` gets the R7 note and none. */
  kind: "restorable" | "changed";
}

/** An expired snapshot the strip says once (W13). It never gets a button. */
export interface ExpiredRestoreView {
  day: number;
  snapshotId: string;
}

/**
 * Which rows the strip draws. Any finalized row means one R9 line and no rows. W13 (ledger
 * `2026-11-07-w13-expired-restore`): an expired day is DECIDED here, before it is dropped from `rows` — it is
 * returned in `expired` so the strip can say its line once; it never reaches `rows` and never gets a button.
 */
export function restoreRowsToShow(
  rows: readonly RestorableRow[] | null,
): { finalized: boolean; rows: RestoreRowView[]; expired: ExpiredRestoreView[] } {
  if (!rows) return { finalized: false, rows: [], expired: [] };
  if (rows.some((r) => r.state === "finalized")) return { finalized: true, rows: [], expired: [] };
  const out: RestoreRowView[] = [];
  const expired: ExpiredRestoreView[] = [];
  for (const r of rows) {
    if (r.state === "restorable") out.push({ day: r.day, snapshotId: r.snapshotId, appliedAt: r.appliedAt, kind: "restorable" });
    else if (r.state === "changed_since") out.push({ day: r.day, snapshotId: r.snapshotId, appliedAt: r.appliedAt, kind: "changed" });
    else if (r.state === "expired") expired.push({ day: r.day, snapshotId: r.snapshotId });
  }
  return { finalized: false, rows: out, expired };
}

/**
 * W13: the expired snapshots this browser has already been told about. A snapshot's line shows once — then it is
 * recorded here (after it renders, or on dismiss) and never shown again for that snapshot. Per-viewer only; an
 * absent or throwing store reads as "none seen", so the worst case is the line once more.
 */
export const RESTORE_EXPIRED_SEEN_KEY = "traveloure_restore_expired_seen";

export function readExpiredSeen(store: Pick<Storage, "getItem"> | null | undefined): Set<string> {
  try {
    const raw = store?.getItem(RESTORE_EXPIRED_SEEN_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function markExpiredSeen(store: Pick<Storage, "getItem" | "setItem"> | null | undefined, snapshotIds: readonly string[]): void {
  if (!snapshotIds.length) return;
  try {
    const seen = readExpiredSeen(store);
    for (const id of snapshotIds) seen.add(id);
    // Bounded: the newest 200 ids are plenty for one viewer.
    store?.setItem(RESTORE_EXPIRED_SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200)));
  } catch {
    // Best effort: without a store the line may show again on a reload.
  }
}

/** W13: the expired lines to draw — not yet seen, not dismissed. */
export function expiredToShow(expired: readonly ExpiredRestoreView[], seen: ReadonlySet<string>, dismissed: ReadonlySet<string>): ExpiredRestoreView[] {
  return expired.filter((e) => !seen.has(e.snapshotId) && !dismissed.has(e.snapshotId));
}

/** W13: the line for an expired day. */
export function restoreExpiredLine(day: number): string {
  return fillRestoreCopy(VERSIONS_RESTORE_UI_COPY.expired, { day });
}

/** The day the saved draft expires, in the board's date style; null when appliedAt does not parse. */
export function savedUntil(appliedAt: string): string | null {
  const t = Date.parse(appliedAt);
  if (!Number.isFinite(t)) return null;
  return new Date(t + DAY_RESTORE_RETENTION_MS).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type RestoreFailureKey = "changed" | "expired" | "finalized" | "notFound" | "failed";
export type RestoreNoteKey = RestoreFailureKey | "done";

/** Reads apiRequest's `Error("<status>: <body>")`. Anything not named here is `failed`. */
export function restoreFailureKey(err: unknown): RestoreFailureKey {
  if (!(err instanceof Error)) return "failed";
  const m = /^(\d{3}): ([\s\S]*)$/.exec(err.message);
  if (!m) return "failed";
  const status = Number(m[1]);
  let code: unknown;
  try {
    code = (JSON.parse(m[2]) as { code?: unknown } | null)?.code;
  } catch {
    return "failed";
  }
  if (status === 409 && code === "day_changed_since_apply") return "changed";
  if (status === 409 && code === "restore_expired") return "expired";
  if (status === 409 && code === "plan_finalized") return "finalized";
  if (status === 404 && code === "not_found") return "notFound";
  return "failed";
}

/** `done` only when the server said it restored (or had already); anything else is `failed`. */
export function restoreSuccessKey(answer: unknown): "done" | "failed" {
  if (!answer || typeof answer !== "object") return "failed";
  const a = answer as { restored?: unknown; alreadyRestored?: unknown };
  return a.restored === true || a.alreadyRestored === true ? "done" : "failed";
}

/** The sentence for a result note on one day. */
export function restoreNoteLine(key: RestoreNoteKey, day: number): string {
  const C = VERSIONS_RESTORE_UI_COPY;
  const template = { done: C.done, changed: C.changed, expired: C.expired, finalized: C.finalized, notFound: C.notFound, failed: C.failed }[key];
  return fillRestoreCopy(template, { day });
}
