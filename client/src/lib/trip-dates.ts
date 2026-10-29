/**
 * Row 154: the compact trip-date range for the read-only "where" field on a destination page, e.g. "May 3–7".
 * A one-day plan reads "Oct 26", never "Oct 26–26". A range in the same month and year collapses the month;
 * any other range names both months ("Dec 30 – Jan 2"). Dates are read as local calendar days.
 *
 * Row 159 (ledger `2026-10-29-trip-dates-locale`): an optional `locale` renders the range in that
 * language, through `Intl.DateTimeFormat#formatRange`, so the locale decides the order, the month
 * names, how a same-month range collapses and whether a year-crossing range names its years. With
 * no locale the output is exactly the English rule above, so every existing caller is unchanged.
 * A locale the runtime refuses falls back to that English rule.
 */
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTripDates(start?: string, end?: string, locale?: string | string[]): string | null {
  if (!start) return null;
  const s = new Date(start + "T12:00:00");
  if (isNaN(s.getTime())) return null;
  if (locale !== undefined) {
    const localized = formatInLocale(s, end, locale);
    if (localized !== null) return localized;
  }
  const sMonth = MONTH_SHORT[s.getMonth()];
  const sDay = s.getDate();
  if (!end) return `${sMonth} ${sDay}`;
  const e = new Date(end + "T12:00:00");
  if (isNaN(e.getTime())) return `${sMonth} ${sDay}`;
  const eMonth = MONTH_SHORT[e.getMonth()];
  const eDay = e.getDate();
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth && sDay === eDay) return `${sMonth} ${sDay}`;
  if (sameMonth) return `${sMonth} ${sDay}–${eDay}`;
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
}

/** The locale path of formatTripDates; null when the runtime refuses the locale. */
function formatInLocale(s: Date, end: string | undefined, locale: string | string[]): string | null {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  } catch {
    return null;
  }
  const e = end ? new Date(end + "T12:00:00") : null;
  if (!e || isNaN(e.getTime())) return format.format(s);
  return format.formatRange(s, e);
}
