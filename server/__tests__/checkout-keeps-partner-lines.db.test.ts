/**
 * THE POST-PAYMENT CART CLEAR KEEPS AN UNLINKED PARTNER LINE (ledger
 * `2026-09-26-checkout-keeps-partner-lines`). DB-backed.
 *
 *   K1 the pure predicate `survivesCheckoutClear` keeps exactly an unlinked content line.
 *   K2 `clearCheckedOutCartLines` deletes the owner's service line and a plan-LINKED content line,
 *      keeps the owner's unlinked content line, and never touches another user's rows.
 *   K3 the SQL and the predicate agree on every seeded row (the one condition, stated twice).
 *   K4 the traveler's own "Clear cart" (`clearCart`) still empties everything.
 *   K5 an empty owner is refused — the clear can never become a table-wide delete.
 *
 * Needs a disposable Postgres with migrations applied and JOURNEY_DB_WRITES_OK=1.
 * Run: npx tsx --test --test-force-exit server/__tests__/checkout-keeps-partner-lines.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { trips, users, cartItems, providerServices, itineraryItems } from "@shared/schema";
import { survivesCheckoutClear } from "@shared/cart-content-line";
import * as cartProjection from "../services/cart-projection.service";

const RUN = crypto.randomUUID().slice(0, 8);

let owner: string;
let other: string;
let serviceId: string;
let tripId: string;
let itemId: string;

async function seedUser(tag: string): Promise<string> {
  const [u] = await db.insert(users).values({ email: `keep-partner-${tag}-${RUN}@t.test` } as any).returning();
  return u.id;
}

async function seedCart(userId: string) {
  const [serviceLine] = await db.insert(cartItems).values({ userId, serviceId, quantity: 1 } as any).returning();
  const [partnerLine] = await db
    .insert(cartItems)
    .values({ userId, quantity: 1, contentType: "hotel", contentId: `hotel-${RUN}-${userId.slice(0, 4)}`, contentMeta: { name: "Partner hotel" } } as any)
    .returning();
  return { serviceLine, partnerLine };
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  owner = await seedUser("owner");
  other = await seedUser("other");
  const [s] = await db.insert(providerServices).values({
    userId: owner,
    serviceName: `Keep-partner fixture ${RUN}`,
    price: "95.00",
    status: "active",
    approvalStatus: "approved",
    location: "Kyoto, Japan",
  } as any).returning();
  serviceId = s.id;
  const [t] = await db.insert(trips).values({
    userId: owner,
    title: `Keep-partner trip ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
  } as any).returning();
  tripId = t.id;
  const [i] = await db.insert(itineraryItems).values({
    tripId,
    title: `Linked partner item ${RUN}`,
    itemType: "activity",
    dayNumber: 1,
  } as any).returning();
  itemId = i.id;
});

after(async () => {
  await db.delete(cartItems).where(inArray(cartItems.userId, [owner, other])).catch(() => {});
  await db.delete(itineraryItems).where(eq(itineraryItems.id, itemId)).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  await db.delete(providerServices).where(eq(providerServices.id, serviceId)).catch(() => {});
  await db.delete(users).where(inArray(users.id, [owner, other])).catch(() => {});
});

test("K1 the predicate keeps exactly an unlinked content line", () => {
  assert.equal(survivesCheckoutClear({ contentType: "hotel", contentId: "hotel-1" }), true);
  assert.equal(survivesCheckoutClear({ serviceId: "s1" }), false, "a checked-out listing goes");
  assert.equal(survivesCheckoutClear({ customVenueId: "v1" }), false, "a custom venue line keeps its old behaviour");
  assert.equal(
    survivesCheckoutClear({ contentType: "itinerary_item", contentId: "i1", itineraryItemId: "i1" }),
    false,
    "a plan projection row is the plan's to rebuild",
  );
  assert.equal(survivesCheckoutClear({ contentType: "hotel" }), false, "no content id ⇒ not a content line");
  assert.equal(survivesCheckoutClear({ contentType: "hotel", contentId: "h", serviceId: "s" }), false);
});

test("K2/K3 the post-payment clear keeps only the owner's unlinked partner line", async () => {
  const mine = await seedCart(owner);
  const [linked] = await db
    .insert(cartItems)
    .values({ userId: owner, quantity: 1, contentType: "itinerary_item", contentId: itemId, itineraryItemId: itemId } as any)
    .returning();
  const theirs = await seedCart(other);

  const before = await db.select().from(cartItems).where(eq(cartItems.userId, owner));
  const predicted = new Set(before.filter((r) => survivesCheckoutClear(r as any)).map((r) => r.id));

  await cartProjection.clearCheckedOutCartLines(owner);

  const left = await db.select().from(cartItems).where(eq(cartItems.userId, owner));
  assert.deepEqual(left.map((r) => r.id), [mine.partnerLine.id], "only the unlinked partner line survives");
  assert.deepEqual(new Set(left.map((r) => r.id)), predicted, "the SQL and the predicate agree (K3)");
  assert.ok(!left.some((r) => r.id === mine.serviceLine.id), "the checked-out listing is cleared");
  assert.ok(!left.some((r) => r.id === linked.id), "the plan projection row is cleared as before");

  const otherLeft = await db.select().from(cartItems).where(eq(cartItems.userId, other));
  assert.deepEqual(
    otherLeft.map((r) => r.id).sort(),
    [theirs.serviceLine.id, theirs.partnerLine.id].sort(),
    "another user's cart is never touched",
  );
});

test("K4 the traveler's own Clear cart still empties everything", async () => {
  await cartProjection.clearCart(owner);
  const left = await db.select().from(cartItems).where(eq(cartItems.userId, owner));
  assert.equal(left.length, 0);
});

test("K5 an empty owner is refused", async () => {
  await assert.rejects(() => cartProjection.clearCheckedOutCartLines(""), /owner required/);
});
