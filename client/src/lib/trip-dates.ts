/**
 * Row 154: the compact trip-date range for the read-only "where" field on a destination page, e.g. "May 3–7".
 * A one-day plan reads "Oct 26", never "Oct 26–26". A range in the same month and year collapses the month;
 * any other range names both months ("Dec 30 – Jan 2"). Dates are read as local calendar days.
 *
 * Row 159 (ledger `2026-10-29-trip-dates-locale`): an optional `locale` renders the range in that
 * language. Any English locale (`en`, `en-*`), no locale, and a locale the runtime refuses all use the
 * English rule above, byte for byte (Architect option 2, Oct 29, 2026). Any other locale renders
 * through `Intl.DateTimeFormat#formatRange`, so it decides the order, the month names and how a
 * same-month range collapses; a range across a year is its two dates with no year, as in English.
 */
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTripDates(start?: string, end?: string, locale?: string | string[]): string | null {
  if (!start) return null;
  const s = new Date(start + "T12:00:00");
  if (isNaN(s.getTime())) return null;
  if (locale !== undefined && !isEnglishLocale(locale)) {
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
  // A range across a year names no year, as the English rule does: the intake panel adds the end year
  // itself, and formatRange would otherwise print the years inside the range as well.
  if (s.getFullYear() !== e.getFullYear()) return `${format.format(s)} – ${format.format(e)}`;
  return format.formatRange(s, e);
}

/** `en` or `en-*` (the first entry when a list is given): these keep the English rule. */
function isEnglishLocale(locale: string | string[]): boolean {
  const primary = Array.isArray(locale) ? locale[0] : locale;
  return typeof primary === "string" && /^en(-|$)/i.test(primary);
}
