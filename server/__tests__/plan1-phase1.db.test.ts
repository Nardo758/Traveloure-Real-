/**
 * PLAN-1 Phase 1 (ledger `2026-11-06-plan1-one-planner`; ruling 7): the guest view and the owner view converge on one
 * DTO. The guest plan view carries what the plancard carries for the same rows — the occasion label, an item's end
 * time, and the listing / partner product it names. No schema change.
 *
 *   D1 a guest plan with an occasion reads its label the plancard's way (`occasionLabelForPlan`); none ⇒ null.
 *   D2 an item's end time and its listing / partner ids pass through the guest view.
 *
 * Disposable database only. Rows this file writes are removed in after().
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/plan1-phase1.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { affiliatePartners, affiliateProducts, itineraryItems, providerServices, tripCollaborators, trips, users } from "@shared/schema";
import { createGuestPlan, hashGuestSession, readGuestPlan } from "../services/guest-plan.service";
import { occasionLabelForPlan } from "../services/occasion-label.service";

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb() {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x@invalid/x").hostname.toLowerCase();
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`refusing to write to non-disposable database host ${host}`);
}

const tag = crypto.randomUUID().slice(0, 8);
const tripIds = new Set<string>();
const ids = { user: `plan1-u-${tag}`, listing: crypto.randomUUID(), partner: crypto.randomUUID(), product: crypto.randomUUID() };

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')
    ON CONFLICT (setting_key) DO NOTHING`);
  await db.insert(users).values({ id: ids.user, email: `${ids.user}@example.test`, role: "service_provider" } as any);
  await db.insert(providerServices).values({ id: ids.listing, userId: ids.user, serviceName: `PLAN-1 Listing ${tag}`, status: "active", approvalStatus: "approved" } as any);
  await db.insert(affiliatePartners).values({ id: ids.partner, name: `PLAN-1 Partner ${tag}`, websiteUrl: "https://example.test", category: "tours" } as any);
  await db.insert(affiliateProducts).values({ id: ids.product, partnerId: ids.partner, name: `PLAN-1 Product ${tag}`, productUrl: "https://example.test/p" } as any);
});

after(async () => {
  const t = Array.from(tripIds);
  if (t.length) {
    await db.delete(itineraryItems).where(inArray(itineraryItems.tripId, t));
    await db.delete(tripCollaborators).where(inArray(tripCollaborators.tripId, t));
    await db.delete(trips).where(inArray(trips.id, t));
  }
  await db.delete(affiliateProducts).where(eq(affiliateProducts.id, ids.product));
  await db.delete(affiliatePartners).where(eq(affiliatePartners.id, ids.partner));
  await db.delete(providerServices).where(eq(providerServices.id, ids.listing));
  await db.delete(users).where(eq(users.id, ids.user));
});

async function guestPlan(extra: Record<string, unknown> = {}) {
  const hash = hashGuestSession(crypto.randomUUID())!;
  const out: any = await createGuestPlan(hash, { destination: "Kyoto, Japan", ...extra } as any);
  assert.equal(out.ok, true, JSON.stringify(out));
  tripIds.add(out.view.plan.id);
  return { hash, view: out.view };
}

describe("PLAN-1 Phase 1 — the shared DTO", () => {
  it("D1 the occasion label, the plancard's way", async () => {
    const slugRow = await db.execute(sql`SELECT slug FROM experience_types ORDER BY slug LIMIT 1`);
    const slug = (slugRow as any).rows?.[0]?.slug as string | undefined;
    const none = await guestPlan();
    assert.equal(none.view.plan.occasionLabel, null, "no occasion ⇒ null");
    if (!slug) return;
    const { hash, view } = await guestPlan({ occasionSlug: slug });
    const expected = await occasionLabelForPlan(slug);
    assert.ok(expected, "the catalog names it");
    assert.equal(view.plan.occasionLabel, expected, "the create answer");
    assert.equal((await readGuestPlan(hash))?.plan.occasionLabel, expected, "the read");
  });

  it("D2 end time and the listing / partner ids pass through", async () => {
    const { hash, view } = await guestPlan();
    await db.insert(itineraryItems).values([
      { tripId: view.plan.id, title: "Tea", dayNumber: 1, status: "planned", startTime: "10:00", endTime: "11:30", providerServiceId: ids.listing } as any,
      { tripId: view.plan.id, title: "Tour", dayNumber: 1, status: "planned", affiliateProductId: ids.product } as any,
    ]);
    const read = await readGuestPlan(hash);
    const tea = read!.items.find((i) => i.title === "Tea")!;
    const tour = read!.items.find((i) => i.title === "Tour")!;
    assert.deepEqual([tea.startTime, tea.endTime, tea.providerServiceId, tea.affiliateProductId], ["10:00", "11:30", ids.listing, null]);
    assert.deepEqual([tour.endTime, tour.providerServiceId, tour.affiliateProductId], [null, null, ids.product]);
  });
});
