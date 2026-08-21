/**
 * content-query.service.ts
 * DB-touching helpers extracted from content.routes.ts.
 * Routes → this service (or storage) → db. No raw db calls in route handlers.
 */

import { db } from "../db";
import {
  eq, and, or, inArray, ilike, count, sql, gte,
} from "drizzle-orm";
import {
  users, contactSubmissions, userAndExpertChats, notifications,
  aiBlueprints, serviceProviderForms, expertServiceOfferings, expertServiceCategories,
  aiInteractions, serviceReviews,
  localExpertForms, destinationIntelligence, aiGeneratedItineraries,
  itineraryComparisons, providerServices, destinationEvents,
  affiliateProducts, affiliatePartners, contentRegistry, affiliateClicks,
  trips, serviceBookings, expertMatchScores, itineraryItems, tripCollaborators,
  contentVersions,
  experienceTypes,
} from "@shared/schema";
import { contentOriginFor } from "@shared/content-origin";
import { storage } from "../storage";
import { resolveMarketSlug } from "./trend-engine/operating-markets";
import type { NormalizedGeneratedCanonicalItem } from "../utils/generated-itinerary";
import { flagReviewSignal } from "./review-mutation.service";

// ─── Health ───────────────────────────────────────────────────────────────────

export async function dbHealthCheck(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

// ─── Offering Types ───────────────────────────────────────────────────────────

export async function getServiceOfferingTypes(market?: string | null): Promise<any[]> {
  // `id` added (§17 offering-first provider create): ServiceForm needs the row's
  // PK to persist provider_services.service_offering_type_id (migration 148 FK).
  // Additive column in the SELECT only — existing consumers (earn.tsx) ignore
  // unknown fields, so this is backward-compatible.
  const result = await db.execute(sql`
    SELECT id, offering_type_key, category_key, display_name, tagline,
           is_surprising, market_scoped, sort_order
    FROM service_offering_types
    WHERE is_active = true
      AND (
        ${market ?? null}::text IS NULL
        OR market_scoped IS NULL
        OR ${market ?? null}::text = ANY(market_scoped)
      )
    ORDER BY sort_order ASC, display_name ASC
  `);
  return result.rows ?? [];
}

export async function getExpertOfferingTypes(tier?: string | null): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT offering_type_key, service_tier, display_name, tagline,
           delivery_formats, is_surprising, sort_order
    FROM expert_offering_types
    WHERE is_active = true
      AND (${tier ?? null}::text IS NULL OR service_tier = ${tier ?? null}::text)
    ORDER BY sort_order ASC, display_name ASC
  `);
  return result.rows ?? [];
}

// ─── Feed Composition Config ──────────────────────────────────────────────────

export async function getFeedCompositionConfig(): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT setting_key, setting_value
    FROM platform_settings
    WHERE setting_key IN (
      'feed_rec_cadence', 'feed_wanted_slot_max', 'feed_wanted_slot_spacing',
      'feed_rec_label', 'feed_rec_affiliate_label'
    )
  `);
  return result.rows ?? [];
}

// ─── Contact Submission ───────────────────────────────────────────────────────

export async function insertContactSubmission(values: {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  reason?: string | null;
  preferredContactMethod?: string | null;
  source?: string | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<any> {
  const [submission] = await db.insert(contactSubmissions).values({
    name: values.name,
    email: values.email,
    phone: values.phone || null,
    subject: values.subject,
    message: values.message,
    reason: values.reason || null,
    preferredContactMethod: values.preferredContactMethod || null,
    source: values.source || "contact_page",
    ipAddress: values.ipAddress || null,
    userAgent: values.userAgent || null,
  } as any).returning();
  return submission;
}

export async function getAdminUserIds(): Promise<string[]> {
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  return admins.map(a => a.id);
}

// ─── Chat Start ───────────────────────────────────────────────────────────────

export async function getUserById(userId: string): Promise<any | undefined> {
  return db.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
}

export async function insertExpertChat(values: {
  senderId: string;
  receiverId: string;
  message: string;
}): Promise<any> {
  const [chat] = await db.insert(userAndExpertChats).values({
    senderId: values.senderId,
    receiverId: values.receiverId,
    message: values.message,
  }).returning();
  return chat;
}

export async function insertChatNotification(values: {
  userId: string;
  chatId: string;
  senderId: string;
  tripId?: string;
}): Promise<void> {
  await db.insert(notifications).values({
    userId: values.userId,
    type: "new_chat",
    title: "New message",
    message: "You have a new message from a traveler",
    data: { chatId: values.chatId, senderId: values.senderId, tripId: values.tripId },
  } as any);
}

// ─── AI Blueprint ─────────────────────────────────────────────────────────────

export async function insertAiBlueprint(values: {
  userId: string;
  eventType: string;
  destination: string;
  blueprintData: any;
}): Promise<any> {
  const [blueprint] = await db.insert(aiBlueprints).values({
    userId: values.userId,
    eventType: values.eventType,
    destination: values.destination,
    blueprintData: values.blueprintData,
    status: "generated",
  } as any).returning();
  return blueprint;
}

// ─── Service Category Provider Counts ────────────────────────────────────────

export async function getProviderCountsByCategory(): Promise<Record<string, number>> {
  const counts = await db.select({
    categoryId: sql<string | null>`category_id`,
    count: sql<number>`count(*)::int`,
  })
    .from(serviceProviderForms)
    .where(sql`category_id is not null`)
    .groupBy(sql`category_id`);
  const map: Record<string, number> = {};
  counts.forEach(c => { if (c.categoryId) map[c.categoryId] = c.count; });
  return map;
}

// ─── Experience Types ─────────────────────────────────────────────────────────

export async function getExperienceTypeById(id: string): Promise<any | null> {
  return db.select().from(experienceTypes).where(eq(experienceTypes.id, id)).then(r => r[0] ?? null);
}

// ─── Service Templates (ESO) ──────────────────────────────────────────────────

export async function getDefaultServiceTemplates(): Promise<any[]> {
  return db.select({
    id: expertServiceOfferings.id,
    name: expertServiceOfferings.name,
    description: expertServiceOfferings.description,
    price: expertServiceOfferings.price,
    isDefault: expertServiceOfferings.isDefault,
    sortOrder: expertServiceOfferings.sortOrder,
    createdAt: expertServiceOfferings.createdAt,
    categoryName: expertServiceCategories.name,
  })
    .from(expertServiceOfferings)
    .leftJoin(expertServiceCategories, eq(expertServiceOfferings.categoryId, expertServiceCategories.id))
    .where(eq(expertServiceOfferings.isDefault, true))
    .orderBy(expertServiceOfferings.sortOrder);
}

export async function getServiceTemplateById(id: string): Promise<any | null> {
  return db.select().from(expertServiceOfferings)
    .where(eq(expertServiceOfferings.id, id)).then(r => r[0] ?? null);
}

// ─── AI Interactions ──────────────────────────────────────────────────────────

export async function insertAiInteraction(values: Record<string, any>): Promise<void> {
  await db.insert(aiInteractions).values(values as any).catch(
    (err: any) => console.error("[Analytics] Failed to insert AI interaction:", err),
  );
}

// ─── Review Flagging ──────────────────────────────────────────────────────────

export async function getReviewById(reviewId: string): Promise<any | null> {
  const [review] = await db.select().from(serviceReviews).where(eq(serviceReviews.id, reviewId)).limit(1);
  return review ?? null;
}

export async function flagReview(reviewId: string, reason: string | null, actorId: string): Promise<boolean> {
  return flagReviewSignal(reviewId, reason, actorId);
}

// ─── Expert Matching ──────────────────────────────────────────────────────────

export async function getLocalExpertUsers(): Promise<any[]> {
  return db.select().from(users).where(eq(users.role, "local_expert"));
}

export async function getApprovedExpertForms(): Promise<any[]> {
  return db.select().from(localExpertForms).where(eq(localExpertForms.status, "approved"));
}

export async function insertExpertMatchScore(values: Record<string, any>): Promise<void> {
  db.insert(expertMatchScores).values(values as any)
    .catch((err: any) => console.error("Failed to store match score:", err));
}

// ─── Destination Intelligence ─────────────────────────────────────────────────

export async function getCachedDestinationIntelligence(destination: string): Promise<any | null> {
  const cached = await db.select()
    .from(destinationIntelligence)
    .where(eq(destinationIntelligence.destination, destination.toLowerCase()))
    .limit(1);
  if (cached.length > 0 && new Date((cached[0] as any).expiresAt) > new Date()) {
    return cached[0];
  }
  return null;
}

export async function getCachedDestinationIntelligenceWithDates(
  destination: string,
  dates?: { start: string; end: string },
): Promise<any | null> {
  const now = new Date();
  const cacheConditions = dates
    ? and(
      eq(destinationIntelligence.destination, destination),
      eq(destinationIntelligence.startDate, dates.start),
      eq(destinationIntelligence.endDate, dates.end),
      sql`${destinationIntelligence.expiresAt} > ${now.toISOString()}`,
    )
    : and(
      eq(destinationIntelligence.destination, destination),
      sql`${destinationIntelligence.startDate} IS NULL`,
      sql`${destinationIntelligence.expiresAt} > ${now.toISOString()}`,
    );
  const cached = await db.select()
    .from(destinationIntelligence)
    .where(cacheConditions)
    .orderBy(sql`${destinationIntelligence.lastUpdated} DESC`)
    .limit(1);
  return cached[0] ?? null;
}

export async function insertDestinationIntelligence(values: Record<string, any>): Promise<void> {
  await db.insert(destinationIntelligence).values(values as any)
    .catch((err: any) => console.error("Failed to cache intelligence:", err));
}

export async function insertDestinationIntelligenceStrict(values: Record<string, any>): Promise<void> {
  await db.insert(destinationIntelligence).values(values as any);
}

// ─── AI Generated Itineraries ─────────────────────────────────────────────────

export async function insertAiGeneratedItinerary(values: Record<string, any>): Promise<any> {
  const [saved] = await db.insert(aiGeneratedItineraries).values(values as any).returning();
  return saved;
}

export interface SaveGeneratedItinerarySnapshotInput {
  userId: string;
  tripId?: string | null;
  trip: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    numberOfTravelers: number;
    status: string;
    eventType: string;
    specialRequests: string | null;
  };
  generatedPlan: Record<string, any>;
  canonicalItems: NormalizedGeneratedCanonicalItem[];
  comparison: Record<string, any>;
}

/**
 * Persists every traveler-visible representation of one AI generation as one
 * snapshot. Existing trips are row-locked so concurrent regenerations cannot
 * interleave their delete/insert phases.
 */
export async function saveGeneratedItinerarySnapshot(
  input: SaveGeneratedItinerarySnapshotInput,
): Promise<{
  trip: any;
  savedItinerary: any;
  insertedItems: Array<NormalizedGeneratedCanonicalItem & { id: string }>;
  comparison: any;
}> {
  // Sequence increments are intentionally outside the snapshot transaction:
  // tracking numbers may have gaps after a rollback, but are never reused.
  const trackingNumber = input.tripId ? null : await storage.generateTrackingNumber("TRV");

  return db.transaction(async (tx) => {
    let trip: any;
    if (input.tripId) {
      const locked = await tx.execute(sql`
        SELECT *
        FROM trips
        WHERE id = ${input.tripId} AND user_id = ${input.userId}
        FOR UPDATE
      `);
      trip = locked.rows[0];
      if (!trip) throw new Error("Trip not found or not owned by user");
    } else {
      [trip] = await tx.insert(trips).values({
        userId: input.userId,
        trackingNumber,
        title: input.trip.title,
        destination: input.trip.destination,
        startDate: input.trip.startDate,
        endDate: input.trip.endDate,
        numberOfTravelers: input.trip.numberOfTravelers,
        status: input.trip.status,
        eventType: input.trip.eventType,
        specialRequests: input.trip.specialRequests,
        marketSlug: resolveMarketSlug(input.trip.destination),
      } as any).returning();

      await tx.insert(tripCollaborators).values({
        tripId: trip.id,
        userId: input.userId,
        role: "owner",
      }).onConflictDoNothing();

      const [registryEntry] = await tx.insert(contentRegistry).values({
        trackingNumber: trackingNumber!,
        contentType: "trip",
        contentId: trip.id,
        ownerId: input.userId,
        title: trip.title || "Untitled Trip",
        status: trip.status === "draft" ? "draft" : "published",
        publishedAt: trip.status === "draft" ? null : new Date(),
        metadata: { destination: trip.destination, eventType: trip.eventType },
      } as any).returning();
      await tx.insert(contentVersions).values({
        trackingNumber: registryEntry.trackingNumber,
        version: 1,
        changeType: "created",
        changedBy: input.userId,
        newData: {
          title: registryEntry.title,
          description: registryEntry.description,
          status: registryEntry.status,
        },
      } as any);
    }

    const tripId = input.tripId || trip.id;
    const [savedItinerary] = await tx.insert(aiGeneratedItineraries).values({
      ...input.generatedPlan,
      userId: input.userId,
      tripId,
    } as any).returning();

    // item-removed:replace — one complete AI regeneration, not individual removals.
    await tx.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId));
    const insertedRows = input.canonicalItems.length === 0
      ? []
      : await tx.insert(itineraryItems).values(
        input.canonicalItems.map((activity, sortOrder) => ({
          tripId,
          title: activity.title,
          description: activity.description,
          itemType: activity.type,
          status: "planned",
          dayNumber: activity.dayNumber,
          startTime: activity.time,
          durationMinutes: activity.durationMinutes,
          locationName: activity.location || input.trip.destination,
          estimatedCost: activity.estimatedCost,
          currency: "USD",
          suggestedBy: "ai",
          origin: "ai",
          sortOrder,
        })),
      ).returning({ id: itineraryItems.id });

    const insertedItems = input.canonicalItems.map((activity, index) => ({
      ...activity,
      id: insertedRows[index].id,
    }));

    const [comparison] = await tx.insert(itineraryComparisons).values({
      ...input.comparison,
      userId: input.userId,
      tripId,
    } as any).returning();

    return { trip, savedItinerary, insertedItems, comparison };
  });
}

export async function getAiItinerariesForUser(userId: string): Promise<any[]> {
  return db.select()
    .from(aiGeneratedItineraries)
    .where(eq(aiGeneratedItineraries.userId, userId))
    .orderBy(sql`${aiGeneratedItineraries.createdAt} DESC`)
    .limit(20);
}

export async function getAiItineraryById(id: string, userId: string): Promise<any | null> {
  const [item] = await db.select()
    .from(aiGeneratedItineraries)
    .where(and(
      eq(aiGeneratedItineraries.id, id),
      eq(aiGeneratedItineraries.userId, userId),
    ))
    .limit(1);
  return item ?? null;
}

// ─── Itinerary Comparisons ────────────────────────────────────────────────────

export async function insertItineraryComparison(values: Record<string, any>): Promise<any> {
  const [comparison] = await db.insert(itineraryComparisons).values(values as any).returning();
  return comparison;
}

export async function updateItineraryComparisonStatus(id: string, status: string): Promise<void> {
  await db.update(itineraryComparisons)
    .set({ status } as any)
    .where(eq(itineraryComparisons.id, id));
}

export async function getActiveProviderServices(limit = 30): Promise<any[]> {
  // F2 public read-gate: content/discover surface — approved listings only.
  return db.select()
    .from(providerServices)
    .where(and(eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved")))
    .limit(limit);
}

// ─── Destination Events ───────────────────────────────────────────────────────

export async function getDestinationEventsByCity(city: string): Promise<any[]> {
  return db.select()
    .from(destinationEvents)
    .where(eq(destinationEvents.city, city));
}

export async function getAllDestinationEvents(): Promise<any[]> {
  return db.select().from(destinationEvents);
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function insertHelpGuideTrips(values: any[]): Promise<void> {
  const { helpGuideTrips } = await import("@shared/schema");
  await db.insert(helpGuideTrips).values(values as any);
}

export async function insertTouristPlacesSearch(values: Record<string, any>): Promise<any> {
  const { touristPlacesSearches } = await import("@shared/schema");
  const [row] = await db.insert(touristPlacesSearches).values(values as any).returning();
  return row;
}

// ─── Expert Users (for affiliate booking) ────────────────────────────────────

export async function getExpertUserIds(limit = 10): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users)
    .where(eq((users as any).role, "expert")).limit(limit);
  return rows.map(r => r.id);
}

// ─── Gem by ID ────────────────────────────────────────────────────────────────

export async function getAiDiscoveredGemById(id: string): Promise<any | null> {
  const { aiDiscoveredGems } = await import("@shared/schema");
  const [gem] = await db.select()
    .from(aiDiscoveredGems)
    .where(eq(aiDiscoveredGems.id, id))
    .limit(1);
  return gem ?? null;
}

// ─── Content Discovery ────────────────────────────────────────────────────────

export async function getAffiliateProductsByIds(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  return db.select().from(affiliateProducts)
    .where(and(
      eq(affiliateProducts.isActive, true),
      // Phase 4 partner-level read-gate (migration 121): a placement rule must never surface a
      // product whose partner is not admin-approved. This mirrors getAffiliateProductsByLocation —
      // the two public read paths must gate identically (audit G-SEC).
      sql`EXISTS (SELECT 1 FROM ${affiliatePartners} WHERE ${affiliatePartners.id} = ${affiliateProducts.partnerId} AND ${affiliatePartners.approvalStatus} = 'approved')`,
      inArray(affiliateProducts.id, ids),
    ));
}

export async function getContentRegistryByIds(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  const rows = await db.select().from(contentRegistry)
    .where(and(
      eq(contentRegistry.status, "published"),
      inArray(contentRegistry.id, ids),
    ));
  // Hard invariant: never return 'sourced' (DMO) content to a traveler surface, even if an admin
  // placement rule points at it.
  return rows.filter(r => contentOriginFor(r.contentType) !== "sourced");
}

export async function getAffiliateProductsByLocation(params: {
  city: string;
  country: string;
  allowedCategories?: string[] | null;
  excludeIds?: string[];
}): Promise<any[]> {
  const base = and(
    eq(affiliateProducts.isActive, true),
    // Phase 4 partner-level read-gate: only surface products whose partner is admin-approved.
    sql`EXISTS (SELECT 1 FROM ${affiliatePartners} WHERE ${affiliatePartners.id} = ${affiliateProducts.partnerId} AND ${affiliatePartners.approvalStatus} = 'approved')`,
    or(
      ilike(affiliateProducts.city, `%${params.city}%`),
      ilike(affiliateProducts.country, `%${params.country}%`),
      ilike(affiliateProducts.location, `%${params.city}%`),
    ),
  );
  const withCat = params.allowedCategories?.length
    ? and(base, or(...params.allowedCategories.map(cat => ilike(affiliateProducts.category, `%${cat}%`))))
    : base;

  const withExclude = params.excludeIds?.length
    ? and(withCat, sql`${affiliateProducts.id}::text != ALL(ARRAY[${sql.raw(params.excludeIds.map(id => `'${id.replace(/'/g, "''")}'`).join(","))}]::text[])`)
    : withCat;

  return db.select().from(affiliateProducts).where(withExclude).limit(20);
}

export async function getContentRegistryByLocation(params: {
  city: string;
  country: string;
  allowedContentTypes: string[];
  excludeIds?: string[];
}): Promise<any[]> {
  // Hard invariant: 'sourced' (DMO) content is EXPERT-WORKSPACE-ONLY and never reaches a traveler
  // surface. Filter it out of the allowed set even if a surface map ever mistakenly includes it.
  const travelerTypes = params.allowedContentTypes.filter(t => contentOriginFor(t) !== "sourced");
  if (!travelerTypes.length) return [];
  const locationFilter = sql`(
    ${contentRegistry.metadata}->>'location' ILIKE ${"%" + params.city + "%"}
    OR ${contentRegistry.metadata}->>'city' ILIKE ${"%" + params.city + "%"}
    OR ${contentRegistry.metadata}->>'country' ILIKE ${"%" + params.country + "%"}
    OR ${contentRegistry.metadata}->>'destination' ILIKE ${"%" + params.city + "%"}
  )`;

  const conditions = [
    eq(contentRegistry.status, "published"),
    locationFilter,
    inArray(contentRegistry.contentType, travelerTypes as any),
    ...(params.excludeIds?.length
      ? [sql`${contentRegistry.id}::text != ALL(ARRAY[${sql.raw(params.excludeIds.map(id => `'${id.replace(/'/g, "''")}'`).join(","))}]::text[])`]
      : []),
  ];

  return db.select().from(contentRegistry).where(and(...conditions)).limit(20);
}

/**
 * §16 vacation-mode enforcement (deferred arm of the ratified Aug 9 2026 vacation-mode
 * ruling — CLAUDE.md §06b/mockup). Every platform search/surfacing rail that lists rows
 * owned by an earner must exclude rows whose owner is CURRENTLY away
 * (`users.vacationUntil` non-null and in the future) — the listing itself is untouched
 * (read-only, no provider_services/content_registry row is written), so it reappears
 * automatically the moment the flag clears or expires. Shared by every surfacing rail so
 * "away" can't drift between call sites (searchWorkstationPlatformContent below, the public
 * `/api/provider-services` listing, and the platform arm of `/api/search/experiences`).
 * `getOwnerId` returning null/undefined (no owner, or an owner field absent on the row)
 * always passes — there is nothing to be away FROM.
 */
export async function filterOutAwayOwners<T>(
  rows: T[],
  getOwnerId: (row: T) => string | null | undefined,
): Promise<T[]> {
  const ownerIds = Array.from(
    new Set(rows.map(getOwnerId).filter((id): id is string => !!id)),
  );
  if (ownerIds.length === 0) return rows;
  const awayRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ownerIds), sql`${users.vacationUntil} > now()`));
  if (awayRows.length === 0) return rows;
  const awaySet = new Set(awayRows.map((r) => r.id));
  return rows.filter((row) => {
    const ownerId = getOwnerId(row);
    return !ownerId || !awaySet.has(ownerId);
  });
}

/**
 * W1-A: the Workstation Add panel's "Platform content" pill — a read-only search over the
 * central content_registry, scoped to the build's destination + an optional free-text query.
 * Mirrors the traveler resolver's read-gates (getContentRegistryByLocation above): only
 * `status = 'published'` rows (the same gate every content type's own approval queue funnels
 * into before it can be marked published), and the §12/DMO invariant — 'sourced' (dmo_content)
 * origin rows are HARD-EXCLUDED, exactly like the traveler resolver, so DMO content never
 * leaves its own pill through this surface either. Returns teaser-safe fields only (never the
 * full metadata blob) — id/type/title/description/image/city/lat/lng, and only when present in
 * the row's own metadata (§13: never fabricate a coordinate or image that isn't really there).
 */
export async function searchWorkstationPlatformContent(params: {
  city?: string;
  query?: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  image: string | null;
  city: string | null;
  latitude?: string;
  longitude?: string;
}>> {
  const limit = Math.min(50, Math.max(1, params.limit ?? 30));
  const conditions = [eq(contentRegistry.status, "published")];

  const city = (params.city ?? "").trim();
  if (city) {
    conditions.push(sql`(
      ${contentRegistry.metadata}->>'city' ILIKE ${"%" + city + "%"}
      OR ${contentRegistry.metadata}->>'location' ILIKE ${"%" + city + "%"}
      OR ${contentRegistry.metadata}->>'destination' ILIKE ${"%" + city + "%"}
    )`);
  }

  const q = (params.query ?? "").trim();
  if (q) {
    conditions.push(or(
      ilike(contentRegistry.title, `%${q}%`),
      ilike(contentRegistry.description, `%${q}%`),
    ) as any);
  }

  const rows = await db.select().from(contentRegistry)
    .where(and(...conditions))
    .limit(limit);

  // §16 vacation-mode enforcement (see filterOutAwayOwners doc above) — an away owner's
  // content_registry rows drop out of this Workstation search until the flag clears.
  const liveRows = await filterOutAwayOwners(rows, (r) => r.ownerId);

  // Hard invariant (§12/DMO model): 'sourced' content never leaves the DMO pill — even here,
  // even though it's read-only, even if a future placement rule ever pointed at one.
  return liveRows
    .filter(r => contentOriginFor(r.contentType) !== "sourced")
    .map(r => {
      const meta: any = r.metadata || {};
      const rawLat = meta.lat ?? meta.latitude;
      const rawLng = meta.lng ?? meta.longitude;
      const lat = rawLat == null ? NaN : Number(rawLat);
      const lng = rawLng == null ? NaN : Number(rawLng);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      return {
        id: r.id,
        type: r.contentType,
        title: r.title,
        description: r.description,
        image: meta.cover_image || meta.imageUrl || meta.image_url || meta.image || null,
        city: meta.city || meta.location || null,
        ...(hasCoords ? { latitude: String(lat), longitude: String(lng) } : {}),
      };
    });
}

// ─── Affiliate Click Tracking ─────────────────────────────────────────────────

export async function insertAffiliateClick(values: Record<string, any>): Promise<void> {
  await db.insert(affiliateClicks).values(values as any);
}

// ─── Platform Stats ───────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<{
  totalTrips: number;
  totalUsers: number;
  totalExperts: number;
  totalReviews: number;
  totalBookings: number;
  avgRating: string;
  totalCountries: number;
}> {
  const [userCount] = await db.select({ count: count() }).from(users);
  const [tripCount] = await db.select({ count: count() }).from(trips);
  const [expertCount] = await db.select({ count: count() }).from(localExpertForms)
    .where(eq(localExpertForms.status, "approved"));
  const [reviewCount] = await db.select({ count: count() }).from(serviceReviews);
  const [bookingCount] = await db.select({ count: count() }).from(serviceBookings);
  const allReviews = await db.select({ rating: serviceReviews.rating }).from(serviceReviews);
  // §13: never fabricate a rating. With zero reviews the honest average is "0" (the frontend can
  // render "New"); the old "4.9" fallback invented a score over an empty aggregate (the PR #177 class).
  const avgRating = allReviews.length > 0
    ? (allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length).toFixed(1)
    : "0";
  const allTrips = await db.select({ destination: trips.destination }).from(trips);
  const uniqueCountries = new Set(
    allTrips.map(t => t.destination?.split(",").pop()?.trim()).filter(Boolean),
  );
  return {
    totalTrips: tripCount?.count || 0,
    totalUsers: userCount?.count || 0,
    totalExperts: expertCount?.count || 0,
    totalReviews: reviewCount?.count || 0,
    totalBookings: bookingCount?.count || 0,
    totalCountries: uniqueCountries.size || 0,
    avgRating,
  };
}

// ─── Featured Testimonials (curated rail, CLAUDE.md §13 trust-claims cluster) ─
//
// The landing page previously carried fabricated testimonials (invented names,
// invented "$2,400 saved" claims). §13 mandates removal with no replacement
// fabrication; the decision-maker ratified an admin-curated rail instead: an
// admin picks real, booking-gated `service_reviews` to feature, stored as a
// `platform_settings` JSON array of review ids (`featured_testimonial_review_ids`).
// This reader resolves those ids against the real table — unknown/deleted ids
// and reviews that aren't (or are no longer) 'approved' are silently skipped,
// never invented, never a fallback fabrication. Empty setting → empty array,
// and the landing page hides the section entirely (see PublicTestimonial type
// mirrored client-side).
export async function getFeaturedTestimonials(): Promise<Array<{
  id: string;
  rating: number;
  reviewText: string | null;
  reviewerName: string;
  serviceName: string;
  createdAt: Date | string | null;
}>> {
  const settingResult = await db.execute(sql`
    SELECT setting_value FROM platform_settings
    WHERE setting_key = 'featured_testimonial_review_ids'
    LIMIT 1
  `);
  const raw = (settingResult.rows?.[0] as any)?.setting_value as string | undefined;
  if (!raw) return [];

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      ids = parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
  } catch {
    return []; // malformed setting → honest empty, never throw into a public surface
  }
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      id: serviceReviews.id,
      rating: serviceReviews.rating,
      reviewText: serviceReviews.reviewText,
      createdAt: serviceReviews.createdAt,
      status: serviceReviews.status,
      serviceName: providerServices.serviceName,
      reviewerFirst: users.firstName,
      reviewerLast: users.lastName,
    })
    .from(serviceReviews)
    .leftJoin(providerServices, eq(serviceReviews.serviceId, providerServices.id))
    .leftJoin(users, eq(serviceReviews.travelerId, users.id))
    .where(inArray(serviceReviews.id, ids));

  // Only 'approved' reviews may surface — the same moderation gate the public
  // rating aggregate honors. A review an admin featured before it cleared
  // moderation, or one later flagged/removed, must never leak onto the
  // landing page just because its id is still sitting in the curated list.
  const byId = new Map(rows.filter((r) => r.status === "approved").map((r) => [r.id, r]));

  // Preserve the admin's curated order; unknown/deleted/unapproved ids are
  // silently skipped (never surfaced, never substituted with anything invented).
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  return ordered.map((r) => {
    const first = (r.reviewerFirst || "").trim();
    const lastInitial = (r.reviewerLast || "").trim().charAt(0);
    // Same privacy posture as GET /api/experts/:id/reviews: first name + last initial.
    const reviewerName = first ? (lastInitial ? `${first} ${lastInitial}.` : first) : "Traveler";
    return {
      id: r.id,
      rating: r.rating,
      reviewText: r.reviewText,
      reviewerName,
      serviceName: r.serviceName ?? "Traveloure",
      createdAt: r.createdAt,
    };
  });
}

// ─── Analytics Tracking ───────────────────────────────────────────────────────

/**
 * Record a feed content impression (analytics-only, fire-and-forget semantics).
 * Deduped by the migration-116 unique index on (session_id, content_type, content_id):
 * on a duplicate the INSERT is a no-op and the EXISTING impression id is returned,
 * so click attribution stays stable across remount races. Returns the impression id.
 */
export async function insertContentImpression(values: {
  contentType: string;
  contentId: string;
  city?: string | null;
  cardPosition?: number | null;
  sessionId: string;
  userId?: string | null;
}): Promise<string> {
  const { contentImpressions } = await import("@shared/schema");
  const [inserted] = await db
    .insert(contentImpressions)
    .values({
      contentType: values.contentType,
      contentId: values.contentId,
      city: values.city ?? null,
      cardPosition: values.cardPosition ?? null,
      sessionId: values.sessionId,
      userId: values.userId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: contentImpressions.id });
  if (inserted) return inserted.id;

  // Duplicate (session, contentType, contentId) — return the existing impression's id.
  const [existing] = await db
    .select({ id: contentImpressions.id })
    .from(contentImpressions)
    .where(
      and(
        eq(contentImpressions.sessionId, values.sessionId),
        eq(contentImpressions.contentType, values.contentType),
        eq(contentImpressions.contentId, values.contentId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Impression insert conflicted but no existing row found");
  return existing.id;
}

/**
 * Demand counts for the wanted-slot recruitment cards ("N travellers want this").
 * Counts UNEXPIRED service_demand_signals rows (expires_at >= now, or >= dateRangeStart
 * when a future date filter is active) for the city, per requested offering key —
 * matched case-insensitively against service_type OR category_slug. REAL counts only
 * (§13: never fabricate) — a key with no matching signals returns 0.
 */
export async function getDemandCountsForCity(
  city: string,
  offeringTypeKeys: string[],
  dateRangeStart?: string,
): Promise<Record<string, number>> {
  const { serviceDemandSignals } = await import("@shared/schema");

  // Signals must still be valid now; a future date filter tightens the window
  // (demand must still be unexpired at that date). Invalid dates are ignored.
  let cutoff = new Date();
  if (dateRangeStart) {
    const parsed = Date.parse(dateRangeStart);
    if (!Number.isNaN(parsed) && parsed > cutoff.getTime()) cutoff = new Date(parsed);
  }

  const rows = await db
    .select({
      serviceType: serviceDemandSignals.serviceType,
      categorySlug: serviceDemandSignals.categorySlug,
    })
    .from(serviceDemandSignals)
    .where(
      and(
        ilike(serviceDemandSignals.city, city), // stored lowercase; exact case-insensitive match
        gte(serviceDemandSignals.expiresAt, cutoff),
      ),
    );

  const counts: Record<string, number> = {};
  for (const key of offeringTypeKeys) {
    const keyLower = key.toLowerCase();
    counts[key] = rows.filter(
      (r) =>
        r.serviceType?.toLowerCase() === keyLower ||
        r.categorySlug?.toLowerCase() === keyLower,
    ).length;
  }
  return counts;
}

export async function insertSearchAnalytics(values: Record<string, any>): Promise<void> {
  const { searchAnalytics } = await import("@shared/schema");
  await db.insert(searchAnalytics).values(values as any);
}

export async function insertPageViewAnalytics(values: Record<string, any>): Promise<void> {
  const { pageViewAnalytics } = await import("@shared/schema");
  await db.insert(pageViewAnalytics).values(values as any);
}

export async function insertBookingFunnelAnalytics(values: Record<string, any>): Promise<void> {
  const { bookingFunnelAnalytics } = await import("@shared/schema");
  await db.insert(bookingFunnelAnalytics).values(values as any);
}

export async function insertActivityBookingAnalytics(values: Record<string, any>): Promise<void> {
  const { activityBookingAnalytics } = await import("@shared/schema");
  await db.insert(activityBookingAnalytics).values(values as any);
}

export async function insertTripAnalyticsEnhanced(values: Record<string, any>): Promise<void> {
  const { tripAnalyticsEnhanced } = await import("@shared/schema");
  await db.insert(tripAnalyticsEnhanced).values(values as any);
}

export async function getTripAnalyticsEnhancedByTripId(tripId: string): Promise<any | null> {
  const { tripAnalyticsEnhanced } = await import("@shared/schema");
  return db.select().from(tripAnalyticsEnhanced)
    .where(eq(tripAnalyticsEnhanced.tripId, tripId))
    .then(r => r[0] ?? null);
}

export async function updateTripAnalyticsEnhanced(tripId: string, values: Record<string, any>): Promise<void> {
  const { tripAnalyticsEnhanced } = await import("@shared/schema");
  await db.update(tripAnalyticsEnhanced).set(values as any)
    .where(eq(tripAnalyticsEnhanced.tripId, tripId));
}

// ─── Seed Database helpers ────────────────────────────────────────────────────

export async function getAdminUserByEmail(email: string): Promise<any | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function insertUser(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(users).values(values as any).returning();
  return row;
}

export async function getFirstUser(): Promise<any | null> {
  const [row] = await db.select().from(users).limit(1);
  return row ?? null;
}
