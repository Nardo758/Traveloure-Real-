// §8 phone delivery (ledger `2026-10-17-phone-delivery-calendar`; the bots' review Part C, ratified by Leon Oct 16,
// 2026). The ONE writer of `calendar_feeds` and `phone_delivery_choices` (migration 388), and the feed builder.
//
//   D2  A calendar link is 32 random bytes (base64url), one live link per trip and owner, kept only as its SHA-256.
//       A reset revokes the live link and mints a new one in ONE transaction, so the old link dies at once. An
//       unknown or revoked link (or a channel switched off) is 404; from 7 days after the trip's last day, 410. The
//       feed is read-only and is not a sign-in.
//   D1  Content: stop name, start time, the item's own duration, the address from our own stop data (never a stored
//       Google Places address), a Maps link by name, hours only from person-checked or official facts with their
//       source and checked date, "Booked through Traveloure." only for a booking Traveloure holds, the business's
//       own link when we hold one (an expert-curated ticketing link). Never leg durations, leave-by or prices. Every
//       copy says when it was made ("as of …"). Unconfirmed dates ⇒ no events.
//   D3  The link belongs to the trip's owner (a Ready-Made copy's buyer); it is minted only for them, never shown on
//       a shared or public page, and a feed whose owner no longer owns the trip answers 404.
//   D7  UIDs are the item ids (stable across re-finals); SEQUENCE is the final's version; a stop deleted in a later
//       final is simply absent from the next fetch.
//   Every opt-in, opt-out and reset is a row in phone_delivery_choices with its time, per channel per trip.
import crypto from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { calendarFeeds, phoneDeliveryChoices, trips, tripFinals } from "@shared/schema";
import {
  HELD_LITEAPI_BOOKING_STATUSES,
  HELD_SERVICE_BOOKING_STATUSES,
  PHONE_DELIVERY_SWITCH,
  calendarFeedExpiresAt,
  phoneDeliveryAsOf,
  type PhoneDeliveryChannel,
  type PhoneDeliveryChoice,
} from "@shared/phone-delivery";
import { planDatesAreConfirmed } from "@shared/plan-dates";
import { googleMapsSearchUrl } from "@shared/stay-link";
import { OPERATING_MARKETS } from "@shared/operating-markets";
import { getPlatformFlag } from "./platform-flags";
import { factsForTrip } from "./content-facts/place-facts.service";
import { resolveTripTimezone } from "./trip-timezone";
import { generateTripFeedIcs, type TripFeedEvent } from "../utils/ics-calendar";

export class PhoneDeliveryRefusal extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function feedTokenSha256(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function channelEnabled(channel: PhoneDeliveryChannel): Promise<boolean> {
  return getPlatformFlag(PHONE_DELIVERY_SWITCH[channel], false);
}

export async function enabledChannels(): Promise<Record<PhoneDeliveryChannel, boolean>> {
  const [calendar, home_screen, email, push] = await Promise.all([
    channelEnabled("calendar"),
    channelEnabled("home_screen"),
    channelEnabled("email"),
    channelEnabled("push"),
  ]);
  return { calendar, home_screen, email, push };
}

type TripRow = typeof trips.$inferSelect;

/** The trip, only when `userId` owns it (trips.user_id). Anything else is the same 404. */
async function ownedTrip(tripId: string, userId: string): Promise<TripRow> {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip || !trip.userId || trip.userId !== userId) throw new PhoneDeliveryRefusal(404, "not_found", "Not found");
  return trip;
}

async function latestFinal(tripId: string) {
  const [row] = await db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId)).orderBy(desc(tripFinals.version)).limit(1);
  return row ?? null;
}

async function liveFeed(tripId: string, userId: string) {
  const [row] = await db
    .select()
    .from(calendarFeeds)
    .where(and(eq(calendarFeeds.tripId, tripId), eq(calendarFeeds.userId, userId), isNull(calendarFeeds.revokedAt)))
    .orderBy(desc(calendarFeeds.createdAt))
    .limit(1);
  return row ?? null;
}

async function lastChoice(tripId: string, userId: string, channel: PhoneDeliveryChannel) {
  const [row] = await db
    .select()
    .from(phoneDeliveryChoices)
    .where(and(eq(phoneDeliveryChoices.tripId, tripId), eq(phoneDeliveryChoices.userId, userId), eq(phoneDeliveryChoices.channel, channel)))
    .orderBy(desc(phoneDeliveryChoices.createdAt))
    .limit(1);
  return row ?? null;
}

async function recordChoice(tx: any, tripId: string, userId: string, channel: PhoneDeliveryChannel, choice: PhoneDeliveryChoice) {
  await tx.insert(phoneDeliveryChoices).values({
    id: crypto.randomUUID(),
    tripId,
    userId,
    channel,
    choice,
    createdAt: sql`NOW()` as any,
  });
}

export interface PhoneDeliveryState {
  channels: { calendar: boolean; home_screen: boolean };
  calendar: { active: boolean; since: string | null; expiresAt: string | null; ready: boolean; reason: string | null };
  homeScreen: { optedIn: boolean; at: string | null };
}

/** What the chooser draws for the owner. Never carries a token (it is shown once, at minting). */
export async function phoneDeliveryState(tripId: string, userId: string, now = new Date()): Promise<PhoneDeliveryState> {
  const trip = await ownedTrip(tripId, userId);
  const switches = await enabledChannels();
  const feed = await liveFeed(tripId, userId);
  const home = await lastChoice(tripId, userId, "home_screen");
  const expiresAt = calendarFeedExpiresAt(trip.endDate as any);
  const reason = await calendarRefusalReason(trip, now);
  return {
    channels: { calendar: switches.calendar, home_screen: switches.home_screen },
    calendar: {
      active: !!feed,
      since: feed?.createdAt ? new Date(feed.createdAt).toISOString() : null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      ready: reason === null,
      reason,
    },
    homeScreen: { optedIn: home?.choice === "opt_in", at: home?.createdAt ? new Date(home.createdAt).toISOString() : null },
  };
}

async function calendarRefusalReason(trip: TripRow, now: Date): Promise<string | null> {
  const expiresAt = calendarFeedExpiresAt(trip.endDate as any);
  if (!expiresAt || now.getTime() >= expiresAt.getTime()) return "trip_ended";
  if (!planDatesAreConfirmed(trip.datesConfirmedAt as any)) return "dates_unconfirmed";
  if (!(await latestFinal(trip.id))) return "not_final";
  return null;
}

/**
 * Mint the owner's calendar link (or reset it): revoke the live link and insert a new one, in one transaction, and
 * record the choice. Returns the token — the only time it is ever seen.
 */
export async function mintCalendarFeed(tripId: string, userId: string, now = new Date()): Promise<{ token: string; reset: boolean }> {
  if (!(await channelEnabled("calendar"))) throw new PhoneDeliveryRefusal(404, "not_found", "Not found");
  const trip = await ownedTrip(tripId, userId);
  const reason = await calendarRefusalReason(trip, now);
  if (reason === "trip_ended") throw new PhoneDeliveryRefusal(410, reason, "This trip has ended.");
  if (reason) throw new PhoneDeliveryRefusal(409, reason, reason === "not_final" ? "Finalize your Trip Card first." : "Set your dates first.");
  const token = crypto.randomBytes(32).toString("base64url");
  const reset = await db.transaction(async (tx) => {
    const revoked = await tx
      .update(calendarFeeds)
      .set({ revokedAt: sql`NOW()` as any })
      .where(and(eq(calendarFeeds.tripId, tripId), eq(calendarFeeds.userId, userId), isNull(calendarFeeds.revokedAt)))
      .returning({ id: calendarFeeds.id });
    await tx.insert(calendarFeeds).values({
      id: crypto.randomUUID(),
      tripId,
      userId,
      tokenSha256: feedTokenSha256(token),
      createdAt: sql`NOW()` as any,
    });
    const wasReset = revoked.length > 0;
    await recordChoice(tx, tripId, userId, "calendar", wasReset ? "reset" : "opt_in");
    return wasReset;
  });
  return { token, reset };
}

/** Stop the owner's calendar link. Idempotent: nothing live ⇒ nothing changes and no choice is recorded. */
export async function revokeCalendarFeed(tripId: string, userId: string): Promise<boolean> {
  await ownedTrip(tripId, userId);
  return db.transaction(async (tx) => {
    const revoked = await tx
      .update(calendarFeeds)
      .set({ revokedAt: sql`NOW()` as any })
      .where(and(eq(calendarFeeds.tripId, tripId), eq(calendarFeeds.userId, userId), isNull(calendarFeeds.revokedAt)))
      .returning({ id: calendarFeeds.id });
    if (revoked.length === 0) return false;
    await recordChoice(tx, tripId, userId, "calendar", "opt_out");
    return true;
  });
}

/** Record the owner's Add to Home Screen opt-in or opt-out for this trip. */
export async function recordHomeScreen(tripId: string, userId: string, optedIn: boolean): Promise<void> {
  if (!(await channelEnabled("home_screen"))) throw new PhoneDeliveryRefusal(404, "not_found", "Not found");
  await ownedTrip(tripId, userId);
  await db.transaction(async (tx) => recordChoice(tx, tripId, userId, "home_screen", optedIn ? "opt_in" : "opt_out"));
}

// ── The feed ──────────────────────────────────────────────────────────────────────────────────────────────────

const SKIPPED_ITEM_STATUSES = new Set(["cancelled", "removed", "skipped", "deleted"]);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDays(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function dayOf(value: unknown): string | null {
  if (!value) return null;
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function minutesOf(value: unknown): number | null {
  const m = typeof value === "string" ? value.trim().match(/^(\d{1,2}):(\d{2})/) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** The item's OWN duration: its minutes, else its own end minus start (same day). Never a leg's time. */
function ownDuration(item: any): number | null {
  if (typeof item.durationMinutes === "number" && item.durationMinutes > 0) return item.durationMinutes;
  const start = minutesOf(item.startTime);
  const end = minutesOf(item.endTime);
  return start !== null && end !== null && end > start ? end - start : null;
}

function hoursLineFor(views: any[] | undefined, isoDay: string): string | null {
  for (const v of views ?? []) {
    if (v.factType !== "hours" || !v.publishable || v.origin === "places_api" || !v.provenance || !v.checkedAt) continue;
    const weekday = WEEKDAYS[new Date(`${isoDay}T00:00:00Z`).getUTCDay()];
    const list = Array.isArray(v.value?.weekdayDescriptions) ? (v.value.weekdayDescriptions as unknown[]) : null;
    const line = list
      ? (list.find((d) => typeof d === "string" && d.startsWith(`${weekday}:`)) as string | undefined)
      : typeof v.value?.text === "string" ? (v.value.text as string) : undefined;
    if (line) return `Hours: ${line} (${v.provenance})`;
  }
  return null;
}

/** A bound value list for `IN (…)` (a JS array inside `sql` is not a Postgres array). Callers never pass it empty. */
function sqlList(values: readonly string[]) {
  return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

async function heldItemIds(tripId: string, items: any[]): Promise<Set<string>> {
  const held = new Set<string>();
  const bookingIds = items.map((i) => i.bookingId).filter((x): x is string => typeof x === "string" && x.length > 0);
  if (bookingIds.length) {
    const r = await db.execute(sql`
      SELECT id FROM service_bookings WHERE id IN (${sqlList(bookingIds)}) AND status IN (${sqlList(HELD_SERVICE_BOOKING_STATUSES)})
    `);
    const ok = new Set((r.rows as any[]).map((x) => String(x.id)));
    for (const i of items) if (i.bookingId && ok.has(String(i.bookingId))) held.add(String(i.id));
  }
  const stays = await db.execute(sql`
    SELECT itinerary_item_id FROM liteapi_bookings WHERE trip_id = ${tripId} AND status IN (${sqlList(HELD_LITEAPI_BOOKING_STATUSES)})
  `);
  for (const s of stays.rows as any[]) held.add(String(s.itinerary_item_id));
  return held;
}

async function businessLinks(items: any[]): Promise<Map<string, string>> {
  const ids = items.map((i) => i.dmoExtractedPlaceId).filter((x): x is string => typeof x === "string" && x.length > 0);
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const r = await db.execute(sql`SELECT id, ticketing_url FROM dmo_extracted_places WHERE id IN (${sqlList(ids)})`);
  const byPlace = new Map((r.rows as any[]).map((x) => [String(x.id), x.ticketing_url as string | null]));
  for (const i of items) {
    const url = byPlace.get(String(i.dmoExtractedPlaceId));
    if (typeof url === "string" && /^https:\/\/[^\s]+$/.test(url)) out.set(String(i.id), url);
  }
  return out;
}

export type FeedResult = { status: 200; body: string } | { status: 404 } | { status: 410 };

/** GET /cal/<token>.ics. Never throws for a bad token; every refusal is its status alone. */
export async function renderCalendarFeed(token: string, now = new Date()): Promise<FeedResult> {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return { status: 404 };
  if (!(await channelEnabled("calendar"))) return { status: 404 };
  const [feed] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.tokenSha256, feedTokenSha256(token))).limit(1);
  if (!feed || feed.revokedAt || !feed.tripId || !feed.userId) return { status: 404 };
  const [trip] = await db.select().from(trips).where(eq(trips.id, feed.tripId)).limit(1);
  if (!trip || trip.userId !== feed.userId) return { status: 404 };
  const expiresAt = calendarFeedExpiresAt(trip.endDate as any);
  if (!expiresAt || now.getTime() >= expiresAt.getTime()) return { status: 410 };

  await db.update(calendarFeeds).set({ lastFetchedAt: sql`NOW()` as any }).where(eq(calendarFeeds.id, feed.id)).catch(() => undefined);

  const final = await latestFinal(trip.id);
  const zone = trip.timezone ?? resolveTripTimezone(trip.destination);
  // The city named in "as of 3:15 PM Kyoto time": the market's own name, else the destination's first part.
  const place =
    OPERATING_MARKETS.find((m) => m.marketKey === (trip as any).marketSlug)?.cityName ??
    (String(trip.destination ?? "").split(",")[0].trim() || null);
  const snap: any = final?.snapshot ?? null;
  const madeAt = final?.createdAt ? new Date(final.createdAt) : now;
  const asOf = phoneDeliveryAsOf(madeAt, zone, place);
  const name = String(snap?.trip?.title || trip.title || trip.destination || "Trip Card");
  const events: TripFeedEvent[] = [];

  if (snap && planDatesAreConfirmed(trip.datesConfirmedAt as any)) {
    const start = dayOf(snap.trip?.startDate) ?? dayOf(trip.startDate);
    const items: any[] = (Array.isArray(snap.items) ? snap.items : []).filter(
      (i: any) => i && i.id && i.title && !SKIPPED_ITEM_STATUSES.has(String(i.status ?? "")),
    );
    const [facts, held, links] = await Promise.all([factsForTrip(trip.id, now), heldItemIds(trip.id, items), businessLinks(items)]);
    for (const item of items) {
      const day = dayOf(item.scheduledDate) ?? (start ? addDays(start, Math.max(0, Number(item.dayNumber || 1) - 1)) : null);
      if (!day) continue;
      const address = item.locationAddress || item.locationName || null;
      const mapsUrl = googleMapsSearchUrl(item.locationName || item.title, item.locationAddress || trip.destination);
      const business = links.get(String(item.id)) ?? null;
      const lines = [
        held.has(String(item.id)) ? "Booked through Traveloure." : null,
        hoursLineFor(facts[String(item.id)], day),
        mapsUrl ? `Map: ${mapsUrl}` : null,
        business ? `Website: ${business}` : null,
        `Trip Card ${asOf}.`,
      ].filter((x): x is string => !!x);
      events.push({
        uid: `${item.id}@traveloure.com`,
        sequence: final?.version ?? 0,
        date: day,
        startTime: item.startTime ?? null,
        durationMinutes: ownDuration(item),
        summary: String(item.title),
        location: address,
        description: lines.join("\n"),
        url: business,
      });
    }
  }

  const body = generateTripFeedIcs({
    calendarName: name,
    calendarDescription: `Trip Card ${asOf}.`,
    timezone: zone,
    madeAt,
    events,
  });
  return { status: 200, body };
}
