/**
 * BP-1 — HOW A PLAN ITEM IS BOOKED (decision-maker ruling, Oct 12, 2026; ledger `2026-10-12-bp1-booking-path`).
 *
 * `booking_path` belongs to a PLAN ITEM, never to a listing, and is never a stored column: it is computed at read
 * time by this ONE pure resolver (§18 rule 1) from facts the server has already resolved. The only persistence is
 * the Trip Card's existing final snapshot, like every other snapshot fact.
 *
 *   · a PAST DAY — `none`, whatever else is true (decision-maker correction, Oct 12, 2026): nothing on a past day is
 *                 bookable. A booked item keeps showing its booked status, which is a different field.
 *   · platform  — a LIVE platform listing is attached to the item.
 *   · affiliate — an active partner covers the item by STRUCTURE, never by name-matching: a transport pair from
 *                 TC-2's config, a stay bookable through LiteAPI, or (activities) the partner's own product id on
 *                 the item. The server decides coverage; this module only reads the answer.
 *   · concierge — neither of the above, and the item names a REAL place: not a placeholder, not an area title
 *                 ("Gion Walk", "Fushimi Sake District" — the ONE rule in `place-name-gate.ts`).
 *                 The agent finds the contact channel; nothing here asks for one.
 *   · none      — anything else. No Book control at all.
 *
 * Pure: no db, no fetch, no clock (the caller says whether the day is past).
 */
import { namedPlaceTokens, titleNamesAnArea } from "./place-name-gate";

export const BOOKING_PATHS = ["platform", "affiliate", "concierge", "none"] as const;
export type BookingPath = (typeof BOOKING_PATHS)[number];

/** Which structural rule made a partner cover the item. The server sets it; null = no partner covers it. */
export const PARTNER_COVERAGE_KINDS = ["transport_pair", "liteapi_stay", "partner_product"] as const;
export type PartnerCoverageKind = (typeof PARTNER_COVERAGE_KINDS)[number];

export interface BookingPathInput {
  /** A platform listing is attached AND live (approved and active — the public read gate). */
  liveListing: boolean;
  /** The structural partner rule that covers this item, or null. */
  partnerCoverage: PartnerCoverageKind | null;
  title: string;
  locationName?: string | null;
  /** The plan's city, so the city's own name is not counted as naming a place. */
  city?: string | null;
  /** The row stands in for something not yet chosen (e.g. "Arrival in Kyoto"). */
  placeholder?: boolean;
  /** The item's day is before today in the plan's zone. Unknown ⇒ false (never invented). */
  dayIsPast?: boolean;
}

/** Pure. Does the item name one real place a person could contact? */
export function namesRealPlace(input: Pick<BookingPathInput, "title" | "locationName" | "city" | "placeholder">): boolean {
  if (input.placeholder) return false;
  if (titleNamesAnArea(input.title)) return false;
  return namedPlaceTokens({ title: input.title, locationName: input.locationName ?? null }, input.city ?? null).size > 0;
}

/** Pure. The ONE booking-path decision. */
export function resolveBookingPath(input: BookingPathInput): BookingPath {
  if (input.dayIsPast) return "none";
  if (input.liveListing) return "platform";
  if (input.partnerCoverage) return "affiliate";
  if (namesRealPlace(input)) return "concierge";
  return "none";
}

export function isBookingPath(v: unknown): v is BookingPath {
  return typeof v === "string" && (BOOKING_PATHS as readonly string[]).includes(v);
}

/**
 * Pure. Which controls the item sheet draws (ruling 3): the item's primary Book control first, then
 * "Book this for me" second; on a concierge item "Book this for me" is the ONLY control; on `none`, nothing.
 * "Book this for me" is never on the slip row — that is a placement rule for the caller, stated here so the
 * sheet and the leg sheet read one answer.
 */
export function bookingControls(path: BookingPath): { primaryBook: boolean; bookForMe: boolean } {
  switch (path) {
    case "platform":
    case "affiliate":
      return { primaryBook: true, bookForMe: true };
    case "concierge":
      return { primaryBook: false, bookForMe: true };
    case "none":
      return { primaryBook: false, bookForMe: false };
  }
}
