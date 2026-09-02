/**
 * affiliate-track-click-identity.db.test.ts — POST /api/affiliate/track-click must not take an
 * identity from the body, and must not hand out an unapproved partner's affiliate URL.
 *
 * FINDING (security audit, as-of 4644af6), two defects in one unauthenticated handler:
 *
 *   (a) §14 IDENTITY — `const { …, userId, … } = req.body` went straight into
 *       `affiliate_clicks.user_id`, a column with NO foreign key, so any string landed and
 *       affiliate attribution / revenue reporting read it. The sibling /api/affiliates/track
 *       already derives the user from the session; this one was the outlier.
 *
 *   (b) §16 READ GATE — `trackClick` called `getProductById` / `getPartnerById` with NO options,
 *       so `approvedOnly` was undefined and the migration-121 partner-approval gate did not apply.
 *       An unauthenticated caller who knew (or enumerated) a product id got back the affiliate URL
 *       that §16 deliberately keeps server-side — bypassing both the `EXISTS (… approval_status =
 *       'approved')` clause on /api/content/affiliate-redirect and the `stripProductUrls` posture
 *       every other public product read applies.
 *
 *   B1 a body-supplied userId is IGNORED — the row records NULL, not the victim's id
 *   B2 an UNAPPROVED partner's product yields no affiliate URL
 *   B3 an APPROVED partner's product still does (the gate is not a blanket denial)
 *   B4 the service fails CLOSED — a caller that forgets the flag still gets the gate
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { affiliatePartners, affiliateProducts, affiliateClicks } from "@shared/schema";
import contentRoutes, { registerDiscoveryRoutes } from "../content.routes";
import { affiliateScraperService } from "../../services/affiliate-scraper.service";

const VICTIM_ID = "victim-user-id-that-must-never-be-recorded";
const created = { partners: [] as string[], products: [] as string[] };

async function seedPartner(approvalStatus: "approved" | "submitted") {
  const [partner] = await db.insert(affiliatePartners).values({
    name: `track-click-test-${approvalStatus}-${Date.now()}-${Math.random()}`,
    websiteUrl: "https://partner.example/landing",
    category: "tours_activities",
    approvalStatus,
  }).returning();
  created.partners.push(partner.id);

  const [product] = await db.insert(affiliateProducts).values({
    partnerId: partner.id,
    name: "test product",
    productUrl: "https://partner.example/product",
    affiliateUrl: "https://partner.example/product?aff=SECRET-TRACKING-ID",
    isActive: true,
  }).returning();
  created.products.push(product.id);
  return { partner, product };
}

after(async () => {
  if (created.products.length) await db.delete(affiliateProducts).where(inArray(affiliateProducts.id, created.products));
  if (created.partners.length) {
    await db.delete(affiliateClicks).where(inArray(affiliateClicks.partnerId, created.partners));
    await db.delete(affiliatePartners).where(inArray(affiliatePartners.id, created.partners));
  }
});

// The affiliate routes are registered onto the module-level router by registerDiscoveryRoutes(),
// which server/routes.ts calls at startup — NOT at import. A test that only imports the router
// gets a 404 for every one of them and passes for the wrong reason, so this is load-bearing.
let routesRegistered = false;
async function ensureRoutes() {
  if (!routesRegistered) {
    await registerDiscoveryRoutes();
    routesRegistered = true;
  }
}

async function withRouter<T>(fn: (base: string) => Promise<T>): Promise<T> {
  await ensureRoutes();
  const app = express();
  app.use(express.json());
  app.use(contentRoutes);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const trackClick = (base: string, body: Record<string, unknown>) =>
  fetch(`${base}/api/affiliate/track-click`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("B1: a body-supplied userId is ignored — the click records no identity", async () => {
  const { partner } = await seedPartner("approved");
  await withRouter(async (base) => {
    const res = await trackClick(base, { partnerId: partner.id, userId: VICTIM_ID });
    assert.equal(res.status, 200);

    const rows = await db.select().from(affiliateClicks).where(eq(affiliateClicks.partnerId, partner.id));
    assert.equal(rows.length, 1, "the click is still recorded — this is analytics, not a rejection");
    assert.notEqual(rows[0].userId, VICTIM_ID, "a client-supplied identity must never reach the row");
    assert.equal(rows[0].userId, null, "an unauthenticated click has no user");
  });
});

test("B2: an unapproved partner's product yields no affiliate URL", async () => {
  const { product } = await seedPartner("submitted");
  await withRouter(async (base) => {
    const res = await trackClick(base, { productId: product.id });
    const body = await res.text();
    assert.equal(
      body.includes("SECRET-TRACKING-ID"),
      false,
      "the affiliate URL of an unapproved partner must never be returned (§16 keeps it server-side)",
    );
  });
});

test("B3: an approved partner's product still resolves (the gate is not a blanket denial)", async () => {
  const { product } = await seedPartner("approved");
  await withRouter(async (base) => {
    const res = await trackClick(base, { productId: product.id });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(String(body.affiliateUrl).includes("SECRET-TRACKING-ID"), "approved products still resolve");
  });
});

test("B4: the service fails closed — a caller that omits the flag still gets the gate", async () => {
  const { product } = await seedPartner("submitted");
  await assert.rejects(
    () => affiliateScraperService.trackClick({ productId: product.id }),
    /not found/i,
    "approvedOnly must default to true, so a forgetful caller cannot reopen the hole",
  );
});
