/**
 * LW-1d (ledger `2026-10-16-lw1d-source-and-referral`; hand-off Part B "Source tags on supply sign-up too"):
 * `users.signup_source` has ONE writer, `recordSignupSource`.
 *
 *   G1  A known tag is stored as given; a launch-market tag is read against the setting, never a literal.
 *   G2  The first tag is kept: a second call never rewrites it.
 *   G3  No tag writes nothing (NULL = not recorded, never `other`).
 *   G4  An unknown tag is stored as `other`, never as free text.
 *   G5  Replit OIDC: a NEW supply account records the stashed tag; signing in again never rewrites it; a new
 *       traveler account records nothing even when a tag was offered.
 *   G6  Facebook: a NEW supply account records the stashed tag; a new traveler account records nothing.
 *   G7  The session stash carries the raw tag (capped), and a stale or absent stash carries none.
 *
 * Run against a disposable database:
 *   npx tsx --test server/__tests__/signup-source-record.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { recordSignupSource } from "../services/signup-source-record";
import { upsertUser } from "../replit_integrations/auth/replitAuth";
import { facebookVerify } from "../replit_integrations/auth/facebookAuth";
import { stashSignupIntent, readSignupSourceTag } from "../replit_integrations/auth/signup-intent-stash";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { OAUTH_STATE_TTL_MS } from "../utils/oauth-state";

const SUFFIX = `sgsrc-${process.pid}`;
const ids: string[] = [];
let priorMarket: string | null = null;
let hadMarketRow = false;
let priorMode: string | null = null;
let hadModeRow = false;
const origFetch = global.fetch;

async function setMode(mode: string) {
  if (hadModeRow) {
    await db.execute(sql`UPDATE platform_settings SET setting_value = ${mode} WHERE setting_key = 'traveler_signup_mode'`);
  } else {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('traveler_signup_mode', ${mode})
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`);
  }
  invalidatePlatformFlagCache();
}

async function mkUser(tag: string): Promise<string> {
  const res = await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (gen_random_uuid()::text, ${`${tag}-${SUFFIX}@traveloure.test`}, 'user')
    RETURNING id
  `);
  const id = String((res.rows[0] as any).id);
  ids.push(id);
  return id;
}

async function sourceOf(id: string): Promise<string | null> {
  const r = await db.execute(sql`SELECT signup_source FROM users WHERE id = ${id}`);
  return ((r.rows[0] as any)?.signup_source ?? null) as string | null;
}

before(async () => {
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'launch_market_slug'`);
  hadMarketRow = r.rows.length > 0;
  priorMarket = hadMarketRow ? ((r.rows[0] as any).setting_value ?? null) : null;
  const m = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  hadModeRow = m.rows.length > 0;
  priorMode = hadModeRow ? ((m.rows[0] as any).setting_value ?? null) : null;
  // Facebook's verify reads Instagram data over the network; answer it offline.
  (global as any).fetch = async () => ({ ok: false, json: async () => ({}) });
  if (hadMarketRow) {
    await db.execute(sql`UPDATE platform_settings SET setting_value = 'kyoto' WHERE setting_key = 'launch_market_slug'`);
  } else {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES ('launch_market_slug', 'kyoto')`);
  }
});

after(async () => {
  (global as any).fetch = origFetch;
  if (hadModeRow) {
    await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMode} WHERE setting_key = 'traveler_signup_mode'`);
  } else {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'traveler_signup_mode'`);
  }
  invalidatePlatformFlagCache();
  if (ids.length) await db.execute(sql`DELETE FROM users WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  if (hadMarketRow) {
    await db.execute(sql`UPDATE platform_settings SET setting_value = ${priorMarket} WHERE setting_key = 'launch_market_slug'`);
  } else {
    await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = 'launch_market_slug'`);
  }
});

test("G1 — a known tag is stored as given; the launch-market tags read against the setting", async () => {
  const a = await mkUser("g1a");
  assert.equal(await recordSignupSource(a, "IG_DM"), "ig_dm");
  assert.equal(await sourceOf(a), "ig_dm");
  const b = await mkUser("g1b");
  assert.equal(await recordSignupSource(b, "kyoto_blog_cta:autumn-leaves"), "kyoto_blog_cta:autumn-leaves");
  assert.equal(await sourceOf(b), "kyoto_blog_cta:autumn-leaves");
  const c = await mkUser("g1c");
  assert.equal(await recordSignupSource(c, "lisbon_waitlist_page"), "other");
});

test("G2 — the first tag is kept; a later call never rewrites it", async () => {
  const id = await mkUser("g2");
  await recordSignupSource(id, "contact_form");
  await recordSignupSource(id, "email");
  assert.equal(await sourceOf(id), "contact_form");
});

test("G3 — no tag writes nothing", async () => {
  const id = await mkUser("g3");
  assert.equal(await recordSignupSource(id, undefined), null);
  assert.equal(await recordSignupSource(id, "   "), null);
  assert.equal(await sourceOf(id), null);
});

test("G4 — an unknown tag is stored as other, never as free text", async () => {
  const id = await mkUser("g4");
  assert.equal(await recordSignupSource(id, "<script>alert(1)</script>"), "other");
  assert.equal(await sourceOf(id), "other");
});

test("G5 — Replit: a new supply account records the tag once; a new traveler records nothing", async () => {
  await setMode("open");
  const supplyId = `${SUFFIX}-rp-supply`;
  ids.push(supplyId);
  assert.equal(await upsertUser({ sub: supplyId }, { intent: "supply", sourceTag: "ig_dm" }), supplyId);
  assert.equal(await sourceOf(supplyId), "ig_dm");
  // Signing in again (an existing account) never rewrites the first tag.
  await upsertUser({ sub: supplyId }, { intent: "supply", sourceTag: "email" });
  assert.equal(await sourceOf(supplyId), "ig_dm");
  const travelerId = `${SUFFIX}-rp-traveler`;
  ids.push(travelerId);
  await upsertUser({ sub: travelerId }, { intent: "traveler", sourceTag: "ig_dm" });
  assert.equal(await sourceOf(travelerId), null);
});

async function fbSignIn(profileId: string, intent: "supply" | "traveler", sourceTag: string | null) {
  ids.push(`fb_${profileId}`);
  return new Promise<any>((resolve, reject) => {
    facebookVerify("token", "refresh", { id: profileId, displayName: "Test Person", name: { givenName: "Test", familyName: "Person" } } as any,
      (err: any, user: any) => (err ? reject(err) : resolve(user)), { intent, sourceTag });
  });
}

test("G6 — Facebook: a new supply account records the tag; a new traveler records nothing", async () => {
  await setMode("open");
  const u = await fbSignIn(`${SUFFIX}-supply`, "supply", "kyoto_waitlist_page");
  assert.ok(u);
  assert.equal(await sourceOf(`fb_${SUFFIX}-supply`), "kyoto_waitlist_page");
  await fbSignIn(`${SUFFIX}-traveler`, "traveler", "ig_dm");
  assert.equal(await sourceOf(`fb_${SUFFIX}-traveler`), null);
});

test("G7 — the session stash carries the raw tag, capped; stale or absent carries none", () => {
  const now = 1_000_000;
  const req: any = { session: {}, query: { intent: "supply", source: `  ${"x".repeat(300)}  ` } };
  stashSignupIntent(req, now);
  assert.equal(readSignupSourceTag(req, now)?.length, 200);
  const req2: any = { session: {}, query: { intent: "supply", source: "ig_dm" } };
  stashSignupIntent(req2, now);
  assert.equal(readSignupSourceTag(req2, now), "ig_dm");
  assert.equal(readSignupSourceTag(req2, now + OAUTH_STATE_TTL_MS + 1), null);
  assert.equal(readSignupSourceTag({ session: {} }, now), null);
  const req3: any = { session: {}, query: { intent: "supply" } };
  stashSignupIntent(req3, now);
  assert.equal(readSignupSourceTag(req3, now), null);
});
