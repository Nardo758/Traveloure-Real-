/**
 * Slice B1 — the Ready Made Trip's public preview (ledger `2026-10-05-rmt-public-preview`).
 *   P1 an approved listing's preview: canonical slug, the purchase's own price line, day 1 only with
 *      its CONFIRMED legs; the payload carries no coordinate, note, author id or build id (LD 40)
 *   P2 the public gate: a draft listing, an unknown token and a token-less slug are ONE 404; stale
 *      title words with the right token still resolve and return the canonical slug
 *   P3 /t/:slug serves real OG/Twitter tags (og:type product, canonical og:url, twitter:image); a stale
 *      slug 301s to the canonical one; an unknown slug falls through to the SPA
 *   P4 the purchase charges `readyMadeBuyerTotalCents` — the price line's own number (pinned by source)
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/traveloure npx tsx --test server/__tests__/ready-made-preview.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY ||= "sk_test_rmt_preview";
const { db } = await import("../db");
const readyMadeRoutes = (await import("../routes/ready-made.routes")).default;
const storefrontRoutes = (await import("../routes/storefront.routes")).default;
const { readyMadeSlug } = await import("@shared/ready-made-preview");

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  author: `rmp-${RUN}-author`,
  build: `rmp-${RUN}-build`,
  draftBuild: `rmp-${RUN}-dbuild`,
  listing: crypto.randomUUID(),
  draft: crypto.randomUUID(),
  a: `rmp-${RUN}-a`,
  b: `rmp-${RUN}-b`,
  c: `rmp-${RUN}-c`,
  d2: `rmp-${RUN}-d2`,
};
const TITLE = `Kyoto Slowly ${RUN}`;
let base = "";
let server: any;

function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return "<none>"; } })();
  if (!["localhost", "127.0.0.1", "::1", "0.0.0.0", ""].includes(host)) throw new Error(`[rmt-preview] REFUSING to write fixtures to '${host}'.`);
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, handle) VALUES (${ids.author}, ${`${ids.author}@t.test`}, 'Aiko', 'Secret-Surname', 'local_expert', ${`rmp${RUN}`})`);
  await db.execute(sql`INSERT INTO trips (id, user_id, author_id, title, destination, start_date, end_date, status) VALUES
    (${ids.build}, NULL, ${ids.author}, 'build', 'Kyoto, Japan', '2027-03-10', '2027-03-12', 'draft'),
    (${ids.draftBuild}, NULL, ${ids.author}, 'draft build', 'Kyoto, Japan', '2027-03-10', '2027-03-12', 'draft')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, title, item_type, day_number, sort_order, start_time, location_name, latitude, longitude, notes) VALUES
    (${ids.a}, ${ids.build}, 'Fushimi Inari', 'activity', 1, 0, '08:00', 'Fushimi', 34.9671, 135.7727, 'private author note'),
    (${ids.b}, ${ids.build}, 'Tofuku-ji', 'activity', 1, 1, '10:30', NULL, 34.9761, 135.7739, NULL),
    (${ids.c}, ${ids.build}, 'Nishiki Market', 'dining', 1, 2, '13:00', 'Nakagyo', 35.005, 135.765, NULL),
    (${ids.d2}, ${ids.build}, 'Kinkaku-ji', 'activity', 2, 0, '09:00', NULL, 35.0394, 135.7292, NULL)`);
  const leg = (id: string, from: string, to: string, status: string, minutes: number) => db.execute(sql`INSERT INTO transport_legs (id, trip_id, day_number, leg_order,
      from_activity_id, from_name, from_lat, from_lng, to_activity_id, to_name, to_lat, to_lng, distance_meters, distance_display,
      recommended_mode, estimated_duration_minutes, proposal_status, user_selected_mode)
    VALUES (${id}, ${ids.build}, 1, 0, ${from}, 'f', 34.96, 135.77, ${to}, 't', 34.97, 135.77, 1500, '1.5 km', 'transit', ${minutes}, ${status}, ${status === "confirmed" ? "walking" : null})`);
  await leg(`rmp-${RUN}-ab`, ids.a, ids.b, "confirmed", 22);
  await leg(`rmp-${RUN}-bc`, ids.b, ids.c, "proposed", 18);
  await db.execute(sql`INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days, plan_type, pricing_mode, price_cents, hero_image_url, hero_image_meta, status, active) VALUES
    (${ids.listing}, ${ids.author}, ${ids.build}, 'Kyoto', ${TITLE}, 3, 'cultural', 'fixed', 4900, 'https://images.unsplash.com/photo-test', ${JSON.stringify({ photographer: "Ann Lee", profileUrl: "https://unsplash.com/@ann" })}::jsonb, 'approved', true),
    (${ids.draft}, ${ids.author}, ${ids.draftBuild}, 'Kyoto', 'Draft trip', 3, 'cultural', 'fixed', 4900, NULL, NULL, 'draft', true)`);
  const app = express();
  app.use(readyMadeRoutes);
  app.use(storefrontRoutes);
  app.use((_req, res) => res.status(404).send("spa-fallthrough"));
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.execute(sql`DELETE FROM ready_made_trips WHERE id IN (${ids.listing}, ${ids.draft})`);
  await db.execute(sql`DELETE FROM trips WHERE id IN (${ids.build}, ${ids.draftBuild})`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.author}`);
});

test("P1: an approved listing's preview is the public teaser, nothing private", async () => {
  const slug = readyMadeSlug({ id: ids.listing, title: TITLE });
  const r = await fetch(`${base}/api/ready-made/preview/${slug}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.slug, slug);
  assert.equal(body.path, `/t/${slug}`);
  assert.equal(body.priceLine, "From $49 · fees included");
  assert.deepEqual(body.expert, { name: "Aiko", handle: `rmp${RUN}`, localVerified: false });
  assert.deepEqual(body.heroCredit, { photographer: "Ann Lee", profileUrl: "https://unsplash.com/@ann" });
  assert.deepEqual(body.sampleDay.stops.map((s: any) => s.title), ["Fushimi Inari", "Tofuku-ji", "Nishiki Market"]);
  assert.deepEqual(body.sampleDay.legs, [{ fromIndex: 0, toIndex: 1, mode: "walking", minutes: 22 }]);
  assert.equal(body.lockedDays, 2);
  const json = JSON.stringify(body);
  for (const banned of ["latitude", "longitude", "34.967", "private author note", ids.author, ids.build, "Secret-Surname", "Kinkaku-ji"]) {
    assert.ok(!json.includes(banned), `no ${banned}`);
  }
});

test("P2: one 404 for a draft, an unknown token or no token; stale words still resolve", async () => {
  for (const slug of [readyMadeSlug({ id: ids.draft, title: "Draft trip" }), "kyoto-0000000000", "kyoto-slowly"]) {
    const r = await fetch(`${base}/api/ready-made/preview/${slug}`);
    assert.equal(r.status, 404, slug);
    assert.deepEqual(await r.json(), { message: "Trip not found" });
  }
  const stale = `an-old-title-${readyMadeSlug({ id: ids.listing, title: "" })}`;
  const r = await fetch(`${base}/api/ready-made/preview/${stale}`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).slug, readyMadeSlug({ id: ids.listing, title: TITLE }));
});

test("P3: /t/:slug carries real OG and Twitter tags; stale 301s; unknown falls through", async () => {
  const slug = readyMadeSlug({ id: ids.listing, title: TITLE });
  const r = await fetch(`${base}/t/${slug}`);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /<meta property="og:type" content="product" \/>/);
  assert.match(html, new RegExp(`<meta property="og:url" content="https://traveloure.com/t/${slug}" />`));
  assert.match(html, /<meta property="og:image" content="https:\/\/images.unsplash.com\/photo-test" \/>/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/images.unsplash.com\/photo-test" \/>/);
  assert.match(html, new RegExp(`<meta property="og:title" content="${TITLE} \\| Traveloure" />`));
  assert.match(html, /From \$49 · fees included/);
  assert.equal((html.match(/property="og:title"/g) ?? []).length, 1, "the template's own tags are stripped");

  const stale = await fetch(`${base}/t/an-old-title-${readyMadeSlug({ id: ids.listing, title: "" })}`, { redirect: "manual" });
  assert.equal(stale.status, 301);
  assert.equal(stale.headers.get("location"), `/t/${slug}`);

  const unknown = await fetch(`${base}/t/kyoto-0000000000`);
  assert.equal(unknown.status, 404);
  assert.equal(await unknown.text(), "spa-fallthrough");
  const draft = await fetch(`${base}/t/${readyMadeSlug({ id: ids.draft, title: "Draft trip" })}`);
  assert.equal(await draft.text(), "spa-fallthrough", "no OG card for a draft");
});

test("P4: the purchase charges the price line's own number", () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../routes/ready-made.routes.ts"), "utf8");
  const purchase = src.slice(src.indexOf('"/api/ready-made/:id/purchase"'));
  assert.match(purchase.slice(0, 4000), /amount: readyMadeBuyerTotalCents\(listing\)!/);
});
