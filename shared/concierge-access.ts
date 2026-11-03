/**
 * When a concierge engagement's plan access ends.
 *
 * access_until is the first instant of the calendar day after the trip's last
 * day, read in the trip's IANA zone. Access remains while now is not later
 * than that instant (`now > access_until` denies; NULL means no expiry).
 * A missing or unusable zone uses UTC midnight of the next calendar day, the
 * same zone-free reading `planStartInstant` already uses. An unparseable end
 * date is null: no expiry is claimed.
 */
import { calendarParts, isUsableTimeZone, zonedMidnight } from "./plan-timing";

export function conciergeAccessUntil(
  endDate: string | Date | null | undefined,
  timezone: string | null | undefined,
): Date | null {
  const parts = calendarParts(endDate);
  if (!parts) return null;
  const [y, mo, d] = parts;
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const ny = next.getUTCFullYear();
  const nmo = next.getUTCMonth() + 1;
  const nd = next.getUTCDate();
  if (isUsableTimeZone(timezone)) return zonedMidnight(ny, nmo, nd, timezone);
  return new Date(Date.UTC(ny, nmo - 1, nd));
}
