import OpenAI from "openai";
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
  destinationSeasons,
  destinationEvents,
  TravelPulseTrending,
  TravelPulseTruthCheck,
  TravelPulseCalendarEvent,
  TravelPulseCity,
  TravelPulseHiddenGem,
  TravelPulseLiveActivity,
  TravelPulseCityAlert,
  TravelPulseHappeningNow,
} from "@shared/schema";
import { eq, and, gte, lte, desc, asc, sql, isNull, lt } from "drizzle-orm";
import crypto from "crypto";
import { grokService, CityIntelligenceResult } from "./grok.service";

const GROK_MODEL = "grok-3";

function getGrokClient(): OpenAI {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
  });
}

function extractJSON(content: string): any {
  let jsonStr = content.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  return JSON.parse(jsonStr);
}

export class TravelPulseService {
  private grok: OpenAI;

  constructor() {
    this.grok = getGrokClient();
  }

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

    return this.fetchAndCacheTrendingDestinations(city, limit);
  }

  private async fetchAndCacheTrendingDestinations(city: string, limit: number): Promise<TravelPulseTrending[]> {
    const prompt = `You are a travel intelligence analyst. Analyze what's currently trending in ${city} based on social media signals, travel blogs, and recent news.

Return a JSON array of ${limit} trending destinations/experiences in ${city}. For each, provide comprehensive intelligence:

{
  "destinations": [
    {
      "destinationName": "Name of place/experience",
      "destinationType": "restaurant|attraction|hotel|tour|neighborhood|activity",
      "trendScore": 0-1000 (velocity of trending),
      "growthPercent": percentage increase in mentions,
      "mentionCount": estimated recent mentions,
      "trendStatus": "emerging|viral|mainstream|declining",
      "triggerEvent": "What caused the trend (influencer post, news, seasonal, etc.)",
      
      "liveScore": 1.0-5.0 (current rating based on sentiment),
      "liveScoreChange": -2.0 to +2.0 (change from baseline),
      "sentimentScore": -1.0 to +1.0,
      "sentimentTrend": "up|down|stable",
      
      "worthItPercent": 0-100,
      "mehPercent": 0-100,
      "avoidPercent": 0-100,
      "overallVerdict": "highly_recommended|recommended|mixed|skip",
      "realityScore": 1-10 (photo vs reality gap),
      
      "topHighlights": ["positive aspect 1", "positive aspect 2"],
      "topWarnings": ["concern 1", "concern 2"],
      "crowdsourcedTips": [{"tip": "Visit early morning", "mentionCount": 15}],
      
      "bestTimeToVisit": "6-8am for photos, 5-7pm for atmosphere",
      "worstTimeToVisit": "11am-2pm extremely crowded",
      "crowdForecast": [
        {"hour": 6, "level": "quiet", "percent": 15},
        {"hour": 12, "level": "packed", "percent": 95}
      ],
      
      "latitude": number or null,
      "longitude": number or null
    }
  ]
}

Focus on authentic traveler sentiment, not promotional content. Include hidden gems that are emerging, not just famous landmarks.`;

    try {
      const response = await this.grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: "You are a travel intelligence analyst. Always respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const data = extractJSON(content);
      const destinations = data.destinations || [];

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const results: TravelPulseTrending[] = [];

      for (const dest of destinations) {
        const record = {
          city: city.toLowerCase(),
          country: dest.country || null,
          destinationName: dest.destinationName,
          destinationType: dest.destinationType,
          trendScore: dest.trendScore || 0,
          growthPercent: dest.growthPercent || 0,
          mentionCount: dest.mentionCount || 0,
          trendStatus: dest.trendStatus || "emerging",
          triggerEvent: dest.triggerEvent,
          liveScore: String(dest.liveScore || 4.0),
          liveScoreChange: String(dest.liveScoreChange || 0),
          sentimentScore: String(dest.sentimentScore || 0),
          sentimentTrend: dest.sentimentTrend || "stable",
          worthItPercent: dest.worthItPercent,
          mehPercent: dest.mehPercent,
          avoidPercent: dest.avoidPercent,
          overallVerdict: dest.overallVerdict,
          realityScore: dest.realityScore,
          topHighlights: dest.topHighlights || [],
          topWarnings: dest.topWarnings || [],
          crowdsourcedTips: dest.crowdsourcedTips || [],
          bestTimeToVisit: dest.bestTimeToVisit,
          worstTimeToVisit: dest.worstTimeToVisit,
          crowdForecast: dest.crowdForecast || [],
          latitude: dest.latitude ? String(dest.latitude) : null,
          longitude: dest.longitude ? String(dest.longitude) : null,
          expiresAt,
        };

        const [inserted] = await db
          .insert(travelPulseTrending)
          .values(record)
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          results.push(inserted);
        }
      }

      return results;
    } catch (error) {
      console.error("Error fetching trending destinations:", error);
      throw error;
    }
  }

  async getTruthCheck(query: string, city?: string): Promise<TravelPulseTruthCheck> {
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

    return this.performTruthCheck(query, city, normalized, queryHash);
  }

  private async performTruthCheck(
    query: string,
    city: string | undefined,
    normalized: string,
    queryHash: string
  ): Promise<TravelPulseTruthCheck> {
    const cityContext = city ? ` in ${city}` : "";
    
    const prompt = `Analyze this travel question based on real traveler sentiment and experiences: "${query}"${cityContext}

Search your knowledge of recent traveler experiences, reviews, and social media discussions to provide a truth check.

Return JSON:
{
  "subjectName": "Name of place/experience being asked about",
  "subjectType": "place|experience|claim",
  "city": "City name or null",
  "postsAnalyzed": estimated number of data points,
  
  "worthItPercent": 0-100 (percent who say worth it),
  "mehPercent": 0-100 (percent who say it's okay),
  "avoidPercent": 0-100 (percent who say avoid),
  "overallVerdict": "highly_recommended|recommended|mixed|skip",
  
  "positiveMentions": [{"text": "specific praise", "count": 5}],
  "negativeMentions": [{"text": "specific complaint", "count": 2}],
  "crowdsourcedTips": [{"tip": "Visit at 6am", "mentions": 23, "context": "avoid crowds"}],
  
  "realityScore": 1-10 (how well photos match reality),
  "expectationGap": -5 to +5 (negative = worse than expected, positive = better)
}`;

    try {
      const response = await this.grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: "You are a travel truth verification assistant. Respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const data = extractJSON(content);

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const [result] = await db
        .insert(travelPulseTruthChecks)
        .values({
          queryText: query,
          queryHash,
          subjectName: data.subjectName,
          subjectType: data.subjectType,
          city: data.city || city,
          postsAnalyzed: data.postsAnalyzed || 0,
          worthItPercent: data.worthItPercent,
          mehPercent: data.mehPercent,
          avoidPercent: data.avoidPercent,
          overallVerdict: data.overallVerdict,
          positiveMentions: data.positiveMentions || [],
          negativeMentions: data.negativeMentions || [],
          crowdsourcedTips: data.crowdsourcedTips || [],
          realityScore: data.realityScore,
          expectationGap: data.expectationGap,
          expiresAt,
        })
        .returning();

      return result;
    } catch (error) {
      console.error("Error performing truth check:", error);
      throw error;
    }
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

    return this.fetchCalendarEvents(city, startDate, endDate);
  }

  private async fetchCalendarEvents(
    city: string,
    startDate: Date,
    endDate: Date
  ): Promise<TravelPulseCalendarEvent[]> {
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    const prompt = `List major events, festivals, holidays, and travel-relevant occasions in ${city} between ${startStr} and ${endStr}.

Return JSON:
{
  "events": [
    {
      "eventName": "Event name",
      "eventType": "festival|holiday|conference|sporting|cultural|religious",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD or null",
      "crowdImpact": "low|moderate|high|extreme",
      "priceImpact": "lower|normal|higher|surge",
      "crowdImpactPercent": estimated % increase in crowds,
      "description": "Brief description",
      "affectedAreas": ["list of affected neighborhoods/attractions"],
      "tips": ["Advice for travelers during this event"]
    }
  ]
}`;

    try {
      const response = await this.grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: "You are a travel calendar assistant. Respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const data = extractJSON(content);
      const events = data.events || [];

      const results: TravelPulseCalendarEvent[] = [];

      for (const event of events) {
        const [inserted] = await db
          .insert(travelPulseCalendarEvents)
          .values({
            eventName: event.eventName,
            eventType: event.eventType,
            city: city.toLowerCase(),
            startDate: event.startDate,
            endDate: event.endDate,
            crowdImpact: event.crowdImpact,
            priceImpact: event.priceImpact,
            crowdImpactPercent: event.crowdImpactPercent,
            description: event.description,
            affectedAreas: event.affectedAreas || [],
            tips: event.tips || [],
            source: "grok",
          })
          .returning();

        if (inserted) {
          results.push(inserted);
        }
      }

      return results;
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      throw error;
    }
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

    const prompt = `Provide comprehensive travel intelligence for "${destinationName}" in ${city}.

Return JSON with the same structure as trending destinations, including LiveScore, Truth Check, crowd forecasts, tips, and warnings.`;

    try {
      const response = await this.grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: "You are a travel intelligence analyst. Respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const data = extractJSON(content);

      return {
        destinationName,
        city,
        ...data,
        source: "on-demand",
      };
    } catch (error) {
      console.error("Error getting destination intelligence:", error);
      throw error;
    }
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

    const prompt = `Calculate a real-time LiveScore for "${entityName}" in ${city} based on recent traveler sentiment.

Return JSON:
{
  "entityName": "${entityName}",
  "entityType": "restaurant|hotel|attraction|tour",
  "mentionCount": estimated recent mentions,
  "uniqueUsersCount": estimated unique reviewers,
  "avgSentiment": -1.0 to 1.0,
  "positiveCount": number,
  "neutralCount": number,
  "negativeCount": number,
  "sentimentTrend": "up|down|stable",
  "liveScore": 1.0-5.0,
  "scoreChange24h": -2.0 to 2.0,
  "isTrending": boolean,
  "trendVelocity": 0-1000,
  "topPositiveKeywords": ["keyword1", "keyword2"],
  "topNegativeKeywords": ["keyword1", "keyword2"]
}`;

    try {
      const response = await this.grok.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: "You are a sentiment analysis expert. Respond with valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const data = extractJSON(content);

      const validUntil = new Date(Date.now() + 15 * 60 * 1000);

      const [result] = await db
        .insert(travelPulseLiveScores)
        .values({
          entityName: data.entityName || entityName,
          entityType: data.entityType,
          city: city.toLowerCase(),
          windowPeriod: "24h",
          mentionCount: data.mentionCount || 0,
          uniqueUsersCount: data.uniqueUsersCount || 0,
          avgSentiment: String(data.avgSentiment || 0),
          positiveCount: data.positiveCount || 0,
          neutralCount: data.neutralCount || 0,
          negativeCount: data.negativeCount || 0,
          sentimentTrend: data.sentimentTrend || "stable",
          liveScore: String(data.liveScore || 4.0),
          scoreChange24h: String(data.scoreChange24h || 0),
          isTrending: data.isTrending || false,
          trendVelocity: data.trendVelocity || 0,
          topPositiveKeywords: data.topPositiveKeywords || [],
          topNegativeKeywords: data.topNegativeKeywords || [],
          validUntil,
        })
        .returning();

      return result;
    } catch (error) {
      console.error("Error calculating LiveScore:", error);
      throw error;
    }
  }

  // ============================================
  // CITY-LEVEL INTELLIGENCE METHODS
  // ============================================

  async getTrendingCities(limit: number = 20): Promise<TravelPulseCity[]> {
    const cities = await db
      .select()
      .from(travelPulseCities)
      .orderBy(desc(travelPulseCities.pulseScore))
      .limit(limit);

    return cities;
  }

  async getCityByName(cityName: string): Promise<TravelPulseCity | null> {
    const [city] = await db
      .select()
      .from(travelPulseCities)
      .where(eq(travelPulseCities.cityName, cityName))
      .limit(1);

    return city || null;
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

    return {
      city,
      hiddenGems,
      alerts,
      happeningNow,
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
      await db.insert(travelPulseCities).values(city);
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
  // AI INTELLIGENCE UPDATE METHODS
  // ============================================

  // Update a city with AI-generated intelligence from Grok
  async updateCityWithAI(cityName: string, country: string): Promise<{ success: boolean; city?: TravelPulseCity; error?: string }> {
    try {
      console.log(`[TravelPulse] Generating AI intelligence for ${cityName}, ${country}...`);
      
      // Get AI intelligence from Grok
      const { result, usage } = await grokService.generateCityIntelligence(cityName, country);
      
      console.log(`[TravelPulse] AI intelligence generated. Tokens used: ${usage.totalTokens}`);

      // Find existing city or create new one
      const [existingCity] = await db
        .select()
        .from(travelPulseCities)
        .where(and(
          eq(travelPulseCities.cityName, cityName),
          eq(travelPulseCities.country, country)
        ))
        .limit(1);

      const cityUpdate = {
        // Core identity
        cityName: result.cityName,
        country: result.country,
        
        // Pulse metrics from AI
        pulseScore: result.pulseMetrics.pulseScore,
        trendingScore: result.pulseMetrics.trendingScore,
        crowdLevel: result.pulseMetrics.crowdLevel,
        weatherScore: result.pulseMetrics.weatherScore,
        
        // Vibe from AI
        vibeTags: result.currentVibe.vibeTags,
        currentHighlight: result.currentVibe.currentHighlight,
        
        // Price intelligence from AI
        avgHotelPrice: String(result.priceIntelligence.avgHotelPriceUsd),
        priceChange: String(result.priceIntelligence.priceChangePercent),
        priceTrend: result.priceIntelligence.priceTrend,
        dealAlert: result.priceIntelligence.dealAlert,
        
        // AI-specific fields
        aiGeneratedAt: new Date(),
        aiSourceModel: "grok-2-1212",
        aiBestTimeToVisit: result.seasonalInsights.bestTimeToVisit,
        aiSeasonalHighlights: result.seasonalInsights.monthlyHighlights,
        aiUpcomingEvents: result.seasonalInsights.upcomingEvents,
        aiTravelTips: result.travelRecommendations.localTips,
        aiLocalInsights: result.travelRecommendations.culturalInsights,
        aiSafetyNotes: result.travelRecommendations.safetyNotes,
        aiOptimalDuration: result.travelRecommendations.optimalDuration,
        aiBudgetEstimate: result.travelRecommendations.budgetEstimate,
        aiMustSeeAttractions: result.travelRecommendations.mustSeeAttractions,
        aiAvoidDates: result.avoidDates,
        
        lastUpdated: new Date(),
      };

      let updatedCity: TravelPulseCity;

      if (existingCity) {
        // Update existing city
        const [updated] = await db
          .update(travelPulseCities)
          .set(cityUpdate)
          .where(eq(travelPulseCities.id, existingCity.id))
          .returning();
        updatedCity = updated;
      } else {
        // Insert new city
        const [inserted] = await db
          .insert(travelPulseCities)
          .values(cityUpdate)
          .returning();
        updatedCity = inserted;
      }

      // Merge AI data into destination calendar tables
      await this.mergeAIToCalendar(result, cityName, country);
      
      // Create/update hidden gems from AI recommendations
      await this.mergeAIHiddenGems(result.travelRecommendations.hiddenGems, cityName, country);

      console.log(`[TravelPulse] City ${cityName} updated with AI intelligence`);
      
      return { success: true, city: updatedCity };
    } catch (error: any) {
      console.error(`[TravelPulse] Error updating ${cityName} with AI:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Merge AI seasonal insights into destinationSeasons table
  private async mergeAIToCalendar(result: CityIntelligenceResult, city: string, country: string): Promise<void> {
    // Merge monthly highlights into destinationSeasons
    for (const monthData of result.seasonalInsights.monthlyHighlights) {
      const existing = await db
        .select()
        .from(destinationSeasons)
        .where(and(
          eq(destinationSeasons.city, city),
          eq(destinationSeasons.country, country),
          eq(destinationSeasons.month, monthData.month)
        ))
        .limit(1);

      const seasonData = {
        city,
        country,
        month: monthData.month,
        rating: monthData.rating,
        weatherDescription: monthData.weatherDesc,
        highlights: [monthData.highlight],
        sourceType: "ai" as const,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        // Only update if it was AI-generated (don't overwrite user contributions)
        if (existing[0].sourceType === "ai" || existing[0].sourceType === "system") {
          await db
            .update(destinationSeasons)
            .set(seasonData)
            .where(eq(destinationSeasons.id, existing[0].id));
        }
      } else {
        await db.insert(destinationSeasons).values(seasonData);
      }
    }

    // Merge upcoming events into destinationEvents
    for (const event of result.seasonalInsights.upcomingEvents) {
      // Check if similar event already exists
      const existing = await db
        .select()
        .from(destinationEvents)
        .where(and(
          eq(destinationEvents.city, city),
          eq(destinationEvents.country, country),
          eq(destinationEvents.title, event.name)
        ))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(destinationEvents).values({
          city,
          country,
          title: event.name,
          description: `${event.type} event: ${event.dateRange}`,
          eventType: event.type,
          seasonRating: event.significance,
          sourceType: "ai",
          status: "approved",
        });
      }
    }
  }

  // Merge AI hidden gems into travelPulseHiddenGems
  private async mergeAIHiddenGems(gems: CityIntelligenceResult["travelRecommendations"]["hiddenGems"], city: string, country: string): Promise<void> {
    for (const gem of gems) {
      const existing = await db
        .select()
        .from(travelPulseHiddenGems)
        .where(and(
          eq(travelPulseHiddenGems.city, city),
          eq(travelPulseHiddenGems.placeName, gem.name)
        ))
        .limit(1);

      const gemData = {
        city,
        country,
        placeName: gem.name,
        placeType: gem.type,
        description: gem.whySpecial,
        whyLocalsLoveIt: gem.whySpecial,
        priceRange: gem.priceRange,
        gemScore: 85, // AI-recommended gems get high default score
        discoveryStatus: "hidden" as const,
        aiGenerated: true,
        aiGeneratedAt: new Date(),
        lastUpdated: new Date(),
      };

      if (existing.length === 0) {
        await db.insert(travelPulseHiddenGems).values(gemData);
      } else if (existing[0].aiGenerated) {
        // Update only if it was AI-generated
        await db
          .update(travelPulseHiddenGems)
          .set(gemData)
          .where(eq(travelPulseHiddenGems.id, existing[0].id));
      }
    }
  }

  // Refresh all cities that need AI update (stale data > 24 hours)
  async refreshStaleAICities(): Promise<{ refreshed: number; errors: number }> {
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    // Get cities with stale or missing AI data
    const staleCities = await db
      .select()
      .from(travelPulseCities)
      .where(
        sql`${travelPulseCities.aiGeneratedAt} IS NULL OR ${travelPulseCities.aiGeneratedAt} < ${staleThreshold}`
      )
      .limit(10); // Process max 10 cities per run to control API costs

    let refreshed = 0;
    let errors = 0;

    for (const city of staleCities) {
      const result = await this.updateCityWithAI(city.cityName, city.country);
      if (result.success) {
        refreshed++;
      } else {
        errors++;
      }
      
      // Rate limit: wait 2 seconds between API calls
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[TravelPulse] Daily refresh complete: ${refreshed} updated, ${errors} errors`);
    return { refreshed, errors };
  }

  // Get cities that need AI refresh
  async getCitiesNeedingRefresh(): Promise<TravelPulseCity[]> {
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return db
      .select()
      .from(travelPulseCities)
      .where(
        sql`${travelPulseCities.aiGeneratedAt} IS NULL OR ${travelPulseCities.aiGeneratedAt} < ${staleThreshold}`
      );
  }
}

export const travelPulseService = new TravelPulseService();
