/**
 * R3-9 (round 3 ruling, Nov 5, 2026): what the event drawer says about WHEN. The date is always drawn when the event
 * states one; the time only when the stored value carries one (a bare date, or local midnight, is a date with no time
 * claimed — §13, never "00:00"). A run of several days reads as its first and last day. Pure: the zone is passed in.
 */
const HAS_TIME = /T(\d{2}):(\d{2})/;

function valid(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function eventDrawerWhen(
  date: unknown,
  endDate: unknown,
  opts: { timeZone?: string; locale?: string } = {},
): { dateLine: string; timeLine: string | null } | null {
  const start = valid(date);
  if (!start) return null;
  const locale = opts.locale ?? "en-US";
  const fmt = (d: Date) =>
    d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: opts.timeZone });
  const end = valid(endDate);
  const startDay = fmt(start);
  const endDay = end ? fmt(end) : null;
  const dateLine = endDay && endDay !== startDay ? `${startDay} – ${endDay}` : startDay;
  const m = typeof date === "string" ? HAS_TIME.exec(date) : null;
  const timeLine =
    m && !(m[1] === "00" && m[2] === "00")
      ? start.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone: opts.timeZone })
      : null;
  return { dateLine, timeLine };
}
