import OpenAI from "openai";
import { db } from "../db";
import {
  travelPulseTrending,
  travelPulseLiveScores,
  travelPulseTruthChecks,
  travelPulseCrowdForecasts,
  travelPulseCalendarEvents,
  TravelPulseTrending,
  TravelPulseTruthCheck,
  TravelPulseCalendarEvent,
} from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import crypto from "crypto";

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
}

export const travelPulseService = new TravelPulseService();
