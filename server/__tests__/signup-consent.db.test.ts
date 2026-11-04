/**
 * N-2 server (round 2 rulings, Nov 4, 2026; ledger `2026-11-04-round2-exp-qa`): sign-up without consent is refused, and
 * consent is recorded only when the box said true.
 *
 *   C1  no `consent` field ⇒ 400, the error names `consent`, and no account is written
 *   C2  `consent: false` (and a string "true") ⇒ 400, no account
 *   C3  `consent: true` ⇒ the neutral 202, the account exists, and terms/privacy acceptance are stamped
 *
 * In-process handler (no server boot). Traveler sign-up is opened for the run and restored after.
 *
 * Run: npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/signup-consent.db.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import { invalidatePlatformFlagCache } from "../services/platform-flags";
import { setupEmailAuth } from "../replit_integrations/auth/emailAuth";
import { TRAVELER_SIGNUP_MODE_SETTING } from "@shared/launch-signup";

const RUN = crypto.randomUUID().slice(0, 8);
const emailFor = (k: string) => `consent-${k}-${RUN}@example.com`;
const rowsOf = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);
let savedMode: string | null = null;

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

async function account(email: string) {
  return rowsOf(await db.execute(sql`SELECT id, terms_accepted_at, privacy_accepted_at FROM users WHERE email = ${email}`))[0] ?? null;
}

const base = (k: string) => ({ email: emailFor(k), password: "longenough1", firstName: "Consent", lastName: "Fixture" });

before(async () => {
  savedMode = rowsOf(await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`))[0]?.setting_value ?? null;
  await db.execute(sql`
    INSERT INTO platform_settings (setting_key, setting_value) VALUES (${TRAVELER_SIGNUP_MODE_SETTING}, 'open')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = 'open'
  `);
  invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
});

after(async () => {
  for (const k of ["absent", "false", "string", "true"]) {
    const u = await account(emailFor(k));
    if (!u) continue;
    await db.execute(sql`DELETE FROM email_outbox WHERE metadata->>'userId' = ${u.id}`).catch(() => {});
    await db.execute(sql`DELETE FROM email_verification_tokens WHERE user_id = ${u.id}`).catch(() => {});
    await db.execute(sql`DELETE FROM users WHERE id = ${u.id}`).catch(() => {});
  }
  if (savedMode === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${savedMode} WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
  await pool.end();
});

test("C1 no consent field ⇒ 400, no account", async () => {
  const res = await register(base("absent"));
  assert.equal(res.statusCode, 400);
  assert.ok((res.body?.errors ?? []).some((e: any) => e.path?.includes("consent")), JSON.stringify(res.body));
  assert.equal(await account(emailFor("absent")), null);
});

test("C2 consent false (or a string) ⇒ 400, no account", async () => {
  assert.equal((await register({ ...base("false"), consent: false })).statusCode, 400);
  assert.equal(await account(emailFor("false")), null);
  assert.equal((await register({ ...base("string"), consent: "true" })).statusCode, 400);
  assert.equal(await account(emailFor("string")), null);
});

test("C3 consent true ⇒ neutral 202, account with terms and privacy acceptance stamped", async () => {
  const res = await register({ ...base("true"), consent: true });
  assert.equal(res.statusCode, 202, JSON.stringify(res.body));
  const u = await account(emailFor("true"));
  assert.ok(u, "account written");
  assert.ok(u.terms_accepted_at, "terms acceptance recorded");
  assert.ok(u.privacy_accepted_at, "privacy acceptance recorded");
});
