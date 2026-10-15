/**
 * BOT-1 Phase 1 — the bot channel against a disposable database (ledger `2026-10-15-bot1-phase1`; migration 378).
 *
 *   BD1 tokens: only the hash is stored; a live token authenticates; revoked, expired, unknown and malformed do not
 *   BD2 proposals are refused by name — unknown kind, an ineligible source (decision D), a page off the source's host,
 *       a missing quote, hours whose times are not in the quote — and nothing is stored for a refusal
 *   BD3 a good proposal is stored `pending` and is NOT a place_facts row; the same claim again answers the same id
 *   BD4 approve writes exactly one place_facts row: origin bot_proposal, verified_by = the admin, fetched/verified at
 *       the approval, expiry from the source's interval, tags set; a second approve is `not_pending`
 *   BD5 decision B: no source interval ⇒ the setting's days; the setting missing ⇒ `expiry_unset`, nothing written
 *   BD6 reject writes the proposal only — never place_facts
 *   BD7 the overdue read names REGISTRY rows only: never a plan's fact, never a Places fact
 *   BD8 HTTP: flag off ⇒ 404; no token ⇒ 401; wrong scope ⇒ 403; a strict body; a bot reads only its own
 *       proposals; no response carries a user id, email or plan id
 *
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import express from "express";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  approveBotProposal,
  authenticateBotToken,
  botOverdueFacts,
  createBotAccount,
  fileBotProposal,
  rejectBotProposal,
  revokeBotAccount,
} from "../services/bot-proposals.service";
import botRoutes from "../routes/bot.routes";
import { botLimiter, resetBotLimiterForTests } from "../middleware/bot-limiter";

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `bot-${RUN}-${s}`;
const SRC = id("src");
const SRC_NOINTERVAL = id("src2");
const SRC_OFF = id("src3");
const HOURS_FIELDS = { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM", "Tuesday: 9:00 AM – 5:00 PM"] };
const SETTING = "bot_fact_default_expiry_days";
let originalSetting: string | null = null;

const proposal = (over: Record<string, unknown> = {}) => ({
  kind: "place_fact.hours",
  placeId: `ChIJ-${RUN}-kinkaku`,
  sourceId: SRC,
  sourceUrl: "https://www.shokoku-ji.jp/kinkakuji/",
  checkedAt: "2026-10-15T08:00:00Z",
  text: "Open daily 9:00–17:00",
  quote: "拝観時間 9:00～17:00",
  fields: HOURS_FIELDS,
  ...over,
});

let server: http.Server | null = null;
async function srv(): Promise<http.Server> {
  if (server) return server;
  const app = express();
  app.use(express.json());
  app.use("/api/bot", botLimiter);
  app.use(botRoutes);
  server = http.createServer(app);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return server;
}
async function call(method: string, path: string, token?: string, body?: unknown) {
  const s = await srv();
  const port = (s.address() as any).port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) {
    throw new Error("refusing to write fixtures to a non-disposable database");
  }
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id("admin")}, ${`${id("admin")}@t.test`}, 'A', 'D', 'admin')`);
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES (${id("owner")}, ${`${id("owner")}@t.test`}, 'O', 'W', 'user')`);
  await db.execute(sql`INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, terms_checked_at, active, refresh_interval_days)
    VALUES (${SRC}, 'Kinkaku-ji (Shokoku-ji)', 'https://www.shokoku-ji.jp/', 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', now(), true, 30),
           (${SRC_NOINTERVAL}, 'Ginkaku-ji (Shokoku-ji)', 'https://www.shokoku-ji.jp/', 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', now(), true, NULL),
           (${SRC_OFF}, 'Unchecked temple', 'https://temple.example/', 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', NULL, false, NULL)`);
  const r = await db.execute(sql`SELECT setting_value FROM platform_settings WHERE setting_key = ${SETTING}`);
  originalSetting = ((r as any).rows?.[0]?.setting_value as string) ?? null;
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${SETTING}, '90') ON CONFLICT (setting_key) DO UPDATE SET setting_value = '90'`);
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, start_date, end_date, status) VALUES (${id("trip")}, ${id("owner")}, 'T', 'Kyoto, Japan', '2027-05-10', '2027-05-12', 'planning')`);
});

after(async () => {
  server?.close();
  await db.execute(sql`DELETE FROM place_facts WHERE place_ref LIKE ${`ChIJ-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM bot_accounts WHERE name LIKE ${`bot-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM content_sources WHERE id LIKE ${`bot-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM trips WHERE id LIKE ${`bot-${RUN}-%`}`).catch(() => {});
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`bot-${RUN}-%`}`).catch(() => {});
  if (originalSetting === null) await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${SETTING}`).catch(() => {});
  else await db.execute(sql`UPDATE platform_settings SET setting_value = ${originalSetting} WHERE setting_key = ${SETTING}`).catch(() => {});
  await pool.end();
});

const factRows = async (placeRef: string) => ((await db.execute(sql`SELECT * FROM place_facts WHERE place_ref = ${placeRef}`)) as any).rows as any[];

let bot: { id: string };
let token = "";

test("BD1 tokens", async () => {
  const out = await createBotAccount({ name: id("research"), scopes: ["coverage:read", "facts:read", "proposals:write", "proposals:read"], createdBy: id("admin") });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  bot = out.bot;
  token = out.token;
  assert.match(token, /^tvb_/);
  const stored = ((await db.execute(sql`SELECT token_hash FROM bot_accounts WHERE id = ${bot.id}`)) as any).rows[0].token_hash;
  assert.notEqual(stored, token, "the token itself is never stored");
  assert.equal(stored, crypto.createHash("sha256").update(token).digest("hex"));
  assert.equal((await authenticateBotToken(token))?.id, bot.id);
  assert.equal(await authenticateBotToken("tvb_unknown"), null);
  assert.equal(await authenticateBotToken("not-a-bot-token"), null);
  const expiring = await createBotAccount({ name: id("short"), scopes: ["facts:read"], expiresAt: new Date(Date.now() + 60_000).toISOString(), createdBy: id("admin") });
  assert.equal(expiring.ok, true);
  if (expiring.ok) assert.equal(await authenticateBotToken(expiring.token, new Date(Date.now() + 120_000)), null, "expired");
  const doomed = await createBotAccount({ name: id("doomed"), scopes: ["facts:read"], createdBy: id("admin") });
  if (doomed.ok) {
    assert.deepEqual(await revokeBotAccount(doomed.bot.id), { revoked: true });
    assert.deepEqual(await revokeBotAccount(doomed.bot.id), { revoked: false }, "revoking twice changes nothing");
    assert.equal(await authenticateBotToken(doomed.token), null, "revoked");
  }
  assert.deepEqual(await createBotAccount({ name: id("x"), scopes: ["admin:everything"], createdBy: id("admin") }), { ok: false, reason: "bad_scopes" });
});

test("BD2 refusals are named and store nothing", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ kind: "nugget.tip" }, "bad_kind"],
    [{ sourceId: SRC_OFF, sourceUrl: "https://temple.example/hours" }, "source_not_eligible"],
    [{ sourceId: id("nope") }, "source_not_eligible"],
    [{ sourceUrl: "https://evil.example/kinkakuji/" }, "url_off_source_host"],
    [{ sourceUrl: "http://www.shokoku-ji.jp/kinkakuji/" }, "url_not_https"],
    [{ quote: "" }, "no_quote"],
    [{ quote: "x".repeat(400) }, "quote_too_long"],
    [{ quote: "拝観時間 10:00～16:00" }, "bad_fields"],
    [{ fields: {} }, "bad_fields"],
    [{ placeId: "has space" }, "bad_place"],
  ];
  for (const [over, reason] of cases) {
    const out = await fileBotProposal(bot, proposal(over));
    assert.deepEqual(out, { ok: false, reason }, JSON.stringify(over));
  }
  const n = ((await db.execute(sql`SELECT count(*)::int AS n FROM bot_proposals WHERE bot_id = ${bot.id}`)) as any).rows[0].n;
  assert.equal(n, 0);
});

let pendingId = "";
test("BD3 a good proposal is pending and is not a fact; the same claim answers the same id", async () => {
  const out = await fileBotProposal(bot, proposal());
  assert.equal(out.ok, true);
  if (!out.ok) return;
  pendingId = out.proposal.id;
  assert.equal(out.proposal.status, "pending");
  assert.equal(out.duplicate, false);
  assert.equal((await factRows(`ChIJ-${RUN}-kinkaku`)).length, 0, "a pending proposal is never a place_facts row");
  const again = await fileBotProposal(bot, proposal({ fields: { weekdayDescriptions: [...HOURS_FIELDS.weekdayDescriptions] } }));
  assert.equal(again.ok && again.duplicate, true);
  assert.equal(again.ok && again.proposal.id, pendingId);
});

test("BD4 approve writes exactly one fact through the one writer", async () => {
  const before = Date.now();
  const out = await approveBotProposal(pendingId, id("admin"));
  assert.equal(out.ok, true);
  const rows = await factRows(`ChIJ-${RUN}-kinkaku`);
  assert.equal(rows.length, 1);
  const f = rows[0];
  assert.equal(f.origin, "bot_proposal");
  assert.equal(f.verified_by, id("admin"));
  assert.equal(f.license, "official");
  assert.equal(f.fact_type, "hours");
  assert.equal(f.plan_id, null);
  assert.equal(f.source_class, "public");
  assert.equal(f.reuse_class, "link_only");
  assert.ok(new Date(f.fetched_at).getTime() >= before - 1000, "checked at the approval");
  const days = Math.round((new Date(f.expires_at).getTime() - new Date(f.fetched_at).getTime()) / 86_400_000);
  assert.equal(days, 30, "the source row's interval");
  const p = ((await db.execute(sql`SELECT status, reviewed_by, fact_id FROM bot_proposals WHERE id = ${pendingId}`)) as any).rows[0];
  assert.deepEqual([p.status, p.reviewed_by, p.fact_id], ["approved", id("admin"), f.id]);
  assert.deepEqual(await approveBotProposal(pendingId, id("admin")), { ok: false, reason: "not_pending" });
  assert.equal((await factRows(`ChIJ-${RUN}-kinkaku`)).length, 1, "a second approve writes nothing");
});

test("BD5 decision B — the setting, and expiry_unset", async () => {
  const filed = await fileBotProposal(bot, proposal({ placeId: `ChIJ-${RUN}-ginkaku`, sourceId: SRC_NOINTERVAL, sourceUrl: "https://www.shokoku-ji.jp/ginkakuji/" }));
  assert.equal(filed.ok, true);
  if (!filed.ok) return;
  await db.execute(sql`DELETE FROM platform_settings WHERE setting_key = ${SETTING}`);
  assert.deepEqual(await approveBotProposal(filed.proposal.id, id("admin")), { ok: false, reason: "expiry_unset" });
  assert.equal((await factRows(`ChIJ-${RUN}-ginkaku`)).length, 0);
  const p = ((await db.execute(sql`SELECT status FROM bot_proposals WHERE id = ${filed.proposal.id}`)) as any).rows[0];
  assert.equal(p.status, "pending", "a refused approval leaves the proposal pending");
  await db.execute(sql`INSERT INTO platform_settings (setting_key, setting_value) VALUES (${SETTING}, '90')`);
  assert.equal((await approveBotProposal(filed.proposal.id, id("admin"))).ok, true);
  const f = (await factRows(`ChIJ-${RUN}-ginkaku`))[0];
  assert.equal(Math.round((new Date(f.expires_at).getTime() - new Date(f.fetched_at).getTime()) / 86_400_000), 90);
});

test("BD6 reject writes the proposal only", async () => {
  const filed = await fileBotProposal(bot, proposal({ placeId: `ChIJ-${RUN}-fushimi` }));
  assert.equal(filed.ok, true);
  if (!filed.ok) return;
  assert.deepEqual(await rejectBotProposal(filed.proposal.id, id("admin"), "Hours changed in November"), { ok: true });
  assert.equal((await factRows(`ChIJ-${RUN}-fushimi`)).length, 0);
  assert.deepEqual(await rejectBotProposal(filed.proposal.id, id("admin"), "again"), { ok: false, reason: "not_pending" });
  assert.deepEqual(await approveBotProposal(filed.proposal.id, id("admin")), { ok: false, reason: "not_pending" });
});

test("BD7 the overdue read names registry rows only", async () => {
  const past = new Date(Date.now() - 86_400_000);
  const ins = (ref: string, origin: string, planId: string | null) =>
    db.execute(sql`INSERT INTO place_facts (id, place_ref_kind, place_ref, need, fact_type, value, origin, source_id, source_url, license, fetched_at, expires_at, plan_id, source_class, reuse_class)
      VALUES (${crypto.randomUUID()}, 'place_id', ${ref}, 'stop.hours', 'hours', '{}'::jsonb, ${origin}, ${SRC}, 'https://www.shokoku-ji.jp/', 'official', ${past}, ${past}, ${planId}, 'public', 'link_only')`);
  await ins(`ChIJ-${RUN}-reg`, "official_refresh", null);
  await ins(`ChIJ-${RUN}-planfact`, "crawled", id("trip"));
  await ins(`ChIJ-${RUN}-places`, "places_api", null);
  const out = await botOverdueFacts();
  const refs = out.registryFactsExpired.map((r) => r.placeRef);
  assert.ok(refs.includes(`ChIJ-${RUN}-reg`));
  assert.equal(refs.includes(`ChIJ-${RUN}-planfact`), false, "never a plan's fact");
  assert.equal(refs.includes(`ChIJ-${RUN}-places`), false, "never a Places fact");
  assert.equal(out.unchecked.length, 3);
});

test("BD8 HTTP: flag, auth, scope, body, own proposals only, no ids leak", async () => {
  resetBotLimiterForTests();
  const prev = process.env.BOT_API_ENABLED;
  delete process.env.BOT_API_ENABLED;
  assert.equal((await call("GET", "/api/bot/facts/overdue", token)).status, 404, "off ⇒ not visible");
  process.env.BOT_API_ENABLED = "1";
  try {
    assert.equal((await call("GET", "/api/bot/facts/overdue")).status, 401);
    assert.equal((await call("GET", "/api/bot/facts/overdue", "tvb_wrong")).status, 401);
    const narrow = await createBotAccount({ name: id("narrow"), scopes: ["facts:read"], createdBy: id("admin") });
    if (narrow.ok) assert.equal((await call("POST", "/api/bot/proposals", narrow.token, proposal({ placeId: `ChIJ-${RUN}-scope` }))).status, 403);
    const read = await call("GET", "/api/bot/facts/overdue", token);
    assert.equal(read.status, 200);
    assert.equal((await call("POST", "/api/bot/proposals", token, { ...proposal({ placeId: `ChIJ-${RUN}-strict` }), userId: "x" })).status, 400, "unknown key refused");
    const filed = await call("POST", "/api/bot/proposals", token, proposal({ placeId: `ChIJ-${RUN}-http` }));
    assert.equal(filed.status, 201);
    const refused = await call("POST", "/api/bot/proposals", token, proposal({ placeId: `ChIJ-${RUN}-http2`, sourceId: SRC_OFF }));
    assert.deepEqual([refused.status, refused.json.code], [422, "source_not_eligible"]);
    const mine = await call("GET", `/api/bot/proposals/${filed.json.proposal.id}`, token);
    assert.equal(mine.status, 200);
    const other = await createBotAccount({ name: id("other"), scopes: ["proposals:read"], createdBy: id("admin") });
    if (other.ok) assert.equal((await call("GET", `/api/bot/proposals/${filed.json.proposal.id}`, other.token)).status, 404, "another bot's proposal is one 404");
    for (const body of [read.text, filed.text, mine.text]) {
      for (const leak of [id("admin"), id("owner"), id("trip"), "@t.test", "reviewedBy", "userId", "email"]) assert.equal(body.includes(leak), false, `no ${leak}`);
    }
    const used = ((await db.execute(sql`SELECT last_used_at FROM bot_accounts WHERE id = ${bot.id}`)) as any).rows[0].last_used_at;
    assert.ok(used, "the request stamps last_used_at");
  } finally {
    if (prev === undefined) delete process.env.BOT_API_ENABLED;
    else process.env.BOT_API_ENABLED = prev;
  }
});
