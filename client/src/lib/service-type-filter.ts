/**
 * CN-1c-UI (ledger `2026-11-01-cn1c-ui-local-concierge-filter`): the concierge filter on /services and the city
 * page, and the profile's concierge section.
 *
 * The filter sends `serviceType` to the server and keeps the server's order. The server owns the value set and the
 * refusal (`shared/service-type-query.ts`, UNKNOWN_SERVICE_TYPE_MESSAGE); this module restates neither. No choice sends
 * no param. The concierge label is `CN1_COPY.filter` (approved); every other line here is HELD for Leon.
 */
import { CN1_COPY } from "@shared/cn1-copy";
import { listingTypeFromStored } from "@/lib/listing-type";

/** The query parameter, on the page URL and on the read alike. */
export const SERVICE_TYPE_FILTER_PARAM = "serviceType";

export const SERVICE_TYPE_FILTER_COPY = {
  /** HELD (pending Leon): the no-filter choice. */
  all: "All listings",
  /** HELD (pending Leon): the planning filter choice. */
  planning: "Trip planning",
  /** Approved: CN-1 OPEN call (B), Nov 1, 2026. */
  concierge: CN1_COPY.filter,
  /** HELD (pending Leon): a concierge filter with no listings in this city. */
  emptyConcierge: "No local concierge listings in {city} yet.",
} as const;

export type ServiceTypeChoice = "" | "planning" | "concierge";

export const SERVICE_TYPE_FILTER_CHOICES: ReadonlyArray<{ value: ServiceTypeChoice; label: string }> = [
  { value: "", label: SERVICE_TYPE_FILTER_COPY.all },
  { value: "planning", label: SERVICE_TYPE_FILTER_COPY.planning },
  { value: "concierge", label: SERVICE_TYPE_FILTER_COPY.concierge },
];

/** The filter value a URL carries, trimmed. Blank or absent is "no filter". Any other value is sent as it is. */
export function serviceTypeFromUrl(search: string | URLSearchParams): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return (params.get(SERVICE_TYPE_FILTER_PARAM) ?? "").trim();
}

/** Sets or clears the param on a copy of `params`. No choice removes it. */
export function withServiceType(params: URLSearchParams, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const v = value.trim();
  if (v) next.set(SERVICE_TYPE_FILTER_PARAM, v);
  else next.delete(SERVICE_TYPE_FILTER_PARAM);
  return next;
}

export function emptyConciergeLine(city: string): string {
  return SERVICE_TYPE_FILTER_COPY.emptyConcierge.replace("{city}", city);
}

/** A failed read's message: the server's own `message` when it sent one, else the fallback. */
export async function readFailureMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.message === "string" && body.message ? body.message : fallback;
}

/** Approved (Leon, Nov 1, 2026): the profile's concierge section heading. */
export const PROFILE_CONCIERGE_HEADING = CN1_COPY.filter;

/**
 * The profile's listings. When an earner sells concierge listings AND other listings, the concierge ones move into the
 * one new section and every other listing stays where it is today, in the server's order. With one kind only, nothing
 * moves (`concierge` is null). A row with no stored type is not concierge (planning is the column default).
 */
export function profileListingSections<T extends { serviceType?: string | null }>(
  services: readonly T[],
): { listings: T[]; concierge: T[] | null } {
  const concierge = services.filter((s) => listingTypeFromStored(s.serviceType) === "concierge");
  const other = services.filter((s) => listingTypeFromStored(s.serviceType) !== "concierge");
  if (concierge.length > 0 && other.length > 0) return { listings: other, concierge };
  return { listings: [...services], concierge: null };
}
