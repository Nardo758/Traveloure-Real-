#!/usr/bin/env tsx

/**
 * Demonstrable Experts & Services seed.
 *
 * This is intentionally separate from the historical beta seed. It is:
 * - development-only (production and Neon hosts are refused);
 * - idempotent by account email/handle and deterministic child IDs;
 * - limited to the launch-market fixtures named in the earn-demo dispatch.
 *
 * Run: npm run seed:earn-demo
 */

import crypto from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/models/auth";
import {
  cityNeighborhoods,
  expertTemplates,
  itineraryComparisons,
  itineraryVariants,
  localExpertForms,
  providerServices,
  readyMadeTrips,
  reviewRatings,
  serviceBookings,
  serviceProviderForms,
  serviceRequests,
  serviceReviews,
  travelPulseHiddenGems,
  trips,
} from "@shared/schema";

const PASSWORD = "TestPass123!";
const PASSWORD_HASH = `${"earn-demo-fixed-salt"}:${crypto
  .scryptSync(PASSWORD, "earn-demo-fixed-salt", 64)
  .toString("hex")}`;
const MEMBER_SINCE = new Date("2024-06-15T12:00:00.000Z");
const REVIEW_DATES = [
  new Date("2025-02-10T12:00:00.000Z"),
  new Date("2025-06-18T12:00:00.000Z"),
  new Date("2026-01-22T12:00:00.000Z"),
];
const IMAGE_POOL = [
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80",
  "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200&q=80",
  "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=1200&q=80",
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1200&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80",
  "https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?w=1200&q=80",
];

const PROBE_IDS = [
  "c96e66a2-5601-49dc-8ece-fa800ca65542",
  "d89a5e98-8690-41b4-b666-85d03eed0cfc",
];
const PROBE_EMAILS = [
  "e2e-opt-empty-949a997b5d@example.com",
  "e2e-opt-empty-c6f10fdc77@example.com",
];

type Connection = any;
type Counter = Record<string, number>;

type Market = {
  slug: string;
  city: string;
  country: string;
  localName: [string, string];
  plannerName: [string, string];
  providerName: [string, string];
  eventName?: [string, string];
  category: string;
  timezone: string;
};

const MARKETS: Market[] = [
  { slug: "kyoto", city: "Kyoto", country: "Japan", localName: ["Aiko", "Nakamura"], plannerName: ["Ren", "Takahashi"], providerName: ["Yui", "Mori"], eventName: ["Hana", "Fujimoto"], category: "Cultural Experiences", timezone: "Asia/Tokyo" },
  { slug: "edinburgh", city: "Edinburgh", country: "United Kingdom", localName: ["Fiona", "MacLeod"], plannerName: ["Callum", "Fraser"], providerName: ["Isla", "Campbell"], category: "Local Experiences", timezone: "Europe/London" },
  { slug: "porto", city: "Porto", country: "Portugal", localName: ["Inês", "Almeida"], plannerName: ["Rui", "Pereira"], providerName: ["Marta", "Costa"], category: "Food & Culture", timezone: "Europe/Lisbon" },
  { slug: "bogota", city: "Bogotá", country: "Colombia", localName: ["Valentina", "Rojas"], plannerName: ["Mateo", "Gómez"], providerName: ["Lucía", "Vargas"], category: "City Experiences", timezone: "America/Bogota" },
  { slug: "cartagena", city: "Cartagena", country: "Colombia", localName: ["Mariana", "Torres"], plannerName: ["Sebastián", "Díaz"], providerName: ["Camila", "Herrera"], category: "Coastal Experiences", timezone: "America/Bogota" },
  { slug: "mumbai", city: "Mumbai", country: "India", localName: ["Priya", "Shah"], plannerName: ["Arjun", "Mehta"], providerName: ["Neha", "Kapoor"], eventName: ["Rhea", "Desai"], category: "City Experiences", timezone: "Asia/Kolkata" },
  { slug: "goa", city: "Goa", country: "India", localName: ["Anika", "Naik"], plannerName: ["Kabir", "Rao"], providerName: ["Maya", "Fernandes"], category: "Beach & Wellness", timezone: "Asia/Kolkata" },
  { slug: "jaipur", city: "Jaipur", country: "India", localName: ["Kavya", "Singh"], plannerName: ["Dev", "Agarwal"], providerName: ["Tara", "Bhatia"], category: "Heritage Experiences", timezone: "Asia/Kolkata" },
];

function assertDevelopmentDatabase(): void {
  if (process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "PROD") {
    throw new Error("[earn-demo-seed] Refusing to seed a production environment.");
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("[earn-demo-seed] DATABASE_URL is required.");
  let host = "";
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    throw new Error("[earn-demo-seed] DATABASE_URL is not a valid URL.");
  }
  if (/neon|prod|production/.test(host)) {
    throw new Error(`[earn-demo-seed] Refusing database host "${host}" (Neon/production host).`);
  }
}

function increment(counter: Counter, key: string, value = 1): void {
  counter[key] = (counter[key] ?? 0) + value;
}

function image(index: number): string {
  return IMAGE_POOL[index % IMAGE_POOL.length];
}

function withoutId(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = row;
  return rest;
}

async function upsertUser(
  conn: Connection,
  data: {
    email: string;
    handle?: string;
    firstName: string;
    lastName: string;
    role: string;
    bio: string;
    profileImageUrl: string;
    providerVerificationStatus?: string;
  },
  counter: Counter,
): Promise<string> {
  const predicates = [eq(users.email, data.email)];
  if (data.handle) predicates.push(eq(users.handle, data.handle));
  const matches = await conn
    .select({ id: users.id, email: users.email, handle: users.handle })
    .from(users)
    .where(or(...predicates));
  const ids = [...new Set(matches.map((row: { id: string }) => row.id))];
  if (ids.length > 1) {
    throw new Error(`[earn-demo-seed] Email/handle collision for ${data.email}.`);
  }

  const values = {
    email: data.email,
    password: PASSWORD_HASH,
    emailVerified: MEMBER_SINCE,
    firstName: data.firstName,
    lastName: data.lastName,
    profileImageUrl: data.profileImageUrl,
    role: data.role,
    bio: data.bio,
    handle: data.handle ?? null,
    providerVerificationStatus: data.providerVerificationStatus ?? "verified",
    authProvider: "email",
    isDeleted: false,
    isSuspended: false,
    createdAt: MEMBER_SINCE,
    updatedAt: new Date(),
  };

  if (ids.length === 1) {
    await conn.update(users).set(values).where(eq(users.id, ids[0]));
    return ids[0];
  }

  const [created] = await conn
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.email,
      set: withoutId(values),
    })
    .returning({ id: users.id });
  if (!created) throw new Error(`[earn-demo-seed] Could not create ${data.email}.`);
  increment(counter, "users");
  return created.id;
}

async function upsertById(
  conn: Connection,
  table: any,
  row: Record<string, unknown>,
  counter: Counter,
  label: string,
): Promise<void> {
  const [existing] = await conn.select({ id: table.id }).from(table).where(eq(table.id, row.id)).limit(1);
  await conn
    .insert(table)
    .values(row)
    .onConflictDoUpdate({
      target: table.id,
      set: withoutId(row),
    });
  if (!existing) {
    increment(counter, label);
  }
}

async function neighborhoodsFor(conn: Connection, market: Market): Promise<string[]> {
  const rows = await conn
    .select({ name: cityNeighborhoods.name })
    .from(cityNeighborhoods)
    .where(eq(cityNeighborhoods.city, market.city))
    .orderBy(cityNeighborhoods.name)
    .limit(3);
  if (rows.length < 3) {
    throw new Error(`[earn-demo-seed] ${market.city} needs at least three city_neighborhoods rows.`);
  }
  return rows.map((row: { name: string }) => row.name);
}

async function upsertExpertForm(
  conn: Connection,
  market: Market,
  userId: string,
  role: "local_expert" | "travel_expert" | "event_planner",
  neighborhoods: string[],
  counter: Counter,
): Promise<void> {
  const suffix = role === "local_expert" ? "local" : role === "travel_expert" ? "planner" : "events";
  await upsertById(conn, localExpertForms, {
    id: `earn-demo-${market.slug}-${suffix}-form`,
    userId,
    expertType: role,
    firstName: role === "local_expert" ? market.localName[0] : role === "travel_expert" ? market.plannerName[0] : market.eventName?.[0],
    lastName: role === "local_expert" ? market.localName[1] : role === "travel_expert" ? market.plannerName[1] : market.eventName?.[1],
    email: `${market.slug}-${suffix}@traveloure.test`,
    country: market.country,
    city: market.city,
    displayName: role === "local_expert" ? `${market.localName[0]} ${market.localName[1]}` : undefined,
    headline: role === "local_expert" ? `A thoughtful ${market.city} guide` : `${market.city} trip planning, made personal`,
    destinations: [market.city],
    specialties: role === "event_planner" ? ["wedding coordination", "group dinners"] : ["neighborhood food", "slow travel"],
    languages: market.country === "Japan" ? ["English", "Japanese"] : ["English", market.country === "India" ? "Hindi" : "Local language"],
    experienceTypes: role === "event_planner" ? ["wedding", "corporate"] : ["cultural", "food"],
    specializations: role === "event_planner" ? ["weddings", "group dining"] : ["local culture", "custom itineraries"],
    selectedServices: ["custom itinerary", "local recommendations"],
    neighborhoods: role === "local_expert" ? neighborhoods : [],
    bio: role === "event_planner"
      ? `Warm, detail-minded event planning in ${market.city}.`
      : role === "local_expert"
        ? `Local ${market.city} guide for thoughtful food, culture, and neighborhood days.`
        : `Personal ${market.city} trip plans shaped around your pace, interests, and budget.`,
    shortBio: `Travel planning and local insight in ${market.city}.`,
    responseTime: "Within 2 hours",
    yearsOfExperience: "8 years",
    status: "approved",
    identityVerificationStatus: "verified",
    identityVerifiedAt: MEMBER_SINCE,
    createdAt: MEMBER_SINCE,
  }, counter, "expertForms");
}

async function upsertServices(
  conn: Connection,
  market: Market,
  userId: string,
  prefix: string,
  count: number,
  counter: Counter,
): Promise<string[]> {
  const methods = ["in_person", "video", "pdf"];
  const serviceIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const method = prefix === "provider" ? "in_person" : methods[index % methods.length];
    const id = `earn-demo-${market.slug}-${prefix}-service-${index + 1}`;
    serviceIds.push(id);
    await upsertById(conn, providerServices, {
      id,
      userId,
      createdVia: "seed",
      serviceName: prefix === "provider"
        ? `${market.city} ${["Signature Walk", "Private Dinner", "Photo Session", "Concierge Planning"][index]}`
        : `${market.city} ${["Neighborhood Day", "Custom Trip Plan", "Local Guide", "Event Coordination"][index]}`,
      shortDescription: `A practical, personal way to experience ${market.city}.`,
      description: `A polished ${market.city} offering with clear next steps and local context.`,
      serviceType: prefix === "provider" ? "experience" : "planning",
      price: String(prefix === "provider" ? 95 + index * 35 : 85 + index * 30),
      priceType: "fixed",
      deliveryMethod: method,
      deliveryTimeframe: method === "in_person" ? "2–3 hours" : method === "video" ? "60 minutes" : "Delivered within 48 hours",
      durationMinutes: method === "pdf" ? 0 : method === "video" ? 60 : 150,
      location: market.city,
      city: market.city,
      neighborhood: method === "in_person" ? (await neighborhoodsFor(conn, market))[index % 3] : null,
      meetingPoint: method === "in_person" ? `${market.city} central meeting point` : null,
      serviceImage: image(index + market.slug.length),
      galleryImages: [image(index + 1), image(index + 2)],
      whatIncluded: ["Personal recommendations", "Clear itinerary notes"],
      requirements: ["Traveler preferences"],
      status: "active",
      formStatus: "approved",
      approvalStatus: "approved",
      submittedAt: MEMBER_SINCE,
      reviewedAt: MEMBER_SINCE,
      averageRating: prefix === "provider" ? "4.67" : null,
      reviewCount: prefix === "provider" ? 3 : 0,
    }, counter, "services");
  }
  return serviceIds;
}

async function upsertTemplate(
  conn: Connection,
  market: Market,
  userId: string,
  prefix: string,
  counter: Counter,
): Promise<void> {
  const duration = prefix === "local" ? 5 : 4;
  await upsertById(conn, expertTemplates, {
    id: `earn-demo-${market.slug}-${prefix}-template`,
    expertId: userId,
    title: `${market.city} in ${duration} days`,
    description: `A balanced ${market.city} plan with neighborhood texture, memorable meals, and room to wander.`,
    shortDescription: `A considered ${market.city} starter itinerary.`,
    destination: market.city,
    duration,
    price: prefix === "local" ? "149.00" : "129.00",
    currency: "USD",
    category: "culture",
    coverImage: image(market.slug.length),
    images: [image(1), image(3)],
    itineraryData: { days: [], highlights: [`See ${market.city} at a local pace.`], includes: ["Planning notes"] },
    tags: ["culture", "food", market.slug],
    highlights: ["Neighborhood discoveries", "Flexible pacing"],
    isPublished: true,
    approvalStatus: "approved",
    submittedAt: MEMBER_SINCE,
    reviewedAt: MEMBER_SINCE,
  }, counter, "templates");
}

async function upsertReadyMade(
  conn: Connection,
  market: Market,
  userId: string,
  prefix: string,
  counter: Counter,
): Promise<void> {
  const duration = prefix === "local" ? 5 : 4;
  const tripId = `earn-demo-${market.slug}-${prefix}-source-trip`;
  await upsertById(conn, trips, {
    id: tripId,
    userId,
    title: `${market.city} ${duration}-day plan`,
    startDate: "2027-04-01",
    endDate: duration === 5 ? "2027-04-05" : "2027-04-04",
    destination: market.city,
    status: "draft",
    numberOfTravelers: 2,
    adults: 2,
    kids: 0,
    preferences: { source: "earn-demo-seed" },
  }, counter, "sourceTrips");
  await upsertById(conn, readyMadeTrips, {
    id: `earn-demo-${market.slug}-${prefix}-ready-made`,
    authorId: userId,
    sourceTripId: tripId,
    market: market.city,
    title: `${market.city}: a slower, better long weekend`,
    heroImageUrl: image(market.slug.length + 2),
    heroImageMeta: { source: "Unsplash", attribution: "Unsplash" },
    durationDays: duration,
    bestSeason: "Spring and autumn",
    pricingMode: "fixed",
    priceCents: prefix === "local" ? 14900 : 12900,
    feeBandKey: "ready_made_trip",
    planType: prefix === "local" ? "food_culture_itinerary" : "city_itinerary",
    status: "approved",
    active: true,
    badge: "Editor pick",
    insideCounts: { days: duration, places: 12, notes: 8 },
    submittedAt: MEMBER_SINCE,
    reviewedAt: MEMBER_SINCE,
  }, counter, "readyMades");
}

async function upsertProviderForm(
  conn: Connection,
  market: Market,
  userId: string,
  counter: Counter,
): Promise<void> {
  await upsertById(conn, serviceProviderForms, {
    id: `earn-demo-${market.slug}-provider-form`,
    userId,
    businessName: `${market.city} Local Table`,
    name: `${market.providerName[0]} ${market.providerName[1]}`,
    email: `${market.slug}-provider@traveloure.test`,
    mobile: "+1 555 010 2040",
    country: market.country,
    address: `${market.city}, ${market.country}`,
    businessType: market.category,
    description: `A trusted ${market.city} team for warm, well-organized traveler experiences.`,
    serviceOffers: ["experiences", "private planning"],
    photo1: image(0),
    photo2: image(2),
    businessLogo: image(4),
    instantBooking: false,
    identityVerificationStatus: "verified",
    businessVerificationStatus: "verified",
    identityVerifiedAt: MEMBER_SINCE,
    status: "approved",
    createdAt: MEMBER_SINCE,
  }, counter, "providerForms");
}

async function upsertReviews(
  conn: Connection,
  providerId: string,
  serviceId: string,
  travelerId: string,
  slug: string,
  counter: Counter,
): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    const bookingId = `earn-demo-${slug}-provider-review-booking-${index + 1}`;
    await upsertById(conn, serviceBookings, {
      id: bookingId,
      serviceId,
      travelerId,
      providerId,
      totalAmount: "120.00",
      platformFee: "0",
      status: "completed",
      bookingDetails: { source: "earn-demo-seed" },
      completedAt: REVIEW_DATES[index],
      createdAt: REVIEW_DATES[index],
      updatedAt: REVIEW_DATES[index],
    }, counter, "reviewBookings");
    await upsertById(conn, serviceReviews, {
      id: `earn-demo-${slug}-provider-review-${index + 1}`,
      bookingId,
      serviceId,
      providerId,
      travelerId,
      rating: index === 1 ? 4 : 5,
      reviewText: ["Thoughtful, welcoming, and exactly as described.", "A smooth experience with excellent local detail.", "We would happily book this again."][index],
      isVerified: true,
      status: "approved",
      createdAt: REVIEW_DATES[index],
    }, counter, "reviews");
  }
}

async function upsertGems(
  conn: Connection,
  market: Market,
  neighborhoods: string[],
  curatorId: string,
  counter: Counter,
): Promise<void> {
  for (let neighborhoodIndex = 0; neighborhoodIndex < 2; neighborhoodIndex += 1) {
    for (let gemIndex = 0; gemIndex < 3; gemIndex += 1) {
      const score = [78, 87, 92][gemIndex];
      await upsertById(conn, travelPulseHiddenGems, {
        id: `earn-demo-${market.slug}-gem-${neighborhoodIndex + 1}-${gemIndex + 1}`,
        city: market.city,
        country: market.country,
        placeName: `${neighborhoods[neighborhoodIndex]} ${["Kitchen", "Corner", "Garden"][gemIndex]}`,
        placeType: ["restaurant", "cafe", "gallery"][gemIndex],
        address: `${neighborhoods[neighborhoodIndex]}, ${market.city}`,
        localRating: "4.7",
        localMentions: 42 - gemIndex * 5,
        touristMentions: 4 + gemIndex,
        gemScore: score,
        discoveryStatus: score >= 85 ? "emerging" : "hidden",
        description: `A low-key favorite in ${neighborhoods[neighborhoodIndex]}.`,
        whyLocalsLoveIt: "Warm service, strong character, and a reason to linger.",
        bestFor: ["slow mornings", "curious travelers"],
        priceRange: "$$",
        imageUrl: image(gemIndex + neighborhoodIndex + market.slug.length),
        neighborhood: neighborhoods[neighborhoodIndex],
        curatedByExpertId: curatorId,
      }, counter, "gems");
    }
  }
}

async function upsertWantedSlot(
  conn: Connection,
  market: Market,
  counter: Counter,
): Promise<void> {
  const neighborhood = market.city === "Kyoto" ? "Gion" : "Bandra";
  await upsertById(conn, serviceRequests, {
    id: `earn-demo-${market.slug}-kaiseki-host-request`,
    city: market.city,
    country: market.country,
    serviceType: "kaiseki host",
    description: `A thoughtful ${neighborhood} kaiseki host for a small traveler group.`,
    budget: "240.00",
    status: "open",
  }, counter, "wantedSlots");
}

async function countRows(conn: Connection, table: any, column: any, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(table)
    .where(inArray(column, ids));
  return Number(rows[0]?.count ?? 0);
}

async function deleteProbeFixtures(conn: Connection): Promise<Record<string, unknown>> {
  const matches = await conn
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(or(inArray(users.id, PROBE_IDS), inArray(users.email, PROBE_EMAILS)));
  const ids = [...new Set(matches.map((row: { id: string }) => row.id))];
  const before: Record<string, number> = {};
  const tableCounts: Array<[string, any, any]> = [
    ["localExpertForms", localExpertForms, localExpertForms.userId],
    ["providerForms", serviceProviderForms, serviceProviderForms.userId],
    ["providerServices", providerServices, providerServices.userId],
    ["templates", expertTemplates, expertTemplates.expertId],
    ["readyMades", readyMadeTrips, readyMadeTrips.authorId],
    ["serviceBookingsAsProvider", serviceBookings, serviceBookings.providerId],
    ["serviceBookingsAsTraveler", serviceBookings, serviceBookings.travelerId],
    ["serviceReviewsAsProvider", serviceReviews, serviceReviews.providerId],
    ["serviceReviewsAsTraveler", serviceReviews, serviceReviews.travelerId],
    ["legacyReviewRatingsAsExpert", reviewRatings, reviewRatings.localExpertId],
    ["legacyReviewRatingsAsReviewer", reviewRatings, reviewRatings.reviewerId],
    ["trips", trips, trips.userId],
    ["itineraryComparisons", itineraryComparisons, itineraryComparisons.userId],
  ];
  for (const [label, table, column] of tableCounts) before[label] = await countRows(conn, table, column, ids);

  const namedComparisons = await conn
    .select({ id: itineraryComparisons.id, userId: itineraryComparisons.userId })
    .from(itineraryComparisons)
    .where(sql`${itineraryComparisons.id} LIKE 'c24e6aaf%'`);
  if (namedComparisons.length > 0) {
    await conn.delete(itineraryComparisons).where(sql`${itineraryComparisons.id} LIKE 'c24e6aaf%'`);
  }
  if (ids.length > 0) {
    await conn.delete(users).where(inArray(users.id, ids));
  }

  const after: Record<string, number> = {};
  for (const [label, table, column] of tableCounts) after[label] = await countRows(conn, table, column, ids);
  return {
    matchedUsers: matches,
    namedComparisons,
    cascaded: Object.fromEntries(Object.keys(before).map((label) => [label, (before[label] ?? 0) - (after[label] ?? 0)])),
  };
}

async function seedEarnDemo(): Promise<void> {
  assertDevelopmentDatabase();
  const result: Counter = {};

  const deletion = await db.transaction(async (tx) => {
    const deletionReport = await deleteProbeFixtures(tx);
    for (const market of MARKETS) {
      const neighborhoods = await neighborhoodsFor(tx, market);
      const localId = await upsertUser(tx, {
        email: `${market.slug}-local@traveloure.test`,
        handle: `${market.slug}-local`,
        firstName: market.localName[0],
        lastName: market.localName[1],
        role: "local_expert",
        bio: `Local ${market.city} guide for thoughtful food, culture, and neighborhood days.`,
        profileImageUrl: image(market.slug.length),
      }, result);
      await upsertExpertForm(tx, market, localId, "local_expert", neighborhoods, result);
      await upsertServices(tx, market, localId, "local", 3, result);
      await upsertTemplate(tx, market, localId, "local", result);
      await upsertReadyMade(tx, market, localId, "local", result);
      await upsertGems(tx, market, neighborhoods, localId, result);

      const plannerId = await upsertUser(tx, {
        email: `${market.slug}-planner@traveloure.test`,
        firstName: market.plannerName[0],
        lastName: market.plannerName[1],
        role: "travel_expert",
        bio: `Personal ${market.city} trip plans shaped around your pace, interests, and budget.`,
        profileImageUrl: image(market.slug.length + 1),
      }, result);
      await upsertExpertForm(tx, market, plannerId, "travel_expert", [], result);
      await upsertServices(tx, market, plannerId, "planner", 2, result);
      await upsertReadyMade(tx, market, plannerId, "planner", result);

      if (market.eventName) {
        const eventId = await upsertUser(tx, {
          email: `${market.slug}-events@traveloure.test`,
          firstName: market.eventName[0],
          lastName: market.eventName[1],
          role: "event_planner",
          bio: `Warm, detail-minded event planning in ${market.city}.`,
          profileImageUrl: image(market.slug.length + 2),
        }, result);
        await upsertExpertForm(tx, market, eventId, "event_planner", [], result);
        await upsertServices(tx, market, eventId, "events", 2, result);
      }

      const providerId = await upsertUser(tx, {
        email: `${market.slug}-provider@traveloure.test`,
        handle: `${market.slug}-provider`,
        firstName: market.providerName[0],
        lastName: market.providerName[1],
        role: "service_provider",
        bio: `A trusted ${market.city} team for warm, well-organized traveler experiences.`,
        profileImageUrl: image(market.slug.length + 3),
      }, result);
      await upsertProviderForm(tx, market, providerId, result);
      const providerServiceIds = await upsertServices(tx, market, providerId, "provider", 4, result);
      await upsertReviews(tx, providerId, providerServiceIds[0], localId, market.slug, result);
      await upsertWantedSlot(tx, market, result);
    }

    const testProvider = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, "test-provider-qa"))
      .limit(1);
    if (testProvider[0]) {
      const existingForm = await tx
        .select({ id: serviceProviderForms.id })
        .from(serviceProviderForms)
        .where(eq(serviceProviderForms.userId, testProvider[0].id))
        .limit(1);
      const formId = existingForm[0]?.id ?? "earn-demo-test-provider-form";
      await upsertById(tx, serviceProviderForms, {
        id: formId,
        userId: testProvider[0].id,
        businessName: "Test Provider QA",
        name: "Test Provider",
        email: "test-provider@traveloure.test",
        mobile: "+1 555 010 2000",
        country: "Japan",
        address: "Tokyo, Japan",
        businessType: "Photography & Visual Storytelling",
        description: "A verified test storefront for provider directory coverage.",
        status: "approved",
        identityVerificationStatus: "verified",
        businessVerificationStatus: "verified",
      }, result, "providerForms");
      const testService = await tx
        .select({ id: providerServices.id })
        .from(providerServices)
        .where(and(eq(providerServices.userId, testProvider[0].id), eq(providerServices.status, "active"), eq(providerServices.approvalStatus, "approved")))
        .limit(1);
      if (testService[0]) {
        const localReviewer = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, "kyoto-local@traveloure.test"))
          .limit(1);
        if (localReviewer[0]) await upsertReviews(tx, testProvider[0].id, testService[0].id, localReviewer[0].id, "test-provider-qa", result);
      }
    }
    return deletionReport;
  });

  console.log("Earn demo seed complete.");
  console.log(JSON.stringify({ inserts: result, deletion }, null, 2));
  console.log("Per-market fixture summary:");
  for (const market of MARKETS) {
    console.log(`  ${market.city.padEnd(12)} local + planner + provider${market.eventName ? " + events" : ""}`);
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedEarnDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}

export { seedEarnDemo };