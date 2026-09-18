/**
 * AN ITEM MAY CARRY A PARTNER PRODUCT — `itinerary_items.affiliate_product_id`.
 * Migration 256, ledger `2026-09-18-add-to-plan-lossless`, on the `item-event-link.db.test.ts`
 * pattern (CLAUDE.md §18 rule 1).
 *
 * WHAT THIS LANE CHANGED, AND THEREFORE WHAT HAS TO BE PROVEN.
 * The column already existed and `insertItineraryItemSchema` already omitted it (§19) — what was
 * missing was a pick-based RE-ADMISSION with server-side verification, mirroring
 * `itineraryItemEventLinkSchema` / `resolveItemEventLink`. Three properties carry the design and
 * each has a test below:
 *
 *   1. the link is admitted only through the pick-based allowlist, and its PAIRING — that the
 *      `affiliate_products` row exists AND is currently active — is re-read server-side rather
 *      than believed (§14/§19);
 *   2. absent means the column is left ALONE (unset stays NULL) — there is no third "clear it"
 *      state for this link, unlike the event link (§13);
 *   3. the SAME resolver backs both live write rails (the monolith POST's admission logic and the
 *      real `trips.routes.ts` PATCH), so a caller cannot bypass verification by choosing the rail.
 *
 * NEGATIVES FIRST, per house convention:
 *   N1  an unknown affiliate-product id is REFUSED with a 400 (`affiliate_product_not_found`) and
 *       NOTHING is written. Proven on the LIVE PATCH rail (the real `trips.routes.ts` router,
 *       mounted here) — the item's existing link is byte-unchanged after the refusal — AND on the
 *       shared resolver the live POST rail calls, so both write rails are covered by one proof.
 *   N2  a DEACTIVATED product (isActive=false) is refused identically to an unknown one — a caller
 *       must not be able to tell "never existed" from "retired" by reading the difference.
 *
 * POSITIVES:
 *   P1  an item created with a valid, active product id carries it. Driven through the two steps
 *       the live POST performs — the real `itineraryItemAffiliateLinkSchema` parse and the real
 *       `resolveItemAffiliateLink` — then the real `storage.createItineraryItem`.
 *       STATED LIMIT (§18d negative space): `POST /api/trips/:tripId/itinerary-items` lives in the
 *       `server/routes.ts` MONOLITH, which no test in this repo mounts (it is not a router), so
 *       this proves the ADMISSION and the WRITE, not that handler's express wiring — exactly the
 *       stated limit `item-event-link.db.test.ts` P1 carries for the same reason.
 *   P2  on the live PATCH rail, a body that never mentions `affiliateProductId` leaves the item's
 *       existing link untouched; a body naming a valid active product id sets it.
 *
 * BENCH SUITE, NOT CI-WIRED AS A STANDALONE SPEC (house `*.db.test.ts` posture): this file writes
 * real rows and is run on demand against a disposable database. It is NAMED in
 * `.github/workflows/suite-server-tests.yml` alongside `item-event-link.db.test.ts` so the CI class
 * still reaches it (the `[guarded: …]` ledger tag points here).
 *
 * DISPOSABLE DB ONLY. Every row this file writes is created by this file and deleted in after().
 *   npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/item-affiliate-link.db.test.ts
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  affiliatePartners,
  affiliateProducts,
  itineraryItems,
  itineraryItemAffiliateLinkSchema,
  users,
} from "@shared/schema";
// The REAL admission the live POST rail runs. Imported, never re-implemented — if the predicate
// moves, this test fails rather than drifting away from it silently.
import { resolveItemAffiliateLink } from "../services/item-affiliate-link.service";
import tripsRoutes from "../routes/trips.routes";

const RUN = crypto.randomUUID().slice(0, 8);

// ── Disposable-DB guard (mirrors item-event-link.db.test.ts; never defaults open) ──────────────
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
  if (!ok) {
    throw new Error(
      `[item-affiliate-link] REFUSING to write fixtures: DATABASE_URL host '${host ?? "<none>"}' is not a ` +
        `recognized disposable dev/CI database. Opt in DELIBERATELY with JOURNEY_DB_WRITES_OK=1.`,
    );
  }
}

let userId = "";
let tripId = "";
let partnerId = "";
let activeProductId = "";
let inactiveProductId = "";

/** Mounts the REAL trips router with a chosen session identity, matching item-event-link's harness. */
async function withRoutersAs<T>(asUserId: string, fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: asUserId, name: "Test Owner" } };
    (req as any).isAuthenticated = () => true;
    (req as any).logout = (cb?: () => void) => cb?.();
    next();
  });
  app.use(tripsRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function seedItem(fields: Record<string, unknown> = {}): Promise<string> {
  const [row] = await db.insert(itineraryItems).values({
    tripId,
    title: `Item ${RUN}`,
    itemType: "activity",
    dayNumber: 1,
    origin: "traveler",
    ...fields,
  } as any).returning();
  return row.id;
}

async function readLink(itemId: string): Promise<string | null | undefined> {
  const r = await db.execute(
    sql`SELECT affiliate_product_id FROM itinerary_items WHERE id = ${itemId}`,
  );
  const row = r.rows[0] as any;
  return row ? (row.affiliate_product_id as string | null) : undefined;
}

before(async () => {
  await assertDisposableDb();

  const [u] = await db.insert(users).values({ email: `item-affiliate-${RUN}@t.test` } as any).returning();
  userId = u.id;

  const t = await storage.createTrip({
    userId,
    title: `Plan under test ${RUN}`,
    destination: "Kyoto, Japan",
    startDate: "2027-04-10",
    endDate: "2027-04-13",
  } as any);
  tripId = t.id;

  const [partner] = await db.insert(affiliatePartners).values({
    name: `Partner ${RUN}`,
    websiteUrl: "https://partner.example.test",
    category: "activities",
  } as any).returning();
  partnerId = partner.id;

  const [activeProduct] = await db.insert(affiliateProducts).values({
    partnerId,
    name: `Active product ${RUN}`,
    productUrl: "https://partner.example.test/active",
    isActive: true,
  } as any).returning();
  activeProductId = activeProduct.id;

  const [inactiveProduct] = await db.insert(affiliateProducts).values({
    partnerId,
    name: `Retired product ${RUN}`,
    productUrl: "https://partner.example.test/retired",
    isActive: false,
  } as any).returning();
  inactiveProductId = inactiveProduct.id;
});

after(async () => {
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${tripId}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`).catch(() => {});
  for (const id of [activeProductId, inactiveProductId].filter(Boolean)) {
    await db.delete(affiliateProducts).where(eq(affiliateProducts.id, id)).catch(() => {});
  }
  if (partnerId) await db.delete(affiliatePartners).where(eq(affiliatePartners.id, partnerId)).catch(() => {});
  await db.delete(users).where(eq(users.id, userId)).catch(() => {});
});

// ───────────────────────────── NEGATIVES ─────────────────────────────

test("N1 an unknown affiliate-product id is refused with 400 and nothing is written", async () => {
  const itemId = await seedItem({ affiliateProductId: activeProductId });
  assert.equal(await readLink(itemId), activeProductId);

  const unknownId = crypto.randomUUID();

  // (a) THE LIVE PATCH RAIL — the real router, the real auth, the real handler.
  const status = await withRoutersAs(userId, async (base) => {
    const res = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Renamed ${RUN}`, affiliateProductId: unknownId }),
    });
    return res.status;
  });
  assert.equal(status, 400, "an unknown product id must be a visible 400, never a silent drop");
  assert.equal(await readLink(itemId), activeProductId, "the existing link must be byte-unchanged");

  const [row] = await db.select().from(itineraryItems).where(eq(itineraryItems.id, itemId));
  assert.equal(row.title, `Item ${RUN}`, "a refused request must not half-apply its other fields");

  // (b) THE SHARED RESOLVER the live POST rail calls — same refusal, so both rails are covered.
  const viaPost = await resolveItemAffiliateLink(true, unknownId);
  assert.equal(viaPost.ok, false);
  assert.equal((viaPost as any).reason, "affiliate_product_not_found");
});

test("N2 a deactivated product is refused identically to an unknown one", async () => {
  const viaInactive = await resolveItemAffiliateLink(true, inactiveProductId);
  const viaUnknown = await resolveItemAffiliateLink(true, crypto.randomUUID());
  assert.equal(viaInactive.ok, false);
  assert.equal(viaUnknown.ok, false);
  assert.equal(
    (viaInactive as any).reason,
    (viaUnknown as any).reason,
    "a retired product and an unknown one must be indistinguishable to the caller",
  );

  // And on the live PATCH rail: the item's link is untouched by the refusal.
  const itemId = await seedItem();
  assert.equal(await readLink(itemId), null);
  const status = await withRoutersAs(userId, async (base) => {
    const res = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ affiliateProductId: inactiveProductId }),
    });
    return res.status;
  });
  assert.equal(status, 400);
  assert.equal(await readLink(itemId), null, "a refused deactivated-product link writes nothing");
});

// ───────────────────────────── POSITIVES ─────────────────────────────

test("P1 an item created with a valid active product id carries it", async () => {
  // The two steps the live POST performs, run against the REAL schema and the REAL resolver.
  const parsed = itineraryItemAffiliateLinkSchema.safeParse({
    title: "ignored by the allowlist",
    routingStatus: "purchased", // a privileged column the allowlist must NOT carry through
    affiliateProductId: activeProductId,
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(
    Object.keys((parsed as any).data),
    ["affiliateProductId"],
    "the ALLOWLIST admits exactly one field — a pick, not a denylist",
  );

  const resolved = await resolveItemAffiliateLink(true, (parsed as any).data.affiliateProductId);
  assert.equal(resolved.ok, true);
  assert.equal((resolved as any).action, "set");
  assert.equal((resolved as any).value, activeProductId);

  const item = await storage.createItineraryItem({
    tripId,
    title: `Ticketed activity ${RUN}`,
    itemType: "activity",
    dayNumber: 2,
    origin: "traveler",
    affiliateProductId: (resolved as any).value,
  } as any);

  assert.equal(await readLink(item.id), activeProductId);
});

test("P2 on the live PATCH rail an absent key leaves the link alone; a valid id sets it", async () => {
  const itemId = await seedItem();
  assert.equal(await readLink(itemId), null);

  await withRoutersAs(userId, async (base) => {
    // ABSENT ⇒ the caller is not naming a partner product. It must survive an unrelated edit.
    const untouched = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `Still unlinked ${RUN}` }),
    });
    assert.equal(untouched.status, 200);
    assert.equal(await readLink(itemId), null, "an absent key must never write the column");

    // A VALID ACTIVE id ⇒ the item now carries it.
    const linked = await fetch(`${base}/api/trips/${tripId}/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ affiliateProductId: activeProductId }),
    });
    assert.equal(linked.status, 200);
    assert.equal(await readLink(itemId), activeProductId);
  });
});
