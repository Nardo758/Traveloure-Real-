import { sql } from "drizzle-orm";
import { db } from "../db";
import { localMarketingClock, type MarketingPreferences } from "./itinerary-followup-email";

export type MarketingTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Reuses the existing users-row lock; no second scheduler or process-local lock. */
export async function lockMarketingTraveler(tx: MarketingTx, travelerId: string) {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${travelerId} FOR UPDATE`);
}

export function marketingWindow(now: Date, preferences: MarketingPreferences) {
  const clock = localMarketingClock(now, preferences);
  const hour = Number(new Intl.DateTimeFormat("en", {
    timeZone: preferences.timeZone, hour: "numeric", hourCycle: "h23",
  }).format(now));
  // Preserve the recipient's restrictions as well as the approved daytime window.
  return { ...clock, quiet: clock.quiet || hour < 9 || hour >= 20 };
}

export function nextCartMarketingWindow(now: Date, preferences: MarketingPreferences, blockedDay?: string) {
  for (let minutes = 1; minutes <= 48 * 60; minutes++) {
    const date = new Date(now.getTime() + minutes * 60_000);
    const clock = marketingWindow(date, preferences);
    if (!clock.quiet && clock.day !== blockedDay) return date;
  }
  throw new Error("No allowed marketing window within 48 hours");
}

/** Caller holds the shared recipient lock. Ambiguous provider attempts reserve the day too. */
export async function marketingDayReserved(
  tx: MarketingTx, travelerId: string, day: string, exceptOutboxId = -1,
) {
  const result = await tx.execute(sql`
    SELECT id FROM email_outbox
    WHERE id <> ${exceptOutboxId} AND metadata->>'travelerId' = ${travelerId}
      AND metadata->>'marketing' = 'true'
      AND (metadata->>'deliveryCalendarDay' = ${day}
        OR coalesce(metadata->'deliveryCalendarDays', '[]'::jsonb) ? ${day})
    LIMIT 1`);
  return result.rows.length > 0;
}

export function reserveMarketingDay(metadata: Record<string, unknown>, day: string) {
  const history = Array.isArray(metadata.deliveryCalendarDays)
    ? metadata.deliveryCalendarDays.filter(value => typeof value === "string") : [];
  if (typeof metadata.deliveryCalendarDay === "string") history.push(metadata.deliveryCalendarDay);
  return { ...metadata, deliveryCalendarDay: day, deliveryCalendarDays: Array.from(new Set([...history, day])) };
}

/** Only actual SENT item-change notices suppress reminders; no marketing-cap reservation. */
export async function cartItemChangeSentToday(
  tx: MarketingTx, travelerId: string, now: Date, preferences: MarketingPreferences,
) {
  const day = marketingWindow(now, preferences).day;
  const result = await tx.execute(sql`SELECT id FROM email_outbox
    WHERE email_type='cart_item_changed' AND status='sent' AND sent_at IS NOT NULL
      AND metadata->>'travelerId'=${travelerId}
      AND ((sent_at AT TIME ZONE 'UTC') AT TIME ZONE ${preferences.timeZone})::date::text=${day}
    LIMIT 1`);
  return result.rows.length > 0;
}
