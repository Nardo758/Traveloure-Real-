/**
 * ADOPT-STOP — behavioural proof of the per-stop adopt endpoint
 * (ratified mock "Adopt the Optimization" → the "+" ticks pull a SINGLE variant stop into the
 * plan). POST /api/itinerary-comparisons/:id/adopt-stop (server/routes/plancard.routes.ts).
 *
 * Proven:
 *   A1  adopt APPENDS exactly one itinerary_items row, server-read from the variant row:
 *       title/day/estimatedCost from the variant item, origin server-stamped 'ai' (§12),
 *       providerServiceId preserved as the honest null for an AI-invented stop (linkage guard).
 *   A2  §14: the amount is the variant row's own price, never a client body value — a crafted
 *       body price is ignored (only variantItemId is read).
 *   A3  dedup: adopting the SAME stop again does not create a second copy ({adopted:false}).
 *   A4  security: a DIFFERENT user cannot adopt a stop out of someone else's comparison (404),
 *       and no item is created on the victim trip.
 *
 * Runs against the ALREADY-RUNNING dev server (http://127.0.0.1:5000). DISPOSABLE DB ONLY.
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/adopt-stop.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq, and } from "drizzle-orm";
import { db } from "../db";
import {
  itineraryComparisons,
  itineraryVariants,
  itineraryVariantItems,
  itineraryItems,
} from "@shared/schema";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
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
  if (!ok) throw new Error(`[adopt-stop] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

interface Actor { id: string; email: string; cookie: string; }
async function registerTraveler(label: string): Promise<Actor> {
  const email = `adopt-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "AD", lastName: label, userType: "user" }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const body = await res.json();
  return { id: body.user.id as string, email, cookie };
}

async function createTrip(actor: Actor): Promise<string> {
  const start = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 33 * 86400_000).toISOString().slice(0, 10);
  const res = await fetch(`${BASE_URL}/api/trips`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: actor.cookie },
    body: JSON.stringify({ title: "Kyoto trip", destination: "Kyoto, Japan", startDate: start, endDate: end }),
  });
  if (res.status >= 300) assert.fail(`create trip failed (${res.status}): ${await res.text()}`);
  return (await res.json()).id as string;
}

async function adopt(actor: Actor, comparisonId: string, variantItemId: string, extraBody: Record<string, unknown> = {}) {
  return fetch(`${BASE_URL}/api/itinerary-comparisons/${comparisonId}/adopt-stop`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: actor.cookie },
    body: JSON.stringify({ variantItemId, ...extraBody }),
  });
}

let owner: Actor;
let other: Actor;
let tripId: string;
let comparisonId: string;
let variantItemId: string;
const STOP_NAME = `Tea ceremony ${RUN}`;
const STOP_PRICE = "42.00";
const cleanupComparisonIds: string[] = [];
const cleanupTripIds: string[] = [];

before(async () => {
  await assertDisposableDb();
  owner = await registerTraveler("owner");
  other = await registerTraveler("other");
  tripId = await createTrip(owner);
  cleanupTripIds.push(tripId);

  const [cmp] = await db.insert(itineraryComparisons).values({
    userId: owner.id,
    tripId,
    destination: "Kyoto, Japan",
  } as any).returning();
  comparisonId = cmp.id;
  cleanupComparisonIds.push(comparisonId);

  const [variant] = await db.insert(itineraryVariants).values({
    comparisonId,
    name: "V1",
    source: "ai",
  } as any).returning();

  const [item] = await db.insert(itineraryVariantItems).values({
    variantId: variant.id,
    dayNumber: 1,
    name: STOP_NAME,
    serviceType: "activity",
    price: STOP_PRICE,
    sortOrder: 0,
  } as any).returning();
  variantItemId = item.id;
});

after(async () => {
  // itinerary_items + comparison cascade (variants/items ON DELETE CASCADE); delete the trip too.
  for (const t of cleanupTripIds) {
    await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  }
  for (const c of cleanupComparisonIds) {
    await db.delete(itineraryComparisons).where(eq(itineraryComparisons.id, c)).catch(() => {});
  }
  await db.execute(sql`DELETE FROM trips WHERE id = ANY(${cleanupTripIds})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE email IN (${owner.email}, ${other.email})`).catch(() => {});
});

test("A1/A2 adopt appends one server-read item: origin 'ai', price from the row, body price ignored", async () => {
  // A2: a crafted body price must be ignored — only variantItemId is read.
  const res = await adopt(owner, comparisonId, variantItemId, { price: "999999.99", origin: "traveler" });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw);
  assert.equal(body.adopted, true);

  const rows = await db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.title, STOP_NAME)));
  assert.equal(rows.length, 1, "exactly one item appended");
  const row: any = rows[0];
  assert.equal(row.origin, "ai", "origin server-stamped 'ai' (§12), not the body's 'traveler'");
  assert.equal(String(row.estimatedCost), STOP_PRICE, "amount from the variant row (§14), not the body's 999999.99");
  assert.equal(row.providerServiceId ?? null, null, "honest null linkage for an AI-invented stop");
});

test("A3 dedup: adopting the same stop again does not create a second copy", async () => {
  const res = await adopt(owner, comparisonId, variantItemId);
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw);
  assert.equal(body.adopted, false);
  assert.equal(body.reason, "already-in-plan");

  const rows = await db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.title, STOP_NAME)));
  assert.equal(rows.length, 1, "still exactly one — no second copy");
});

test("A4 security: another user cannot adopt a stop from someone else's comparison (404, no write)", async () => {
  const res = await adopt(other, comparisonId, variantItemId);
  assert.equal(res.status, 404, `expected 404, got ${res.status}: ${await res.text()}`);
  // The victim trip is unchanged — still exactly the one item the owner adopted.
  const rows = await db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.title, STOP_NAME)));
  assert.equal(rows.length, 1);
});
