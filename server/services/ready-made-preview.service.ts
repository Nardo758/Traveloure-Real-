/**
 * Slice B1 (work plan L3-1 + L3-14; ledger `2026-10-05-rmt-public-preview`): the PUBLIC preview of a
 * Ready Made Trip at `/t/<slug>` — cover, title, days, the expert and their local-verified stamp,
 * the price the buyer pays, and ONE sample day. Never the full itinerary.
 *
 * Gate: the public detail's own — `status = 'approved' AND active`; anything else is not found (no
 * draft-listing oracle). What leaves this module for the sample day is the stop's title, its draft
 * time, its type and its place name, plus the day's CONFIRMED legs (mode and minutes — R-ax's "the
 * public teaser counts confirmed legs only"). No coordinates, no notes, no expert notes, no prices,
 * no booking ids, no user ids (LD 40: the expert is named by first name and handle).
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { readyMadeTrips, transportLegs, users } from "@shared/schema";
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
  const [items, legs, verifiedMarkets] = await Promise.all([
    storage.getItineraryItems(listing.sourceTripId),
    db
      .select({
        fromActivityId: transportLegs.fromActivityId,
        toActivityId: transportLegs.toActivityId,
        proposalStatus: transportLegs.proposalStatus,
        userSelectedMode: transportLegs.userSelectedMode,
        recommendedMode: transportLegs.recommendedMode,
        estimatedDurationMinutes: transportLegs.estimatedDurationMinutes,
      })
      .from(transportLegs)
      .where(and(eq(transportLegs.tripId, listing.sourceTripId), eq(transportLegs.dayNumber, 1), isNull(transportLegs.variantId))),
    loadVerifiedMarkets(listing.authorId),
  ]);
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
    sampleDay: sampleDayOf(items as any, legs),
    lockedDays: Math.max(0, listing.durationDays - 1),
  };
}
