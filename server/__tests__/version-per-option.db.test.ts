/**
 * VERSION PER OPTION — Track A step A7, ledger `2026-09-30-a7-version-per-option` (product map §M5 /
 * §F2 (3); R128). Against the running server with OPTIMIZER_VERSION_PER_OPTION_ENABLED=1.
 *
 *   O1  the comparison read names each version's option, carries only EARNED badges, and lists the
 *       open set's un-run option as "not run".
 *   O2  adopt-stops: one press appends the plain stop AND chooses the set the pick names
 *       (chosen_via 'version_stop'); the stay is the choose write's own item, never a second copy.
 *   O3  a re-press is a no-op: the stop is already on the plan, the set is already decided.
 *   O4  apply-to-trip: a whole version chooses its set (chosen_via 'version_whole') and its pick is
 *       NOT inserted as an ordinary stop.
 *   O5  a caller who does not own the comparison is refused 404 and nothing is written.
 *
 * STATED NEGATIVE SPACE (§18d): the optimizer's model run is not exercised (no model key in CI) —
 * versions are seeded as rows shaped exactly as the generator writes them; the slot rule and the
 * badge rule are pure and pinned by shared/__tests__/version-options.test.ts.
 *
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/version-per-option.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq, and } from "drizzle-orm";
import { db } from "../db";
import { itineraryComparisons, itineraryVariants, itineraryVariantItems, itineraryItems, planOptionSets } from "@shared/schema";

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
  if (!ok) throw new Error(`[version-per-option] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

interface Actor { id: string; email: string; cookie: string; }
async function registerTraveler(label: string): Promise<Actor> {
  const email = `vpo-${RUN}-${label}@t.test`;
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


async function post(actor: Actor, path: string, body: unknown) {
  return fetch(`${BASE_URL}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: actor.cookie }, body: JSON.stringify(body) });
}

const STAYS = [
  { title: `Gion inn ${RUN}`, lat: 35.0037, lng: 135.7788 },
  { title: `Station hotel ${RUN}`, lat: 34.9858, lng: 135.7588 },
  { title: `Arashiyama ryokan ${RUN}`, lat: 35.0094, lng: 135.6669 },
];

/** A trip with an open stay comparison of three options and a comparison whose two AI versions
 *  each pick one option (the third is "not run"), plus one plain stop on version 1. */
async function seed(owner: Actor) {
  const tripId = await createTrip(owner);
  const created = await post(owner, `/api/trips/${tripId}/option-sets`, { categoryKey: "accommodation", label: "Where you'll stay", anchor: true });
  assert.equal(created.status, 201, await created.clone().text());
  const setId = (await created.json()).set.id as string;
  const optionIds: string[] = [];
  for (const s of STAYS) {
    const r = await post(owner, `/api/trips/${tripId}/option-sets/${setId}/options`, { source: { kind: "custom", title: s.title, lat: s.lat, lng: s.lng } });
    assert.equal(r.status, 201, await r.clone().text());
    optionIds.push((await r.json()).option.id);
  }
  const [cmp] = await db.insert(itineraryComparisons).values({ userId: owner.id, tripId, destination: "Kyoto, Japan" } as any).returning();
  const [v1] = await db.insert(itineraryVariants).values({ comparisonId: cmp.id, name: "V1", source: "ai_optimized", totalCost: "300", totalTravelTime: 90, averageRating: "4.2", sortOrder: 1 } as any).returning();
  const [v2] = await db.insert(itineraryVariants).values({ comparisonId: cmp.id, name: "V2", source: "ai_optimized", totalCost: "300", totalTravelTime: 120, averageRating: "4.6", sortOrder: 2 } as any).returning();
  const pick = (variantId: string, i: number) => ({
    variantId, dayNumber: 1, name: STAYS[i].title, serviceType: "accommodation",
    latitude: String(STAYS[i].lat), longitude: String(STAYS[i].lng), metadata: { optionId: optionIds[i], setId }, sortOrder: -1,
  });
  const [p1] = await db.insert(itineraryVariantItems).values(pick(v1.id, 0) as any).returning();
  const [p2] = await db.insert(itineraryVariantItems).values(pick(v2.id, 1) as any).returning();
  const [stop] = await db.insert(itineraryVariantItems).values({ variantId: v1.id, dayNumber: 1, name: `Tea ceremony ${RUN}`, serviceType: "activity", price: "40.00", sortOrder: 0 } as any).returning();
  return { tripId, setId, optionIds, comparisonId: cmp.id, v1: v1.id, v2: v2.id, p1: p1.id, p2: p2.id, stop: stop.id };
}

let owner: Actor;
let other: Actor;
const tripIds: string[] = [];
const comparisonIds: string[] = [];

before(async () => {
  await assertDisposableDb();
  owner = await registerTraveler("owner");
  other = await registerTraveler("other");
});

after(async () => {
  for (const c of comparisonIds) await db.delete(itineraryComparisons).where(eq(itineraryComparisons.id, c)).catch(() => {});
  for (const t of tripIds) await db.delete(itineraryItems).where(eq(itineraryItems.tripId, t)).catch(() => {});
  if (tripIds.length) await db.execute(sql`DELETE FROM trips WHERE id = ANY(${tripIds})`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE email IN (${owner?.email ?? ""}, ${other?.email ?? ""})`).catch(() => {});
});

let a: Awaited<ReturnType<typeof seed>>;

test("O1 the comparison read names each version's option, earned badges only, and the not-run option", async () => {
  a = await seed(owner);
  tripIds.push(a.tripId);
  comparisonIds.push(a.comparisonId);
  const res = await fetch(`${BASE_URL}/api/itinerary-comparisons/${a.comparisonId}`, { headers: { cookie: owner.cookie } });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw);
  const byId = Object.fromEntries(body.variants.map((v: any) => [v.id, v]));
  assert.equal(byId[a.v1].optionId, a.optionIds[0]);
  assert.equal(byId[a.v2].optionId, a.optionIds[1]);
  assert.deepEqual(byId[a.v1].badges, ["Least travel"], "cost ties 300/300 — no Lowest cost badge");
  assert.deepEqual(byId[a.v2].badges, ["Best rated"]);
  assert.deepEqual(body.notRunOptionIds, [a.optionIds[2]]);
});

test("O2 adopt-stops appends the stop and chooses the picked set, with no second copy of the stay", async () => {
  const res = await post(owner, `/api/itinerary-comparisons/${a.comparisonId}/adopt-stops`, { variantItemIds: [a.stop, a.p1] });
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const body = JSON.parse(raw);
  assert.equal(body.added, 1);
  assert.equal(body.sets.length, 1);
  assert.equal(body.sets[0].decided, true);
  const [set] = await db.select().from(planOptionSets).where(eq(planOptionSets.id, a.setId));
  assert.equal(set.status, "chosen");
  assert.equal(set.chosenOptionId, a.optionIds[0]);
  assert.equal(set.chosenVia, "version_stop");
  const stays = await db.select().from(itineraryItems).where(and(eq(itineraryItems.tripId, a.tripId), eq(itineraryItems.title, STAYS[0].title)));
  assert.equal(stays.length, 1, "the stay is the choose write's one item");
});

test("O3 a re-press is a no-op", async () => {
  const res = await post(owner, `/api/itinerary-comparisons/${a.comparisonId}/adopt-stops`, { variantItemIds: [a.stop, a.p1] });
  const body = JSON.parse(await res.text());
  assert.equal(res.status, 200);
  assert.equal(body.added, 0);
  assert.deepEqual(body.alreadyInPlan, [a.stop]);
  assert.equal(body.sets[0].decided, false);
  assert.equal(body.sets[0].reason, "set_decided");
  const stops = await db.select().from(itineraryItems).where(and(eq(itineraryItems.tripId, a.tripId), eq(itineraryItems.title, `Tea ceremony ${RUN}`)));
  assert.equal(stops.length, 1);
});

test("O4 apply-to-trip: a whole version chooses its set and never inserts its pick as a stop", async () => {
  const b = await seed(owner);
  tripIds.push(b.tripId);
  comparisonIds.push(b.comparisonId);
  await db.update(itineraryComparisons).set({ selectedVariantId: b.v2 } as any).where(eq(itineraryComparisons.id, b.comparisonId));
  const res = await post(owner, `/api/itinerary-comparisons/${b.comparisonId}/apply-to-trip`, {});
  const raw = await res.text();
  assert.equal(res.status, 200, raw);
  const [set] = await db.select().from(planOptionSets).where(eq(planOptionSets.id, b.setId));
  assert.equal(set.status, "chosen");
  assert.equal(set.chosenOptionId, b.optionIds[1]);
  assert.equal(set.chosenVia, "version_whole");
  const stays = await db.select().from(itineraryItems).where(and(eq(itineraryItems.tripId, b.tripId), eq(itineraryItems.title, STAYS[1].title)));
  assert.equal(stays.length, 1, "one stay — the choose write's, not an extra adopted stop");
  assert.equal(stays[0].itemType, "accommodation");
});

test("O5 a caller who does not own the comparison is refused 404 and nothing is written", async () => {
  const c = await seed(owner);
  tripIds.push(c.tripId);
  comparisonIds.push(c.comparisonId);
  const res = await post(other, `/api/itinerary-comparisons/${c.comparisonId}/adopt-stops`, { variantItemIds: [c.stop] });
  assert.equal(res.status, 404);
  const rows = await db.select().from(itineraryItems).where(eq(itineraryItems.tripId, c.tripId));
  assert.equal(rows.length, 0);
  const [set] = await db.select().from(planOptionSets).where(eq(planOptionSets.id, c.setId));
  assert.equal(set.status, "open");
});
