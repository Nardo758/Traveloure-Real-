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
 * §14: the envelope carries NO price. The server allowlists it to the string keys below and a
 * client price never reaches a charge; checkout skips a line with no `service` on both of its
 * loops, so a content line is never charged by the platform.
 *
 * PURE — no DB, no request. Imported by the server route (the admission) and by the client
 * readers (the predicate), so the two sides cannot drift.
 */

/** Content types `POST /api/cart` accepts. Anything else is not a content line. */
export const CART_CONTENT_TYPES = ["gem", "hotel", "activity", "event", "neighborhood"] as const;
export type CartContentType = (typeof CART_CONTENT_TYPES)[number];

/** The ONLY `contentMeta` keys the server keeps — every one a display string, none a price. */
export const CART_CONTENT_META_KEYS = ["name", "description", "city", "imageUrl"] as const;

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
  for (const key of CART_CONTENT_META_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) out[key] = v.slice(0, CART_CONTENT_META_VALUE_MAX_LENGTH);
  }
  return out;
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
