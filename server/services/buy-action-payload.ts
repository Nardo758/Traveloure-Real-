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
  const ownerIds = Array.from(
    new Set(rows.map((r) => r.ownerUserId).filter((id): id is string => !!id)),
  );
  const instantByOwner = new Map<string, boolean | null>();
  if (ownerIds.length > 0) {
    const forms = await db
      .select({ userId: serviceProviderForms.userId, instantBooking: serviceProviderForms.instantBooking })
      .from(serviceProviderForms)
      .where(inArray(serviceProviderForms.userId, ownerIds));
    // UNCOERCED (OC-A0b): a NULL `instant_booking` is "the seller never answered", which is a
    // different fact from `false` ("the seller said no"). Both resolve to `request`, so nothing
    // downstream changes — but the provenance reader can only tell them apart if the NULL survives
    // the map (§13).
    for (const f of forms) instantByOwner.set(f.userId, f.instantBooking ?? null);
  }

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
