/**
 * BP-1 (ledger `2026-10-12-bp1-booking-path`): the FACTS the one pure resolver (`@shared/booking-path`) reads, for
 * every item of one plan, resolved once per plan — never once per item. This module decides nothing itself; every
 * fact is an existing rule called, never restated (§18 rule 1):
 *
 *   · live listing  — `optimizerCatalogLivenessWhere(null)`: active AND approved, the public read gate, unscoped
 *                     because the listing is attached to the item by id (no city to scope to).
 *   · LiteAPI stay  — `liteapiBookableItemIds`, the SAME chain the item sheet's own "Book" reads.
 *   · partner product — the item's `affiliate_product_id` names an ACTIVE product whose partner is active, approved
 *                     and carries a link template. BP-1b replaces this partner test with TC-2's exported partner
 *                     check (which adds `public_ok`) and adds transport pairs through TC-2's matcher — never a
 *                     second copy of either.
 *   · past day      — `planDayIsPast`, the engine's own rule, and only when the plan's dates were CHOSEN
 *                     (`dates_confirmed_at`): a placeholder window has no past (§13).
 *
 * The Trip Card's final snapshot freezes each item's path (`bookingPaths`, written by `finalizeTrip`); a snapshot
 * render reads the frozen value and a past day still reads `none` (decision-maker correction, Oct 12, 2026).
 */
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "../db";
import { affiliatePartners, affiliateProducts, providerServices } from "@shared/schema";
import { isBookingPath, resolveBookingPath, type BookingPath, type PartnerCoverageKind } from "@shared/booking-path";
import { planDayIsPast } from "@shared/plan-timing";
import { optimizerCatalogLivenessWhere } from "./optimizer-baseline.service";
import { liteapiBookableItemIds } from "./liteapi-booking.service";

export interface BookingPathTrip {
  id: string;
  destination?: string | null;
  startDate?: string | Date | null;
  timezone?: string | null;
  datesConfirmedAt?: Date | string | null;
}

export interface BookingPathItem {
  id: string;
  title?: string | null;
  locationName?: string | null;
  providerServiceId?: string | null;
  affiliateProductId?: string | null;
  dayNumber?: number | null;
}

/** The plan's city — the first segment of its destination — so the city's own name never counts as a place. */
function cityOf(destination: string | null | undefined): string | null {
  const c = (destination ?? "").split(",")[0]?.trim();
  return c ? c : null;
}

function startIso(start: string | Date | null | undefined): string | null {
  if (!start) return null;
  if (start instanceof Date) return Number.isNaN(start.getTime()) ? null : start.toISOString().slice(0, 10);
  return String(start).slice(0, 10);
}

async function liveListingIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: providerServices.id })
    .from(providerServices)
    .where(and(inArray(providerServices.id, ids), optimizerCatalogLivenessWhere(null)));
  return new Set(rows.map((r) => r.id));
}

async function coveredPartnerProductIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: affiliateProducts.id })
    .from(affiliateProducts)
    .innerJoin(affiliatePartners, eq(affiliatePartners.id, affiliateProducts.partnerId))
    .where(
      and(
        inArray(affiliateProducts.id, ids),
        eq(affiliateProducts.isActive, true),
        eq(affiliatePartners.isActive, true),
        eq(affiliatePartners.approvalStatus, "approved"),
        isNotNull(affiliatePartners.affiliateLinkTemplate),
        ne(affiliatePartners.affiliateLinkTemplate, ""),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

export interface BookingPathDeps {
  liveListingIds: (ids: string[]) => Promise<Set<string>>;
  coveredPartnerProductIds: (ids: string[]) => Promise<Set<string>>;
  liteapiBookableItemIds: (tripId: string) => Promise<Set<string>>;
}

export const defaultBookingPathDeps: BookingPathDeps = {
  liveListingIds,
  coveredPartnerProductIds,
  liteapiBookableItemIds: (tripId) => liteapiBookableItemIds(tripId),
};

/**
 * Every item's booking path for one plan. `frozen` is the final snapshot's map when the Trip Card renders a final:
 * a frozen value wins over the live facts, except that a past day is always `none`.
 */
export async function resolvePlanBookingPaths(
  trip: BookingPathTrip,
  items: readonly BookingPathItem[],
  opts: { now?: Date; frozen?: Record<string, unknown> | null } = {},
  deps: BookingPathDeps = defaultBookingPathDeps,
): Promise<Map<string, BookingPath>> {
  const now = opts.now ?? new Date();
  const listingIds = Array.from(new Set(items.map((i) => i.providerServiceId).filter((v): v is string => !!v)));
  const productIds = Array.from(new Set(items.map((i) => i.affiliateProductId).filter((v): v is string => !!v)));
  const [live, products, stays] = await Promise.all([
    deps.liveListingIds(listingIds),
    deps.coveredPartnerProductIds(productIds),
    deps.liteapiBookableItemIds(trip.id),
  ]);
  const city = cityOf(trip.destination);
  const start = startIso(trip.startDate);
  const datesChosen = trip.datesConfirmedAt != null;
  const out = new Map<string, BookingPath>();
  for (const item of items) {
    const dayIsPast = datesChosen && typeof item.dayNumber === "number" && planDayIsPast(start, item.dayNumber, trip.timezone ?? null, now);
    const frozen = opts.frozen?.[item.id];
    if (!dayIsPast && isBookingPath(frozen)) {
      out.set(item.id, frozen);
      continue;
    }
    let partnerCoverage: PartnerCoverageKind | null = null;
    if (stays.has(item.id)) partnerCoverage = "liteapi_stay";
    else if (item.affiliateProductId && products.has(item.affiliateProductId)) partnerCoverage = "partner_product";
    out.set(
      item.id,
      resolveBookingPath({
        liveListing: !!item.providerServiceId && live.has(item.providerServiceId),
        partnerCoverage,
        title: item.title ?? "",
        locationName: item.locationName ?? null,
        city,
        dayIsPast,
      }),
    );
  }
  return out;
}

/** The snapshot's frozen map, read defensively: anything that is not a known path is dropped. */
export function readFrozenBookingPaths(snapshot: unknown): Record<string, BookingPath> | null {
  const raw = (snapshot as { bookingPaths?: unknown } | null | undefined)?.bookingPaths;
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, BookingPath> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isBookingPath(v)) out[k] = v;
  return out;
}
