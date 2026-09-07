/**
 * home-time-axis.ts — the pure client half of Home's time axis (ledger `2026-09-07-home-time-axis`;
 * CLAUDE.md Locked Decision 45 (8)). Two derivations, each written ONCE:
 *
 *   • `relativeDayLabel` — the mono "Today / tomorrow / in 3 days" beside a row's date. The server
 *     says what KIND of date a row carries (`dateKind`): a calendar day is compared on the calendar
 *     against the VIEWER's own calendar day (a day row never claims a clock), and an instant is
 *     compared as an instant. No zone is invented for either (LD 30).
 *   • `greetingSentence` — ONE sentence derived from the FIRST upcoming row, and a neutral greeting
 *     when there is none. Never "0 things are due" (§13): a count clause appears only when at
 *     least one payment row sits before the first plan start.
 *
 * `UpcomingRow` mirrors `server/services/upcoming.service.ts`'s response shape; the fields read
 * here are the ones the page renders.
 */

export type UpcomingKind =
  | "booking_unpaid"
  | "balance_due"
  | "handover"
  | "trip_start"
  | "event"
  | "occasion_draft";

export interface UpcomingRow {
  date: string;
  dateKind: "day" | "instant";
  tz?: string;
  kind: UpcomingKind;
  sentence: string;
  tripId: string | null;
  planName: string;
  source: string;
  action: { label: string; href: string };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The viewer's own calendar day of an instant, "YYYY-MM-DD" (local zone — the viewer's, by definition). */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayDiff(fromDay: string, toDay: string): number {
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/**
 * The calendar day a row falls on, from the viewer's seat: a day row IS its day; an instant row
 * is the viewer's local day of that instant (an instant is an instant — rendering it in the
 * viewer's clock claims nothing about the plan's zone).
 */
export function rowDay(row: Pick<UpcomingRow, "date" | "dateKind">): string {
  if (row.dateKind === "day") return row.date.slice(0, 10);
  const d = new Date(row.date);
  return isNaN(d.getTime()) ? row.date.slice(0, 10) : localDay(d);
}

/** "Today" · "tomorrow" · "in N days" · (past, should not happen inside the window) "N days ago". */
export function relativeDayLabel(row: Pick<UpcomingRow, "date" | "dateKind">, now: Date): string {
  const diff = dayDiff(localDay(now), rowDay(row));
  if (diff === 0) return "Today";
  if (diff === 1) return "tomorrow";
  if (diff > 1) return `in ${diff} days`;
  if (diff === -1) return "yesterday";
  return `${-diff} days ago`;
}

/** "Sep 29" — the Fraunces date column. Day rows format their day; instants format the viewer's day. */
export function shortDate(row: Pick<UpcomingRow, "date" | "dateKind">): string {
  const day = rowDay(row);
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const DUE_KINDS: ReadonlySet<UpcomingKind> = new Set<UpcomingKind>(["booking_unpaid", "balance_due"]);

/**
 * The greeting's one derived sentence.
 *   rows empty            → the neutral greeting (no count of anything).
 *   first row is a plan's start (or its handover) → "<City> <relative>." + optional due clause.
 *   otherwise             → "<sentence of the first row>" trimmed to its first clause, with the
 *                           relative day.
 * The due clause counts `booking_unpaid`/`balance_due` rows dated BEFORE the first `trip_start`
 * row and is omitted when that count is zero — never "0 things are due".
 */
export function greetingSentence(rows: UpcomingRow[], now: Date, firstName?: string | null): string {
  const neutral = firstName ? `Nothing is dated yet, ${firstName}. Start a plan and the days will fill in.` : "Nothing is dated yet. Start a plan and the days will fill in.";
  if (rows.length === 0) return neutral;
  const first = rows[0];
  const rel = relativeDayLabel(first, now);
  const firstStartIdx = rows.findIndex((r) => r.kind === "trip_start");
  const dueBefore = rows.filter((r, i) => DUE_KINDS.has(r.kind) && (firstStartIdx === -1 || i < firstStartIdx)).length;
  const dueClause = dueBefore > 0 ? ` ${dueBefore === 1 ? "One thing is" : `${dueBefore} things are`} due${firstStartIdx !== -1 ? " before you go" : ""}.` : "";
  if (first.kind === "trip_start" || first.kind === "handover") {
    return `${first.planName} ${rel === "Today" ? "begins today" : rel}.${dueClause}`;
  }
  const clause = first.sentence.split(/[.!?]/)[0]?.trim() || first.sentence;
  return `${clause} — ${rel}.${dueClause}`;
}
