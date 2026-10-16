/**
 * LW-1c (ledger `2026-10-16-lw1c-kyoto-waitlist`): the launch waitlist rails, against the running app.
 * Needs migration 381's tables (launch_waitlist, consent_texts).
 *
 *   W1  POST /api/waitlist answers { ok: true } and writes ONE traveler row for the launch market, with the
 *       answers given and a source on the allowlist pattern (`<market>_blog_cta:<slug>`).
 *   W2  A repeat sign-up updates that row — never a second one — keeps the FIRST source, takes the new answers,
 *       and a tick stamps consent and names the consent version, whose F1 wording is stored in consent_texts.
 *   W3  A later sign-up without the tick never clears consent already given; joining without it is allowed.
 *   W4  The answer for an address already on the list is byte-for-byte the answer for a new one.
 *   W5  The honeypot: a filled `homepage` is answered as a success and writes nothing.
 *   W6  The body is an allowlist: an unknown key (a market, a referrer) is refused 400; a bad email is refused 400
 *       with F1's error line; a traveler sending provider fields is refused; an unknown source is stored as the
 *       page's own value.
 *   W7  A provider row: name and service type required; the traveler half stays NULL; a later traveler sign-up
 *       with the same email replaces the role and NULLs the provider half.
 *   W8  GET /api/admin/waitlist: anonymous 401, non-admin 403, admin 200 with travelers (by trip type, by source)
 *       and providers (by service type) counted apart.
 *   W9  GET /api/admin/waitlist/export: non-admin 403; admin gets CSV with the field-name header; `?role=provider`
 *       carries no traveler row; every export writes one `waitlist_export` audit row.
 *
 * Run against a disposable dev database only, with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/launch-waitlist.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const ADMIN_EMAIL = `lw1c-admin-${RUN}@traveloure.test`;
const MEMBER_EMAIL = `lw1c-member-${RUN}@traveloure.test`;
const W_EMAIL = (n: string) => `lw1c-${n}-${RUN}@traveloure.test`;

let adminCookie = "";
let adminId = "";
let memberCookie = "";
let market = "";

async function register(email: string): Promise<{ cookie: string; id: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, firstName: "Lw", lastName: "One" }),
  });
  const text = await res.text();
  assert.equal(res.status, 201, text);
  return { cookie: res.headers.get("set-cookie")!.split(";")[0], id: (JSON.parse(text) as any).user.id };
}

async function call(method: string, path: string, cookie: string | null, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      // Every request is its own client as far as the per-IP limiter is concerned.
      "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* CSV or HTML */ }
  return { status: res.status, text, json, headers: res.headers };
}

async function rowsFor(email: string) {
  const r = await pool.query(`SELECT * FROM launch_waitlist WHERE email = $1`, [email.toLowerCase()]);
  return r.rows;
}

before(async () => {
  if (process.env.JOURNEY_DB_WRITES_OK !== "1") throw new Error("set JOURNEY_DB_WRITES_OK=1 against a disposable database");
  const m = await pool.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'launch_market_slug'`);
  market = m.rows[0]?.setting_value;
  assert.ok(market, "migration 381 seeds launch_market_slug");
  const a = await register(ADMIN_EMAIL);
  adminCookie = a.cookie;
  adminId = a.id;
  await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [adminId]);
  memberCookie = (await register(MEMBER_EMAIL)).cookie;
});

after(async () => {
  await pool.query(`DELETE FROM launch_waitlist WHERE email LIKE $1`, [`lw1c-%-${RUN}@traveloure.test`]);
  await pool.end();
});

const src = () => ({ page: `${market.replace(/-/g, "_")}_waitlist_page`, blog: (slug: string) => `${market.replace(/-/g, "_")}_blog_cta:${slug}` });

test("W1 — one traveler row for the launch market, with the answers and source given", async () => {
  const email = W_EMAIL("w1");
  const r = await call("POST", "/api/waitlist", null, {
    email,
    source: src().blog("kyoto-autumn"),
    tripType: "foliage",
    roughMonth: "2027-11",
    worry: "Last entry times",
  });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { ok: true });
  const rows = await rowsFor(email);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].market_slug, market);
  assert.equal(rows[0].role, "traveler");
  assert.equal(rows[0].source, src().blog("kyoto-autumn"));
  assert.equal(rows[0].trip_type, "foliage");
  assert.equal(rows[0].rough_month, "2027-11");
  assert.equal(rows[0].worry, "Last entry times");
  assert.equal(rows[0].consent_at, null, "joining never requires the tick");
  assert.equal(rows[0].contact_name, null);
});

test("W2 — a repeat updates the one row, keeps the first source, and a tick stamps consent", async () => {
  const email = W_EMAIL("w2");
  await call("POST", "/api/waitlist", null, { email, source: src().blog("first-post"), tripType: "proposal" });
  const r = await call("POST", "/api/waitlist", null, { email: email.toUpperCase(), source: src().page, consent: true, tripType: "wedding" });
  assert.equal(r.status, 200, r.text);
  const rows = await rowsFor(email);
  assert.equal(rows.length, 1, "never a second row");
  assert.equal(rows[0].source, src().blog("first-post"), "the first source is kept");
  assert.equal(rows[0].trip_type, "wedding", "the answers are updated");
  assert.ok(rows[0].consent_at, "the tick stamps consent");
  const t = await pool.query(`SELECT body FROM consent_texts WHERE consent_key = 'launch_waitlist_updates' AND version = $1`, [rows[0].consent_text_version]);
  assert.equal(t.rows.length, 1, "the consent version is named");
  assert.match(t.rows[0].body, /^Email me when Traveloure opens for Kyoto\./);
});

test("W3 — a later sign-up without the tick keeps consent already given", async () => {
  const email = W_EMAIL("w3");
  await call("POST", "/api/waitlist", null, { email, consent: true });
  const before = (await rowsFor(email))[0];
  await call("POST", "/api/waitlist", null, { email, consent: false });
  const afterRow = (await rowsFor(email))[0];
  assert.equal(String(afterRow.consent_at), String(before.consent_at));
  assert.equal(afterRow.consent_text_version, before.consent_text_version);
});

test("W4 — the answer never reveals whether the address was already on the list", async () => {
  const email = W_EMAIL("w4");
  const first = await call("POST", "/api/waitlist", null, { email });
  const second = await call("POST", "/api/waitlist", null, { email });
  assert.equal(first.status, second.status);
  assert.equal(first.text, second.text);
});

test("W5 — the honeypot is answered as a success and writes nothing", async () => {
  const email = W_EMAIL("w5");
  const r = await call("POST", "/api/waitlist", null, { email, homepage: "http://spam.example" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal((await rowsFor(email)).length, 0);
});

test("W6 — the body is an allowlist", async () => {
  const email = W_EMAIL("w6");
  assert.equal((await call("POST", "/api/waitlist", null, { email, marketSlug: "lisbon" })).status, 400);
  assert.equal((await call("POST", "/api/waitlist", null, { email, referrerUserId: "u1" })).status, 400);
  assert.equal((await call("POST", "/api/waitlist", null, { email, contactName: "Not a provider" })).status, 400);
  const bad = await call("POST", "/api/waitlist", null, { email: "not-an-email" });
  assert.equal(bad.status, 400);
  assert.equal(bad.json?.error, "Please enter a valid email address.");
  assert.equal((await rowsFor(email)).length, 0);
  await call("POST", "/api/waitlist", null, { email, source: "billboard" });
  assert.equal((await rowsFor(email))[0].source, src().page);
});

test("W7 — a provider row, and a later traveler sign-up replaces the role", async () => {
  const email = W_EMAIL("w7");
  assert.equal((await call("POST", "/api/waitlist", null, { email, role: "provider", serviceType: "transport" })).status, 400, "name required");
  assert.equal((await call("POST", "/api/waitlist", null, { email, role: "provider", contactName: "Aki" })).status, 400, "service type required");
  const r = await call("POST", "/api/waitlist", null, { email, role: "provider", contactName: "Aki", businessName: "Aki Rides", serviceType: "transport" });
  assert.equal(r.status, 200, r.text);
  let row = (await rowsFor(email))[0];
  assert.equal(row.role, "provider");
  assert.equal(row.contact_name, "Aki");
  assert.equal(row.business_name, "Aki Rides");
  assert.equal(row.service_type, "transport");
  assert.equal(row.trip_type, null);
  await call("POST", "/api/waitlist", null, { email, tripType: "other" });
  row = (await rowsFor(email))[0];
  assert.equal(row.role, "traveler");
  assert.equal(row.contact_name, null, "the provider half is cleared");
  assert.equal(row.service_type, null);
  assert.equal(row.trip_type, "other");
  await call("POST", "/api/waitlist", null, { email: W_EMAIL("w7p"), role: "provider", contactName: "Mei", serviceType: "guide_planner" });
});

test("W8 — the admin counts keep travelers and providers apart", async () => {
  assert.equal((await call("GET", "/api/admin/waitlist", null)).status, 401);
  assert.equal((await call("GET", "/api/admin/waitlist", memberCookie)).status, 403);
  const r = await call("GET", "/api/admin/waitlist", adminCookie);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.marketSlug, market);
  assert.ok(r.json.travelers.total >= 6);
  assert.ok(r.json.travelers.consented >= 2);
  assert.ok(r.json.travelers.byTripType.some((s: any) => s.key === "foliage"));
  assert.ok(r.json.travelers.bySource.some((s: any) => s.key === src().blog("kyoto-autumn")));
  assert.ok(r.json.providers.total >= 1);
  assert.ok(r.json.providers.byServiceType.some((s: any) => s.key === "guide_planner"));
  assert.ok(!r.json.travelers.byTripType.some((s: any) => s.key === "guide_planner"));
});

test("W9 — the CSV export is admin-only, role-scoped and audit-logged", async () => {
  assert.equal((await call("GET", "/api/admin/waitlist/export", memberCookie)).status, 403);
  const before = await pool.query(`SELECT COUNT(*)::int AS n FROM access_audit_logs WHERE actor_id = $1 AND action = 'waitlist_export'`, [adminId]);
  const r = await call("GET", "/api/admin/waitlist/export", adminCookie);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
  const [header, ...lines] = r.text.split("\n");
  assert.equal(
    header,
    "email,role,market_slug,source,trip_type,rough_month,worry,contact_name,business_name,service_type,website,area,languages,consent_at,consent_text_version,created_at,updated_at,unsubscribed_at",
  );
  assert.ok(lines.some((l) => l.startsWith(W_EMAIL("w1"))), "the row is in the export");
  const providers = await call("GET", "/api/admin/waitlist/export?role=provider", adminCookie);
  const providerLines = providers.text.split("\n").slice(1);
  assert.ok(providerLines.some((l) => l.startsWith(W_EMAIL("w7p"))));
  assert.ok(!providerLines.some((l) => l.startsWith(W_EMAIL("w1"))), "no traveler in the provider export");
  const afterCount = await pool.query(`SELECT COUNT(*)::int AS n FROM access_audit_logs WHERE actor_id = $1 AND action = 'waitlist_export'`, [adminId]);
  assert.equal(afterCount.rows[0].n, before.rows[0].n + 2);
});
