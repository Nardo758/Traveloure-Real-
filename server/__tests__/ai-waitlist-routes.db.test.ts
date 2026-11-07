/**
 * The three draft routes on content.routes refuse in waitlist mode with the same
 * decision the purchase routes use. An admin, a QA-domain account, and open mode
 * are not that refusal. Response text from these handlers does not label the draft as AI.
 *
 * In-process, so the platform-flag cache can be invalidated. Bodies are invalid on
 * purpose: a pass stops at validation or the role check and does not call a model.
 *
 * Run: DATABASE_URL=… JOURNEY_DB_WRITES_OK=1 npx tsx --test --test-concurrency=1 --test-force-exit server/__tests__/ai-waitlist-routes.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  ? process.env.STRIPE_SECRET_KEY
  : "sk_test_dummy";
const QA_DOMAIN = process.env.QA_ACCOUNT_EMAIL_DOMAIN || "aiw-qa.test";
process.env.QA_ACCOUNT_EMAIL_DOMAIN = QA_DOMAIN;

const { db, pool } = await import("../db");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { TRAVELER_SIGNUP_MODE_SETTING, TRAVELER_WAITLIST, TRAVELER_WAITLIST_MESSAGE } = await import("@shared/launch-signup");
const contentRouter = (await import("../routes/content.routes")).default;
const { travelPulseScheduler } = await import("../services/travelpulse-scheduler.service");

const RUN = crypto.randomUUID().slice(0, 8);
const P = `aiw-${RUN}`;
const traveler = `${P}-trav`;
const adminUser = `${P}-admin`;
const qaUser = `${P}-qa`;
let priorMode: string | null = null;

const PATHS = ["/api/ai/generate-blueprint", "/api/ai/chat", "/api/ai/optimize-experience"] as const;
const INVALID = { nope: true };

async function post(url: string, userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).isAuthenticated = () => userId != null;
    if (userId) (req as any).user = { claims: { sub: userId, name: "T" } };
    next();
  });
  app.use(contentRouter);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(INVALID),
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, text };
  } finally {
    server.close();
  }
}

async function setMode(value: string | null) {
  if (value === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  else
    await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value, updated_at) VALUES (${TRAVELER_SIGNUP_MODE_SETTING}, ${value}, NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`);
  invalidatePlatformFlagCache(TRAVELER_SIGNUP_MODE_SETTING);
}

function isWaitlistRefusal(res: { status: number; body: any }) {
  return res.status === 403 && res.body?.code === TRAVELER_WAITLIST && res.body?.message === TRAVELER_WAITLIST_MESSAGE;
}

function handlerSlice(source: string, routePath: string): string {
  const start = source.indexOf(`router.post("${routePath}"`);
  assert.ok(start >= 0, routePath);
  const next = source.indexOf("\nrouter.", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${TRAVELER_SIGNUP_MODE_SETTING}`);
  priorMode = r.rows.length ? String((r.rows[0] as any).setting_value) : null;
  await db.execute(sql`
    INSERT INTO users (id, email, first_name, last_name, role, email_verified) VALUES
      (${traveler}, ${`${traveler}@traveloure.test`}, 'A', 'Traveler', 'user', NOW()),
      (${adminUser}, ${`${adminUser}@traveloure.test`}, 'A', 'Admin', 'admin', NOW()),
      (${qaUser}, ${`${qaUser}@${QA_DOMAIN}`}, 'A', 'Qa', 'user', NOW())
  `);
});

after(async () => {
  try {
    await travelPulseScheduler.stop();
    await db.execute(sql`DELETE FROM users WHERE id IN (${traveler}, ${adminUser}, ${qaUser})`).catch(() => {});
    await setMode(priorMode);
  } finally {
    await pool.end();
  }
});

test("W0 the three handlers refuse before any model call, and their own strings do not label the draft", () => {
  const source = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  for (const routePath of PATHS) {
    const body = handlerSlice(source, routePath);
    const gate = body.indexOf("waitlistPurchaseDecisionFor");
    const model = body.indexOf("anthropic.messages.create");
    assert.ok(gate > 0 && model > gate, routePath);
    const quoted = body.match(/"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/g) ?? [];
    for (const q of quoted) assert.doesNotMatch(q, /\bAI\b/, `${routePath} ${q}`);
  }
});

for (const routePath of PATHS) {
  test(`${routePath}: waitlist refuses a traveler; admin, QA and open mode do not`, async () => {
    const anon = await post(routePath, null);
    assert.equal(anon.status, 401, routePath);

    await setMode("waitlist");
    const refused = await post(routePath, traveler);
    assert.ok(isWaitlistRefusal(refused), `${routePath} traveler ${JSON.stringify(refused.body)}`);
    assert.doesNotMatch(refused.text, /\bAI\b/);

    const asAdmin = await post(routePath, adminUser);
    assert.ok(!isWaitlistRefusal(asAdmin), `${routePath} admin ${asAdmin.status} ${JSON.stringify(asAdmin.body)}`);
    assert.doesNotMatch(asAdmin.text, /\bAI\b/);
    const asQa = await post(routePath, qaUser);
    assert.ok(!isWaitlistRefusal(asQa), `${routePath} QA ${asQa.status} ${JSON.stringify(asQa.body)}`);
    assert.doesNotMatch(asQa.text, /\bAI\b/);

    await setMode("open");
    const open = await post(routePath, traveler);
    assert.ok(!isWaitlistRefusal(open), `${routePath} open ${open.status} ${JSON.stringify(open.body)}`);
    assert.doesNotMatch(open.text, /\bAI\b/);
  });
}
