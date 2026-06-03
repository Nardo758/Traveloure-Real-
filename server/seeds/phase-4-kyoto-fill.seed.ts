#!/usr/bin/env tsx

/**
 * Phase 4: Blended network fill for Kyoto neighborhoods (v2 spec §10).
 *
 * Populates travel_pulse_hidden_gems and provider_services with Kyoto data,
 * tagged with the correct neighborhood slugs. This turns the NeighborhoodCard
 * counts from 0/0 to real numbers, demonstrating Phase 3's renderers against
 * actual content.
 *
 * Idempotent: tags by (city, place_name, slug) for gems and (user_id, slug)
 * for services, skipping existing rows.
 *
 * Run: `tsx server/seeds/phase-4-kyoto-fill.seed.ts`
 */

import { db } from "../db";
import { travelPulseHiddenGems, providerServices } from "@shared/schema";
import { and, eq } from "drizzle-orm";

interface GemSeed {
  placeName: string;
  placeType: string;
  description: string;
  whyLocalsLoveIt: string;
  priceRange: string;
  neighborhood: string;
  city: string;
  latitude?: string;
  longitude?: string;
}

interface ServiceSeed {
  serviceName: string;
  description: string;
  neighborhood: string;
  priceMin?: number;
  priceMax?: number;
}

// Kyoto gems distributed across neighborhoods (realistic sample)
const KYOTO_GEMS: GemSeed[] = [
  // Gion (historic geisha district)
  {
    placeName: "Gion Corner (Gion-Kaburenjo)",
    placeType: "cultural",
    description: "Traditional geisha performance venue showcasing traditional arts",
    whyLocalsLoveIt: "Authentic cultural experience without the tourist crush of peak hours",
    priceRange: "$$",
    neighborhood: "gion",
    city: "Kyoto",
    latitude: "35.0036",
    longitude: "135.7752",
  },
  {
    placeName: "Hanami Koji Street",
    placeType: "street",
    description: "Atmospheric lane lined with wooden machiya teahouses and geisha bars",
    whyLocalsLoveIt: "Quintessential Kyoto evening wandering, best at dusk",
    priceRange: "$$",
    neighborhood: "gion",
    city: "Kyoto",
  },

  // Higashiyama (eastern hills)
  {
    placeName: "Kiyomizu-dera Temple",
    placeType: "temple",
    description: "UNESCO-listed Buddhist temple with wooden stage overlooking the city",
    whyLocalsLoveIt: "Less crowded early morning visits reveal genuine sacred atmosphere",
    priceRange: "$",
    neighborhood: "higashiyama",
    city: "Kyoto",
    latitude: "34.9985",
    longitude: "135.7800",
  },
  {
    placeName: "Sannenzaka Shopping Street",
    placeType: "shopping",
    description: "Historic stone-paved street with traditional craft shops and cafes",
    whyLocalsLoveIt: "Finds authentic souvenirs beyond the souvenir shops",
    priceRange: "$$",
    neighborhood: "higashiyama",
    city: "Kyoto",
  },

  // Arashiyama (bamboo grove)
  {
    placeName: "Arashiyama Bamboo Grove",
    placeType: "nature",
    description: "Iconic bamboo forest paths with serene atmosphere",
    whyLocalsLoveIt: "Visit before 8am to experience with few tourists",
    priceRange: "$",
    neighborhood: "arashiyama",
    city: "Kyoto",
    latitude: "35.0094",
    longitude: "135.6669",
  },
  {
    placeName: "Togetsukyo Bridge",
    placeType: "landmark",
    description: "Scenic arched wooden bridge spanning the Hozu River",
    whyLocalsLoveIt: "Perfect photo spot that also feels intimate and peaceful",
    priceRange: "$",
    neighborhood: "arashiyama",
    city: "Kyoto",
  },

  // Pontocho (riverside alley)
  {
    placeName: "Pontocho Alley",
    placeType: "cultural",
    description: "Narrow historic alley along the Kamo River with riverside dining",
    whyLocalsLoveIt: "Summer riverside seating (kawayuka) is uniquely atmospheric",
    priceRange: "$$$",
    neighborhood: "pontocho",
    city: "Kyoto",
    latitude: "35.0080",
    longitude: "135.7707",
  },

  // Kyoto Station Area
  {
    placeName: "Kyoto Tower",
    placeType: "landmark",
    description: "Modern observation tower with 360-degree city views",
    whyLocalsLoveIt: "Locals know the less-crowded afternoon visits offer better photography",
    priceRange: "$$",
    neighborhood: "kyoto-station",
    city: "Kyoto",
    latitude: "34.9858",
    longitude: "135.7588",
  },

  // Nishijin (textile district)
  {
    placeName: "Nishijin Textile Museum",
    placeType: "museum",
    description: "Museum showcasing Kyoto's famous silk weaving tradition",
    whyLocalsLoveIt: "Quiet cultural space away from mainstream tourist routes",
    priceRange: "$",
    neighborhood: "nishijin",
    city: "Kyoto",
    latitude: "35.0319",
    longitude: "135.7472",
  },

  // Kawaramachi / Sanjo
  {
    placeName: "Nishiki Market",
    placeType: "market",
    description: "Historic covered market with food stalls and specialty shops",
    whyLocalsLoveIt: "Early morning visits capture the market's authentic rhythm",
    priceRange: "$$",
    neighborhood: "kawaramachi-sanjo",
    city: "Kyoto",
    latitude: "35.0094",
    longitude: "135.7681",
  },

  // Fushimi (southern Kyoto)
  {
    placeName: "Fushimi Inari Shrine",
    placeType: "shrine",
    description: "Iconic shrine with thousands of vermillion torii gates winding up the mountain",
    whyLocalsLoveIt: "Night visits reveal the spiritual essence without daytime crowds",
    priceRange: "$",
    neighborhood: "fushimi",
    city: "Kyoto",
    latitude: "34.9671",
    longitude: "135.7726",
  },
];

// Provider services distributed across neighborhoods
const KYOTO_SERVICES: ServiceSeed[] = [
  {
    serviceName: "Gion Walking Tour with Photographer",
    description: "Guided photography tour through Gion's atmospheric lanes with geisha expert",
    neighborhood: "gion",
    priceMin: 150,
    priceMax: 250,
  },
  {
    serviceName: "Temple Meditation Session",
    description: "Early morning meditation with Buddhist monks in Higashiyama temples",
    neighborhood: "higashiyama",
    priceMin: 60,
    priceMax: 100,
  },
  {
    serviceName: "Arashiyama Bamboo & Tea Ceremony",
    description: "Guided bamboo forest walk followed by traditional tea ceremony",
    neighborhood: "arashiyama",
    priceMin: 120,
    priceMax: 180,
  },
  {
    serviceName: "Pontocho Riverside Dining Reservation Service",
    description: "VIP reservation and guided dining experience along the Kamo River",
    neighborhood: "pontocho",
    priceMin: 200,
    priceMax: 400,
  },
  {
    serviceName: "Nishiki Market Food Tour",
    description: "Local food expert guide through market with sake and specialty tastings",
    neighborhood: "kawaramachi-sanjo",
    priceMin: 100,
    priceMax: 160,
  },
  {
    serviceName: "Fushimi Sake Brewery Tour",
    description: "Tour of traditional sake breweries with tasting and artisan interviews",
    neighborhood: "fushimi",
    priceMin: 80,
    priceMax: 140,
  },
];

export async function seedPhase4KyotoFill(): Promise<{
  gemsInserted: number;
  gemsSkipped: number;
  servicesInserted: number;
  servicesSkipped: number;
}> {
  let gemsInserted = 0;
  let gemsSkipped = 0;
  let servicesInserted = 0;
  let servicesSkipped = 0;

  console.log("[Phase 4] Seeding Kyoto hidden gems with neighborhood tags...");

  for (const gem of KYOTO_GEMS) {
    const existing = await db
      .select({ id: travelPulseHiddenGems.id })
      .from(travelPulseHiddenGems)
      .where(
        and(
          eq(travelPulseHiddenGems.city, gem.city),
          eq(travelPulseHiddenGems.placeName, gem.placeName),
          eq(travelPulseHiddenGems.neighborhood, gem.neighborhood),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      gemsSkipped++;
      continue;
    }

    await db.insert(travelPulseHiddenGems).values({
      city: gem.city,
      placeName: gem.placeName,
      placeType: gem.placeType,
      description: gem.description,
      whyLocalsLoveIt: gem.whyLocalsLoveIt,
      priceRange: gem.priceRange,
      neighborhood: gem.neighborhood,
      latitude: gem.latitude ? gem.latitude : null,
      longitude: gem.longitude ? gem.longitude : null,
    });
    gemsInserted++;
  }

  console.log(
    `[Phase 4] Gems: ${gemsInserted} inserted, ${gemsSkipped} already present.`,
  );

  // For services, we'd need a user ID from the provider. For now, seed with a test user.
  // In production, these would be created by actual provider accounts.
  console.log("[Phase 4] Seeding Kyoto provider services with neighborhood tags...");

  // Use a placeholder provider user ID (in practice this would come from actual provider accounts)
  const DEMO_PROVIDER_USER_ID = "demo-provider-kyoto-001";

  for (const service of KYOTO_SERVICES) {
    const existing = await db
      .select({ id: providerServices.id })
      .from(providerServices)
      .where(
        and(
          eq(providerServices.userId, DEMO_PROVIDER_USER_ID),
          eq(providerServices.serviceName, service.serviceName),
          eq(providerServices.neighborhood, service.neighborhood),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      servicesSkipped++;
      continue;
    }

    await db.insert(providerServices).values({
      userId: DEMO_PROVIDER_USER_ID,
      serviceName: service.serviceName,
      shortDescription: service.description.substring(0, 150),
      description: service.description,
      serviceType: "experience",
      price: service.priceMin ? String(service.priceMin) : null,
      priceType: "variable",
      neighborhood: service.neighborhood,
      deliveryMethod: "in_person",
    });
    servicesInserted++;
  }

  console.log(
    `[Phase 4] Services: ${servicesInserted} inserted, ${servicesSkipped} already present.`,
  );

  return {
    gemsInserted,
    gemsSkipped,
    servicesInserted,
    servicesSkipped,
  };
}

// CLI entry — only when invoked directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedPhase4KyotoFill()
    .then(({ gemsInserted, gemsSkipped, servicesInserted, servicesSkipped }) => {
      console.log(
        `[Phase 4] Fill complete: ${gemsInserted} gems, ${servicesInserted} services inserted.`,
      );
      console.log(
        `[Phase 4] Skipped: ${gemsSkipped} gems, ${servicesSkipped} services already present.`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Phase 4] Fill failed:", err);
      process.exit(1);
    });
}
