/**
 * Test script to validate the shareable itinerary flow
 * Creates test data and generates a share token with public URL
 *
 * Run with: npx tsx scripts/test-share-flow.ts
 */

import { db } from "../server/db";
import {
  users,
  trips,
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
  sharedItineraries,
  transportLegs,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { calculateTransportLegs } from "../server/services/transport-leg-calculator";
import { randomUUID } from "crypto";

// Kyoto activity coordinates
const ACTIVITIES = [
  {
    name: "Fushimi Inari Shrine",
    lat: 34.9671,
    lng: 135.7727,
    startTime: "09:00",
    endTime: "11:00",
    dayNumber: 1,
    duration: 120,
    price: 0,
    rating: 4.8,
  },
  {
    name: "Nishiki Market",
    lat: 35.0050,
    lng: 135.7650,
    startTime: "11:45",
    endTime: "13:30",
    dayNumber: 1,
    duration: 105,
    price: 50,
    rating: 4.6,
  },
  {
    name: "Arashiyama Bamboo Grove",
    lat: 35.0094,
    lng: 135.6681,
    startTime: "08:30",
    endTime: "10:00",
    dayNumber: 2,
    duration: 90,
    price: 0,
    rating: 4.7,
  },
  {
    name: "Kinkaku-ji (Golden Pavilion)",
    lat: 35.0394,
    lng: 135.7292,
    startTime: "11:00",
    endTime: "12:30",
    dayNumber: 2,
    duration: 90,
    price: 400,
    rating: 4.8,
  },
  {
    name: "Gion District",
    lat: 35.0037,
    lng: 135.7758,
    startTime: "09:00",
    endTime: "11:30",
    dayNumber: 3,
    duration: 150,
    price: 0,
    rating: 4.5,
  },
  {
    name: "Philosopher's Path",
    lat: 35.0227,
    lng: 135.7943,
    startTime: "13:00",
    endTime: "15:00",
    dayNumber: 3,
    duration: 120,
    price: 0,
    rating: 4.4,
  },
];

async function main() {
  try {
    console.log("🎯 Starting shareable itinerary test flow...\n");

    // Step 1: Create or find test user
    console.log("📝 Step 1: Creating/finding test user...");
    const testEmail = "test-share-flow@traveloure.local";
    let [testUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, testEmail));

    if (!testUser) {
      const [newUser] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          email: testEmail,
          firstName: "Test",
          lastName: "ShareFlow",
          role: "traveler",
        })
        .returning();
      testUser = newUser;
      console.log(`✅ Created new user: ${testUser.email} (${testUser.id})`);
    } else {
      console.log(`✅ Found existing user: ${testUser.email} (${testUser.id})`);
    }

    // Step 2: Create test trip
    console.log("\n📍 Step 2: Creating test trip to Kyoto (April 1-3, 2026)...");
    const tripId = randomUUID();
    const [trip] = await db
      .insert(trips)
      .values({
        id: tripId,
        userId: testUser.id,
        title: "Kyoto Temple Tour",
        destination: "Kyoto, Japan",
        startDate: new Date("2026-04-01"),
        endDate: new Date("2026-04-03"),
        numberOfTravelers: 2,
        budget: "5000",
      })
      .returning();
    console.log(`✅ Created trip: ${trip.title} (${trip.id})`);

    // Step 3: Create itinerary comparison
    console.log("\n📊 Step 3: Creating itinerary comparison...");
    const [comparison] = await db
      .insert(itineraryComparisons)
      .values({
        userId: testUser.id,
        tripId: trip.id,
        title: "Kyoto Temple Tour - Optimized",
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        budget: trip.budget,
        travelers: trip.numberOfTravelers,
        status: "pending",
      })
      .returning();
    console.log(`✅ Created comparison: ${comparison.id}`);

    // Step 4: Create itinerary variant
    console.log("\n🎨 Step 4: Creating itinerary variant...");
    const totalCost = ACTIVITIES.reduce((sum, act) => sum + act.price, 0);
    const avgRating =
      ACTIVITIES.reduce((sum, act) => sum + act.rating, 0) / ACTIVITIES.length;

    const [variant] = await db
      .insert(itineraryVariants)
      .values({
        comparisonId: comparison.id,
        name: "Kyoto Classic Route",
        description:
          "A perfect 3-day tour of Kyoto's most iconic temples and districts",
        source: "ai_optimized",
        status: "generated",
        totalCost: totalCost.toString(),
        averageRating: avgRating.toFixed(2),
        optimizationScore: 85,
        aiReasoning:
          "This itinerary balances iconic temples with local markets and cultural experiences.",
      })
      .returning();
    console.log(`✅ Created variant: ${variant.name} (${variant.id})`);

    // Step 5: Create variant items (activities)
    console.log("\n🎭 Step 5: Creating 6 activities...");
    const variantItems = await db
      .insert(itineraryVariantItems)
      .values(
        ACTIVITIES.map((act, idx) => ({
          variantId: variant.id,
          dayNumber: act.dayNumber,
          timeSlot: act.startTime < "12:00" ? "morning" : "afternoon",
          startTime: act.startTime,
          endTime: act.endTime,
          name: act.name,
          description: `Experience ${act.name} in Kyoto`,
          serviceType: "sightseeing",
          price: act.price.toString(),
          rating: act.rating.toString(),
          location: "Kyoto, Japan",
          latitude: act.lat.toString(),
          longitude: act.lng.toString(),
          duration: act.duration,
          sortOrder: idx,
        }))
      )
      .returning();
    console.log(`✅ Created ${variantItems.length} activities`);

    // Step 6: Calculate transport legs
    console.log("\n🚗 Step 6: Calculating transport legs...");
    const activitiesForTransport = variantItems.map((item, idx) => ({
      id: item.id,
      name: item.name || "",
      lat: parseFloat(item.latitude as any),
      lng: parseFloat(item.longitude as any),
      scheduledTime: item.startTime || "09:00",
      dayNumber: item.dayNumber,
      order: idx,
    }));

    const transportLegsResult = await calculateTransportLegs(
      variant.id,
      activitiesForTransport,
      trip.destination,
      { defaultMode: "transit" }
    );

    console.log(`✅ Calculated ${transportLegsResult.length} transport legs`);

    // Insert transport legs into database
    if (transportLegsResult.length > 0) {
      await db.insert(transportLegs).values(
        transportLegsResult.map((leg, idx) => ({
          variantId: variant.id,
          dayNumber: leg.dayNumber,
          legOrder: idx + 1,
          fromName: leg.fromActivityName,
          toName: leg.toActivityName,
          recommendedMode: leg.recommendedMode || "transit",
          userSelectedMode: null,
          distanceDisplay: leg.distanceDisplay,
          distanceMeters: leg.distanceMeters,
          estimatedDurationMinutes: leg.estimatedDurationMinutes,
          estimatedCostUsd: leg.estimatedCostUsd,
          energyCost: leg.energyCost || 0,
          alternativeModes: JSON.stringify(leg.alternativeModes || []),
          fromLat: leg.fromLat,
          fromLng: leg.fromLng,
          toLat: leg.toLat,
          toLng: leg.toLng,
        }))
      );
    }

    // Step 7: Create share token
    console.log("\n🔗 Step 7: Creating share token...");
    const shareToken = randomUUID();
    const [shared] = await db
      .insert(sharedItineraries)
      .values({
        shareToken,
        variantId: variant.id,
        sharedByUserId: testUser.id,
        permissions: "view",
      })
      .returning();
    console.log(`✅ Created share record: ${shared.id}`);

    // Step 8: Print results
    console.log("\n" + "=".repeat(70));
    console.log("✨ TEST FLOW COMPLETE");
    console.log("=".repeat(70));
    console.log(`\n📊 Created Data Summary:`);
    console.log(`   User: ${testUser.email}`);
    console.log(`   Trip: ${trip.title} (${trip.id})`);
    console.log(`   Variant: ${variant.name} (${variant.id})`);
    console.log(`   Activities: ${ACTIVITIES.length}`);
    console.log(`   Total Cost: $${totalCost}`);
    console.log(`   Average Rating: ${avgRating.toFixed(1)}/5.0`);
    console.log(`\n🔗 SHARE INFORMATION:`);
    console.log(`   Share Token: ${shareToken}`);
    console.log(`\n🌐 PUBLIC SHARE URL:`);
    console.log(`   http://localhost:5173/itinerary-view/${shareToken}`);
    console.log(`\n✅ Test the following flows:`);
    console.log(`   1. Open the URL above in a private/incognito window`);
    console.log(`   2. Verify itinerary loads with all 6 activities`);
    console.log(`   3. Verify transport legs show between activities`);
    console.log(`   4. Verify "Shared by Test ShareFlow" banner appears`);
    console.log(`   5. Verify transport mode buttons are hidden (readOnly)`);
    console.log(`   6. Verify meta tags work (og:title, og:description)`);
    console.log(`\n💡 Test Data IDs for debugging:`);
    console.log(`   User ID: ${testUser.id}`);
    console.log(`   Trip ID: ${trip.id}`);
    console.log(`   Comparison ID: ${comparison.id}`);
    console.log(`   Variant ID: ${variant.id}`);
    console.log("=".repeat(70));

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
