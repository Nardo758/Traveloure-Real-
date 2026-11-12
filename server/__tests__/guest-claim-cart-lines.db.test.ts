/**
 * Cut-list #1 slice D — sign-in claims the guest plan in place, and its bookable items become cart lines.
 *
 *   D1 an instant listing + a gem + an affiliate_bookable partner product ⇒ exactly ONE cart line, keyed on the listing
 *      item, owned by the new user; every item stays on the plan; the claimed plan is the member's
 *   D2 a second claim (same session) claims nothing and adds no line
 *   D3 a stranger's session hash claims nothing
 *   D4 a forced projection failure ⇒ the claim still commits, a warn line is logged, no cart line; a later
 *      syncItemProjection of that item writes it; one item's failure never stops the next item
 *   D5 a cookies-off claim names the guest through its id (the A-10 fallback) and still claims and carts
 *   D6 merge: a member who already had a plan keeps it; the claimed plan is added beside it (nothing deleted)
 *
 * Disposable database only. Every row this file writes is removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/guest-claim-cart-lines.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { cartItems, itemTransitionLog, itineraryItems, tripCollaborators, trips, users } from "@shared/schema";
import guestPlansRoutes from "../routes/guest-plans.routes";
import { claimGuestPlans, hashGuestSession, projectClaimedBookableItems } from "../services/guest-plan.service";
import { syncItemProjection } from "../services/cart-projection.service";
import { logger } from "../infrastructure/logger";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const memberId = `slice-d-user-${tag}`;
const member2Id = `slice-d-user2-${tag}`;
const sellerId = `slice-d-seller-${tag}`;
const instantSvc = crypto.randomUUID();
const partnerId = `slice-d-partner-${tag}`;
const partnerProduct = `slice-d-product-${tag}`;
const tripIds: string[] = [];
const sessionA = `slice-d-a-${tag}-${crypto.randomUUID()}`;
const sessionF = `slice-d-f-${tag}-${crypto.randomUUID()}`;
const sessionH = `slice-d-h-${tag}-${crypto.randomUUID()}`;

async function mkTrip(values: Record<string, unknown>): Promise<string> {
  const [t] = await db
    .insert(trips)
    .values({ title: "Slice D", destination: "Kyoto, Japan", startDate: "2026-11-12", endDate: "2026-11-14", ...values } as any)
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
const item = async (id: string) => (await db.select().from(itineraryItems).where(eq(itineraryItems.id, id)))[0];
const linesFor = (userId: string) => db.select().from(cartItems).where(eq(cartItems.userId, userId));

/** A guest plan holding an instant listing, a gem and an affiliate_bookable partner product. */
async function guestPlanWithThree(session: string) {
  const tripId = await mkTrip({ guestSessionHash: hashGuestSession(session) });
  const listing = await mkItem(tripId, { title: "Tea ceremony", providerServiceId: instantSvc });
  const gem = await mkItem(tripId, { title: "Quiet garden", contentType: "gem", contentId: `gem-${tag}` });
  const partner = await mkItem(tripId, { title: "Partner tour", affiliateProductId: partnerProduct });
  return { tripId, listing, gem, partner };
}

before(async () => {
  assertDisposableDb();
  await db.insert(users).values([
    { id: memberId, email: `${memberId}@example.test`, role: "user" },
    { id: member2Id, email: `${member2Id}@example.test`, role: "user" },
    { id: sellerId, email: `${sellerId}@example.test`, role: "service_provider" },
  ] as any);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, description, price, status, approval_status, delivery_method, booking_mode)
    VALUES (${instantSvc}, ${sellerId}, ${`Slice D instant ${tag}`}, 'fixture', '80.00', 'active', 'approved', 'in_person', 'instant')
  `);
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category) VALUES (${partnerId}, ${`Partner ${tag}`}, 'https://partner.example.test', 'tours')`);
  await db.execute(sql`
    INSERT INTO affiliate_products (id, partner_id, name, product_url, booking_type)
    VALUES (${partnerProduct}, ${partnerId}, 'Partner tour', 'https://partner.example.test/tour', 'affiliate_bookable')
  `);
});

after(async () => {
  for (const u of [memberId, member2Id]) await db.delete(cartItems).where(eq(cartItems.userId, u));
  if (tripIds.length) {
    await db.delete(itemTransitionLog).where(inArray(itemTransitionLog.tripId, tripIds));
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, tripIds));
    await db.delete(trips).where(inArray(trips.id, tripIds));
  }
  await db.execute(sql`DELETE FROM affiliate_products WHERE id = ${partnerProduct}`);
  await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${partnerId}`);
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${instantSvc}`);
  await db.delete(users).where(inArray(users.id, [memberId, member2Id, sellerId]));
});

describe("slice D — claim in place, cart lines", () => {
  it("D1/D6 one cart line for the instant listing; every item stays; the member's existing plan stays beside it", async () => {
    const existing = await mkTrip({ userId: memberId, title: "Member's own plan" });
    const g = await guestPlanWithThree(sessionA);
    const claimed = await claimGuestPlans(hashGuestSession(sessionA)!, memberId);
    assert.deepEqual(claimed, [g.tripId]);
    const { carted } = await projectClaimedBookableItems(claimed, memberId);
    assert.deepEqual(carted, [g.listing]);
    const lines = await linesFor(memberId);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].itineraryItemId, g.listing);
    assert.equal((await item(g.listing)).routingStatus, "ready_for_checkout");
    assert.equal((await item(g.gem)).routingStatus, "in_planning", "a gem is never carted");
    assert.equal((await item(g.partner)).routingStatus, "in_planning", "an affiliate_bookable product keeps its status");
    const plans = await db.select({ id: trips.id, userId: trips.userId }).from(trips).where(inArray(trips.id, [existing, g.tripId]));
    assert.equal(plans.length, 2, "nothing deleted, no item merge");
    assert.ok(plans.every((p) => p.userId === memberId));
  });

  it("D2 a second claim claims nothing and adds no line", async () => {
    const again = await claimGuestPlans(hashGuestSession(sessionA)!, memberId);
    assert.deepEqual(again, []);
    const { carted } = await projectClaimedBookableItems(again, memberId);
    assert.deepEqual(carted, []);
    assert.equal((await linesFor(memberId)).length, 1);
  });

  it("D3 a stranger's session claims nothing", async () => {
    const stranger = await claimGuestPlans(hashGuestSession(`slice-d-stranger-${tag}-${crypto.randomUUID()}`)!, member2Id);
    assert.deepEqual(stranger, []);
    assert.equal((await linesFor(member2Id)).length, 0);
  });

  it("D4 a forced projection failure: the claim commits, a warn line, no line; a later sync writes it", async () => {
    const g = await guestPlanWithThree(sessionF);
    const second = await mkItem(g.tripId, { title: "Tea ceremony again", providerServiceId: instantSvc });
    const warned: string[] = [];
    const origWarn = logger.warn.bind(logger);
    (logger as any).warn = (obj: unknown, msg?: string) => {
      if (typeof msg === "string") warned.push(msg);
      return origWarn(obj as any, msg as any);
    };
    let calls = 0;
    try {
      const claimed = await claimGuestPlans(hashGuestSession(sessionF)!, member2Id);
      assert.deepEqual(claimed, [g.tripId], "the claim committed");
      const { carted } = await projectClaimedBookableItems(claimed, member2Id, {
        sync: async (id) => {
          calls++;
          if (id === g.listing) throw new Error("forced projection failure");
          return syncItemProjection(id);
        },
      });
      assert.deepEqual(carted, [second], "one item's failure never stops the next item");
    } finally {
      (logger as any).warn = origWarn;
    }
    assert.equal(calls, 2);
    assert.ok(warned.includes("guest claim: cart projection failed (the claim stands)"), JSON.stringify(warned));
    const owner = (await db.select({ userId: trips.userId }).from(trips).where(eq(trips.id, g.tripId)))[0];
    assert.equal(owner.userId, member2Id, "the claim stands");
    let lines = await linesFor(member2Id);
    assert.deepEqual(lines.map((l) => l.itineraryItemId), [second], "no line for the failed item");
    assert.equal((await item(g.listing)).routingStatus, "ready_for_checkout", "the flip stands; only the line is missing");
    // The next sync of that item (any later plan write) repairs it.
    const repaired = await syncItemProjection(g.listing);
    assert.equal(repaired.action, "upserted");
    lines = await linesFor(member2Id);
    assert.deepEqual(new Set(lines.map((l) => l.itineraryItemId)), new Set([second, g.listing]));
  });

  it("D5 a cookies-off claim names the guest by its id and still claims and carts", async () => {
    const g = await guestPlanWithThree(sessionH);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { claims: { sub: memberId } };
      (req as any).isAuthenticated = () => true;
      next();
    });
    app.use(guestPlansRoutes);
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/guest-plans/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Guest-Cookies": "off" },
        body: JSON.stringify({ guestSessionId: sessionH }),
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as { tripIds: string[]; cartedItemIds: string[] };
      assert.deepEqual(json.tripIds, [g.tripId]);
      assert.deepEqual(json.cartedItemIds, [g.listing]);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
    assert.ok((await linesFor(memberId)).some((l) => l.itineraryItemId === g.listing));
  });
});
