/**
 * THE wall-clock convention for `temporal_anchors.anchor_datetime` (R315 reader, R316 writers; ledgers
 * `2026-10-05-anchor-overlap-wall-clock`, `2026-10-05-anchor-writers-wall-clock`). One module, every
 * side (§18 rule 1).
 *
 * `anchor_datetime` is a plain `timestamp` holding the PLAN'S WALL-CLOCK — "14:00" means 14:00 where the
 * plan happens (LD 30: the zone those strings are read in is `trips.timezone`, never the server's and
 * never the browser's). R-aa's flight writer stores `YYYY-MM-DDTHH:MM:00`, and drizzle hands the value
 * back as a Date whose UTC parts ARE that wall-clock, which is what `anchorWallTime` reads.
 *
 * So a zone-less string is a wall-clock and is read as UTC-naive — never in the machine's own zone,
 * which is what made the value depend on where the code ran. A string that names its own zone
 * (`Z` / `±HH:MM`) is taken as given.
 */

const NAMES_ITS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Milliseconds of an anchor value in the wall-clock frame; NaN when unreadable. */
export function anchorWallClockMs(value: string | Date | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  const s = String(value ?? "").trim();
  if (!s) return NaN;
  return Date.parse(NAMES_ITS_ZONE.test(s) ? s : `${s}Z`);
}

/**
 * The Date the server stores for an anchor value it received — the route-boundary reader that replaces
 * `z.coerce.date()` (which read a zone-less string in the SERVER's zone). An unreadable value is an
 * Invalid Date, which the schema's `z.date()` refuses (400), exactly as before.
 */
export function anchorDatetimeFromInput(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return value;
  if (typeof value !== "string") return value;
  return new Date(anchorWallClockMs(value));
}

/**
 * The value a WRITER sends: the plan's wall-clock "YYYY-MM-DDTHH:MM:00", zone-less on purpose. The date
 * is "YYYY-MM-DD" and the time "HH:MM" or "HH:MM:SS"; anything else is null (§13 — never a guessed time).
 */
export function anchorWallClockString(date: string | null | undefined, time: string | null | undefined): string | null {
  const d = /^\d{4}-\d{2}-\d{2}$/.exec(String(date ?? "").trim())?.[0];
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time ?? "").trim());
  if (!d || !t) return null;
  const hh = Number(t[1]);
  const mm = Number(t[2]);
  const ss = Number(t[3] ?? "0");
  if (hh > 23 || mm > 59 || ss > 59) return null;
  return `${d}T${String(hh).padStart(2, "0")}:${t[2]}:${String(ss).padStart(2, "0")}`;
}

// ── Readers (R317, ledger `2026-10-05-anchor-readers-wall-clock`) ──────────────────────────────────
// Every server or client reader that needs an anchor's DAY, TIME or minutes-of-day takes them from
// here — never from `getHours()` / `toTimeString()` / `toLocaleTimeString()` without `timeZone: "UTC"`,
// which read the stored wall-clock in the MACHINE's zone and moved it by that machine's offset.

export interface AnchorWallClock {
  /** "YYYY-MM-DD" — the plan's calendar day. */
  date: string;
  /** "HH:MM" (24h). */
  time: string;
  /** Minutes since the plan-day's midnight. */
  minutes: number;
}

/** The anchor's wall-clock day and time; null when the value is unreadable. */
export function anchorWallClockParts(value: string | Date | null | undefined): AnchorWallClock | null {
  const ms = anchorWallClockMs(value);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  return {
    date: d.toISOString().slice(0, 10),
    time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    minutes: hh * 60 + mm,
  };
}

/** A calendar day ("YYYY-MM-DD") from a plan's start date given as a date string or a Date. */
function planDay(start: string | Date | null | undefined): string | null {
  if (start instanceof Date) return Number.isFinite(start.getTime()) ? start.toISOString().slice(0, 10) : null;
  const m = /^\d{4}-\d{2}-\d{2}/.exec(String(start ?? "").trim());
  return m ? m[0] : null;
}

/** The plan day an anchor falls on (day 1 = the start date), by calendar date; null when either is unreadable. */
export function anchorDayNumber(value: string | Date | null | undefined, tripStart: string | Date | null | undefined): number | null {
  const parts = anchorWallClockParts(value);
  const start = planDay(tripStart);
  if (!parts || !start) return null;
  return Math.round((Date.parse(`${parts.date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** "2:00 PM"-style label of the anchor's wall-clock time (en-US, 12h); null when unreadable. */
export function anchorTimeLabel12h(value: string | Date | null | undefined): string | null {
  const ms = anchorWallClockMs(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" });
}
