/**
 * PREFERENCE AND STOREFRONT SAVES READ BACK — board task #1264 (ledger `2026-09-23-profile-saves-read-back`).
 *
 * Three owner-scoped writers share ONE jsonb column, `users.preferences`, each owning one key:
 * `PATCH /api/me/preferences` → `settings` (plus the real column `email_booking_alerts`),
 * `PATCH /api/me/storefront` → `storefront` (plus the real column `users.bio`), and
 * `PATCH /api/me/travel-preferences` → `travelPreferences`. Each is a shallow merge of its own key,
 * and each says "present sets, null clears, absent leaves untouched". Nothing proved any of that
 * end to end: a save that answered 200 and then read back something else would pass every check
 * this repo had.
 *
 *   S1  Account settings save and read back, and a partial notifications patch MERGES per event —
 *       the events it did not name survive. `emailBookingAlerts` round-trips through its own column.
 *   S2  Storefront cover and bio save and read back on the PUBLIC storefront; `null` clears the
 *       cover while an absent bio stays as it was.
 *   S3  Travel preferences save, read back, and clear the budget with `null`.
 *   S4  The three writers never clobber each other's key: after all three have written, every
 *       read still returns its own values.
 *   S5  The refusals: an `http:` cover URL, an unknown key (the schemas are `.strict()`), an invalid
 *       travel style, and an anonymous caller — none of them writes anything.
 *
 * Run against a disposable dev database only, with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/profile-saves-read-back.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const HANDLE = `psr${RUN}earner`;
const EMAIL = `profile-saves-${RUN}@traveloure.test`;
const COVER = "https://images.example.com/cover-a.jpg";

let cookie = "";
let userId = "";
let serviceId = "";

async function call(method: string, path: string, body?: unknown, withSession = true) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(withSession && cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

async function storedPreferences(): Promise<any> {
  const r = await pool.query(
    `SELECT preferences, bio, email_booking_alerts FROM users WHERE id = $1`,
    [userId],
  );
  return r.rows[0];
}

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health?.ok, `dev server must be running on ${BASE_URL}`);
  assert.equal(process.env.JOURNEY_DB_WRITES_OK, "1", "Refusing to write fixtures without JOURNEY_DB_WRITES_OK=1");

  const reg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, firstName: "Profile", lastName: "Saves" }),
  });
  const regText = await reg.text();
  assert.equal(reg.status, 201, regText);
  const setCookie = reg.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  cookie = setCookie!.split(";")[0];
  userId = (JSON.parse(regText) as { user: { id: string } }).user.id;

  // A handled provider with one approved listing has a public storefront, which is where the
  // storefront save is read back from.
  await pool.query(`UPDATE users SET role = 'service_provider', handle = $1 WHERE id = $2`, [HANDLE, userId]);
  serviceId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO provider_services (id, user_id, service_name, price, status, approval_status, delivery_method)
     VALUES ($1, $2, 'Profile saves listing', '80.00', 'active', 'approved', 'pdf')`,
    [serviceId, userId],
  );
});

after(async () => {
  try {
    if (serviceId) await pool.query(`DELETE FROM provider_services WHERE id = $1`, [serviceId]);
    await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
  } finally {
    await pool.end();
  }
});

test("S1: account settings save, read back, and merge a partial notifications patch", async () => {
  const first = await call("PATCH", "/api/me/preferences", {
    language: "ja",
    timezone: "Asia/Tokyo",
    notifications: { newMessage: { email: true, push: false }, bookingRequest: { email: true, push: true } },
    emailBookingAlerts: false,
  });
  assert.equal(first.status, 200, first.text);

  // The merge is per EVENT (the settings pages send each event's channels whole).
  const second = await call("PATCH", "/api/me/preferences", { notifications: { bookingRequest: { email: false, push: true } } });
  assert.equal(second.status, 200, second.text);

  const read = await call("GET", "/api/me/preferences");
  assert.equal(read.status, 200, read.text);
  assert.equal(read.json.language, "ja");
  assert.equal(read.json.timezone, "Asia/Tokyo");
  assert.deepEqual(
    read.json.notifications,
    { newMessage: { email: true, push: false }, bookingRequest: { email: false, push: true } },
    "the event the patch did not name survives",
  );
  assert.equal(read.json.emailBookingAlerts, false, "the real column round-trips");

  const row = await storedPreferences();
  assert.equal(row.email_booking_alerts, false);
  assert.equal(row.preferences.settings.language, "ja");
});

test("S2: storefront cover and bio save and read back on the public storefront", async () => {
  const saved = await call("PATCH", "/api/me/storefront", { coverImageUrl: COVER, bio: "Kyoto tea mornings." });
  assert.equal(saved.status, 200, saved.text);

  const shown = await call("GET", `/api/storefront/${HANDLE}`, undefined, false);
  assert.equal(shown.status, 200, shown.text);
  assert.equal(shown.json.earner.coverImageUrl, COVER);
  assert.equal(shown.json.earner.bio, "Kyoto tea mornings.");

  // null clears the cover; an absent bio is left exactly as it was.
  const cleared = await call("PATCH", "/api/me/storefront", { coverImageUrl: null });
  assert.equal(cleared.status, 200, cleared.text);
  const after = await call("GET", `/api/storefront/${HANDLE}`, undefined, false);
  assert.equal(after.json.earner.coverImageUrl, null);
  assert.equal(after.json.earner.bio, "Kyoto tea mornings.");
});

test("S3: travel preferences save, read back and clear the budget with null", async () => {
  const saved = await call("PATCH", "/api/me/travel-preferences", {
    travelStyles: ["Culture", "Food & Dining"],
    budgetPreference: "Moderate",
  });
  assert.equal(saved.status, 200, saved.text);
  let read = await call("GET", "/api/me/travel-preferences");
  assert.deepEqual(read.json, { travelStyles: ["Culture", "Food & Dining"], budgetPreference: "Moderate" });

  const cleared = await call("PATCH", "/api/me/travel-preferences", { budgetPreference: null });
  assert.equal(cleared.status, 200, cleared.text);
  read = await call("GET", "/api/me/travel-preferences");
  assert.deepEqual(read.json, { travelStyles: ["Culture", "Food & Dining"], budgetPreference: null });
});

test("S4: the three writers never clobber each other's key in users.preferences", async () => {
  // Write each namespace once more, in a different order from S1–S3, then read every one back.
  assert.equal((await call("PATCH", "/api/me/storefront", { coverImageUrl: COVER })).status, 200);
  assert.equal((await call("PATCH", "/api/me/travel-preferences", { travelStyles: ["Nature"] })).status, 200);
  assert.equal((await call("PATCH", "/api/me/preferences", { timezone: "Asia/Osaka" })).status, 200);

  const settings = await call("GET", "/api/me/preferences");
  assert.equal(settings.json.language, "ja");
  assert.equal(settings.json.timezone, "Asia/Osaka");
  assert.deepEqual(settings.json.notifications, {
    newMessage: { email: true, push: false },
    bookingRequest: { email: false, push: true },
  });

  const travel = await call("GET", "/api/me/travel-preferences");
  assert.deepEqual(travel.json, { travelStyles: ["Nature"], budgetPreference: null });

  const storefront = await call("GET", `/api/storefront/${HANDLE}`, undefined, false);
  assert.equal(storefront.json.earner.coverImageUrl, COVER);
  assert.equal(storefront.json.earner.bio, "Kyoto tea mornings.");

  const row = await storedPreferences();
  assert.deepEqual(Object.keys(row.preferences).sort(), ["settings", "storefront", "travelPreferences"]);
});

test("S5: refused saves write nothing", async () => {
  const before = await storedPreferences();

  const insecure = await call("PATCH", "/api/me/storefront", { coverImageUrl: "http://images.example.com/x.jpg" });
  assert.equal(insecure.status, 400, "a non-https cover URL is refused");
  const unknownStorefront = await call("PATCH", "/api/me/storefront", { handle: "someone-else" });
  assert.equal(unknownStorefront.status, 400, "the storefront schema is strict");
  const unknownSettings = await call("PATCH", "/api/me/preferences", { role: "admin" });
  assert.equal(unknownSettings.status, 400, "the settings schema is strict");
  const badStyle = await call("PATCH", "/api/me/travel-preferences", { travelStyles: ["Skydiving"] });
  assert.equal(badStyle.status, 400, "a travel style outside the list is refused");
  const anonymous = await call("PATCH", "/api/me/storefront", { bio: "not mine" }, false);
  assert.equal(anonymous.status, 401, "an anonymous caller cannot save");

  assert.deepEqual(await storedPreferences(), before, "no refused save may change the row");
});
