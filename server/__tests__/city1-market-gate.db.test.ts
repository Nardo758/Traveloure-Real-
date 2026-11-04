/**
 * CITY-1 (ledger `2026-11-04-city1-marquee-defaults`): only the marquee market (or a live one) runs the full planner.
 *
 *   T1 POST /api/trips for Porto (not open) → 409 { code: "market_not_open", market: "porto" }; Paris (no operating
 *      market) → 409 with market null; for the marquee → 201; an admin minting Porto → 201. The decision itself (pure + DB) is proven in-process as well.
 *   T4 the location view of a non-open operating market is the reduced payload: marketOpen:false and empty gems,
 *      events, listings, neighbourhoods and stubs; the marquee's view says marketOpen:true.
 *   T5 landing moments: a moment whose city is not open has cta "waitlist" and its market; the honeymoon moment's
 *      photo is the Goa file, whose attribution entry names Goa.
 *
 * Reads the settings the migrations seed (launch_market_slug = kyoto; no live_market_slugs row ⇒ none live). The
 * in-process half pins them for its own reads and restores them; the HTTP half runs against the CI server, whose
 * settings are the migration defaults.
 *
 * SERVER REQUIRED for T1's HTTP half (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY.
 *
 * Run: npx tsx --test --test-force-exit server/__tests__/city1-market-gate.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { after, before, test } from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql";
process.env.SESSION_SECRET ??= "city1-market-gate-test-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_city1_market_gate";
}

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); }
  catch { return "<none>"; }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[city1] REFUSING to write fixtures to '${host}'.`);
}

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { decideMarketOpen, marketOpenDecisionFor, MARKET_NOT_OPEN } = await import("../services/market-open-gate");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { LIVE_MARKET_SLUGS_SETTING } = await import("../../shared/ticker.js");
const { LAUNCH_MARKET_SLUG_SETTING } = await import("../../shared/launch-signup.js");
const { locationViewService } = await import("../services/location-view.service");
const { resolveLandingMoments, momentCta } = await import("../services/landing-moments");
const { registerAndSignIn } = await import("./fixtures/register-and-sign-in");

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const emailFor = (n: string) => `city1-${n}-${RUN}@t.test`;
const prior = new Map<string, string | null>();
const userIds: string[] = [];
let serverUp = false;

async function setSetting(key: string, value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`);
  invalidatePlatformFlagCache(key);
}

function day(offset: number) {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

async function mint(cookie: string, destination: string) {
  const res = await fetch(`${BASE_URL}/api/trips`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: `City1 ${RUN} ${destination}`, destination, startDate: day(40), endDate: day(42) }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* reported via text */ }
  return { status: res.status, json, text };
}

before(async () => {
  for (const key of [LAUNCH_MARKET_SLUG_SETTING, LIVE_MARKET_SLUGS_SETTING]) {
    const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
    prior.set(key, r.rows.length ? String((r.rows[0] as any).setting_value) : null);
  }
  // The migration defaults, pinned for the in-process reads.
  await setSetting(LAUNCH_MARKET_SLUG_SETTING, "kyoto");
  await setSetting(LIVE_MARKET_SLUGS_SETTING, null);
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  serverUp = !!health?.ok;
});

after(async () => {
  try {
    for (const [key, value] of prior) await setSetting(key, value);
    for (const id of userIds) {
      await db.execute(sql`DELETE FROM trip_collaborators WHERE user_id = ${id}`);
      await db.execute(sql`DELETE FROM trips WHERE user_id = ${id}`);
      await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
    }
  } finally {
    await pool.end();
  }
});

test("T1 — the decision: Porto and a non-market city are refused, the marquee passes, an admin passes", async () => {
  const base = { launch: "kyoto", live: [] as string[], qaDomain: undefined };
  assert.deepEqual(decideMarketOpen({ ...base, market: "porto", user: { role: "user", email: "a@b.test" } }), {
    allowed: false,
    code: MARKET_NOT_OPEN,
    market: "porto",
  });
  assert.deepEqual(decideMarketOpen({ ...base, market: "kyoto", user: { role: "user" } }), { allowed: true });
  assert.deepEqual(decideMarketOpen({ ...base, market: "porto", user: { role: "admin" } }), { allowed: true });
  assert.deepEqual(decideMarketOpen({ ...base, market: "porto", user: { email: "x@qa.test" }, qaDomain: "qa.test" }), { allowed: true });
  assert.deepEqual(decideMarketOpen({ ...base, market: "porto", live: ["porto"], user: { role: "user" } }), { allowed: true }, "a live market is open");
  // Leon, Nov 4 (#1882): a destination outside the operating markets is refused too, with market null.
  assert.deepEqual(decideMarketOpen({ ...base, market: null, user: { role: "user" } }), { allowed: false, code: MARKET_NOT_OPEN, market: null });
  assert.deepEqual(decideMarketOpen({ ...base, market: null, user: { role: "admin" } }), { allowed: true }, "admin bypass");

  // DB-backed: the settings and the user's role come from the database.
  const [u] = (await db.execute(sql`
    INSERT INTO users (id, email, role) VALUES (${`city1-${RUN}-u`}, ${emailFor("decide")}, 'user') RETURNING id
  `)).rows as { id: string }[];
  userIds.push(u.id);
  assert.deepEqual(await marketOpenDecisionFor(u.id, "Porto, Portugal"), { allowed: false, code: MARKET_NOT_OPEN, market: "porto" });
  assert.deepEqual(await marketOpenDecisionFor(u.id, "Kyoto, Japan"), { allowed: true });
  assert.deepEqual(await marketOpenDecisionFor(u.id, "Paris, France"), { allowed: false, code: MARKET_NOT_OPEN, market: null });
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${u.id}`);
  assert.deepEqual(await marketOpenDecisionFor(u.id, "Porto, Portugal"), { allowed: true }, "admin bypass");
});

test("T1 — POST /api/trips: Porto 409 market_not_open, Paris 409 (market null), the marquee 201, an admin 201", async (t) => {
  if (!serverUp) {
    t.skip(`no server on ${BASE_URL}`);
    return;
  }
  const traveler = await registerAndSignIn({ baseUrl: BASE_URL, email: emailFor("traveler"), password: "City1Pass!23" });
  userIds.push(traveler.id);
  const refused = await mint(traveler.cookie, "Porto, Portugal");
  assert.equal(refused.status, 409, refused.text);
  assert.deepEqual(refused.json, { code: "market_not_open", market: "porto" });
  const none = await db.execute(sql`SELECT id FROM trips WHERE user_id = ${traveler.id} AND destination = 'Porto, Portugal'`);
  assert.equal(none.rows.length, 0, "nothing is written before the refusal");

  const paris = await mint(traveler.cookie, "Paris, France");
  assert.equal(paris.status, 409, paris.text);
  assert.deepEqual(paris.json, { code: "market_not_open", market: null }, "a city outside the operating markets");

  const ok = await mint(traveler.cookie, "Kyoto, Japan");
  assert.equal(ok.status, 201, ok.text);

  const admin = await registerAndSignIn({ baseUrl: BASE_URL, email: emailFor("admin"), password: "City1Pass!23" });
  userIds.push(admin.id);
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${admin.id}`);
  const adminMint = await mint(admin.cookie, "Porto, Portugal");
  assert.equal(adminMint.status, 201, adminMint.text);
});

test("T4 — a non-open market's location view is the reduced payload; the marquee's is open", async () => {
  const porto = await locationViewService.getLocationView("Porto", null, {});
  assert.equal(porto.marketOpen, false);
  assert.equal(porto.market, "porto");
  assert.equal(porto.city, "Porto");
  assert.deepEqual(porto.gems.data, []);
  assert.deepEqual(porto.services.data, []);
  assert.deepEqual(porto.neighborhoods.data, []);
  assert.deepEqual((porto.events.data as any).events, []);
  assert.deepEqual(porto.externalStubs.data?.stubs, []);
  assert.deepEqual(porto.recommendations.data, []);

  const kyoto = await locationViewService.getLocationView("Kyoto", "Japan", {});
  assert.equal(kyoto.marketOpen, true);
  assert.equal(kyoto.market, "kyoto");
});

test("T5 — moments: a non-open city's moment links to its waitlist; the honeymoon photo is Goa's", async () => {
  assert.equal(momentCta("porto", "kyoto", []), "waitlist");
  assert.equal(momentCta("kyoto", "kyoto", []), "plan");
  assert.equal(momentCta("porto", "kyoto", ["porto"]), "plan");
  assert.equal(momentCta(null, "kyoto", []), "plan");

  const moments = await resolveLandingMoments();
  const anniversary = moments.find((m) => m.key === "anniversary");
  assert.ok(anniversary);
  assert.equal(anniversary!.market, "porto");
  assert.equal(anniversary!.cta, "waitlist");
  const proposal = moments.find((m) => m.key === "proposal");
  assert.equal(proposal?.cta, "plan", "the Kyoto proposal still starts a plan");

  const honeymoon = moments.find((m) => m.key === "honeymoon");
  assert.ok(honeymoon);
  const photo = honeymoon!.photos[0];
  assert.equal(photo.url, "/images/moments/goa-honeymoon.jpg");
  const attribution = JSON.parse(fs.readFileSync("client/public/images/moments/ATTRIBUTION.json", "utf8")) as Array<{
    key: string;
    file: string;
    place: string;
    creator: string;
  }>;
  const entry = attribution.find((a) => a.key === "honeymoon");
  assert.ok(entry, "the honeymoon moment has an attribution entry");
  assert.equal(entry!.file, "goa-honeymoon.jpg", "the entry is the photo the moment shows");
  assert.match(entry!.place, /Goa/, "the attribution names the moment's city");
  assert.equal(photo.credit, entry!.creator, "the credit travels with the photo");
});
