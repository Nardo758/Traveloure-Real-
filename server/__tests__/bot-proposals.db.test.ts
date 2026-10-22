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
 *   BD9  row 126 (ledger `2026-10-22-bot-closed-dates-timed-entry`): a closed-dates proposal is hidden from the plan
 *        check and the plan page until a person approves it; approval takes no reviewer expiry — it expires at
 *        midnight after the last listed date, in the plan's zone (the market's for a registry fact)
 *   BD10 a timed-entry proposal is hidden until approved; approval without an expiry is refused, an expiry past the
 *        source's setting is refused, a good one goes live
 *   BD12 the seam with row 125: once an approved timed-entry or closed-dates fact passes its expiry, neither the plan
 *        check nor the slip's warning raises anything — the item's flag drops on expiry, a booking id or a purchase only
 *   BD11 a source that is not the place's own official site — Google, an OTA, a partner's domain — is refused by name;
 *        so is proposal text that claims to be verified or confirmed
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
import { factsForTrip } from "../services/content-facts/place-facts.service";
import { loadPlanCheckInput } from "../services/optimizer-lead.service";
import { checkPlan } from "@shared/plan-check";
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

// ── Row 126: closed dates and timed entry ──────────────────────────────────────────────────────────

const PLAN = id("plan126");
const STOP = id("stop126");
const PLACE = `ChIJ-${RUN}-nijo`;
async function seedPlan126() {
  const [exists] = ((await db.execute(sql`SELECT 1 FROM trips WHERE id = ${PLAN}`)) as any).rows;
  if (exists) return;
  await db.execute(sql`INSERT INTO trips (id, user_id, title, destination, market_slug, timezone, start_date, end_date, status)
    VALUES (${PLAN}, ${id("owner")}, 'Row 126', 'Kyoto, Japan', 'kyoto', 'Asia/Tokyo', '2027-05-10', '2027-05-11', 'planning')`);
  await db.execute(sql`INSERT INTO itinerary_items (id, trip_id, day_number, title, item_type, start_time, duration_minutes, origin, sort_order, google_place_id)
    VALUES (${STOP}, ${PLAN}, 1, 'Nijo Castle', 'activity', '10:00', 60, 'traveler', 1, ${PLACE})`);
}
const planIssues = async () => checkPlan((await loadPlanCheckInput(PLAN)).input).issues.filter((i) => i.stop?.itemId === STOP).map((i) => i.why);
const pageTypes = async () => ((await factsForTrip(PLAN))[STOP] ?? []).map((f) => f.factType);

test("BD9 closed dates: hidden until reviewed; the expiry is the day after the last date", async () => {
  await seedPlan126();
  const filed = await fileBotProposal(
    bot,
    proposal({
      kind: "place_fact.closed_dates",
      placeId: PLACE,
      sourceUrl: "https://www.shokoku-ji.jp/news/",
      text: "Closed for maintenance",
      quote: "May 10, 2027: closed for maintenance.",
      fields: { ranges: [{ from: "2027-05-10", to: "2027-05-10" }] },
    }),
  );
  assert.equal(filed.ok, true, JSON.stringify(filed));
  if (!filed.ok) return;
  assert.equal((await factRows(PLACE)).length, 0, "pending is not a fact");
  assert.equal((await planIssues()).includes("closed_date"), false, "the plan check does not see a pending proposal");
  assert.equal((await pageTypes()).includes("closed_dates"), false, "the plan page does not see it either");
  assert.deepEqual(await approveBotProposal(filed.proposal.id, id("admin"), new Date(), { expiresAt: "2027-06-01T00:00:00Z" }), { ok: false, reason: "expiry_from_dates" }, "the reviewer does not set it");
  const ok = await approveBotProposal(filed.proposal.id, id("admin"));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const f = (await factRows(PLACE)).find((r) => r.fact_type === "closed_dates");
  assert.equal(new Date(f.expires_at).toISOString(), "2027-05-10T15:00:00.000Z", "midnight 2027-05-11, Asia/Tokyo");
  assert.equal(f.verified_by, id("admin"));
  assert.equal((await planIssues()).includes("closed_date"), true, "after review, the plan check names it");
});

test("BD10 timed entry: hidden until reviewed; the reviewer's expiry is required and capped", async () => {
  await seedPlan126();
  const filed = await fileBotProposal(
    bot,
    proposal({
      kind: "place_fact.timed_entry_required",
      placeId: PLACE,
      sourceUrl: "https://www.shokoku-ji.jp/reserve/",
      text: "Timed entry",
      quote: "Entry by timed reservation. Slots open 30 days ahead.",
      fields: { required: true, opensDaysAhead: 30 },
    }),
  );
  assert.equal(filed.ok, true, JSON.stringify(filed));
  if (!filed.ok) return;
  assert.equal((await planIssues()).includes("timed_entry_required"), false, "pending: not in the plan check");
  assert.equal((await pageTypes()).includes("timed_entry_required"), false, "pending: not on the page");
  assert.equal((await approveBotProposal(filed.proposal.id, id("admin"))).ok, false);
  assert.deepEqual(await approveBotProposal(filed.proposal.id, id("admin")), { ok: false, reason: "expiry_required" });
  const tooLate = new Date(Date.now() + 31 * 86_400_000).toISOString();
  assert.deepEqual(await approveBotProposal(filed.proposal.id, id("admin"), new Date(), { expiresAt: tooLate }), { ok: false, reason: "expiry_after_limit" }, "the source's 30-day setting caps it");
  assert.equal((await factRows(PLACE)).some((r) => r.fact_type === "timed_entry_required"), false, "a refused review writes nothing");
  const good = new Date(Date.now() + 20 * 86_400_000).toISOString();
  assert.equal((await approveBotProposal(filed.proposal.id, id("admin"), new Date(), { expiresAt: good })).ok, true);
  assert.equal((await planIssues()).includes("timed_entry_required"), true);
  assert.equal((await pageTypes()).includes("timed_entry_required"), true);
  // #1580's stamp, code-written from the stored fields: "Checked <date> · Source: <official site>".
  const view = ((await factsForTrip(PLAN))[STOP] ?? []).find((f) => f.factType === "timed_entry_required");
  assert.match(view!.provenance, /^Checked \d{1,2} [A-Z][a-z]{2} \d{4} · Source: Kinkaku-ji \(Shokoku-ji\)$/);
});

test("BD12 an expired approved fact raises nothing in the plan check or on the slip", async () => {
  await seedPlan126();
  await db.execute(sql`UPDATE place_facts SET expires_at = now() - interval '1 minute' WHERE place_ref = ${PLACE} AND origin = 'bot_proposal'`);
  const issues = await planIssues();
  assert.equal(issues.includes("timed_entry_required"), false, "expired timed entry: no flag");
  assert.equal(issues.includes("closed_date"), false, "expired closed dates: no finding");
  const types = await pageTypes();
  assert.equal(types.includes("timed_entry_required"), false, "expired: no slip warning");
  assert.equal(types.includes("closed_dates"), false);
});

test("BD11 only the place's own official site; no claim of verification in the text", async () => {
  const google = id("google");
  const ota = id("ota");
  const partnerSrc = id("partnersrc");
  const partner = id("partner");
  await db.execute(sql`INSERT INTO content_sources (id, name, homepage, market, adapter, covers, does_not_cover, license_class, terms_checked_at, active, refresh_interval_days)
    VALUES (${google}, 'Maps', 'https://www.google.com/', 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', now(), true, 30),
           (${ota}, 'OTA', 'https://www.klook.com/', 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', now(), true, 30),
           (${partnerSrc}, 'Partner', ${`https://tickets.partner-${RUN}.example/`}, 'kyoto', 'manual', ARRAY['stop.hours'], ARRAY[]::text[], 'official', now(), true, 30)`);
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category) VALUES (${partner}, ${partner}, ${`https://partner-${RUN}.example/`}, 'tours')`);
  try {
    const closed = (over: Record<string, unknown>) =>
      fileBotProposal(bot, proposal({ kind: "place_fact.closed_dates", placeId: `ChIJ-${RUN}-q10`, text: "Closed", quote: "Closed May 12, 2027.", fields: { ranges: [{ from: "2027-05-12", to: "2027-05-12" }] }, ...over }));
    assert.deepEqual(await closed({ sourceId: google, sourceUrl: "https://www.google.com/maps/place/x" }), { ok: false, reason: "url_not_official_site" });
    assert.deepEqual(await closed({ sourceId: ota, sourceUrl: "https://www.klook.com/activity/1/" }), { ok: false, reason: "url_not_official_site" });
    assert.deepEqual(await closed({ sourceId: partnerSrc, sourceUrl: `https://tickets.partner-${RUN}.example/nijo` }), { ok: false, reason: "url_not_official_site" });
    assert.deepEqual(await closed({ text: "Verified closed" }), { ok: false, reason: "text_claims_verification" });
    assert.deepEqual(await closed({ text: "Confirmed by the castle" }), { ok: false, reason: "text_claims_verification" });
    const n = ((await db.execute(sql`SELECT count(*)::int AS n FROM bot_proposals WHERE place_ref = ${`ChIJ-${RUN}-q10`}`)) as any).rows[0].n;
    assert.equal(n, 0, "nothing stored for a refusal");
  } finally {
    await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${partner}`);
  }
});
