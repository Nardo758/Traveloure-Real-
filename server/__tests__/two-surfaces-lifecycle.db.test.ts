/**
 * TWO-SURFACES LIFECYCLE — Trip Card rebuild Phase 5 integration suite (the seam test).
 *
 * Each rebuild phase shipped its own unit proofs (finalize F1–F5, snapshot-render R1–R4, mid-trip
 * M1–M2, trips-list L1–L3). This walks the WHOLE model in ONE narrative so the SEAMS between them
 * are covered — the places a per-phase test can't reach because it owns only one stage:
 *
 *   S1  plan → Make final (v1): getTrips reports finalVersion=1 AND assembleTripPlan renders the
 *       frozen v1 snapshot. (Finalize seam → both read surfaces at once.)
 *   S2  buy a NEW service mid-trip on the finalized trip → the version bump (v2) shows up in BOTH
 *       the rendered snapshot (the bought item is in it) AND the My Plans finalVersion (2). This is
 *       the seam Phase-4's M-tests and L-tests each see only one half of.
 *   S3  a booking-STATUS change on an existing snapshot item forks NO version — the render still
 *       reads v2, getTrips still reports 2, and the live status is overlaid, not frozen.
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test --test-concurrency=1 server/__tests__/two-surfaces-lifecycle.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { trips, users, itineraryItems, tripFinals } from "@shared/schema";
import { finalizeTrip, reFinalizeIfCurrentlyFinal } from "../services/trip-finalize.service";
import { assembleTripPlan } from "../services/trip-plan.service";
import { storage } from "../storage";

const RUN = crypto.randomUUID().slice(0, 8);

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[two-surfaces-lifecycle] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

let userId: string;
let tripId: string;
const createdTrips: string[] = [];
let existingItemId: string;

const ORIGINAL = `Original stop ${RUN}`;
const BOUGHT = `Booked tea ceremony ${RUN}`;

async function addItem(title: string, opts: { routingStatus?: string; status?: string } = {}): Promise<string> {
  const [it] = await db.insert(itineraryItems).values({
    tripId,
    title,
    dayNumber: 1,
    origin: "ai",
    routingStatus: opts.routingStatus ?? "in_planning",
    status: opts.status ?? "planned",
  } as any).returning();
  return it.id;
}

function snapshotTitles(plan: any): Set<string> {
  const titles = new Set<string>();
  for (const d of (plan.days ?? [])) for (const a of (d.activities ?? [])) titles.add(a.title);
  return titles;
}

async function finalVersionFromList(): Promise<number | null> {
  const list = await storage.getTrips(userId);
  return list.find((t) => t.id === tripId)?.finalVersion ?? null;
}

before(async () => {
  await assertDisposableDb();
  const [u] = await db.insert(users).values({ email: `twosurf-${RUN}@t.test` } as any).returning();
  userId = u.id;
  const [t] = await db.insert(trips).values({
    userId,
    title: `Two-surfaces ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    numberOfTravelers: 2,
  } as any).returning();
  tripId = t.id;
  createdTrips.push(t.id);
  existingItemId = await addItem(ORIGINAL);
});

after(async () => {
  for (const t of createdTrips) {
    await db.delete(tripFinals).where(eq(tripFinals.tripId, t)).catch(() => {});
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${createdTrips})`).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

test("S1 Make final → both read surfaces agree: finalVersion=1 and the frozen v1 snapshot renders", async () => {
  const first = await finalizeTrip(tripId, userId);
  assert.equal(first.version, 1, "Make final writes v1");

  // Read surface 1 — the My Plans list (getTrips).
  assert.equal(await finalVersionFromList(), 1, "My Plans list reports finalVersion=1");

  // Read surface 2 — the Trip Card render (assembleTripPlan on a finalized trip renders the snapshot).
  const plan: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId });
  assert.ok(snapshotTitles(plan).has(ORIGINAL), "the frozen v1 snapshot renders the original stop");
});

test("S2 a NEW service bought mid-trip forks v2 and shows in BOTH the snapshot AND the list", async () => {
  // The affiliate-booking-agent confirm writes a NEW confirmed item onto the trip; buying is the
  // acceptance, so purchase completion re-finalizes a currently-finalized trip.
  await addItem(BOUGHT, { routingStatus: "in_planning", status: "confirmed" });
  const bumped = await reFinalizeIfCurrentlyFinal(tripId, userId);
  assert.equal(bumped, 2, "a new bought item on a finalized trip forks v2");

  // The seam: the version bump is visible on BOTH surfaces from the SAME purchase.
  assert.equal(await finalVersionFromList(), 2, "My Plans list advances to finalVersion=2");

  const plan: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId });
  const titles = snapshotTitles(plan);
  assert.ok(titles.has(BOUGHT), "the v2 snapshot the Trip Card renders includes the bought item");
  assert.ok(titles.has(ORIGINAL), "the original stop is still in the v2 snapshot");
});

test("S3 a booking-status change on an existing item forks NO version — status overlaid, not frozen", async () => {
  // markItemPurchased-shape flip on an item already in the plan: fingerprint excludes booking status.
  await db.update(itineraryItems)
    .set({ routingStatus: "purchased", bookingStatus: "confirmed" } as any)
    .where(eq(itineraryItems.id, existingItemId));

  const bumped = await reFinalizeIfCurrentlyFinal(tripId, userId);
  assert.equal(bumped, null, "a booking-status-only change never forks a version");

  // Both surfaces still read v2 — no spurious v3.
  assert.equal(await finalVersionFromList(), 2, "My Plans list still reports finalVersion=2");
  const finalsCount = await db.select({ n: sql<number>`count(*)::int` }).from(tripFinals).where(eq(tripFinals.tripId, tripId));
  assert.equal(finalsCount[0].n, 2, "still exactly two final versions (v1, v2 — no v3)");

  // The live status overlays onto the frozen snapshot item (render still shows the original stop).
  const plan: any = await assembleTripPlan(tripId, "full", { tripRole: "owner", viewerId: userId });
  assert.ok(snapshotTitles(plan).has(ORIGINAL), "the frozen snapshot item still renders (with live status overlaid)");
});
