/**
 * Future-date test for a platform blog draft and for publish (ledger `2026-10-21-blog-checks-fever-area`).
 * PURE. A date is a calendar day `YYYY-MM-DD`. Today is not past. A window is past when its END day
 * is before today; a one-day event's end is its own day.
 *
 * Structured event/trip dates decide when the facts carry them. Prose dates decide only when they
 * do not — a "Checked <date>" line is a fact stamp, not an event date, and is ignored.
 */

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** The calendar day of `now` in `timeZone`, as `YYYY-MM-DD`. */
export function calendarDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function ymd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayPrefix(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** The end day of one event or trip window, or null when it names no date. */
export function windowEndDay(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  return (
    dayPrefix(o.lastDate) ||
    dayPrefix(o.endDate) ||
    dayPrefix(o.end_date) ||
    dayPrefix(o.endsAt) ||
    dayPrefix(o.firstDate) ||
    dayPrefix(o.startDate) ||
    dayPrefix(o.start_date) ||
    dayPrefix(o.startsAt)
  );
}

/**
 * True when the facts name an event or a trip whose end day is before `today`.
 * A series is past only when its latest instance has ended.
 */
export function structuredDatesArePast(facts: unknown, today: string): boolean {
  if (!facts || typeof facts !== "object") return false;
  const f = facts as { event?: unknown; trip?: unknown; instances?: unknown };
  const eventEnd = windowEndDay(f.event);
  if (eventEnd && eventEnd < today) return true;
  const tripEnd = windowEndDay(f.trip);
  if (tripEnd && tripEnd < today) return true;
  if (Array.isArray(f.instances) && f.instances.length > 0) {
    const ends = f.instances.map(windowEndDay).filter((d): d is string => !!d);
    if (ends.length > 0 && ends.sort()[ends.length - 1] < today) return true;
  }
  if (f.event == null && f.trip == null && !Array.isArray(f.instances)) {
    const end = windowEndDay(f);
    if (end && end < today) return true;
  }
  return false;
}

export function hasStructuredDates(facts: unknown): boolean {
  if (!facts || typeof facts !== "object") return false;
  const f = facts as { event?: unknown; trip?: unknown; instances?: unknown };
  if (windowEndDay(f.event) || windowEndDay(f.trip)) return true;
  if (Array.isArray(f.instances) && f.instances.some((i) => windowEndDay(i))) return true;
  if (f.event == null && f.trip == null && !Array.isArray(f.instances) && windowEndDay(f)) return true;
  return false;
}

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const D_MONTH_Y = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/gi;
const MONTH_D_Y = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/gi;

function eachMatch(re: RegExp, line: string, take: (m: RegExpExecArray) => void): void {
  const r = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = r.exec(line))) take(m);
}

function datesInLine(line: string): string[] {
  const out: string[] = [];
  eachMatch(ISO_DATE, line, (m) => {
    const day = ymd(Number(m[1]), Number(m[2]), Number(m[3]));
    if (day) out.push(day);
  });
  eachMatch(D_MONTH_Y, line, (m) => {
    const day = ymd(Number(m[3]), MONTHS[m[2].toLowerCase()] ?? 0, Number(m[1]));
    if (day) out.push(day);
  });
  eachMatch(MONTH_D_Y, line, (m) => {
    const day = ymd(Number(m[3]), MONTHS[m[1].toLowerCase()] ?? 0, Number(m[2]));
    if (day) out.push(day);
  });
  return out;
}

/** The latest complete date in the prose, ignoring "Checked …" stamp lines. Null when there is none. */
export function latestProseDate(text: string | null | undefined): string | null {
  const days: string[] = [];
  for (const line of String(text ?? "").split("\n")) {
    if (/\bChecked\b/.test(line)) continue;
    days.push(...datesInLine(line));
  }
  if (days.length === 0) return null;
  return days.sort()[days.length - 1];
}

export function proseDatesArePast(text: string | null | undefined, today: string): boolean {
  const latest = latestProseDate(text);
  return latest != null && latest < today;
}
