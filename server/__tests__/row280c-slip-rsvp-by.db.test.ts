/**
 * Row 280c (ledger `2026-10-30-row280c-slip-rsvp-by`): the guest's Trip Slip reads the event's RSVP-by day through
 * the invite anchor item's user_experience reference. No trip-level key dates.
 *
 *   R1  a guest plan whose event has rsvp_by gets rsvpBy on the anchor item only
 *   R2  an event with no rsvp_by gives no rsvpBy key on any item
 *   R3  a non-anchor item that carries a userExperienceId gets no rsvpBy (another event on the plan, and a
 *       later item linked to the same invite event)
 *   R4  the read lives in trip-plan.service.ts and not in storage.ts
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/row280c-slip-rsvp-by.db.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { experienceTypes, itineraryItems, trips, userExperiences, users } from "@shared/schema";
import { eventInvites } from "@shared/guest-invites-schema";
import { assembleTripPlan } from "../services/trip-plan.service";

const RUN = crypto.randomUUID().slice(0, 8);
const RSVP_BY = "2026-11-01";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host === null || !DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[row280c] REFUSING to write fixtures to '${host ?? "<none>"}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

let hostId = "";
let guestId = "";
let experienceTypeId = "";
const tripIds = new Set<string>();
const experienceIds = new Set<string>();

async function guestPlan(label: string, rsvpBy: string | null): Promise<{ tripId: string; experienceId: string }> {
  const hostTrip = await storage.createTrip({
    userId: hostId,
    title: `Host ${label} ${RUN}`,
    destination: "Kyoto",
    startDate: "2026-11-18",
    endDate: "2026-11-22",
  } as any);
  tripIds.add(hostTrip.id);
  const [experience] = await db.insert(userExperiences).values({
    userId: hostId,
    experienceTypeId,
    tripId: hostTrip.id,
    title: `Ceremony ${label} ${RUN}`,
    eventDate: "2026-11-20",
    startTime: "18:30",
    location: "The Garden Hall",
    rsvpBy,
  } as any).returning();
  experienceIds.add(experience.id);
  const token = `r280c-${label}-${RUN}`;
  await db.insert(eventInvites).values({
    experienceId: experience.id,
    organizerId: hostId,
    guestEmail: `guest-${label}-${RUN}@example.com`,
    guestName: "Fixture Guest",
    uniqueToken: token,
    rsvpStatus: "accepted",
  } as any);
  const minted = await storage.createGuestPlanFromInvite({ token, userId: guestId });
  assert.equal(minted.ok, true, JSON.stringify(minted));
  const tripId = (minted as any).tripId as string;
  tripIds.add(tripId);
  return { tripId, experienceId: experience.id };
}

async function activities(tripId: string): Promise<any[]> {
  const plan: any = await assembleTripPlan(tripId, "full");
  return plan.days.flatMap((d: any) => d.activities);
}

describe("row 280c slip rsvp-by", { concurrency: false }, () => {
  before(async () => {
    await assertDisposableDb();
    const [host] = await db.insert(users).values({ email: `r280c-host-${RUN}@example.com`, firstName: "Maya" } as any).returning();
    const [guest] = await db.insert(users).values({ email: `r280c-guest-${RUN}@example.com`, firstName: "Guest" } as any).returning();
    hostId = host.id;
    guestId = guest.id;
    const [type] = await db.insert(experienceTypes).values({ name: `R280c ${RUN}`, slug: `r280c-${RUN}` } as any).returning();
    experienceTypeId = type.id;
  });

  after(async () => {
    await db.execute(sql`DELETE FROM event_invites WHERE unique_token LIKE ${`%${RUN}%`}`).catch(() => {});
    const guestTrips = await db.select({ id: trips.id }).from(trips).where(eq(trips.userId, guestId)).catch(() => []);
    for (const row of guestTrips) tripIds.add(row.id);
    for (const id of tripIds) {
      await db.execute(sql`DELETE FROM content_registry WHERE content_id = ${id}`).catch(() => {});
      await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${id}`).catch(() => {});
    }
    for (const id of experienceIds) await db.delete(userExperiences).where(eq(userExperiences.id, id)).catch(() => {});
    for (const id of tripIds) await db.execute(sql`DELETE FROM trips WHERE id = ${id}`).catch(() => {});
    await db.delete(experienceTypes).where(eq(experienceTypes.id, experienceTypeId)).catch(() => {});
    for (const id of [hostId, guestId]) await db.delete(users).where(eq(users.id, id)).catch(() => {});
  });

  test("R1 the anchor item carries the event's rsvp_by", async () => {
    const { tripId, experienceId } = await guestPlan("r1", RSVP_BY);
    const acts = await activities(tripId);
    const anchors = acts.filter((a) => a.userExperienceId === experienceId);
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].rsvpBy, RSVP_BY);
    assert.equal(acts.filter((a) => "rsvpBy" in a).length, 1);
  });

  test("R2 an event with no rsvp_by gives no rsvpBy key", async () => {
    const { tripId, experienceId } = await guestPlan("r2", null);
    const acts = await activities(tripId);
    assert.equal(acts.filter((a) => a.userExperienceId === experienceId).length, 1);
    for (const a of acts) assert.equal("rsvpBy" in a, false);
  });

  test("R3 a non-anchor item with a userExperienceId gets no rsvpBy", async () => {
    const { tripId, experienceId } = await guestPlan("r3", RSVP_BY);
    const [own] = await db.insert(userExperiences).values({
      userId: guestId,
      experienceTypeId,
      tripId,
      title: `Dinner r3 ${RUN}`,
      eventDate: "2026-11-21",
      rsvpBy: "2026-11-05",
    } as any).returning();
    experienceIds.add(own.id);
    const [ownItem] = await db.insert(itineraryItems).values({
      tripId, title: `Own event ${RUN}`, dayNumber: 1, userExperienceId: own.id, origin: "traveler",
    } as any).returning();
    const [later] = await db.insert(itineraryItems).values({
      tripId, title: `Later ${RUN}`, dayNumber: 1, userExperienceId: experienceId, origin: "traveler",
      createdAt: new Date(Date.now() + 60_000),
    } as any).returning();
    const acts = await activities(tripId);
    const byId = new Map(acts.map((a) => [a.id, a]));
    assert.equal("rsvpBy" in byId.get(ownItem.id), false);
    assert.equal("rsvpBy" in byId.get(later.id), false);
    const carrying = acts.filter((a) => "rsvpBy" in a);
    assert.equal(carrying.length, 1);
    assert.equal(carrying[0].userExperienceId, experienceId);
    assert.equal(carrying[0].rsvpBy, RSVP_BY);
  });

  test("R4 the read is in trip-plan.service.ts, not storage.ts", () => {
    assert.match(readFileSync("server/services/trip-plan.service.ts", "utf8"), /async function resolveInviteAnchorRsvpBy\(/);
    assert.doesNotMatch(readFileSync("server/storage.ts", "utf8"), /resolveInviteAnchorRsvpBy|inviteAnchorRsvpBy/);
  });
});
