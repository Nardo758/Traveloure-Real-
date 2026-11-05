/**
 * Round 3 lane R3-2 (ledger `2026-11-05-r3-entry-city`), the two server rows:
 *   R12 R3-12: `GET /api/landing/recent-plans?market=` answers the listed occasions newest-plan first — order only (no
 *       count, id or time), a slug outside the list never, a plan older than the window never, an unknown market [].
 *   R13 R3-13: `PATCH /api/trips/:id/occasion` stores the slug and derives `event_type` from it through
 *       `eventTypeForSlug` even when the body states another type; an unmapped slug is "other".
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { experienceTypes, trips, users } from "@shared/schema";
import { eventTypeForSlug } from "@shared/occasions";
import { storage } from "../storage";
import tripsRoutes from "../routes/trips.routes";
import landingRoutes from "../routes/landing.routes";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const userId = `r3ec-user-${tag}`;
const tripIds = new Set<string>();
const insertedTypeIds: string[] = [];
const SLUGS = ["proposal", "wedding", "birthday", "retreats"];

async function call(router: any, method: "GET" | "PATCH", path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "R3 Owner" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

async function plan(destination: string, slug: string | null) {
  const trip = await storage.createTrip(
    { title: destination, destination, startDate: "2027-05-01", endDate: "2027-05-03", eventType: null, userId } as any,
    { datesChosenByTraveler: true },
  );
  tripIds.add(trip.id);
  if (slug) await db.update(trips).set({ occasionSlug: slug } as any).where(eq(trips.id, trip.id));
  return trip.id;
}

before(async () => {
  assertDisposableDb();
  await db.insert(users).values({ id: userId, email: `${userId}@example.test`, role: "user" } as any);
  for (const slug of SLUGS) {
    const rows = await db
      .insert(experienceTypes)
      .values({ name: `${slug} (r3 ${tag})`, slug } as any)
      .onConflictDoNothing({ target: experienceTypes.slug })
      .returning({ id: experienceTypes.id });
    if (rows[0]) insertedTypeIds.push(rows[0].id);
  }
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) {
    await db.execute(sql`DELETE FROM trip_contexts WHERE trip_id IN (${sql.join(t.map((id) => sql`${id}`), sql`, `)})`);
    await db.execute(sql`DELETE FROM trip_collaborators WHERE trip_id IN (${sql.join(t.map((id) => sql`${id}`), sql`, `)})`);
    await db.delete(trips).where(inArray(trips.id, t));
  }
  if (insertedTypeIds.length) await db.delete(experienceTypes).where(inArray(experienceTypes.id, insertedTypeIds));
  await db.delete(users).where(eq(users.id, userId));
});

describe("R3-2 server rows", () => {
  it("R12 recent plans: newest first, listed slugs only, inside the window, order only", async () => {
    await plan("Kyoto, Japan", "wedding");
    await new Promise((r) => setTimeout(r, 20));
    await plan("Kyoto, Japan", "proposal");
    await plan("Kyoto, Japan", "retreats");
    let r = await call(landingRoutes, "GET", "/api/landing/recent-plans?market=kyoto");
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json), ["occasions"], "order only: no count, id or time");
    assert.ok(r.json.occasions.every((s: unknown) => typeof s === "string"));
    assert.equal(r.json.occasions[0], "proposal", "the newest plan leads");
    assert.ok(r.json.occasions.indexOf("wedding") > 0);
    assert.ok(!r.json.occasions.includes("retreats"), "a slug outside the rail's list is never answered");

    const old = await plan("Cartagena, Colombia", "birthday");
    await db.execute(sql`UPDATE trips SET created_at = NOW() - INTERVAL '400 days' WHERE id = ${old}`);
    r = await call(landingRoutes, "GET", "/api/landing/recent-plans?market=cartagena");
    assert.ok(!r.json.occasions.includes("birthday"), "a plan older than the window is not recent");

    r = await call(landingRoutes, "GET", "/api/landing/recent-plans?market=atlantis");
    assert.deepEqual(r.json, { occasions: [] });
  });

  it("R13 the occasion PATCH derives event_type from the slug, whatever the body states", async () => {
    const id = await plan("Kyoto, Japan", null);
    let r = await call(tripsRoutes, "PATCH", `/api/trips/${id}/occasion`, { experienceSlug: "wedding", eventType: "vacation" });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    let row = (await db.select().from(trips).where(eq(trips.id, id)))[0];
    assert.equal(row.occasionSlug, "wedding", "the slug is stored");
    assert.equal(row.eventType, eventTypeForSlug("wedding"));
    assert.equal(row.eventType, "wedding");
    r = await call(tripsRoutes, "PATCH", `/api/trips/${id}/occasion`, { experienceSlug: "retreats" });
    assert.equal(r.status, 200);
    row = (await db.select().from(trips).where(eq(trips.id, id)))[0];
    assert.equal(row.occasionSlug, "retreats");
    assert.equal(row.eventType, "other", "an unmapped slug is the map's own 'other'");
  });
});
