/**
 * THE CART'S CONTENT LINE — one statement of what `POST /api/cart` admits as a content line, and
 * of how a reader tells a content line apart (ledger `2026-09-26-rc9-external-cart-lines`, gap
 * RC-9; §18 rule 1).
 *
 * A content line is a cart row that names no `provider_services` row and no custom venue: a
 * partner/Discover item (a gem, a hotel, an activity, an event, a neighborhood) carried as
 * `contentType` + `contentId` plus a DISPLAY-ONLY envelope (`contentMeta`). It is a durable
 * server row, so it survives a tab or device change — the reason RC-9 moved the experience
 * template's partner picks onto it from a per-tab `sessionStorage` copy.
 *
 * §14: the envelope carries NO price. The server allowlists it to the string keys below (plus a
 * validated, display-only coordinate pair) and a client price never reaches a charge; checkout
 * skips a line with no `service` on both of its loops, so a content line is never charged by the
 * platform.
 *
 * PURE — no DB, no request. Imported by the server route (the admission) and by the client
 * readers (the predicate), so the two sides cannot drift.
 */

/** Content types `POST /api/cart` accepts. Anything else is not a content line. */
export const CART_CONTENT_TYPES = ["gem", "hotel", "activity", "event", "neighborhood"] as const;
export type CartContentType = (typeof CART_CONTENT_TYPES)[number];

/** The free-text display keys of `contentMeta` — strings, non-empty, capped. */
export const CART_CONTENT_META_TEXT_KEYS = ["name", "description", "city", "imageUrl"] as const;

/**
 * The coordinate pair a content line MAY carry (ledger `2026-09-26-partner-picks-map-coords`).
 * DISPLAY ONLY — it draws a pin and a route on the map and moves no money. Stored as normalized
 * decimal strings, admitted only as a VALID PAIR (see `normalizeCartContentCoordinates`).
 */
export const CART_CONTENT_META_COORD_KEYS = ["lat", "lng"] as const;

/**
 * The ONLY `contentMeta` keys the server keeps — every one a display string, none a price. The
 * text keys and the coordinate pair are ONE allowlist; the pair is validated as a pair.
 */
export const CART_CONTENT_META_KEYS = [...CART_CONTENT_META_TEXT_KEYS, ...CART_CONTENT_META_COORD_KEYS] as const;

/** Bounds the server enforces on `contentId`. */
export const CART_CONTENT_ID_MAX_LENGTH = 200;

/** Per-value cap the server applies to each kept `contentMeta` string. */
export const CART_CONTENT_META_VALUE_MAX_LENGTH = 500;

export function isCartContentType(value: unknown): value is CartContentType {
  return typeof value === "string" && (CART_CONTENT_TYPES as readonly string[]).includes(value);
}

export function isAdmissibleContentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= CART_CONTENT_ID_MAX_LENGTH;
}

/**
 * The server's allowlist over a client `contentMeta` (strings only, non-empty, capped). Returns
 * `undefined` when the input is not an object, so an absent envelope stays absent (§13).
 */
export function pickCartContentMeta(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const key of CART_CONTENT_META_TEXT_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) out[key] = v.slice(0, CART_CONTENT_META_VALUE_MAX_LENGTH);
  }
  const coords = normalizeCartContentCoordinates(
    (raw as Record<string, unknown>).lat,
    (raw as Record<string, unknown>).lng,
  );
  if (coords) {
    out.lat = coords.lat;
    out.lng = coords.lng;
  }
  return out;
}

/** A plain decimal: optional sign, digits, optional fraction. No exponent, no hex, no blanks. */
const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

function coordinateNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && DECIMAL_STRING.test(v.trim())) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 7 decimal places — the precision `itinerary_items.latitude/longitude` (decimal(10,7)) holds. */
function normalizeCoordinate(n: number): string {
  const s = Number(n.toFixed(7)).toString();
  return s === "-0" ? "0" : s;
}

/**
 * THE ONE COORDINATE RULE for a content line (§18 rule 1): the writer (the template's pick
 * builder), the admission (`pickCartContentMeta`) and every reader call this.
 *
 * Returns the pair as normalized strings ONLY when BOTH halves are finite numbers (or plain
 * decimal strings) within range — lat −90..90, lng −180..180. A HALF pair, or a pair with one
 * invalid half, yields NULL and drops BOTH (the LD 34 half-coordinate refusal posture). Nothing is
 * ever derived from a city, a name or a geocode: an absent coordinate stays absent (§13).
 */
export function normalizeCartContentCoordinates(
  lat: unknown,
  lng: unknown,
): { lat: string; lng: string } | null {
  const la = coordinateNumber(lat);
  const ln = coordinateNumber(lng);
  if (la === null || ln === null) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: normalizeCoordinate(la), lng: normalizeCoordinate(ln) };
}

/**
 * The reader: a stored content envelope's coordinate pair as numbers, or NULL when it carries no
 * valid pair (an unlocated pick — drawn nowhere, never guessed onto the map; §13 / LD 22).
 */
export function readCartContentCoordinates(meta: unknown): { lat: number; lng: number } | null {
  if (!meta || typeof meta !== "object") return null;
  const pair = normalizeCartContentCoordinates(
    (meta as Record<string, unknown>).lat,
    (meta as Record<string, unknown>).lng,
  );
  return pair ? { lat: Number(pair.lat), lng: Number(pair.lng) } : null;
}

/**
 * THE ONE READER PREDICATE: is this cart row a content line? The enriched read
 * (`storage._enrichCartItems`) stamps `isContentItem`; a raw row is recognised by carrying both
 * `contentId` AND `contentType` (never by `contentMeta` alone, which a stay line also carries).
 * This includes the plan's `itinerary_item` projection, which is a content-shaped row too.
 */
export function isContentCartLine(row: {
  isContentItem?: boolean | null;
  contentId?: string | null;
  contentType?: string | null;
}): boolean {
  return row.isContentItem === true || (!!row.contentId && !!row.contentType);
}

/**
 * DOES THIS ROW SURVIVE THE POST-PAYMENT CART CLEAR? (ledger `2026-09-26-checkout-keeps-partner-lines`)
 *
 * A completed checkout used to empty the WHOLE cart, which silently deleted a partner line the
 * traveler had never put on a plan: checkout does not charge a content line (every loop skips a line
 * with no `service`), so nothing about the payment accounted for it, and it had no other home. The
 * post-payment clear now spares exactly that row: a content line that names no listing, no custom
 * venue and no plan item. A row LINKED to a plan item is the plan's projection (LD 39) and keeps its
 * old behaviour — the projection rebuilds it from the item. The traveler's own "Clear cart"
 * (`DELETE /api/cart`) still empties everything; this governs only the clear after a payment.
 *
 * `storage.clearCheckedOutCartLines` states the same condition in SQL; the DB test
 * `server/__tests__/checkout-keeps-partner-lines.db.test.ts` pins the two together.
 */
export function survivesCheckoutClear(row: {
  serviceId?: string | null;
  customVenueId?: string | null;
  itineraryItemId?: string | null;
  contentType?: string | null;
  contentId?: string | null;
}): boolean {
  return (
    !row.serviceId &&
    !row.customVenueId &&
    !row.itineraryItemId &&
    !!row.contentType &&
    !!row.contentId
  );
}
