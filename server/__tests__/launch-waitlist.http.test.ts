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
 *   W10 (LW-1d) A sign-up carrying the author's own Ready-Made short-link code is credited: source expert_link,
 *       referrer and code stored, shown in the admin counts and the CSV. A made-up code and a code for a link to a
 *       trip its owner did not author credit nobody, and a body naming a referrer is refused.
 *   W11 (LW-1d) GET /api/admin/users/export: non-admin 403; admin gets the CSV with signup_source; one
 *       `users_export` audit row per export.
 *   W12 (LW-1d) Email register: a supply sign-up's `signupSource` tag is stored once on the new account,
 *       normalized; a traveler sign-up offering a tag stores nothing.
 *   W13 (LW-1e) The CSV's first column is the row id, and every timestamp is ISO-8601 with an offset, the same
 *       instant the database holds.
 *   W14 (LW-1e) GET /api/admin/waitlist/search: anonymous 401, non-admin 403, under 3 characters 400; a
 *       case-insensitive substring match; `%` and `_` match literally.
 *   W15 (LW-1e) DELETE /api/admin/waitlist/:id: non-admin 403 and the row stays; admin hard-deletes it and ONE
 *       `waitlist_row_delete` audit row keeps the row id and the sha256 of the email, never the address; a repeat
 *       or an unknown id is 404 and writes no audit row.
 *   W16 (LW-1e) A QA-domain address is flagged is_qa from its insert: left out of the counts (reported as
 *       qaExcluded) and the default CSV, present with is_qa=true under `?includeQa=1`.
 *   W17 (LW-2) The market: none ⇒ the launch market; `goa` ⇒ goa with source `goa_waitlist_page`; a key outside
 *       OPERATING_MARKETS (`lisbon`) ⇒ 400 UNKNOWN_MARKET and nothing written.
 *   W18 (LW-2) The same email in two cities is two rows; a repeat in the same city answers byte-for-byte the same and
 *       keeps one row.
 *   W19 (LW-2) Consent is per city: each row names the version it was shown, `f1-2026-10-15:<market>`, whose stored
 *       wording is the line that city's tick shows; a tick for one city never consents another.
 *   W20 (LW-2) Admin: `byMarket` counts every market with QA rows left out; `?market=` filters the counts and the CSV
 *       (whose market_slug column names the city); an unknown market is 400; search and delete still work.
 *   W21 (LW-2) A provider sign-up for another city is filed under that city.
 *
 * Run against a disposable dev database only, with the app started:
 *   JOURNEY_DB_WRITES_OK=1 npx tsx --test server/__tests__/launch-waitlist.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, before, test } from "node:test";
import { registerAndSignIn, SUPPLY_PROVIDER_SIGNUP_EXTRA } from "./fixtures/register-and-sign-in";
import { isWaitlistQaEmail, waitlistConsentLine, waitlistConsentVersion } from "../../shared/launch-waitlist";

const { Pool } = await import("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.JOURNEY_BASE_URL || "http://127.0.0.1:5000";
const PASSWORD = "TestPass123!";
const RUN = crypto.randomUUID().slice(0, 8);
const ADMIN_EMAIL = `lw1c-admin-${RUN}@traveloure.test`;
const MEMBER_EMAIL = `lw1c-member-${RUN}@traveloure.test`;
const W_EMAIL = (n: string) => `lw1c-${n}-${RUN}@traveloure.test`;
const QA_EMAIL = (n: string) => `lw1e-${n}-${RUN}@traveloure-qa.test`;

let adminCookie = "";
let adminId = "";
let memberCookie = "";
let market = "";

async function register(email: string): Promise<{ cookie: string; id: string }> {
  const actor = await registerAndSignIn({ baseUrl: BASE_URL, email, password: PASSWORD, firstName: "Lw", lastName: "One" });
  return { cookie: actor.cookie, id: actor.id };
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
  await pool.query(`DELETE FROM launch_waitlist WHERE email LIKE $1`, [`lw1e-%-${RUN}@traveloure-qa.test`]);
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
  assert.match(t.rows[0].body, /^Join the Kyoto list /);
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
    // LW-1e: the row id leads and is_qa closes.
    "id,email,role,market_slug,source,trip_type,rough_month,worry,contact_name,business_name,service_type,website,area,languages,referrer_user_id,referrer_handle,short_link_code,consent_at,consent_text_version,created_at,updated_at,unsubscribed_at,is_qa",
  );
  assert.ok(lines.some((l) => l.includes(`,${W_EMAIL("w1")},`)), "the row is in the export");
  const providers = await call("GET", "/api/admin/waitlist/export?role=provider", adminCookie);
  const providerLines = providers.text.split("\n").slice(1);
  assert.ok(providerLines.some((l) => l.includes(`,${W_EMAIL("w7p")},`)));
  assert.ok(!providerLines.some((l) => l.includes(`,${W_EMAIL("w1")},`)), "no traveler in the provider export");
  const afterCount = await pool.query(`SELECT COUNT(*)::int AS n FROM access_audit_logs WHERE actor_id = $1 AND action = 'waitlist_export'`, [adminId]);
  assert.equal(afterCount.rows[0].n, before.rows[0].n + 2);
});

test("W10 — a sign-up through the author's own Ready-Made link is credited; anything else is not", async () => {
  const code = `w${RUN}`.slice(0, 12).toLowerCase();
  const otherCode = `x${RUN}`.slice(0, 12).toLowerCase();
  const t = await pool.query(
    `INSERT INTO trips (id, user_id, destination, start_date, end_date)
     VALUES (gen_random_uuid()::text, $1, 'Kyoto, Japan', '2027-11-01', '2027-11-03') RETURNING id`,
    [adminId],
  );
  const rm = await pool.query(
    `INSERT INTO ready_made_trips (id, author_id, source_trip_id, market, title, duration_days)
     VALUES (gen_random_uuid()::text, $1, $2, 'Kyoto', $3, 3) RETURNING id`,
    [adminId, t.rows[0].id, `LW-1d ${RUN}`],
  );
  const memberId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [MEMBER_EMAIL])).rows[0].id;
  await pool.query(
    `INSERT INTO short_links (id, code, owner_user_id, target_type, target_id) VALUES
       (gen_random_uuid()::text, $1, $2, 'ready_made', $4), (gen_random_uuid()::text, $3, $5, 'ready_made', $4)`,
    [code, adminId, otherCode, rm.rows[0].id, memberId],
  );
  try {
    const credited = W_EMAIL("w10a");
    assert.equal((await call("POST", "/api/waitlist", null, { email: credited, ref: code.toUpperCase() })).status, 200);
    const row = (await rowsFor(credited))[0];
    assert.equal(row.source, "expert_link");
    assert.equal(row.referrer_user_id, adminId);
    assert.equal(row.short_link_code, code);

    const madeUp = W_EMAIL("w10b");
    await call("POST", "/api/waitlist", null, { email: madeUp, ref: "zz9zz9zz" });
    const r2 = (await rowsFor(madeUp))[0];
    assert.equal(r2.referrer_user_id, null);
    assert.equal(r2.source, src().page);

    const notAuthor = W_EMAIL("w10c");
    await call("POST", "/api/waitlist", null, { email: notAuthor, ref: otherCode });
    assert.equal((await rowsFor(notAuthor))[0].referrer_user_id, null, "a link to someone else's trip credits nobody");

    assert.equal((await call("POST", "/api/waitlist", null, { email: W_EMAIL("w10d"), referrerUserId: adminId })).status, 400);

    const counts = await call("GET", "/api/admin/waitlist", adminCookie);
    assert.ok(counts.json.referrers.some((r: any) => r.referrerUserId === adminId && r.count >= 1));
    const csv = await call("GET", "/api/admin/waitlist/export", adminCookie);
    assert.ok(csv.text.split("\n").some((l: string) => l.includes(`,${credited},`) && l.includes(`,${adminId},`) && l.includes(`,${code},`)));
  } finally {
    await pool.query(`DELETE FROM short_links WHERE code IN ($1, $2)`, [code, otherCode]);
    await pool.query(`DELETE FROM ready_made_trips WHERE id = $1`, [rm.rows[0].id]);
    await pool.query(`DELETE FROM trips WHERE id = $1`, [t.rows[0].id]);
  }
});

test("W11 — the admin user CSV carries signup_source and is audit-logged", async () => {
  assert.equal((await call("GET", "/api/admin/users/export", memberCookie)).status, 403);
  await pool.query(`UPDATE users SET signup_source = 'ig_dm' WHERE email = $1`, [MEMBER_EMAIL]);
  const before = await pool.query(`SELECT COUNT(*)::int AS n FROM access_audit_logs WHERE actor_id = $1 AND action = 'users_export'`, [adminId]);
  const r = await call("GET", "/api/admin/users/export", adminCookie);
  assert.equal(r.status, 200, r.text);
  assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
  const [header, ...lines] = r.text.split("\n");
  assert.equal(header, "email,name,role,status,joined_at,signup_source");
  assert.ok(lines.some((l) => l.startsWith(MEMBER_EMAIL) && l.endsWith(",ig_dm")));
  const afterCount = await pool.query(`SELECT COUNT(*)::int AS n FROM access_audit_logs WHERE actor_id = $1 AND action = 'users_export'`, [adminId]);
  assert.equal(afterCount.rows[0].n, before.rows[0].n + 1);
});

test("W12 — email register stores a supply sign-up's source tag, normalized; a traveler's is not stored", async () => {
  const supplyEmail = W_EMAIL("w12-supply");
  const r1 = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: supplyEmail, password: PASSWORD, firstName: "Lw", lastName: "One", ...SUPPLY_PROVIDER_SIGNUP_EXTRA, signupSource: " Contact_Form " }),
  });
  assert.equal(r1.status, 202, await r1.text()); // AUTH-1 fix 3b: the neutral answer
  const oddEmail = W_EMAIL("w12-odd");
  const r2 = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: oddEmail, password: PASSWORD, firstName: "Lw", lastName: "One", ...SUPPLY_PROVIDER_SIGNUP_EXTRA, signupSource: "made-up-tag" }),
  });
  assert.equal(r2.status, 202, await r2.text()); // AUTH-1 fix 3b: the neutral answer
  const travelerEmail = W_EMAIL("w12-traveler");
  const r3 = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: travelerEmail, password: PASSWORD, firstName: "Lw", lastName: "One", signupSource: "ig_dm" }),
  });
  assert.equal(r3.status, 202, await r3.text()); // AUTH-1 fix 3b: the neutral answer
  const rows = await pool.query(`SELECT email, signup_source FROM users WHERE email = ANY($1::text[])`, [[supplyEmail, oddEmail, travelerEmail]]);
  const by = Object.fromEntries(rows.rows.map((r: any) => [r.email, r.signup_source]));
  assert.equal(by[supplyEmail], "contact_form");
  assert.equal(by[oddEmail], "other");
  assert.equal(by[travelerEmail], null);
});

// ─── LW-1e: the admin's id column, search, delete and QA rows ────────────────────────────────────────────────

/** Minimal CSV reader for the export (quoted cells, doubled quotes, commas and newlines inside quotes). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); rows.push(row);
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

test("W13 — the CSV starts with the row id, and timestamps are ISO-8601 with an offset", async () => {
  const email = W_EMAIL("w13");
  assert.equal((await call("POST", "/api/waitlist", null, { email, consent: true })).status, 200);
  const r = await call("GET", "/api/admin/waitlist/export?role=traveler", adminCookie);
  assert.equal(r.status, 200, r.text);
  assert.ok(r.text.startsWith("id,email,"), "id is the first column");
  const row = parseCsv(r.text).find((x) => x.email === email);
  assert.ok(row, "the row is in the export");
  const [db] = await rowsFor(email);
  assert.equal(row.id, db.id);
  for (const c of ["created_at", "updated_at", "consent_at"]) assert.match(row[c], ISO_WITH_OFFSET, c);
  assert.equal(row.unsubscribed_at, "", "a NULL timestamp stays an empty cell");
  const epoch = await pool.query(
    `SELECT extract(epoch FROM (created_at AT TIME ZONE current_setting('TimeZone')))::float8 AS e FROM launch_waitlist WHERE id = $1`,
    [db.id],
  );
  assert.equal(Math.floor(Date.parse(row.created_at) / 1000), Math.floor(Number(epoch.rows[0].e)), "the same instant");
});

test("W14 — search by email: admin only, a substring match, wildcards literal", async () => {
  const email = W_EMAIL("w14-Find");
  assert.equal((await call("POST", "/api/waitlist", null, { email })).status, 200);
  const q = `w14-find-${RUN}`;
  assert.equal((await call("GET", `/api/admin/waitlist/search?email=${q}`, null)).status, 401);
  assert.equal((await call("GET", `/api/admin/waitlist/search?email=${q}`, memberCookie)).status, 403);
  assert.equal((await call("GET", `/api/admin/waitlist/search?email=ab`, adminCookie)).status, 400);
  const hit = await call("GET", `/api/admin/waitlist/search?email=${encodeURIComponent(q.toUpperCase())}`, adminCookie);
  assert.equal(hit.status, 200, hit.text);
  assert.deepEqual(hit.json.rows.map((x: any) => x.email), [email.toLowerCase()]);
  assert.equal(typeof hit.json.rows[0].id, "string");
  assert.match(hit.json.rows[0].createdAt, ISO_WITH_OFFSET);
  assert.equal(hit.json.rows[0].isQa, false);
  for (const literal of [`%${RUN}x`, `w14_find-${RUN}`]) {
    const none = await call("GET", `/api/admin/waitlist/search?email=${encodeURIComponent(literal)}`, adminCookie);
    assert.equal(none.status, 200);
    assert.equal(none.json.rows.length, 0, `${literal} is matched literally`);
  }
});

test("W15 — deleting one row: admin only, hard delete, audit keeps the id and a hash, never the address", async () => {
  const email = W_EMAIL("w15");
  assert.equal((await call("POST", "/api/waitlist", null, { email })).status, 200);
  const [row] = await rowsFor(email);
  const auditCount = async () =>
    Number((await pool.query(`SELECT COUNT(*)::int AS n FROM access_audit_logs WHERE action = 'waitlist_row_delete' AND resource_id = $1`, [row.id])).rows[0].n);

  assert.equal((await call("DELETE", `/api/admin/waitlist/${row.id}`, null)).status, 401);
  assert.equal((await call("DELETE", `/api/admin/waitlist/${row.id}`, memberCookie)).status, 403);
  assert.equal((await rowsFor(email)).length, 1, "a refused delete leaves the row");
  assert.equal(await auditCount(), 0);

  const del = await call("DELETE", `/api/admin/waitlist/${row.id}`, adminCookie);
  assert.equal(del.status, 200, del.text);
  assert.deepEqual(del.json, { deleted: true });
  assert.equal((await rowsFor(email)).length, 0, "the row is gone");
  const audit = await pool.query(
    `SELECT actor_id, resource_type, metadata, metadata::text AS raw FROM access_audit_logs WHERE action = 'waitlist_row_delete' AND resource_id = $1`,
    [row.id],
  );
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].actor_id, adminId);
  assert.equal(audit.rows[0].resource_type, "launch_waitlist");
  assert.equal(audit.rows[0].metadata.emailSha256, crypto.createHash("sha256").update(email.toLowerCase()).digest("hex"));
  assert.ok(!audit.rows[0].raw.toLowerCase().includes(email.toLowerCase()), "no plaintext address in the audit row");
  assert.ok(!audit.rows[0].raw.includes(`w15-${RUN}`), "no part of the address in the audit row");

  assert.equal((await call("DELETE", `/api/admin/waitlist/${row.id}`, adminCookie)).status, 404);
  assert.equal((await call("DELETE", `/api/admin/waitlist/${crypto.randomUUID()}`, adminCookie)).status, 404);
  assert.equal((await call("DELETE", `/api/admin/waitlist/not%20an%20id`, adminCookie)).status, 404);
  assert.equal(await auditCount(), 1, "a 404 writes no audit row");
});

test("W16 — a QA-domain row is flagged is_qa, left out of the counts and the default CSV", async () => {
  assert.equal(isWaitlistQaEmail("Someone@Traveloure-QA.test"), true);
  assert.equal(isWaitlistQaEmail("someone@traveloure-qa.test.example.com"), false);
  assert.equal(isWaitlistQaEmail("someone@traveloure.test"), false);

  const before = (await call("GET", "/api/admin/waitlist", adminCookie)).json;
  const qa = QA_EMAIL("w16");
  const real = W_EMAIL("w16-real");
  assert.equal((await call("POST", "/api/waitlist", null, { email: qa, tripType: "wedding", consent: true })).status, 200);
  assert.equal((await call("POST", "/api/waitlist", null, { email: real, tripType: "wedding" })).status, 200);
  const after = (await call("GET", "/api/admin/waitlist", adminCookie)).json;
  assert.equal(after.travelers.total, before.travelers.total + 1, "only the real row is counted");
  assert.equal(after.travelers.consented, before.travelers.consented, "the QA row's consent is not counted");
  const wedding = (x: any) => x.travelers.byTripType.find((t: any) => t.key === "wedding")?.count ?? 0;
  assert.equal(wedding(after), wedding(before) + 1);
  assert.equal(after.qaExcluded, before.qaExcluded + 1);

  const plain = parseCsv((await call("GET", "/api/admin/waitlist/export", adminCookie)).text);
  assert.ok(!plain.some((x) => x.email === qa), "the default CSV leaves the QA row out");
  assert.equal(plain.find((x) => x.email === real)?.is_qa, "false");
  const withQa = parseCsv((await call("GET", "/api/admin/waitlist/export?includeQa=1", adminCookie)).text);
  assert.equal(withQa.find((x) => x.email === qa)?.is_qa, "true");
  const audit = await pool.query(
    `SELECT metadata FROM access_audit_logs WHERE action = 'waitlist_export' AND actor_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [adminId],
  );
  assert.equal(audit.rows[0].metadata.includeQa, true, "the export audit row says QA rows were included");
});

test("W17 — the market: none is the launch market, goa is goa, lisbon is refused", async () => {
  const email = W_EMAIL("w17");
  assert.equal((await call("POST", "/api/waitlist", null, { email })).status, 200);
  assert.equal((await call("POST", "/api/waitlist", null, { email, market: "GOA" })).status, 200);
  const rows = await rowsFor(email);
  assert.deepEqual(rows.map((r: any) => r.market_slug).sort(), [market, "goa"].sort());
  assert.equal(rows.find((r: any) => r.market_slug === "goa").source, "goa_waitlist_page");

  const other = W_EMAIL("w17-lisbon");
  const refused = await call("POST", "/api/waitlist", null, { email: other, market: "lisbon" });
  assert.equal(refused.status, 400);
  assert.equal(refused.json?.code, "UNKNOWN_MARKET");
  assert.equal((await rowsFor(other)).length, 0);
});

test("W18 — two cities are two rows; a repeat in one city is the same answer and one row", async () => {
  const email = W_EMAIL("w18");
  const first = await call("POST", "/api/waitlist", null, { email, market: "porto" });
  const second = await call("POST", "/api/waitlist", null, { email, market: "porto" });
  assert.equal(first.status, second.status);
  assert.equal(first.text, second.text);
  await call("POST", "/api/waitlist", null, { email, market: "bogota" });
  const rows = await rowsFor(email);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r: any) => r.market_slug).sort(), ["bogota", "porto"]);
});

test("W19 — the stored consent version is the city shown, and a tick covers only that city", async () => {
  const email = W_EMAIL("w19");
  await call("POST", "/api/waitlist", null, { email, market: "goa", consent: true });
  await call("POST", "/api/waitlist", null, { email, market: "mumbai", consent: false });
  await call("POST", "/api/waitlist", null, { email, consent: true });
  const rows = await rowsFor(email);
  const goa = rows.find((r: any) => r.market_slug === "goa");
  const mumbai = rows.find((r: any) => r.market_slug === "mumbai");
  const launch = rows.find((r: any) => r.market_slug === market);
  assert.ok(goa.consent_at);
  assert.equal(mumbai.consent_at, null, "a tick for Goa does not consent Mumbai");
  assert.equal(mumbai.consent_text_version, null);
  for (const row of [goa, launch]) {
    assert.equal(row.consent_text_version, waitlistConsentVersion(row.market_slug));
    const t = await pool.query(
      `SELECT body FROM consent_texts WHERE consent_key = 'launch_waitlist_updates' AND version = $1`,
      [row.consent_text_version],
    );
    assert.equal(t.rows.length, 1);
    assert.ok(t.rows[0].body.startsWith(waitlistConsentLine(row.market_slug)), `the wording shown for ${row.market_slug}`);
  }
  assert.match(waitlistConsentLine("goa"), /^Email me when Traveloure opens in Goa\.$/);
});

test("W20 — admin: per-market counts without QA rows, a market filter, the market column", async () => {
  const before = (await call("GET", "/api/admin/waitlist", adminCookie)).json;
  const goaBefore = before.byMarket.find((m: any) => m.marketSlug === "goa");
  assert.ok(goaBefore, "every operating market is listed");
  const real = W_EMAIL("w20");
  const qa = QA_EMAIL("w20");
  await call("POST", "/api/waitlist", null, { email: real, market: "goa" });
  await call("POST", "/api/waitlist", null, { email: qa, market: "goa" });
  const after = (await call("GET", "/api/admin/waitlist", adminCookie)).json;
  assert.equal(after.byMarket.find((m: any) => m.marketSlug === "goa").travelers, goaBefore.travelers + 1, "the QA row is left out");
  assert.equal(after.marketSlug, market, "the default is still the launch market");

  const goaCounts = (await call("GET", "/api/admin/waitlist?market=goa", adminCookie)).json;
  assert.equal(goaCounts.marketSlug, "goa");
  assert.equal((await call("GET", "/api/admin/waitlist?market=lisbon", adminCookie)).status, 400);
  assert.equal((await call("GET", "/api/admin/waitlist?market=goa", memberCookie)).status, 403);

  const csv = parseCsv((await call("GET", "/api/admin/waitlist/export?market=goa", adminCookie)).text);
  assert.ok(csv.length > 0 && csv.every((x) => x.market_slug === "goa"), "the CSV is filtered and names the market");
  assert.ok(csv.some((x) => x.email === real));
  assert.ok(!csv.some((x) => x.email === qa), "QA rows stay out of the default CSV");
  const all = parseCsv((await call("GET", "/api/admin/waitlist/export?market=all", adminCookie)).text);
  assert.ok(new Set(all.map((x) => x.market_slug)).size >= 2);
  assert.equal((await call("GET", "/api/admin/waitlist/export?market=lisbon", adminCookie)).status, 400);

  const found = (await call("GET", `/api/admin/waitlist/search?email=${encodeURIComponent(real)}`, adminCookie)).json;
  const row = found.rows.find((r: any) => r.marketSlug === "goa");
  assert.ok(row, "search finds the Goa row");
  assert.equal((await call("DELETE", `/api/admin/waitlist/${row.id}`, adminCookie)).status, 200);
});

test("W21 — a provider sign-up for another city is filed under it", async () => {
  const email = W_EMAIL("w21");
  const r = await call("POST", "/api/waitlist", null, {
    role: "provider", email, market: "jaipur", contactName: "Asha", serviceType: "guide_planner",
  });
  assert.equal(r.status, 200, r.text);
  const rows = await rowsFor(email);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].market_slug, "jaipur");
  assert.equal(rows[0].role, "provider");
  assert.equal(rows[0].source, "jaipur_waitlist_page");
});
