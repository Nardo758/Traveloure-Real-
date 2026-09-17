/**
 * landing-moments.db.test.ts — the Moments photo gate (Landing v2.5 Lane 2).
 *
 * Proves real photos remain behind the strict attribution gate and override the licensed
 * representative fallback. Runs against the DB directly (no HTTP server needed).
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
const expertKyoto = `u-kyoto-${RUN}`;
const NONSTOCK_EDINBURGH = `https://cdn.traveloure.test/${RUN}-edinburgh.jpg`;
const NONSTOCK_CARTAGENA = `https://cdn.traveloure.test/${RUN}-cartagena.jpg`;
const NONSTOCK_PORTO = `https://cdn.traveloure.test/${RUN}-porto.jpg`;
const NONSTOCK_WEDDING = `https://cdn.traveloure.test/${RUN}-kyoto-wedding.jpg`;
const NONSTOCK_PROPOSAL = `https://cdn.traveloure.test/${RUN}-kyoto-proposal.jpg`;
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

async function insertGem(city: string, url: string, curator: string, momentKey: string | null = null): Promise<void> {
  await db.execute(sql`
    INSERT INTO travel_pulse_hidden_gems (id, city, country, place_name, place_type, gem_score, image_url, ai_generated, curated_by_expert_id, moment_key)
    VALUES (gen_random_uuid(), ${city}, ${"Testland"}, ${`Test gem ${RUN}`}, ${"attraction"}, ${90}, ${url}, ${false}, ${curator}, ${momentKey})
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
  await insertExpert(expertKyoto, `k-${RUN}@traveloure.test`, `kyoto-${RUN}`, "Kyoto");
  // Golf market (Edinburgh): curated NON-stock + handle → live.
  await insertGem("Edinburgh", NONSTOCK_EDINBURGH, expertWith, "golf");
  // Anniversary market (Porto): curated STOCK → excluded.
  await insertGem("Porto", STOCK, expertPorto);
  // Girls' trip market (Cartagena): curated NON-stock but curator has NO handle → excluded.
  await insertGem("Cartagena", NONSTOCK_CARTAGENA, expertNo);
  // Anniversary market (Porto): a non-stock photo curated by an Edinburgh expert → excluded.
  await insertGem("Porto", NONSTOCK_PORTO, expertWith);
  // Same market, different Moments: each photo must remain attached to its exact occasion.
  await insertGem("Kyoto", NONSTOCK_WEDDING, expertKyoto, "wedding");
  await insertGem("Kyoto", NONSTOCK_PROPOSAL, expertKyoto, "proposal");
});

after(async () => {
  await db.execute(sql`DELETE FROM travel_pulse_hidden_gems WHERE place_name = ${`Test gem ${RUN}`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id IN (${expertWith}, ${expertNo}, ${expertPorto}, ${expertKyoto})`).catch(() => {});
});

test("M1 curated non-stock gem + expert handle → the moment goes live with attribution", async () => {
  const live = await resolveLandingMoments();
  const golf = live.find((m) => m.key === "golf");
  assert.ok(golf, "golf is live (Edinburgh has a curated non-stock photo by a handled expert)");
  const testPhoto = golf!.photos.find((photo) => photo.url === NONSTOCK_EDINBURGH);
  assert.ok(testPhoto, "golf carries this test's qualifying photo even when other fixtures exist");
  assert.equal(testPhoto!.handle, HANDLE, "the caption attributes the curating expert's handle");
  assert.equal(testPhoto!.source, "expert", "a qualifying photo is explicitly expert-sourced");
});

test("M2 a STOCK (unsplash) curated gem does not replace the representative fallback", async () => {
  const live = await resolveLandingMoments();
  const anniversary = live.find((m) => m.key === "anniversary");
  assert.ok(anniversary, "anniversary remains available through its representative fallback");
  assert.equal(
    anniversary!.photos.some((photo) => photo.url === STOCK),
    false,
    "stock imagery never enters the returned photo set",
  );
});

test("M3 a curated non-stock gem whose expert has NO handle does not replace the fallback", async () => {
  const live = await resolveLandingMoments();
  const girls = live.find((m) => m.key === "girls_trip");
  assert.ok(girls);
  assert.equal(
    girls!.photos.some((photo) => photo.url === NONSTOCK_CARTAGENA),
    false,
    "the no-handle curator's photo never enters the returned photo set",
  );
});

test("M4 a non-stock photo curated by an expert from another market does not replace the fallback", async () => {
  const live = await resolveLandingMoments();
  const anniversary = live.find((m) => m.key === "anniversary");
  assert.ok(anniversary);
  assert.equal(
    anniversary!.photos.some((photo) => photo.url === NONSTOCK_PORTO),
    false,
    "a curator whose expert form belongs to another city cannot attribute this photo",
  );
});

test("M5 two Moments in the same city receive only their explicitly associated photos", async () => {
  const live = await resolveLandingMoments();
  const wedding = live.find((m) => m.key === "wedding");
  const proposal = live.find((m) => m.key === "proposal");
  assert.ok(wedding);
  assert.ok(proposal);
  assert.deepEqual(wedding!.photos.map((photo) => photo.url), [NONSTOCK_WEDDING]);
  assert.deepEqual(proposal!.photos.map((photo) => photo.url), [NONSTOCK_PROPOSAL]);
});

test("M6 production does not seed or resolve development-only Moment fixtures", async () => {
  assert.equal(shouldSeedLandingMomentDemo({ NODE_ENV: "production" }), false);

  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnvironment = process.env.ENVIRONMENT;
  process.env.NODE_ENV = "production";
  delete process.env.ENVIRONMENT;
  try {
    const live = await resolveLandingMoments();
    assert.equal(
      live.some(
        (moment) =>
          ["golf", "girls_trip"].includes(moment.key) &&
          moment.photos.some((photo) => photo.source === "expert"),
      ),
      false,
      "production must not expose @traveloure.test photos as expert-sourced",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousEnvironment === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = previousEnvironment;
  }
});
