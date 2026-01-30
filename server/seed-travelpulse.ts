import { db } from "./db";
import {
  travelPulseCalendarEvents,
  travelPulseCities,
  travelPulseTrending,
  travelPulseHiddenGems,
  travelPulseLiveActivity,
  travelPulseHappeningNow,
} from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { logger } from "./infrastructure";

const calendarEventsData = [
  {
    id: "e2d8eca3-bc2f-4056-b92f-29e4739791f0",
    eventName: "New Year's Day (Shogatsu)",
    eventType: "holiday",
    city: "tokyo",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-03"),
    crowdImpact: "extreme",
    priceImpact: "surge",
    crowdImpactPercent: 80,
    description: "Japan's most important holiday, marked by family gatherings, temple visits, and traditional rituals. Many businesses and attractions are closed.",
    affectedAreas: ["Meiji Jingu Shrine", "Senso-ji Temple", "Shinjuku", "Harajuku"],
    tips: ["Book accommodations early as hotels fill up quickly", "Expect crowded temples and shrines for Hatsumode (first shrine visit)", "Public transport operates on holiday schedules"],
    source: "grok",
  },
  {
    id: "3bc773f3-e9fe-4612-95c3-54e7d3d6ccb9",
    eventName: "Coming of Age Day (Seijin no Hi)",
    eventType: "holiday",
    city: "tokyo",
    startDate: new Date("2026-01-12"),
    endDate: new Date("2026-01-12"),
    crowdImpact: "moderate",
    priceImpact: "normal",
    crowdImpactPercent: 30,
    description: "A national holiday celebrating young adults turning 20, with ceremonies at local shrines and public venues. Many wear traditional kimonos.",
    affectedAreas: ["Meiji Jingu Shrine", "Harajuku", "Shibuya"],
    tips: ["Avoid major shrines during peak ceremony hours", "Great opportunity to see traditional Japanese attire in public"],
    source: "grok",
  },
  {
    id: "49a97b4c-2538-4006-bdef-2ca05dd962ec",
    eventName: "Setsubun (Bean-Throwing Festival)",
    eventType: "cultural",
    city: "tokyo",
    startDate: new Date("2026-02-03"),
    endDate: new Date("2026-02-03"),
    crowdImpact: "moderate",
    priceImpact: "normal",
    crowdImpactPercent: 25,
    description: "A traditional event marking the start of spring, involving bean-throwing ceremonies to drive away evil spirits, held at temples and shrines.",
    affectedAreas: ["Senso-ji Temple", "Zojo-ji Temple", "Kanda Myojin Shrine"],
    tips: ["Arrive early for ceremonies as space is limited", "Be prepared for loud chants and crowded temple grounds"],
    source: "grok",
  },
  {
    id: "07c4ae41-4812-4891-abc4-a1cac0242cb3",
    eventName: "National Foundation Day (Kenkoku Kinen no Hi)",
    eventType: "holiday",
    city: "tokyo",
    startDate: new Date("2026-02-11"),
    endDate: new Date("2026-02-11"),
    crowdImpact: "low",
    priceImpact: "normal",
    crowdImpactPercent: 10,
    description: "A national holiday commemorating the founding of Japan. Many locals take the day off, but major tourist activities remain unaffected.",
    affectedAreas: ["General Tokyo Area"],
    tips: ["Minimal impact on travel plans, but some government offices and businesses may be closed"],
    source: "grok",
  },
  {
    id: "049d5303-734d-406f-9722-88ac9aefa7e9",
    eventName: "Tokyo Marathon",
    eventType: "sporting",
    city: "tokyo",
    startDate: new Date("2026-03-01"),
    endDate: new Date("2026-03-01"),
    crowdImpact: "high",
    priceImpact: "higher",
    crowdImpactPercent: 50,
    description: "One of the world's largest marathons, attracting thousands of runners and spectators. Major roads are closed for the event.",
    affectedAreas: ["Shinjuku", "Tokyo Station", "Ginza", "Asakusa"],
    tips: ["Avoid driving or planning travel along the marathon route", "Book hotels early as demand spikes", "Check public transport updates for disruptions"],
    source: "grok",
  },
  {
    id: "b0f4b4d5-f535-4285-903e-0445758f7cad",
    eventName: "Paris Carnival",
    eventType: "festival",
    city: "paris",
    startDate: new Date("2026-02-15"),
    endDate: new Date("2026-02-15"),
    crowdImpact: "moderate",
    priceImpact: "normal",
    crowdImpactPercent: 20,
    description: "A vibrant street parade celebrating Carnival with costumes, music, and dance, typically held before Lent.",
    affectedAreas: ["Central Paris", "Place de la République"],
    tips: ["Expect road closures in central areas", "Book accommodations early if staying near parade routes"],
    source: "grok",
  },
  {
    id: "c3cb7f59-d4b7-48d0-9de3-eb559bcef5b0",
    eventName: "Valentine's Day",
    eventType: "holiday",
    city: "paris",
    startDate: new Date("2026-02-14"),
    endDate: new Date("2026-02-14"),
    crowdImpact: "high",
    priceImpact: "higher",
    crowdImpactPercent: 30,
    description: "A popular day for romantic getaways in Paris, with many couples visiting iconic landmarks and dining out.",
    affectedAreas: ["Eiffel Tower", "Montmartre", "Seine River cruises"],
    tips: ["Reserve restaurants and romantic activities well in advance", "Avoid peak times at popular spots like the Eiffel Tower"],
    source: "grok",
  },
  {
    id: "2d01ba47-6260-4f2d-b752-fec5a8920097",
    eventName: "Paris Fashion Week (Autumn/Winter)",
    eventType: "cultural",
    city: "paris",
    startDate: new Date("2026-02-23"),
    endDate: new Date("2026-03-03"),
    crowdImpact: "moderate",
    priceImpact: "higher",
    crowdImpactPercent: 15,
    description: "One of the biggest fashion events globally, attracting designers, models, and media to showcase Autumn/Winter collections.",
    affectedAreas: ["Palais de Tokyo", "Louvre Area", "Champs-Élysées"],
    tips: ["Expect increased traffic near event venues", "Hotel prices may rise in upscale districts"],
    source: "grok",
  },
];

const liveActivityData = [
  {
    id: "cbd7e15c-9bc4-495c-8b1b-949dd265c7d7",
    city: "Tokyo",
    placeName: "Shibuya Crossing",
    activityType: "check_in",
    activityText: "just checked in at the world's busiest intersection",
    activityEmoji: "📍",
    userName: "Sarah",
    likesCount: 23,
    occurredAt: new Date(),
  },
  {
    id: "683f031c-61bf-4797-8f82-cd6518dd2461",
    city: "Tokyo",
    placeName: "Tsukiji Outer Market",
    activityType: "discovery",
    activityText: "found the best sushi spot locals won't tell you about",
    activityEmoji: "🍣",
    userName: "Mike",
    likesCount: 45,
    occurredAt: new Date(),
  },
  {
    id: "7e8fafbc-c4c8-43f3-9177-11e7b066f9ae",
    city: "Paris",
    placeName: "Le Marais",
    activityType: "photo",
    activityText: "captured the magic of golden hour",
    activityEmoji: "📸",
    userName: "Emma",
    likesCount: 67,
    occurredAt: new Date(),
  },
  {
    id: "5dbfecc7-086b-4c57-82f3-4dc9ff22a29b",
    city: "Bali",
    placeName: "Tegallalang",
    activityType: "discovery",
    activityText: "discovered a hidden cafe with jungle views",
    activityEmoji: "🌴",
    userName: "Alex",
    likesCount: 34,
    occurredAt: new Date(),
  },
  {
    id: "d3c7ed11-8b3b-4b7e-a3d9-358ebeed24b8",
    city: "New York",
    placeName: "DUMBO",
    activityType: "check_in",
    activityText: "exploring Brooklyn's best views",
    activityEmoji: "🌉",
    userName: "James",
    likesCount: 28,
    occurredAt: new Date(),
  },
  {
    id: "6af966e5-6e6a-433c-a4ff-c24b432d547e",
    city: "Barcelona",
    placeName: "El Born",
    activityType: "review",
    activityText: "best tapas experience of my life!",
    activityEmoji: "🍷",
    userName: "Sofia",
    likesCount: 52,
    occurredAt: new Date(),
  },
];

const hiddenGemsData = [
  {
    id: "d3de71ca-71b0-4681-9630-036d50991001",
    city: "Tokyo",
    country: "Japan",
    placeName: "Yanaka Ginza",
    placeType: "neighborhood",
    localRating: "4.80",
    touristMentions: 120,
    localMentions: 2340,
    gemScore: 92,
    discoveryStatus: "emerging",
    daysUntilMainstream: 45,
    description: "Old-school Tokyo shopping street with authentic local vibe",
    whyLocalsLoveIt: "Time capsule of Showa-era Tokyo with family-run shops",
    bestFor: ["food", "photography", "culture"],
    priceRange: "$",
    imageUrl: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600",
  },
  {
    id: "b93e744a-545d-4865-a20b-68c1c2603d38",
    city: "Tokyo",
    country: "Japan",
    placeName: "Shimokitazawa",
    placeType: "neighborhood",
    localRating: "4.70",
    touristMentions: 450,
    localMentions: 3200,
    gemScore: 85,
    discoveryStatus: "emerging",
    daysUntilMainstream: 30,
    description: "Bohemian neighborhood with vintage shops and live music",
    whyLocalsLoveIt: "Best vintage clothing and indie music scene in Tokyo",
    bestFor: ["shopping", "nightlife", "music"],
    priceRange: "$$",
    imageUrl: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=600",
  },
  {
    id: "43f127a5-b683-45c2-9636-a1157543dcda",
    city: "Paris",
    country: "France",
    placeName: "Canal Saint-Martin",
    placeType: "neighborhood",
    localRating: "4.60",
    touristMentions: 890,
    localMentions: 4500,
    gemScore: 78,
    discoveryStatus: "discovered",
    daysUntilMainstream: 0,
    description: "Trendy canal-side area with hip cafes and boutiques",
    whyLocalsLoveIt: "Best Sunday brunch spots and people-watching",
    bestFor: ["food", "photography", "walks"],
    priceRange: "$$",
    imageUrl: "https://images.unsplash.com/photo-1550340499-a6c60fc8287c?w=600",
  },
  {
    id: "eaac0752-d7b5-41aa-a4d7-8ac18c91226c",
    city: "Bali",
    country: "Indonesia",
    placeName: "Sidemen Valley",
    placeType: "attraction",
    localRating: "4.90",
    touristMentions: 230,
    localMentions: 1800,
    gemScore: 94,
    discoveryStatus: "hidden",
    daysUntilMainstream: 90,
    description: "Untouched rice terraces with Mount Agung views",
    whyLocalsLoveIt: "What Ubud was 20 years ago, zero crowds",
    bestFor: ["nature", "photography", "peace"],
    priceRange: "$",
    imageUrl: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=600",
  },
  {
    id: "d8a7df94-8bd3-43ff-9fa0-3cc78bad14b0",
    city: "New York",
    country: "USA",
    placeName: "Red Hook",
    placeType: "neighborhood",
    localRating: "4.50",
    touristMentions: 340,
    localMentions: 2100,
    gemScore: 83,
    discoveryStatus: "emerging",
    daysUntilMainstream: 60,
    description: "Brooklyn waterfront with art galleries and food vendors",
    whyLocalsLoveIt: "Industrial charm meets foodie heaven",
    bestFor: ["food", "art", "views"],
    priceRange: "$$",
    imageUrl: "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600",
  },
];

const happeningNowData = [
  {
    id: "5f861087-5e45-4678-8916-0d80a39b58d8",
    city: "Tokyo",
    eventType: "festival",
    title: "Sakura Light-Up at Meguro River",
    description: "Evening illumination of cherry blossoms along the river",
    venue: "Meguro River",
    crowdLevel: "packed",
    entryFee: "Free",
    isLive: true,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
  },
  {
    id: "077dd6da-ce72-4062-892d-3a117a6bab83",
    city: "Paris",
    eventType: "market",
    title: "Marché aux Puces de Vanves",
    description: "Authentic Parisian flea market with antiques",
    venue: "Avenue Marc Sangnier",
    crowdLevel: "moderate",
    entryFee: "Free",
    isLive: true,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  },
  {
    id: "d960db4e-b061-4505-afdf-d27b0eecf809",
    city: "Barcelona",
    eventType: "performance",
    title: "Street Performance at La Boqueria",
    description: "Local flamenco dancers performing",
    venue: "La Boqueria Market",
    crowdLevel: "busy",
    entryFee: "Free",
    isLive: true,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
  },
];

export async function seedTravelPulseData(): Promise<{ created: number }> {
  let created = 0;

  try {
    for (const event of calendarEventsData) {
      const existing = await db.select().from(travelPulseCalendarEvents).where(eq(travelPulseCalendarEvents.id, event.id));
      if (existing.length === 0) {
        await db.insert(travelPulseCalendarEvents).values(event);
        created++;
      }
    }

    for (const activity of liveActivityData) {
      const existing = await db.select().from(travelPulseLiveActivity).where(eq(travelPulseLiveActivity.id, activity.id));
      if (existing.length === 0) {
        await db.insert(travelPulseLiveActivity).values(activity);
        created++;
      }
    }

    for (const gem of hiddenGemsData) {
      const existing = await db.select().from(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.id, gem.id));
      if (existing.length === 0) {
        await db.insert(travelPulseHiddenGems).values(gem);
        created++;
      }
    }

    for (const event of happeningNowData) {
      const existing = await db.select().from(travelPulseHappeningNow).where(eq(travelPulseHappeningNow.id, event.id));
      if (existing.length === 0) {
        await db.insert(travelPulseHappeningNow).values(event);
        created++;
      }
    }

    if (created > 0) {
      logger.info({ created }, "Seeded TravelPulse data");
    }
  } catch (error) {
    logger.error({ error }, "Failed to seed TravelPulse data");
    throw error;
  }

  return { created };
}
