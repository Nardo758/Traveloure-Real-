/**
 * LW-1f (ledger `2026-10-16-lw1f-kyoto-ticker`; hand-off Part A item 12): the ticker's server rails, in process
 * (no running app needed). Needs migration 384 (`ticker_items`) and `platform_settings.launch_market_slug`.
 *
 *   T1  GET /api/public/ticker returns only active lines inside their window whose blog link (if any) is to a
 *       published post, in order, with text and href only; another market gets nothing.
 *   T2  Activation is refused for an unpublished post (409), an unknown path and an outside link (400); a published
 *       post can be turned on, and when it is unpublished later the line drops out of the public read.
 *   T3  The admin rails: anonymous 401, non-admin 403; the body is an allowlist (an unknown key is 400).
 *   T4  Every write — create, edit, reorder — writes ONE audit row in the same transaction; a refused write writes
 *       none. Reorder must name every line of the market once.
 *   T5  The public read's brief cache is cleared by a write.
 *   T6  (LW-1f-b, issue #1486) The beta list: the public read carries `betaCities`, the launch city when nothing is
 *       set; a saved list is read back in order; an unknown or repeated key is refused 400 at save and leaves the
 *       stored value as it was. The setting is restored afterwards.
 *
 * DISPOSABLE DB ONLY: refuses anything but a local database. Every row it writes it creates and deletes; the four
 * seeded lines are left as they were (the reorder test puts the order back).
 *
 *   NODE_ENV=test npx tsx --test --test-force-exit server/__tests__/ticker.db.test.ts
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import passport from "passport";

process.env.SESSION_COOKIE_INSECURE ??= "1";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-prod";

const { pool } = await import("../db");
const { getSession } = await import("../replit_integrations/auth/replitAuth");
const { setupEmailAuth } = await import("../replit_integrations/auth/emailAuth");
const { default: tickerRoutes } = await import("../routes/ticker.routes");
const { default: adminRoutes } = await import("../routes/admin.routes");
const { invalidatePlatformFlagCache } = await import("../services/platform-flags");
const { clearTickerCache } = await import("../services/ticker.service");
const { launchCityName } = await import("../../shared/ticker");

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
async function assertDisposableDb(): Promise<void> {
  const r = await pool.query("SELECT inet_server_addr()::text AS addr");
  const addr: string | null = r.rows[0]?.addr ?? null;
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return null; } })();
  const ok = (host !== null && DISPOSABLE_HOSTS.has(host)) || addr === null || DISPOSABLE_HOSTS.has(addr.split("/")[0]);
  if (!ok) throw new Error(`ticker.db.test refuses a non-local database (${host ?? "unknown host"})`);
}

const RUN = crypto.randomUUID().slice(0, 8);
const PASSWORD = "ticker-pass-123";
const userIds: string[] = [];
const postIds: string[] = [];
let base = "";
let server: http.Server;
let market = "";
let adminCookie = "";
let adminId = "";
let memberCookie = "";
let savedBeta: string | null | undefined;

function scryptHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
async function account(role: string): Promise<{ id: string; cookie: string }> {
  const id = crypto.randomUUID();
  const email = `ticker-${role}-${RUN}-${id.slice(0, 6)}@traveloure-qa.test`;
  userIds.push(id);
  await pool.query(
    `INSERT INTO users (id, email, password, first_name, last_name, role, auth_provider) VALUES ($1, $2, $3, 'Ticker', 'Test', $4, 'email')`,
    [id, email, scryptHash(PASSWORD), role],
  );
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, await res.clone().text());
  return { id, cookie: res.headers.get("set-cookie")!.split(";")[0] };
}
async function call(method: string, path: string, cookie: string | null, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}
async function post(status: "published" | "draft"): Promise<string> {
  const id = crypto.randomUUID();
  const slug = `ticker-test-${RUN}-${id.slice(0, 6)}`;
  postIds.push(id);
  await pool.query(
    `INSERT INTO blog_posts (id, slug, content_type, authorship, status, title, body, content_sha256)
     VALUES ($1, $2, 'expert_guide', 'expert', $3, 'Ticker test post', 'body', 'x')`,
    [id, slug, status],
  );
  return slug;
}
async function setPost(slug: string, status: string) {
  await pool.query(`UPDATE blog_posts SET status = $2 WHERE slug = $1`, [slug, status]);
}
async function ourLine(text: string) {
  return (await pool.query(`SELECT * FROM ticker_items WHERE text = $1`, [text])).rows[0];
}
async function publicTexts(): Promise<string[]> {
  clearTickerCache();
  const r = await call("GET", `/api/public/ticker?market=${market}`, null);
  assert.equal(r.status, 200);
  return r.json.items.map((i: any) => i.text);
}
async function auditCount(action: string, resourceId?: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM access_audit_logs WHERE actor_id = $1 AND action = $2 ${resourceId ? "AND resource_id = $3" : ""}`,
    resourceId ? [adminId, action, resourceId] : [adminId, action],
  );
  return Number(r.rows[0].n);
}
const T = (label: string) => `LW-1f ${label} ${RUN}`;

describe("LW-1f: the ticker rails", () => {
  before(async () => {
    assert.equal(process.env.NODE_ENV, "test");
    await assertDisposableDb();
    const m = await pool.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'launch_market_slug'`);
    market = m.rows[0]?.setting_value;
    assert.ok(market, "migration 381 seeds launch_market_slug");
    const app = express();
    app.use(express.json());
    app.use(getSession());
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser((user: any, cb) => cb(null, user));
    passport.deserializeUser((user: any, cb) => cb(null, user));
    setupEmailAuth(app);
    app.use(tickerRoutes);
    app.use(adminRoutes);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    const admin = await account("admin");
    adminId = admin.id;
    adminCookie = admin.cookie;
    memberCookie = (await account("user")).cookie;
  });

  after(async () => {
    if (savedBeta !== undefined) {
      if (savedBeta === null) await pool.query(`DELETE FROM platform_settings WHERE setting_key = 'beta_market_slugs'`);
      else await pool.query(`UPDATE platform_settings SET setting_value = $1 WHERE setting_key = 'beta_market_slugs'`, [savedBeta]);
      invalidatePlatformFlagCache("beta_market_slugs");
    }
    await new Promise<void>((r) => server?.close(() => r()));
    await pool.query(`DELETE FROM ticker_items WHERE text LIKE $1`, [`LW-1f % ${RUN}`]);
    if (postIds.length) await pool.query(`DELETE FROM blog_posts WHERE id = ANY($1)`, [postIds]);
    if (userIds.length) {
      await pool.query(`DELETE FROM access_audit_logs WHERE actor_id = ANY($1)`, [userIds]);
      await pool.query(`DELETE FROM sessions WHERE sess::text LIKE ANY($1)`, [userIds.map((id) => `%${id}%`)]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
    clearTickerCache();
  });

  it("T3 — admin only, and the body is an allowlist", async () => {
    assert.equal((await call("GET", "/api/admin/ticker", null)).status, 401);
    assert.equal((await call("GET", "/api/admin/ticker", memberCookie)).status, 403);
    assert.equal((await call("POST", "/api/admin/ticker", memberCookie, { text: T("member") })).status, 403);
    assert.equal((await call("POST", "/api/admin/ticker", adminCookie, { text: T("extra"), marketSlug: "osaka" })).status, 400);
    assert.equal((await call("POST", "/api/admin/ticker", adminCookie, { text: "x".repeat(91) })).status, 400);
    assert.equal((await call("POST", "/api/admin/ticker", adminCookie, { text: T("member") })).status, 201);
    const list = await call("GET", "/api/admin/ticker", adminCookie);
    assert.equal(list.status, 200);
    assert.equal(list.json.marketSlug, market);
    assert.ok(list.json.items.some((i: any) => i.text === T("member") && i.showing === false));
  });

  it("T1 — the public read: active, in window, live links only, in order, text and href only", async () => {
    const pub = await post("published");
    const draft = await post("draft");
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const make = (label: string, extra: Record<string, unknown>) => call("POST", "/api/admin/ticker", adminCookie, { text: T(label), ...extra });
    assert.equal((await make("on", { active: true, href: "/kyoto" })).status, 201);
    assert.equal((await make("off", { active: false })).status, 201);
    assert.equal((await make("ended", { active: true, endsAt: past })).status, 201);
    assert.equal((await make("not-yet", { active: true, startsAt: later })).status, 201);
    assert.equal((await make("windowed", { active: true, startsAt: past, endsAt: later })).status, 201);
    assert.equal((await make("post", { active: true, href: `/blog/${pub}` })).status, 201);
    assert.equal((await make("draft-post", { active: false, href: `/blog/${draft}` })).status, 201);
    const texts = await publicTexts();
    for (const shown of ["on", "windowed", "post"]) assert.ok(texts.includes(T(shown)), shown);
    for (const hidden of ["off", "ended", "not-yet", "draft-post", "member"]) assert.ok(!texts.includes(T(hidden)), hidden);
    assert.ok(texts.indexOf(T("on")) < texts.indexOf(T("windowed")) && texts.indexOf(T("windowed")) < texts.indexOf(T("post")), "in order");
    clearTickerCache();
    const r = await call("GET", `/api/public/ticker?market=${market}`, null);
    for (const item of r.json.items) assert.deepEqual(Object.keys(item).sort(), ["href", "text"]);
    assert.match(r.headers.get("cache-control") ?? "", /max-age=30/);
    assert.deepEqual((await call("GET", "/api/public/ticker?market=atlantis", null)).json, { items: [] });
  });

  it("T2 — activation refused for an unpublished post, an unknown path or an outside link; unpublishing drops a line", async () => {
    const draft = await post("draft");
    const refusedPost = await call("POST", "/api/admin/ticker", adminCookie, { text: T("refused-post"), active: true, href: `/blog/${draft}` });
    assert.equal(refusedPost.status, 409);
    assert.match(refusedPost.json.error, /not published/);
    assert.equal(await ourLine(T("refused-post")), undefined, "nothing written");
    const unknown = await call("POST", "/api/admin/ticker", adminCookie, { text: T("unknown"), active: false, href: "/no-such-page" });
    assert.equal(unknown.status, 400);
    assert.match(unknown.json.error, /not a page on this site/);
    for (const outside of ["https://example.com", "//example.com", "javascript:alert(1)"]) {
      assert.equal((await call("POST", "/api/admin/ticker", adminCookie, { text: T("outside"), href: outside })).status, 400, outside);
    }
    // An inactive draft-post line can be saved, but not turned on until the post is published.
    assert.equal((await call("POST", "/api/admin/ticker", adminCookie, { text: T("waiting"), active: false, href: `/blog/${draft}` })).status, 201);
    const waiting = await ourLine(T("waiting"));
    assert.equal((await call("PATCH", `/api/admin/ticker/${waiting.id}`, adminCookie, { active: true })).status, 409);
    assert.equal((await ourLine(T("waiting"))).active, false);
    await setPost(draft, "published");
    assert.equal((await call("PATCH", `/api/admin/ticker/${waiting.id}`, adminCookie, { active: true })).status, 200);
    assert.ok((await publicTexts()).includes(T("waiting")));
    await setPost(draft, "withdrawn");
    assert.ok(!(await publicTexts()).includes(T("waiting")), "an unpublished post drops its line from the public read");
    const admin = await call("GET", "/api/admin/ticker", adminCookie);
    const row = admin.json.items.find((i: any) => i.id === waiting.id);
    assert.equal(row.postPublished, false);
    assert.equal(row.showing, false);
    assert.equal((await call("PATCH", `/api/admin/ticker/${crypto.randomUUID()}`, adminCookie, { active: false })).status, 404);
  });

  it("T4 — every write is audit-logged in the same transaction; a refused one is not; reorder names every line once", async () => {
    const creates = await auditCount("ticker_item_create");
    const res = await call("POST", "/api/admin/ticker", adminCookie, { text: T("audited") });
    assert.equal(res.status, 201);
    assert.equal(await auditCount("ticker_item_create"), creates + 1);
    assert.equal(await auditCount("ticker_item_create", res.json.id), 1);
    const line = await ourLine(T("audited"));
    assert.equal(line.updated_by, adminId);
    assert.equal(line.market_slug, market);

    assert.equal((await call("PATCH", `/api/admin/ticker/${res.json.id}`, adminCookie, { text: T("audited-2"), href: "/pricing" })).status, 200);
    assert.equal(await auditCount("ticker_item_update", res.json.id), 1);
    const meta = (await pool.query(`SELECT metadata FROM access_audit_logs WHERE action = 'ticker_item_update' AND resource_id = $1`, [res.json.id])).rows[0].metadata;
    assert.deepEqual(meta.changed.href, { from: null, to: "/pricing" });
    assert.equal((await call("PATCH", `/api/admin/ticker/${res.json.id}`, adminCookie, { href: "/no-such-page" })).status, 400);
    assert.equal(await auditCount("ticker_item_update", res.json.id), 1, "a refused edit writes no audit row");

    const order = (await call("GET", "/api/admin/ticker", adminCookie)).json.items.map((i: any) => i.id);
    assert.equal((await call("PUT", "/api/admin/ticker/order", adminCookie, { ids: order.slice(1) })).status, 400, "every line must be named");
    assert.equal((await call("PUT", "/api/admin/ticker/order", adminCookie, { ids: [order[0], ...order] })).status, 400, "each once");
    const reorders = await auditCount("ticker_item_reorder");
    const reversed = [...order].reverse();
    assert.equal((await call("PUT", "/api/admin/ticker/order", adminCookie, { ids: reversed })).status, 200);
    assert.deepEqual((await call("GET", "/api/admin/ticker", adminCookie)).json.items.map((i: any) => i.id), reversed);
    assert.equal(await auditCount("ticker_item_reorder"), reorders + 1);
    assert.equal((await call("PUT", "/api/admin/ticker/order", adminCookie, { ids: order })).status, 200, "order put back");
  });

  it("T5 — a write clears the public read's cache", async () => {
    await publicTexts();
    const r = await call("POST", "/api/admin/ticker", adminCookie, { text: T("fresh"), active: true });
    assert.equal(r.status, 201);
    const now = await call("GET", `/api/public/ticker?market=${market}`, null);
    assert.ok(now.json.items.some((i: any) => i.text === T("fresh")), "visible at once, not after the cache expires");
  });

  it("T6 — the beta list: default, saved, refused", async () => {
    const prior = await pool.query(`SELECT setting_value FROM platform_settings WHERE setting_key = 'beta_market_slugs'`);
    savedBeta = prior.rows[0]?.setting_value ?? null;
    const betaRead = async () => {
      clearTickerCache();
      invalidatePlatformFlagCache("beta_market_slugs");
      return (await call("GET", `/api/public/ticker?market=${market}`, null)).json.betaCities;
    };
    const launchCity = launchCityName(market);
    await pool.query(`DELETE FROM platform_settings WHERE setting_key = 'beta_market_slugs'`);
    assert.deepEqual(await betaRead(), [launchCity], "nothing set: the launch city");

    const save = (value: string, cookie = adminCookie) =>
      call("PATCH", "/api/admin/platform-settings/beta_market_slugs", cookie, { settingValue: value });
    assert.equal((await save('["kyoto","goa"]', memberCookie)).status, 403);
    assert.equal((await save('["kyoto","goa"]')).status, 200);
    assert.deepEqual(await betaRead(), ["Kyoto", "Goa"]);

    const unknown = await save('["kyoto","lisbon"]');
    assert.equal(unknown.status, 400);
    assert.equal(unknown.json?.error, "unknown market: lisbon");
    assert.equal((await save('["goa","goa"]')).status, 400);
    assert.equal((await save("kyoto")).status, 400);
    assert.deepEqual(await betaRead(), ["Kyoto", "Goa"], "a refused save leaves the stored list as it was");

    assert.equal((await save("[]")).status, 200);
    assert.deepEqual(await betaRead(), [launchCity], "an empty list falls back to the launch city");
  });
});
