/**
 * CN-1c — optional public listing-type query.
 *
 * Absent or blank means every type. A value must be one of `serviceTypeEnum`.
 * Anything else is refused, so a misspelled filter does not return every listing.
 * The approved-and-active gate stays on the read. This module does not order rows.
 */
import { serviceTypeEnum } from "./schema";

export type ListingServiceType = (typeof serviceTypeEnum)[number];

export const UNKNOWN_SERVICE_TYPE_MESSAGE = "Unknown service type.";

export function parseServiceTypeQuery(
  raw: unknown,
): { ok: true; serviceType: ListingServiceType | null } | { ok: false } {
  if (raw == null) return { ok: true, serviceType: null };
  if (typeof raw !== "string") return { ok: false };
  const value = raw.trim();
  if (value === "") return { ok: true, serviceType: null };
  if (!(serviceTypeEnum as readonly string[]).includes(value)) return { ok: false };
  return { ok: true, serviceType: value as ListingServiceType };
}
