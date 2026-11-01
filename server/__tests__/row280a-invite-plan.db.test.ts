/**
 * Row 280a — POST /api/invites/:token/plan (server half).
 *
 * A signed-in guest mints one trip in the event's market on the event date, with one confirmed
 * anchor item. The same user gets that trip back. A different user is 409. A guest who has not
 * accepted is 403. Venue address is copied only because the guest has accepted. The item points
 * at the event so rsvp_by is read through it. No trip-level key date, no Google data.
 *
 *   P1  signed-out → 401; unknown token → 404; nothing written
 *   P2  accepted Kyoto guest, start time 18:30 → 201; one trip; market and zone match the host;
 *       one confirmed item at "18:30"; venue address present; a body user id is ignored
 *   P2b no start time → confirmed, unscheduled, no end and no duration
 *   P3  the same call again → 200, same trip; two concurrent calls still mint one trip
 *   P4  pending / maybe / declined → 403 invite_not_accepted; nothing written
 *   P5  rsvp_by is on the referenced event; null rsvp_by adds no placeholder
 *   P6  market outside the 8, or no event date → 409 named reason; plan_trip_id stays null
 *   P7  the trip and item carry no host contact, organizer id, other guests, budget or host items;
 *       GET /api/invites/:token has no plan_trip_id key
 *   P8  another user with the same token → 409 invite_plan_other_user
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row280a-invite-plan.db.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  experienceTypes,
  itineraryItems,
  temporalAnchors,
  trips,
  userExperiences,
  users,
} from "@shared/schema";
import { eventInvites } from "@shared/guest-invites-schema";
import { projectInviteForGuest } from "../services/guest-invite-landing";
import guestInvitesRoutes from "../routes/guest-invites";

const RUN = crypto.randomUUID().slice(0, 8);
const EVENT_DATE = "2026-11-20";
const RSVP_BY = "2026-11-01";
const VENUE = "The Garden Hall";
const ADDRESS = "12 Garden Lane";
const HOST_LAST = `HostLast${RUN}`;
const HOST_EMAIL = `r280a-host-${RUN}@example.invalid`;
const GUEST_PHONE = `555-${RUN}`;
const OTHER_EMAIL = `other-${RUN}@example.invalid`;
const HOST_ITEM = `HOST-ITEM-${RUN}`;
const BUDGET = "88421.50";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as { addr?: string } | undefined)?.addr) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[row280a] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let hostId = "";
let guestId = "";
let otherUserId = "";
let experienceTypeId = "";
const tripIds = new Set<string>();
const experienceIds = new Set<string>();

async function withGuestRoutes<T>(asUserId: string | null, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (asUserId) {
      (req as any).user = { id: asUserId, claims: { sub: asUserId } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
  app.use(guestInvitesRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function guestTripCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(trips).where(eq(trips.userId, guestId));
  return Number(row?.n ?? 0);
}

async function postPlan(base: string, token: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/api/invites/${token}/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json: any = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
  }
  return { status: res.status, json };
}

async function seedPlan(opts: {
  label: string;
  destination?: string;
  eventDate?: string | null;
  startTime?: string | null;
  rsvpStatus?: string;
  venueAddress?: string | null;
  rsvpBy?: string | null;
  withHostItem?: boolean;
  withOtherGuest?: boolean;
}): Promise<{ token: string; experienceId: string; hostTripId: string }> {
  const hostTrip = await storage.createTrip({
    userId: hostId,
    title: `Host ${opts.label} ${RUN}`,
    destination: opts.destination ?? "Kyoto",
    startDate: "2026-11-18",
    endDate: "2026-11-22",
  } as any);
  tripIds.add(hostTrip.id);

  const [experience] = await db.insert(userExperiences).values({
    userId: hostId,
    experienceTypeId,
    tripId: hostTrip.id,
    title: `Ceremony ${opts.label} ${RUN}`,
    eventDate: opts.eventDate === undefined ? EVENT_DATE : opts.eventDate,
    startTime: opts.startTime === undefined ? "18:30" : opts.startTime,
    location: VENUE,
    venueAddress: opts.venueAddress === undefined ? ADDRESS : opts.venueAddress,
    rsvpBy: opts.rsvpBy === undefined ? RSVP_BY : opts.rsvpBy,
    hostNote: `Note ${RUN}`,
    budget: BUDGET,
    preferences: { hostPhone: GUEST_PHONE },
  } as any).returning();
  experienceIds.add(experience.id);

  const token = `tok-${opts.label}-${RUN}-${crypto.randomUUID().slice(0, 6)}`;
  await db.insert(eventInvites).values({
    experienceId: experience.id,
    organizerId: hostId,
    guestEmail: `guest-${opts.label}-${RUN}@example.invalid`,
    guestName: "Fixture Guest",
    guestPhone: GUEST_PHONE,
    uniqueToken: token,
    rsvpStatus: opts.rsvpStatus ?? "accepted",
  } as any);

  if (opts.withHostItem) {
    await db.insert(itineraryItems).values({
      tripId: hostTrip.id,
      title: HOST_ITEM,
      dayNumber: 1,
      estimatedCost: BUDGET,
      origin: "traveler",
    } as any);
  }
  if (opts.withOtherGuest) {
    await db.insert(eventInvites).values({
      experienceId: experience.id,
      organizerId: hostId,
      guestEmail: OTHER_EMAIL,
      guestName: "Someone Else",
      guestPhone: "555-0100",
      uniqueToken: `other-${opts.label}-${RUN}-${crypto.randomUUID().slice(0, 6)}`,
      rsvpStatus: "pending",
    } as any);
  }
  return { token, experienceId: experience.id, hostTripId: hostTrip.id };
}

function dayOf(value: unknown): string {
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value ?? "").slice(0, 10);
}

describe("row 280a invite plan", { concurrency: false }, () => {
  before(async () => {
    await assertDisposableDb();
    // The held migration is registered. Apply it here too so a database that has not booted
    // since the file landed still has the columns. IF NOT EXISTS, so a second run is a no-op.
    await db.execute(sql`ALTER TABLE event_invites ADD COLUMN IF NOT EXISTS plan_trip_id varchar REFERENCES trips(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE event_invites ADD COLUMN IF NOT EXISTS plan_user_id varchar REFERENCES users(id) ON DELETE SET NULL`);

    const [host] = await db.insert(users).values({ email: HOST_EMAIL, firstName: "Maya", lastName: HOST_LAST } as any).returning();
    const [guest] = await db.insert(users).values({ email: `r280a-guest-${RUN}@example.invalid`, firstName: "Guest" } as any).returning();
    const [other] = await db.insert(users).values({ email: `r280a-other-${RUN}@example.invalid`, firstName: "Other" } as any).returning();
    hostId = host.id;
    guestId = guest.id;
    otherUserId = other.id;

    const [type] = await db.insert(experienceTypes).values({
      name: `R280a ${RUN}`,
      slug: `r280a-${RUN}`,
    } as any).returning();
    experienceTypeId = type.id;
  });

  after(async () => {
    await db.execute(sql`DELETE FROM event_invites WHERE unique_token LIKE ${`%${RUN}%`}`).catch(() => {});
    if (experienceIds.size > 0) {
      const ids = [...experienceIds];
      await db.execute(sql`DELETE FROM itinerary_items WHERE user_experience_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`).catch(() => {});
      await db.execute(sql`DELETE FROM user_experiences WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`).catch(() => {});
    }
    const guestTrips = await db.select({ id: trips.id }).from(trips).where(eq(trips.userId, guestId)).catch(() => []);
    for (const row of guestTrips) tripIds.add(row.id);
    const otherTrips = await db.select({ id: trips.id }).from(trips).where(eq(trips.userId, otherUserId)).catch(() => []);
    for (const row of otherTrips) tripIds.add(row.id);
    for (const id of tripIds) {
      await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM trips WHERE id = ${id}`).catch(() => {});
    }
    await db.delete(experienceTypes).where(eq(experienceTypes.id, experienceTypeId)).catch(() => {});
    for (const id of [hostId, guestId, otherUserId]) {
      await db.delete(users).where(eq(users.id, id)).catch(() => {});
    }
  });

  test("P1 signed-out is 401 and an unknown token is 404, and nothing is written", async () => {
    const beforeCount = await guestTripCount();
    const signedOut = await withGuestRoutes(null, (base) => postPlan(base, "no-such-token"));
    assert.equal(signedOut.status, 401);
    const missing = await withGuestRoutes(guestId, (base) => postPlan(base, `missing-${RUN}`));
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.json, { error: "Invite not found" });
    assert.equal(await guestTripCount(), beforeCount);
  });

  test("P2 an accepted Kyoto guest gets one confirmed anchor at the event time", async () => {
    const seeded = await seedPlan({ label: "p2", withHostItem: true, withOtherGuest: true });
    const host = await storage.getTrip(seeded.hostTripId);
    const { status, json } = await withGuestRoutes(guestId, (base) => postPlan(base, seeded.token, { userId: hostId, tripId: "from-the-body" }));
    assert.equal(status, 201);
    assert.deepEqual(Object.keys(json).sort(), ["tripId"]);
    tripIds.add(json.tripId);

    const trip = await storage.getTrip(json.tripId);
    assert.ok(trip);
    assert.equal(trip.userId, guestId);
    assert.equal(trip.destination, "Kyoto");
    assert.equal(trip.marketSlug, host?.marketSlug);
    assert.equal(trip.timezone, host?.timezone);
    assert.equal(trip.marketSlug, "kyoto");
    assert.equal(trip.timezone, "Asia/Tokyo");
    assert.equal(dayOf(trip.startDate), EVENT_DATE);
    assert.equal(dayOf(trip.endDate), EVENT_DATE);
    assert.equal(trip.datesConfirmedAt, null);
    assert.equal(trip.title, `Ceremony p2 ${RUN}`);

    const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, json.tripId));
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.status, "confirmed");
    assert.equal(item.startTime, "18:30");
    assert.equal(item.endTime, null);
    assert.equal(item.durationMinutes, null);
    assert.equal(item.isFlexible, false);
    assert.equal(item.locationName, VENUE);
    assert.equal(item.locationAddress, ADDRESS);
    assert.equal(item.userExperienceId, seeded.experienceId);
    assert.equal(dayOf(item.scheduledDate), EVENT_DATE);
    assert.equal(item.latitude, null);
    assert.equal(item.longitude, null);

    const anchors = await db.select().from(temporalAnchors).where(eq(temporalAnchors.tripId, json.tripId));
    assert.equal(anchors.length, 0);

    const [invite] = await db.select().from(eventInvites).where(eq(eventInvites.uniqueToken, seeded.token));
    assert.equal(invite.planTripId, json.tripId);
    assert.equal(invite.planUserId, guestId);
  });

  test("P2b no start time is confirmed and unscheduled", async () => {
    const seeded = await seedPlan({ label: "p2b", startTime: null });
    const { status, json } = await withGuestRoutes(guestId, (base) => postPlan(base, seeded.token));
    assert.equal(status, 201);
    tripIds.add(json.tripId);
    const [item] = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, json.tripId));
    assert.equal(item.status, "confirmed");
    assert.equal(item.startTime, null);
    assert.equal(item.endTime, null);
    assert.equal(item.durationMinutes, null);
    assert.equal(item.userExperienceId, seeded.experienceId);
  });

  test("P3 a repeat returns the same trip, and two concurrent calls mint one", async () => {
    const seeded = await seedPlan({ label: "p3" });
    const first = await withGuestRoutes(guestId, (base) => postPlan(base, seeded.token));
    assert.equal(first.status, 201);
    tripIds.add(first.json.tripId);
    const second = await withGuestRoutes(guestId, (base) => postPlan(base, seeded.token));
    assert.equal(second.status, 200);
    assert.deepEqual(second.json, { tripId: first.json.tripId });
    const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, first.json.tripId));
    assert.equal(items.length, 1);

    const raced = await seedPlan({ label: "p3race" });
    const pair = await withGuestRoutes(guestId, async (base) => {
      return Promise.all([postPlan(base, raced.token), postPlan(base, raced.token)]);
    });
    const statuses = pair.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 201]);
    assert.equal(pair[0].json.tripId, pair[1].json.tripId);
    tripIds.add(pair[0].json.tripId);
    const racedItems = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, pair[0].json.tripId));
    assert.equal(racedItems.length, 1);
    const owned = await db.select().from(trips).where(eq(trips.userId, guestId));
    const titled = owned.filter((t) => t.title === `Ceremony p3race ${RUN}`);
    assert.equal(titled.length, 1);
  });

  test("P4 a guest who has not accepted is refused and nothing is written", async () => {
    for (const rsvpStatus of ["pending", "maybe", "declined"] as const) {
      const beforeCount = await guestTripCount();
      const seeded = await seedPlan({ label: rsvpStatus, rsvpStatus });
      const { status, json } = await withGuestRoutes(guestId, (base) => postPlan(base, seeded.token));
      assert.equal(status, 403, rsvpStatus);
      assert.deepEqual(json, { reason: "invite_not_accepted" });
      const [invite] = await db.select().from(eventInvites).where(eq(eventInvites.uniqueToken, seeded.token));
      assert.equal(invite.planTripId, null);
      assert.equal(invite.planUserId, null);
      assert.equal(await guestTripCount(), beforeCount);
    }
  });

  test("P5 rsvp-by stays on the event the item references, and a null date adds nothing", async () => {
    const present = await seedPlan({ label: "p5yes", rsvpBy: RSVP_BY });
    const created = await withGuestRoutes(guestId, (base) => postPlan(base, present.token));
    assert.equal(created.status, 201);
    tripIds.add(created.json.tripId);
    const [item] = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, created.json.tripId));
    assert.equal(item.userExperienceId, present.experienceId);
    const [event] = await db.select().from(userExperiences).where(eq(userExperiences.id, present.experienceId));
    assert.equal(dayOf(event.rsvpBy), RSVP_BY);
    const trip = await storage.getTrip(created.json.tripId);
    // Every *At key is a timestamp of when something happened (createdAt, updatedAt, …), which can fall on
    // RSVP_BY's own day; it is dropped at any depth so the search only sees what the trip says about its plan.
    const dumped = JSON.stringify(trip, (key, value) => (/At$/.test(key) ? undefined : value));
    assert.equal(dumped.includes(RSVP_BY), false);
    const anchors = await db.select().from(temporalAnchors).where(eq(temporalAnchors.tripId, created.json.tripId));
    assert.equal(anchors.length, 0);
    const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, created.json.tripId));
    assert.equal(items.length, 1);
    assert.equal(items.some((row) => dayOf(row.scheduledDate) === RSVP_BY), false);

    const absent = await seedPlan({ label: "p5no", rsvpBy: null });
    const second = await withGuestRoutes(guestId, (base) => postPlan(base, absent.token));
    assert.equal(second.status, 201);
    tripIds.add(second.json.tripId);
    const [event2] = await db.select().from(userExperiences).where(eq(userExperiences.id, absent.experienceId));
    assert.equal(event2.rsvpBy, null);
    const [item2] = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, second.json.tripId));
    assert.equal(item2.userExperienceId, absent.experienceId);
    const only = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, second.json.tripId));
    assert.equal(only.length, 1);
  });

  test("P6 an unresolved market or a missing event date creates nothing", async () => {
    const outside = await seedPlan({ label: "p6market", destination: "Lisbon" });
    const market = await withGuestRoutes(guestId, (base) => postPlan(base, outside.token));
    assert.equal(market.status, 409);
    assert.deepEqual(market.json, { reason: "event_market_unresolved" });
    const [marketInvite] = await db.select().from(eventInvites).where(eq(eventInvites.uniqueToken, outside.token));
    assert.equal(marketInvite.planTripId, null);

    const undated = await seedPlan({ label: "p6date", eventDate: null });
    const beforeCount = await guestTripCount();
    const dated = await withGuestRoutes(guestId, (base) => postPlan(base, undated.token));
    assert.equal(dated.status, 409);
    assert.deepEqual(dated.json, { reason: "event_date_missing" });
    const [dateInvite] = await db.select().from(eventInvites).where(eq(eventInvites.uniqueToken, undated.token));
    assert.equal(dateInvite.planTripId, null);
    assert.equal(await guestTripCount(), beforeCount);
  });

  test("P7 the new trip is guest-safe and the invite GET does not grow a plan id", async () => {
    const seeded = await seedPlan({ label: "p7", withHostItem: true, withOtherGuest: true });
    const created = await withGuestRoutes(guestId, (base) => postPlan(base, seeded.token));
    assert.equal(created.status, 201);
    tripIds.add(created.json.tripId);
    const trip = await storage.getTrip(created.json.tripId);
    const [item] = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, created.json.tripId));
    const dumped = JSON.stringify({ trip, item });
    for (const leaked of [HOST_EMAIL, HOST_LAST, hostId, GUEST_PHONE, OTHER_EMAIL, HOST_ITEM, BUDGET, `guest-p7-${RUN}@example.invalid`]) {
      assert.equal(dumped.includes(leaked), false, leaked);
    }

    const view = projectInviteForGuest({
      id: "invite",
      planTripId: created.json.tripId,
      planUserId: guestId,
      guestEmail: HOST_EMAIL,
      organizerId: hostId,
    });
    assert.equal("planTripId" in view, false);
    assert.equal("planUserId" in view, false);

    const got = await withGuestRoutes(null, async (base) => {
      const res = await fetch(`${base}/api/invites/${seeded.token}`);
      return { status: res.status, json: await res.json() };
    });
    assert.equal(got.status, 200);
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key);
          walk(child);
        }
      }
    };
    walk(got.json);
    assert.equal(keys.has("planTripId"), false);
    assert.equal(keys.has("plan_trip_id"), false);
    assert.equal(keys.has("planUserId"), false);
    assert.equal(keys.has("plan_user_id"), false);
    assert.equal(JSON.stringify(got.json).includes(created.json.tripId), false);
  });

  test("P8 a different user is 409 and the first trip stays the only one", async () => {
    const seeded = await seedPlan({ label: "p8" });
    const first = await withGuestRoutes(guestId, (base) => postPlan(base, seeded.token));
    assert.equal(first.status, 201);
    tripIds.add(first.json.tripId);
    const otherBefore = await db.select().from(trips).where(eq(trips.userId, otherUserId));
    const second = await withGuestRoutes(otherUserId, (base) => postPlan(base, seeded.token));
    assert.equal(second.status, 409);
    assert.deepEqual(second.json, { reason: "invite_plan_other_user" });
    const otherAfter = await db.select().from(trips).where(eq(trips.userId, otherUserId));
    assert.equal(otherAfter.length, otherBefore.length);
    const items = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, first.json.tripId));
    assert.equal(items.length, 1);
    const [invite] = await db.select().from(eventInvites).where(eq(eventInvites.uniqueToken, seeded.token));
    assert.equal(invite.planTripId, first.json.tripId);
    assert.equal(invite.planUserId, guestId);
  });
});
