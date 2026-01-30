import { db } from "./db";
import {
  travelPulseCalendarEvents,
  travelPulseCities,
  travelPulseHiddenGems,
  travelPulseLiveActivity,
  travelPulseHappeningNow,
} from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { logger } from "./infrastructure";
import * as fs from "fs";
import * as path from "path";

function loadJsonData<T>(filename: string): T[] {
  try {
    const filePath = path.join(__dirname, "data", filename);
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    logger.warn({ filename, error }, "Could not load JSON data file");
    return [];
  }
}

interface CalendarEventData {
  id: string;
  event_name: string;
  event_type: string;
  city: string;
  country?: string;
  region?: string;
  start_date: string;
  end_date: string;
  crowd_impact: string;
  price_impact: string;
  crowd_impact_percent: number;
  description: string;
  affected_areas: string[];
  tips: string[];
  source: string;
  image_url?: string;
}

interface LiveActivityData {
  id: string;
  city: string;
  placeName: string;
  activityType: string;
  activityText: string;
  activityEmoji: string;
  userName: string;
  likesCount: number;
}

interface HiddenGemData {
  id: string;
  city: string;
  country: string;
  place_name: string;
  place_type: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  local_rating?: number;
  tourist_mentions?: number;
  local_mentions?: number;
  gem_score: number;
  discovery_status: string;
  days_until_mainstream?: number;
  description: string;
  why_locals_love_it: string;
  best_for: string[];
  price_range: string;
  image_url?: string;
}

interface HappeningNowData {
  id: string;
  city: string;
  eventType: string;
  title: string;
  description: string;
  venue: string;
  crowdLevel: string;
  entryFee: string;
  isLive: boolean;
}

interface CityData {
  id: string;
  city_name: string;
  country: string;
  country_code?: string;
  region?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  pulse_score: number;
  active_travelers: number;
  trending_score: number;
  crowd_level: string;
  vibe_tags: string[];
  current_highlight: string;
  highlight_emoji?: string;
  weather_score: number;
  avg_hotel_price: number;
  price_change: number;
  price_trend: string;
  deal_alert?: string;
  total_trending_spots: number;
  total_hidden_gems: number;
  total_alerts: number;
  image_url?: string;
  thumbnail_url?: string;
}

export async function seedTravelPulseData(): Promise<{ created: number }> {
  let created = 0;

  try {
    const calendarEvents = loadJsonData<CalendarEventData>("calendar-events.json");
    for (const event of calendarEvents) {
      const existing = await db.select().from(travelPulseCalendarEvents).where(eq(travelPulseCalendarEvents.id, event.id));
      if (existing.length === 0) {
        await db.insert(travelPulseCalendarEvents).values({
          id: event.id,
          eventName: event.event_name,
          eventType: event.event_type,
          city: event.city,
          country: event.country,
          region: event.region,
          startDate: new Date(event.start_date),
          endDate: new Date(event.end_date),
          crowdImpact: event.crowd_impact,
          priceImpact: event.price_impact,
          crowdImpactPercent: event.crowd_impact_percent,
          description: event.description,
          affectedAreas: event.affected_areas,
          tips: event.tips,
          source: event.source,
          imageUrl: event.image_url,
        });
        created++;
      }
    }

    const liveActivity = loadJsonData<LiveActivityData>("live-activity.json");
    for (const activity of liveActivity) {
      const existing = await db.select().from(travelPulseLiveActivity).where(eq(travelPulseLiveActivity.id, activity.id));
      if (existing.length === 0) {
        await db.insert(travelPulseLiveActivity).values({
          id: activity.id,
          city: activity.city,
          placeName: activity.placeName,
          activityType: activity.activityType,
          activityText: activity.activityText,
          activityEmoji: activity.activityEmoji,
          userName: activity.userName,
          likesCount: activity.likesCount,
          occurredAt: new Date(),
        });
        created++;
      }
    }

    const hiddenGems = loadJsonData<HiddenGemData>("hidden-gems.json");
    for (const gem of hiddenGems) {
      const existing = await db.select().from(travelPulseHiddenGems).where(eq(travelPulseHiddenGems.id, gem.id));
      if (existing.length === 0) {
        await db.insert(travelPulseHiddenGems).values({
          id: gem.id,
          city: gem.city,
          country: gem.country,
          placeName: gem.place_name,
          placeType: gem.place_type,
          address: gem.address,
          latitude: gem.latitude?.toString(),
          longitude: gem.longitude?.toString(),
          localRating: gem.local_rating?.toString(),
          touristMentions: gem.tourist_mentions || 0,
          localMentions: gem.local_mentions || 0,
          gemScore: gem.gem_score,
          discoveryStatus: gem.discovery_status,
          daysUntilMainstream: gem.days_until_mainstream,
          description: gem.description,
          whyLocalsLoveIt: gem.why_locals_love_it,
          bestFor: gem.best_for,
          priceRange: gem.price_range,
          imageUrl: gem.image_url,
        });
        created++;
      }
    }

    const happeningNow = loadJsonData<HappeningNowData>("happening-now.json");
    for (const event of happeningNow) {
      const existing = await db.select().from(travelPulseHappeningNow).where(eq(travelPulseHappeningNow.id, event.id));
      if (existing.length === 0) {
        await db.insert(travelPulseHappeningNow).values({
          id: event.id,
          city: event.city,
          eventType: event.eventType,
          title: event.title,
          description: event.description,
          venue: event.venue,
          crowdLevel: event.crowdLevel,
          entryFee: event.entryFee,
          isLive: event.isLive,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
        });
        created++;
      }
    }

    const cities = loadJsonData<CityData>("cities.json");
    for (const city of cities) {
      const existing = await db.select().from(travelPulseCities).where(eq(travelPulseCities.id, city.id));
      if (existing.length === 0) {
        await db.insert(travelPulseCities).values({
          id: city.id,
          cityName: city.city_name,
          country: city.country,
          countryCode: city.country_code,
          region: city.region,
          timezone: city.timezone,
          latitude: city.latitude?.toString(),
          longitude: city.longitude?.toString(),
          pulseScore: city.pulse_score,
          activeTravelers: city.active_travelers,
          trendingScore: city.trending_score,
          crowdLevel: city.crowd_level,
          vibeTags: city.vibe_tags,
          currentHighlight: city.current_highlight,
          highlightEmoji: city.highlight_emoji,
          weatherScore: city.weather_score,
          avgHotelPrice: city.avg_hotel_price?.toString(),
          priceChange: city.price_change?.toString(),
          priceTrend: city.price_trend,
          dealAlert: city.deal_alert,
          totalTrendingSpots: city.total_trending_spots,
          totalHiddenGems: city.total_hidden_gems,
          totalAlerts: city.total_alerts,
          imageUrl: city.image_url,
          thumbnailUrl: city.thumbnail_url,
        });
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
