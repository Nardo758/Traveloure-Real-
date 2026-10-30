/**
 * WL-B server, option (c) (ledger `2026-10-30-wlb-provider-signup-gate`; Leon, Oct 30, 2026): the provider sign-up's
 * light fields live on the launch-market waitlist row; the full provider profile is completed later at
 * /become-provider. Synthetic rows only (example.com).
 *
 *   G7  a new provider account writes its fields to launch_waitlist (role provider) and nothing to users beyond the
 *       account, and no service_provider_forms row; a repeat updates the same row
 *   G11 an expert waitlist row stores contactName, its market (the "City you know best" picker), languages and link
 *       (website)
 *   G13 expert rows are counted as neither travelers nor providers
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/wlb-provider-signup-gate.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth";
import { joinWaitlist, recordProviderSignup, waitlistCounts } from "../services/launch-waitlist.service";
import { WAITLIST_PROVIDER_SIGNUP_SOURCE } from "@shared/launch-waitlist";

const RUN = crypto.randomUUID().slice(0, 8);
const MARKET = "kyoto";
const providerEmail = `wlb-provider-${RUN}@example.com`;
const expertEmail = `wlb-expert-${RUN}@example.com`;
const saved = new Map<string, string | null>();

const rowsOf = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);

async function setSetting(key: string, value: string) {
  if (!saved.has(key)) {
    const r = rowsOf(await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${key}`));
    saved.set(key, r[0]?.setting_value ?? null);
  }
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value) VALUES (${key}, ${value})
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
  `);
}

const handlers: Record<string, any> = {};
setupEmailAuth({
  post: (path: string, h: any) => { handlers[`POST ${path}`] = h; },
  get: (path: string, h: any) => { handlers[`GET ${path}`] = h; },
} as any);

async function register(body: Record<string, unknown>) {
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(p: any) { this.body = p; return this; } };
  await handlers["POST /api/auth/register"]({ body, session: {} }, res);
  return res;
}

async function waitlistRow(email: string) {
  return rowsOf(await db.execute(sql`
    SELECT role, source, contact_name, business_name, service_type, area, website, languages, consent_at
    FROM launch_waitlist WHERE email = ${email} AND market_slug = ${MARKET}
  `));
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");
  await setSetting("traveler_signup_mode", "waitlist");
  await setSetting("launch_market_slug", MARKET);
  invalidatePlatformFlagCache();
});

after(async () => {
  await db.execute(sql`DELETE FROM launch_waitlist WHERE email IN (${providerEmail}, ${expertEmail})`).catch(() => {});
  const users = rowsOf(await db.execute(sql`SELECT id FROM users WHERE email = ${providerEmail}`).catch(() => ({ rows: [] })));
  for (const u of users) {
    await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'userId' = ${u.id}`).catch(() => {});
    await db.execute(sql`DELETE FROM email_verification_tokens WHERE user_id = ${u.id}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${u.id}`).catch(() => {});
  }
  for (const [key, value] of saved) {
    if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${key}`);
    else await db.execute(sql`UPDATE platform_settings SET setting_value = ${value} WHERE setting_key = ${key}`);
  }
  invalidatePlatformFlagCache();
  await pool.end().catch(() => {});
});

test("G7 a provider sign-up writes its fields to the waitlist row, not to a provider form", async () => {
  const res = await register({
    email: providerEmail,
    password: "longenough1",
    firstName: "Fixture",
    lastName: "Provider",
    intent: "supply",
    supplyRole: "provider",
    provider: { businessName: "Fixture Tours", category: "venue", city: "Kyoto", website: "https://example.com", languages: "Japanese, English" },
  });
  assert.equal(res.statusCode, 202);
  const users = rowsOf(await db.execute(sql`SELECT id, role FROM users WHERE email = ${providerEmail}`));
  assert.equal(users.length, 1);
  assert.equal(users[0].role, "user", "the role stays user");
  const forms = rowsOf(await db.execute(sql`SELECT count(*)::int AS n FROM service_provider_forms WHERE user_id = ${users[0].id}`));
  assert.equal(forms[0].n, 0, "the full provider profile is completed later");
  const [row] = await waitlistRow(providerEmail);
  assert.equal(row.role, "provider");
  assert.equal(row.source, WAITLIST_PROVIDER_SIGNUP_SOURCE);
  assert.equal(row.contact_name, "Fixture Provider");
  assert.equal(row.business_name, "Fixture Tours");
  assert.equal(row.service_type, "venue");
  assert.equal(row.area, "Kyoto");
  assert.equal(row.website, "https://example.com");
  assert.deepEqual(row.languages, ["Japanese", "English"]);
  assert.equal(row.consent_at, null, "an account is not a tick on the waitlist box");

  await recordProviderSignup({ email: providerEmail, contactName: "Fixture Provider", fields: { businessName: "Fixture Tours 2", category: "transport", city: "Kyoto" }, marketSlug: MARKET });
  const again = await waitlistRow(providerEmail);
  assert.equal(again.length, 1);
  assert.equal(again[0].business_name, "Fixture Tours 2");
  assert.equal(again[0].website, null);
});

test("G11/G13 an expert row stores its fields and is counted as neither travelers nor providers", async () => {
  const before = await waitlistCounts(MARKET);
  await joinWaitlist({ role: "expert", email: expertEmail, consent: true, contactName: "Fixture Expert", market: MARKET, languages: "Japanese", link: "https://example.com/work" } as any, MARKET);
  const [row] = await waitlistRow(expertEmail);
  assert.equal(row.role, "expert");
  assert.equal(row.contact_name, "Fixture Expert");
  assert.equal(row.area, null, "the city is the row's market");
  assert.deepEqual(row.languages, ["Japanese"]);
  assert.equal(row.website, "https://example.com/work");
  assert.equal(row.business_name, null);
  assert.equal(row.service_type, null);
  const afterCounts = await waitlistCounts(MARKET);
  assert.equal(afterCounts.travelers.total, before.travelers.total);
  assert.equal(afterCounts.providers.total, before.providers.total);
});
