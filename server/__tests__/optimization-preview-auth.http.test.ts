/**
 * R297 (decision-maker ruling, Oct 4, 2026): `POST /api/optimization-preview` is SESSION-GATED like
 * every other plan route, and naming a plan requires READ access to it.
 *   A1 anonymous → 401, nothing scored
 *   A2 the plan's owner → 200 with the scored preview (findings over the plan's items)
 *   A3 another signed-in traveler naming the owner's plan → refused (the plan read gate), nothing scored
 *
 * SERVER REQUIRED (JOURNEY_BASE_URL, default :5000) + DISPOSABLE DB ONLY.
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/optimization-preview-auth.http.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const RUN = crypto.randomUUID().slice(0, 8);
const PASSWORD = "TestPass123!";
const ownerEmail = `optprev-${RUN}-owner@t.test`;
const otherEmail = `optprev-${RUN}-other@t.test`;
const tripId = `optprev-${RUN}-trip`;
let ownerCookie = "";
let otherCookie = "";

const body = {
  tripId,
  eventType: "vacation",
  travelers: 2,
  items: [
    { serviceType: "sightseeing", price: 20, duration: 90, dayNumber: 1 },
    { serviceType: "dining", price: 40, duration: 60, dayNumber: 1 },
  ],
};

function api(path: string, cookie: string | undefined, method = "GET", payload?: unknown) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  });
}

async function register(email: string): Promise<{ cookie: string; id: string }> {
  const reg = await api("/api/auth/register", undefined, "POST", { email, password: PASSWORD, firstName: "Opt", lastName: "Preview" });
  if (reg.status !== 201) assert.fail(`register failed (${reg.status}): ${await reg.text().catch(() => "")}`);
  return { cookie: reg.headers.get("set-cookie")!.split(";")[0], id: ((await reg.json()) as any).user.id };
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  const host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("[optimization-preview-auth] refusing to write fixtures outside a disposable database");
  }
  const owner = await register(ownerEmail);
  ownerCookie = owner.cookie;
  otherCookie = (await register(otherEmail)).cookie;
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date)
    VALUES (${tripId}, ${owner.id}, 'Preview auth', 'Kyoto', CURRENT_DATE + 30, CURRENT_DATE + 33)`);
});

after(async () => {
  try {
    await db.execute(sql`DELETE FROM trips WHERE id = ${tripId}`);
    await db.execute(sql`DELETE FROM users WHERE email IN (${ownerEmail}, ${otherEmail})`);
  } finally {
    await pool.end();
  }
});

test("A1 anonymous → 401", async () => {
  const res = await api("/api/optimization-preview", undefined, "POST", body);
  assert.equal(res.status, 401);
  const text = await res.text();
  assert.ok(!/currentScore|estimatedSavingsPct/.test(text), "nothing scored");
});

test("A2 the owner → 200 with the scored preview", async () => {
  const res = await api("/api/optimization-preview", ownerCookie, "POST", body);
  if (res.status !== 200) assert.fail(`owner preview should be 200, got ${res.status}: ${await res.text().catch(() => "")}`);
  const out = (await res.json()) as any;
  assert.equal(typeof out.currentScore, "number", "the preview is scored over the plan's items");
  assert.ok("metrics" in out);
});

test("A3 another traveler naming the owner's plan → refused", async () => {
  const res = await api("/api/optimization-preview", otherCookie, "POST", body);
  assert.ok(res.status === 403 || res.status === 404, `expected the plan read gate to refuse, got ${res.status}`);
  const text = await res.text();
  assert.ok(!/currentScore/.test(text));
});
