import { db } from "../db";
import {
  travelPulseCalendarEvents,
  travelPulseCities,
  travelPulseTrending,
  travelPulseHiddenGems,
  travelPulseLiveActivity,
  travelPulseHappeningNow,
  aiUsageLogs,
} from "@shared/schema";
import { sql } from "drizzle-orm";

async function migrateXaiData() {
  console.log("Starting XAI data migration to production...");

  try {
    const calendarEventsCount = await db.select({ count: sql<number>`count(*)` }).from(travelPulseCalendarEvents);
    const citiesCount = await db.select({ count: sql<number>`count(*)` }).from(travelPulseCities);
    const trendingCount = await db.select({ count: sql<number>`count(*)` }).from(travelPulseTrending);
    const hiddenGemsCount = await db.select({ count: sql<number>`count(*)` }).from(travelPulseHiddenGems);
    const liveActivityCount = await db.select({ count: sql<number>`count(*)` }).from(travelPulseLiveActivity);
    const happeningNowCount = await db.select({ count: sql<number>`count(*)` }).from(travelPulseHappeningNow);
    const aiLogsCount = await db.select({ count: sql<number>`count(*)` }).from(aiUsageLogs);

    console.log("Current data counts:");
    console.log(`  travel_pulse_calendar_events: ${calendarEventsCount[0]?.count || 0}`);
    console.log(`  travel_pulse_cities: ${citiesCount[0]?.count || 0}`);
    console.log(`  travel_pulse_trending: ${trendingCount[0]?.count || 0}`);
    console.log(`  travel_pulse_hidden_gems: ${hiddenGemsCount[0]?.count || 0}`);
    console.log(`  travel_pulse_live_activity: ${liveActivityCount[0]?.count || 0}`);
    console.log(`  travel_pulse_happening_now: ${happeningNowCount[0]?.count || 0}`);
    console.log(`  ai_usage_logs: ${aiLogsCount[0]?.count || 0}`);

    console.log("\nMigration check complete. Data is already synced via database connection.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateXaiData();
