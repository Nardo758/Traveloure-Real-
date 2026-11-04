/**
 * CMS-1 Launch (ledger `2026-11-04-cms1-launch-screens`): nothing goes public unscreened.
 *
 *   T1 ready-made approve: a banned title → 422 banned_copy with the hit; no photo tick → 422 photo_rights; clean +
 *      ticked → approved.
 *   T2 profile text: PATCH /api/me/storefront with "secret" in the bio → 422 (the expert-profile PATCH calls the same
 *      screen, pinned); a pre-existing bio with a banned word and a cover with no rights tick are omitted from the
 *      public read; re-saved clean (cover ticked) → the public read shows both.
 *   T3 the stock fallback's credit: built from the provider's answer, or nothing — never a bare URL.
 *   T5 /hidden-gems → 301 /places (query kept); /api/discovery/gems (both reads) and the item read return no AI-only
 *      (unverified) row. Fixture rows carry placeholder names only.
 *   T6 partner editorial PATCH: banned text → 422; clean → editorial_reviewed_at set and the public Fever projection now
 *      shows it; an unknown table → 400; a non-admin → 403.
 *
 * TRANSPORT: the REAL routers in a bare express app with a chosen session identity. DISPOSABLE DB ONLY; every row is
 * created here and removed in after().
 * Run: DATABASE_URL=… npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/cms1-screens.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? process.env.STRIPE_SECRET_KEY : "sk_test_cms1";

const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error("[cms1-screens] refusing to write fixtures to a non-disposable database");
}

const { db, pool } = await import("../db");
const { insertRoutableExpertForm } = await import("./helpers/routable-expert");
const adminRouter = (await import("../routes/admin.routes")).default;
const storefrontRouter = (await import("../routes/storefront.routes")).default;
const seoRouter = (await import("../routes/seo.routes")).default;
const { loadStorefront } = await import("../routes/storefront.routes");
const { gemDiscoveryService } = await import("../services/gem-discovery.service");
const { getAiDiscoveredGemById } = await import("../services/content-query.service");
const { toPublicFeverEvents } = await import("../services/fever-public");
const { stockPhotoCredit } = await import("../services/stock-photo-credit");

const ROOT = process.cwd();
const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  admin: `cms1-${RUN}-admin`,
  author: `cms1-${RUN}-author`,
  earner: `cms1-${RUN}-earner`,
  trip: `cms1-${RUN}-trip`,
  rmt: `cms1-${RUN}-rmt`,
  item: `cms1-${RUN}-item`,
  svc: `cms1-${RUN}-svc`,
  fever: `cms1-${RUN}-fever`,
  gemOk: `cms1-${RUN}-gem-ok`,
  gemAi: `cms1-${RUN}-gem-ai`,
};
const handle = `cms1-${RUN}`;
const DEST = `Placeholdertown ${RUN}`;

async function call(router: any, userId: string | null, method: string, url: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { claims: { sub: userId } };
      (req as any).isAuthenticated = () => true;
    } else (req as any).isAuthenticated = () => false;
    next();
  });
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      redirect: "manual",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, location: res.headers.get("location"), body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

before(async () => {
  await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${ids.admin}, ${ids.admin + "@cms1.invalid"}, 'admin')`);
  await db.execute(sql`INSERT INTO users (id, email, role, first_name) VALUES (${ids.author}, ${ids.author + "@cms1.invalid"}, 'expert', 'Author')`);
  await db.execute(sql`
    INSERT INTO users (id, email, role, first_name, last_name, handle, bio, preferences)
    VALUES (${ids.earner}, ${ids.earner + "@cms1.invalid"}, 'expert', 'Screen', 'Earner', ${handle},
            'A secret spot only I know.', ${JSON.stringify({ storefront: { coverImageUrl: "https://images.example.test/cover.jpg" } })}::jsonb)
  `);
  await insertRoutableExpertForm(ids.earner);
  await db.execute(sql`
    INSERT INTO provider_services (id, user_id, service_name, delivery_method, price, price_type, approval_status, status)
    VALUES (${ids.svc}, ${ids.earner}, ${"Screen consult " + RUN}, 'video', 50, 'fixed', 'approved', 'active')
  `);
  await db.execute(sql`
    INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status)
    VALUES (${ids.trip}, ${ids.author}, 'CMS-1 build', 'Kyoto, Japan', '2027-05-01', '2027-05-01', 'draft')
  `);
  await db.execute(sql`
    INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type)
    VALUES (${ids.item}, ${ids.trip}, 1, 'Morning walk by the river', 'activity')
  `);
  await db.execute(sql`
    INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, hero_image_url, hero_image_meta, duration_days, plan_type, price_cents, status, submitted_at)
    VALUES (${ids.rmt}, ${ids.author}, ${ids.trip}, 'Kyoto', 'The best secret day in Kyoto',
            'https://images.unsplash.com/photo-x', ${JSON.stringify({ unsplashId: "x", photographer: "A. Photographer", profileUrl: "https://unsplash.com/@a" })}::jsonb,
            1, 'culture', 5000, 'submitted', NOW())
  `);
  await db.execute(sql`
    INSERT INTO fever_event_cache (id, event_id, title, description, category, city, city_code, country, booking_url, expires_at)
    VALUES (${ids.fever}, ${ids.fever}, ${"Concert " + RUN}, 'SUPPLIER TEXT', 'music', ${DEST}, 'PHT', 'Nowhere', 'https://partner.example.test/x', NOW() + interval '1 day')
  `);
  for (const [id, verified] of [[ids.gemOk, true], [ids.gemAi, false]] as const) {
    await db.execute(sql`
      INSERT INTO ai_discovered_gems (id, destination, category, name, description, verified_by_expert)
      VALUES (${id}, ${DEST}, 'food', ${"Placeholder place " + id.slice(-6)}, 'Placeholder description.', ${verified})
    `);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM ai_discovered_gems WHERE id IN (${ids.gemOk}, ${ids.gemAi})`).catch(() => {});
  await db.execute(sql`DELETE FROM fever_event_cache WHERE id = ${ids.fever}`).catch(() => {});
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id = ${ids.rmt}`).catch(() => {});
  await db.execute(sql`DELETE FROM itinerary_items WHERE trip_id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id = ${ids.trip}`).catch(() => {});
  await db.execute(sql`DELETE FROM provider_services WHERE id = ${ids.svc}`).catch(() => {});
  await db.execute(sql`DELETE FROM local_expert_forms WHERE user_id = ${ids.earner}`).catch(() => {});
  await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id = ${ids.admin}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.admin}, ${ids.author}, ${ids.earner})`).catch(() => {});
  await pool.end();
});

test("T1 ready-made approve: banned words, then the photo tick, then approved", async () => {
  const banned = await call(adminRouter, ids.admin, "POST", `/api/admin/ready-made/${ids.rmt}/approve`, { photoRightsTicked: true });
  assert.equal(banned.status, 422, JSON.stringify(banned.body));
  assert.equal(banned.body.code, "banned_copy");
  assert.deepEqual(banned.body.hits, ["secret", "best"]);

  await db.execute(sql`UPDATE ready_made_trips SET title = 'A slow day in Kyoto' WHERE id = ${ids.rmt}`);
  const noTick = await call(adminRouter, ids.admin, "POST", `/api/admin/ready-made/${ids.rmt}/approve`, {});
  assert.equal(noTick.status, 422);
  assert.equal(noTick.body.code, "photo_rights");
  const stringTick = await call(adminRouter, ids.admin, "POST", `/api/admin/ready-made/${ids.rmt}/approve`, { photoRightsTicked: "true" });
  assert.equal(stringTick.body?.code, "photo_rights", "only boolean true is a tick");

  const ok = await call(adminRouter, ids.admin, "POST", `/api/admin/ready-made/${ids.rmt}/approve`, { photoRightsTicked: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.listing.status, "approved");
});

test("T2 profile text and cover: screened on save, omitted from the public read until clean", async () => {
  const before = (await loadStorefront(handle)) as any;
  assert.ok(before, "storefront resolves");
  assert.equal(before.earner.bio, null, "a pre-existing bio with a banned word is omitted");
  assert.equal(before.earner.coverImageUrl, null, "a cover with no rights tick is omitted");

  const refused = await call(storefrontRouter, ids.earner, "PATCH", "/api/me/storefront", { bio: "My secret route through Gion." });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, "banned_copy");
  assert.deepEqual(refused.body.hits, ["secret"]);
  const untickedCover = await call(storefrontRouter, ids.earner, "PATCH", "/api/me/storefront", { coverImageUrl: "https://images.example.test/new.jpg" });
  assert.equal(untickedCover.status, 422);
  assert.equal(untickedCover.body.code, "photo_rights");

  const saved = await call(storefrontRouter, ids.earner, "PATCH", "/api/me/storefront", {
    bio: "I walk the river paths every morning.",
    coverImageUrl: "https://images.example.test/new.jpg",
    photoRightsTicked: true,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const after = (await loadStorefront(handle)) as any;
  assert.equal(after.earner.bio, "I walk the river paths every morning.");
  assert.equal(after.earner.coverImageUrl, "https://images.example.test/new.jpg");

  // The expert-profile PATCH (the monolith) runs the same screen before any write.
  const routes = readFileSync(path.join(ROOT, "server/routes.ts"), "utf8");
  const patch = routes.slice(routes.indexOf('app.patch("/api/expert/profile"'));
  const screenAt = patch.indexOf("profileTextScreen({ bio, headline, displayName })");
  assert.ok(screenAt > 0 && screenAt < patch.indexOf("await db.update(users)"), "screened before the users write");
});

test("T3 the stock fallback's credit, or nothing", () => {
  assert.deepEqual(
    stockPhotoCredit({ source: "unsplash", sourceName: "Unsplash", photographerName: "Jane Doe", sourceUrl: "https://unsplash.com/photos/abc?utm_source=traveloure" }),
    { name: "Jane Doe", source: "Unsplash", licenseUrl: "https://unsplash.com/license", link: "https://unsplash.com/photos/abc?utm_source=traveloure" },
  );
  assert.equal(stockPhotoCredit({ source: "pexels", sourceName: "Pexels", photographerName: "Ann", sourceUrl: "https://www.pexels.com/photo/1" })?.licenseUrl, "https://www.pexels.com/license/");
  assert.equal(stockPhotoCredit({ source: "unsplash", sourceName: "Unsplash", photographerName: "", sourceUrl: "https://unsplash.com/photos/abc" }), null);
  assert.equal(stockPhotoCredit({ source: "unsplash", sourceName: "Unsplash", photographerName: "Jane", sourceUrl: "" }), null);
  const routes = readFileSync(path.join(ROOT, "server/routes.ts"), "utf8");
  const route = routes.slice(routes.indexOf('app.get("/api/media/place-photo"'), routes.indexOf("// === Service Categories Routes ==="));
  assert.doesNotMatch(route, /res\.json\(\{ photoUrl: unsplashPhotos\[0\]\.url \}\)/, "never a bare Unsplash URL");
  assert.doesNotMatch(route, /res\.json\(\{ photoUrl \}\)/, "never a bare Pexels URL");
  assert.match(route, /\{ photoUrl: unsplashPhotos\[0\]\.url, credit \}/);
  assert.match(route, /\{ photoUrl: pexelsPhotos\[0\]\.url, credit \}/);
});

test("T5 /hidden-gems redirects to /places; discovery reads return reviewed rows only", async () => {
  const r = await call(seoRouter, null, "GET", "/hidden-gems?city=Kyoto");
  assert.equal(r.status, 301);
  // A-16 (ledger `2026-11-05-lane4-places`): the canonical address is /places/{city}.
  assert.equal(r.location, "/places/kyoto");

  const byDest = await gemDiscoveryService.getGemsForDestination(DEST);
  assert.deepEqual(byDest.gems.map((g: any) => g.id), [ids.gemOk]);
  assert.equal(byDest.total, 1);
  const all = await gemDiscoveryService.getAllGems({ limit: 200 });
  assert.ok(!all.gems.some((g: any) => g.id === ids.gemAi), "no AI-only row in the unfiltered read");
  assert.equal(await getAiDiscoveredGemById(ids.gemAi), null, "the item read is one 404 for an AI-only row");
  assert.equal((await getAiDiscoveredGemById(ids.gemOk))?.id, ids.gemOk);
  const dests = await gemDiscoveryService.getDestinationsWithGems();
  assert.equal(dests.find((d) => d.destination === DEST)?.gemCount, 1);
});

test("T6 partner editorial PATCH: screened, stamped, and then public", async () => {
  const url = `/api/admin/partner-items/fever_event_cache/${ids.fever}`;
  const refused = await call(adminRouter, ids.admin, "PATCH", url, { editorialDescription: "The most popular hidden gem in town." });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, "banned_copy");
  assert.ok(refused.body.hits.includes("hidden gem(s)") && refused.body.hits.includes("popular"));

  assert.equal((await call(adminRouter, ids.admin, "PATCH", `/api/admin/partner-items/users/${ids.fever}`, { editorialDescription: "x" })).status, 400);
  assert.equal((await call(adminRouter, ids.author, "PATCH", url, { editorialDescription: "Candlelit strings." })).status, 403);
  assert.equal((await call(adminRouter, ids.admin, "PATCH", url, { editorialDescription: "x", editorialReviewedAt: "2020-01-01" })).status, 400);

  const event = { id: ids.fever, title: `Concert ${RUN}`, slug: "c", description: "SUPPLIER TEXT", category: "music", city: DEST, cityCode: "PHT", country: "Nowhere", dates: { startDate: "2027-01-01" }, pricing: { currency: "USD" }, isFree: false, isSoldOut: false, bookingUrl: "" } as any;
  const deps = { partnerName: null, contactEmail: null, neighborhoods: async () => [] };
  assert.equal((await toPublicFeverEvents([event], deps))[0].description, null, "before review: no text");

  const ok = await call(adminRouter, ids.admin, "PATCH", url, { editorialDescription: "Candlelit strings in an old hall." });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.editorialReviewedAt);
  assert.equal((await toPublicFeverEvents([event], deps))[0].description, "Candlelit strings in an old hall.");

  const list = await call(adminRouter, ids.admin, "GET", `/api/admin/partner-items?table=fever_event_cache&city=${encodeURIComponent(DEST)}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.items.find((i: any) => i.id === ids.fever)?.editorialDescription, "Candlelit strings in an old hall.");
});
