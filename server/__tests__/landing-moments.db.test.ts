/**
 * landing-moments.db.test.ts — the Moments photo gate (Landing v2.5 Lane 2).
 *
 * Proves resolveLandingMoments() admits ONLY an attributed real photo (ruling
 * 2026-09-01-photo-tiers): an expert-curated gem whose image is NON-stock, with the curating
 * expert's @handle. Runs against the DB directly (no HTTP server needed).
 *
 *   M1  a curated NON-stock gem + an expert WITH a handle → the market's moment goes live, the
 *       photo carries {place, @handle} and the builder byline is that handle.
 *   M2  a STOCK (unsplash) curated gem does NOT make its market live (the gate forbids stock).
 *   M3  a curated non-stock gem whose expert has NO handle does NOT go live (attribution
 *       unresolvable).
 *
 * DISPOSABLE DB ONLY. Serialize: npx tsx --test server/__tests__/landing-moments.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { resolveLandingMoments } from "../services/landing-moments";
import { shouldSeedLandingMomentDemo } from "../seeds/landing-moment-demo.seed";

const RUN = crypto.randomUUID().slice(0, 8);
const HANDLE = `mtest-${RUN}`;
const expertWith = `u-with-${RUN}`;
const expertNo = `u-no-${RUN}`;
const expertPorto = `u-porto-${RUN}`;
const NONSTOCK = "https://cdn.traveloure.test/gion.jpg";
const STOCK = "https://images.unsplash.com/photo-x.jpg";

const DISPOSABLE = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  if (host !== null && !DISPOSABLE.has(host)) {
    throw new Error(`[landing-moments] REFUSING to write: '${host}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function insertGem(city: string, url: string, curator: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO travel_pulse_hidden_gems (id, city, country, place_name, place_type, gem_score, image_url, ai_generated, curated_by_expert_id)
    VALUES (gen_random_uuid(), ${city}, ${"Testland"}, ${`Test gem ${RUN}`}, ${"attraction"}, ${90}, ${url}, ${false}, ${curator})
  `);
}

async function insertExpert(id: string, email: string, handle: string | null, city: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, email, handle, role)
    VALUES (${id}, ${email}, ${handle}, ${"expert"})
  `);
  await db.execute(sql`
    INSERT INTO local_expert_forms (id, user_id, email, city, status)
    VALUES (gen_random_uuid(), ${id}, ${email}, ${city}, ${"approved"})
  `);
}

before(async () => {
  await assertDisposableDb();
  await insertExpert(expertWith, `w-${RUN}@traveloure.test`, HANDLE, "Edinburgh");
  await insertExpert(expertNo, `n-${RUN}@traveloure.test`, null, "Cartagena");
  await insertExpert(expertPorto, `p-${RUN}@traveloure.test`, `porto-${RUN}`, "Porto");
  // Golf market (Edinburgh): curated NON-stock + handle → live.
  await insertGem("Edinburgh", NONSTOCK, expertWith);
  // Anniversary market (Porto): curated STOCK → excluded.
  await insertGem("Porto", STOCK, expertPorto);
  // Girls' trip market (Cartagena): curated NON-stock but curator has NO handle → excluded.
  await insertGem("Cartagena", NONSTOCK, expertNo);
  // Anniversary market (Porto): a non-stock photo curated by an Edinburgh expert → excluded.
  await insertGem("Porto", NONSTOCK, expertWith);
});

after(async () => {
  await db.execute(sql`DELETE FROM travel_pulse_hidden_gems WHERE place_name = ${`Test gem ${RUN}`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${expertWith}, ${expertNo}, ${expertPorto})`).catch(() => {});
});

test("M1 curated non-stock gem + expert handle → the moment goes live with attribution", async () => {
  const live = await resolveLandingMoments();
  const golf = live.find((m) => m.key === "golf");
  assert.ok(golf, "golf is live (Edinburgh has a curated non-stock photo by a handled expert)");
  assert.ok(golf!.photos.length >= 1, "golf carries the photo");
  assert.equal(golf!.photos[0].handle, HANDLE, "the caption attributes the curating expert's handle");
  assert.equal(golf!.photos[0].url, NONSTOCK, "the non-stock image is the photo");
  assert.equal(golf!.builder?.handle, HANDLE, "the builder byline is that handle");
  assert.equal(golf!.builder?.reviews, 0, "review count honest-omits (users has no review_count)");
});

test("M2 a STOCK (unsplash) curated gem does NOT make its market live", async () => {
  const live = await resolveLandingMoments();
  const anniversary = live.find((m) => m.key === "anniversary");
  assert.equal(anniversary, undefined, "anniversary stays out — its only attributed gem is Unsplash stock (gate forbids stock)");
});

test("M3 a curated non-stock gem whose expert has NO handle does NOT go live", async () => {
  const live = await resolveLandingMoments();
  const girls = live.find((m) => m.key === "girls_trip");
  assert.equal(girls, undefined, "girls_trip stays out — the curating expert has no handle, so attribution can't resolve");
});

test("M4 a non-stock photo curated by an expert from another market does NOT go live", async () => {
  const live = await resolveLandingMoments();
  const anniversary = live.find((m) => m.key === "anniversary");
  assert.equal(
    anniversary,
    undefined,
    "anniversary stays out — an Edinburgh curator cannot attribute a Porto photo",
  );
});

test("M5 production does not seed or resolve development-only Moment fixtures", async () => {
  assert.equal(shouldSeedLandingMomentDemo({ NODE_ENV: "production" }), false);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnvironment = process.env.ENVIRONMENT;
  process.env.NODE_ENV = "production";
  delete process.env.ENVIRONMENT;
  try {
    const live = await resolveLandingMoments();
    assert.equal(
      live.some((moment) => ["golf", "girls_trip"].includes(moment.key)),
      false,
      "production must not expose the @traveloure.test Moment fixtures",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousEnvironment === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = previousEnvironment;
  }
});
