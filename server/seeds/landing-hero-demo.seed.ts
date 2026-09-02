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
import {
  createClaim,
  markClaimScored,
  ratifyClaim,
  submitClaim,
} from "../services/neighborhood-claims.service";
import type { ClaimCaptureSubmit } from "@shared/neighborhood-claims";

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

/**
 * Development-only demo capture so the fixture expert's neighborhood row can be born the ONLY way
 * a row is born — through claim ratification (ruling 2026-08-29-neighborhood-claims; Phase 0 D1).
 * The seed is a sanctioned CALLER of the product functions (persona-seed precedent), never a
 * second writer; the migration-272 trigger would refuse a direct insert. Every string says it is
 * a fixture, and the "score" is a labeled seed marker, not a real scorer verdict.
 */
function demoCapture(neighborhoodName: string): ClaimCaptureSubmit {
  const place = (n: number) => `Demo fixture place ${n} (${neighborhoodName})`;
  return {
    p1: [
      {
        name: place(1),
        category: "cafe",
        doThis: "Development fixture — sit at the counter, order the house pour. Not real expert content.",
        when: { hours: "08:00-10:00", days: "weekdays", season: "" },
        watchOut: "Development fixture — closes early on holidays. Not real expert content.",
        priceBand: "$$",
        expertConfidence: "usually_right",
      },
      {
        name: place(2),
        category: "viewpoint",
        doThis: "Development fixture — walk up from the side street, not the main steps. Not real expert content.",
        when: { hours: "17:30-18:30", days: "", season: "autumn" },
        watchOut: "Development fixture — the main steps queue at sunset. Not real expert content.",
        priceBand: null,
        expertConfidence: "certain",
      },
    ],
    p2: {
      items: [
        { name: place(1), durationMin: 45, transition: null },
        { name: place(2), durationMin: 60, transition: { mode: "walk", minutes: 12 } },
        { name: place(3), durationMin: 90, transition: { mode: "bus", minutes: 15 } },
      ],
      orderReason: "Development fixture — light first, the view at dusk, dinner last. Not real expert content.",
      hardConstraints: [{ kind: "last_entry", detail: "Development fixture — last entry 18:30." }],
    },
    p3: {
      trigger: "rain",
      replacesPosition: 2,
      alternate: { name: `Demo fixture covered arcade (${neighborhoodName})`, durationMin: 60, transition: { mode: "walk", minutes: 5 } },
      reason: "Development fixture — the viewpoint is worthless in rain; the arcade is covered. Not real expert content.",
    },
    p4: [],
  };
}

async function upsertHeroNeighborhood(
  userId: string,
  neighborhoodId: string,
  neighborhoodName: string,
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

  let rowId = existing?.id ?? null;
  if (!rowId) {
    // Born through the claim rail: claim → submit (fixture capture) → seed-marked "scored" → ratify.
    const created = await createClaim({ expertId: userId, neighborhoodId, actorType: "seed", actorId: null });
    if (!created.ok) throw new Error(`[landing-hero-seed] claim failed: ${created.message}`);
    let claim = created.value.claim;
    if (claim.status === "draft" || claim.status === "declined") {
      const submitted = await submitClaim({
        claimId: claim.id,
        expertId: userId,
        actorType: "seed",
        actorId: null,
        consent: true,
        consentVersion: "seed-fixture",
        capture: demoCapture(neighborhoodName),
      });
      if (!submitted.ok) throw new Error(`[landing-hero-seed] claim submit failed: ${submitted.message}`);
      claim = submitted.value;
    }
    if (claim.status === "submitted") {
      const scored = await markClaimScored({
        claimId: claim.id,
        version: claim.version,
        scorerJson: { seed: true, note: "development fixture — not a scorer verdict" },
      });
      if (!scored.ok) throw new Error(`[landing-hero-seed] claim score mark failed: ${scored.message}`);
      claim = scored.value;
    }
    if (claim.status === "scored") {
      const ratified = await ratifyClaim({ claimId: claim.id, adminId: null, actorType: "seed" });
      if (!ratified.ok) throw new Error(`[landing-hero-seed] claim ratify failed: ${ratified.message}`);
      rowId = ratified.value.neighborhoodRowId;
    }
  }
  if (!rowId) return; // claim exists in a state the seed does not force (e.g. verified elsewhere)

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
  // Lead is an admin curation flag TOGGLED on an existing row (UPDATE only) — never an insert.
  await db
    .update(expertNeighborhoods)
    .set({ isLead, sortOrder: 0, updatedAt: new Date() })
    .where(eq(expertNeighborhoods.id, rowId));
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
    await upsertHeroNeighborhood(userId, neighborhood.id, neighborhood.name);
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