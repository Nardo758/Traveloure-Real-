import { displayTrendScore } from "@shared/trend-display";
import { trendScoreMaxAgeHours } from "../config/trend-display.config";
import { db } from "../db";
import {
  travelPulseTrending,
  travelPulseLiveScores,
  travelPulseTruthChecks,
  travelPulseCrowdForecasts,
  travelPulseCalendarEvents,
  travelPulseCities,
  travelPulseHiddenGems,
  travelPulseLiveActivity,
  travelPulseCityAlerts,
  travelPulseHappeningNow,
  trips,
  destinationSeasons,
  destinationEvents,
  destinationMetricsHistory,
  TravelPulseTrending,
  TravelPulseTruthCheck,
  TravelPulseCalendarEvent,
  TravelPulseCity,
  TravelPulseHiddenGem,
  TravelPulseLiveActivity,
  TravelPulseCityAlert,
  TravelPulseHappeningNow,
  DestinationSeason,
  DestinationEvent,
} from "@shared/schema";
import { eq, and, gte, lte, desc, asc, sql, isNull, lt, inArray } from "drizzle-orm";
import { trendEntities, trendScores } from "@shared/schema";
import { OPERATING_MARKETS } from "./trend-engine/operating-markets";
import { CONFIDENCE_FLOOR } from "./trend-engine/trend-score.service";
import crypto from "crypto";


export class TravelPulseService {
  async getTrendingDestinations(city: string, limit: number = 10): Promise<TravelPulseTrending[]> {
    const cached = await db
      .select()
      .from(travelPulseTrending)
      .where(
        and(
          eq(travelPulseTrending.city, city.toLowerCase()),
          gte(travelPulseTrending.expiresAt, new Date())
        )
      )
      .orderBy(desc(travelPulseTrending.trendScore))
      .limit(limit);

    if (cached.length > 0) {
      return cached;
    }

    // TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`): CACHE READ ONLY. The Grok fill on
    // a miss and its `travel_pulse_trending` writer are deleted; an empty cache is an honest [] .
    return cached;
  }


  async getTruthCheck(query: string, city?: string): Promise<TravelPulseTruthCheck | null> {
    const normalized = query.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
    const queryHash = crypto.createHash("md5").update(normalized).digest("hex");

    const cached = await db
      .select()
      .from(travelPulseTruthChecks)
      .where(
        and(
          eq(travelPulseTruthChecks.queryHash, queryHash),
          gte(travelPulseTruthChecks.expiresAt, new Date())
        )
      )
      .limit(1);

    if (cached.length > 0) {
      await db
        .update(travelPulseTruthChecks)
        .set({
          hitCount: (cached[0].hitCount || 0) + 1,
          lastAccessedAt: new Date(),
        })
        .where(eq(travelPulseTruthChecks.id, cached[0].id));
      return cached[0];
    }

    // TravelPulse PR 1: no Grok "verdict" on a miss, and no invented 50/25/25 default either —
    // nothing stored ⇒ null (§13). The routes answer "no traveler data yet".
    void city;
    return null;
  }


  async getCalendarEvents(
    city: string,
    startDate: Date,
    endDate: Date
  ): Promise<TravelPulseCalendarEvent[]> {
    const cached = await db
      .select()
      .from(travelPulseCalendarEvents)
      .where(
        and(
          eq(travelPulseCalendarEvents.city, city.toLowerCase()),
          gte(travelPulseCalendarEvents.startDate, startDate.toISOString().split("T")[0]),
          lte(travelPulseCalendarEvents.startDate, endDate.toISOString().split("T")[0])
        )
      )
      .orderBy(travelPulseCalendarEvents.startDate);

    if (cached.length > 0) {
      return cached;
    }

    // TravelPulse PR 1: no Grok-invented events on a miss — the stored rows or none.
    return cached;
  }


  async getDestinationIntelligence(destinationName: string, city: string) {
    const trending = await db
      .select()
      .from(travelPulseTrending)
      .where(
        and(
          eq(travelPulseTrending.destinationName, destinationName),
          eq(travelPulseTrending.city, city.toLowerCase())
        )
      )
      .limit(1);

    if (trending.length > 0) {
      return trending[0];
    }

    // TravelPulse PR 1: no on-demand Grok call on a cache miss (the audit found this public route
    // calling xAI per request). Nothing stored ⇒ nothing claimed (§13); the route answers 404.
    return null;
  }

  async getLiveScore(entityName: string, city: string) {
    const cached = await db
      .select()
      .from(travelPulseLiveScores)
      .where(
        and(
          eq(travelPulseLiveScores.entityName, entityName),
          eq(travelPulseLiveScores.city, city.toLowerCase()),
          gte(travelPulseLiveScores.validUntil, new Date())
        )
      )
      .limit(1);

    if (cached.length > 0) {
      return cached[0];
    }

    // TravelPulse PR 1: no on-demand Grok sentiment "score" on a cache miss — it was a model's
    // guess presented as live data. Nothing stored ⇒ null; the route answers 404.
    return null;
  }

  // ============================================
  // CITY-LEVEL INTELLIGENCE METHODS
  // ============================================

  /** The resolver's newest score per market key (`trend_scores` joined to its market entity). */
  private async loadResolverScores(): Promise<Map<string, { score: number | null; confidence: number; computedAt: Date | null; whyText: string | null }>> {
    const resolverRows = await db
      .select({
        internalId: trendEntities.internalId,
        trendScore: trendScores.trendScore,
        trendConfidence: trendScores.trendConfidence,
        computedAt: trendScores.computedAt,
        whyText: trendScores.whyText,
      })
      .from(trendEntities)
      .leftJoin(trendScores, eq(trendScores.trendEntityId, trendEntities.id))
      .where(eq(trendEntities.entityType, "market"));
    return new Map(
      resolverRows.map(r => [
        r.internalId,
        {
          score: r.trendScore != null ? parseFloat(r.trendScore) : null,
          confidence: r.trendConfidence != null ? parseFloat(r.trendConfidence) : 0,
          computedAt: r.computedAt ?? null,
          whyText: r.whyText ?? null,
        },
      ]),
    );
  }

  /**
   * The Trend number a PUBLIC surface may show for one city — the resolver's, through the ONE
   * display rule (ranked, above the floor, fresh). `null` = show nothing, never 0 (TravelPulse PR 1).
   */
  async resolverTrendForCity(cityName: string): Promise<number | null> {
    const market = OPERATING_MARKETS.find(m => m.cityName.toLowerCase() === cityName.toLowerCase());
    if (!market) return null;
    const rd = (await this.loadResolverScores()).get(market.marketKey) ?? null;
    return displayTrendScore(rd, { confidenceFloor: CONFIDENCE_FLOOR, maxAgeHours: trendScoreMaxAgeHours() });
  }

  /** The displayed Trend number for every operating market, keyed by lower-cased city name. */
  async resolverTrendsByCity(): Promise<Map<string, number | null>> {
    const scores = await this.loadResolverScores();
    const out = new Map<string, number | null>();
    for (const m of OPERATING_MARKETS) {
      out.set(
        m.cityName.toLowerCase(),
        displayTrendScore(scores.get(m.marketKey) ?? null, { confidenceFloor: CONFIDENCE_FLOOR, maxAgeHours: trendScoreMaxAgeHours() }),
      );
    }
    return out;
  }

  async getTrendingCities(limit: number = 20): Promise<TravelPulseCity[]> {
    // Phase E rewire: rank by the v0 resolver trend_score (trend_scores table),
    // restricted to the 8 operating markets. Below-floor markets (trendConfidence <
    // CONFIDENCE_FLOOR) sort last and receive trendingScore = 0 (no "hot" badge).
    // Legacy callers that pass limit > 8 still work — they just get ≤8 results.

    const operatingCityNames = OPERATING_MARKETS.map(m => m.cityName);

    const resolverMap = await this.loadResolverScores();

    // Fetch travelPulseCities rows for operating markets
    const rows = await db
      .select()
      .from(travelPulseCities)
      .where(inArray(travelPulseCities.cityName, operatingCityNames));

    // Merge resolver data and compute mapped trendingScore
    const withScores = rows.map(city => {
      const market = OPERATING_MARKETS.find(
        m => m.cityName.toLowerCase() === city.cityName.toLowerCase(),
      );
      const rd = market ? resolverMap.get(market.marketKey) : null;
      // ONE derivation for every Trend number (shared/trend-display.ts): ranked, above the floor
      // AND fresh (TravelPulse PR 1 — a score older than the max age shows nothing). Unshown ⇒ 0
      // here, the path the rail already suppresses; the destination page reads the null itself.
      const shown = displayTrendScore(rd ?? null, { confidenceFloor: CONFIDENCE_FLOOR, maxAgeHours: trendScoreMaxAgeHours() });
      const isRanked = shown !== null;
      const trendingScore = shown ?? 0;

      // PR 1: the legacy crowd label and pulse score are NOT spread onto a public row — Crowd
      // returns when PR 2 computes it from `crowd_band_config`; the Trend number has one source.
      const { crowdLevel: _legacyCrowd, pulseScore: _legacyPulse, ...publicCity } = city;
      return {
        ...publicCity,
        trendingScore,
        _resolverScore: rd?.score ?? null,
        _isRanked: isRanked,
      };
    });

    // Sort: ranked markets by resolverScore DESC, then unranked by pulseScore DESC
    withScores.sort((a, b) => {
      if (a._isRanked && b._isRanked) return (b._resolverScore ?? 0) - (a._resolverScore ?? 0);
      if (a._isRanked) return -1;
      if (b._isRanked) return 1;
      return a.cityName.localeCompare(b.cityName);
    });

    return withScores.slice(0, limit) as TravelPulseCity[];
  }

  async getCityByName(cityName: string): Promise<TravelPulseCity | null> {
    const [city] = await db
      .select()
      .from(travelPulseCities)
      .where(eq(travelPulseCities.cityName, cityName))
      .limit(1);

    return city || null;
  }

  async getAllCities(): Promise<TravelPulseCity[]> {
    const cities = await db
      .select()
      .from(travelPulseCities)
      .orderBy(desc(travelPulseCities.pulseScore));

    return cities;
  }

  async getCityIntelligence(cityName: string) {
    const city = await this.getCityByName(cityName);
    if (!city) {
      return null;
    }

    const [hiddenGems, alerts, happeningNow, liveActivity] = await Promise.all([
      this.getHiddenGems(cityName),
      this.getCityAlerts(cityName),
      this.getHappeningNow(cityName),
      this.getLiveActivity(cityName),
    ]);

    // TravelPulse PR 1 (ledger `2026-09-29-travelpulse-hygiene`): the public city projection carries
    // the RESOLVER's Trend number (null ⇒ none shown) and never the legacy, Grok- or seed-written
    // `pulse_score` / `trending_score` / `crowd_level` (trend-engine audit §3). Crowd returns in PR 2.
    const { crowdLevel: _legacyCrowd, pulseScore: _legacyPulse, trendingScore: _legacyTrend, ...publicCity } = city;
    const trendingScore = await this.resolverTrendForCity(city.cityName);
    return {
      city: { ...publicCity, trendingScore },
      hiddenGems,
      alerts,
      // No legacy crowd claim on a happening-now row either (PR 1; returns with PR 2).
      happeningNow: happeningNow.map(({ crowdLevel: _legacyCrowd, ...h }) => h),
      liveActivity,
    };
  }

  async getHiddenGems(city: string, limit: number = 10): Promise<TravelPulseHiddenGem[]> {
    const gems = await db
      .select()
      .from(travelPulseHiddenGems)
      .where(eq(travelPulseHiddenGems.city, city))
      .orderBy(desc(travelPulseHiddenGems.gemScore))
      .limit(limit);

    return gems;
  }

  async getLiveActivity(city: string, limit: number = 20): Promise<TravelPulseLiveActivity[]> {
    const activities = await db
      .select()
      .from(travelPulseLiveActivity)
      .where(eq(travelPulseLiveActivity.city, city))
      .orderBy(desc(travelPulseLiveActivity.occurredAt))
      .limit(limit);

    return activities;
  }

  async getCityAlerts(city: string): Promise<TravelPulseCityAlert[]> {
    const alerts = await db
      .select()
      .from(travelPulseCityAlerts)
      .where(
        and(
          eq(travelPulseCityAlerts.city, city),
          eq(travelPulseCityAlerts.isActive, true)
        )
      )
      .orderBy(desc(travelPulseCityAlerts.createdAt));

    return alerts;
  }

  async getHappeningNow(city: string): Promise<TravelPulseHappeningNow[]> {
    const now = new Date();
    const events = await db
      .select()
      .from(travelPulseHappeningNow)
      .where(
        and(
          eq(travelPulseHappeningNow.city, city),
          lte(travelPulseHappeningNow.startsAt, now)
        )
      )
      .orderBy(desc(travelPulseHappeningNow.startsAt));

    return events;
  }

  async getGlobalLiveActivity(limit: number = 50): Promise<TravelPulseLiveActivity[]> {
    const activities = await db
      .select()
      .from(travelPulseLiveActivity)
      .orderBy(desc(travelPulseLiveActivity.occurredAt))
      .limit(limit);

    return activities;
  }

  // Seed trending cities with demo data
  async seedTrendingCities(): Promise<void> {
    const existingCount = await db.select().from(travelPulseCities).limit(1);
    if (existingCount.length > 0) {
      console.log("Cities already seeded, skipping...");
      return;
    }

    const cities = [
      {
        cityName: "Tokyo",
        country: "Japan",
        countryCode: "JP",
        region: "Asia",
        latitude: "35.6762",
        longitude: "139.6503",
        pulseScore: 95,
        activeTravelers: 12847,
        trendingScore: 92,
        crowdLevel: "busy",
        vibeTags: ["cultural", "foodie", "nightlife", "adventure"],
        currentHighlight: "Cherry Blossom Season",
        highlightEmoji: null,
        weatherScore: 85,
        avgHotelPrice: "245.00",
        priceChange: "-12.5",
        priceTrend: "down",
        dealAlert: "Hotels dropped 12%!",
        totalTrendingSpots: 47,
        totalHiddenGems: 23,
        totalAlerts: 1,
        imageUrl: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400",
      },
      {
        cityName: "Paris",
        country: "France",
        countryCode: "FR",
        region: "Europe",
        latitude: "48.8566",
        longitude: "2.3522",
        pulseScore: 88,
        activeTravelers: 9234,
        trendingScore: 78,
        crowdLevel: "moderate",
        vibeTags: ["romantic", "cultural", "foodie", "luxury"],
        currentHighlight: "Fashion Week",
        highlightEmoji: null,
        weatherScore: 72,
        avgHotelPrice: "320.00",
        priceChange: "8.3",
        priceTrend: "up",
        dealAlert: null,
        totalTrendingSpots: 38,
        totalHiddenGems: 19,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400",
      },
      {
        cityName: "Bali",
        country: "Indonesia",
        countryCode: "ID",
        region: "Asia",
        latitude: "-8.3405",
        longitude: "115.0920",
        pulseScore: 91,
        activeTravelers: 8542,
        trendingScore: 95,
        crowdLevel: "busy",
        vibeTags: ["relaxation", "adventure", "nature", "budget"],
        currentHighlight: "Nyepi Festival Prep",
        highlightEmoji: null,
        weatherScore: 65,
        avgHotelPrice: "89.00",
        priceChange: "-5.2",
        priceTrend: "down",
        dealAlert: "Villa prices at yearly low!",
        totalTrendingSpots: 52,
        totalHiddenGems: 31,
        totalAlerts: 1,
        imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=400",
      },
      {
        cityName: "New York",
        country: "USA",
        countryCode: "US",
        region: "North America",
        latitude: "40.7128",
        longitude: "-74.0060",
        pulseScore: 93,
        activeTravelers: 15623,
        trendingScore: 84,
        crowdLevel: "packed",
        vibeTags: ["nightlife", "cultural", "foodie", "luxury"],
        currentHighlight: "Broadway Season",
        highlightEmoji: null,
        weatherScore: 60,
        avgHotelPrice: "395.00",
        priceChange: "15.2",
        priceTrend: "up",
        dealAlert: null,
        totalTrendingSpots: 63,
        totalHiddenGems: 28,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400",
      },
      {
        cityName: "Barcelona",
        country: "Spain",
        countryCode: "ES",
        region: "Europe",
        latitude: "41.3874",
        longitude: "2.1686",
        pulseScore: 86,
        activeTravelers: 7821,
        trendingScore: 82,
        crowdLevel: "moderate",
        vibeTags: ["cultural", "foodie", "nightlife", "relaxation"],
        currentHighlight: "La Merce Festival",
        highlightEmoji: null,
        weatherScore: 90,
        avgHotelPrice: "185.00",
        priceChange: "-3.8",
        priceTrend: "down",
        dealAlert: "Beach season deals!",
        totalTrendingSpots: 41,
        totalHiddenGems: 25,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=400",
      },
      {
        cityName: "Dubai",
        country: "UAE",
        countryCode: "AE",
        region: "Middle East",
        latitude: "25.2048",
        longitude: "55.2708",
        pulseScore: 89,
        activeTravelers: 11234,
        trendingScore: 88,
        crowdLevel: "busy",
        vibeTags: ["luxury", "adventure", "nightlife", "family"],
        currentHighlight: "Dubai Shopping Festival",
        highlightEmoji: null,
        weatherScore: 78,
        avgHotelPrice: "275.00",
        priceChange: "-18.5",
        priceTrend: "down",
        dealAlert: "5-star hotels 40% off!",
        totalTrendingSpots: 35,
        totalHiddenGems: 12,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=400",
      },
      {
        cityName: "Lisbon",
        country: "Portugal",
        countryCode: "PT",
        region: "Europe",
        latitude: "38.7223",
        longitude: "-9.1393",
        pulseScore: 84,
        activeTravelers: 5432,
        trendingScore: 91,
        crowdLevel: "moderate",
        vibeTags: ["cultural", "foodie", "budget", "romantic"],
        currentHighlight: "Fado Festival Month",
        highlightEmoji: null,
        weatherScore: 88,
        avgHotelPrice: "135.00",
        priceChange: "-7.2",
        priceTrend: "down",
        dealAlert: "Best value in Europe!",
        totalTrendingSpots: 29,
        totalHiddenGems: 34,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=400",
      },
      {
        cityName: "Sydney",
        country: "Australia",
        countryCode: "AU",
        region: "Oceania",
        latitude: "-33.8688",
        longitude: "151.2093",
        pulseScore: 82,
        activeTravelers: 6789,
        trendingScore: 75,
        crowdLevel: "moderate",
        vibeTags: ["adventure", "nature", "relaxation", "nightlife"],
        currentHighlight: "Vivid Sydney Lights",
        highlightEmoji: null,
        weatherScore: 82,
        avgHotelPrice: "225.00",
        priceChange: "4.5",
        priceTrend: "stable",
        dealAlert: null,
        totalTrendingSpots: 33,
        totalHiddenGems: 18,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=400",
      },
      {
        cityName: "Bangkok",
        country: "Thailand",
        countryCode: "TH",
        region: "Asia",
        latitude: "13.7563",
        longitude: "100.5018",
        pulseScore: 87,
        activeTravelers: 9876,
        trendingScore: 86,
        crowdLevel: "busy",
        vibeTags: ["foodie", "budget", "nightlife", "cultural"],
        currentHighlight: "Songkran Preparations",
        highlightEmoji: null,
        weatherScore: 55,
        avgHotelPrice: "65.00",
        priceChange: "-8.9",
        priceTrend: "down",
        dealAlert: "Amazing street food season!",
        totalTrendingSpots: 44,
        totalHiddenGems: 42,
        totalAlerts: 1,
        imageUrl: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400",
      },
      {
        cityName: "Marrakech",
        country: "Morocco",
        countryCode: "MA",
        region: "Africa",
        latitude: "31.6295",
        longitude: "-7.9811",
        pulseScore: 79,
        activeTravelers: 4123,
        trendingScore: 89,
        crowdLevel: "moderate",
        vibeTags: ["cultural", "adventure", "budget", "foodie"],
        currentHighlight: "Ramadan Nights",
        highlightEmoji: null,
        weatherScore: 92,
        avgHotelPrice: "95.00",
        priceChange: "-22.3",
        priceTrend: "down",
        dealAlert: "Riad prices at historic low!",
        totalTrendingSpots: 26,
        totalHiddenGems: 28,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=400",
      },
      {
        cityName: "Rome",
        country: "Italy",
        countryCode: "IT",
        region: "Europe",
        latitude: "41.9028",
        longitude: "12.4964",
        pulseScore: 85,
        activeTravelers: 8234,
        trendingScore: 76,
        crowdLevel: "busy",
        vibeTags: ["cultural", "foodie", "romantic", "luxury"],
        currentHighlight: "Easter Week",
        highlightEmoji: null,
        weatherScore: 85,
        avgHotelPrice: "210.00",
        priceChange: "12.1",
        priceTrend: "up",
        dealAlert: null,
        totalTrendingSpots: 48,
        totalHiddenGems: 21,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400",
      },
      {
        cityName: "Cape Town",
        country: "South Africa",
        countryCode: "ZA",
        region: "Africa",
        latitude: "-33.9249",
        longitude: "18.4241",
        pulseScore: 81,
        activeTravelers: 3567,
        trendingScore: 93,
        crowdLevel: "quiet",
        vibeTags: ["adventure", "nature", "luxury", "foodie"],
        currentHighlight: "Whale Season",
        highlightEmoji: null,
        weatherScore: 88,
        avgHotelPrice: "145.00",
        priceChange: "-15.8",
        priceTrend: "down",
        dealAlert: "Safari + city combo deals!",
        totalTrendingSpots: 31,
        totalHiddenGems: 26,
        totalAlerts: 0,
        imageUrl: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800",
        thumbnailUrl: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=400",
      },
    ];

    for (const city of cities) {
      // Guard: only insert if no row already exists for this (city_name, country) pair.
      // This prevents duplicate rows when seedTrendingCities() runs alongside the
      // JSON-based seedTravelPulseData() path.
      const [existing] = await db
        .select({ id: travelPulseCities.id })
        .from(travelPulseCities)
        .where(
          and(
            eq(travelPulseCities.cityName, city.cityName),
            eq(travelPulseCities.country, city.country)
          )
        )
        .limit(1);
      if (!existing) {
        await db.insert(travelPulseCities).values(city).onConflictDoNothing();
      }
    }

    console.log(`Seeded ${cities.length} trending cities`);

    // Seed hidden gems for a few cities
    await this.seedHiddenGems();
    await this.seedLiveActivity();
    await this.seedCityAlerts();
    await this.seedHappeningNow();
  }

  private async seedHiddenGems(): Promise<void> {
    const gems = [
      {
        city: "Tokyo",
        country: "Japan",
        placeName: "Yanaka Ginza",
        placeType: "neighborhood",
        localRating: "4.8",
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
        city: "Tokyo",
        country: "Japan",
        placeName: "Shimokitazawa",
        placeType: "neighborhood",
        localRating: "4.7",
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
        city: "Paris",
        country: "France",
        placeName: "Canal Saint-Martin",
        placeType: "neighborhood",
        localRating: "4.6",
        touristMentions: 890,
        localMentions: 4500, // fee-literal-ok: mock social-media mention count, not fee config
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
        city: "Bali",
        country: "Indonesia",
        placeName: "Sidemen Valley",
        placeType: "attraction",
        localRating: "4.9",
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
        city: "New York",
        country: "USA",
        placeName: "Red Hook",
        placeType: "neighborhood",
        localRating: "4.5",
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

    for (const gem of gems) {
      await db.insert(travelPulseHiddenGems).values(gem);
    }
    console.log(`Seeded ${gems.length} hidden gems`);
  }

  private async seedLiveActivity(): Promise<void> {
    const activities = [
      { city: "Tokyo", placeName: "Shibuya Crossing", activityType: "check_in", activityText: "just checked in at the world's busiest intersection", activityEmoji: null, userName: "Sarah", likesCount: 23 },
      { city: "Tokyo", placeName: "Tsukiji Outer Market", activityType: "discovery", activityText: "found the best sushi spot locals won't tell you about", activityEmoji: null, userName: "Mike", likesCount: 45 },
      { city: "Paris", placeName: "Le Marais", activityType: "photo", activityText: "captured the magic of golden hour", activityEmoji: null, userName: "Emma", likesCount: 67 },
      { city: "Bali", placeName: "Tegallalang", activityType: "discovery", activityText: "discovered a hidden cafe with jungle views", activityEmoji: null, userName: "Alex", likesCount: 34 },
      { city: "New York", placeName: "DUMBO", activityType: "check_in", activityText: "exploring Brooklyn's best views", activityEmoji: null, userName: "James", likesCount: 28 },
      { city: "Barcelona", placeName: "El Born", activityType: "review", activityText: "best tapas experience of my life!", activityEmoji: null, userName: "Sofia", likesCount: 52 },
      { city: "Dubai", placeName: "Al Fahidi", activityType: "discovery", activityText: "found the old Dubai hidden in the modern city", activityEmoji: null, userName: "Ahmed", likesCount: 41 },
      { city: "Tokyo", placeName: "Nakameguro", activityType: "photo", activityText: "cherry blossoms along the river at sunset", activityEmoji: null, userName: "Yuki", likesCount: 89 },
    ];

    for (const activity of activities) {
      await db.insert(travelPulseLiveActivity).values(activity);
    }
    console.log(`Seeded ${activities.length} live activities`);
  }

  private async seedCityAlerts(): Promise<void> {
    const alerts = [
      {
        city: "Tokyo",
        alertType: "event",
        severity: "info",
        title: "Cherry Blossom Peak",
        message: "Peak bloom expected in Ueno Park this week. Expect large crowds.",
        emoji: null,
        isActive: true,
      },
      {
        city: "Bali",
        alertType: "weather",
        severity: "warning",
        title: "Rainy Season Continues",
        message: "Afternoon showers expected daily. Plan morning activities.",
        emoji: null,
        isActive: true,
      },
      {
        city: "Bangkok",
        alertType: "event",
        severity: "info",
        title: "Songkran Preparations",
        message: "Water festival approaches. Some shops may close early.",
        emoji: null,
        isActive: true,
      },
    ];

    for (const alert of alerts) {
      await db.insert(travelPulseCityAlerts).values(alert);
    }
    console.log(`Seeded ${alerts.length} city alerts`);
  }

  private async seedHappeningNow(): Promise<void> {
    const now = new Date();
    const events = [
      {
        city: "Tokyo",
        eventType: "festival",
        title: "Sakura Light-Up at Meguro River",
        description: "Evening illumination of cherry blossoms along the river",
        venue: "Meguro River",
        startsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        crowdLevel: "packed",
        entryFee: "Free",
        isLive: true,
      },
      {
        city: "Paris",
        eventType: "market",
        title: "Marché aux Puces de Vanves",
        description: "Authentic Parisian flea market with antiques",
        venue: "Avenue Marc Sangnier",
        startsAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 5 * 60 * 60 * 1000),
        crowdLevel: "moderate",
        entryFee: "Free",
        isLive: true,
      },
      {
        city: "Barcelona",
        eventType: "performance",
        title: "Street Performance at La Boqueria",
        description: "Local flamenco dancers performing",
        venue: "La Boqueria Market",
        startsAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        crowdLevel: "busy",
        entryFee: "Free",
        isLive: true,
      },
    ];

    for (const event of events) {
      await db.insert(travelPulseHappeningNow).values(event);
    }
    console.log(`Seeded ${events.length} happening now events`);
  }

  // ============================================
  // AI INTELLIGENCE UPDATE METHODS — DELETED by TravelPulse PR 1 (ledger
  // `2026-09-29-travelpulse-hygiene`): `updateCityWithAI`, its two merge writers, the proxy-signal
  // gatherer and `refreshStaleAICities` (the `travelpulse-daily-refresh` job's only work). Grok no
  // longer writes `travel_pulse_cities` scores or crowd levels; nothing here calls xAI.
  // ============================================

  // Get cities that need AI refresh
  async getCitiesNeedingRefresh(): Promise<TravelPulseCity[]> {
    // Phase 2.3: scope limited to the 8 configured operating markets.
    // No longer returns every stale city; prevents Grok from being implicitly
    // triggered for cities outside the operating set.
    const { OPERATING_MARKETS } = await import("./trend-engine/operating-markets");
    const marketNames = OPERATING_MARKETS.map(m => m.cityName);
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return db
      .select()
      .from(travelPulseCities)
      .where(
        and(
          sql`${travelPulseCities.cityName} = ANY(${sql.raw(`ARRAY[${marketNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',')}]`)})`,
          sql`${travelPulseCities.aiGeneratedAt} IS NULL OR ${travelPulseCities.aiGeneratedAt} < ${staleThreshold}`,
        ),
      );
  }

  // Get destination seasonal data for calendar display
  async getDestinationSeasons(city: string, country: string): Promise<DestinationSeason[]> {
    return db
      .select()
      .from(destinationSeasons)
      .where(and(
        eq(destinationSeasons.city, city),
        eq(destinationSeasons.country, country)
      ))
      .orderBy(destinationSeasons.month);
  }

  // Get destination events for calendar display
  async getDestinationEvents(city: string, country: string): Promise<DestinationEvent[]> {
    return db
      .select()
      .from(destinationEvents)
      .where(and(
        eq(destinationEvents.city, city),
        eq(destinationEvents.country, country),
        eq(destinationEvents.status, "approved")
      ))
      .orderBy(destinationEvents.startMonth);
  }

  // Get full calendar data (seasonal + events)
  async getFullCalendarData(city: string, country: string): Promise<{
    seasons: DestinationSeason[];
    events: DestinationEvent[];
    bestTimeToVisit: string | null;
    lastUpdated: Date | null;
  }> {
    const [seasons, events, cityData] = await Promise.all([
      this.getDestinationSeasons(city, country),
      this.getDestinationEvents(city, country),
      db.select().from(travelPulseCities)
        .where(and(
          eq(travelPulseCities.cityName, city),
          eq(travelPulseCities.country, country)
        ))
        .limit(1)
    ]);

    return {
      seasons,
      events,
      bestTimeToVisit: cityData[0]?.aiBestTimeToVisit || null,
      lastUpdated: cityData[0]?.aiGeneratedAt || null
    };
  }
}

export const travelPulseService = new TravelPulseService();
