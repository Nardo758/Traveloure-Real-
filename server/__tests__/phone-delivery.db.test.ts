/**
 * §8 phone delivery (ledger `2026-10-17-phone-delivery-calendar`; Part C, ratified by Leon Oct 16, 2026).
 * Needs migration 388 (`calendar_feeds`, `phone_delivery_choices`).
 *
 *   PD1  switch off ⇒ mint 404, feed 404, state says no channel (every switch starts off).
 *   PD2  a wrong / malformed token ⇒ 404.
 *   PD3  reset kills the old link at once; the new one serves; both choices recorded with a time.
 *   PD4  from 7 days after the trip's last day ⇒ 410 (the day before ⇒ 200); mint after that ⇒ 410.
 *   PD5  the feed carries no leg durations, leave-by, prices or forbidden words; it says "as of".
 *   PD6  refinalize keeps UIDs, raises SEQUENCE and removes deleted stops.
 *   PD7  plan time zone across a US DST edge (America/New_York, Nov 1, 2026): TZID'd local times on both sides
 *        and a VTIMEZONE carrying the -0400 → -0500 change.
 *   PD8  unconfirmed dates ⇒ mint refused 409 and the feed carries no events.
 *   PD9  a non-owner ⇒ 404 on state, mint, revoke and home-screen; a feed whose trip changed hands ⇒ 404.
 *   PD10 opt-out and Home Screen opt-in / opt-out are rows with their channel and time; the token is stored hashed.
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, tripFinals, calendarFeeds, phoneDeliveryChoices } from "@shared/schema";
import { finalizeTrip } from "../services/trip-finalize.service";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { PHONE_DELIVERY_FORBIDDEN_WORDS, PHONE_DELIVERY_SWITCH } from "@shared/phone-delivery";
import {
  PhoneDeliveryRefusal,
  feedTokenSha256,
  mintCalendarFeed,
  phoneDeliveryState,
  recordHomeScreen,
  renderCalendarFeed,
  revokeCalendarFeed,
} from "../services/phone-delivery.service";

const RUN = crypto.randomUUID().slice(0, 8);
const BEFORE_TRIP = new Date("2026-10-20T12:00:00Z");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[phone-delivery] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

let ownerId: string;
let otherId: string;
const createdTrips: string[] = [];
const priorSwitches = new Map<string, string | null>();

async function setSwitch(channel: keyof typeof PHONE_DELIVERY_SWITCH, on: boolean): Promise<void> {
  const key = PHONE_DELIVERY_SWITCH[channel];
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value) VALUES (${key}, ${on ? "true" : "false"})
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
  `);
  invalidatePlatformFlagCache();
}

async function seedTrip(opts: { confirmed?: boolean; tz?: string; start?: string; end?: string } = {}): Promise<string> {
  const [t] = await db.insert(trips).values({
    userId: ownerId,
    title: `Phone ${RUN}`,
    destination: "New York, USA",
    startDate: opts.start ?? "2026-10-31",
    endDate: opts.end ?? "2026-11-02",
    numberOfTravelers: 2,
    timezone: opts.tz ?? "America/New_York",
    datesConfirmedAt: opts.confirmed === false ? null : new Date("2026-10-01T00:00:00Z"),
  } as any).returning();
  createdTrips.push(t.id);
  return t.id;
}

async function addItem(tripId: string, v: Record<string, unknown>): Promise<string> {
  const [row] = await db.insert(itineraryItems).values({
    tripId,
    origin: "traveler",
    routingStatus: "in_planning",
    status: "planned",
    ...v,
  } as any).returning();
  return row.id;
}

function tokenOf(path: string): string {
  const m = /^\/cal\/([A-Za-z0-9_-]+)\.ics$/.exec(path);
  assert.ok(m, `unexpected path ${path}`);
  return m![1];
}

async function mint(tripId: string, now = BEFORE_TRIP): Promise<string> {
  const { token } = await mintCalendarFeed(tripId, ownerId, now);
  return token;
}

async function body(token: string, now = BEFORE_TRIP): Promise<string> {
  const r = await renderCalendarFeed(token, now);
  assert.equal(r.status, 200);
  return (r as any).body as string;
}

/** Unfold RFC 5545 continuation lines so a grep sees whole values. */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

before(async () => {
  await assertDisposableDb();
  for (const key of Object.values(PHONE_DELIVERY_SWITCH)) {
    const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
    priorSwitches.set(key, ((r.rows[0] as any)?.setting_value as string | undefined) ?? null);
  }
  const [a] = await db.insert(users).values({ email: `phone-owner-${RUN}@traveloure-qa.test` } as any).returning();
  const [b] = await db.insert(users).values({ email: `phone-other-${RUN}@traveloure-qa.test` } as any).returning();
  ownerId = a.id;
  otherId = b.id;
});

after(async () => {
  for (const t of createdTrips) {
    await db.delete(calendarFeeds).where(eq(calendarFeeds.tripId, t)).catch(() => {});
    await db.delete(phoneDeliveryChoices).where(eq(phoneDeliveryChoices.tripId, t)).catch(() => {});
    await db.delete(tripFinals).where(eq(tripFinals.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
    await db.delete(trips).where(eq(trips.id, t)).catch(() => {});
  }
  for (const [key, value] of priorSwitches) {
    if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
    else await db.execute(sql`UPDATE platform_settings SET setting_value = ${value} WHERE setting_key = ${key}`);
  }
  invalidatePlatformFlagCache();
  await db.execute(sql`DELETE FROM users WHERE id IN (${ownerId}, ${otherId})`).catch(() => {});
});

test("PD1: every switch off ⇒ no channel, mint 404, feed 404", async () => {
  await setSwitch("calendar", true);
  const tripId = await seedTrip();
  await addItem(tripId, { title: `Museum ${RUN}`, dayNumber: 1, startTime: "10:00", durationMinutes: 60 });
  await finalizeTrip(tripId, ownerId);
  const token = await mint(tripId);

  for (const ch of ["calendar", "home_screen", "email", "push"] as const) await setSwitch(ch, false);
  const state = await phoneDeliveryState(tripId, ownerId, BEFORE_TRIP);
  assert.deepEqual(state.channels, { calendar: false, home_screen: false });
  await assert.rejects(mintCalendarFeed(tripId, ownerId, BEFORE_TRIP), (e: any) => e instanceof PhoneDeliveryRefusal && e.status === 404);
  await assert.rejects(recordHomeScreen(tripId, ownerId, true), (e: any) => e instanceof PhoneDeliveryRefusal && e.status === 404);
  assert.equal((await renderCalendarFeed(token, BEFORE_TRIP)).status, 404);
  await setSwitch("calendar", true);
  assert.equal((await renderCalendarFeed(token, BEFORE_TRIP)).status, 200);
});

test("PD2: a wrong or malformed token ⇒ 404", async () => {
  await setSwitch("calendar", true);
  assert.equal((await renderCalendarFeed(crypto.randomBytes(32).toString("base64url"), BEFORE_TRIP)).status, 404);
  assert.equal((await renderCalendarFeed("short", BEFORE_TRIP)).status, 404);
  assert.equal((await renderCalendarFeed("../../etc/passwd", BEFORE_TRIP)).status, 404);
  assert.equal((await renderCalendarFeed("", BEFORE_TRIP)).status, 404);
});

test("PD3: reset kills the old link at once; both choices recorded", async () => {
  await setSwitch("calendar", true);
  const tripId = await seedTrip();
  await addItem(tripId, { title: `Walk ${RUN}`, dayNumber: 1, startTime: "11:00", durationMinutes: 30 });
  await finalizeTrip(tripId, ownerId);
  const first = await mintCalendarFeed(tripId, ownerId, BEFORE_TRIP);
  assert.equal(first.reset, false);
  assert.equal((await renderCalendarFeed(first.token, BEFORE_TRIP)).status, 200);
  const second = await mintCalendarFeed(tripId, ownerId, BEFORE_TRIP);
  assert.equal(second.reset, true);
  assert.notEqual(second.token, first.token);
  assert.equal((await renderCalendarFeed(first.token, BEFORE_TRIP)).status, 404, "the old link is dead");
  assert.equal((await renderCalendarFeed(second.token, BEFORE_TRIP)).status, 200);
  const live = await db.select().from(calendarFeeds).where(and(eq(calendarFeeds.tripId, tripId), sql`${calendarFeeds.revokedAt} IS NULL`));
  assert.equal(live.length, 1, "one live link per trip and owner");
  const choices = await db.select().from(phoneDeliveryChoices).where(eq(phoneDeliveryChoices.tripId, tripId)).orderBy(asc(phoneDeliveryChoices.createdAt));
  assert.deepEqual(choices.map((c) => [c.channel, c.choice]), [["calendar", "opt_in"], ["calendar", "reset"]]);
  assert.ok(choices.every((c) => c.createdAt instanceof Date && c.userId === ownerId));
});

test("PD4: from 7 days after the trip ends ⇒ 410; the day before ⇒ 200", async () => {
  await setSwitch("calendar", true);
  const tripId = await seedTrip(); // ends 2026-11-02 ⇒ expires 2026-11-10T00:00Z
  await addItem(tripId, { title: `Brunch ${RUN}`, dayNumber: 2, startTime: "10:30", durationMinutes: 75 });
  await finalizeTrip(tripId, ownerId);
  const token = await mint(tripId);
  assert.equal((await renderCalendarFeed(token, new Date("2026-11-09T23:59:00Z"))).status, 200);
  assert.equal((await renderCalendarFeed(token, new Date("2026-11-10T00:00:00Z"))).status, 410);
  assert.equal((await renderCalendarFeed(token, new Date("2027-01-01T00:00:00Z"))).status, 410);
  await assert.rejects(mintCalendarFeed(tripId, ownerId, new Date("2026-11-11T00:00:00Z")), (e: any) => e.status === 410);
  const state = await phoneDeliveryState(tripId, ownerId, new Date("2026-11-11T00:00:00Z"));
  assert.equal(state.calendar.ready, false);
  assert.equal(state.calendar.reason, "trip_ended");
});

test("PD5: no leg durations, leave-by, prices or forbidden words; says when it was made", async () => {
  await setSwitch("calendar", true);
  const tripId = await seedTrip();
  await addItem(tripId, {
    title: `Gallery ${RUN}`,
    dayNumber: 1,
    startTime: "09:00",
    durationMinutes: 90,
    locationName: "Neue Galerie",
    locationAddress: "1048 5th Ave, New York, NY 10028",
    estimatedCost: "245.00",
    actualCost: "199.00",
    costPerPerson: true,
    travelFromPrevious: { minutes: 37, mode: "transit", leaveBy: "08:23" },
    description: "Leave by 08:23 to arrive on time; tickets $245",
  });
  await finalizeTrip(tripId, ownerId);
  const ics = unfold(await body(await mint(tripId)));
  assert.match(ics, /DURATION:PT90M/, "the item's own duration");
  assert.match(ics, /LOCATION:1048 5th Ave\\, New York\\, NY 10028/);
  assert.match(ics, /Map: https:\/\/www\.google\.com\/maps\/search\//);
  assert.match(ics, /Trip Card as of [A-Z][a-z]{2} \d{1,2}\\, \d{1,2}:\d{2} (AM|PM) New York time\./);
  assert.doesNotMatch(ics.split(/\r?\n/).filter((line) => !line.startsWith("DTSTAMP")).join("\n"), /\$|USD|245|199|price|cost/i, "no prices");
  assert.doesNotMatch(ics, /PT37M|37 min|08:23|leave/i, "no leg durations or leave-by");
  assert.doesNotMatch(ics, PHONE_DELIVERY_FORBIDDEN_WORDS);
  assert.doesNotMatch(ics, /Booked/, "no booking language for a stop Traveloure does not hold");
});

test("PD6: refinalize keeps UIDs, raises SEQUENCE and removes deleted stops", async () => {
  await setSwitch("calendar", true);
  const tripId = await seedTrip();
  const keep = await addItem(tripId, { title: `Keep ${RUN}`, dayNumber: 1, startTime: "09:00", durationMinutes: 60 });
  const drop = await addItem(tripId, { title: `Drop ${RUN}`, dayNumber: 2, startTime: "14:00", durationMinutes: 45 });
  const v1 = await finalizeTrip(tripId, ownerId);
  const token = await mint(tripId);
  const one = unfold(await body(token));
  assert.match(one, new RegExp(`UID:${keep}@traveloure\\.com`));
  assert.match(one, new RegExp(`UID:${drop}@traveloure\\.com`));
  assert.match(one, new RegExp(`SEQUENCE:${(v1 as any).final?.version ?? 1}`));

  await db.delete(itineraryItems).where(eq(itineraryItems.id, drop));
  await db.update(itineraryItems).set({ startTime: "10:00" } as any).where(eq(itineraryItems.id, keep));
  await finalizeTrip(tripId, ownerId);
  const [latest] = await db.select().from(tripFinals).where(eq(tripFinals.tripId, tripId)).orderBy(sql`version DESC`).limit(1);
  assert.ok(latest.version >= 2);
  const two = unfold(await body(token));
  assert.match(two, new RegExp(`UID:${keep}@traveloure\\.com`), "same UID after refinalize");
  assert.doesNotMatch(two, new RegExp(drop), "deleted stop is gone");
  assert.match(two, new RegExp(`SEQUENCE:${latest.version}`));
  assert.match(two, /DTSTART;TZID=America\/New_York:20261031T100000/);
});

test("PD7: plan time zone across the Nov 1, 2026 US DST edge", async () => {
  await setSwitch("calendar", true);
  const tripId = await seedTrip({ start: "2026-10-31", end: "2026-11-02", tz: "America/New_York" });
  await addItem(tripId, { title: `Before ${RUN}`, dayNumber: 1, startTime: "09:00", durationMinutes: 120 });
  await addItem(tripId, { title: `After ${RUN}`, dayNumber: 3, startTime: "9:00 AM", durationMinutes: 120 });
  await addItem(tripId, { title: `Unscheduled ${RUN}`, dayNumber: 2 });
  await finalizeTrip(tripId, ownerId);
  const ics = unfold(await body(await mint(tripId)));
  assert.match(ics, /DTSTART;TZID=America\/New_York:20261031T090000/);
  assert.match(ics, /DTSTART;TZID=America\/New_York:20261102T090000/, "same wall clock after the change");
  assert.match(ics, /DTSTART;VALUE=DATE:20261101/, "a stop with no time is all-day, never a guessed hour");
  assert.match(ics, /BEGIN:VTIMEZONE\r\nTZID:America\/New_York/);
  assert.match(ics, /TZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500/, "the fall-back transition");
  assert.match(ics, /DTSTART:20261101T020000\r\nTZOFFSETFROM:-0400/, "transition at 02:00 local");
  assert.doesNotMatch(ics, /DTSTART[^\r\n]*Z\r\n/, "no UTC instants");
});

test("PD8: unconfirmed dates ⇒ mint refused 409 and no events in the feed", async () => {
  await setSwitch("calendar", true);
  const tripId = await seedTrip();
  await addItem(tripId, { title: `Placeholder ${RUN}`, dayNumber: 1, startTime: "09:00", durationMinutes: 60 });
  await finalizeTrip(tripId, ownerId);
  const token = await mint(tripId);
  await db.update(trips).set({ datesConfirmedAt: null } as any).where(eq(trips.id, tripId));
  const ics = await body(token);
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
  await assert.rejects(mintCalendarFeed(tripId, ownerId, BEFORE_TRIP), (e: any) => e.status === 409 && e.code === "dates_unconfirmed");
  const notFinal = await seedTrip();
  await assert.rejects(mintCalendarFeed(notFinal, ownerId, BEFORE_TRIP), (e: any) => e.status === 409 && e.code === "not_final");
});

test("PD9: a non-owner gets 404 everywhere; a trip that changed hands kills its feed", async () => {
  await setSwitch("calendar", true);
  await setSwitch("home_screen", true);
  const tripId = await seedTrip();
  await addItem(tripId, { title: `Mine ${RUN}`, dayNumber: 1, startTime: "09:00", durationMinutes: 60 });
  await finalizeTrip(tripId, ownerId);
  const token = await mint(tripId);
  const is404 = (e: any) => e instanceof PhoneDeliveryRefusal && e.status === 404;
  await assert.rejects(phoneDeliveryState(tripId, otherId, BEFORE_TRIP), is404);
  await assert.rejects(mintCalendarFeed(tripId, otherId, BEFORE_TRIP), is404);
  await assert.rejects(revokeCalendarFeed(tripId, otherId), is404);
  await assert.rejects(recordHomeScreen(tripId, otherId, true), is404);
  await db.update(trips).set({ userId: otherId } as any).where(eq(trips.id, tripId));
  assert.equal((await renderCalendarFeed(token, BEFORE_TRIP)).status, 404);
  await db.update(trips).set({ userId: ownerId } as any).where(eq(trips.id, tripId));
});

test("PD10: opt-out and Home Screen choices are rows with a time; the token is stored hashed", async () => {
  await setSwitch("calendar", true);
  await setSwitch("home_screen", true);
  const tripId = await seedTrip();
  await addItem(tripId, { title: `Choice ${RUN}`, dayNumber: 1, startTime: "09:00", durationMinutes: 60 });
  await finalizeTrip(tripId, ownerId);
  const token = await mint(tripId);
  const [row] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.tripId, tripId));
  assert.equal(row.tokenSha256, feedTokenSha256(token));
  assert.notEqual(row.tokenSha256, token);
  const stored = JSON.stringify(await db.select().from(calendarFeeds).where(eq(calendarFeeds.tripId, tripId)));
  assert.ok(!stored.includes(token), "the raw token is never stored");

  assert.equal(await revokeCalendarFeed(tripId, ownerId), true);
  assert.equal(await revokeCalendarFeed(tripId, ownerId), false, "nothing live ⇒ no second opt-out");
  assert.equal((await renderCalendarFeed(token, BEFORE_TRIP)).status, 404);
  await recordHomeScreen(tripId, ownerId, true);
  await recordHomeScreen(tripId, ownerId, false);
  const choices = await db.select().from(phoneDeliveryChoices).where(eq(phoneDeliveryChoices.tripId, tripId)).orderBy(asc(phoneDeliveryChoices.createdAt));
  assert.deepEqual(choices.map((c) => [c.channel, c.choice]), [
    ["calendar", "opt_in"],
    ["calendar", "opt_out"],
    ["home_screen", "opt_in"],
    ["home_screen", "opt_out"],
  ]);
  const state = await phoneDeliveryState(tripId, ownerId, BEFORE_TRIP);
  assert.equal(state.calendar.active, false);
  assert.equal(state.homeScreen.optedIn, false);
  assert.ok(!JSON.stringify(state).includes(token));
});
