/**
 * Slice 0 (Addendum A v2) — live proofs for staff roles and bot actors.
 *
 *   S0-1  every /api/admin route (GET and every mutation, discovered from the mounted sources) refuses a bot token
 *         with 401 — no bot key reaches the admin console, platform_settings or the fee/flag screens;
 *   S0-2  the /api/bot surface: a key reaches only its own scopes, the propose route is its only write, and the
 *         Ops Bot's `queue:read` view carries no bot name, no proposal body and no user id;
 *   S0-3  every bot key call is an audit row, filterable by bot (the owner reads them on /api/admin/bot-audit);
 *   S0-4  owner-only writes refuse a platform_admin (fee bands, settings, bot keys, staff grants), and the owner's
 *         market grant is audited;
 *   S0-5  the market predicate: a regional manager with no markets gets ONE 404 on a Kyoto listing; with Kyoto granted,
 *         the approval stamps and waits for the owner; the owner's confirm runs the existing approve route.
 *
 * Opt-in like the other live audits in this directory (MUTATION_AUTH_AUDIT_OK=1), loopback only, and the server
 * must run with BOT_API_ENABLED=1 (S0-2 says so out loud when it does not).
 *
 *   MUTATION_AUTH_AUDIT_OK=1 npx tsx --test server/__tests__/mutation-auth/staff-roles-bot.http.test.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { users } from "@shared/models/auth";

const LIVE = process.env.MUTATION_AUTH_AUDIT_OK === "1";
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:5000";
const skip = !LIVE && "set MUTATION_AUTH_AUDIT_OK=1 to run live slice-0 probes";
const scrypt = promisify(crypto.scrypt);

// ── route discovery ─────────────────────────────────────────────────────────────────────────────────────────────────
type Route = { method: string; path: string; source: string };
const ROUTE_RE = /(?:router|app)\.(get|post|put|patch|delete)\(\s*["'`](\/api\/admin[^"'`]*)["'`]/g;

/** Every literal /api/admin registration under server/routes.ts and server/routes/** (multi-line safe). */
export function discoverAdminRoutes(root = process.cwd()): Route[] {
  const files = ["server/routes.ts"];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) files.push(rel);
    }
  };
  walk("server/routes");
  const seen = new Set<string>();
  const out: Route[] = [];
  for (const source of files) {
    const text = fs.readFileSync(path.join(root, source), "utf8");
    for (const m of Array.from(text.matchAll(ROUTE_RE))) {
      const key = `${m[1].toUpperCase()} ${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ method: m[1].toUpperCase(), path: m[2], source });
    }
  }
  return out.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function concretePath(template: string): string {
  return template
    .replace(/:([A-Za-z0-9_]+)\([^)]*\)/g, (_a, name: string) => encodeURIComponent(`${name}-s0-probe`))
    .replace(/:([A-Za-z0-9_]+)\??/g, (_a, name: string) => encodeURIComponent(`${name}-s0-probe`))
    .replace(/\*/g, "s0-probe");
}

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────────────────────────
type Db = typeof import("../../db").db;
let db: Db | undefined;
const userIds: string[] = [];
const botIds: string[] = [];
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

function assertSafeTarget(): void {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing slice-0 probes when NODE_ENV=production");
  const host = new URL(BASE_URL).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) throw new Error(`Refusing non-loopback BASE_URL: ${BASE_URL}`);
  if (process.env.PROD_DATABASE_URL && process.env.DATABASE_URL === process.env.PROD_DATABASE_URL) {
    throw new Error("Refusing slice-0 probes against the production database");
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

async function makeUser(label: string, role: string): Promise<void> {
  const id = crypto.randomUUID();
  const email = `s0-${label}-${crypto.randomUUID()}@example.invalid`;
  const password = `Slice0-${crypto.randomBytes(12).toString("hex")}!`;
  await db!.insert(users).values({
    id, email, password: await hashPassword(password), firstName: "Slice0", lastName: label,
    role, authProvider: "email", emailVerified: new Date(),
  } as any);
  userIds.push(id);
  ids[label] = id;
  const login = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  assert.equal(login.status, 200, `${label} login failed: ${login.status} ${(await login.text()).slice(0, 300)}`);
  cookies[label] = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.ok(cookies[label], `${label} login returned no session cookie`);
}

async function call(method: string, url: string, opts: { cookie?: string; bearer?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    redirect: "manual",
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, text, json };
}

before(async () => {
  if (!LIVE) return;
  assertSafeTarget();
  db = (await import("../../db")).db;
  const { providerServices } = await import("@shared/schema");
  const { BOT_SCOPES } = await import("@shared/bot-proposals");
  const { createBotAccount } = await import("../../services/bot-proposals.service");

  await makeUser("owner", "owner");
  await makeUser("platform_admin", "platform_admin");
  await makeUser("rm_none", "regional_manager");
  await makeUser("rm_kyoto", "regional_manager");
  // A provider owns two submitted Kyoto listings. Inserted directly: the listing wizard is not what is under test.
  const providerId = crypto.randomUUID();
  await db.insert(users).values({
    id: providerId, email: `s0-provider-${providerId}@example.invalid`, firstName: "Slice0", lastName: "provider",
    role: "service_provider", authProvider: "email", emailVerified: new Date(),
  } as any);
  userIds.push(providerId);
  for (const label of ["listing_a", "listing_b"]) {
    const id = crypto.randomUUID();
    await db.insert(providerServices).values({
      id, userId: providerId, serviceName: `Slice 0 probe ${label}`, location: "Kyoto, Japan",
      approvalStatus: "submitted", submittedAt: new Date(), price: "50.00",
    } as any);
    ids[label] = id;
  }

  const mk = async (label: string, scopes: readonly string[]) => {
    const r = await createBotAccount({ name: `s0-${label}-${crypto.randomUUID().slice(0, 8)}`, scopes, createdBy: ids.owner });
    assert.ok(r.ok, `bot ${label} create failed`);
    if (!r.ok) return;
    botIds.push(r.bot.id);
    ids[`bot_${label}`] = r.bot.id;
    tokens[label] = r.token;
  };
  await mk("all", [...BOT_SCOPES]);
  await mk("propose", ["proposals:write"]);
  await mk("queue", ["queue:read"]);
});

after(async () => {
  if (!db) return;
  const { botAccounts, staffMarketAssignments } = await import("@shared/schema");
  try {
    if (botIds.length) await db.delete(botAccounts).where(inArray(botAccounts.id, botIds));
    if (userIds.length) {
      await db.delete(staffMarketAssignments).where(inArray(staffMarketAssignments.userId, userIds));
      for (const id of userIds) {
        await db.execute(sql`DELETE FROM sessions WHERE sess->'passport'->'user'->>'id' = ${id} OR sess->'passport'->'user'->'claims'->>'sub' = ${id}`);
      }
      await db.execute(sql`DELETE FROM access_audit_logs WHERE actor_id IN (${sql.join(userIds.map((u) => sql`${u}`), sql`, `)})`);
    }
  } finally {
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  }
});

// ── S0-1 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("S0-1 discovery finds the whole admin surface (GETs and mutations)", () => {
  const routes = discoverAdminRoutes();
  assert.ok(routes.length > 300, `expected more than 300 /api/admin routes, found ${routes.length}`);
  for (const must of [
    "GET /api/admin/platform-settings",
    "PATCH /api/admin/platform-settings/:settingKey",
    "PATCH /api/admin/fee-bands/:bandKey",
    "POST /api/admin/bot-accounts",
    "POST /api/admin/staff/:userId/role",
    "POST /api/admin/staff/:userId/markets",
    "GET /api/admin/issue-queue",
  ]) {
    assert.ok(routes.some((r) => `${r.method} ${r.path}` === must), `discovery misses ${must}`);
  }
  // The mutation half equals the generated mounted-graph manifest's /api/admin set, so the walk cannot drift from it.
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "generated/security/mutation-auth-manifest.json"), "utf8"));
  const fromManifest = new Set<string>(
    (manifest.mutations as Array<{ method: string; effectivePath: string }>)
      .filter((m) => m.effectivePath.startsWith("/api/admin"))
      .map((m) => `${m.method} ${m.effectivePath}`),
  );
  const fromScan = new Set(routes.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`));
  assert.deepEqual([...fromManifest].filter((k) => !fromScan.has(k)), [], "manifest /api/admin mutations the walk misses");
  assert.deepEqual([...fromScan].filter((k) => !fromManifest.has(k)), [], "walked mutations the manifest does not list");
});

test("S0-1 a bot token (every scope) is refused 401 on every /api/admin route — reads, writes, settings and flags", { skip }, async () => {
  const routes = discoverAdminRoutes();
  const leaks: string[] = [];
  for (const r of routes) {
    const res = await call(r.method, concretePath(r.path), { bearer: tokens.all });
    if (res.status !== 401) leaks.push(`${r.method} ${r.path} (${r.source}) → ${res.status} ${res.text.slice(0, 120)}`);
  }
  assert.deepEqual(leaks, [], `bot token not refused:\n${leaks.join("\n")}`);
});

// ── S0-2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("S0-2 the /api/bot surface writes only proposals, and nothing on it writes a setting or a flag", () => {
  const text = fs.readFileSync(path.join(process.cwd(), "server/routes/bot.routes.ts"), "utf8");
  const writes = Array.from(text.matchAll(/router\.(post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)).map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  assert.deepEqual(writes, ["POST /api/bot/proposals"]);
  // No import, query or write of the settings or flags tables in code (the header comment names them to refuse them).
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /platformSettings|platform_settings|feature_flag|featureFlag/);
});

test("S0-2 a bot key reaches only its own scopes; the Ops Bot's queue view carries no name, body or user id", { skip }, async () => {
  const noToken = await call("GET", "/api/bot/queue");
  assert.equal(noToken.status, 401, `no token: ${noToken.status} — is the server running with BOT_API_ENABLED=1? ${noToken.text.slice(0, 120)}`);

  const q = await call("GET", "/api/bot/queue", { bearer: tokens.queue });
  assert.equal(q.status, 200, q.text.slice(0, 300));
  const items: any[] = q.json?.items ?? [];
  assert.ok(Array.isArray(items));
  for (const item of items) assert.deepEqual(Object.keys(item).sort(), ["id", "kind", "market", "since"]);
  assert.doesNotMatch(q.text, /proposedBy|botName|assignedTo|"detail"/);

  for (const url of ["/api/bot/queue", "/api/bot/facts/overdue", "/api/bot/coverage/needs?market=kyoto"]) {
    const r = await call("GET", url, { bearer: tokens.propose });
    assert.equal(r.status, 403, `propose-only key on ${url}: ${r.status}`);
  }
  const p = await call("POST", "/api/bot/proposals", { bearer: tokens.queue, body: {} });
  assert.equal(p.status, 403, `queue-only key may not propose: ${p.status}`);
  const bad = await call("POST", "/api/bot/proposals", { bearer: tokens.propose, body: {} });
  assert.equal(bad.status, 400, `propose key reaches the body check: ${bad.status}`);
});

// ── S0-3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("S0-3 every bot key call is an audit row, and the owner filters them by bot", { skip }, async () => {
  const { botAuditLogs } = await import("@shared/schema");
  await call("GET", "/api/bot/queue", { bearer: tokens.queue });
  await call("POST", "/api/bot/proposals", { bearer: tokens.queue, body: {} });
  let rows: any[] = [];
  for (let i = 0; i < 20; i++) {
    rows = await db!.select().from(botAuditLogs).where(eq(botAuditLogs.botId, ids.bot_queue));
    if (rows.some((r) => r.method === "POST")) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(rows.some((r) => r.path === "/api/bot/queue" && r.statusCode === 200 && r.action === "bot.read" && r.scope === "queue:read"), JSON.stringify(rows));
  assert.ok(rows.some((r) => r.path === "/api/bot/proposals" && r.statusCode === 403 && r.action === "bot.propose"), JSON.stringify(rows));

  const read = await call("GET", `/api/admin/bot-audit?botId=${ids.bot_queue}`, { cookie: cookies.owner });
  assert.equal(read.status, 200, read.text.slice(0, 300));
  const listed: any[] = read.json?.rows ?? read.json?.items ?? read.json ?? [];
  assert.ok(Array.isArray(listed) && listed.length >= 2, read.text.slice(0, 300));
  for (const r of listed) assert.equal(r.botId, ids.bot_queue);
  assert.doesNotMatch(read.text, /token/i);
});

// ── S0-4 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("S0-4 owner-only writes refuse a platform_admin", { skip }, async () => {
  const cases: Array<[string, string, unknown]> = [
    ["PATCH", "/api/admin/platform-settings/provider_signoff_required_for", { value: "none" }],
    ["PATCH", "/api/admin/platform-settings/bot_audit_retention_days", { value: "1" }],
    ["PATCH", "/api/admin/fee-bands/beta_flat", {}],
    ["POST", "/api/admin/bot-accounts", { name: "x", scopes: ["queue:read"] }],
    ["PATCH", `/api/admin/bot-accounts/${ids.bot_queue}/scopes`, { scopes: ["queue:read", "proposals:write"] }],
    ["POST", `/api/admin/bot-accounts/${ids.bot_queue}/revoke`, {}],
    ["POST", `/api/admin/staff/${ids.rm_none}/role`, { role: "platform_admin" }],
    ["POST", `/api/admin/staff/${ids.rm_none}/markets`, { marketSlug: "kyoto" }],
  ];
  for (const [method, url, body] of cases) {
    const r = await call(method, url, { cookie: cookies.platform_admin, body });
    assert.equal(r.status, 403, `platform_admin ${method} ${url} → ${r.status} ${r.text.slice(0, 160)}`);
  }
  // A platform_admin still reads the same screens.
  for (const url of ["/api/admin/platform-settings", "/api/admin/staff", "/api/admin/owner-signoff"]) {
    const r = await call("GET", url, { cookie: cookies.platform_admin });
    assert.equal(r.status, 200, `platform_admin GET ${url} → ${r.status}`);
  }
});

test("S0-4 the owner's market grant is written once and audited", { skip }, async () => {
  const { accessAuditLogs, staffMarketAssignments } = await import("@shared/schema");
  const bad = await call("POST", `/api/admin/staff/${ids.rm_kyoto}/markets`, { cookie: cookies.owner, body: { marketSlug: "atlantis" } });
  assert.equal(bad.status, 400);
  const g1 = await call("POST", `/api/admin/staff/${ids.rm_kyoto}/markets`, { cookie: cookies.owner, body: { marketSlug: "kyoto" } });
  assert.equal(g1.status, 200, g1.text);
  assert.equal(g1.json.changed, true);
  assert.deepEqual(g1.json.markets, ["kyoto"]);
  const g2 = await call("POST", `/api/admin/staff/${ids.rm_kyoto}/markets`, { cookie: cookies.owner, body: { marketSlug: "kyoto" } });
  assert.equal(g2.json.changed, false, "a repeat grant is a no-op");
  const live = await db!.select().from(staffMarketAssignments).where(eq(staffMarketAssignments.userId, ids.rm_kyoto));
  assert.equal(live.length, 1);
  const audits = await db!.select().from(accessAuditLogs).where(and(eq(accessAuditLogs.actorId, ids.owner), eq(accessAuditLogs.action, "staff.market_grant")));
  assert.equal(audits.length, 1, "one audit row for one grant");
  assert.equal(audits[0].actorRole, "owner");
});

// ── S0-5 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("S0-5 a regional manager with no markets gets one 404 on a Kyoto listing and sees none of them", { skip }, async () => {
  const approve = await call("POST", `/api/admin/provider-services/${ids.listing_a}/approve`, { cookie: cookies.rm_none });
  assert.equal(approve.status, 404, approve.text.slice(0, 200));
  const reject = await call("POST", `/api/admin/provider-services/${ids.listing_a}/reject`, { cookie: cookies.rm_none, body: { reason: "x" } });
  assert.equal(reject.status, 404, reject.text.slice(0, 200));
  const absent = await call("POST", `/api/admin/provider-services/${crypto.randomUUID()}/approve`, { cookie: cookies.rm_none });
  assert.equal(absent.status, 404, "out of scope and absent are the same answer");
  const pending = await call("GET", "/api/admin/provider-services/pending", { cookie: cookies.rm_none });
  assert.equal(pending.status, 200);
  assert.doesNotMatch(pending.text, new RegExp(ids.listing_a));
  const queue = await call("GET", "/api/admin/issue-queue", { cookie: cookies.rm_none });
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.json.items, []);
  // And nothing with money.
  const money = await call("GET", "/api/admin/payouts", { cookie: cookies.rm_none });
  assert.equal(money.status, 403);
});

test("S0-5 with Kyoto granted the approval stamps and waits; the owner's confirm publishes through the existing route", { skip }, async () => {
  const { providerServices } = await import("@shared/schema");
  // S0-4 granted Kyoto; grant again here so this test stands alone (a repeat grant is a no-op).
  await call("POST", `/api/admin/staff/${ids.rm_kyoto}/markets`, { cookie: cookies.owner, body: { marketSlug: "kyoto" } });

  const pending = await call("GET", "/api/admin/provider-services/pending", { cookie: cookies.rm_kyoto });
  assert.match(pending.text, new RegExp(ids.listing_a));

  const staff = await call("POST", `/api/admin/provider-services/${ids.listing_a}/approve`, { cookie: cookies.rm_kyoto });
  assert.equal(staff.status, 202, staff.text.slice(0, 200));
  assert.equal(staff.json.awaitingOwnerSignoff, true);
  let [row] = await db!.select().from(providerServices).where(eq(providerServices.id, ids.listing_a));
  assert.equal(row.approvalStatus, "submitted", "a staff approval does not publish");
  assert.equal(row.staffApprovedBy, ids.rm_kyoto);

  const again = await call("POST", `/api/admin/provider-services/${ids.listing_a}/approve`, { cookie: cookies.rm_kyoto });
  assert.equal(again.status, 409, "a second staff approval is not a second stamp");

  const queue = await call("GET", "/api/admin/owner-signoff", { cookie: cookies.owner });
  assert.equal(queue.status, 200);
  assert.ok((queue.json.items as any[]).some((i) => i.id === ids.listing_a && i.kind === "listing" && i.market === "kyoto"));

  const owner = await call("POST", `/api/admin/provider-services/${ids.listing_a}/approve`, { cookie: cookies.owner });
  assert.equal(owner.status, 200, owner.text.slice(0, 200));
  [row] = await db!.select().from(providerServices).where(eq(providerServices.id, ids.listing_a));
  assert.equal(row.approvalStatus, "approved");

  // A platform_admin's approval waits too under the seeded `all_staff`.
  const pa = await call("POST", `/api/admin/provider-services/${ids.listing_b}/approve`, { cookie: cookies.platform_admin });
  assert.equal(pa.status, 202, pa.text.slice(0, 200));
});
