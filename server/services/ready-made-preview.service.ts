/**
 * Slice B1 (work plan L3-1 + L3-14; ledger `2026-10-05-rmt-public-preview`): the PUBLIC preview of a
 * Ready Made Trip at `/t/<slug>` — cover, title, days, the expert and their local-verified stamp,
 * the price the buyer pays, and ONE sample day. Never the full itinerary.
 *
 * Gate: the public detail's own — `status = 'approved' AND active`; anything else is not found (no
 * draft-listing oracle). What leaves this module for the sample day is an OUTLINE — its stop count and
 * the neighbourhoods its stops are in (CP-1 PR 2, ledger `2026-10-15-cp1-teasers`): no stop title, time
 * or place name, no leg minutes, no coordinates, no notes, no prices, no booking ids, no user ids (LD 40:
 * the expert is named by first name and handle).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { readyMadeTrips, users } from "@shared/schema";
import { nearestAreaName } from "../utils/public-service-listing";
import { cityNeighborhoodNames } from "./listing-location-access.service";
import { isCustomPlanType, planTypeLabel } from "@shared/ready-made-plan-types";
import {
  readyMadeIdToken,
  readyMadePreviewPath,
  readyMadePriceLine,
  readyMadeSlug,
  readyMadeSlugToken,
  photoSourceName,
  sampleDayOf,
  type ReadyMadePreview,
} from "@shared/ready-made-preview";
import { storage } from "../storage";
import { loadVerifiedMarkets } from "./blog-byline-gate.service";
import { resolveMarketSlug } from "./trend-engine/operating-markets";

/** The public listing a slug names, or null (no token, no match, or an ambiguous token). */
export async function findPublicListingBySlug(slug: string) {
  const token = readyMadeSlugToken(slug);
  if (!token) return null;
  const rows = await db
    .select()
    .from(readyMadeTrips)
    .where(
      and(
        eq(readyMadeTrips.status, "approved"),
        eq(readyMadeTrips.active, true),
        sql`lower(regexp_replace(${readyMadeTrips.id}, '[^a-zA-Z0-9]', '', 'g')) LIKE ${`${token}%`}`,
      ),
    )
    .limit(2);
  if (rows.length !== 1) return null;
  return readyMadeIdToken(rows[0].id) === token ? rows[0] : null;
}

export async function loadReadyMadePreview(slug: string): Promise<ReadyMadePreview | null> {
  const listing = await findPublicListingBySlug(slug);
  if (!listing) return null;
  const [author] = await db
    .select({ firstName: users.firstName, handle: users.handle })
    .from(users)
    .where(eq(users.id, listing.authorId))
    .limit(1);
  const [items, verifiedMarkets, neighborhoods] = await Promise.all([
    storage.getItineraryItems(listing.sourceTripId),
    loadVerifiedMarkets(listing.authorId),
    listing.market ? cityNeighborhoodNames(listing.market) : Promise.resolve([]),
  ]);
  const itemById = new Map((items as any[]).map((i) => [i.id, i] as const));
  const areaOf = (i: { id: string }) => {
    const row = itemById.get(i.id);
    return row ? nearestAreaName(row.latitude, row.longitude, neighborhoods) : null;
  };
  const marketSlug = resolveMarketSlug(listing.market ?? "");
  const meta = (listing.heroImageMeta ?? null) as { photographer?: string; profileUrl?: string; unsplashId?: string } | null;
  const planLabel = (isCustomPlanType(listing.planType) && listing.planTypeCustom)
    ? listing.planTypeCustom
    : (planTypeLabel(listing.planType) ?? "Trip plan");
  return {
    id: listing.id,
    slug: readyMadeSlug(listing),
    path: readyMadePreviewPath(listing),
    title: listing.title,
    market: listing.market,
    durationDays: listing.durationDays,
    planLabel,
    heroImageUrl: listing.heroImageUrl ?? null,
    heroCredit: meta?.photographer
      ? { photographer: meta.photographer, profileUrl: meta.profileUrl ?? null, source: photoSourceName(meta) }
      : null,
    priceLine: readyMadePriceLine(listing),
    expert: {
      name: author?.firstName?.trim() || "Expert",
      handle: author?.handle ?? null,
      localVerified: !!marketSlug && verifiedMarkets.includes(marketSlug),
    },
    sampleDay: sampleDayOf(items as any, areaOf),
    lockedDays: Math.max(0, listing.durationDays - 1),
  };
}
