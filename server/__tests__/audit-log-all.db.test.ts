/**
 * Ops gap 12 — the audit log, all actions (fix queue row 112; ledger `2026-10-22-audit-log-all-actions`).
 *
 *   AL1 the query parse: defaults, the page-size cap, a malformed date or page refused by name
 *   AL2 paging: newest first, a page never longer than asked, the total the same on every page
 *   AL3 each filter: action, actor by id, actor by email (any case), resource type + id, an inclusive date range
 *   AL4 admin only: the route carries the role-changes route's own guards; a signed-out caller is 401, a non-admin 403
 *
 * Synthetic rows only, keyed per run; assertions read ids and counts and never print a row.
 * DISPOSABLE DB ONLY.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? process.env.STRIPE_SECRET_KEY : "sk_test_dummy";

const { db, pool } = await import("../db");
const { sql } = await import("drizzle-orm");
const { AUDIT_LOG_PAGE_MAX, listAuditLogs, parseAuditLogQuery } = await import("../services/audit-log-query");
const adminRouter = (await import("../routes/admin.routes")).default;

const RUN = crypto.randomUUID().slice(0, 8);
const id = (s: string) => `al-${RUN}-${s}`;
const ADMIN_A = id("admin-a");
const ADMIN_B = id("admin-b");
const MEMBER = id("member");
const TYPE = `al_${RUN}`;
const OTHER_TYPE = `al_${RUN}_x`;
// [row, actor, action, resourceType, resourceId, createdAt]
const ROWS: Array<[string, string, string, string, string, string]> = [
  [id("r1"), ADMIN_A, `approve_${RUN}`, TYPE, "res-1", "2027-01-01T09:00:00Z"],
  [id("r2"), ADMIN_A, `reject_${RUN}`, TYPE, "res-2", "2027-01-02T09:00:00Z"],
  [id("r3"), ADMIN_B, `approve_${RUN}`, TYPE, "res-1", "2027-01-03T09:00:00Z"],
  [id("r4"), ADMIN_B, `refund_${RUN}`, OTHER_TYPE, "res-9", "2027-01-04T23:59:00Z"],
  [id("r5"), ADMIN_A, `approve_${RUN}`, TYPE, "res-3", "2027-01-05T00:00:00Z"],
];
const MINE = new Set(ROWS.map((r) => r[0]));
const ids = (logs: any[]) => logs.map((l) => String(l.id)).filter((x) => MINE.has(x));

before(async () => {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://localhost").hostname.toLowerCase();
  if (process.env.JOURNEY_DB_WRITES_OK !== "1" && !["localhost", "127.0.0.1", "::1", ""].includes(host)) throw new Error("refusing a non-disposable database");
  for (const [u, role] of [[ADMIN_A, "admin"], [ADMIN_B, "admin"], [MEMBER, "user"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, role) VALUES (${u}, ${`${u}@t.test`}, ${role})`);
  }
  for (const [rid, actor, action, rtype, resId, at] of ROWS) {
    await db.execute(sql`INSERT INTO access_audit_logs (id, actor_id, actor_role, action, resource_type, resource_id, metadata, created_at)
      VALUES (${rid}, ${actor}, 'admin', ${action}, ${rtype}, ${resId}, '{}'::jsonb, ${at}::timestamptz)`);
  }
});

after(async () => {
  await db.execute(sql`DELETE FROM access_audit_logs WHERE id LIKE ${`al-${RUN}-%`}`);
  await db.execute(sql`DELETE FROM users WHERE id LIKE ${`al-${RUN}-%`}`);
  await pool.end();
});

const run = (q: Record<string, unknown>) => {
  const p = parseAuditLogQuery(q);
  assert.equal(p.ok, true);
  return listAuditLogs((p as any).filters);
};

test("AL1 the parse: defaults, the cap, refusals", () => {
  assert.deepEqual(parseAuditLogQuery({}), { ok: true, filters: { limit: 50, offset: 0 } });
  const capped = parseAuditLogQuery({ limit: "5000" });
  assert.equal(capped.ok && capped.filters.limit, AUDIT_LOG_PAGE_MAX);
  assert.deepEqual(parseAuditLogQuery({ dateFrom: "2027-13-40" }), { ok: false, reason: "bad_date_from" });
  assert.deepEqual(parseAuditLogQuery({ dateTo: "yesterday" }), { ok: false, reason: "bad_date_to" });
  assert.deepEqual(parseAuditLogQuery({ limit: "0" }), { ok: false, reason: "bad_limit" });
  assert.deepEqual(parseAuditLogQuery({ offset: "-1" }), { ok: false, reason: "bad_offset" });
  const blank = parseAuditLogQuery({ action: "  ", actor: "" });
  assert.deepEqual(blank, { ok: true, filters: { limit: 50, offset: 0 } }, "a blank filter is no filter");
});

test("AL2 paging: newest first, pages of the size asked, one total", async () => {
  const p1 = await run({ resourceType: TYPE, limit: "2", offset: "0" });
  const p2 = await run({ resourceType: TYPE, limit: "2", offset: "2" });
  const p3 = await run({ resourceType: TYPE, limit: "2", offset: "4" });
  assert.deepEqual([p1.total, p2.total, p3.total], [4, 4, 4]);
  assert.deepEqual(ids(p1.logs), [id("r5"), id("r3")]);
  assert.deepEqual(ids(p2.logs), [id("r2"), id("r1")]);
  assert.equal(p3.logs.length, 0);
  assert.ok(p1.actions.includes(`refund_${RUN}`), "the action choices list every logged action");
  assert.ok(p1.resourceTypes.includes(OTHER_TYPE));
});

test("AL3 each filter", async () => {
  assert.deepEqual(ids((await run({ action: `approve_${RUN}` })).logs), [id("r5"), id("r3"), id("r1")]);
  assert.deepEqual(ids((await run({ actor: ADMIN_B })).logs), [id("r4"), id("r3")]);
  assert.deepEqual(ids((await run({ actor: `${ADMIN_B}@T.TEST` })).logs), [id("r4"), id("r3")], "an email matches in any case");
  assert.deepEqual(ids((await run({ resourceType: TYPE, resourceId: "res-1" })).logs), [id("r3"), id("r1")]);
  const range = await run({ dateFrom: "2027-01-02", dateTo: "2027-01-04" });
  assert.deepEqual(ids(range.logs), [id("r4"), id("r3"), id("r2")], "both ends inclusive, to the end of the last day");
  const combined = await run({ action: `approve_${RUN}`, actor: ADMIN_A, resourceType: TYPE });
  assert.deepEqual(ids(combined.logs), [id("r5"), id("r1")]);
  assert.equal(combined.total, 2);
});

function routeStack(path: string) {
  const layer = (adminRouter as any).stack.find((l: any) => l.route?.path === path && l.route?.methods?.get);
  assert.ok(layer, `GET ${path} is registered`);
  return layer.route.stack.map((s: any) => s.handle);
}

test("AL4 admin only: the role-changes guards; 401 signed out, 403 for a member", async () => {
  const all = routeStack("/api/admin/audit-logs/all");
  const roles = routeStack("/api/admin/audit-logs/role-changes");
  assert.equal(all.length, 3);
  assert.equal(all[0], roles[0], "isAuthenticated");
  assert.equal(all[1], roles[1], "requireAdminLocal");
  const guard = all[1];
  const call = async (user: string | null) => {
    let status = 0;
    let passed = false;
    const req: any = { isAuthenticated: () => !!user, user: user ? { claims: { sub: user } } : undefined };
    const res: any = { status(c: number) { status = c; return this; }, json() { return this; } };
    await guard(req, res, () => { passed = true; });
    return passed ? "next" : status;
  };
  assert.equal(await call(null), 401);
  assert.equal(await call(MEMBER), 403);
  assert.equal(await call(ADMIN_A), "next");
});
