import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import {
  cityNeighborhoods,
  expertNeighborhoods,
  localExpertForms,
  providerServices,
} from "@shared/schema";
import { OPERATING_MARKETS } from "@shared/operating-markets";

const DEMO_SERVICE_IMAGES = [
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80",
  "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200&q=80",
  "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=80",
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1200&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80",
  "https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=1200&q=80",
];

/**
 * Development-only data for the landing hero's nullable bento legs.
 *
 * This is deliberately separate from production content. Every account uses the
 * reserved .test domain and every child row has a landing-hero-demo-* id, so the
 * existing production purge removes the complete fixture graph.
 */

function shouldSeedLandingHeroDemo(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ENVIRONMENT !== "PROD";
}

function assertDevelopmentEnvironment(): void {
  if (!shouldSeedLandingHeroDemo()) {
    throw new Error("[landing-hero-seed] Refusing to seed a production environment.");
  }
}

async function firstNeighborhood(city: string, country: string) {
  const [neighborhood] = await db
    .select({
      id: cityNeighborhoods.id,
      name: cityNeighborhoods.name,
      slug: cityNeighborhoods.slug,
    })
    .from(cityNeighborhoods)
    .where(and(eq(cityNeighborhoods.city, city), eq(cityNeighborhoods.country, country)))
    .orderBy(cityNeighborhoods.name)
    .limit(1);

  return neighborhood ?? null;
}

async function upsertHeroUser(market: (typeof OPERATING_MARKETS)[number]): Promise<string> {
  const email = `landing-hero-demo-${market.marketKey}@traveloure.test`;
  const handle = `dev-fixture-hero-${market.marketKey}`;
  const firstName = "Demo";
  const lastName = `${market.cityName} Guide`;
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const values = {
    email,
    firstName,
    lastName,
    role: "local_expert",
    handle,
    bio: `Development-only landing hero fixture for ${market.cityName}.`,
    authProvider: "email",
    providerVerificationStatus: "verified",
    termsAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    privacyAcceptedAt: new Date("2026-01-01T00:00:00.000Z"),
    isDeleted: false,
    isSuspended: false,
  } as const;

  if (existing[0]) {
    await db.update(users).set(values).where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db.insert(users).values(values).returning({ id: users.id });
  if (!created) throw new Error(`[landing-hero-seed] Could not create ${email}.`);
  return created.id;
}

async function upsertHeroForm(
  market: (typeof OPERATING_MARKETS)[number],
  userId: string,
  neighborhoodName: string,
): Promise<void> {
  const id = `landing-hero-demo-${market.marketKey}-form`;
  const values = {
    id,
    userId,
    expertType: "local_expert",
    firstName: "Demo",
    lastName: `${market.cityName} Guide`,
    email: `landing-hero-demo-${market.marketKey}@traveloure.test`,
    country: market.country,
    city: market.cityName,
    displayName: `Demo ${market.cityName} Guide`,
    headline: `A development preview of a ${market.cityName} local expert`,
    destinations: [market.cityName],
    specialties: ["neighborhood food", "slow travel"],
    languages: ["English"],
    experienceTypes: ["cultural", "food"],
    specializations: ["local culture", "custom itineraries"],
    selectedServices: ["custom itinerary", "local recommendations"],
    neighborhoods: [neighborhoodName],
    bio: `Development-only local ${market.cityName} guide fixture.`,
    shortBio: `Development-only landing hero fixture for ${market.cityName}.`,
    responseTime: "Within 2 hours",
    yearsOfExperience: "8 years",
    status: "approved",
    identityVerificationStatus: "verified",
    identityVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as const;

  await db
    .insert(localExpertForms)
    .values(values)
    .onConflictDoUpdate({
      target: localExpertForms.id,
      set: {
        userId: values.userId,
        expertType: values.expertType,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        country: values.country,
        city: values.city,
        displayName: values.displayName,
        headline: values.headline,
        destinations: values.destinations,
        specialties: values.specialties,
        languages: values.languages,
        experienceTypes: values.experienceTypes,
        specializations: values.specializations,
        selectedServices: values.selectedServices,
        neighborhoods: values.neighborhoods,
        bio: values.bio,
        shortBio: values.shortBio,
        responseTime: values.responseTime,
        yearsOfExperience: values.yearsOfExperience,
        status: values.status,
        identityVerificationStatus: values.identityVerificationStatus,
        identityVerifiedAt: values.identityVerifiedAt,
      },
    });
}

async function upsertHeroNeighborhood(
  userId: string,
  neighborhoodId: string,
): Promise<void> {
  const [existing] = await db
    .select({
      id: expertNeighborhoods.id,
      isLead: expertNeighborhoods.isLead,
    })
    .from(expertNeighborhoods)
    .where(
      and(
        eq(expertNeighborhoods.expertId, userId),
        eq(expertNeighborhoods.neighborhoodId, neighborhoodId),
      ),
    )
    .limit(1);

  const [existingLead] = await db
    .select({ expertId: expertNeighborhoods.expertId })
    .from(expertNeighborhoods)
    .where(
      and(
        eq(expertNeighborhoods.neighborhoodId, neighborhoodId),
        eq(expertNeighborhoods.isLead, true),
      ),
    )
    .limit(1);

  const isLead = !existingLead || existingLead.expertId === userId;
  if (existing) {
    await db
      .update(expertNeighborhoods)
      .set({ isLead, sortOrder: 0, updatedAt: new Date() })
      .where(eq(expertNeighborhoods.id, existing.id));
    return;
  }

  await db.insert(expertNeighborhoods).values({
    expertId: userId,
    neighborhoodId,
    isLead,
    sortOrder: 0,
  });
}

async function upsertHeroService(
  market: (typeof OPERATING_MARKETS)[number],
  userId: string,
  neighborhoodSlug: string,
  marketIndex: number,
): Promise<void> {
  const id = `landing-hero-demo-${market.marketKey}-service`;
  const serviceName = `${market.cityName} Local Planning Session`;
  const values = {
    id,
    userId,
    createdVia: "seed",
    serviceName,
    shortDescription: `A practical local starting point for ${market.cityName}.`,
    description: `Development-only preview service for a personal ${market.cityName} plan.`,
    serviceType: "planning",
    serviceImage: DEMO_SERVICE_IMAGES[marketIndex % DEMO_SERVICE_IMAGES.length],
    price: "149.00",
    priceType: "fixed",
    deliveryMethod: "video",
    deliveryTimeframe: "Delivered within 48 hours",
    durationMinutes: 60,
    location: market.cityName,
    city: market.cityName,
    neighborhood: neighborhoodSlug,
    status: "active",
    formStatus: "approved",
    approvalStatus: "approved",
    submittedAt: new Date("2026-01-01T00:00:00.000Z"),
    reviewedAt: new Date("2026-01-01T00:00:00.000Z"),
  } as const;

  await db
    .insert(providerServices)
    .values(values)
    .onConflictDoUpdate({
      target: providerServices.id,
      set: {
        userId: values.userId,
        serviceName: values.serviceName,
        shortDescription: values.shortDescription,
        description: values.description,
        serviceType: values.serviceType,
        serviceImage: values.serviceImage,
        price: values.price,
        priceType: values.priceType,
        deliveryMethod: values.deliveryMethod,
        deliveryTimeframe: values.deliveryTimeframe,
        durationMinutes: values.durationMinutes,
        location: values.location,
        city: values.city,
        neighborhood: values.neighborhood,
        status: values.status,
        formStatus: values.formStatus,
        approvalStatus: values.approvalStatus,
        submittedAt: values.submittedAt,
        reviewedAt: values.reviewedAt,
      },
    });
}

export async function seedLandingHeroDemo(): Promise<{ markets: number; services: number; skipped: string[] }> {
  if (!shouldSeedLandingHeroDemo()) {
    return { markets: 0, services: 0, skipped: [] };
  }
  assertDevelopmentEnvironment();

  const skipped: string[] = [];
  let seededMarkets = 0;
  for (let marketIndex = 0; marketIndex < OPERATING_MARKETS.length; marketIndex++) {
    const market = OPERATING_MARKETS[marketIndex];
    const neighborhood = await firstNeighborhood(market.cityName, market.country);
    if (!neighborhood) {
      skipped.push(market.cityName);
      continue;
    }
    const userId = await upsertHeroUser(market);
    await upsertHeroForm(market, userId, neighborhood.name);
    await upsertHeroNeighborhood(userId, neighborhood.id);
    await upsertHeroService(market, userId, neighborhood.slug, marketIndex);
    seededMarkets++;
  }

  return { markets: seededMarkets, services: seededMarkets, skipped };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedLandingHeroDemo()
    .then((result) => {
      console.log(
        `[landing-hero-seed] ready: ${result.markets} markets, ${result.services} services` +
          (result.skipped.length > 0 ? `; skipped: ${result.skipped.join(", ")}` : ""),
      );
      process.exit(0);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}