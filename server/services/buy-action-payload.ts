/**
 * BUY ACTION, ON THE PAYLOAD — the server half of lane L23 (brief §11.5, ruling 9).
 *
 * `resolveBuyAction` (shared/buy-action.ts) is PURE and knows nothing about the database. This
 * module is the one place that gathers the two facts a `provider_services` row cannot state about
 * itself — the resolved BOOKING MODE and whether the listing PUBLISHES a calendar — and the one
 * place that reads the BUYER off the session. ONE implementation, several callers (the public
 * service detail, the public browse, the storefront): a second gatherer beside it is the
 * derivation-drift class §18 rule 1 names, and it is how two surfaces start drawing different
 * buttons for the same listing.
 *
 * §14 — THE BUYER IS THE SESSION, NEVER THE QUERY STRING. `resolveBuyerState` reads `getUserId`
 * and nothing else; no caller may pass a buyer id in. It takes no money decision at all: the
 * descriptor is a DESCRIPTOR (register §A3 is open — no cart, no fee, no charge is touched here).
 *
 * §18 rule 1 — the two derivations that already exist are CALLED, never re-implemented:
 * `resolveBookingMode` (shared/schema.ts, ruling 74/75's ONE null-resolution site) and
 * `resolveBookability` (via `platformListingBookability`).
 *
 * §13 — an absent fact stays absent. `hasPublishedAvailability` is only ever stated for a listing
 * this module actually queried; a caller that cannot supply the ids gets `undefined`, and the
 * resolver's own last row then offers no booking verb rather than guessing one.
 *
 * WHAT THE BOOKING MODE DOES **NOT** SAY, corrected by lane OC-A0b (punchlist V-9, ledger
 * `2026-09-11-booking-mode-provenance`). Every `provider_services` row carries a NOT NULL
 * `user_id`, so the "no owner, so no honest resolution" branch below is UNREACHABLE for a listing
 * and the mode is always concrete. That is CORRECT and is deliberately left alone: `request` is
 * the safe answer (the traveler asks, the seller accepts, nothing is charged without an
 * acceptance), and resolving to "no verb" instead would strip the buy button from the entire live
 * catalogue — on production, 64 of 67 active listings have no `service_provider_forms` row at all.
 * What was wrong was the SILENCE: nothing recorded that the answer was the platform's rather than
 * the seller's. `resolveBookingModeWithProvenance` (shared/schema.ts) now carries that fact for
 * the readers that need it (the offering-commerce contract, the classification audit). It is
 * INTERNAL and is deliberately not added to `BuyAction`, which is a client-facing payload.
 *
 * BATCHED BY CONSTRUCTION. Two queries per response, not two per row: one `IN (...)` over the
 * owners' `service_provider_forms.instant_booking`, one `IN (...)` over the listings' future
 * `vendor_availability_slots`. An empty id set runs neither.
 */
import type { Request } from "express";
import { and, eq, gte, inArray } from "drizzle-orm";

import { db } from "../db";
import { getUserId } from "../utils/auth";
import {
  resolveBuyAction,
  platformListingBookability,
  type BuyAction,
  type BuyActionBuyer,
  type BuyBookingMode,
  type BuyRefusalReason,
} from "@shared/buy-action";
import {
  resolveBookingMode,
  serviceProviderForms,
  trips,
  vendorAvailabilitySlots,
} from "@shared/schema";

/** The columns a listing must carry for its buy action to be resolvable. */
export interface ListingBuyRow {
  id: string;
  /** `provider_services.user_id`. Needed only to resolve an UNSET booking mode from the account. */
  ownerUserId: string | null | undefined;
  /** The RAW `booking_mode` column; NULL is resolved from the owner's account flag below. */
  bookingMode?: string | null;
  deliveryMethod?: string | null;
  productShape?: string | null;
  price?: string | number | null;
  /**
   * Stated by the CALLER, never inferred here: each public read already applies its own F2
   * gate (approved + active), and a caller whose query guarantees it knows that without a
   * second check.
   */
  isLive: boolean;
}

/**
 * The buyer, from the SESSION (§14). `chipTripId` is deliberately left unset: the plan chip is
 * CLIENT state and the server does not hold it, so a surface that HAS a chip calls
 * `resolveBuyAction` itself with the same row facts plus the chip — that is calling the one
 * author with a fact the server lacks, not authoring a second button (ruling 9).
 *
 * `plans` is a capped probe (LIMIT 2), because the resolver only distinguishes none / one / many.
 */
export async function resolveBuyerState(req: Request): Promise<BuyActionBuyer> {
  const userId = getUserId(req);
  if (!userId) return { principal: "guest", plans: "none" };
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.userId, userId))
    .limit(2);
  return {
    principal: "member",
    plans: rows.length === 0 ? "none" : rows.length === 1 ? "one" : "many",
  };
}

/**
 * A positive published price. A price of NULL or 0 is NOT a price (§13/§14 — none is invented).
 *
 * EXPORTED as of ledger `2026-09-12-booking-birth-holes` (punchlist V-11). It is the ONE
 * translation of a `provider_services.price` column into the `hasPrice` fact `resolveBuyAction`
 * decides on, and `POST /api/bookings` now consults THIS rather than restating it — the route's
 * own `Number(service.price) || 0` rendered a NULL price as "free", which is the exact claim
 * `resolveBuyAction` row 11 refuses to make (a priceless listing can only ever be REQUESTED,
 * never charged). A second reading of the column is the drift class §18 rule 1 names, and it is
 * how a button says "Request to book" while the rail behind it commits a $0.00 purchase.
 */
export function hasPublishedPrice(price: string | number | null | undefined): boolean {
  if (price === null || price === undefined) return false;
  const n = typeof price === "number" ? price : Number(price);
  return Number.isFinite(n) && n > 0;
}

/**
 * THE ONE SENTENCE EVERY RAIL SAYS WHEN A LISTING PUBLISHES NO PRICE.
 *
 * Added by ledger `2026-09-13-cart-priceless-gap`. V-11 closed this on `POST /api/bookings` and
 * wrote the refusal inline there; the cart rail had the identical hole one endpoint over — a NULL
 * price went into the cart at 201 and `GET /api/cart` reported `subtotal: "0.00"`, which is the
 * §13 lie V-11 exists to refuse ("no price stated" rendered as "free"). Fixing the cart by
 * re-typing that sentence beside it would have been two rails refusing the same thing in two
 * voices, which is the derivation-drift class §18 rule 1 names in miniature: the day the quote
 * rail is built, one of the two copies gets the new sentence and the other keeps promising
 * something that no longer exists.
 *
 * So the sentence lives HERE, beside `hasPublishedPrice` — the ONE translation of the price
 * column into `resolveBuyAction`'s `hasPrice` fact — and every rail imports both. The `reason` is
 * the RESOLVER's own vocabulary (`BuyRefusalReason`), so a rename of that union fails to compile
 * at every rail at once rather than leaving a string literal behind.
 *
 * WHAT IT IS NOT: it is not a re-decision of the rule. `resolveBuyAction` row 11 is the sole
 * author (ruling 9) and already says a priceless listing can only ever be REQUESTED — its landing
 * is `booking_request`, never `checkout`, in every branch. This constant is how a rail says that
 * out loud instead of greying out a button (§13 — a refusal is a sentence).
 *
 * The HTTP STATUS is deliberately NOT part of it: an add rail answers 400 (the body named a
 * listing it may not name — `POST /api/bookings`'s own code) while checkout answers 409 (the cart
 * on disk holds a line that cannot be bought — the code its archived-listing sibling already
 * uses). The sentence is shared; the code belongs to the rail's own grammar.
 */
export const PRICELESS_LISTING_REFUSAL: {
  readonly reason: BuyRefusalReason;
  readonly message: string;
} = {
  reason: "no_published_price",
  message:
    "This listing publishes no price, so it cannot be booked through this rail. A custom-quote listing is requested and quoted before anything is committed.",
};

/**
 * Resolve the buy action for a batch of platform listings.
 *
 * Returns a map keyed by listing id. A `provider_services` row ALWAYS has an owner, so the mode is
 * always concrete: the stored `booking_mode` wins where it has one, and otherwise ruling 75's ONE
 * derivation answers from the owner's account flag — falling back to `request` when that flag is
 * unknown, which is the safe default and is what the live catalogue already resolves to. The
 * `undefined` branch below survives for a caller that genuinely holds neither fact (no row on this
 * table can reach it); see the file header for why that is not a bug to "fix" (OC-A0b / V-9).
 */
export async function buildListingBuyActions(
  rows: ListingBuyRow[],
  buyer: BuyActionBuyer,
): Promise<Map<string, BuyAction>> {
  const out = new Map<string, BuyAction>();
  if (rows.length === 0) return out;

  // ── Owner instant-booking flags, one query for every owner in the batch. ──────────────────
  // Read through the ONE loader the cart and checkout rails also call (ledger
  // `2026-09-25-checkout-request-mode`), so the button and the rail behind it see the same flag.
  const instantByOwner = await loadOwnerInstantBookingFlags(rows.map((r) => r.ownerUserId));

  // ── Published calendars, one query for every listing in the batch. ────────────────────────
  // "Published" = at least one slot dated today or later. Deliberately NOT "has a FREE slot":
  // a fully-booked calendar is still a published calendar, and which slots are free is the
  // sheet's own question (the slot step reads the real calendar). The day boundary is UTC,
  // which can only ever include one extra day at the edge, never exclude a real one.
  const today = new Date().toISOString().slice(0, 10);
  const published = new Set<string>();
  const slotRows = await db
    .selectDistinct({ serviceId: vendorAvailabilitySlots.serviceId })
    .from(vendorAvailabilitySlots)
    .where(
      and(
        inArray(vendorAvailabilitySlots.serviceId, rows.map((r) => r.id)),
        gte(vendorAvailabilitySlots.date, today),
      ),
    );
  for (const s of slotRows) if (s.serviceId) published.add(s.serviceId);

  for (const row of rows) {
    const ownerInstant = row.ownerUserId ? instantByOwner.get(row.ownerUserId) : undefined;
    // The stored value wins outright; an UNSET mode is resolved from the account flag by
    // ruling 75's ONE derivation site. The flag is passed through UNCOERCED — `undefined`, `null`
    // and `false` all resolve to `request`, so the OUTPUT is exactly what it has always been,
    // while the provenance reader keeps the distinction the old `?? false` destroyed.
    const bookingMode: BuyBookingMode | undefined =
      row.bookingMode || row.ownerUserId
        ? (resolveBookingMode(row.bookingMode, ownerInstant) as BuyBookingMode)
        : undefined;
    out.set(
      row.id,
      resolveBuyAction(
        {
          kind: "listing",
          bookability: platformListingBookability(row.id),
          deliveryMethod: row.deliveryMethod ?? null,
          productShape: row.productShape ?? null,
          bookingMode,
          hasPrice: hasPublishedPrice(row.price),
          hasPublishedAvailability: published.has(row.id),
          isLive: row.isLive,
        },
        buyer,
      ),
    );
  }
  return out;
}

/** Convenience for a single listing — the public detail read's shape. */
export async function buildListingBuyAction(
  row: ListingBuyRow,
  buyer: BuyActionBuyer,
): Promise<BuyAction | undefined> {
  return (await buildListingBuyActions([row], buyer)).get(row.id);
}

// ─── A LISTING THE SELLER MUST ACCEPT IS NEVER A LIST-PRICE CART LINE ─────────────────────────
// Ledger `2026-09-25-checkout-request-mode`. Before this, NOTHING on the cart or checkout path read
// the booking mode: a `request`-mode listing (the seller accepts first) or a `custom_quote` listing
// (LD 49 — priced by an issued quote, never by the listing) could be carted — from the slip's
// routing flip, `POST /api/cart`, `POST /api/cart/items` — and `POST /api/checkout` charged the
// list price and promoted it straight to `confirmed`, with no acceptance from anyone. The button
// never offered that (`resolveBuyAction` row 11 lands `request` on `booking_request`, never
// `checkout`); the rails behind the button simply did not agree with it.

/**
 * The owners' `service_provider_forms.instant_booking` flags, ONE query for the batch — the input
 * `resolveBookingMode` needs to resolve an UNSET listing mode. Shared by `buildListingBuyActions`
 * (the buttons) and `requestOnlyListingRefusals` (the cart + checkout rails) so the button and the
 * rail behind it read the SAME fact the SAME way (§18 rule 1).
 *
 * UNCOERCED (OC-A0b): a NULL `instant_booking` is "the seller never answered", a different fact
 * from `false` ("the seller said no"). Both resolve to `request`; the NULL survives the map so the
 * provenance reader can still tell them apart (§13). An owner with no form row is simply absent.
 */
export async function loadOwnerInstantBookingFlags(
  ownerUserIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, boolean | null>> {
  const ownerIds = Array.from(new Set(ownerUserIds.filter((id): id is string => !!id)));
  const out = new Map<string, boolean | null>();
  if (ownerIds.length === 0) return out;
  const forms = await db
    .select({ userId: serviceProviderForms.userId, instantBooking: serviceProviderForms.instantBooking })
    .from(serviceProviderForms)
    .where(inArray(serviceProviderForms.userId, ownerIds));
  for (const f of forms) out.set(f.userId, f.instantBooking ?? null);
  return out;
}

/** Why a listing cannot be a list-price cart line. Machine-readable; the sentence is below. */
export type RequestOnlyReason = "listing_requires_request" | "listing_not_bookable";

export interface RequestOnlyRefusal {
  reason: RequestOnlyReason;
}

/**
 * THE ONE PREDICATE: may this listing be bought as a LIST-PRICE CART LINE?
 *
 * A listing whose commitment needs the SELLER's acceptance is never charged off the cart:
 *   · `price_type = 'custom_quote'` — Locked Decision 49: a custom quote is a `service_quotes` row,
 *     never a price on the listing, and its only charge rail is `POST /api/checkout
 *     {quoteBookingId}` after the traveler accepts the ISSUED quote. Tested FIRST, whatever the
 *     booking mode says (the offering contract's own P5 order, `archetypeForListing`).
 *   · the RESOLVED booking mode is `request` — ruling 75's `resolveBookingMode`, CALLED, never
 *     re-typed (§18 rule 1). `request` is the platform's safe default: "the traveler asks, the
 *     seller accepts, and no money moves without an acceptance" (`2026-09-11-oc-a1-ratified`).
 *     The provider-ACCEPTED commitment for such a listing is the quote rail — `requestQuote`
 *     admits exactly the listings `resolveBuyAction` row 11 lands on `booking_request`; the seller
 *     issues; the traveler accepts; the quote-born booking is charged through its OWN checkout arm
 *     and is never a cart line, so the cart line itself is the thing refused.
 *   · `hidden` — the seller withdrew the booking affordance (resolver row 1); nothing is bookable.
 *
 * PURE — no db, no clock. `ownerInstantBooking` is passed UNCOERCED (`undefined`/`null` = no flag
 * known; those and `false` all resolve to `request`).
 *
 * NEGATIVE SPACE (§18d): it reads the listing's OWN commitment facts only. `resolveBuyAction`'s two
 * FACT-shaped request rows — `instant` with no published calendar, `instant` with no price — are
 * NOT decided here: the first belongs to the checkout's slot/eligibility gates and the second is
 * `hasPublishedPrice`'s, already refused by its own rail with its own reason.
 */
export function listingRequiresRequest(
  listing: { priceType?: string | null; bookingMode?: string | null },
  ownerInstantBooking: boolean | null | undefined,
): RequestOnlyRefusal | null {
  if (listing.priceType === "custom_quote") return { reason: "listing_requires_request" };
  const mode = resolveBookingMode(listing.bookingMode, ownerInstantBooking);
  if (mode === "request") return { reason: "listing_requires_request" };
  if (mode === "hidden") return { reason: "listing_not_bookable" };
  return null;
}

type RequestOnlyListingFacts = {
  id: string;
  userId?: string | null;
  priceType?: string | null;
  bookingMode?: string | null;
};

/**
 * The batch form every rail calls: listing id → its refusal, for exactly the listings that have
 * one. ONE owner-flag query per batch, and only for listings whose mode is UNSET — a quote or a
 * declared mode answers on the row alone.
 *
 * ONLY A REAL `provider_services` ROW IS JUDGED, and the test is its OWNER: `user_id` is NOT NULL
 * on that table, while the cart reader's synthesized shapes carry none — a custom venue arrives as
 * `service: { id: "custom-…", … }` with no owner, a content row as `service: null`. Neither is a
 * seller's listing, neither has a booking mode, and resolving an ownerless shape would answer
 * `request` for a thing nobody sells (§13), so both are left out of the map.
 */
export async function requestOnlyListingRefusals(
  listings: ReadonlyArray<RequestOnlyListingFacts | null | undefined>,
): Promise<Map<string, RequestOnlyRefusal>> {
  const present = listings.filter((l): l is RequestOnlyListingFacts => !!l && !!l.id && !!l.userId);
  const out = new Map<string, RequestOnlyRefusal>();
  if (present.length === 0) return out;
  const needFlag = present.filter((l) => l.priceType !== "custom_quote" && !l.bookingMode);
  const flags = await loadOwnerInstantBookingFlags(needFlag.map((l) => l.userId));
  for (const l of present) {
    const refusal = listingRequiresRequest(l, l.userId ? flags.get(l.userId) : undefined);
    if (refusal) out.set(l.id, refusal);
  }
  return out;
}

/**
 * THE ONE SENTENCE per refusal, shared by both cart add rails, the LD 39 projection, the two cart
 * reads and checkout (the `PRICELESS_LISTING_REFUSAL` precedent: the sentence is shared; the HTTP
 * status belongs to each rail — 400 at an add, 409 at checkout).
 */
export const REQUEST_ONLY_REFUSAL_MESSAGE: Readonly<Record<RequestOnlyReason, string>> = {
  listing_requires_request:
    "This listing is booked by request: the provider accepts first, and nothing is charged until then. Ask for it from the listing page — it can stay on your plan meanwhile.",
  listing_not_bookable:
    "This listing is not open for booking right now. You can still message the provider about it.",
};

/**
 * The two cart READS (`GET /api/cart`, `/api/cart/fee-preview`) name the request-only lines on
 * disk and quote nothing for them — ONE helper so the two reads cannot disagree about which lines
 * or in which words (§18 rule 1). `named` is PRESENT-ONLY-WHEN-SET: `{}` for an all-instant cart,
 * so its response is byte-identical to before (§13, the `unpriceableItemIds` precedent).
 */
export async function requestOnlyCartLines(
  items: ReadonlyArray<{ id: string; service?: RequestOnlyListingFacts | null }>,
): Promise<{
  isRequestOnly: (item: { service?: { id: string } | null }) => boolean;
  named:
    | Record<string, never>
    | { requestOnlyItemIds: string[]; requestOnlyReasons: Record<string, RequestOnlyReason> };
}> {
  const refusals = await requestOnlyListingRefusals(items.map((i) => i.service ?? null));
  const isRequestOnly = (item: { service?: { id: string } | null }) =>
    !!item.service && refusals.has(item.service.id);
  const lines = items.filter(isRequestOnly);
  return {
    isRequestOnly,
    named:
      lines.length === 0
        ? {}
        : {
            requestOnlyItemIds: lines.map((i) => i.id),
            requestOnlyReasons: Object.fromEntries(
              lines.map((i) => [i.id, refusals.get(i.service!.id)!.reason]),
            ),
          },
  };
}

/** The listing page a refused line points to — where the request control lives. */
export function requestOnlyListingPath(serviceId: string): string {
  return `/services/${encodeURIComponent(serviceId)}`;
}

/** The body every rail answers a refused listing with (status is the rail's own). */
export function requestOnlyRefusalBody(
  refusal: RequestOnlyRefusal,
  listing: { id: string; serviceName?: string | null },
) {
  return {
    success: false,
    error: refusal.reason,
    reason: refusal.reason,
    message: REQUEST_ONLY_REFUSAL_MESSAGE[refusal.reason],
    serviceId: listing.id,
    ...(listing.serviceName ? { serviceName: listing.serviceName } : {}),
    listingPath: requestOnlyListingPath(listing.id),
  };
}
