/**
 * Cut-list #1 slice C — the guest's Undo / Change day rails, and the claim's cart lines.
 *
 *   U1  DELETE removes the session's own item through the ONE logged delete (an `item_removed` diary row) and answers
 *       the plan without it
 *   U2  another session's item, a claimed plan's item and an unknown id are one 404; nothing is touched
 *   M1  PATCH moves the session's own item to another day of the plan
 *   M2  a day past the plan's last day is 400 `day_out_of_range`; another session's item is 404; a bad body is 400
 *   K1  on claim the items are kept, and a bookable listing becomes a cart line (ready_for_checkout + cart row)
 *   K2  a request-only listing, a free place and an already-routed item are left as they are
 *   K3  a second projection pass carts nothing new (idempotent)
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cutlist1-slice-c-guest-items.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { cartItems, itemTransitionLog, itineraryItems, trips, users } from "@shared/schema";
import guestPlanRoutes from "../routes/guest-plans.routes";
import { GUEST_SESSION_COOKIE, claimGuestPlans, hashGuestSession, projectClaimedBookableItems } from "../services/guest-plan.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const sessionA = `slicec-a-${tag}-${crypto.randomUUID()}`;
const sessionB = `slicec-b-${tag}-${crypto.randomUUID()}`;
const sessionK = `slicec-k-${tag}-${crypto.randomUUID()}`;
const memberId = `slicec-user-${tag}`;
const sellerId = `slicec-seller-${tag}`;
const instantSvc = crypto.randomUUID();
const requestSvc = crypto.randomUUID();
const tripIds: string[] = [];

async function mkTrip(values: Record<string, unknown>): Promise<string> {
  const [t] = await db
    .insert(trips)
    .values({ title: "Slice C", destination: "Kyoto, Japan", startDate: "2026-11-12", endDate: "2026-11-14", ...values } as any)
    .returning({ id: trips.id });
  tripIds.push(t.id);
  return t.id;
}
async function mkItem(tripId: string, values: Record<string, unknown> = {}): Promise<string> {
  const [i] = await db
    .insert(itineraryItems)
    .values({ tripId, title: "Stop", dayNumber: 1, itemType: "activity", ...values } as any)
    .returning({ id: itineraryItems.id });
  return i.id;
}

let tripA = "";
let itemA = "";
let itemA2 = "";
let tripB = "";
let itemB = "";
let claimedTrip = "";
let claimedItem = "";
let tripK = "";
let kInstant = "";
let kRequest = "";
let kFree = "";
let kRouted = "";

let priorMode: string | null = null;

before(async () => {
  assertDisposableDb();
  // The rails are waitlist-mode only (lane 6's setup); the prior mode is restored in after().
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  priorMode = ((r.rows?.[0] as any)?.setting_value as string | undefined) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', 'waitlist')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'waitlist'`);
  await db.insert(users).values([
    { id: memberId, email: `${memberId}@example.test`, role: "user" },
    { id: sellerId, email: `${sellerId}@example.test`, role: "service_provider" },
  ] as any);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, booking_mode)
    VALUES (${instantSvc}, ${sellerId}, ${`Slice C instant ${tag}`}, 'fixture', '80.00', 'active', 'approved', 'in_person', 'instant'),
           (${requestSvc}, ${sellerId}, ${`Slice C request ${tag}`}, 'fixture', '80.00', 'active', 'approved', 'in_person', 'request')
  `);
  tripA = await mkTrip({ guestSessionHash: hashGuestSession(sessionA) });
  itemA = await mkItem(tripA);
  itemA2 = await mkItem(tripA, { title: "Second" });
  tripB = await mkTrip({ guestSessionHash: hashGuestSession(sessionB) });
  itemB = await mkItem(tripB);
  claimedTrip = await mkTrip({ userId: memberId, guestClaimedAt: new Date(), guestSessionHash: null });
  claimedItem = await mkItem(claimedTrip);
  tripK = await mkTrip({ guestSessionHash: hashGuestSession(sessionK) });
  kInstant = await mkItem(tripK, { title: "Instant", providerServiceId: instantSvc });
  kRequest = await mkItem(tripK, { title: "Request", providerServiceId: requestSvc });
  kFree = await mkItem(tripK, { title: "Free place" });
  kRouted = await mkItem(tripK, { title: "With expert", providerServiceId: instantSvc, routingStatus: "with_expert" });
});

after(async () => {
  if (priorMode == null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMode} WHERE setting_key = 'traveler_signup_mode'`);
  await db.delete(cartItems).where(eq(cartItems.userId, memberId));
  await db.delete(itemTransitionLog).where(inArray(itemTransitionLog.tripId, tripIds));
  await db.delete(trips).where(inArray(trips.id, tripIds));
  await db.execute(sql`DELETE FROM provider_services WHERE id IN (${instantSvc}, ${requestSvc})`);
  await db.delete(users).where(inArray(users.id, [memberId, sellerId]));
});

async function call(method: string, path: string, session: string, body?: unknown): Promise<{ status: number; json: any }> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => false;
    next();
  });
  app.use(guestPlanRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: `${GUEST_SESSION_COOKIE}=${session}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const item = async (id: string) => (await db.select().from(itineraryItems).where(eq(itineraryItems.id, id)))[0];

describe("slice C guest Undo / Change day", () => {
  it("U2 another session's item, a claimed plan's item and an unknown id are one 404", async () => {
    for (const id of [itemB, claimedItem, crypto.randomUUID()]) {
      const r = await call("DELETE", `/api/guest-plans/current/items/${id}`, sessionA);
      assert.equal(r.status, 404, id);
    }
    assert.ok(await item(itemB));
    assert.ok(await item(claimedItem));
  });

  it("M1 PATCH moves the session's own item to another day", async () => {
    const r = await call("PATCH", `/api/guest-plans/current/items/${itemA2}`, sessionA, { dayNumber: 3 });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal((await item(itemA2)).dayNumber, 3);
  });

  it("M2 past the last day is 400, not yours is 404, a bad body is 400", async () => {
    const past = await call("PATCH", `/api/guest-plans/current/items/${itemA2}`, sessionA, { dayNumber: 4 });
    assert.equal(past.status, 400);
    assert.equal(past.json?.code, "day_out_of_range");
    assert.equal((await call("PATCH", `/api/guest-plans/current/items/${itemB}`, sessionA, { dayNumber: 2 })).status, 404);
    assert.equal((await call("PATCH", `/api/guest-plans/current/items/${itemA2}`, sessionA, { dayNumber: 2, title: "x" })).status, 400);
    assert.equal((await item(itemB)).dayNumber, 1);
    assert.equal((await item(itemA2)).dayNumber, 3);
  });

  it("U1 DELETE removes the session's own item and answers the plan without it", async () => {
    const r = await call("DELETE", `/api/guest-plans/current/items/${itemA}`, sessionA);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(await item(itemA), undefined);
    const diary = await db.select().from(itemTransitionLog).where(eq(itemTransitionLog.itemId, itemA));
    assert.ok(diary.some((d) => d.eventType === "item_removed"), "the removal is logged (R15)");
    const ids = JSON.stringify(r.json);
    assert.doesNotMatch(ids, new RegExp(itemA));
    assert.match(ids, new RegExp(itemA2));
    assert.equal((await call("DELETE", `/api/guest-plans/current/items/${itemA}`, sessionA)).status, 404, "a second undo finds nothing");
  });
});

describe("slice C claim → cart lines", () => {
  it("K1/K2 the items are kept; only the bookable listing becomes a cart line", async () => {
    const claimed = await claimGuestPlans(hashGuestSession(sessionK)!, memberId);
    assert.deepEqual(claimed, [tripK]);
    const { carted } = await projectClaimedBookableItems(claimed, memberId);
    assert.deepEqual(carted, [kInstant]);
    assert.equal((await item(kInstant)).routingStatus, "ready_for_checkout");
    assert.equal((await item(kRequest)).routingStatus, "in_planning");
    assert.equal((await item(kFree)).routingStatus, "in_planning");
    assert.equal((await item(kRouted)).routingStatus, "with_expert");
    const lines = await db.select().from(cartItems).where(eq(cartItems.userId, memberId));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].itineraryItemId, kInstant);
    const kept = await db.select({ id: itineraryItems.id }).from(itineraryItems).where(eq(itineraryItems.tripId, tripK));
    assert.equal(kept.length, 4, "every item stays on the plan");
  });

  it("K3 a second pass carts nothing new", async () => {
    const { carted } = await projectClaimedBookableItems([tripK], memberId);
    assert.deepEqual(carted, []);
    assert.equal((await db.select().from(cartItems).where(eq(cartItems.userId, memberId))).length, 1);
  });
});
