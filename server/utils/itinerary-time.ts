/**
 * itinerary-time.ts
 * Pure, dependency-free time-parsing helpers for itinerary_items display ordering.
 * Extracted so it can be unit-tested without booting the DB pool (server/db.ts throws at import
 * time when DATABASE_URL is unset) — see server/__tests__/parse-activity-time.test.ts.
 */

/**
 * CC-3: parses an itinerary_items.start_time value into minutes-since-midnight for CHRONOLOGICAL
 * sorting. The stored convention is a 12-hour "h:mm AM/PM" string (e.g. "9:00 AM", "05:30 PM") —
 * sorting that string LEXICALLY (as plain SQL/JS string comparison does) puts "05:30 PM" before
 * "09:00 AM" because '0' < '9' in the first character, corrupting the day's activity order. Falls
 * back to a bare 24-hour "HH:MM" parse for any legacy row that predates the AM/PM convention.
 * Absent or unparseable values return +Infinity so they sort LAST, stably, rather than corrupting
 * the order of the times that ARE known.
 */
export function parseActivityTimeToMinutes(time: string | null | undefined): number {
  if (!time) return Number.POSITIVE_INFINITY;
  const trimmed = time.trim();

  const twelveHour = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (twelveHour) {
    let hours = parseInt(twelveHour[1], 10);
    const minutes = parseInt(twelveHour[2], 10);
    const period = twelveHour[3].toUpperCase();
    if (hours < 1 || hours > 12 || minutes > 59) return Number.POSITIVE_INFINITY;
    if (hours === 12) hours = 0; // 12 AM = 00:xx, 12 PM = 12:xx
    if (period === "PM") hours += 12;
    return hours * 60 + minutes;
  }

  const twentyFourHour = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (twentyFourHour) {
    const hours = parseInt(twentyFourHour[1], 10);
    const minutes = parseInt(twentyFourHour[2], 10);
    if (hours > 23 || minutes > 59) return Number.POSITIVE_INFINITY;
    return hours * 60 + minutes;
  }

  return Number.POSITIVE_INFINITY;
}
