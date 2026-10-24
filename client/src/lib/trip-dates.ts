/**
 * Row 154: the compact trip-date range for the read-only "where" field on a destination page, e.g. "May 3–7".
 * A one-day plan reads "Oct 26", never "Oct 26–26". A range in the same month and year collapses the month;
 * any other range names both months ("Dec 30 – Jan 2"). Dates are read as local calendar days.
 */
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTripDates(start?: string, end?: string): string | null {
  if (!start) return null;
  const s = new Date(start + "T12:00:00");
  if (isNaN(s.getTime())) return null;
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
