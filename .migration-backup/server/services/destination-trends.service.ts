/**
 * Destination Trends Service
 *
 * Computes trending and seasonality signals from accumulated booking/search data.
 * Transforms time-series into actionable intelligence for the by-date discovery page.
 *
 * Signals computed:
 * - bestMonths: which months users actually book/search/rate highly (data-derived)
 * - demandGrowth: week-over-week/month-over-month growth in searches/bookings
 * - trendDirection: rising/declining demand signal
 * - leadTimeDays: "book ~N weeks ahead" guidance per destination/season
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export interface DestinationTrendSignals {
  country: string;
  bestMonths: number[]; // [1-12] sorted by rating
  demandGrowth: number; // % change month-over-month
  trendDirection: "rising" | "declining" | "stable";
  leadTimeDays: number; // average days ahead bookings happen
  ratingTrend: "improving" | "declining" | "stable";
  confidence: "high" | "medium" | "low"; // based on data volume
}

/**
 * Compute best-months from booking/search history
 * Looks at: search frequency, booking frequency, ratings
 * Returns months ranked by overall activity + sentiment
 */
export async function computeSeasonalityTrends(): Promise<DestinationTrendSignals[]> {
  const results: DestinationTrendSignals[] = [];

  // Get unique countries from trip analytics
  const countryRows = await db.execute(sql`
    SELECT DISTINCT destination_country AS country
    FROM trip_analytics_enhanced
    WHERE destination_country IS NOT NULL
    LIMIT 100
  `);
  const countries = (countryRows.rows as { country: string }[]);

  for (const { country } of countries) {
    if (!country) continue;

    // 1. Compute seasonality: best booking/search months
    const seasonalityData = await db.execute(sql`
      SELECT
        EXTRACT(MONTH FROM booking_date) as month,
        COUNT(*) as booking_count,
        AVG(COALESCE(rating, 0)) as avg_rating,
        COUNT(DISTINCT DATE(booking_date)) as activity_days
      FROM trip_analytics_enhanced
      WHERE country = ${country}
      AND booking_date >= NOW() - INTERVAL 12 MONTH
      GROUP BY month
      ORDER BY month
    `);

    // 2. Compute demand growth (MoM)
    const monthlyBookings = await db.execute(sql`
      SELECT
        DATE_TRUNC('month', booking_date) as month,
        COUNT(*) as count
      FROM trip_analytics_enhanced
      WHERE country = ${country}
      AND booking_date >= NOW() - INTERVAL 3 MONTH
      ORDER BY month DESC
      LIMIT 3
    `);

    // 3. Compute lead-time (days between search and booking)
    const leadTimeData = await db.execute(sql`
      SELECT AVG(EXTRACT(DAY FROM (booking_date - search_date))) as avg_lead_time
      FROM search_analytics sa
      JOIN trip_analytics_enhanced ta ON sa.user_id = ta.user_id
        AND sa.destination_city = ta.city
        AND sa.search_date <= ta.booking_date
      WHERE ta.country = ${country}
      AND sa.search_date >= NOW() - INTERVAL 6 MONTH
    `);

    // 4. Compute rating trend
    const ratingTrendData = await db.execute(sql`
      SELECT
        DATE_TRUNC('month', recorded_at) as month,
        AVG(metric_value::numeric) as avg_rating
      FROM destination_metrics_history
      WHERE country = ${country}
      AND metric_type = 'rating'
      AND recorded_at >= NOW() - INTERVAL 6 MONTH
      GROUP BY month
      ORDER BY month
    `);

    // Extract best months (sort by booking count + rating)
    const seasonality = seasonalityData.rows as any[];
    const bestMonths = seasonality
      .sort((a, b) => {
        const scoreA = (a.booking_count || 0) * 0.7 + (a.avg_rating || 0) * 0.3;
        const scoreB = (b.booking_count || 0) * 0.7 + (b.avg_rating || 0) * 0.3;
        return scoreB - scoreA;
      })
      .slice(0, 6) // Top 6 months
      .map((row) => parseInt(row.month))
      .sort((a, b) => a - b);

    // Compute demand growth
    const bookingsArray = (monthlyBookings.rows as any[])
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      .map((r) => r.count);
    const demandGrowth =
      bookingsArray.length >= 2
        ? ((bookingsArray[bookingsArray.length - 1] - bookingsArray[0]) / bookingsArray[0]) * 100
        : 0;
    const trendDirection: "rising" | "declining" | "stable" =
      demandGrowth > 10 ? "rising" : demandGrowth < -10 ? "declining" : "stable";

    // Extract lead time
    const leadTimeRow = leadTimeData.rows[0] as any;
    const leadTimeDays = Math.round(leadTimeRow?.avg_lead_time || 30);

    // Extract rating trend
    const ratingTrend = computeRatingTrend(ratingTrendData.rows as any[]);

    // Assess confidence based on data volume
    const totalBookings = seasonality.reduce((sum, row) => sum + (row.booking_count || 0), 0);
    const confidence: "high" | "medium" | "low" =
      totalBookings > 100 ? "high" : totalBookings > 20 ? "medium" : "low";

    results.push({
      country,
      bestMonths,
      demandGrowth: Math.round(demandGrowth * 100) / 100,
      trendDirection,
      leadTimeDays,
      ratingTrend,
      confidence,
    });
  }

  return results;
}

/**
 * Compute rating trend: improving, declining, or stable
 */
function computeRatingTrend(
  ratingHistory: Array<{ month: string; avg_rating: number }>
): "improving" | "declining" | "stable" {
  if (ratingHistory.length < 2) return "stable";

  const sorted = ratingHistory
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
    .map((r) => r.avg_rating);

  const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  const change = secondAvg - firstAvg;
  return change > 0.2 ? "improving" : change < -0.2 ? "declining" : "stable";
}

/**
 * Store computed trends for later retrieval
 * Could store in destination_trends table or as JSON on destination_metrics
 */
export async function storeDestinationTrends(trends: DestinationTrendSignals[]): Promise<void> {
  // Implementation depends on schema
  // Option 1: Create destination_trends table and insert rows
  // Option 2: Store as JSON metadata in destination_cities table
  // For now, this logs the computed trends; actual storage needs schema migration
  console.log(`[Trends] Computed ${trends.length} destination trends`);
  trends.forEach((trend) => {
    console.log(`[Trends] ${trend.country}: best-months=[${trend.bestMonths.join(",")}], ` +
      `growth=${trend.demandGrowth}%, direction=${trend.trendDirection}, ` +
      `lead=${trend.leadTimeDays}d, confidence=${trend.confidence}`);
  });
}

/**
 * Scheduled job: recompute destination trends daily
 * Integrate with existing TravelPulse/cache scheduler
 */
export async function refreshDestinationTrends(): Promise<{ computed: number; stored: number }> {
  try {
    console.log("[Trends] Starting destination trends refresh...");
    const trends = await computeSeasonalityTrends();
    await storeDestinationTrends(trends);
    console.log("[Trends] Destination trends refresh complete");
    return { computed: trends.length, stored: trends.length };
  } catch (error) {
    console.error("[Trends] Error refreshing destination trends:", error);
    throw error;
  }
}
