import { db } from "../db";
import {
  users, contactSubmissions, notifications, accessAuditLogs,
  serviceBookings, providerServices, serviceReviews, reviewModerationLogs,
  expertPayouts, providerPayouts, serviceOfferingTypes, expertOfferingTypes,
  trips, expertServiceCategories, expertServiceOfferings, localExpertForms,
  localKnowledgeNuggets, travelPulseCities, affiliateProducts, contentRegistry,
  cityNeighborhoods, expertNeighborhoods, neighborhoodCoverageTarget,
  serviceCategories, tripExpertAdvisors, generatedItineraries,
  insertServiceOfferingTypeSchema, insertExpertOfferingTypeSchema,
} from "@shared/schema";
import {
  eq, and, or, like, sql, desc, count, inArray, isNotNull, asc,
} from "drizzle-orm";

// ─── Admin Auth Helpers ───────────────────────────────────────────────────────

export async function getAdminRole(userId: string): Promise<{ role: string } | null> {
  return db.select({ role: users.role }).from(users).where(eq(users.id, userId)).then(r => r[0] ?? null);
}

export async function getFullAdminUser(userId: string) {
  return db.select().from(users).where(eq(users.id, userId)).then(r => r[0] ?? null);
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function insertAccessAuditLog(values: {
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  targetUserId?: string | null;
  metadata?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return db.insert(accessAuditLogs).values(values as any);
}

// ─── Contact Submissions ──────────────────────────────────────────────────────

export async function getContactSubmissions(status?: string, limit = 50) {
  const base = db.select().from(contactSubmissions);
  if (status) {
    return base.where(eq(contactSubmissions.status, status)).orderBy(desc(contactSubmissions.createdAt)).limit(limit);
  }
  return base.orderBy(desc(contactSubmissions.createdAt)).limit(limit);
}

export async function updateContactSubmission(id: string, updates: Record<string, any>) {
  return db.update(contactSubmissions).set(updates).where(eq(contactSubmissions.id, id)).returning().then(r => r[0] ?? null);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getAllUsersBasic() {
  return db.select().from(users);
}

export async function getUserCommissionOverrides(userIds: string[]) {
  return db.select({ id: users.id, override: users.commissionOverrideExpertSharePercent })
    .from(users).where(inArray(users.id, userIds));
}

export async function updateUserRole(userId: string, role: string) {
  return db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function getUserVerificationStatus(userId: string) {
  return db.select({
    id: users.id,
    providerVerificationStatus: users.providerVerificationStatus,
    backgroundCheckConfirmed: users.backgroundCheckConfirmed,
  }).from(users).where(eq(users.id, userId)).then(r => r[0] ?? null);
}

export async function getUserCommissionOverride(userId: string) {
  return db.select({ id: users.id, prev: users.commissionOverrideExpertSharePercent })
    .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
}

export async function setUserCommissionOverride(userId: string, value: string | null) {
  return db.update(users).set({ commissionOverrideExpertSharePercent: value }).where(eq(users.id, userId));
}

export async function insertNotification(values: {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
}) {
  return db.insert(notifications).values(values as any);
}

export async function getAdminNotifications(userId: string) {
  return db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

// ─── Provider Services ────────────────────────────────────────────────────────

export async function getApprovedProviderForms() {
  const { serviceProviderForms } = await import("@shared/schema");
  return db.select().from(serviceProviderForms)
    .where(eq(serviceProviderForms.status, "approved"))
    .orderBy(sql`created_at desc`);
}

export async function getProviderUserInfo(userId: string) {
  return db.select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
    profileImageUrl: users.profileImageUrl,
    providerVerificationStatus: users.providerVerificationStatus,
    backgroundCheckConfirmed: users.backgroundCheckConfirmed,
  }).from(users).where(eq(users.id, userId)).then(r => r[0] ?? null);
}

export async function getProviderServicesForUser(userId: string) {
  return db.select({
    id: providerServices.id,
    serviceName: providerServices.serviceName,
    serviceType: providerServices.serviceType,
    price: providerServices.price,
    priceType: providerServices.priceType,
    deliveryMethod: providerServices.deliveryMethod,
    status: providerServices.status,
    isFeatured: providerServices.isFeatured,
    bookingsCount: providerServices.bookingsCount,
    totalRevenue: providerServices.totalRevenue,
    averageRating: providerServices.averageRating,
    reviewCount: providerServices.reviewCount,
    location: providerServices.location,
    formStatus: providerServices.formStatus,
    categoryId: providerServices.categoryId,
  }).from(providerServices).where(eq(providerServices.userId, userId))
    .orderBy(sql`bookings_count desc`);
}

export async function getProviderUsersBulk(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users).where(inArray(users.id, userIds));
}

export async function updateProviderServiceStatus(id: string, status: string) {
  return db.update(providerServices).set({ status, updatedAt: new Date() })
    .where(eq(providerServices.id, id)).returning().then(r => r[0] ?? null);
}

export async function updateProviderServiceFeatured(id: string, isFeatured: boolean) {
  return db.update(providerServices).set({ isFeatured, updatedAt: new Date() })
    .where(eq(providerServices.id, id)).returning().then(r => r[0] ?? null);
}

export async function updateProviderServiceAffinityTags(id: string, tags: string[]) {
  return db.update(providerServices).set({ contentAffinityTags: tags, updatedAt: new Date() })
    .where(eq(providerServices.id, id)).returning().then(r => r[0] ?? null);
}

export async function checkAndDeleteProviderService(id: string) {
  const [row] = await db.select().from(providerServices).where(eq(providerServices.id, id)).limit(1);
  if (!row) return null;
  await db.delete(providerServices).where(eq(providerServices.id, id));
  return row;
}

// ─── Expert Service Offerings / Templates ─────────────────────────────────────

export async function resolveOrCreateItineraryPlanningCategory() {
  let row = await db.select({ id: expertServiceCategories.id })
    .from(expertServiceCategories)
    .where(eq(expertServiceCategories.name, "Itinerary Planning"))
    .then(r => r[0]);
  if (!row) {
    const [inserted] = await db.insert(expertServiceCategories)
      .values({ name: "Itinerary Planning", isDefault: true, sortOrder: 1 })
      .returning({ id: expertServiceCategories.id });
    row = inserted;
  }
  return row;
}

export async function createExpertServiceOfferingRow(values: {
  categoryId: string;
  name: string;
  description?: string | null;
  price?: string;
  isDefault?: boolean;
  sortOrder?: number;
}) {
  const [row] = await db.insert(expertServiceOfferings).values(values as any).returning();
  return row;
}

export async function getAllExpertServiceOfferings() {
  return db.select().from(expertServiceOfferings).orderBy(expertServiceOfferings.sortOrder);
}

export async function updateExpertServiceOfferingRoles(id: string, targetRoles: string[] | null) {
  return db.update(expertServiceOfferings)
    .set({ targetRoles: targetRoles && targetRoles.length > 0 ? targetRoles : null })
    .where(eq(expertServiceOfferings.id, id))
    .returning().then(r => r[0] ?? null);
}

// ─── Category Footgun Validation ──────────────────────────────────────────────

export async function validateDefaultCommissionBandInheritance() {
  const result = await db.execute(sql`
    SELECT s.setting_value, fb.is_active
    FROM platform_settings s
    LEFT JOIN fee_bands fb ON fb.band_key = s.setting_value
    WHERE s.setting_key = 'default_commission_band_key'
    LIMIT 1
  `);
  return (result.rows?.[0] as any) ?? null;
}

export async function validateCommissionBand(bandKey: string) {
  const result = await db.execute(sql`
    SELECT rate_type, is_active
    FROM fee_bands WHERE band_key = ${bandKey} LIMIT 1
  `);
  return (result.rows?.[0] as any) ?? null;
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export async function getPayoutRecipientId(id: string, type: "expert" | "provider") {
  if (type === "expert") {
    return db.select({ recipientId: expertPayouts.expertId })
      .from(expertPayouts).where(eq(expertPayouts.id, id)).then(r => r[0]?.recipientId ?? null);
  }
  return db.select({ recipientId: providerPayouts.providerId })
    .from(providerPayouts).where(eq(providerPayouts.id, id)).then(r => r[0]?.recipientId ?? null);
}

export async function getPayoutAmount(id: string, type: "expert" | "provider") {
  if (type === "expert") {
    return db.select({ amount: expertPayouts.amount })
      .from(expertPayouts).where(eq(expertPayouts.id, id)).then(r => r[0]?.amount ?? null);
  }
  return db.select({ amount: providerPayouts.amount })
    .from(providerPayouts).where(eq(providerPayouts.id, id)).then(r => r[0]?.amount ?? null);
}

// ─── Admin Users List ──────────────────────────────────────────────────────────

export async function getAdminUsersPaginated(
  search: string, role: string | undefined, page: number, limit: number
) {
  const offset = (page - 1) * limit;
  const conditions: any[] = [];
  if (search) {
    conditions.push(or(
      like(users.email, `%${search}%`),
      like(users.firstName, `%${search}%`),
      like(users.lastName, `%${search}%`)
    ));
  }
  if (role) conditions.push(eq(users.role, role));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [allUsers, totalResult] = await Promise.all([
    db.select().from(users).where(whereClause).limit(limit).offset(offset).orderBy(desc(users.createdAt)),
    db.select({ count: count() }).from(users).where(whereClause),
  ]);
  return { allUsers, total: totalResult[0]?.count ?? 0 };
}

export async function getUserTripCount(userId: string) {
  return db.select({ count: count() }).from(trips).where(eq(trips.userId, userId)).then(r => r[0]?.count ?? 0);
}

export async function getUserBookingSpend(userId: string) {
  return db.select().from(serviceBookings).where(eq(serviceBookings.travelerId, userId));
}

// ─── Admin Trips ──────────────────────────────────────────────────────────────

export async function getAdminTripsList(search?: string, status?: string) {
  const conditions: any[] = [];
  if (search) {
    conditions.push(or(like(trips.title, `%${search}%`), like(trips.destination, `%${search}%`)));
  }
  if (status) conditions.push(eq(trips.status, status));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(trips).where(whereClause).orderBy(desc(trips.createdAt)).limit(100);
}

// ─── Analytics Overview ───────────────────────────────────────────────────────

export async function getAllServiceReviewsForAnalytics() {
  return db.select().from(serviceReviews);
}

export async function getAllTripsForAnalytics() {
  return db.select().from(trips);
}

// ─── Country Analytics ────────────────────────────────────────────────────────

export async function getExpertsByCountryAnalytics() {
  return db.select({
    country: localExpertForms.country,
    count: sql<number>`count(*)::int`,
    approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
    pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
  }).from(localExpertForms).groupBy(localExpertForms.country).orderBy(sql`count(*) desc`);
}

export async function getProvidersByCountryAnalytics() {
  const { serviceProviderForms } = await import("@shared/schema");
  return db.select({
    country: serviceProviderForms.country,
    count: sql<number>`count(*)::int`,
    approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
    pending: sql<number>`sum(case when status = 'pending' then 1 else 0 end)::int`,
  }).from(serviceProviderForms).groupBy(serviceProviderForms.country).orderBy(sql`count(*) desc`);
}

export async function getTripsByDestinationAnalytics() {
  return db.select({
    destination: trips.destination,
    count: sql<number>`count(*)::int`,
  }).from(trips).groupBy(trips.destination).orderBy(sql`count(*) desc`).limit(20);
}

// ─── Expert Analytics ─────────────────────────────────────────────────────────

export async function getExpertsByCountryDetailed() {
  return db.select({
    country: localExpertForms.country,
    count: sql<number>`count(*)::int`,
    approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
  }).from(localExpertForms).groupBy(localExpertForms.country).orderBy(sql`count(*) desc`);
}

export async function getExpertsByCity() {
  return db.select({
    city: localExpertForms.city,
    country: localExpertForms.country,
    count: sql<number>`count(*)::int`,
  }).from(localExpertForms)
    .where(eq(localExpertForms.status, "approved"))
    .groupBy(localExpertForms.city, localExpertForms.country)
    .orderBy(sql`count(*) desc`).limit(15);
}

export async function getExpertStatusSummary() {
  return db.select({
    status: localExpertForms.status,
    count: sql<number>`count(*)::int`,
  }).from(localExpertForms).groupBy(localExpertForms.status);
}

export async function getExpertsByExperience() {
  return db.select({
    years: localExpertForms.yearsOfExperience,
    count: sql<number>`count(*)::int`,
  }).from(localExpertForms)
    .where(eq(localExpertForms.status, "approved"))
    .groupBy(localExpertForms.yearsOfExperience)
    .orderBy(sql`count(*) desc`);
}

// ─── Provider Analytics ───────────────────────────────────────────────────────

export async function getProvidersByBusinessType() {
  const { serviceProviderForms } = await import("@shared/schema");
  return db.select({
    businessType: serviceProviderForms.businessType,
    count: sql<number>`count(*)::int`,
    approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
  }).from(serviceProviderForms).groupBy(serviceProviderForms.businessType).orderBy(sql`count(*) desc`);
}

export async function getProvidersByCountryDetailed() {
  const { serviceProviderForms } = await import("@shared/schema");
  return db.select({
    country: serviceProviderForms.country,
    count: sql<number>`count(*)::int`,
    approved: sql<number>`sum(case when status = 'approved' then 1 else 0 end)::int`,
  }).from(serviceProviderForms).groupBy(serviceProviderForms.country).orderBy(sql`count(*) desc`);
}

export async function getProviderStatusSummary() {
  const { serviceProviderForms } = await import("@shared/schema");
  return db.select({
    status: serviceProviderForms.status,
    count: sql<number>`count(*)::int`,
  }).from(serviceProviderForms).groupBy(serviceProviderForms.status);
}

export async function getActiveServicesCount() {
  return db.select({ count: sql<number>`count(*)::int` })
    .from(providerServices).where(eq(providerServices.status, "active"))
    .then(r => r[0]?.count ?? 0);
}

export async function getTopProvidersByBookings(limit = 10) {
  return db.select({
    userId: providerServices.userId,
    serviceName: providerServices.serviceName,
    bookingsCount: providerServices.bookingsCount,
    totalRevenue: providerServices.totalRevenue,
    averageRating: providerServices.averageRating,
  }).from(providerServices).orderBy(desc(providerServices.bookingsCount)).limit(limit);
}

// ─── Tourism Analytics ────────────────────────────────────────────────────────

export async function getTourismDestinationDemand() {
  return db.select({
    destination: trips.destination,
    searchCount: sql<number>`count(*)::int`,
    totalBudget: sql<number>`sum(COALESCE(budget::numeric, 0))::numeric`,
    avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
  }).from(trips).groupBy(trips.destination).orderBy(sql`count(*) desc`).limit(15);
}

export async function getTourismBookingTrends() {
  const { serviceBookings } = await import("@shared/schema");
  return db.select({
    month: sql<string>`to_char(created_at, 'YYYY-MM')`,
    count: sql<number>`count(*)::int`,
    revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric`,
  }).from(serviceBookings)
    .where(sql`created_at >= now() - interval '12 months'`)
    .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
    .orderBy(sql`to_char(created_at, 'YYYY-MM')`);
}

export async function getTourismSourceMarkets() {
  return db.select({
    country: localExpertForms.country,
    count: sql<number>`count(*)::int`,
  }).from(localExpertForms)
    .where(isNotNull(localExpertForms.country))
    .groupBy(localExpertForms.country)
    .orderBy(sql`count(*) desc`).limit(10);
}

export async function getUsersByMonth() {
  return db.select({
    month: sql<string>`to_char(created_at, 'YYYY-MM')`,
    count: sql<number>`count(*)::int`,
  }).from(users)
    .where(sql`created_at >= now() - interval '12 months'`)
    .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
    .orderBy(sql`to_char(created_at, 'YYYY-MM')`);
}

export async function getTourismSpendingPatterns() {
  return db.select({
    destination: trips.destination,
    avgSpend: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
    minSpend: sql<number>`min(COALESCE(budget::numeric, 0))::numeric`,
    maxSpend: sql<number>`max(COALESCE(budget::numeric, 0))::numeric`,
    tripCount: sql<number>`count(*)::int`,
  }).from(trips).where(sql`budget > 0`)
    .groupBy(trips.destination)
    .orderBy(sql`avg(COALESCE(budget::numeric, 0)) desc`).limit(10);
}

export async function getTourismPartyComposition() {
  return db.select({
    adults: trips.adults,
    kids: trips.kids,
    numberOfTravelers: trips.numberOfTravelers,
  }).from(trips);
}

export async function getTourismSeasonality() {
  return db.select({
    month: sql<number>`EXTRACT(MONTH FROM start_date)::int`,
    count: sql<number>`count(*)::int`,
    avgBudget: sql<number>`avg(COALESCE(budget::numeric, 0))::numeric`,
  }).from(trips).where(isNotNull(trips.startDate))
    .groupBy(sql`EXTRACT(MONTH FROM start_date)`)
    .orderBy(sql`EXTRACT(MONTH FROM start_date)`);
}

export async function getTourismEventTypes() {
  return db.select({
    eventType: trips.eventType,
    count: sql<number>`count(*)::int`,
  }).from(trips).groupBy(trips.eventType).orderBy(sql`count(*) desc`);
}

export async function getTourismSummaryMetrics() {
  const { serviceBookings } = await import("@shared/schema");
  const [totalBookings, completedBookings, avgTripDuration] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(serviceBookings),
    db.select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`sum(COALESCE(total_amount::numeric, 0))::numeric`,
    }).from(serviceBookings).where(eq(serviceBookings.status, "completed")),
    db.select({
      avgDays: sql<number>`avg(EXTRACT(DAY FROM (end_date - start_date)))::numeric`,
    }).from(trips).where(sql`start_date IS NOT NULL AND end_date IS NOT NULL`),
  ]);
  return { totalBookings: totalBookings[0]?.count ?? 0, completedBookings: completedBookings[0], avgTripDuration: avgTripDuration[0] };
}

// ─── System Health ────────────────────────────────────────────────────────────

export async function dbHealthPing() {
  return db.select({ count: count() }).from(users);
}

// ─── Admin Global Search ──────────────────────────────────────────────────────

export async function adminSearchUsers(pattern: string) {
  return db.select().from(users).where(or(
    like(users.email, pattern),
    like(users.firstName, pattern),
    like(users.lastName, pattern),
  )).limit(10);
}

export async function adminSearchTrips(pattern: string) {
  return db.select().from(trips).where(or(
    like(trips.title, pattern),
    like(trips.destination, pattern),
  )).limit(10);
}

export async function adminSearchServices(pattern: string) {
  return db.select().from(providerServices).where(or(
    like(providerServices.serviceName, pattern),
    like(providerServices.location, pattern),
  )).limit(10);
}

export async function getAdminGlobalCounts() {
  const [userCount, expertCount, tripCount, serviceCount] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(eq(users.role, "expert")),
    db.select({ count: count() }).from(trips),
    db.select({ count: count() }).from(providerServices),
  ]);
  return {
    users: userCount[0]?.count ?? 0,
    experts: expertCount[0]?.count ?? 0,
    plans: tripCount[0]?.count ?? 0,
    providers: serviceCount[0]?.count ?? 0,
  };
}

// ─── Review Moderation ────────────────────────────────────────────────────────

export async function getServiceReviewsList(status?: string) {
  if (status) {
    return db.select().from(serviceReviews).where(eq(serviceReviews.status, status)).orderBy(desc(serviceReviews.createdAt));
  }
  return db.select().from(serviceReviews).where(sql`status IN ('pending', 'flagged')`).orderBy(desc(serviceReviews.createdAt));
}

export async function getReviewModerationLogs(reviewId: string) {
  return db.select().from(reviewModerationLogs)
    .where(eq(reviewModerationLogs.reviewId, reviewId))
    .orderBy(desc(reviewModerationLogs.createdAt));
}

export async function getServiceReviewById(reviewId: string) {
  return db.select().from(serviceReviews).where(eq(serviceReviews.id, reviewId)).limit(1).then(r => r[0] ?? null);
}

export async function updateServiceReviewStatus(reviewId: string, updates: Record<string, any>) {
  return db.update(serviceReviews).set(updates).where(eq(serviceReviews.id, reviewId)).returning().then(r => r[0] ?? null);
}

export async function insertReviewModerationLog(values: { reviewId: string; action: string; actorId: string; reason: string | null }) {
  return db.insert(reviewModerationLogs).values(values as any);
}

export async function getServiceReviewsForServiceRating(serviceId: string) {
  return db.select({ id: serviceReviews.id, rating: serviceReviews.rating, status: serviceReviews.status })
    .from(serviceReviews).where(eq(serviceReviews.serviceId, serviceId));
}

export async function updateProviderServiceRating(serviceId: string, avgRating: string, reviewCount: number) {
  return db.update(providerServices)
    .set({ averageRating: avgRating, reviewCount, updatedAt: new Date() })
    .where(eq(providerServices.id, serviceId));
}

// ─── Fee Config (legacy booking_fee_configs) ──────────────────────────────────

export async function getFeeConfigs() {
  const result = await db.execute(sql`
    SELECT
      id, category,
      CAST(platform_fee_percent   AS FLOAT) AS platform_fee_percent,
      CAST(expert_share_percent   AS FLOAT) AS expert_share_percent,
      ai_keeps_100,
      CAST(min_fee AS FLOAT) AS min_fee,
      CAST(max_fee AS FLOAT) AS max_fee,
      is_active,
      insurance_enabled,
      CAST(insurance_rate_percent AS FLOAT) AS insurance_rate_percent,
      insurance_applies_to,
      updated_by,
      updated_at
    FROM booking_fee_configs
    ORDER BY category
  `);
  return result.rows;
}

export async function upsertFeeConfig(params: {
  category: string;
  platformFeePercent?: number;
  expertSharePercent?: number;
  aiKeeps100?: boolean;
  minFee?: number | null;
  maxFee?: number | null;
  isActive?: boolean;
  insuranceEnabled?: boolean;
  insuranceRate: number;
  insuranceApplyJson: string;
  userId: string;
}) {
  const { category, platformFeePercent, expertSharePercent, aiKeeps100, minFee, maxFee, isActive, insuranceEnabled, insuranceRate, insuranceApplyJson, userId } = params;
  return db.execute(sql`
    INSERT INTO booking_fee_configs (
      id, category, platform_fee_percent, expert_share_percent,
      ai_keeps_100, min_fee, max_fee, is_active,
      insurance_enabled, insurance_rate_percent, insurance_applies_to,
      updated_by, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), ${category}, ${platformFeePercent ?? 12}, ${expertSharePercent ?? 75},
      ${aiKeeps100 ?? true}, ${minFee ?? null}, ${maxFee ?? null}, ${isActive ?? true},
      ${insuranceEnabled ?? false}, ${insuranceRate}, ${insuranceApplyJson}::jsonb,
      ${userId}, NOW(), NOW()
    )
    ON CONFLICT (category) DO UPDATE SET
      platform_fee_percent    = EXCLUDED.platform_fee_percent,
      expert_share_percent    = EXCLUDED.expert_share_percent,
      ai_keeps_100            = EXCLUDED.ai_keeps_100,
      min_fee                 = EXCLUDED.min_fee,
      max_fee                 = EXCLUDED.max_fee,
      is_active               = EXCLUDED.is_active,
      insurance_enabled       = EXCLUDED.insurance_enabled,
      insurance_rate_percent  = EXCLUDED.insurance_rate_percent,
      insurance_applies_to    = EXCLUDED.insurance_applies_to,
      updated_by              = EXCLUDED.updated_by,
      updated_at              = NOW()
  `);
}

// ─── Fee Bands ────────────────────────────────────────────────────────────────

export async function getFeeBands() {
  const result = await db.execute(sql`
    SELECT
      id, band_key, rate_type,
      CAST(default_rate AS FLOAT) AS default_rate,
      CAST(min_rate AS FLOAT)     AS min_rate,
      CAST(max_rate AS FLOAT)     AS max_rate,
      display_name, description, is_active, updated_by, updated_at
    FROM fee_bands
    ORDER BY rate_type ASC, band_key ASC
  `);
  return result.rows ?? [];
}

export async function getFeeBand(bandKey: string) {
  const result = await db.execute(sql`
    SELECT band_key, CAST(default_rate AS FLOAT) AS default_rate,
           CAST(min_rate AS FLOAT) AS min_rate, CAST(max_rate AS FLOAT) AS max_rate, is_active
    FROM fee_bands WHERE band_key = ${bandKey} LIMIT 1
  `);
  return (result.rows?.[0] as any) ?? null;
}

export async function updateFeeBand(bandKey: string, params: {
  nextDefault: number;
  nextMin: number | null;
  nextMax: number | null;
  displayName?: string;
  description?: string;
  isActive?: boolean;
  userId: string;
}) {
  const { nextDefault, nextMin, nextMax, displayName, description, isActive, userId } = params;
  return db.execute(sql`
    UPDATE fee_bands
    SET
      default_rate = ${nextDefault},
      min_rate     = ${nextMin},
      max_rate     = ${nextMax},
      display_name = COALESCE(${displayName ?? null}, display_name),
      description  = COALESCE(${description ?? null}, description),
      is_active    = COALESCE(${isActive ?? null}, is_active),
      updated_by   = ${userId},
      updated_at   = NOW()
    WHERE band_key = ${bandKey}
  `);
}

export async function checkActiveBand(bandKey: string) {
  const result = await db.execute(sql`
    SELECT 1 FROM fee_bands WHERE band_key = ${bandKey} AND is_active = true LIMIT 1
  `);
  return (result.rows?.length ?? 0) > 0;
}

// ─── Platform Settings ────────────────────────────────────────────────────────

export async function getPlatformSettings() {
  const result = await db.execute(sql`
    SELECT setting_key, setting_value, description, updated_by, updated_at
    FROM platform_settings
    ORDER BY setting_key ASC
  `);
  return result.rows ?? [];
}

export async function getPlatformSettingValue(settingKey: string) {
  const result = await db.execute(sql`
    SELECT setting_value FROM platform_settings WHERE setting_key = ${settingKey} LIMIT 1
  `);
  return result.rows && result.rows.length > 0 ? (result.rows[0] as any).setting_value : null;
}

export async function upsertPlatformSetting(settingKey: string, settingValue: string, userId: string) {
  return db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES (${settingKey}, ${settingValue}, ${userId}, NOW())
    ON CONFLICT (setting_key) DO UPDATE SET
      setting_value = EXCLUDED.setting_value,
      updated_by    = EXCLUDED.updated_by,
      updated_at    = NOW()
  `);
}

// ─── Service / Expert Offering Types ─────────────────────────────────────────

export async function getServiceOfferingTypesList() {
  return db.select().from(serviceOfferingTypes)
    .orderBy(asc(serviceOfferingTypes.sortOrder), asc(serviceOfferingTypes.offeringTypeKey));
}

export async function createServiceOfferingTypeRow(parsed: any) {
  return db.insert(serviceOfferingTypes).values(parsed).returning().then(r => r[0]);
}

export async function updateServiceOfferingTypeRow(key: string, updates: Record<string, unknown>) {
  return db.update(serviceOfferingTypes).set(updates)
    .where(eq(serviceOfferingTypes.offeringTypeKey, key)).returning().then(r => r[0] ?? null);
}

export async function deleteServiceOfferingTypeRow(key: string) {
  return db.delete(serviceOfferingTypes)
    .where(eq(serviceOfferingTypes.offeringTypeKey, key)).returning().then(r => r[0] ?? null);
}

export async function getExpertOfferingTypesList() {
  return db.select().from(expertOfferingTypes)
    .orderBy(asc(expertOfferingTypes.sortOrder), asc(expertOfferingTypes.offeringTypeKey));
}

export async function createExpertOfferingTypeRow(parsed: any) {
  return db.insert(expertOfferingTypes).values(parsed).returning().then(r => r[0]);
}

export async function updateExpertOfferingTypeRow(key: string, updates: Record<string, unknown>) {
  return db.update(expertOfferingTypes).set(updates)
    .where(eq(expertOfferingTypes.offeringTypeKey, key)).returning().then(r => r[0] ?? null);
}

export async function deleteExpertOfferingTypeRow(key: string) {
  return db.delete(expertOfferingTypes)
    .where(eq(expertOfferingTypes.offeringTypeKey, key)).returning().then(r => r[0] ?? null);
}

// ─── Lead Routing ─────────────────────────────────────────────────────────────

export async function getLeadRoutingLogs(limit: number) {
  const result = await db.execute(sql`
    SELECT
      lrl.*,
      u.first_name || ' ' || u.last_name AS user_name,
      eu.first_name || ' ' || eu.last_name AS expert_name
    FROM lead_routing_logs lrl
    LEFT JOIN users u ON u.id = lrl.user_id
    LEFT JOIN users eu ON eu.id = lrl.assigned_expert_id
    ORDER BY lrl.created_at DESC
    LIMIT ${limit}
  `);
  return result.rows;
}

export async function overrideLeadRouting(id: string, newExpertId: string, adminId: string) {
  return db.execute(sql`
    UPDATE lead_routing_logs
    SET assigned_expert_id = ${newExpertId}, overridden_by = ${adminId}
    WHERE id = ${id}
  `);
}

export async function getRoutingQueueItems() {
  const result = await db.execute(sql`
    SELECT
      er.id,
      er.trip_id,
      er.user_id,
      er.destination_city,
      er.request_type,
      er.status,
      er.assigned_expert_id,
      er.created_at,
      er.assigned_at,
      u.first_name || ' ' || u.last_name AS traveler_name,
      u.email AS traveler_email,
      eu.first_name || ' ' || eu.last_name AS expert_name,
      eu.email AS expert_email,
      lrl.top_score,
      lrl.scores_json
    FROM expert_requests er
    LEFT JOIN users u ON u.id = er.user_id
    LEFT JOIN users eu ON eu.id = er.assigned_expert_id
    LEFT JOIN lead_routing_logs lrl ON lrl.trip_id = er.trip_id
      AND lrl.assigned_expert_id = er.assigned_expert_id
    WHERE er.assigned_expert_id IS NOT NULL
      AND er.status NOT IN ('confirmed', 'completed', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM trip_expert_advisors tea
        WHERE tea.trip_id = er.trip_id
          AND tea.local_expert_id = er.assigned_expert_id
      )
    ORDER BY er.created_at DESC
    LIMIT 100
  `);
  return result.rows;
}

export async function getExpertRequest(requestId: string) {
  const result = await db.execute(sql`
    SELECT * FROM expert_requests WHERE id = ${requestId}
  `);
  return (result.rows?.[0] as any) ?? null;
}

export async function confirmLeadAssignmentTx(requestId: string, tripId: string, assignedExpertId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM expert_requests WHERE id = ${requestId} FOR UPDATE`);

    const [existing] = await tx.select().from(tripExpertAdvisors)
      .where(and(
        eq(tripExpertAdvisors.tripId, tripId),
        eq(tripExpertAdvisors.localExpertId, assignedExpertId),
      )).limit(1);

    if (existing) return existing;

    const [created] = await tx.insert(tripExpertAdvisors).values({
      tripId,
      localExpertId: assignedExpertId,
      status: "assigned",
      workspaceStatus: "draft",
      assignedAt: new Date(),
    }).onConflictDoNothing().returning();

    const result = created ?? await tx.select().from(tripExpertAdvisors)
      .where(and(
        eq(tripExpertAdvisors.tripId, tripId),
        eq(tripExpertAdvisors.localExpertId, assignedExpertId),
      )).then(r => r[0]);

    await tx.execute(sql`
      UPDATE expert_requests SET status = 'assigned', assigned_at = NOW() WHERE id = ${requestId}
    `);

    return result;
  });
}

export async function reassignExpertRequest(requestId: string, expertId: string) {
  return db.execute(sql`
    UPDATE expert_requests
    SET assigned_expert_id = ${expertId}, assigned_at = NOW()
    WHERE id = ${requestId}
  `);
}

export async function getExpertNameById(expertId: string) {
  const result = await db.execute(sql`
    SELECT first_name || ' ' || last_name AS expert_name FROM users WHERE id = ${expertId}
  `);
  return (result.rows?.[0] as any)?.expert_name ?? expertId;
}

export async function getExpertRequestRow(requestId: string) {
  const result = await db.execute(sql`
    SELECT * FROM expert_requests WHERE id = ${requestId}
  `);
  return (result.rows?.[0] as any) ?? null;
}

// ─── Knowledge Nuggets ────────────────────────────────────────────────────────

export async function getLocalKnowledgeNuggetCounts() {
  const rows = await db
    .select({ expertUserId: localKnowledgeNuggets.expertUserId, count: count() })
    .from(localKnowledgeNuggets)
    .groupBy(localKnowledgeNuggets.expertUserId);
  const map: Record<string, number> = {};
  for (const r of rows) map[r.expertUserId] = Number(r.count);
  return map;
}

// ─── Content Auto-Index Queries ───────────────────────────────────────────────

export async function getTravelPulseCitiesForAutoIndex() {
  return db.select({
    cityName: travelPulseCities.cityName,
    country: travelPulseCities.country,
    pulseScore: travelPulseCities.pulseScore,
  }).from(travelPulseCities).limit(200);
}

export async function getAffiliateProductsForAutoIndex() {
  return db.select({
    id: affiliateProducts.id,
    name: affiliateProducts.name,
    city: affiliateProducts.city,
    country: affiliateProducts.country,
    category: affiliateProducts.category,
  }).from(affiliateProducts).where(eq(affiliateProducts.isActive, true)).limit(2000);
}

export async function getContentRegistryForAutoIndex() {
  return db.select({
    id: contentRegistry.id,
    title: contentRegistry.title,
    contentType: contentRegistry.contentType,
    metadata: contentRegistry.metadata,
  }).from(contentRegistry).where(eq(contentRegistry.status, "published")).limit(2000);
}

// ─── Optimization Fees ────────────────────────────────────────────────────────

export async function getOptimizationFees() {
  const result = await db.execute(sql`
    SELECT id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, updated_by, updated_at
    FROM optimization_fees
    ORDER BY
      CASE WHEN event_type IS NULL THEN 0 ELSE 1 END,
      CASE complexity_tier
        WHEN 'simple'   THEN 1
        WHEN 'standard' THEN 2
        WHEN 'complex'  THEN 3
        ELSE 4
      END,
      event_type
  `);
  return result.rows;
}

export async function findOptimizationFee(complexityTier: string, eventType: string | null) {
  const existing = await db.execute(sql`
    SELECT id FROM optimization_fees
    WHERE complexity_tier = ${complexityTier}
      AND ((${eventType}::text IS NULL AND event_type IS NULL) OR event_type = ${eventType})
    LIMIT 1
  `);
  return existing.rows.length > 0 ? (existing.rows[0] as any) : null;
}

export async function updateOptimizationFee(id: string, params: {
  priceCents: number; currency: string; isActive: boolean; isDisabled: boolean; userId: string;
}) {
  const { priceCents, currency, isActive, isDisabled, userId } = params;
  return db.execute(sql`
    UPDATE optimization_fees
    SET price_cents = ${priceCents},
        currency    = ${currency},
        is_active   = ${isActive},
        is_disabled = ${isDisabled},
        updated_by  = ${userId},
        updated_at  = NOW()
    WHERE id = ${id}
  `);
}

export async function createOptimizationFee(params: {
  complexityTier: string; eventType: string | null; priceCents: number;
  currency: string; isActive: boolean; isDisabled: boolean; userId: string;
}) {
  const { complexityTier, eventType, priceCents, currency, isActive, isDisabled, userId } = params;
  return db.execute(sql`
    INSERT INTO optimization_fees (id, complexity_tier, event_type, price_cents, currency, is_active, is_disabled, updated_by, created_at, updated_at)
    VALUES (gen_random_uuid(), ${complexityTier}, ${eventType}, ${priceCents}, ${currency}, ${isActive}, ${isDisabled}, ${userId}, NOW(), NOW())
  `);
}

// ─── Event Packages ───────────────────────────────────────────────────────────

export async function getEventPackages() {
  const result = await db.execute(sql`
    SELECT id, event_type, market, title, description, price_from_cents, status, created_at, updated_at
    FROM event_packages
    ORDER BY status ASC, created_at DESC
  `);
  return result.rows;
}

export async function createEventPackage(params: {
  eventType: string; market: string; title: string;
  description: string | null; priceFromCents: number | null; status: string;
}) {
  const { eventType, market, title, description, priceFromCents, status } = params;
  return db.execute(sql`
    INSERT INTO event_packages (id, event_type, market, title, description, price_from_cents, status, created_at, updated_at)
    VALUES (gen_random_uuid(), ${eventType}, ${market}, ${title}, ${description}, ${priceFromCents}, ${status}, NOW(), NOW())
  `);
}

export async function patchEventPackage(id: string, params: {
  eventType?: string; market?: string; title?: string;
  description?: any; priceFromCents?: any; status?: string;
}) {
  const { eventType, market, title, description, priceFromCents, status } = params;
  return db.execute(sql`
    UPDATE event_packages SET
      event_type        = COALESCE(${eventType ?? null}::text, event_type),
      market            = COALESCE(${market ?? null}::text, market),
      title             = COALESCE(${title ?? null}::text, title),
      description       = ${description !== undefined ? description : sql`description`},
      price_from_cents  = ${priceFromCents !== undefined ? priceFromCents : sql`price_from_cents`},
      status            = COALESCE(${status ?? null}::text, status),
      updated_at        = NOW()
    WHERE id = ${id}::uuid
  `);
}

export async function archiveEventPackage(id: string) {
  return db.execute(sql`
    UPDATE event_packages SET status = 'archived', updated_at = NOW() WHERE id = ${id}::uuid
  `);
}

// ─── Neighborhood Admin ───────────────────────────────────────────────────────

export async function getNeighborhoodsWithSummary(city?: string | null) {
  const result = await db.execute(sql`
    SELECT
      cn.id, cn.city, cn.country, cn.name, cn.slug,
      cn.adjacent_keys, cn.lead_expert_target,
      CAST(cn.radius_km AS FLOAT) AS radius_km,
      (SELECT en.expert_id FROM expert_neighborhoods en
        WHERE en.neighborhood_id = cn.id AND en.is_lead = true LIMIT 1) AS lead_expert_id,
      (SELECT COUNT(*) FROM neighborhood_coverage_target t WHERE t.neighborhood_id = cn.id) AS coverage_target_count
    FROM city_neighborhoods cn
    ${city ? sql`WHERE cn.city = ${city}` : sql``}
    ORDER BY cn.city, cn.name
  `);
  return result.rows ?? [];
}

export async function getNeighborhoodById(id: string) {
  return db.select().from(cityNeighborhoods).where(eq(cityNeighborhoods.id, id)).limit(1).then(r => r[0] ?? null);
}

export async function getNeighborhoodExperts(neighborhoodId: string) {
  const result = await db.execute(sql`
    SELECT en.expert_id, en.is_lead, en.sort_order,
           u.first_name, u.last_name, u.email
    FROM expert_neighborhoods en
    JOIN users u ON u.id = en.expert_id
    WHERE en.neighborhood_id = ${neighborhoodId}
    ORDER BY en.is_lead DESC, en.sort_order ASC
  `);
  return result.rows ?? [];
}

export async function getNeighborhoodCoverageTargets(neighborhoodId: string) {
  return db.select().from(neighborhoodCoverageTarget)
    .where(eq(neighborhoodCoverageTarget.neighborhoodId, neighborhoodId));
}

export async function validateCategoryKey(categoryKey: string) {
  return db.select({ id: serviceCategories.id }).from(serviceCategories)
    .where(eq(serviceCategories.categoryKey, categoryKey)).limit(1).then(r => r[0] ?? null);
}

export async function upsertNeighborhoodCoverageTarget(neighborhoodId: string, categoryKey: string, targetCount: number) {
  return db.execute(sql`
    INSERT INTO neighborhood_coverage_target (neighborhood_id, category_key, target_count)
    VALUES (${neighborhoodId}, ${categoryKey}, ${targetCount})
    ON CONFLICT (neighborhood_id, category_key) DO UPDATE SET
      target_count = EXCLUDED.target_count,
      updated_at = NOW()
  `);
}

export async function deleteNeighborhoodCoverageTargetRow(neighborhoodId: string, categoryKey: string) {
  return db.delete(neighborhoodCoverageTarget).where(and(
    eq(neighborhoodCoverageTarget.neighborhoodId, neighborhoodId),
    eq(neighborhoodCoverageTarget.categoryKey, categoryKey),
  ));
}

export async function getNeighborhoodCurrentLead(neighborhoodId: string) {
  return db.select({ expertId: expertNeighborhoods.expertId })
    .from(expertNeighborhoods)
    .where(and(eq(expertNeighborhoods.neighborhoodId, neighborhoodId), eq(expertNeighborhoods.isLead, true)))
    .limit(1).then(r => r[0] ?? null);
}

export async function getExpertFormForNeighborhoodCheck(expertId: string) {
  return db.select({ city: localExpertForms.city, destinations: localExpertForms.destinations })
    .from(localExpertForms).where(eq(localExpertForms.userId, expertId)).limit(1).then(r => r[0] ?? null);
}

export async function clearNeighborhoodLeadTx(neighborhoodId: string) {
  return db.transaction(async (tx) => {
    await tx.update(expertNeighborhoods)
      .set({ isLead: false, updatedAt: new Date() })
      .where(and(eq(expertNeighborhoods.neighborhoodId, neighborhoodId), eq(expertNeighborhoods.isLead, true)));
  });
}

export async function swapNeighborhoodLeadTx(neighborhoodId: string, expertId: string) {
  return db.transaction(async (tx) => {
    await tx.update(expertNeighborhoods)
      .set({ isLead: false, updatedAt: new Date() })
      .where(and(eq(expertNeighborhoods.neighborhoodId, neighborhoodId), eq(expertNeighborhoods.isLead, true)));

    await tx.execute(sql`
      INSERT INTO expert_neighborhoods (expert_id, neighborhood_id, is_lead, updated_at)
      VALUES (${expertId}, ${neighborhoodId}, true, NOW())
      ON CONFLICT (expert_id, neighborhood_id) DO UPDATE SET
        is_lead = true,
        updated_at = NOW()
    `);
  });
}

export async function validateAdjacencyTargets(city: string, country: string, slugs: string[]) {
  const result = await db.execute(sql`
    SELECT slug FROM city_neighborhoods
    WHERE city = ${city} AND country = ${country} AND slug = ANY(${slugs})
  `);
  return new Set((result.rows ?? []).map((r: any) => r.slug));
}

export async function updateNeighborhoodAdjacencyTx(
  id: string, self: { slug: string; city: string; country: string },
  newKeys: string[], added: string[], removed: string[]
) {
  return db.transaction(async (tx) => {
    await tx.update(cityNeighborhoods)
      .set({ adjacentKeys: newKeys, updatedAt: new Date() })
      .where(eq(cityNeighborhoods.id, id));

    for (const slug of added) {
      await tx.execute(sql`
        UPDATE city_neighborhoods
        SET adjacent_keys = ARRAY(SELECT DISTINCT unnest(COALESCE(adjacent_keys, ARRAY[]::TEXT[]) || ARRAY[${self.slug}]::TEXT[])),
            updated_at = NOW()
        WHERE city = ${self.city} AND country = ${self.country} AND slug = ${slug}
      `);
    }

    for (const slug of removed) {
      await tx.execute(sql`
        UPDATE city_neighborhoods
        SET adjacent_keys = ARRAY(SELECT x FROM unnest(COALESCE(adjacent_keys, ARRAY[]::TEXT[])) AS x WHERE x <> ${self.slug}),
            updated_at = NOW()
        WHERE city = ${self.city} AND country = ${self.country} AND slug = ${slug}
      `);
    }
  });
}

// ─── Trip Analytics ───────────────────────────────────────────────────────────

export async function getItineraryForTrip(tripId: string) {
  return db.select().from(generatedItineraries).where(eq(generatedItineraries.tripId, tripId)).then(r => r[0] ?? null);
}

export async function upsertTripAnalyticsEnhanced(tripId: string, values: Record<string, any>) {
  const { tripAnalyticsEnhanced } = await import("@shared/schema");
  return db.insert(tripAnalyticsEnhanced).values({ tripId, ...values }).onConflictDoUpdate({
    target: [tripAnalyticsEnhanced.tripId],
    set: {
      partyComposition: values.partyComposition,
      hasChildren: values.hasChildren,
      lengthOfStay: values.lengthOfStay,
      season: values.season,
      priceSegment: values.priceSegment,
      primaryActivity: values.primaryActivity,
    },
  });
}

// ─── Location Summary ─────────────────────────────────────────────────────────

export async function getLocationSummary() {
  const { feverEventCache, hotelCache, activityCache, flightCache } = await import("@shared/schema");

  const [eventData, hotelData, activityData, flightData] = await Promise.all([
    db.select({
      cityCode: feverEventCache.cityCode,
      city: feverEventCache.city,
      count: sql<number>`count(*)::int`,
      lastUpdated: sql<string>`max(${feverEventCache.lastUpdated})`,
    }).from(feverEventCache).groupBy(feverEventCache.cityCode, feverEventCache.city),

    db.select({
      cityCode: hotelCache.cityCode,
      city: hotelCache.city,
      count: sql<number>`count(*)::int`,
      lastUpdated: sql<string>`max(${hotelCache.lastUpdated})`,
    }).from(hotelCache).groupBy(hotelCache.cityCode, hotelCache.city),

    db.select({
      destination: activityCache.destination,
      city: activityCache.city,
      count: sql<number>`count(*)::int`,
      lastUpdated: sql<string>`max(${activityCache.lastUpdated})`,
    }).from(activityCache).groupBy(activityCache.destination, activityCache.city),

    db.select({
      origin: flightCache.originCode,
      destination: flightCache.destinationCode,
      count: sql<number>`count(*)::int`,
      lastUpdated: sql<string>`max(${flightCache.lastUpdated})`,
    }).from(flightCache).groupBy(flightCache.originCode, flightCache.destinationCode),
  ]);

  return { eventData, hotelData, activityData, flightData };
}

// ─── Report Queries ───────────────────────────────────────────────────────────

export async function getDestinationDemandReport() {
  const { searchAnalytics } = await import("@shared/schema");
  const result = await db.select({
    destination: searchAnalytics.destination,
    searchCount: sql<number>`count(*)::int`,
    uniqueUsers: sql<number>`count(distinct ${searchAnalytics.userId})::int`,
    avgTravelers: sql<number>`avg(${searchAnalytics.travelers})::numeric(10,1)`,
    topOriginCountries: sql<string>`array_agg(distinct ${searchAnalytics.ipCountry}) filter (where ${searchAnalytics.ipCountry} is not null)`,
  }).from(searchAnalytics)
    .where(isNotNull(searchAnalytics.destination))
    .groupBy(searchAnalytics.destination)
    .orderBy(sql`count(*) desc`)
    .limit(50);
  return result;
}

export async function getProviderMarketReport() {
  const { serviceProviderForms } = await import("@shared/schema");
  const [marketByType, topServices] = await Promise.all([
    db.select({
      businessType: serviceProviderForms.businessType,
      providerCount: sql<number>`count(*)::int`,
      countries: sql<number>`count(distinct ${serviceProviderForms.country})::int`,
    }).from(serviceProviderForms)
      .where(eq(serviceProviderForms.status, "approved"))
      .groupBy(serviceProviderForms.businessType)
      .orderBy(sql`count(*) desc`),

    db.select({
      serviceName: providerServices.serviceName,
      bookings: providerServices.bookingsCount,
      revenue: providerServices.totalRevenue,
      rating: providerServices.averageRating,
    }).from(providerServices)
      .where(eq(providerServices.status, "active"))
      .orderBy(desc(providerServices.bookingsCount))
      .limit(20),
  ]);
  return { marketByType, topServices };
}

export async function getGeographicInsightsReport() {
  const [travelerOrigins, expertCoverage] = await Promise.all([
    db.select({
      country: trips.destination,
      tripCount: sql<number>`count(*)::int`,
      avgBudget: sql<number>`avg(cast(${trips.budget} as numeric))::numeric(10,2)`,
      avgTravelers: sql<number>`avg(${trips.numberOfTravelers})::numeric(10,1)`,
    }).from(trips).groupBy(trips.destination).orderBy(sql`count(*) desc`).limit(30),

    db.select({
      country: localExpertForms.country,
      city: localExpertForms.city,
      expertCount: sql<number>`count(*)::int`,
    }).from(localExpertForms)
      .where(eq(localExpertForms.status, "approved"))
      .groupBy(localExpertForms.country, localExpertForms.city)
      .orderBy(sql`count(*) desc`).limit(30),
  ]);
  return { travelerOrigins, expertCoverage };
}

export async function getConversionFunnelReport() {
  const { bookingFunnelAnalytics } = await import("@shared/schema");
  const funnelData = await db.select({
    stage: bookingFunnelAnalytics.funnelStage,
    count: sql<number>`count(*)::int`,
    uniqueUsers: sql<number>`count(distinct ${bookingFunnelAnalytics.userId})::int`,
    avgPrice: sql<number>`avg(${bookingFunnelAnalytics.price})::numeric(10,2)`,
  }).from(bookingFunnelAnalytics).groupBy(bookingFunnelAnalytics.funnelStage);
  return funnelData;
}

export async function getActivityDemandReport() {
  const { activityBookingAnalytics } = await import("@shared/schema");
  const [byActivityType, byDestination, byTripType, byOriginCountry] = await Promise.all([
    db.select({
      activityType: activityBookingAnalytics.activityType,
      views: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'viewed' then 1 else 0 end)::int`,
      inquiries: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'inquired' then 1 else 0 end)::int`,
      bookings: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end)::int`,
      revenue: sql<number>`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then ${activityBookingAnalytics.price} else 0 end)::numeric(12,2)`,
      avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
      avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
    }).from(activityBookingAnalytics).groupBy(activityBookingAnalytics.activityType)
      .orderBy(sql`sum(case when ${activityBookingAnalytics.bookingStatus} = 'booked' then 1 else 0 end) desc`),

    db.select({
      destination: activityBookingAnalytics.destination,
      activityType: activityBookingAnalytics.activityType,
      bookings: sql<number>`count(*)::int`,
    }).from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`).limit(30),

    db.select({
      tripType: activityBookingAnalytics.tripType,
      activityType: activityBookingAnalytics.activityType,
      count: sql<number>`count(*)::int`,
    }).from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`).limit(30),

    db.select({
      originCountry: activityBookingAnalytics.travelerOriginCountry,
      activityType: activityBookingAnalytics.activityType,
      bookings: sql<number>`count(*)::int`,
      avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
    }).from(activityBookingAnalytics)
      .where(eq(activityBookingAnalytics.bookingStatus, "booked"))
      .groupBy(activityBookingAnalytics.travelerOriginCountry, activityBookingAnalytics.activityType)
      .orderBy(sql`count(*) desc`).limit(30),
  ]);
  return { byActivityType, byDestination, byTripType, byOriginCountry };
}

export async function getActivityTrendsReport(activityType: string) {
  const { activityBookingAnalytics } = await import("@shared/schema");
  const [destinations, travelerProfiles] = await Promise.all([
    db.select({
      destination: activityBookingAnalytics.destination,
      country: activityBookingAnalytics.country,
      bookings: sql<number>`count(*)::int`,
      revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
      avgPrice: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
    }).from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked"),
      ))
      .groupBy(activityBookingAnalytics.destination, activityBookingAnalytics.country)
      .orderBy(sql`count(*) desc`).limit(20),

    db.select({
      tripType: activityBookingAnalytics.tripType,
      originCountry: activityBookingAnalytics.travelerOriginCountry,
      count: sql<number>`count(*)::int`,
      avgGroupSize: sql<number>`avg(${activityBookingAnalytics.groupSize})::numeric(5,1)`,
      avgSpend: sql<number>`avg(${activityBookingAnalytics.price})::numeric(10,2)`,
    }).from(activityBookingAnalytics)
      .where(and(
        eq(activityBookingAnalytics.activityType, activityType),
        eq(activityBookingAnalytics.bookingStatus, "booked"),
      ))
      .groupBy(activityBookingAnalytics.tripType, activityBookingAnalytics.travelerOriginCountry)
      .orderBy(sql`count(*) desc`).limit(20),
  ]);
  return { destinations, travelerProfiles };
}

export async function getDestinationBenchmarkReport(destination: string) {
  const { tripAnalyticsEnhanced, activityBookingAnalytics } = await import("@shared/schema");
  const destCondition = or(
    eq(tripAnalyticsEnhanced.destinationCity, destination),
    eq(tripAnalyticsEnhanced.destinationCountry, destination),
    eq(tripAnalyticsEnhanced.destinationRegion, destination),
  )!;
  const destCondition2 = or(
    eq(tripAnalyticsEnhanced.destinationCity, destination),
    eq(tripAnalyticsEnhanced.destinationCountry, destination),
  )!;

  const [metrics, sourceMarkets, tripPurposes, partyTypes, activities, seasonality] = await Promise.all([
    db.select({
      totalTrips: sql<number>`count(*)::int`,
      avgBudget: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
      avgLengthOfStay: sql<number>`avg(${tripAnalyticsEnhanced.lengthOfStay})::numeric(5,1)`,
      avgLeadTime: sql<number>`avg(${tripAnalyticsEnhanced.leadTimeDays})::numeric(5,1)`,
      avgPartySize: sql<number>`avg(${tripAnalyticsEnhanced.partySize})::numeric(5,1)`,
    }).from(tripAnalyticsEnhanced).where(destCondition),

    db.select({
      country: tripAnalyticsEnhanced.originCountry,
      count: sql<number>`count(*)::int`,
      avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
    }).from(tripAnalyticsEnhanced).where(destCondition2)
      .groupBy(tripAnalyticsEnhanced.originCountry).orderBy(sql`count(*) desc`).limit(10),

    db.select({ purpose: tripAnalyticsEnhanced.tripPurpose, count: sql<number>`count(*)::int` })
      .from(tripAnalyticsEnhanced).where(destCondition2)
      .groupBy(tripAnalyticsEnhanced.tripPurpose).orderBy(sql`count(*) desc`),

    db.select({
      composition: tripAnalyticsEnhanced.partyComposition,
      count: sql<number>`count(*)::int`,
      avgSpend: sql<number>`avg(${tripAnalyticsEnhanced.totalBudget})::numeric(10,2)`,
    }).from(tripAnalyticsEnhanced).where(destCondition2)
      .groupBy(tripAnalyticsEnhanced.partyComposition).orderBy(sql`count(*) desc`),

    db.select({
      activityType: activityBookingAnalytics.activityType,
      bookings: sql<number>`count(*)::int`,
      revenue: sql<number>`sum(${activityBookingAnalytics.price})::numeric(12,2)`,
    }).from(activityBookingAnalytics)
      .where(and(
        or(
          eq(activityBookingAnalytics.destination, destination),
          eq(activityBookingAnalytics.country, destination),
          eq(activityBookingAnalytics.city, destination),
        )!,
        eq(activityBookingAnalytics.bookingStatus, "booked"),
      ))
      .groupBy(activityBookingAnalytics.activityType).orderBy(sql`count(*) desc`).limit(10),

    db.select({
      month: sql<string>`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`,
      count: sql<number>`count(*)::int`,
    }).from(tripAnalyticsEnhanced).where(destCondition2)
      .groupBy(sql`to_char(${tripAnalyticsEnhanced.tripStartDate}, 'Month')`)
      .orderBy(sql`count(*) desc`),
  ]);
  return { metrics: metrics[0] ?? {}, sourceMarkets, tripPurposes, partyTypes, activities, seasonality };
}

// ─── Alias / Wrapper Functions ────────────────────────────────────────────────
// These bridge the new call-site names used in admin.routes.ts to the
// underlying helper functions above.

export async function pingDb() { return dbHealthPing(); }

export async function getAllTrips() { return getAllTripsForAnalytics(); }
export async function getAllServiceReviews() { return getAllServiceReviewsForAnalytics(); }
export async function getAdminReviews(status?: string) { return getServiceReviewsList(status); }
export async function getReviewById(reviewId: string) { return getServiceReviewById(reviewId); }
export async function getAllServiceOfferingTypes() { return getServiceOfferingTypesList(); }
export async function getTravelPulseCitiesList() { return getTravelPulseCitiesForAutoIndex(); }
export async function getActiveAffiliateProducts() { return getAffiliateProductsForAutoIndex(); }
export async function getPublishedContentRegistry() { return getContentRegistryForAutoIndex(); }
export async function getServiceCategoryByKey(categoryKey: string) { return validateCategoryKey(categoryKey); }
export async function deleteNeighborhoodCoverageTarget(neighborhoodId: string, categoryKey: string) { return deleteNeighborhoodCoverageTargetRow(neighborhoodId, categoryKey); }
export async function getExpertFormCityInfo(expertId: string) { return getExpertFormForNeighborhoodCheck(expertId); }
export async function getGeneratedItinerary(tripId: string) { return getItineraryForTrip(tripId); }
export async function getLocationSummaryData() { return getLocationSummary(); }

export async function getUserServiceBookings(userId: string) { return getUserBookingSpend(userId); }

export async function moderateReview(reviewId: string, status: string, actorId: string, reason?: string | null) {
  return updateServiceReviewStatus(reviewId, { status, moderatedBy: actorId, moderationReason: reason ?? null, moderatedAt: new Date() });
}

export async function recalcServiceRating(serviceId: string) {
  const reviews = await getServiceReviewsForServiceRating(serviceId);
  const approved = reviews.filter(r => r.status === "approved");
  const reviewCount = approved.length;
  const avgRating = reviewCount > 0
    ? (approved.reduce((sum, r) => sum + (r.rating || 0), 0) / reviewCount).toFixed(1)
    : "0";
  await updateProviderServiceRating(serviceId, avgRating, reviewCount);
}

export async function getAdminUsersPage(whereClause: any, limit: number, offset: number) {
  const [allUsers, totalResult] = await Promise.all([
    db.select().from(users).where(whereClause).limit(limit).offset(offset).orderBy(desc(users.createdAt)),
    db.select({ count: count() }).from(users).where(whereClause).then(r => r[0] ?? { count: 0 }),
  ]);
  return { allUsers, totalResult };
}

export async function getAdminTrips(whereClause?: any) {
  return db.select().from(trips).where(whereClause).orderBy(desc(trips.createdAt)).limit(200);
}

export async function getAnalyticsByCountry() {
  const [expertsByCountry, providersByCountry, tripsByDestination] = await Promise.all([
    getExpertsByCountryAnalytics(),
    getProvidersByCountryAnalytics(),
    getTripsByDestinationAnalytics(),
  ]);
  return { expertsByCountry, providersByCountry, tripsByDestination };
}

export async function getExpertAnalytics() {
  const [byCountry, byCity, statusSummary, byExperience] = await Promise.all([
    getExpertsByCountryDetailed(),
    getExpertsByCity(),
    getExpertStatusSummary(),
    getExpertsByExperience(),
  ]);
  return { byCountry, byCity, statusSummary, byExperience };
}

export async function getProviderAnalytics() {
  const [byBusinessType, byCountry, statusSummary, activeServices, topProviders] = await Promise.all([
    getProvidersByBusinessType(),
    getProvidersByCountryDetailed(),
    getProviderStatusSummary(),
    db.select({ count: count() }).from(providerServices).where(eq(providerServices.status, "active")),
    getTopProvidersByBookings(10),
  ]);
  return { byBusinessType, byCountry, statusSummary, activeServices, topProviders };
}

export async function getTourismAnalytics() {
  const [destinationDemand, bookingTrends, sourceMarkets, usersByMonth, spendingPatterns, allTrips] = await Promise.all([
    getTourismDestinationDemand(),
    getTourismBookingTrends(),
    getTourismSourceMarkets(),
    getUsersByMonth(),
    getTourismSpendingPatterns(),
    getAllTripsForAnalytics(),
  ]);
  return { destinationDemand, bookingTrends, sourceMarkets, usersByMonth, spendingPatterns, allTrips };
}

export async function adminGlobalSearch(pattern: string) {
  const [matchedUsers, matchedTrips, matchedServices] = await Promise.all([
    adminSearchUsers(pattern),
    adminSearchTrips(pattern),
    adminSearchServices(pattern),
  ]);
  return { matchedUsers, matchedTrips, matchedServices };
}

export async function getAdminSearchCounts() {
  const counts = await getAdminGlobalCounts();
  return {
    userCount: { count: counts.users },
    expertCount: { count: counts.experts },
    tripCount: { count: counts.plans },
    serviceCount: { count: counts.providers },
  };
}

export async function getUsersBasicByIds(userIds: string[]) {
  if (!userIds.length) return [];
  return db.select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
    role: users.role,
  }).from(users).where(inArray(users.id, userIds));
}

export async function getProviderServiceById(id: string) {
  return db.select().from(providerServices).where(eq(providerServices.id, id)).limit(1).then(r => r[0] ?? null);
}

export async function deleteProviderService(id: string) {
  return db.delete(providerServices).where(eq(providerServices.id, id));
}
