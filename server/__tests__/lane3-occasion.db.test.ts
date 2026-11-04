/**
 * Lane 3 — the plan's occasion (ledger `2026-11-05-lane3-occasion`; migration 438; briefs A-4, A-8, A-34, A-35).
 *
 *   O1  A-8: a guest plan started with no occasion stores none — `event_type` and `occasion_slug` both NULL, never the
 *       column's `vacation` default.
 *   O2  A-4 / A-35: a guest plan started with an occasion stores its slug; the claim keeps it on the row and writes it
 *       into the new owner's pen (`experienceSlug`, `eventType`) — one slug per picker group, proposal included.
 *   O3  A-35: an unknown occasion slug is refused and creates no plan.
 *   O4  A-8: the owner mint with `eventType: null` stores NULL (the body the client mint now sends).
 *   O5  A-35: `PATCH /api/trips/:tripId/occasion` stores the resolved slug on the row and clears it on an explicit null;
 *       `GET /api/trips/:id` answers the row's slug.
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/lane3-occasion.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { experienceTypes, tripCollaborators, trips, users } from "@shared/schema";
import { OCCASION_GROUP_DEFAULT_SLUG } from "@shared/experience-group";
import { eventTypeForSlug } from "@shared/occasions";
import { claimGuestPlans, createGuestPlan, hashGuestSession } from "../services/guest-plan.service";
import { storage } from "../storage";
import tripsRoutes from "../routes/trips.routes";

async function call(method: "GET" | "PATCH", path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId, name: "Lane3 Owner" } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use(tripsRoutes);
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

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const userId = `lane3-user-${tag}`;
const tripIds = new Set<string>();
const insertedTypeIds: string[] = [];
// One slug per picker group (its default) plus the proposal the brief names.
const SLUGS = Array.from(new Set(["proposal", ...Object.values(OCCASION_GROUP_DEFAULT_SLUG)]));

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  await db.insert(users).values({ id: userId, email: `${userId}@example.test`, role: "user" } as any);
  for (const slug of SLUGS) {
    const rows = await db
      .insert(experienceTypes)
      .values({ name: `${slug} (lane3 ${tag})`, slug } as any)
      .onConflictDoNothing({ target: experienceTypes.slug })
      .returning({ id: experienceTypes.id });
    if (rows[0]) insertedTypeIds.push(rows[0].id);
  }
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) {
    await db.execute(sql`DELETE FROM trip_contexts WHERE trip_id IN (${sql.join(t.map((id) => sql`${id}`), sql`, `)})`);
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, t));
    await db.delete(trips).where(inArray(trips.id, t));
  }
  if (insertedTypeIds.length) await db.delete(experienceTypes).where(inArray(experienceTypes.id, insertedTypeIds));
  await db.delete(users).where(eq(users.id, userId));
});

const row = async (id: string) => (await db.select().from(trips).where(eq(trips.id, id)))[0];
const pen = async (owner: string, tripId: string) => {
  const r = await db.execute(sql`SELECT context FROM trip_contexts WHERE user_id = ${owner} AND trip_id = ${tripId}`);
  return ((r.rows?.[0] as any)?.context ?? null) as Record<string, unknown> | null;
};

describe("Lane 3 occasion", () => {
  it("O1 a guest plan with no occasion stores none", async () => {
    const out = await createGuestPlan(hashGuestSession(crypto.randomUUID())!, { destination: "Kyoto, Japan" } as any);
    assert.equal(out.ok, true, JSON.stringify(out));
    const id = (out as any).view.plan.id as string;
    tripIds.add(id);
    const t = await row(id);
    assert.equal(t.eventType, null, "never the column's vacation default");
    assert.equal(t.occasionSlug, null);
  });

  it("O2 the occasion survives the guest plan and the claim, one slug per group", async () => {
    for (const slug of SLUGS) {
      const session = crypto.randomUUID();
      const hash = hashGuestSession(session)!;
      const out = await createGuestPlan(hash, { destination: "Kyoto, Japan", occasionSlug: slug } as any);
      assert.equal(out.ok, true, `${slug}: ${JSON.stringify(out)}`);
      const id = (out as any).view.plan.id as string;
      tripIds.add(id);
      const before = await row(id);
      assert.equal(before.occasionSlug, slug, `${slug} is stored on the guest plan`);
      assert.equal(before.eventType, eventTypeForSlug(slug));

      const claimed = await claimGuestPlans(hash, userId);
      assert.deepEqual(claimed, [id]);
      const after = await row(id);
      assert.equal(after.userId, userId);
      assert.equal(after.occasionSlug, slug, `${slug} is kept by the claim`);
      const p = await pen(userId, id);
      assert.equal(p?.experienceSlug, slug, `${slug} is in the new owner's pen`);
      assert.equal(p?.eventType, eventTypeForSlug(slug));
    }
  });

  it("O3 an unknown occasion is refused and creates nothing", async () => {
    const hash = hashGuestSession(crypto.randomUUID())!;
    const out = await createGuestPlan(hash, { destination: "Kyoto, Japan", occasionSlug: `no-such-${tag}` } as any);
    assert.deepEqual(out, { ok: false, code: "unknown_occasion" });
    const left = await db.select({ id: trips.id }).from(trips).where(eq(trips.guestSessionHash, hash));
    assert.equal(left.length, 0);
  });

  it("O4 the owner mint with eventType null stores no occasion", async () => {
    const trip = await storage.createTrip(
      { title: "Kyoto", destination: "Kyoto, Japan", startDate: "2027-04-09", endDate: "2027-04-11", eventType: null, userId } as any,
      { datesChosenByTraveler: true },
    );
    tripIds.add(trip.id);
    const t = await row(trip.id);
    assert.equal(t.eventType, null);
    assert.equal(t.occasionSlug, null);
  });

  it("O5 the occasion PATCH stores and clears the slug on the row; the trip read answers it", async () => {
    const trip = await storage.createTrip(
      { title: "Kyoto", destination: "Kyoto, Japan", startDate: "2027-05-01", endDate: "2027-05-03", eventType: null, userId } as any,
      { datesChosenByTraveler: true },
    );
    tripIds.add(trip.id);
    const set = await call("PATCH", `/api/trips/${trip.id}/occasion`, { experienceSlug: "proposal" });
    assert.equal(set.status, 200, JSON.stringify(set.json));
    let t = await row(trip.id);
    assert.equal(t.occasionSlug, "proposal");
    assert.equal(t.eventType, eventTypeForSlug("proposal"));
    const read = await call("GET", `/api/trips/${trip.id}`);
    assert.equal(read.status, 200);
    assert.equal(read.json.occasionSlug, "proposal");
    const cleared = await call("PATCH", `/api/trips/${trip.id}/occasion`, { experienceSlug: null });
    assert.equal(cleared.status, 200);
    t = await row(trip.id);
    assert.equal(t.occasionSlug, null);
    const unknown = await call("PATCH", `/api/trips/${trip.id}/occasion`, { experienceSlug: `no-such-${tag}` });
    assert.equal(unknown.status, 400);
    assert.equal((await row(trip.id)).occasionSlug, null, "a refused slug writes nothing");
  });
});
