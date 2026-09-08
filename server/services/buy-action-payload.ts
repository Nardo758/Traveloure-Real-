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

/** A positive published price. A price of NULL or 0 is NOT a price (§13/§14 — none is invented). */
function hasPrice(price: string | number | null | undefined): boolean {
  if (price === null || price === undefined) return false;
  const n = typeof price === "number" ? price : Number(price);
  return Number.isFinite(n) && n > 0;
}

/**
 * Resolve the buy action for a batch of platform listings.
 *
 * Returns a map keyed by listing id. A row whose owner is unknown still resolves — its stored
 * `booking_mode` wins where it has one, and where it does not the account flag is genuinely
 * unknown, so `resolveBookingMode` is not called with a fabricated `false` (§13); the mode stays
 * absent and the resolver's last row offers no booking verb.
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
  const instantByOwner = new Map<string, boolean>();
  if (ownerIds.length > 0) {
    const forms = await db
      .select({ userId: serviceProviderForms.userId, instantBooking: serviceProviderForms.instantBooking })
      .from(serviceProviderForms)
      .where(inArray(serviceProviderForms.userId, ownerIds));
    for (const f of forms) instantByOwner.set(f.userId, f.instantBooking ?? false);
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
    // ruling 75's ONE derivation site. With no owner and no stored value there is nothing
    // honest to resolve from, so the mode is left absent (§13).
    const bookingMode: BuyBookingMode | undefined =
      row.bookingMode || row.ownerUserId
        ? (resolveBookingMode(row.bookingMode, ownerInstant ?? false) as BuyBookingMode)
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
          hasPrice: hasPrice(row.price),
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
