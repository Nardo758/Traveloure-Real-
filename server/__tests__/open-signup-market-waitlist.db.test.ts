/**
 * Leon, Nov 11, 2026: waitlist mode creates an account on every door, and one email can hold
 * several roles in one market (migration 445). Synthetic rows only.
 *
 * Run: JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/open-signup-market-waitlist.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth";
import {
  joinWaitlistMarkets,
  leavePartnerWaitlist,
  listWaitlistEntries,
  partnerWaitlistMarkets,
} from "../services/launch-waitlist.service";

const RUN = crypto.randomUUID().slice(0, 8);
const emails = {
  traveler: `open-signup-${RUN}-traveler@example.com`,
  modal: `open-signup-${RUN}-modal@example.com`,
  provider: `open-signup-${RUN}-provider@example.com`,
  expert: `open-signup-${RUN}-expert@example.com`,
  roleless: `open-signup-${RUN}-roleless@example.com`,
  open: `open-signup-${RUN}-open@example.com`,
  both: `open-signup-${RUN}-both@example.com`,
};
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
  invalidatePlatformFlagCache();
}

const handlers: Record<string, any> = {};
setupEmailAuth({
  post: (path: string, h: any) => { handlers[`POST ${path}`] = h; },
  get: () => {},
} as any);

async function register(body: Record<string, unknown>) {
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(p: any) { this.body = p; return this; } };
  await handlers["POST /api/auth/register"]({
    body: { password: "longenough1", firstName: "Phase", lastName: "Zero", consent: true, ...body },
    session: {},
  }, res);
  return res;
}

before(async () => {
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1");
  const sqlText = fs.readFileSync(new URL("../migrations/445_launch_waitlist_email_market_role.sql", import.meta.url), "utf8");
  const statements = sqlText.split(";").map((s) => s.replace(/--[^\n]*/g, "").trim()).filter(Boolean);
  for (const statement of statements) await db.execute(sql.raw(statement));
  await setSetting("traveler_signup_mode", "waitlist");
  await setSetting("launch_market_slug", "kyoto");
});

after(async () => {
  const list = Object.values(emails);
  for (const email of list) {
    await db.execute(sql`DELETE FROM launch_waitlist WHERE email = ${email}`).catch(() => {});
  }
  const users: { id: string }[] = [];
  for (const email of list) {
    users.push(...rowsOf(await db.execute(sql`SELECT id FROM users WHERE email = ${email}`).catch(() => ({ rows: [] }))));
  }
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

test("waitlist mode creates a traveler, a provider modal, a provider with fields, an expert, and a role-less supply account", async () => {
  const traveler = await register({ email: emails.traveler });
  assert.equal(traveler.statusCode, 202);
  assert.equal(traveler.body.code, "registration_received");
  const modal = await register({ email: emails.modal, intent: "supply" });
  assert.equal(modal.statusCode, 202);
  const provider = await register({
    email: emails.provider,
    intent: "supply",
    supplyRole: "provider",
    signupSource: "ig_dm",
    provider: { businessName: "Phase0 Tours", category: "other", city: "Kyoto" },
  });
  assert.equal(provider.statusCode, 202);
  const expert = await register({ email: emails.expert, intent: "supply", supplyRole: "expert" });
  assert.equal(expert.statusCode, 202);
  assert.equal(expert.body.reason, undefined);
  const roleless = await register({ email: emails.roleless, intent: "supply" });
  assert.equal(roleless.statusCode, 202);

  const roles = rowsOf(await db.execute(sql`SELECT email, role, signup_source FROM users WHERE email IN (${emails.traveler}, ${emails.modal}, ${emails.provider}, ${emails.expert}, ${emails.roleless})`));
  assert.equal(roles.length, 5);
  for (const row of roles) assert.equal(row.role, "user");
  assert.equal(roles.find((r: any) => r.email === emails.provider).signup_source, "ig_dm");
  const wait = rowsOf(await db.execute(sql`SELECT role, business_name, service_type, area, source FROM launch_waitlist WHERE email = ${emails.provider}`));
  assert.equal(wait.length, 1);
  assert.equal(wait[0].role, "provider");
  assert.equal(wait[0].business_name, "Phase0 Tours");
  assert.equal(wait[0].service_type, "other");
  assert.equal(wait[0].area, "Kyoto");
  assert.equal(wait[0].source, "provider_signup");
});

test("open mode also creates a traveler account", async () => {
  await setSetting("traveler_signup_mode", "open");
  const res = await register({ email: emails.open });
  assert.equal(res.statusCode, 202);
  const rows = rowsOf(await db.execute(sql`SELECT role FROM users WHERE email = ${emails.open}`));
  assert.equal(rows[0].role, "user");
  await setSetting("traveler_signup_mode", "waitlist");
});

test("one email holds an expert row and a provider row in the same market, and a leave then rejoin clears unsubscribed_at", async () => {
  await joinWaitlistMarkets({ role: "expert", email: emails.both, contactName: "Aki" }, ["kyoto", "goa"], null);
  await joinWaitlistMarkets({ role: "provider", email: emails.both, contactName: "Aki", serviceType: "venue" }, ["kyoto"], null);
  const rows = rowsOf(await db.execute(sql`
    SELECT role, market_slug, unsubscribed_at FROM launch_waitlist WHERE email = ${emails.both} ORDER BY role, market_slug
  `));
  assert.deepEqual(rows.map((r: any) => `${r.role}:${r.market_slug}`), ["expert:goa", "expert:kyoto", "provider:kyoto"]);
  assert.deepEqual(await partnerWaitlistMarkets(emails.both, "expert"), ["goa", "kyoto"]);

  await leavePartnerWaitlist(emails.both, "expert", "goa");
  assert.deepEqual(await partnerWaitlistMarkets(emails.both, "expert"), ["kyoto"]);
  const left = rowsOf(await db.execute(sql`SELECT unsubscribed_at FROM launch_waitlist WHERE email = ${emails.both} AND role = 'expert' AND market_slug = 'goa'`));
  assert.ok(left[0].unsubscribed_at);

  await joinWaitlistMarkets({ role: "expert", email: emails.both, contactName: "Aki" }, ["goa"], null);
  const back = rowsOf(await db.execute(sql`SELECT unsubscribed_at FROM launch_waitlist WHERE email = ${emails.both} AND role = 'expert' AND market_slug = 'goa'`));
  assert.equal(back[0].unsubscribed_at, null);
  assert.deepEqual(await partnerWaitlistMarkets(emails.both, "expert"), ["goa", "kyoto"]);

  const entries = await listWaitlistEntries("kyoto");
  const mine = entries.filter((r) => r.email === emails.both);
  assert.deepEqual(mine.map((r) => r.role), ["expert", "provider"]);
  assert.ok(entries.every((r, i) => i === 0 || r.marketSlug >= entries[i - 1].marketSlug || entries[i - 1].marketSlug === "kyoto"));
});
