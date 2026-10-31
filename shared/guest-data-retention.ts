/**
 * Row 210 — how long guest RSVP details are kept.
 *
 * N is the admin setting `guest_data_retention_days` (`platform_settings`). There is no code
 * default: an absent, blank, or non-numeric value is unset, and the daily job must erase nothing.
 * Leon sets the number. The guest-facing sentence is Leon's, approved
 * Oct 30, 2026, 5:54 PM ET. `{N}` is the only substitution.
 */

export const GUEST_DATA_RETENTION_DAYS_SETTING = "guest_data_retention_days" as const;

/** Approved guest-facing sentence. `{N}` is replaced with the admin's number. */
export const GUEST_DATA_RETENTION_NOTICE =
  "We keep your RSVP details only to manage this event, and delete them {N} days after it ends. You can ask us to delete them sooner at any time.";

/** The words inside the approved sentence that ask for a sooner deletion. */
export const GUEST_DATA_RETENTION_ASK = "delete them sooner";

/** A whole number of days from 1 to 9999, as the admin settings screen stores it. */
export function isValidGuestDataRetentionDaysSetting(value: unknown): boolean {
  return typeof value === "string" && /^[1-9][0-9]{0,3}$/.test(value.trim());
}

/**
 * The stored value in days, or null when the row is absent, blank, or not a whole number of days.
 * Null is unset. There is no fallback number.
 */
export function parseGuestDataRetentionDays(raw: string | null | undefined): number | null {
  if (!isValidGuestDataRetentionDaysSetting(raw)) return null;
  return Number(String(raw).trim());
}

/** A number the server already parsed, or null. Does not invent a day count. */
export function retentionDaysFromPayload(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return parseGuestDataRetentionDays(String(value));
  if (typeof value === "string") return parseGuestDataRetentionDays(value);
  return null;
}

/** Null when the value may be saved (including empty, which unsets N). */
export function guestDataRetentionDaysRefusal(value: string): string | null {
  if (value.trim() === "" || isValidGuestDataRetentionDaysSetting(value)) return null;
  return `${GUEST_DATA_RETENTION_DAYS_SETTING} must be a whole number of days from 1 to 9999, or empty`;
}

export function guestDataRetentionNotice(days: number): string {
  return GUEST_DATA_RETENTION_NOTICE.replace("{N}", String(days));
}

/** Calendar-day addition. `YYYY-MM-DD` in, `YYYY-MM-DD` out. Invalid input returns null. */
export function addCalendarDays(ymd: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match || !Number.isInteger(days)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  date.setUTCDate(date.getUTCDate() + days);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${m}-${d}`;
}

/**
 * True when the event day plus N days is on or before `today`. Both arguments are calendar dates
 * (`YYYY-MM-DD`) already resolved in the plan's zone. A missing or invalid event day is not due.
 */
export function guestRetentionDue(eventDate: string | null | undefined, days: number, today: string): boolean {
  if (!eventDate || parseGuestDataRetentionDays(String(days)) !== days) return false;
  const due = addCalendarDays(eventDate, days);
  const todayOk = addCalendarDays(today, 0);
  if (!due || !todayOk) return false;
  return due <= todayOk;
}
