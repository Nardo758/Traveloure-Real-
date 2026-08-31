/**
 * ADOPT VERSION SEMANTICS — adopt = merge, finalize = lock (adopt-finalize-conform D-1a + D-4).
 *
 * The decision-maker's ruled assertions, verbatim: "adopt on an un-final trip → zero trip_finals
 * rows; adopt on a final trip → v+1; neither path sets finalized_at." Both adopt paths are proven —
 * whole-variant apply-to-trip (which previously LACKED the auto-v+1 call adopt-stop had; that
 * inconsistency was the D-1 bug) and per-stop adopt-stop (regression of the ratified behavior,
 * 2026-08-31-trip-card-snapshot-render). Plus the D-4 ruling (R-B wins): proposals stay
 * REVISITABLE — apply no longer discards the losing variants (supersedes ruling 14's R3 clause).
 *
 * Proven:
 *   V1  apply-to-trip on an UN-final trip merges and writes ZERO trip_finals rows; finalized_at NULL.
 *   V2  adopt-stop on an UN-final trip appends and writes ZERO trip_finals rows; finalized_at NULL.
 *   V3  apply-to-trip on a CURRENTLY-final trip → v+1, and the new snapshot is the applied plan;
 *       finalized_at stays set (adopt never flips the lock either way).
 *   V4  adopt-stop on a CURRENTLY-final trip → v+1 including the adopted stop (ratified regression).
 *   V5  after two applies, ALL variants still exist — losers are not discarded (D-4/R-B).
 *
 * Runs against the ALREADY-RUNNING dev server (http://127.0.0.1:5000). DISPOSABLE DB ONLY.
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/adopt-version-semantics.db.test.ts
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
  tripFinals,
  trips,
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
  if (!ok) throw new Error(`[adopt-version] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

type Actor = { id: string; email: string; cookie: string };

async function registerTraveler(label: string): Promise<Actor> {
  const email = `av-${label}-${RUN}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "AV", lastName: label, userType: "user" }),
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

async function applyToTrip(actor: Actor, cid: string) {
  return fetch(`${BASE_URL}/api/itinerary-comparisons/${cid}/apply-to-trip`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: actor.cookie },
  });
}
async function adoptStop(actor: Actor, cid: string, variantItemId: string) {
  return fetch(`${BASE_URL}/api/itinerary-comparisons/${cid}/adopt-stop`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: actor.cookie },
    body: JSON.stringify({ variantItemId }),
  });
}
async function finalize(actor: Actor, tId: string) {
  return fetch(`${BASE_URL}/api/trips/${tId}/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: actor.cookie },
  });
}
async function finalsState(tId: string) {
  const rows = await db.select().from(tripFinals).where(eq(tripFinals.tripId, tId));
  const [trip] = await db.select({ finalizedAt: trips.finalizedAt }).from(trips).where(eq(trips.id, tId));
  const maxVersion = rows.reduce((m, r: any) => Math.max(m, r.version), 0);
  const latest: any = rows.find((r: any) => r.version === maxVersion) ?? null;
  return { count: rows.length, maxVersion, latest, finalizedAt: trip?.finalizedAt ?? null };
}
function snapshotTitles(final: any): Set<string> {
  return new Set(((final?.snapshot as any)?.items ?? []).map((i: any) => i.title));
}

let owner: Actor;
let tripId: string;
let comparisonId: string;
let variantAId: string;
let variantBId: string;
let itemA2Id: string;
const A1 = `Bamboo walk ${RUN}`;
const A2 = `Night market ${RUN}`;
const B1 = `River supper ${RUN}`;

before(async () => {
  await assertDisposableDb();
  owner = await registerTraveler("owner");
  tripId = await createTrip(owner);

  const [cmp] = await db.insert(itineraryComparisons).values({
    userId: owner.id,
    tripId,
    destination: "Kyoto, Japan",
  } as any).returning();
  comparisonId = cmp.id;

  const [vA] = await db.insert(itineraryVariants).values({ comparisonId, name: "V-A", source: "ai" } as any).returning();
  variantAId = vA.id;
  const [vB] = await db.insert(itineraryVariants).values({ comparisonId, name: "V-B", source: "ai" } as any).returning();
  variantBId = vB.id;

  await db.insert(itineraryVariantItems).values({ variantId: variantAId, dayNumber: 1, name: A1, serviceType: "activity", sortOrder: 0 } as any);
  const [a2] = await db.insert(itineraryVariantItems).values({ variantId: variantAId, dayNumber: 2, name: A2, serviceType: "activity", sortOrder: 1 } as any).returning();
  itemA2Id = a2.id;
  await db.insert(itineraryVariantItems).values({ variantId: variantBId, dayNumber: 1, name: B1, serviceType: "dining", sortOrder: 0 } as any);
});

after(async () => {
  await db.delete(tripFinals).where(eq(tripFinals.tripId, tripId)).catch(() => {});
  await db.delete(itineraryItems).where(eq(itineraryItems.tripId, tripId)).catch(() => {});
  await db.delete(itineraryComparisons).where(eq(itineraryComparisons.id, comparisonId)).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE email = ${owner.email}`).catch(() => {});
});

test("V1 apply-to-trip on an UN-final trip: merges, zero trip_finals, finalized_at stays NULL", async () => {
  await db.update(itineraryComparisons).set({ selectedVariantId: variantAId } as any).where(eq(itineraryComparisons.id, comparisonId));
  const res = await applyToTrip(owner, comparisonId);
  assert.equal(res.status, 200, await res.text());

  const items = await db.select().from(itineraryItems)
    .where(and(eq(itineraryItems.tripId, tripId), eq(itineraryItems.title, A1)));
  assert.equal(items.length, 1, "the variant's stop is merged onto the trip");

  const s = await finalsState(tripId);
  assert.equal(s.count, 0, "adopt on an un-final trip writes ZERO trip_finals rows");
  assert.equal(s.finalizedAt, null, "adopt never sets finalized_at");
});

test("V2 adopt-stop on an UN-final trip: appends, zero trip_finals, finalized_at stays NULL", async () => {
  // Adopt B1 from the losing variant — proves per-stop pull works cross-variant, still no lock.
  const bItems = await db.select().from(itineraryVariantItems).where(eq(itineraryVariantItems.variantId, variantBId));
  const res = await adoptStop(owner, comparisonId, (bItems[0] as any).id);
  const body = JSON.parse(await res.text());
  assert.equal(body.adopted, true);

  const s = await finalsState(tripId);
  assert.equal(s.count, 0, "still zero trip_finals rows");
  assert.equal(s.finalizedAt, null, "finalized_at still NULL");
});

test("V3 apply-to-trip on a CURRENTLY-final trip: v+1 with the applied plan; lock untouched", async () => {
  const fin = await finalize(owner, tripId);
  assert.equal(fin.status, 200, await fin.text());
  let s = await finalsState(tripId);
  assert.equal(s.maxVersion, 1, "Finalize Plan writes v1");
  assert.ok(s.finalizedAt, "finalize sets the lock");

  // Apply the OTHER variant — a real plan change (A1 replaced by B1's plan), so the ratified
  // auto-v+1 must capture v2. This is the exact call apply-to-trip previously never made.
  await db.update(itineraryComparisons).set({ selectedVariantId: variantBId } as any).where(eq(itineraryComparisons.id, comparisonId));
  const res = await applyToTrip(owner, comparisonId);
  assert.equal(res.status, 200, await res.text());

  s = await finalsState(tripId);
  assert.equal(s.maxVersion, 2, "whole-variant adopt on a final trip lands on the card as v2");
  assert.ok(s.finalizedAt, "the lock is not flipped by adopting");
  assert.ok(snapshotTitles(s.latest).has(B1), "the v2 snapshot is the applied plan");
});

test("V4 adopt-stop on a CURRENTLY-final trip: v+1 including the adopted stop (ratified regression)", async () => {
  const res = await adoptStop(owner, comparisonId, itemA2Id);
  const body = JSON.parse(await res.text());
  assert.equal(body.adopted, true, JSON.stringify(body));

  const s = await finalsState(tripId);
  assert.equal(s.maxVersion, 3, "per-stop adopt on a final trip forks v3");
  assert.ok(s.finalizedAt, "lock still untouched");
  assert.ok(snapshotTitles(s.latest).has(A2), "the v3 snapshot includes the adopted stop");
});

test("V5 proposals stay revisitable: no variant was discarded by either apply (D-4/R-B)", async () => {
  const variants = await db.select().from(itineraryVariants).where(eq(itineraryVariants.comparisonId, comparisonId));
  const names = new Set(variants.map((v: any) => v.name));
  assert.equal(variants.length, 2, "both variants survive two applies — losers are no longer deleted");
  assert.ok(names.has("V-A") && names.has("V-B"), "winner AND loser both present");
});
