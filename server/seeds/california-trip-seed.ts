#!/usr/bin/env tsx

import { db } from "../db";
import {
  trips,
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
  transportLegs,
  providerServices,
  serviceBookings,
  notifications,
  savedTrips,
  localExpertForms,
  tripExpertAdvisors,
} from "@shared/schema";
import { users, type UpsertUser } from "@shared/models/auth";
import { conversations, messages } from "@shared/models/chat";
import { eq } from "drizzle-orm";
import * as nodeCrypto from "crypto";

type VariantItemInsert = typeof itineraryVariantItems.$inferInsert;
type TransportLegInsert = typeof transportLegs.$inferInsert;

const TEST_USER_ID = "647ba652-e636-49ec-a3ea-0e1addce7263";

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = nodeCrypto.randomBytes(16).toString("hex");
    nodeCrypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ":" + derivedKey.toString("hex"));
    });
  });
}

async function resolveCategoryIds() {
  const { serviceCategories } = await import("@shared/schema");
  const cats = await db.select({ id: serviceCategories.id, slug: serviceCategories.slug }).from(serviceCategories);
  const bySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  return {
    transport: bySlug["transportation-logistics"] ?? null,
    photography: bySlug["photography-videography"] ?? null,
    tours: bySlug["tours-experiences"] ?? null,
    food: bySlug["food-culinary"] ?? null,
  };
}

export async function seedCaliforniaTrip() {
  console.log("🌴 Seeding California Coastal Road Trip...\n");

  const CATEGORY_IDS = await resolveCategoryIds();

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, TEST_USER_ID));
  if (!existingUser) {
    const hashedPw = await hashPassword("TestPass123!");
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: "test-user@traveloure.test",
      password: hashedPw,
      firstName: "Alex",
      lastName: "Rivera",
      role: "user",
      bio: "Adventure-loving couple planning our dream California road trip.",
      authProvider: "email",
      createdAt: new Date("2026-01-15"),
    });
    console.log("  ✓ Test user created (test-user@traveloure.test)");
  } else {
    console.log("  ✓ Test user already exists");
  }

  const [existingExpert] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sofia.chen@traveloure.test"));
  const [existingSP] = await db.select({ id: users.id }).from(users).where(eq(users.email, "pacific-rentals@traveloure.test"));

  const expertUserId = existingExpert?.id ?? crypto.randomUUID();
  const spUserId = existingSP?.id ?? crypto.randomUUID();

  if (!existingExpert || !existingSP) {
    const toInsert: UpsertUser[] = [];
    if (!existingExpert) {
      toInsert.push({
        id: expertUserId,
        email: "sofia.chen@traveloure.test",
        firstName: "Sofia",
        lastName: "Chen",
        role: "local_expert",
        profileImageUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
        bio: "California native and road-trip expert. 12+ years guiding travelers through the Golden State — from PCH scenic drives to hidden wine-country gems and Big Sur coastal hikes.",
        createdAt: new Date("2024-09-01"),
      });
    }
    if (!existingSP) {
      toInsert.push({
        id: spUserId,
        email: "pacific-rentals@traveloure.test",
        firstName: "Pacific Coast",
        lastName: "Rentals",
        role: "service_provider",
        bio: "Premium convertible and SUV rentals for California road trips. Operating from LAX and SFO.",
        createdAt: new Date("2024-08-15"),
      });
    }
    if (toInsert.length) await db.insert(users).values(toInsert);
  }

  await db.insert(localExpertForms).values({
    id: crypto.randomUUID(),
    userId: expertUserId,
    expertType: "local_expert",
    firstName: "Sofia",
    lastName: "Chen",
    email: "sofia.chen@traveloure.test",
    phone: "+1-310-555-0147",
    country: "United States",
    city: "Los Angeles",
    destinations: ["California", "Pacific Coast Highway", "Big Sur", "Napa Valley", "San Francisco"],
    specialties: ["Road Trips", "Photography", "Wine Country", "Coastal Adventures", "Nature & Wildlife"],
    languages: ["English", "Mandarin"],
    yearsOfExperience: "12",
    bio: "Born and raised in LA, I've spent over a decade perfecting California road-trip itineraries. I specialize in PCH coastal drives, Big Sur adventures, wine-country escapes in Santa Ynez and Napa, and urban exploration in SF and LA.",
    availability: "full_time",
    responseTime: "under_2_hours",
    hourlyRate: "75",
    status: "approved",
    createdAt: new Date("2024-09-01"),
  }).onConflictDoNothing();

  const tripId = crypto.randomUUID();
  const trackingNum = `TRP-CA-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  await db.insert(trips).values({
    id: tripId,
    userId: TEST_USER_ID,
    trackingNumber: trackingNum,
    title: "California Coastal Road Trip",
    eventType: "vacation",
    startDate: "2026-06-13",
    endDate: "2026-06-20",
    destination: "California, USA",
    status: "planning",
    numberOfTravelers: 2,
    adults: 2,
    kids: 0,
    budget: "6500.00",
    preferences: {
      interests: ["Adventure", "Food & Culinary", "Nature & Wildlife", "Photography"],
      accommodation: "boutique-hotel",
      pace: "moderate",
      mustSee: ["Big Sur", "Golden Gate Bridge", "Wine Country"],
    },
    experienceType: "travel",
    travelers: 2,
    specialRequests: "We love sunset photography spots and local food. Vegetarian-friendly dining preferred.",
    expertId: expertUserId,
    expertNotes: "Great trip! I've optimized the PCH routing to avoid midday traffic through Malibu. Added a sunset stop at Bixby Bridge on Day 5 — the light is magical around 7:30pm in June.",
    expertModifiedAt: new Date("2026-04-20T14:30:00Z"),
    isPublic: false,
    createdAt: new Date("2026-04-01T10:00:00Z"),
    updatedAt: new Date("2026-04-20T14:30:00Z"),
  });

  await db.insert(tripExpertAdvisors).values({
    id: crypto.randomUUID(),
    tripId,
    localExpertId: expertUserId,
    status: "accepted",
    message: "Requesting expert guidance for an 8-day California coastal road trip.",
    expertResponse: "I'd love to help! California road trips are my specialty. I have some great recommendations for Big Sur and wine country.",
    assignedAt: new Date("2026-04-02T09:00:00Z"),
  });

  const comparisonId = crypto.randomUUID();
  const variantAId = crypto.randomUUID();
  const variantBId = crypto.randomUUID();

  await db.insert(itineraryComparisons).values({
    id: comparisonId,
    userId: TEST_USER_ID,
    tripId,
    title: "California Coastal Road Trip",
    destination: "California, USA",
    startDate: "2026-06-13",
    endDate: "2026-06-20",
    budget: "6500.00",
    travelers: 2,
    experienceTypeSlug: "travel",
    status: "generated",
    selectedVariantId: variantBId,
    createdAt: new Date("2026-04-05T12:00:00Z"),
  });

  await db.insert(itineraryVariants).values([
    {
      id: variantAId,
      comparisonId,
      name: "User Original",
      description: "A balanced 8-day road trip hitting major coastal highlights with plenty of relaxation time. Beach-forward with city exploration in LA and SF.",
      source: "user",
      status: "generated",
      totalCost: "5800.00",
      totalTravelTime: 960,
      averageRating: "4.30",
      freeTimeMinutes: 480,
      optimizationScore: 72,
      sortOrder: 0,
      createdAt: new Date("2026-04-05T12:00:00Z"),
    },
    {
      id: variantBId,
      comparisonId,
      name: "AI Optimized",
      description: "An optimized route adding wine-country tastings, coastal hikes, and photographer-recommended sunset spots. More packed but higher-rated experiences.",
      source: "ai_optimized",
      status: "generated",
      totalCost: "6200.00",
      totalTravelTime: 1020,
      averageRating: "4.65",
      freeTimeMinutes: 360,
      optimizationScore: 91,
      aiReasoning: "Reordered Big Sur activities to catch Bixby Bridge at golden hour. Added Santa Ynez wine stop that saves 45 min vs Paso Robles detour. Swapped generic Fisherman's Wharf lunch for a curated North Beach food walk with higher ratings.",
      sortOrder: 1,
      createdAt: new Date("2026-04-05T12:05:00Z"),
    },
  ]);

  const itemsA = buildVariantItems(variantAId, "A");
  const itemsB = buildVariantItems(variantBId, "B");

  for (const batch of chunkArray([...itemsA, ...itemsB], 20)) {
    await db.insert(itineraryVariantItems).values(batch);
  }
  console.log(`  ✓ ${itemsA.length + itemsB.length} itinerary activities created`);

  const legs = buildTransportLegs(variantBId);
  for (const batch of chunkArray(legs, 15)) {
    await db.insert(transportLegs).values(batch);
  }
  console.log(`  ✓ ${legs.length} transport legs created`);

  const serviceIds = {
    carRental: crypto.randomUUID(),
    photoSession: crypto.randomUUID(),
    wineTour: crypto.randomUUID(),
    foodTour: crypto.randomUUID(),
    alcatraz: crypto.randomUUID(),
  };

  await db.insert(providerServices).values([
    {
      id: serviceIds.carRental,
      userId: spUserId,
      trackingNumber: `SVC-${Date.now().toString(36).toUpperCase().slice(-6)}1`,
      serviceName: "PCH Convertible Rental — 5 Day Package",
      shortDescription: "Premium Mustang convertible for the ultimate Pacific Coast Highway experience",
      description: "Cruise the Pacific Coast Highway in a Ford Mustang GT convertible. Pick up at LAX, drop off at SFO. Includes unlimited mileage, GPS, roadside assistance, and a curated PCH playlist. Perfect for couples doing the LA-to-SF coastal route.",
      serviceType: "action",
      categoryId: CATEGORY_IDS.transport,
      price: "895.00",
      priceType: "fixed",
      priceBasedOn: "5-day rental package",
      deliveryMethod: "in_person",
      deliveryTimeframe: "same-day",
      location: "Los Angeles, CA",
      whatIncluded: ["Ford Mustang GT Convertible", "Unlimited mileage", "GPS navigation", "24/7 roadside assistance", "LAX pickup / SFO drop-off", "Curated PCH road-trip playlist", "Car phone charger"],
      requirements: ["Valid driver's license", "Credit card for deposit", "Minimum age 25"],
      status: "active",
      formStatus: "approved",
      isFeatured: true,
      bookingsCount: 34,
      averageRating: "4.80",
      reviewCount: 28,
      createdAt: new Date("2025-01-15"),
    },
    {
      id: serviceIds.photoSession,
      userId: expertUserId,
      trackingNumber: `SVC-${Date.now().toString(36).toUpperCase().slice(-6)}2`,
      serviceName: "Private Sunset Photo Session — Big Sur",
      shortDescription: "Golden-hour photography at Bixby Bridge & McWay Falls",
      description: "Capture stunning memories along the Big Sur coast during the golden hour. Professional photographer guides you to the most photogenic spots at Bixby Bridge, McWay Falls, and Pfeiffer Beach. You'll receive 50+ edited high-resolution photos within 48 hours.",
      serviceType: "experience",
      categoryId: CATEGORY_IDS.photography,
      price: "350.00",
      priceType: "fixed",
      priceBasedOn: "per couple, 2-hour session",
      deliveryMethod: "in_person",
      deliveryTimeframe: "48 hours for edited photos",
      location: "Big Sur, CA",
      whatIncluded: ["2-hour guided photo session", "3 iconic locations", "50+ edited high-res photos", "Online gallery", "Print-ready files", "Location scouting & timing"],
      requirements: ["Comfortable walking shoes", "Arrive 30 min before sunset"],
      status: "active",
      formStatus: "approved",
      bookingsCount: 19,
      averageRating: "4.90",
      reviewCount: 15,
      createdAt: new Date("2025-02-10"),
    },
    {
      id: serviceIds.wineTour,
      userId: expertUserId,
      trackingNumber: `SVC-${Date.now().toString(36).toUpperCase().slice(-6)}3`,
      serviceName: "Santa Ynez Wine Country Experience",
      shortDescription: "Private guided tour of 4 boutique wineries with lunch",
      description: "Explore the Santa Ynez Valley wine country with a local sommelier guide. Visit 4 hand-picked boutique wineries away from the tourist crowds, enjoy a farm-to-table lunch at a vineyard estate, and learn about Central Coast varietals from passionate winemakers.",
      serviceType: "experience",
      categoryId: CATEGORY_IDS.tours,
      price: "275.00",
      priceType: "fixed",
      priceBasedOn: "per person, full day",
      deliveryMethod: "in_person",
      deliveryTimeframe: "full day, 10am–5pm",
      location: "Santa Ynez, CA",
      whatIncluded: ["4 boutique winery visits", "All tasting fees", "Farm-to-table vineyard lunch", "Sommelier guide", "Hotel pickup/drop-off", "Cooler bag for purchases"],
      requirements: ["Minimum age 21", "Moderate walking ability"],
      status: "active",
      formStatus: "approved",
      bookingsCount: 42,
      averageRating: "4.85",
      reviewCount: 36,
      createdAt: new Date("2025-01-20"),
    },
    {
      id: serviceIds.foodTour,
      userId: expertUserId,
      trackingNumber: `SVC-${Date.now().toString(36).toUpperCase().slice(-6)}4`,
      serviceName: "SF North Beach Food Walk",
      shortDescription: "3-hour culinary walking tour through Little Italy & Chinatown",
      description: "Taste your way through San Francisco's most flavorful neighborhoods. Start in North Beach (Little Italy) with fresh pasta and espresso, wind through Chinatown for dim sum and hand-pulled noodles, and finish with artisan chocolate in the Financial District. 8 tastings total — enough for a full meal.",
      serviceType: "experience",
      categoryId: CATEGORY_IDS.food,
      price: "120.00",
      priceType: "fixed",
      priceBasedOn: "per person",
      deliveryMethod: "in_person",
      deliveryTimeframe: "3 hours, daily at 11am",
      location: "San Francisco, CA",
      whatIncluded: ["8 food tastings (full meal)", "Local guide", "Neighborhood history", "Restaurant recommendations list", "Vegetarian options available"],
      requirements: ["Comfortable walking shoes", "Notify of allergies in advance"],
      status: "active",
      formStatus: "approved",
      bookingsCount: 67,
      averageRating: "4.75",
      reviewCount: 55,
      createdAt: new Date("2025-03-01"),
    },
    {
      id: serviceIds.alcatraz,
      userId: spUserId,
      trackingNumber: `SVC-${Date.now().toString(36).toUpperCase().slice(-6)}5`,
      serviceName: "Alcatraz VIP Early-Access Tour",
      shortDescription: "Beat the crowds with early morning ferry + audio tour",
      description: "Experience Alcatraz Island before the general public. Board the first ferry at 8:45am, enjoy the award-winning audio tour narrated by former guards and inmates, and explore the cell house, recreation yard, and gardens with minimal crowds. Includes round-trip ferry from Pier 33.",
      serviceType: "experience",
      categoryId: CATEGORY_IDS.tours,
      price: "65.00",
      priceType: "fixed",
      priceBasedOn: "per person",
      deliveryMethod: "in_person",
      deliveryTimeframe: "3–4 hours, morning departure",
      location: "San Francisco, CA",
      whatIncluded: ["Early-access ferry ticket", "Award-winning audio tour", "Round-trip from Pier 33", "National Park access", "Cell house & gardens"],
      requirements: ["Arrive at Pier 33 by 8:15am", "Wear layers — island is windy"],
      status: "active",
      formStatus: "approved",
      bookingsCount: 128,
      averageRating: "4.70",
      reviewCount: 98,
      createdAt: new Date("2025-01-05"),
    },
  ]);
  console.log("  ✓ 5 California provider services created");

  await db.insert(serviceBookings).values([
    {
      id: crypto.randomUUID(),
      trackingNumber: `BKG-${Date.now().toString(36).toUpperCase().slice(-6)}1`,
      serviceId: serviceIds.carRental,
      travelerId: TEST_USER_ID,
      providerId: spUserId,
      tripId,
      bookingDetails: { pickupDate: "2026-06-13", dropoffDate: "2026-06-18", vehicle: "Ford Mustang GT Convertible" },
      status: "confirmed",
      totalAmount: "895.00",
      platformFee: "89.50",
      providerEarnings: "805.50",
      confirmedAt: new Date("2026-04-10T16:00:00Z"),
      createdAt: new Date("2026-04-08T11:00:00Z"),
    },
    {
      id: crypto.randomUUID(),
      trackingNumber: `BKG-${Date.now().toString(36).toUpperCase().slice(-6)}2`,
      serviceId: serviceIds.photoSession,
      travelerId: TEST_USER_ID,
      providerId: expertUserId,
      tripId,
      bookingDetails: { date: "2026-06-17", time: "6:30 PM", location: "Bixby Bridge, Big Sur" },
      status: "pending",
      totalAmount: "350.00",
      platformFee: "35.00",
      providerEarnings: "315.00",
      createdAt: new Date("2026-04-15T09:00:00Z"),
    },
    {
      id: crypto.randomUUID(),
      trackingNumber: `BKG-${Date.now().toString(36).toUpperCase().slice(-6)}3`,
      serviceId: serviceIds.wineTour,
      travelerId: TEST_USER_ID,
      providerId: expertUserId,
      tripId,
      bookingDetails: { date: "2026-06-16", guests: 2, dietaryNotes: "Vegetarian-friendly lunch" },
      status: "in_progress",
      totalAmount: "550.00",
      platformFee: "55.00",
      providerEarnings: "495.00",
      createdAt: new Date("2026-04-12T14:00:00Z"),
    },
  ]);
  console.log("  ✓ 3 service bookings created");

  const [convo] = await db.insert(conversations).values({
    title: "California Road Trip — Expert Chat",
    userId: TEST_USER_ID,
  }).returning();

  await db.insert(messages).values([
    {
      conversationId: convo.id,
      role: "assistant",
      content: "Hi! I'm Sofia, your California road-trip expert. I've been exploring the PCH and wine country for over 12 years — so excited to help you plan the perfect trip! What are you most looking forward to?",
    },
    {
      conversationId: convo.id,
      role: "user",
      content: "We're most looking forward to Big Sur and wine country! We also love sunset photography — any tips for the best golden-hour spots along the coast?",
    },
    {
      conversationId: convo.id,
      role: "assistant",
      content: "Great choices! For Big Sur, I'd strongly recommend timing your Bixby Bridge visit around 7:30 PM in June — the light is absolutely magical as the sun dips toward the Pacific. McWay Falls is best earlier in the afternoon when the waterfall catches direct sunlight.\n\nFor wine country, I've switched your route from Paso Robles to Santa Ynez — it saves 45 minutes of driving and the boutique wineries there are less crowded with incredible Pinot Noir.\n\nI've also added a private sunset photo session at Bixby Bridge on Day 5 — would you like me to book that?",
    },
    {
      conversationId: convo.id,
      role: "user",
      content: "That sounds amazing! Yes, please book the photo session. Also — are there good vegetarian restaurants along the route? My partner is vegetarian.",
    },
    {
      conversationId: convo.id,
      role: "assistant",
      content: "Absolutely! I've noted vegetarian preferences throughout your itinerary. Here are my top picks:\n\n• **Day 2 (Silver Lake, LA)**: Sqirl — incredible rice bowls and seasonal veggie plates\n• **Day 4 (Santa Barbara)**: The Lark — farm-to-table with amazing veggie mains\n• **Day 6 (Carmel)**: Cultura Comida y Bebida — plant-forward Oaxacan cuisine\n• **Day 7 (SF)**: Mister Jiu's in Chinatown — vegetarian dim sum tasting menu\n\nI've updated Days 5-6 with the optimized Big Sur route and submitted the photo session booking. You should see a notification shortly!",
    },
  ]);
  console.log("  ✓ Conversation with 5 messages created");

  await db.insert(notifications).values([
    {
      id: crypto.randomUUID(),
      userId: TEST_USER_ID,
      type: "expert_update",
      title: "Expert Update: Days 5-6 Optimized",
      message: "Your expert Sofia has updated Days 5-6 with optimized Big Sur timing and a sunset photo session at Bixby Bridge.",
      relatedId: tripId,
      relatedType: "trip",
      isRead: false,
      createdAt: new Date("2026-04-20T14:30:00Z"),
    },
    {
      id: crypto.randomUUID(),
      userId: TEST_USER_ID,
      type: "booking_confirmed",
      title: "Booking Confirmed: PCH Convertible Rental",
      message: "Your Ford Mustang GT Convertible rental has been confirmed for Jun 13–18. Pick up at LAX Terminal 1.",
      relatedId: serviceIds.carRental,
      relatedType: "booking",
      isRead: true,
      createdAt: new Date("2026-04-10T16:05:00Z"),
    },
    {
      id: crypto.randomUUID(),
      userId: TEST_USER_ID,
      type: "action_required",
      title: "Action Needed: Approve Alcatraz Tour",
      message: "Early-access Alcatraz tickets for Jun 20 are selling fast — only 4 spots remaining. Approve to lock in your reservation.",
      relatedId: serviceIds.alcatraz,
      relatedType: "service",
      isRead: false,
      createdAt: new Date("2026-04-22T08:00:00Z"),
    },
    {
      id: crypto.randomUUID(),
      userId: TEST_USER_ID,
      type: "price_alert",
      title: "Price Drop: SF Food Tour",
      message: "The North Beach Food Walk you viewed just dropped from $140 to $120/person — $40 savings for two!",
      relatedId: serviceIds.foodTour,
      relatedType: "service",
      isRead: false,
      createdAt: new Date("2026-04-21T11:00:00Z"),
    },
  ]);
  console.log("  ✓ 4 notifications created");

  const hawaiiComparisonId = crypto.randomUUID();
  const hawaiiVariantId = crypto.randomUUID();

  await db.insert(itineraryComparisons).values({
    id: hawaiiComparisonId,
    userId: TEST_USER_ID,
    title: "Hawaii Honeymoon",
    destination: "Maui & Big Island, Hawaii",
    startDate: "2026-09-10",
    endDate: "2026-09-20",
    budget: "4200.00",
    travelers: 2,
    experienceTypeSlug: "travel",
    status: "pending",
    createdAt: new Date("2026-03-15T17:00:00Z"),
  });

  await db.insert(itineraryVariants).values({
    id: hawaiiVariantId,
    comparisonId: hawaiiComparisonId,
    name: "Hawaii Honeymoon Draft",
    description: "10-day Maui + Big Island honeymoon — beachfront resorts, snorkeling, volcano hikes, and luau dinners.",
    source: "user",
    status: "pending",
    totalCost: "4200.00",
    sortOrder: 0,
    createdAt: new Date("2026-03-15T17:00:00Z"),
  });

  await db.insert(savedTrips).values({
    userId: TEST_USER_ID,
    variantId: hawaiiVariantId,
    comparisonId: hawaiiComparisonId,
    notes: "Hawaii Honeymoon — Maui + Big Island, 10 days. Found great deals on beachfront resorts for September.",
    savedAt: new Date("2026-03-15T18:00:00Z"),
    expiresAt: new Date("2026-12-31T23:59:59Z"),
    priceSnapshot: "4200.00",
    status: "active",
  });
  console.log("  ✓ 1 saved trip created (Hawaii Honeymoon)\n");

  console.log("🎉 California Coastal Road Trip seed complete!");
  console.log(`   Trip ID: ${tripId}`);
  console.log(`   Tracking: ${trackingNum}`);
  console.log(`   Expert: Sofia Chen (sofia.chen@traveloure.test)`);
  console.log(`   Login as: test-user@traveloure.test / TestPass123!\n`);
}

function buildVariantItems(variantId: string, variant: "A" | "B") {
  const items: VariantItemInsert[] = [];
  let order = 0;

  const days = variant === "A" ? getClassicDays() : getAdventureDays();

  for (const day of days) {
    for (const act of day.activities) {
      items.push({
        id: crypto.randomUUID(),
        variantId,
        dayNumber: day.dayNumber,
        startTime: act.startTime,
        endTime: act.endTime,
        name: act.name,
        description: act.description,
        serviceType: act.category || "activity",
        price: act.price?.toString(),
        location: act.location,
        latitude: act.lat?.toString(),
        longitude: act.lng?.toString(),
        duration: act.duration,
        sortOrder: order++,
        metadata: { category: act.category },
      });
    }
  }
  return items;
}

interface DayPlan {
  dayNumber: number;
  activities: {
    name: string;
    description: string;
    location: string;
    startTime: string;
    endTime: string;
    price?: number;
    duration: number;
    lat: number;
    lng: number;
    category?: string;
  }[];
}

function getClassicDays(): DayPlan[] {
  return [
    {
      dayNumber: 1,
      activities: [
        { name: "Arrive at LAX", description: "Land at Los Angeles International Airport and pick up rental car", location: "LAX Airport, Los Angeles", startTime: "10:00", endTime: "11:00", duration: 60, lat: 33.9425, lng: -118.4081, category: "transport" },
        { name: "Santa Monica Pier", description: "Stroll the iconic pier — ride the Ferris wheel, grab fish tacos, people-watch on the boardwalk", location: "Santa Monica Pier, CA", startTime: "12:00", endTime: "14:30", price: 25, duration: 150, lat: 34.0094, lng: -118.4973, category: "sightseeing" },
        { name: "Venice Beach Sunset Walk", description: "Walk the Venice Beach boardwalk, check out Muscle Beach and the street performers, stay for sunset", location: "Venice Beach, CA", startTime: "16:00", endTime: "19:00", duration: 180, lat: 33.9850, lng: -118.4695, category: "nature" },
      ],
    },
    {
      dayNumber: 2,
      activities: [
        { name: "Griffith Observatory", description: "Panoramic LA views, free telescope viewing, and the Hollywood sign from the best angle", location: "Griffith Observatory, Los Angeles", startTime: "09:00", endTime: "11:30", duration: 150, lat: 34.1184, lng: -118.3004, category: "sightseeing" },
        { name: "Hollywood Walk of Fame", description: "Find your favorite stars, see the TCL Chinese Theatre, grab lunch on Hollywood Blvd", location: "Hollywood Blvd, Los Angeles", startTime: "12:00", endTime: "14:00", price: 15, duration: 120, lat: 34.1016, lng: -118.3267, category: "sightseeing" },
        { name: "Dinner in Silver Lake", description: "Trendy neighborhood dining — farm-to-table at Sqirl or craft cocktails at Sunset Junction", location: "Silver Lake, Los Angeles", startTime: "18:30", endTime: "20:30", price: 85, duration: 120, lat: 34.0870, lng: -118.2593, category: "dining" },
      ],
    },
    {
      dayNumber: 3,
      activities: [
        { name: "Malibu Beach Morning", description: "Relax at El Matador State Beach — dramatic sea stacks and turquoise coves", location: "El Matador Beach, Malibu", startTime: "09:00", endTime: "11:30", duration: 150, lat: 34.0381, lng: -118.8745, category: "nature" },
        { name: "PCH Drive to Oxnard", description: "Begin the iconic Pacific Coast Highway drive north. Stop at Point Mugu for photos", location: "Pacific Coast Highway", startTime: "12:00", endTime: "14:00", price: 0, duration: 120, lat: 34.0912, lng: -119.0586, category: "transport" },
        { name: "Lunch in Oxnard", description: "Fresh seafood at the Channel Islands Harbor — fish & chips with harbor views", location: "Channel Islands Harbor, Oxnard", startTime: "14:30", endTime: "15:30", price: 45, duration: 60, lat: 34.1599, lng: -119.2247, category: "dining" },
      ],
    },
    {
      dayNumber: 4,
      activities: [
        { name: "Wine Tasting in Santa Ynez", description: "Visit boutique wineries in the scenic Santa Ynez Valley. Sample Pinot Noir, Syrah, and Chardonnay", location: "Santa Ynez Valley, CA", startTime: "10:00", endTime: "13:00", price: 60, duration: 180, lat: 34.6126, lng: -119.7713, category: "experience" },
        { name: "Stearns Wharf", description: "Walk the oldest working wharf on the West Coast. Browse shops, eat clam chowder, watch pelicans", location: "Stearns Wharf, Santa Barbara", startTime: "14:30", endTime: "16:00", duration: 90, lat: 34.4099, lng: -119.6854, category: "sightseeing" },
        { name: "Old Mission Santa Barbara", description: "The 'Queen of the Missions' — stunning Spanish colonial architecture and rose gardens", location: "Old Mission, Santa Barbara", startTime: "16:30", endTime: "18:00", price: 15, duration: 90, lat: 34.4373, lng: -119.7139, category: "culture" },
      ],
    },
    {
      dayNumber: 5,
      activities: [
        { name: "Bixby Bridge", description: "Stop at the most photographed bridge on the California coast. Walk to the viewpoint for classic shots", location: "Bixby Creek Bridge, Big Sur", startTime: "10:00", endTime: "11:00", duration: 60, lat: 36.3714, lng: -121.9016, category: "sightseeing" },
        { name: "McWay Falls", description: "Short trail to the overlook of an 80-foot waterfall cascading onto a pristine beach", location: "Julia Pfeiffer Burns State Park", startTime: "12:00", endTime: "13:30", price: 10, duration: 90, lat: 36.1579, lng: -121.6722, category: "nature" },
        { name: "Pfeiffer Beach", description: "Purple sand beach with dramatic Keyhole Rock. Best light in late afternoon", location: "Pfeiffer Beach, Big Sur", startTime: "15:00", endTime: "17:00", duration: 120, lat: 36.2388, lng: -121.8155, category: "nature" },
      ],
    },
    {
      dayNumber: 6,
      activities: [
        { name: "Monterey Bay Aquarium", description: "World-class aquarium — kelp forest, sea otters, open-ocean tank with tuna and sharks", location: "Monterey Bay Aquarium", startTime: "09:30", endTime: "12:30", price: 55, duration: 180, lat: 36.6183, lng: -121.9018, category: "sightseeing" },
        { name: "17-Mile Drive", description: "Scenic drive through Pebble Beach — Lone Cypress, Bird Rock, and ocean panoramas", location: "17-Mile Drive, Pebble Beach", startTime: "13:30", endTime: "15:30", price: 11, duration: 120, lat: 36.5872, lng: -121.9664, category: "sightseeing" },
        { name: "Carmel-by-the-Sea", description: "Fairy-tale village with art galleries, wine tasting rooms, and Carmel Beach sunset", location: "Carmel-by-the-Sea, CA", startTime: "16:00", endTime: "19:00", price: 30, duration: 180, lat: 36.5553, lng: -121.9233, category: "sightseeing" },
      ],
    },
    {
      dayNumber: 7,
      activities: [
        { name: "Golden Gate Bridge Walk", description: "Walk or bike across the iconic bridge. Start from the Presidio side for the best views of the city", location: "Golden Gate Bridge, SF", startTime: "09:00", endTime: "10:30", duration: 90, lat: 37.8199, lng: -122.4783, category: "sightseeing" },
        { name: "Fisherman's Wharf", description: "Sea lions at Pier 39, sourdough bread bowls, and bay views. Touristy but worth a quick stop", location: "Fisherman's Wharf, SF", startTime: "11:30", endTime: "13:30", price: 30, duration: 120, lat: 37.8080, lng: -122.4177, category: "sightseeing" },
        { name: "Chinatown Dinner", description: "The oldest Chinatown in North America. Dim sum, hand-pulled noodles, and bustling Grant Avenue", location: "Chinatown, San Francisco", startTime: "18:00", endTime: "20:00", price: 50, duration: 120, lat: 37.7941, lng: -122.4078, category: "dining" },
      ],
    },
    {
      dayNumber: 8,
      activities: [
        { name: "Alcatraz Morning Tour", description: "Early ferry to Alcatraz Island. Award-winning audio tour through the cell house", location: "Alcatraz Island, SF", startTime: "08:45", endTime: "12:00", price: 65, duration: 195, lat: 37.8267, lng: -122.4230, category: "sightseeing" },
        { name: "Depart from SFO", description: "Drop off rental car and head to San Francisco International Airport", location: "SFO Airport", startTime: "15:00", endTime: "16:00", duration: 60, lat: 37.6213, lng: -122.3790, category: "transport" },
      ],
    },
  ];
}

function getAdventureDays(): DayPlan[] {
  const classic = getClassicDays();

  const adventureMods: Partial<Record<number, DayPlan>> = {
    4: {
      dayNumber: 4,
      activities: [
        { name: "Santa Ynez Wine Tasting", description: "Private tour of 4 boutique wineries in the Santa Ynez Valley with a local sommelier. Includes vineyard lunch", location: "Santa Ynez Valley, CA", startTime: "10:00", endTime: "16:00", price: 275, duration: 360, lat: 34.6126, lng: -119.7713, category: "experience" },
        { name: "Stearns Wharf Sunset", description: "Evening stroll on the wharf after wine country. Watch the sunset over the Channel Islands", location: "Stearns Wharf, Santa Barbara", startTime: "18:00", endTime: "19:30", duration: 90, lat: 34.4099, lng: -119.6854, category: "nature" },
        { name: "Dinner at The Lark", description: "Farm-to-table dining with excellent vegetarian options. Reserve the patio for harbor views", location: "The Lark, Santa Barbara", startTime: "20:00", endTime: "21:30", price: 95, duration: 90, lat: 34.4139, lng: -119.6936, category: "dining" },
      ],
    },
    5: {
      dayNumber: 5,
      activities: [
        { name: "Ragged Point Coastal Hike", description: "Moderate 2-mile trail down to a secluded black-sand beach. Wildflowers in June", location: "Ragged Point, Big Sur", startTime: "08:30", endTime: "10:30", duration: 120, lat: 35.7838, lng: -121.3280, category: "adventure" },
        { name: "McWay Falls", description: "The iconic 80-foot waterfall dropping onto a pristine cove. Best light 11am–1pm in June", location: "Julia Pfeiffer Burns State Park", startTime: "12:00", endTime: "13:30", price: 10, duration: 90, lat: 36.1579, lng: -121.6722, category: "nature" },
        { name: "Bixby Bridge at Golden Hour", description: "Arrive at the famous bridge for golden-hour photography. The light hits perfectly around 7:30 PM in June", location: "Bixby Creek Bridge, Big Sur", startTime: "18:30", endTime: "20:00", duration: 90, lat: 36.3714, lng: -121.9016, category: "photography" },
      ],
    },
    7: {
      dayNumber: 7,
      activities: [
        { name: "Golden Gate Bridge Walk", description: "Walk across the bridge starting from the Presidio. Morning fog burns off by 10 AM for clear views", location: "Golden Gate Bridge, SF", startTime: "09:00", endTime: "10:30", duration: 90, lat: 37.8199, lng: -122.4783, category: "sightseeing" },
        { name: "North Beach Food Walk", description: "Curated 3-hour food tour through Little Italy and Chinatown. 8 tastings including fresh pasta, dim sum, and artisan chocolate", location: "North Beach, San Francisco", startTime: "11:00", endTime: "14:00", price: 120, duration: 180, lat: 37.8060, lng: -122.4103, category: "food" },
        { name: "Mister Jiu's Chinatown Dinner", description: "Award-winning modern Chinese cuisine. Request the vegetarian dim sum tasting menu", location: "Mister Jiu's, San Francisco", startTime: "18:30", endTime: "20:30", price: 95, duration: 120, lat: 37.7953, lng: -122.4065, category: "dining" },
      ],
    },
  };

  return classic.map((day) => adventureMods[day.dayNumber] || day);
}

function buildTransportLegs(variantId: string) {
  const legs: TransportLegInsert[] = [];
  const defs: {
    day: number;
    order: number;
    from: string;
    fromLat: number;
    fromLng: number;
    to: string;
    toLat: number;
    toLng: number;
    dist: number;
    distDisp: string;
    mode: string;
    mins: number;
    cost: number | null;
    energy: number;
    alts: { mode: string; durationMinutes: number; costUsd: number | null; energyCost: number; reason: string }[];
  }[] = [
    // Day 1: LAX → Hotel → Santa Monica Pier → Venice Beach
    { day: 1, order: 0, from: "LAX Airport", fromLat: 33.9425, fromLng: -118.4081, to: "Hotel (Santa Monica)", toLat: 34.0094, toLng: -118.4973, dist: 14500, distDisp: "14.5 km", mode: "rideshare", mins: 25, cost: 18, energy: 1, alts: [{ mode: "taxi", durationMinutes: 25, costUsd: 35, energyCost: 1, reason: "Traditional taxi option" }] },
    { day: 1, order: 1, from: "Hotel (Santa Monica)", fromLat: 34.0094, fromLng: -118.4973, to: "Santa Monica Pier", toLat: 34.0095, toLng: -118.4970, dist: 400, distDisp: "0.4 km", mode: "walk", mins: 5, cost: 0, energy: 1, alts: [] },
    { day: 1, order: 2, from: "Santa Monica Pier", fromLat: 34.0094, fromLng: -118.4973, to: "Venice Beach", toLat: 33.9850, toLng: -118.4695, dist: 3200, distDisp: "3.2 km", mode: "walk", mins: 35, cost: 0, energy: 2, alts: [{ mode: "bike", durationMinutes: 12, costUsd: 5, energyCost: 1, reason: "Beach bike path" }] },
    // Day 2: Hotel → Griffith → Hollywood → Silver Lake
    { day: 2, order: 0, from: "Hotel (Santa Monica)", fromLat: 34.0094, fromLng: -118.4973, to: "Griffith Observatory", toLat: 34.1184, toLng: -118.3004, dist: 24000, distDisp: "24 km", mode: "rideshare", mins: 35, cost: 22, energy: 1, alts: [{ mode: "car", durationMinutes: 35, costUsd: 0, energyCost: 1, reason: "Self-drive but parking is limited" }] },
    { day: 2, order: 1, from: "Griffith Observatory", fromLat: 34.1184, fromLng: -118.3004, to: "Hollywood Blvd", toLat: 34.1016, toLng: -118.3267, dist: 5000, distDisp: "5 km", mode: "rideshare", mins: 12, cost: 10, energy: 1, alts: [{ mode: "walk", durationMinutes: 40, costUsd: 0, energyCost: 3, reason: "Downhill walk through Griffith Park" }] },
    { day: 2, order: 2, from: "Hollywood Blvd", fromLat: 34.1016, fromLng: -118.3267, to: "Silver Lake", toLat: 34.0870, toLng: -118.2593, dist: 8000, distDisp: "8 km", mode: "rideshare", mins: 18, cost: 12, energy: 1, alts: [{ mode: "transit", durationMinutes: 30, costUsd: 1.75, energyCost: 2, reason: "Metro Red + bus" }] },
    // Day 3: Hotel → El Matador Beach → PCH/Oxnard
    { day: 3, order: 0, from: "Hotel (Santa Monica)", fromLat: 34.0094, fromLng: -118.4973, to: "El Matador Beach", toLat: 34.0381, toLng: -118.8745, dist: 42000, distDisp: "42 km", mode: "car", mins: 45, cost: 0, energy: 1, alts: [] },
    { day: 3, order: 1, from: "El Matador Beach", fromLat: 34.0381, fromLng: -118.8745, to: "Channel Islands Harbor", toLat: 34.1599, toLng: -119.2247, dist: 55000, distDisp: "55 km", mode: "car", mins: 50, cost: 0, energy: 1, alts: [] },
    // Day 4 (B): Oxnard → Santa Ynez Wine → Stearns Wharf → The Lark
    { day: 4, order: 0, from: "Oxnard Hotel", fromLat: 34.1975, fromLng: -119.1771, to: "Santa Ynez Valley", toLat: 34.6126, toLng: -119.7713, dist: 85000, distDisp: "85 km", mode: "car", mins: 75, cost: 0, energy: 1, alts: [] },
    { day: 4, order: 1, from: "Santa Ynez Valley", fromLat: 34.6126, fromLng: -119.7713, to: "Stearns Wharf", toLat: 34.4099, toLng: -119.6854, dist: 45000, distDisp: "45 km", mode: "car", mins: 40, cost: 0, energy: 1, alts: [] },
    { day: 4, order: 2, from: "Stearns Wharf", fromLat: 34.4099, fromLng: -119.6854, to: "The Lark", toLat: 34.4139, toLng: -119.6936, dist: 1200, distDisp: "1.2 km", mode: "walk", mins: 15, cost: 0, energy: 1, alts: [] },
    // Day 5 (B): Santa Barbara → Ragged Point → McWay Falls → Bixby Bridge
    { day: 5, order: 0, from: "Santa Barbara Hotel", fromLat: 34.4208, fromLng: -119.6982, to: "Ragged Point", toLat: 35.7838, toLng: -121.3280, dist: 195000, distDisp: "195 km", mode: "car", mins: 150, cost: 0, energy: 2, alts: [] },
    { day: 5, order: 1, from: "Ragged Point", fromLat: 35.7838, fromLng: -121.3280, to: "McWay Falls", toLat: 36.1579, toLng: -121.6722, dist: 65000, distDisp: "65 km", mode: "car", mins: 75, cost: 0, energy: 1, alts: [] },
    { day: 5, order: 2, from: "McWay Falls", fromLat: 36.1579, fromLng: -121.6722, to: "Bixby Bridge", toLat: 36.3714, toLng: -121.9016, dist: 35000, distDisp: "35 km", mode: "car", mins: 40, cost: 0, energy: 1, alts: [] },
    // Day 6: Big Sur → Monterey Aquarium → 17-Mile Drive → Carmel
    { day: 6, order: 0, from: "Big Sur Lodge", fromLat: 36.2500, fromLng: -121.7868, to: "Monterey Bay Aquarium", toLat: 36.6183, toLng: -121.9018, dist: 50000, distDisp: "50 km", mode: "car", mins: 55, cost: 0, energy: 1, alts: [] },
    { day: 6, order: 1, from: "Monterey Bay Aquarium", fromLat: 36.6183, fromLng: -121.9018, to: "17-Mile Drive", toLat: 36.5872, toLng: -121.9664, dist: 8000, distDisp: "8 km", mode: "car", mins: 30, cost: 11, energy: 1, alts: [] },
    { day: 6, order: 2, from: "17-Mile Drive", fromLat: 36.5872, fromLng: -121.9664, to: "Carmel-by-the-Sea", toLat: 36.5553, toLng: -121.9233, dist: 6000, distDisp: "6 km", mode: "car", mins: 15, cost: 0, energy: 1, alts: [{ mode: "walk", durationMinutes: 45, costUsd: 0, energyCost: 2, reason: "Scenic walk if weather is good" }] },
    // Day 7 (B): SF Hotel → Golden Gate → North Beach Food Walk → Mister Jiu's
    { day: 7, order: 0, from: "SF Hotel (Union Square)", fromLat: 37.7879, fromLng: -122.4074, to: "Golden Gate Bridge", toLat: 37.8199, toLng: -122.4783, dist: 9000, distDisp: "9 km", mode: "transit", mins: 25, cost: 2.5, energy: 1, alts: [{ mode: "rideshare", durationMinutes: 15, costUsd: 12, energyCost: 1, reason: "Faster but parking is limited" }] },
    { day: 7, order: 1, from: "Golden Gate Bridge", fromLat: 37.8199, fromLng: -122.4783, to: "North Beach", toLat: 37.8060, toLng: -122.4103, dist: 8500, distDisp: "8.5 km", mode: "transit", mins: 25, cost: 2.5, energy: 1, alts: [{ mode: "walk", durationMinutes: 60, costUsd: 0, energyCost: 3, reason: "Scenic walk through the Marina" }] },
    { day: 7, order: 2, from: "North Beach", fromLat: 37.8060, fromLng: -122.4103, to: "Mister Jiu's (Chinatown)", toLat: 37.7953, toLng: -122.4065, dist: 1200, distDisp: "1.2 km", mode: "walk", mins: 15, cost: 0, energy: 1, alts: [] },
    // Day 8: SF Hotel → Pier 33 (Alcatraz) → SFO
    { day: 8, order: 0, from: "SF Hotel", fromLat: 37.7879, fromLng: -122.4074, to: "Pier 33 (Alcatraz Ferry)", toLat: 37.8080, toLng: -122.4098, dist: 3000, distDisp: "3 km", mode: "walk", mins: 25, cost: 0, energy: 1, alts: [{ mode: "rideshare", durationMinutes: 8, costUsd: 8, energyCost: 0, reason: "Save energy for island walking" }] },
    { day: 8, order: 1, from: "Pier 33", fromLat: 37.8080, fromLng: -122.4098, to: "SFO Airport", toLat: 37.6213, toLng: -122.3790, dist: 22000, distDisp: "22 km", mode: "rideshare", mins: 30, cost: 35, energy: 1, alts: [{ mode: "BART", durationMinutes: 45, costUsd: 9, energyCost: 2, reason: "Budget option with one transfer" }] },
  ];

  for (const d of defs) {
    legs.push({
      id: crypto.randomUUID(),
      variantId,
      dayNumber: d.day,
      legOrder: d.order,
      fromName: d.from,
      fromLat: d.fromLat,
      fromLng: d.fromLng,
      toName: d.to,
      toLat: d.toLat,
      toLng: d.toLng,
      distanceMeters: d.dist,
      distanceDisplay: d.distDisp,
      recommendedMode: d.mode,
      estimatedDurationMinutes: d.mins,
      estimatedCostUsd: d.cost,
      alternativeModes: d.alts,
      energyCost: d.energy,
    });
  }
  return legs;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const isMain = process.argv[1]?.endsWith("california-trip-seed.ts");
if (isMain) {
  seedCaliforniaTrip()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ California trip seed failed:", err);
      process.exit(1);
    });
}
