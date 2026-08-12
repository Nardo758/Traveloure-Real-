/**
 * PROVIDER OFFICE / PLACE-OF-BUSINESS LOCATION — behavioural proof of ruling 85
 * (CLAUDE.md §13 / publish-trap; §14/§18/§19 do NOT apply — provider CONFIG, not money/identity).
 *
 * RATIFIED FEATURE: an account-level `service_provider_forms.office_location` jsonb {address,lat,lng},
 * captured via the SAME confirm-gated LocationPointPicker the per-listing meeting pin uses (address
 * typed OR pin dropped; geocoded through the ONE server path POST /api/geocode; persisted ONLY on
 * explicit Confirm). PURPOSE: pre-fill a NEW listing's meeting pin so the provider doesn't re-place
 * it every time (overridable/removable per listing). Owner-gated write; NULL = "not set" — the honest
 * §13 default, never a fabricated coordinate.
 *
 * NEGATIVES FIRST:
 *   N1  unauthenticated PATCH /api/provider-application ⇒ 401 (never writes).
 *   N2  §13/validation — an out-of-range lat/lng is REJECTED (400), never silently stored.
 *   N3  a malformed body (non-object, or the key omitted) ⇒ 400.
 *   P1  a provider SETS officeLocation {address,lat,lng} on their OWN row ⇒ 200, persists (GET + DB).
 *   P2  clear-to-null works ⇒ 200, row officeLocation NULL; GET reads back null (§13 — NULL stays
 *       NULL, no invented coordinate); a provider with no office location reads back null.
 *   P3  OWNER SCOPING — a second provider's write touches ONLY their own row; provider A's row is
 *       unchanged (route resolves the row by session userId; storage scopes by userId, never a body id).
 *   P4  PRE-FILL HONESTY (owner-read seed source) — with officeLocation SET, the owner read
 *       (GET /api/provider-application) exposes the exact office coords that ServiceForm seeds a NEW
 *       listing's pin from; with officeLocation NULL, the read exposes null ⇒ no seed (unchanged
 *       behavior). The coords are finite + in range (a valid LocationPointPicker seed).
 *   G1  the money-endpoints guard stays green — officeLocation is not a money/identity/rate field.
 *
 * Runs against the ALREADY-RUNNING dev server on http://127.0.0.1:5000 (the service-display-options /
 * booking-eligibility posture). DISPOSABLE DB ONLY — rows created here are cleaned in after().
 * Serialize: npx tsx --test --test-concurrency=1 server/__tests__/provider-office-location.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const CI_PROVIDER_EMAIL = "ci-provider@traveloure.test";
const CI_PROVIDER_PASSWORD = "CITestProvider!99";
const RUN = crypto.randomUUID().slice(0, 8);
const createdEmails: string[] = [];
const createdFormUserIds: string[] = []; // forms I created (provider B) — cleaned in after()

// A confirmed office pin (Kyoto) and a second distinct point (Osaka) for owner-scoping.
const KYOTO = { address: "Kiyomizu-dera, Kyoto", lat: 35.0116, lng: 135.7681 };
const OSAKA = { address: "Osaka Castle, Osaka", lat: 34.6873, lng: 135.5259 };

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host: string | null = null;
  try { host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase(); } catch { host = null; }
  let serverAddr: string | null = null;
  try {
    const r = await db.execute(sql`SELECT host(inet_server_addr()) AS addr`);
    serverAddr = ((r.rows[0] as any)?.addr as string) ?? null;
  } catch { /* local socket ⇒ disposable */ }
  const ok =
    (host !== null && DISPOSABLE_HOSTS.has(host)) ||
    (host === null && (serverAddr === null || DISPOSABLE_HOSTS.has(serverAddr)));
  if (!ok) throw new Error(`[office-location] REFUSING to write: '${host ?? "<none>"}' not disposable. Opt in with JOURNEY_DB_WRITES_OK=1.`);
}

interface Actor { id: string; email: string; cookie: string; }
async function registerProvider(label: string): Promise<Actor> {
  const email = `office-${RUN}-${label}@t.test`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "OF", lastName: label }),
  });
  if (res.status !== 201) assert.fail(`register(${label}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "register must set a session cookie");
  const body = (await res.json()) as any;
  createdEmails.push(email);
  await db.execute(sql`UPDATE users SET role = 'service_provider' WHERE id = ${body.user.id}`);
  return { id: body.user.id, email, cookie: setCookie!.split(";")[0] };
}
async function loginCookie(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login(${email}) failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "login must set a session cookie");
  return setCookie!.split(";")[0];
}
function api(pathname: string, cookie: string | undefined, method = "GET", body?: unknown) {
  return fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function readOnce(res: Response): Promise<{ status: number; body: any; text: string }> {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: res.status, body, text };
}

/** Ensure the given user owns a minimal service_provider_forms row (NOT-NULL columns satisfied). */
async function ensureProviderForm(userId: string, email: string): Promise<void> {
  const r = await db.execute(sql`SELECT id FROM service_provider_forms WHERE user_id = ${userId} LIMIT 1`);
  if ((r.rows as any[]).length > 0) return;
  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO service_provider_forms
      (id, user_id, business_name, name, email, mobile, country, address, business_type)
    VALUES
      (${id}, ${userId}, ${'Office Test Biz'}, ${'Office Test'}, ${email}, ${'+10000000000'},
       ${'Japan'}, ${'1 Test Street, Kyoto'}, ${'tour_operator'})
  `);
  createdFormUserIds.push(userId);
}

/** Read the stored office_location jsonb straight from the row (bypasses the API). */
async function dbOfficeLocation(userId: string): Promise<any> {
  const r = await db.execute(sql`SELECT office_location FROM service_provider_forms WHERE user_id = ${userId} LIMIT 1`);
  return (r.rows[0] as any)?.office_location ?? null;
}

let providerA: Actor;      // ci-provider (the login fixture)
let providerB: Actor;      // a fresh second provider — for owner scoping
let ciProviderId = "";

before(async () => {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  assert.ok(health && health.ok, `dev server must be running on ${BASE_URL}`);
  await assertDisposableDb();

  // Provider A = the ci-provider password fixture (proves login too).
  const cookieA = await loginCookie(CI_PROVIDER_EMAIL, CI_PROVIDER_PASSWORD);
  const r = await db.execute(sql`SELECT id FROM users WHERE email = ${CI_PROVIDER_EMAIL}`);
  ciProviderId = (r.rows[0] as any)?.id;
  assert.ok(ciProviderId, "ci-provider must be seeded");
  await ensureProviderForm(ciProviderId, CI_PROVIDER_EMAIL);
  providerA = { id: ciProviderId, email: CI_PROVIDER_EMAIL, cookie: cookieA };

  // Provider B = a fresh second provider with its own form.
  providerB = await registerProvider("b");
  await ensureProviderForm(providerB.id, providerB.email);

  // Start both from a clean, honest NULL office (no fabricated coordinate).
  await storage.updateServiceProviderFormOfficeLocation(providerA.id, null);
  await storage.updateServiceProviderFormOfficeLocation(providerB.id, null);
});

after(async () => {
  try {
    await assertDisposableDb();
    // Leave the shared ci-provider fixture's form in place; just reset its office to NULL.
    await storage.updateServiceProviderFormOfficeLocation(ciProviderId, null).catch(() => {});
    for (const userId of createdFormUserIds) {
      await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id = ${userId}`).catch(() => {});
    }
    for (const email of createdEmails) {
      await db.execute(sql`DELETE FROM service_provider_forms WHERE user_id = (SELECT id FROM users WHERE email = ${email})`).catch(() => {});
      await db.execute(sql`DELETE FROM users WHERE email = ${email}`).catch(() => {});
    }
  } finally { /* shared pool — leave open */ }
});

// ═══ NEGATIVES FIRST ════════════════════════════════════════════════════════════════════════════

test("N1: unauthenticated PATCH /api/provider-application ⇒ 401, never writes", async () => {
  const before = await dbOfficeLocation(providerA.id);
  const res = await readOnce(await api("/api/provider-application", undefined, "PATCH", { officeLocation: KYOTO }));
  assert.equal(res.status, 401, `expected 401, got ${res.status}: ${res.text}`);
  assert.deepEqual(await dbOfficeLocation(providerA.id), before, "unauth PATCH must not change the row");
});

test("N2: §13/validation — an out-of-range lat/lng is REJECTED (400), never silently stored", async () => {
  await storage.updateServiceProviderFormOfficeLocation(providerA.id, null);
  // lat 999 out of [-90,90]
  const bad1 = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: { address: "x", lat: 999, lng: 0 } }));
  assert.equal(bad1.status, 400, `out-of-range lat must be 400, got ${bad1.status}: ${bad1.text}`);
  // lng 200 out of [-180,180]
  const bad2 = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: { address: "x", lat: 35, lng: 200 } }));
  assert.equal(bad2.status, 400, `out-of-range lng must be 400, got ${bad2.status}: ${bad2.text}`);
  // NaN / non-numeric
  const bad3 = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: { address: "x", lat: "abc", lng: "def" } }));
  assert.equal(bad3.status, 400, `non-numeric coords must be 400, got ${bad3.status}: ${bad3.text}`);
  assert.equal(await dbOfficeLocation(providerA.id), null, "§13: a rejected coordinate must NOT be stored — NULL stays NULL");
});

test("N3: a malformed body (non-object, or the officeLocation key omitted) ⇒ 400", async () => {
  const notObj = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: "not-an-object" }));
  assert.equal(notObj.status, 400, `non-object must be 400, got ${notObj.status}: ${notObj.text}`);
  const arr = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: [35, 135] }));
  assert.equal(arr.status, 400, `array must be 400, got ${arr.status}: ${arr.text}`);
  const missing = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { somethingElse: true }));
  assert.equal(missing.status, 400, `omitted key must be 400, got ${missing.status}: ${missing.text}`);
});

// ═══ POSITIVES ══════════════════════════════════════════════════════════════════════════════════

test("P1: a provider SETS officeLocation on their OWN row ⇒ 200, persists (GET + DB)", async () => {
  const res = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: KYOTO }));
  assert.equal(res.status, 200, `set must be 200, got ${res.status}: ${res.text}`);
  // Persisted in the row exactly (address + coords).
  const stored = await dbOfficeLocation(providerA.id);
  assert.ok(stored, "office_location present in the row after set");
  assert.equal(Number(stored.lat), KYOTO.lat);
  assert.equal(Number(stored.lng), KYOTO.lng);
  assert.equal(stored.address, KYOTO.address);
  // Reads back through the owner GET.
  const got = await readOnce(await api("/api/provider-application", providerA.cookie));
  assert.equal(got.status, 200);
  assert.equal(Number(got.body.officeLocation.lat), KYOTO.lat, "GET returns the saved lat");
  assert.equal(Number(got.body.officeLocation.lng), KYOTO.lng, "GET returns the saved lng");
});

test("P2: clear-to-null works ⇒ 200, row NULL; GET reads back null (§13 — NULL stays NULL)", async () => {
  // Precondition: a value is set (from P1 or set it here).
  await storage.updateServiceProviderFormOfficeLocation(providerA.id, { address: KYOTO.address, lat: KYOTO.lat, lng: KYOTO.lng });
  const res = await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: null }));
  assert.equal(res.status, 200, `clear must be 200, got ${res.status}: ${res.text}`);
  assert.equal(await dbOfficeLocation(providerA.id), null, "office_location is NULL after clear — no fabricated coordinate");
  const got = await readOnce(await api("/api/provider-application", providerA.cookie));
  assert.equal(got.body.officeLocation ?? null, null, "GET reads back null — a provider with no office location sees null");
});

test("P3: OWNER SCOPING — a second provider's write touches ONLY their own row", async () => {
  // A has Kyoto set; B sets Osaka. Neither may overwrite the other (route resolves the row by
  // session userId, storage scopes by userId — never a body id).
  await readOnce(await api("/api/provider-application", providerA.cookie, "PATCH", { officeLocation: KYOTO }));
  const bRes = await readOnce(await api("/api/provider-application", providerB.cookie, "PATCH", { officeLocation: OSAKA }));
  assert.equal(bRes.status, 200, `B set must be 200, got ${bRes.status}: ${bRes.text}`);

  const aStored = await dbOfficeLocation(providerA.id);
  const bStored = await dbOfficeLocation(providerB.id);
  assert.equal(Number(aStored.lat), KYOTO.lat, "A's row unchanged by B's write");
  assert.equal(Number(aStored.lng), KYOTO.lng, "A's row unchanged by B's write");
  assert.equal(Number(bStored.lat), OSAKA.lat, "B's row carries B's value");
  assert.equal(Number(bStored.lng), OSAKA.lng, "B's row carries B's value");

  // Storage layer scopes by userId directly: writing A's office does not touch B's row.
  await storage.updateServiceProviderFormOfficeLocation(providerA.id, { address: "A2", lat: 35.0, lng: 135.0 });
  const bAfter = await dbOfficeLocation(providerB.id);
  assert.equal(Number(bAfter.lat), OSAKA.lat, "storage write scoped to A leaves B untouched");
});

test("P4: PRE-FILL HONESTY — the owner read exposes the office coords the NEW-listing seed uses; NULL ⇒ no seed", async () => {
  // WITH office set: the exact coords ServiceForm seeds a new listing's pin from are on the owner read,
  // finite and in range (a valid LocationPointPicker seed).
  await storage.updateServiceProviderFormOfficeLocation(providerA.id, { address: KYOTO.address, lat: KYOTO.lat, lng: KYOTO.lng });
  const withSet = await readOnce(await api("/api/provider-application", providerA.cookie));
  const loc = withSet.body.officeLocation;
  assert.ok(loc, "office location present as the seed source");
  const lat = Number(loc.lat), lng = Number(loc.lng);
  assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90, "seed lat finite + in range");
  assert.ok(Number.isFinite(lng) && lng >= -180 && lng <= 180, "seed lng finite + in range");
  assert.equal(lat, KYOTO.lat);
  assert.equal(lng, KYOTO.lng);

  // WITHOUT office (NULL): the owner read exposes null ⇒ the ServiceForm seed effect no-ops
  // (behaves exactly as before — no pre-fill). §13.
  await storage.updateServiceProviderFormOfficeLocation(providerA.id, null);
  const withNull = await readOnce(await api("/api/provider-application", providerA.cookie));
  assert.equal(withNull.body.officeLocation ?? null, null, "NULL office ⇒ no seed source ⇒ no pre-fill");
});

// ═══ GUARD ══════════════════════════════════════════════════════════════════════════════════════

test("G1: the money-endpoints guard stays green — officeLocation is not a money/identity/rate field", () => {
  const script = path.resolve(process.cwd(), "scripts/check-money-endpoints.cjs");
  const r = spawnSync("node", [script], { encoding: "utf8" });
  assert.equal(r.status, 0, `check-money-endpoints.cjs must exit 0:\n${r.stdout}\n${r.stderr}`);
});
