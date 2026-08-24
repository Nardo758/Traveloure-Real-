/**
 * Phase 4b — Seed travel_pulse_cities with a Kyoto row.
 *
 * This populates all 9 AI insight fields required by the §8 Insights section
 * of the LocationView and the hero city-fact block (§1).
 *
 * Idempotent: upserts on (city_name, country). Safe to re-run.
 */

import { db } from "../db";
import { travelPulseCities } from "@shared/schema";
import { and, eq } from "drizzle-orm";

async function seed() {
  console.log("[Phase 4b] Seeding travel_pulse_cities for Kyoto...");

  const existing = await db
    .select({ id: travelPulseCities.id })
    .from(travelPulseCities)
    .where(
      and(
        eq(travelPulseCities.cityName, "Kyoto"),
        eq(travelPulseCities.country, "Japan"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    console.log("[Phase 4b] Kyoto row already present — updating AI fields.");
    await db
      .update(travelPulseCities)
      .set({
        pulseScore: 88,
        crowdLevel: "moderate",
        vibeTags: ["cultural", "romantic", "foodie", "nature", "relaxation"] as any,
        currentHighlight: "Cherry blossom season transforms ancient temple gardens",
        highlightEmoji: "🌸",
        totalHiddenGems: 35,
        lastRefreshStatus: "ok",
        aiGeneratedAt: new Date(),
        aiSourceModel: "seed-v1",
        aiBestTimeToVisit:
          "March–May for cherry blossoms and mild weather; October–November for vibrant autumn foliage. Both periods offer the most photogenic scenery at Maruyama Park, Philosopher's Path, and Arashiyama.",
        aiOptimalDuration: "4–6 days",
        aiBudgetEstimate: {
          budget: "¥8,000–¥12,000/day (hostels, convenience stores, free temples)",
          midRange: "¥18,000–¥30,000/day (ryokan, kaiseki lunch, guided tours)",
          luxury: "¥60,000+/day (top ryokan, private tea ceremony, Michelin dining)",
        } as any,
        aiMustSeeAttractions: [
          "Fushimi Inari Shrine — thousands of vermilion torii gates stretching up Mt. Inari",
          "Kinkaku-ji (Golden Pavilion) — Zen temple reflected in Mirror Pond",
          "Arashiyama Bamboo Grove — ethereal morning walk through towering bamboo",
          "Gion District — preserved machiya townhouses and geiko sightings at dusk",
          "Kiyomizu-dera Temple — wooden stage cantilevered over forested hillside",
          "Nishiki Market — narrow 'Kyoto's Kitchen' market lane with pickles, tofu, and street food",
          "Philosopher's Path — canal-side stone walkway lined with 500 cherry trees",
          "Nijo Castle — feudal shogun palace with 'nightingale floors'",
        ] as any,
        aiTravelTips: [
          "Buy an IC card (ICOCA) on arrival — covers all buses, subway, and JR lines inside Kyoto",
          "Rent a bicycle for the flat city center; Arashiyama and Fushimi are easy rides",
          "Arrive at Fushimi Inari before 7 am or after 6 pm to avoid tour groups on the main gate path",
          "Gion Matsuri runs all of July — book accommodation 3+ months ahead",
          "Many temples close by 5 pm; plan temple days early and save evenings for Pontocho dining",
          "Pocket Wi-Fi or SIM is essential — Google Maps is your best transit companion here",
          "Wear comfortable walking shoes; stone paths and steps are everywhere",
          "Carry cash — many traditional ryokan, small restaurants, and craft shops are cash-only",
        ] as any,
        aiLocalInsights:
          "Kyoto rewards slow travel. The city's 1,600+ temples and shrines can feel overwhelming; locals suggest anchoring to a single neighborhood each day rather than rushing between landmarks. Neighbourhoods like Nishijin are still largely tourist-free — morning walks there reveal real Kyoto life: tofu shops, textile weavers, and age-old bakeries. Kyoto taxi drivers are famously courteous and knowledgeable; a short taxi ride with a veteran driver often doubles as a free city tour. The local whisky bar scene along Kiyamachi is world-class and mostly unknown outside Japan.",
        aiSafetyNotes:
          "Kyoto is exceptionally safe — one of Japan's lowest crime-rate cities. Standard precautions apply: watch belongings on crowded festival days, stay on designated paths in forested shrine areas after dark. Summer typhoon season (July–September) occasionally disrupts transport; check JMA forecasts. The main risk for tourists is heat exhaustion in July–August when temperatures reach 38°C with high humidity — carry water and use the shaded arcade streets (shotengai).",
        aiSeasonalHighlights: [
          { month: "March", rating: 9, highlight: "Early plum blossoms at Kitano Tenmangu" },
          { month: "April", rating: 10, highlight: "Peak cherry blossoms — Maruyama Park, Philosopher's Path, Arashiyama" },
          { month: "May", rating: 8, highlight: "Aoi Matsuri procession and vivid fresh greenery" },
          { month: "June", rating: 6, highlight: "Hydrangea bloom at Mimuroto-ji; rainy season begins" },
          { month: "July", rating: 7, highlight: "Gion Matsuri — Japan's most famous summer festival" },
          { month: "August", rating: 6, highlight: "Daimonji bonfire on Aug 16; hot but festive" },
          { month: "September", rating: 7, highlight: "Typhoon shoulder month; crowds thin, prices drop" },
          { month: "October", rating: 9, highlight: "Early autumn colour; Kurama Fire Festival" },
          { month: "November", rating: 10, highlight: "Peak koyo (autumn leaves) — Eikan-do, Tofuku-ji, Arashiyama" },
          { month: "December", rating: 7, highlight: "Winter illuminations at Kodai-ji and Shorenin" },
          { month: "January", rating: 6, highlight: "Quiet off-season; temples serene in frost" },
          { month: "February", rating: 7, highlight: "Ume (plum) blossoms; Setsubun bean-throwing at Yoshida Shrine" },
        ] as any,
        aiAvoidDates: [
          {
            dateRange: "Golden Week (Apr 29 – May 5)",
            reason: "Domestic tourism peaks — queues of 2+ hours at top temples, hotels 3× normal price",
          },
          {
            dateRange: "Obon week (Aug 13–16)",
            reason: "Mass domestic travel; Kyoto train stations and highways severely congested",
          },
          {
            dateRange: "Late November weekends",
            reason: "Peak autumn foliage weekends draw 500k+ day-trippers; Arashiyama and Tofuku-ji nearly impassable",
          },
          {
            dateRange: "Jan 1–3 (Oshogatsu)",
            reason: "Most restaurants, shops, and local services closed; shrine queues can be very long",
          },
        ] as any,
      })
      .where(eq(travelPulseCities.id, existing[0].id));

    console.log("[Phase 4b] Kyoto AI fields updated.");
    return;
  }

  await db.insert(travelPulseCities).values({
    cityName: "Kyoto",
    country: "Japan",
    countryCode: "JP",
    region: "Kansai",
    timezone: "Asia/Tokyo",
    latitude: "35.0116",
    longitude: "135.7681",
    pulseScore: 88,
    activeTravelers: 12400,
    trendingScore: 92,
    crowdLevel: "moderate",
    vibeTags: ["cultural", "romantic", "foodie", "nature", "relaxation"] as any,
    currentHighlight: "Cherry blossom season transforms ancient temple gardens",
    highlightEmoji: "🌸",
    currentWeather: { condition: "Partly Cloudy", tempC: 22, humidity: 65 } as any,
    weatherScore: 78,
    avgHotelPrice: "18500",
    priceChange: "-3.2",
    priceTrend: "down",
    dealAlert: "Shoulder season savings — hotel rates 15% below peak",
    totalTrendingSpots: 24,
    totalHiddenGems: 35,
    totalAlerts: 2,
    imageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1600",
    thumbnailUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400",
    lastRefreshStatus: "ok",
    aiGeneratedAt: new Date(),
    aiSourceModel: "seed-v1",
    aiBestTimeToVisit:
      "March–May for cherry blossoms and mild weather; October–November for vibrant autumn foliage. Both periods offer the most photogenic scenery at Maruyama Park, Philosopher's Path, and Arashiyama.",
    aiOptimalDuration: "4–6 days",
    aiBudgetEstimate: {
      budget: "¥8,000–¥12,000/day (hostels, convenience stores, free temples)",
      midRange: "¥18,000–¥30,000/day (ryokan, kaiseki lunch, guided tours)",
      luxury: "¥60,000+/day (top ryokan, private tea ceremony, Michelin dining)",
    } as any,
    aiMustSeeAttractions: [
      "Fushimi Inari Shrine — thousands of vermilion torii gates stretching up Mt. Inari",
      "Kinkaku-ji (Golden Pavilion) — Zen temple reflected in Mirror Pond",
      "Arashiyama Bamboo Grove — ethereal morning walk through towering bamboo",
      "Gion District — preserved machiya townhouses and geiko sightings at dusk",
      "Kiyomizu-dera Temple — wooden stage cantilevered over forested hillside",
      "Nishiki Market — narrow 'Kyoto's Kitchen' market lane with pickles, tofu, and street food",
      "Philosopher's Path — canal-side stone walkway lined with 500 cherry trees",
      "Nijo Castle — feudal shogun palace with 'nightingale floors'",
    ] as any,
    aiTravelTips: [
      "Buy an IC card (ICOCA) on arrival — covers all buses, subway, and JR lines inside Kyoto",
      "Rent a bicycle for the flat city center; Arashiyama and Fushimi are easy rides",
      "Arrive at Fushimi Inari before 7 am or after 6 pm to avoid tour groups on the main gate path",
      "Gion Matsuri runs all of July — book accommodation 3+ months ahead",
      "Many temples close by 5 pm; plan temple days early and save evenings for Pontocho dining",
      "Pocket Wi-Fi or SIM is essential — Google Maps is your best transit companion here",
      "Wear comfortable walking shoes; stone paths and steps are everywhere",
      "Carry cash — many traditional ryokan, small restaurants, and craft shops are cash-only",
    ] as any,
    aiLocalInsights:
      "Kyoto rewards slow travel. The city's 1,600+ temples and shrines can feel overwhelming; locals suggest anchoring to a single neighbourhood each day rather than rushing between landmarks. Neighbourhoods like Nishijin are still largely tourist-free — morning walks there reveal real Kyoto life: tofu shops, textile weavers, and age-old bakeries. Kyoto taxi drivers are famously courteous and knowledgeable; a short taxi ride with a veteran driver often doubles as a free city tour. The local whisky bar scene along Kiyamachi is world-class and mostly unknown outside Japan.",
    aiSafetyNotes:
      "Kyoto is exceptionally safe — one of Japan's lowest crime-rate cities. Standard precautions apply: watch belongings on crowded festival days, stay on designated paths in forested shrine areas after dark. Summer typhoon season (July–September) occasionally disrupts transport; check JMA forecasts. The main risk for tourists is heat exhaustion in July–August when temperatures reach 38°C with high humidity — carry water and use the shaded arcade streets (shotengai).",
    aiSeasonalHighlights: [
      { month: "March", rating: 9, highlight: "Early plum blossoms at Kitano Tenmangu" },
      { month: "April", rating: 10, highlight: "Peak cherry blossoms — Maruyama Park, Philosopher's Path, Arashiyama" },
      { month: "May", rating: 8, highlight: "Aoi Matsuri procession and vivid fresh greenery" },
      { month: "June", rating: 6, highlight: "Hydrangea bloom at Mimuroto-ji; rainy season begins" },
      { month: "July", rating: 7, highlight: "Gion Matsuri — Japan's most famous summer festival" },
      { month: "August", rating: 6, highlight: "Daimonji bonfire on Aug 16; hot but festive" },
      { month: "September", rating: 7, highlight: "Typhoon shoulder month; crowds thin, prices drop" },
      { month: "October", rating: 9, highlight: "Early autumn colour; Kurama Fire Festival" },
      { month: "November", rating: 10, highlight: "Peak koyo (autumn leaves) — Eikan-do, Tofuku-ji, Arashiyama" },
      { month: "December", rating: 7, highlight: "Winter illuminations at Kodai-ji and Shorenin" },
      { month: "January", rating: 6, highlight: "Quiet off-season; temples serene in frost" },
      { month: "February", rating: 7, highlight: "Ume (plum) blossoms; Setsubun bean-throwing at Yoshida Shrine" },
    ] as any,
    aiAvoidDates: [
      {
        dateRange: "Golden Week (Apr 29 – May 5)",
        reason: "Domestic tourism peaks — queues of 2+ hours at top temples, hotels 3× normal price",
      },
      {
        dateRange: "Obon week (Aug 13–16)",
        reason: "Mass domestic travel; Kyoto train stations and highways severely congested",
      },
      {
        dateRange: "Late November weekends",
        reason: "Peak autumn foliage weekends draw 500k+ day-trippers; Arashiyama and Tofuku-ji nearly impassable",
      },
      {
        dateRange: "Jan 1–3 (Oshogatsu)",
        reason: "Most restaurants, shops, and local services closed; shrine queues can be very long",
      },
    ] as any,
  });

  console.log("[Phase 4b] Kyoto city intelligence row inserted.");
}

seed()
  .then(() => {
    console.log("[Phase 4b] Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Phase 4b] Error:", err);
    process.exit(1);
  });
