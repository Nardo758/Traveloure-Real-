/**
 * WAIT-1 (ledger `2026-11-04-wait1-all-markets`): one waitlist covering every operating market.
 *
 *   R1 getLiveMarketSlugs: no `live_market_slugs` row ⇒ [] (432 seeds the row later)
 *   R2 getMarketLaunchDates: no `market_launch_dates` row ⇒ {}
 *   T2 one join for [kyoto, porto] ⇒ two rows for the same email, each with consent_at and its own consent_records;
 *      re-posting upserts and keeps the first consent_at
 *   T3 the older body `market: "kyoto"` still works (one row)
 *   T8 a market-opened enqueue for porto/traveler reaches only porto rows that consented and did not unsubscribe
 *
 * DISPOSABLE DB ONLY. Settings rows this touches are restored; waitlist rows and outbox rows are deleted.
 *
 * Run: npx tsx --test server/__tests__/wait1-multi-market.db.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://ubuntu@localhost/traveloure?host=/var/run/postgresql";
process.env.SESSION_SECRET ??= "wait1-multi-market-test-secret";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_wait1_multi_market";
}

const host = (() => {
  try { return new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); }
  catch { return "<none>"; }
})();
if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`[wait1] REFUSING to write fixtures to '${host}'.`);
}

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { db } = await import("../db");
const { sql } = await import("drizzle-orm");
const { joinWaitlistMarkets, joinWaitlist, enqueueMarketOpened } = await import("../services/launch-waitlist.service.js");
const { getLiveMarketSlugs, getMarketLaunchDates, invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { LIVE_MARKET_SLUGS_SETTING, MARKET_LAUNCH_DATES_SETTING } = await import("../../shared/ticker.js");
const { waitlistJoinBodySchema, resolveWaitlistMarkets, WAITLIST_CONSENT_KEY } = await import("../../shared/launch-waitlist.js");
const { MARKETING_EMAIL_FOOTER_FIELDS } = await import("../../shared/marketing-email-footer.js");
// The market-opened email needs the marketing footer settings to compose; the test sets fixture values and restores them.
const FOOTER_KEYS = MARKETING_EMAIL_FOOTER_FIELDS.map((f) => f.key);

const RUN = crypto.randomUUID().slice(0, 8);
// Not the QA domain: the market-opened enqueue leaves QA addresses out.
const email = (n: string) => `wait1-${n}-${RUN}@wait1-test.invalid`;
const prior = new Map<string, string | null>();

async function rows(address: string) {
  const r = await pool.query(
    `SELECT id, market_slug, consent_at FROM launch_waitlist WHERE email = $1 ORDER BY market_slug`,
    [address],
  );
  return r.rows as { id: string; market_slug: string; consent_at: Date | null }[];
}

async function consentRows(waitlistId: string) {
  const r = await pool.query(`SELECT consent_key, consent_text_version FROM consent_records WHERE waitlist_id = $1`, [waitlistId]);
  return r.rows as { consent_key: string; consent_text_version: string }[];
}

before(async () => {
  for (const key of [LIVE_MARKET_SLUGS_SETTING, MARKET_LAUNCH_DATES_SETTING, ...FOOTER_KEYS]) {
    const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`);
    prior.set(key, r.rows.length ? String((r.rows[0] as any).setting_value) : null);
  }
});

after(async () => {
  try {
    for (const [key, value] of prior) {
      if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
      else
        await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${key}, ${value}, NOW())
          ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`);
      invalidatePlatformFlagCache(key);
    }
    await pool.query(`DELETE FROM email_outbox WHERE metadata->>'dedupeKey' LIKE $1`, [`market-opened-%-wait1-%-${RUN}@wait1-test.invalid`]);
    await pool.query(`DELETE FROM launch_waitlist WHERE email LIKE $1`, [`wait1-%-${RUN}@wait1-test.invalid`]);
  } finally {
    await pool.end();
  }
});

test("R1 no live_market_slugs row ⇒ []", async () => {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${LIVE_MARKET_SLUGS_SETTING}`);
  invalidatePlatformFlagCache(LIVE_MARKET_SLUGS_SETTING);
  assert.deepEqual(await getLiveMarketSlugs(), []);
});

test("R2 no market_launch_dates row ⇒ {}", async () => {
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${MARKET_LAUNCH_DATES_SETTING}`);
  invalidatePlatformFlagCache(MARKET_LAUNCH_DATES_SETTING);
  assert.deepEqual(await getMarketLaunchDates(), {});
});

test("T2 one join for two markets ⇒ two rows, each consented; a re-post keeps the first consent_at", async () => {
  const address = email("two");
  const body = waitlistJoinBodySchema.parse({ role: "traveler", email: address, markets: ["kyoto", "porto"], consent: true });
  const resolved = resolveWaitlistMarkets(body.markets, body.market, "kyoto");
  assert.deepEqual(resolved, { ok: true, markets: ["kyoto", "porto"] });
  const { markets: _m, market: _one, homepage: _h, ref: _r, ...rest } = body as any;
  const first = await joinWaitlistMarkets(rest, ["kyoto", "porto"]);
  assert.deepEqual(first, [{ marketSlug: "kyoto", inserted: true }, { marketSlug: "porto", inserted: true }]);
  const written = await rows(address);
  assert.deepEqual(written.map((r) => r.market_slug), ["kyoto", "porto"]);
  for (const r of written) {
    assert.ok(r.consent_at, `${r.market_slug} has consent_at`);
    const c = await consentRows(r.id);
    assert.equal(c.filter((x) => x.consent_key === WAITLIST_CONSENT_KEY).length, 1, `${r.market_slug} has its own consent record`);
  }
  const again = await joinWaitlistMarkets(rest, ["kyoto", "porto"]);
  assert.deepEqual(again.map((x) => x.inserted), [false, false]);
  const after2 = await rows(address);
  assert.equal(after2.length, 2);
  for (const [i, r] of after2.entries()) assert.equal(r.consent_at?.getTime(), written[i].consent_at?.getTime(), "first consent kept");
});

test("T3 the older single-market body still works", async () => {
  const address = email("one");
  const body = waitlistJoinBodySchema.parse({ role: "traveler", email: address, market: "kyoto", consent: true });
  const resolved = resolveWaitlistMarkets(body.markets, body.market, "kyoto");
  assert.deepEqual(resolved, { ok: true, markets: ["kyoto"] });
  await joinWaitlist({ role: "traveler", email: address, consent: true }, "kyoto");
  assert.deepEqual((await rows(address)).map((r) => r.market_slug), ["kyoto"]);
  assert.deepEqual(resolveWaitlistMarkets(["kyoto", "atlantis"], undefined, "kyoto"), { ok: false, code: "UNKNOWN_MARKET" });
  assert.deepEqual(resolveWaitlistMarkets(["porto", "porto"], undefined, "kyoto"), { ok: true, markets: ["porto"] });
});

test("T8 market-opened for porto/traveler reaches only consented, subscribed porto rows", async () => {
  const yes = email("porto-yes");
  const kyotoOnly = email("kyoto-only");
  const noConsent = email("porto-no-consent");
  const gone = email("porto-unsubscribed");
  await joinWaitlistMarkets({ role: "traveler", email: yes, consent: true }, ["kyoto", "porto"]);
  await joinWaitlistMarkets({ role: "traveler", email: kyotoOnly, consent: true }, ["kyoto"]);
  await joinWaitlistMarkets({ role: "traveler", email: noConsent, consent: false }, ["porto"]);
  await joinWaitlistMarkets({ role: "traveler", email: gone, consent: true }, ["porto"]);
  await pool.query(`UPDATE launch_waitlist SET unsubscribed_at = NOW() WHERE email = $1`, [gone]);

  for (const key of FOOTER_KEYS) {
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${key}, ${"WAIT-1 test fixture"}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`);
    invalidatePlatformFlagCache(key);
  }
  await enqueueMarketOpened({ market: "porto", role: "traveler" });
  const queued = await pool.query(
    `SELECT metadata->>'dedupeKey' AS k FROM email_outbox WHERE metadata->>'dedupeKey' LIKE $1`,
    [`market-opened-%-wait1-%-${RUN}@wait1-test.invalid`],
  );
  const mine = new Set([yes, kyotoOnly, noConsent, gone]);
  const keys = (queued.rows as { k: string }[])
    .map((r) => r.k)
    .filter((k) => mine.has(k.replace(/^market-opened-[a-z-]+-traveler-/, "")))
    .sort();
  assert.deepEqual(keys, [`market-opened-porto-traveler-${yes}`], JSON.stringify(keys));
});
