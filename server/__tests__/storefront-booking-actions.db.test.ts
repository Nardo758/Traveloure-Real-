/**
 * STOREFRONT BOOKING ACTIONS — ledger `2026-09-25-storefront-booking-actions`.
 *
 * The decision-maker asked for "a Button so the user can book a consulting session" on the expert
 * storefront. This proves the SERVER half `loadStorefront` (storefront.routes.ts) ships:
 *
 *   S1  every APPROVED+ACTIVE listing on the storefront payload carries the ONE server-resolved
 *       `buyAction` (`resolveBuyAction`, shared/buy-action.ts) — the same resolver the public
 *       service detail calls, never a second one (§18 rule 1).
 *   S2  `nextAvailable` is the EARLIEST future slot with remaining capacity
 *       (`booked_count < capacity`) — a fully booked or cancelled slot is never offered.
 *   S3  a listing with no such slot carries `nextAvailable: null` — never a guessed date (§13).
 *   S4  the payload carries NO `users.id` anywhere (LD 40) — mirrors `check-public-user-id.cjs`'s
 *       own predicate for this surface.
 *   S5  an unapproved and a paused listing are both absent from the payload.
 *
 * DISPOSABLE DB ONLY.
 * Run with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure \
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/storefront-booking-actions.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/traveloure";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { db, pool } = await import("../db");
const { users, providerServices, vendorAvailabilitySlots } = await import("../../shared/schema");
const { loadStorefront } = await import("../routes/storefront.routes");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch {
    /* local socket ⇒ NULL ⇒ disposable signal */
  }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) {
    throw new Error(
      `[storefront-booking-actions] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not ` +
        `a recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1. Never against prod.`,
    );
  }
}

const RUN = crypto.randomUUID().slice(0, 8);
const earnerId = crypto.randomUUID();
const earnerHandle = `sba-earner-${RUN}`;

// Four listings: (a) video consult with a future, capacity-remaining slot; (b) call consult with
// a future slot that is FULLY BOOKED (booked_count === capacity, so it must not be "next
// available"); (c) an approved listing with no slots at all; (d) an unapproved listing that must
// never reach the payload.
const videoId = crypto.randomUUID();
const callFullId = crypto.randomUUID();
const noSlotId = crypto.randomUUID();
const unapprovedId = crypto.randomUUID();
const pausedId = crypto.randomUUID();

const FUTURE_DATE = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 10);
  return d.toISOString().slice(0, 10);
})();
const FURTHER_DATE = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 20);
  return d.toISOString().slice(0, 10);
})();
const PAST_DATE = (() => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 5);
  return d.toISOString().slice(0, 10);
})();

test("storefront booking actions (ledger 2026-09-25-storefront-booking-actions)", async (t) => {
  await assertDisposableDb();

  await db.insert(users).values({
    id: earnerId,
    email: `sba-${earnerId.slice(0, 8)}@test.invalid`,
    firstName: "Storefront",
    lastName: `Earner${RUN}`,
    role: "expert",
    handle: earnerHandle,
  } as any);

  await db.insert(providerServices).values([
    {
      id: videoId,
      userId: earnerId,
      serviceName: `Video consult ${RUN}`,
      deliveryMethod: "video",
      bookingMode: "instant",
      price: "150.00",
      priceType: "fixed",
      approvalStatus: "approved",
      status: "active",
    },
    {
      id: callFullId,
      userId: earnerId,
      serviceName: `Call consult (fully booked) ${RUN}`,
      deliveryMethod: "call",
      bookingMode: "instant",
      price: "80.00",
      priceType: "fixed",
      approvalStatus: "approved",
      status: "active",
    },
    {
      id: noSlotId,
      userId: earnerId,
      serviceName: `No-slot consult ${RUN}`,
      deliveryMethod: "call",
      bookingMode: "request",
      price: "80.00",
      priceType: "fixed",
      approvalStatus: "approved",
      status: "active",
    },
    {
      id: unapprovedId,
      userId: earnerId,
      serviceName: `Unapproved listing ${RUN}`,
      deliveryMethod: "video",
      approvalStatus: "submitted",
      status: "active",
    },
    {
      id: pausedId,
      userId: earnerId,
      serviceName: `Paused listing ${RUN}`,
      deliveryMethod: "video",
      approvalStatus: "approved",
      status: "paused",
    },
  ] as any);

  await db.insert(vendorAvailabilitySlots).values([
    // A PAST slot — never "next available".
    { serviceId: videoId, providerId: earnerId, date: PAST_DATE, startTime: "10:00", capacity: 2, bookedCount: 0 },
    // The earliest FUTURE slot with remaining capacity.
    { serviceId: videoId, providerId: earnerId, date: FUTURE_DATE, startTime: "14:00", capacity: 2, bookedCount: 1 },
    // A LATER slot — must not be picked over the earlier one.
    { serviceId: videoId, providerId: earnerId, date: FURTHER_DATE, startTime: "09:00", capacity: 2, bookedCount: 0 },
    // The call-consult listing's only future slot is FULLY BOOKED.
    { serviceId: callFullId, providerId: earnerId, date: FUTURE_DATE, startTime: "11:00", capacity: 1, bookedCount: 1 },
  ] as any);

  t.after(async () => {
    await db.delete(vendorAvailabilitySlots).where(
      inArray(vendorAvailabilitySlots.serviceId, [videoId, callFullId, noSlotId]),
    );
    await db.delete(providerServices).where(eq(providerServices.userId, earnerId));
    await db.delete(users).where(eq(users.id, earnerId));
    await pool.end();
  });

  // A GUEST buyer — buildListingBuyActions only runs when `loadStorefront` receives one
  // (`storefrontBuyActions = buyer ? ... : null` in storefrontFromOwner), same as the real route
  // always supplies via `resolveBuyerState(req)` for a signed-out visitor.
  const payload = await loadStorefront(earnerHandle, undefined, { principal: "guest", plans: "none" });
  assert.ok(payload, "storefront must resolve for an approved earner with approved inventory");

  const byId = new Map((payload as any).services.map((s: any) => [s.id, s]));

  // S5: an unapproved and a paused listing never reach the payload.
  assert.equal(byId.has(unapprovedId), false, "an unapproved (submitted) listing must be absent");
  assert.equal(byId.has(pausedId), false, "a paused listing must be absent");

  // S1: every listed row carries the resolved buyAction.
  const video = byId.get(videoId);
  const callFull = byId.get(callFullId);
  const noSlot = byId.get(noSlotId);
  assert.ok(video, "video listing must be present");
  assert.ok(callFull, "call listing must be present");
  assert.ok(noSlot, "no-slot listing must be present");
  assert.ok(video.buyAction, "video listing must carry a resolved buyAction");
  assert.ok(callFull.buyAction, "call listing must carry a resolved buyAction");
  assert.ok(noSlot.buyAction, "no-slot listing must carry a resolved buyAction");

  // S2/S3: nextAvailable is the earliest future, capacity-remaining slot — never the fully
  // booked one, never the past one, and null when there is none at all.
  assert.deepEqual(
    video.nextAvailable,
    { date: FUTURE_DATE, startTime: "14:00" },
    "the earliest FUTURE slot with remaining capacity, not the past or the later one",
  );
  assert.equal(callFull.nextAvailable, null, "a fully booked slot is never offered as next available");
  assert.equal(noSlot.nextAvailable, null, "a listing with no slots at all reads null, never a guess");

  // S4: no users.id anywhere on the payload (LD 40 posture — mirrors check-public-user-id.cjs).
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes(earnerId), false, "the earner's users.id must never appear on the payload");
});
