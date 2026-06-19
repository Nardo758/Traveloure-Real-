/**
 * experts-query.service.ts
 * DB-touching helpers extracted from experts.routes.ts.
 * Routes → this service (or storage) → db. No raw db calls in route handlers.
 */

import { db } from "../db";
import { eq, and, desc, asc, like, sql } from "drizzle-orm";
import {
  users, localExpertForms, serviceProviderForms, expertServiceOfferings,
  aiInteractions, notifications, providerServices, serviceCategories,
  eaClientRelationships, eaExecutives, eaEvents, eaTravelArrangements,
  eaGifts, eaSavedVenues, eaCommunications, eaAiTasks,
  localKnowledgeNuggets, userAndExpertContracts,
} from "@shared/schema";

// ─── Expert / Provider application status ─────────────────────────────────────

export async function getLocalExpertFormByUserId(userId: string): Promise<any | null> {
  const [form] = await db.select().from(localExpertForms)
    .where(eq(localExpertForms.userId, userId)).limit(1);
  return form ?? null;
}

export async function getServiceProviderFormByUserId(userId: string): Promise<any | null> {
  const [form] = await db.select().from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, userId)).limit(1);
  return form ?? null;
}

export async function getProviderVerificationStatus(userId: string): Promise<any | null> {
  const [form] = await db.select({
    identityVerificationStatus: serviceProviderForms.identityVerificationStatus,
    businessVerificationStatus: serviceProviderForms.businessVerificationStatus,
  }).from(serviceProviderForms)
    .where(eq(serviceProviderForms.userId, userId)).limit(1);
  return form ?? null;
}

// ─── Expert Service Offerings ─────────────────────────────────────────────────

export async function getExpertServiceOfferingById(id: string): Promise<any | null> {
  const [row] = await db.select().from(expertServiceOfferings)
    .where(eq(expertServiceOfferings.id, id));
  return row ?? null;
}

// ─── TravelPulse data (for service recommendation engine) ────────────────────

export async function getTravelPulseData(): Promise<{
  trending: any[];
  cities: any[];
  happeningNow: any[];
}> {
  const { travelPulseTrending, travelPulseCities, travelPulseHappeningNow } = await import("@shared/schema");
  const [trending, cities, happeningNow] = await Promise.all([
    db.select().from(travelPulseTrending).limit(50),
    db.select().from(travelPulseCities).limit(20),
    db.select().from(travelPulseHappeningNow).limit(20),
  ]);
  return { trending, cities, happeningNow };
}

// ─── Expert AI Tasks ──────────────────────────────────────────────────────────

export async function getExpertAiTasks(userId: string, status?: string): Promise<any[]> {
  const { expertAiTasks } = await import("@shared/schema");
  return db.select()
    .from(expertAiTasks)
    .where(status
      ? and(eq(expertAiTasks.expertId, userId), eq(expertAiTasks.status, status))
      : eq(expertAiTasks.expertId, userId))
    .orderBy(sql`${expertAiTasks.createdAt} DESC`)
    .limit(50);
}

export async function createExpertAiTask(values: Record<string, any>): Promise<any> {
  const { expertAiTasks } = await import("@shared/schema");
  const [row] = await db.insert(expertAiTasks).values(values as any).returning();
  return row;
}

export async function updateExpertAiTask(id: string, values: Record<string, any>): Promise<any> {
  const { expertAiTasks } = await import("@shared/schema");
  const [row] = await db.update(expertAiTasks)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(expertAiTasks.id, id))
    .returning();
  return row;
}

export async function getExpertAiTaskById(taskId: string, expertId: string): Promise<any | null> {
  const { expertAiTasks } = await import("@shared/schema");
  const [row] = await db.select()
    .from(expertAiTasks)
    .where(and(eq(expertAiTasks.id, taskId), eq(expertAiTasks.expertId, expertId)));
  return row ?? null;
}

export async function getExpertAiTasksSince(userId: string, since: Date): Promise<any[]> {
  const { expertAiTasks } = await import("@shared/schema");
  return db.select()
    .from(expertAiTasks)
    .where(and(
      eq(expertAiTasks.expertId, userId),
      sql`${expertAiTasks.createdAt} >= ${since.toISOString()}`
    ));
}

export async function insertAiInteractionForExpert(values: Record<string, any>): Promise<void> {
  await db.insert(aiInteractions).values(values as any);
}

// ─── Provider Availability ────────────────────────────────────────────────────

export async function getAvailableSchedulesByDay(dayOfWeek: number): Promise<any[]> {
  const { providerAvailabilitySchedule } = await import("@shared/schema");
  return db.select()
    .from(providerAvailabilitySchedule)
    .where(and(
      eq(providerAvailabilitySchedule.dayOfWeek, dayOfWeek),
      eq(providerAvailabilitySchedule.isAvailable, true)
    ));
}

export async function getAllProviderBlackoutDates(): Promise<any[]> {
  const { providerBlackoutDates } = await import("@shared/schema");
  return db.select().from(providerBlackoutDates);
}

// ─── EA Client Relationships ──────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<any | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function getEaClientRelationshipByClient(
  eaUserId: string,
  clientUserId: string | null,
  clientEmail: string
): Promise<any | null> {
  const [row] = await db.select().from(eaClientRelationships)
    .where(and(
      eq(eaClientRelationships.eaUserId, eaUserId),
      clientUserId
        ? eq(eaClientRelationships.clientUserId, clientUserId)
        : eq(eaClientRelationships.clientEmail, clientEmail)
    )).limit(1);
  return row ?? null;
}

export async function createEaClientRelationship(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaClientRelationships).values(values as any).returning();
  return row;
}

export async function getEaClientRelationshipById(id: string, eaUserId: string): Promise<any | null> {
  const [row] = await db.select().from(eaClientRelationships)
    .where(and(eq(eaClientRelationships.id, id), eq(eaClientRelationships.eaUserId, eaUserId)))
    .limit(1);
  return row ?? null;
}

export async function updateEaClientRelationship(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(eaClientRelationships)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(eaClientRelationships.id, id))
    .returning();
  return row;
}

export async function deleteEaClientRelationship(id: string): Promise<void> {
  await db.delete(eaClientRelationships).where(eq(eaClientRelationships.id, id));
}

export async function insertNotification(values: Record<string, any>): Promise<void> {
  await db.insert(notifications).values(values as any);
}

// ─── EA Executives ────────────────────────────────────────────────────────────

export async function getEaExecutives(eaUserId: string): Promise<any[]> {
  return db.select().from(eaExecutives)
    .where(eq(eaExecutives.eaUserId, eaUserId))
    .orderBy(asc(eaExecutives.name));
}

export async function createEaExecutive(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaExecutives).values(values as any).returning();
  return row;
}

export async function getEaExecutiveById(id: string, eaUserId: string): Promise<any | null> {
  const [row] = await db.select().from(eaExecutives)
    .where(and(eq(eaExecutives.id, id), eq(eaExecutives.eaUserId, eaUserId))).limit(1);
  return row ?? null;
}

export async function updateEaExecutive(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(eaExecutives)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(eaExecutives.id, id)).returning();
  return row;
}

export async function deleteEaExecutive(id: string): Promise<void> {
  await db.delete(eaExecutives).where(eq(eaExecutives.id, id));
}

// ─── EA Events ────────────────────────────────────────────────────────────────

export async function getEaEvents(eaUserId: string): Promise<any[]> {
  return db.select().from(eaEvents)
    .where(eq(eaEvents.eaUserId, eaUserId))
    .orderBy(desc(eaEvents.date));
}

export async function createEaEvent(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaEvents).values(values as any).returning();
  return row;
}

export async function getEaEventById(id: string, eaUserId: string): Promise<any | null> {
  const [row] = await db.select().from(eaEvents)
    .where(and(eq(eaEvents.id, id), eq(eaEvents.eaUserId, eaUserId))).limit(1);
  return row ?? null;
}

export async function updateEaEvent(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(eaEvents)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(eaEvents.id, id)).returning();
  return row;
}

export async function deleteEaEvent(id: string, eaUserId: string): Promise<void> {
  await db.delete(eaEvents)
    .where(and(eq(eaEvents.id, id), eq(eaEvents.eaUserId, eaUserId)));
}

// ─── EA Travel Arrangements ───────────────────────────────────────────────────

export async function getEaTravelArrangements(eaUserId: string): Promise<any[]> {
  return db.select().from(eaTravelArrangements)
    .where(eq(eaTravelArrangements.eaUserId, eaUserId))
    .orderBy(desc(eaTravelArrangements.createdAt));
}

export async function createEaTravelArrangement(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaTravelArrangements).values(values as any).returning();
  return row;
}

export async function getEaTravelArrangementById(id: string, eaUserId: string): Promise<any | null> {
  const [row] = await db.select().from(eaTravelArrangements)
    .where(and(eq(eaTravelArrangements.id, id), eq(eaTravelArrangements.eaUserId, eaUserId))).limit(1);
  return row ?? null;
}

export async function updateEaTravelArrangement(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(eaTravelArrangements)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(eaTravelArrangements.id, id)).returning();
  return row;
}

export async function deleteEaTravelArrangement(id: string, eaUserId: string): Promise<void> {
  await db.delete(eaTravelArrangements)
    .where(and(eq(eaTravelArrangements.id, id), eq(eaTravelArrangements.eaUserId, eaUserId)));
}

// ─── EA Gifts ─────────────────────────────────────────────────────────────────

export async function getEaGifts(eaUserId: string): Promise<any[]> {
  return db.select().from(eaGifts)
    .where(eq(eaGifts.eaUserId, eaUserId))
    .orderBy(desc(eaGifts.createdAt));
}

export async function createEaGift(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaGifts).values(values as any).returning();
  return row;
}

export async function getEaGiftById(id: string, eaUserId: string): Promise<any | null> {
  const [row] = await db.select().from(eaGifts)
    .where(and(eq(eaGifts.id, id), eq(eaGifts.eaUserId, eaUserId))).limit(1);
  return row ?? null;
}

export async function updateEaGift(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(eaGifts)
    .set(values as any)
    .where(eq(eaGifts.id, id)).returning();
  return row;
}

export async function deleteEaGift(id: string, eaUserId: string): Promise<void> {
  await db.delete(eaGifts)
    .where(and(eq(eaGifts.id, id), eq(eaGifts.eaUserId, eaUserId)));
}

// ─── EA Saved Venues ──────────────────────────────────────────────────────────

export async function getEaSavedVenues(eaUserId: string): Promise<any[]> {
  return db.select().from(eaSavedVenues)
    .where(eq(eaSavedVenues.eaUserId, eaUserId))
    .orderBy(desc(eaSavedVenues.favorite), asc(eaSavedVenues.name));
}

export async function createEaSavedVenue(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaSavedVenues).values(values as any).returning();
  return row;
}

export async function getEaSavedVenueById(id: string, eaUserId: string): Promise<any | null> {
  const [row] = await db.select().from(eaSavedVenues)
    .where(and(eq(eaSavedVenues.id, id), eq(eaSavedVenues.eaUserId, eaUserId))).limit(1);
  return row ?? null;
}

export async function updateEaSavedVenue(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(eaSavedVenues)
    .set(values as any)
    .where(eq(eaSavedVenues.id, id)).returning();
  return row;
}

export async function deleteEaSavedVenue(id: string, eaUserId: string): Promise<void> {
  await db.delete(eaSavedVenues)
    .where(and(eq(eaSavedVenues.id, id), eq(eaSavedVenues.eaUserId, eaUserId)));
}

// ─── EA Communications ────────────────────────────────────────────────────────

export async function getEaCommunications(eaUserId: string): Promise<any[]> {
  return db.select().from(eaCommunications)
    .where(eq(eaCommunications.eaUserId, eaUserId))
    .orderBy(desc(eaCommunications.sentAt));
}

export async function createEaCommunication(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaCommunications).values(values as any).returning();
  return row;
}

export async function deleteEaCommunication(id: string, eaUserId: string): Promise<void> {
  await db.delete(eaCommunications)
    .where(and(eq(eaCommunications.id, id), eq(eaCommunications.eaUserId, eaUserId)));
}

// ─── EA AI Tasks ──────────────────────────────────────────────────────────────

export async function getEaAiTasks(eaUserId: string, status?: string): Promise<any[]> {
  const conditions: any[] = [eq(eaAiTasks.eaUserId, eaUserId)];
  if (status) conditions.push(eq(eaAiTasks.status, status));
  return db.select().from(eaAiTasks)
    .where(and(...conditions))
    .orderBy(desc(eaAiTasks.createdAt));
}

export async function createEaAiTask(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(eaAiTasks).values(values as any).returning();
  return row;
}

export async function getEaAiTaskById(id: string, eaUserId: string): Promise<any | null> {
  const [row] = await db.select().from(eaAiTasks)
    .where(and(eq(eaAiTasks.id, id), eq(eaAiTasks.eaUserId, eaUserId))).limit(1);
  return row ?? null;
}

export async function updateEaAiTask(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(eaAiTasks)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(eaAiTasks.id, id)).returning();
  return row;
}

export async function deleteEaAiTask(id: string, eaUserId: string): Promise<void> {
  await db.delete(eaAiTasks)
    .where(and(eq(eaAiTasks.id, id), eq(eaAiTasks.eaUserId, eaUserId)));
}

// ─── Local Knowledge Nuggets ──────────────────────────────────────────────────

export async function getLocalKnowledgeNuggets(expertId: string): Promise<any[]> {
  return db.select().from(localKnowledgeNuggets)
    .where(eq(localKnowledgeNuggets.expertUserId, expertId))
    .orderBy(desc(localKnowledgeNuggets.createdAt));
}

export async function createLocalKnowledgeNugget(values: Record<string, any>): Promise<any> {
  const [row] = await db.insert(localKnowledgeNuggets).values(values as any).returning();
  return row;
}

export async function getLocalKnowledgeNuggetById(id: string, expertId: string): Promise<any | null> {
  const [row] = await db.select().from(localKnowledgeNuggets)
    .where(and(eq(localKnowledgeNuggets.id, id), eq(localKnowledgeNuggets.expertUserId, expertId)))
    .limit(1);
  return row ?? null;
}

export async function updateLocalKnowledgeNugget(id: string, values: Record<string, any>): Promise<any> {
  const [row] = await db.update(localKnowledgeNuggets)
    .set(values as any)
    .where(eq(localKnowledgeNuggets.id, id))
    .returning();
  return row;
}

export async function deleteLocalKnowledgeNugget(id: string): Promise<void> {
  await db.delete(localKnowledgeNuggets).where(eq(localKnowledgeNuggets.id, id));
}

export async function getLocalKnowledgeNuggetsByCity(city: string): Promise<any[]> {
  return db.select().from(localKnowledgeNuggets)
    .where(like(localKnowledgeNuggets.city, `%${city}%`))
    .orderBy(desc(localKnowledgeNuggets.createdAt))
    .limit(50);
}

// ─── Visa Requirements Cache ──────────────────────────────────────────────────

export async function insertVisaRequirementCache(values: Record<string, any>): Promise<void> {
  const { visaRequirementsCache } = await import("@shared/schema");
  await db.insert(visaRequirementsCache).values(values as any);
}

// ─── Visa Assistance Services ─────────────────────────────────────────────────

export async function getVisaAssistanceServices(limit = 6): Promise<any[]> {
  const cat = await db
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(eq(serviceCategories.slug, "visa-assistance"))
    .limit(1)
    .then((r) => r[0]);
  if (!cat) return [];
  const rows = await db
    .select({
      id: providerServices.id,
      serviceName: providerServices.serviceName,
      shortDescription: providerServices.shortDescription,
      description: providerServices.description,
      price: providerServices.price,
      averageRating: providerServices.averageRating,
      reviewCount: providerServices.reviewCount,
      location: providerServices.location,
      deliveryMethod: providerServices.deliveryMethod,
      serviceImage: providerServices.serviceImage,
      categoryId: providerServices.categoryId,
      providerFirstName: users.firstName,
      providerLastName: users.lastName,
      providerAvatar: users.profileImageUrl,
    })
    .from(providerServices)
    .leftJoin(users, eq(providerServices.userId, users.id))
    .where(and(eq(providerServices.categoryId, cat.id), eq(providerServices.status, "active")))
    .orderBy(desc(providerServices.bookingsCount))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    providerName: [r.providerFirstName, r.providerLastName].filter(Boolean).join(" ") || "Visa Specialist",
  }));
}

// ─── Expert Contracts ─────────────────────────────────────────────────────────

export async function getRecentExpertContracts(limit = 20): Promise<any[]> {
  return db.select({
    id: userAndExpertContracts.id,
    title: userAndExpertContracts.title,
    client: userAndExpertContracts.tripTo,
    value: userAndExpertContracts.amount,
    status: userAndExpertContracts.status,
    isPaid: userAndExpertContracts.isPaid,
    createdAt: userAndExpertContracts.createdAt,
  })
    .from(userAndExpertContracts)
    .orderBy(desc(userAndExpertContracts.createdAt))
    .limit(limit);
}

// ─── Admin role check ─────────────────────────────────────────────────────────

export async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await db.select({ role: users.role }).from(users)
    .where(eq(users.id, userId));
  return row?.role ?? null;
}
