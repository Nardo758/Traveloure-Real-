/**
 * Row 272 (Architect, Oct 28 and Oct 29, 2026; ledger `2026-10-29-affiliate-reconciliation-post`): the admin
 * affiliate reconciliation view is a POST. A GET that changes state is a bug: the view runs matchRecords,
 * which writes affiliate_earnings. DB-backed (`users`, `affiliate_partners`, `affiliate_earnings`).
 *
 * The partner report fetch is replaced in-process by one report row that matches the fixture earning, so
 * "the matching pass ran" is visible as that earning turning `matched`. No partner API is called.
 *
 *   A1  anonymous POST ⇒ 401 and the earning stays unmatched.
 *   A2  a signed-in non-admin POST ⇒ 403 and the earning stays unmatched.
 *   A3  an admin POST with an invalid period ⇒ 400 and the earning stays unmatched.
 *   A4  a GET on the path runs nothing: the router has no GET for it, so it falls through (404).
 *   A5  an admin POST returns the view and runs the matching pass (the earning is matched to the report).
 *   A6  the admin page calls POST, and the mutation-auth manifest lists POST and no GET.
 *
 * Run: DATABASE_URL=… npx tsx --test --test-force-exit server/routes/__tests__/row272-affiliate-reconciliation-post.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/traveloure";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) process.env.STRIPE_SECRET_KEY = "sk_test_row272_import_only";

const { sql } = await import("drizzle-orm");
const { db } = await import("../../db.js");
const { default: adminRouter } = await import("../admin.routes.js");
const { affiliateReconciliationService } = await import("../../services/affiliate-reconciliation.service.js");

const PATH = "/api/admin/affiliate/reconciliation";
const RUN = crypto.randomBytes(4).toString("hex");
const ADMIN = `r272-admin-${RUN}`;
const USER = `r272-user-${RUN}`;
const PARTNER_KEY = `r272partner${RUN}`;
const PARTNER_ID = `r272-partner-${RUN}`;
const EARNING_ID = `r272-earning-${RUN}`;
const REPORT_REF = `r272-ref-${RUN}`;
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
const originalFetch = affiliateReconciliationService.fetchExternalReports;

function assertDisposableDb(): void {
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[row272] REFUSING to write fixtures to '${host}'.`);
}

async function call(userId: string | null, method: "GET" | "POST", body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (userId) {
      (req as any).user = { claims: { sub: userId } };
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
  app.use(adminRouter);
  // Stands in for server/index.ts's notFoundHandler on /api: an unmatched /api path is a 404.
  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${PATH}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function earningStatus(): Promise<{ reconciliation_status: string; partner_reference_id: string | null }> {
  const r = await db.execute(sql`
    SELECT reconciliation_status, partner_reference_id FROM affiliate_earnings WHERE id = ${EARNING_ID}
  `);
  return r.rows?.[0] as { reconciliation_status: string; partner_reference_id: string | null };
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES
    (${ADMIN}, ${`${ADMIN}@t.test`}, 'Recon', 'Admin', 'admin'),
    (${USER}, ${`${USER}@t.test`}, 'Recon', 'User', 'user')`);
  await db.execute(sql`INSERT INTO affiliate_partners (id, name, website_url, category)
    VALUES (${PARTNER_ID}, ${PARTNER_KEY}, 'https://partner.example.test', 'tours')`);
  await db.execute(sql`INSERT INTO affiliate_earnings
    (id, partner_id, booking_amount, commission_rate, total_commission, platform_share, expert_share, reconciliation_status, created_at)
    VALUES (${EARNING_ID}, ${PARTNER_ID}, '1234.50', '10.00', '123.45', '123.45', '0.00', 'unmatched', NOW())`);
  const now = await db.execute(sql`SELECT NOW() AS now`);
  const reportedAt = new Date((now.rows?.[0] as { now: string | Date }).now).toISOString();
  // One partner report row that matches the fixture earning: same partner, same day, same amount, no sub_id.
  affiliateReconciliationService.fetchExternalReports = async () => [
    { partnerReferenceId: REPORT_REF, partner: PARTNER_KEY, amount: 123.45, currency: "USD", reportedAt, rawData: { row: 272 } },
  ];
});

after(async () => {
  affiliateReconciliationService.fetchExternalReports = originalFetch;
  await db.execute(sql`DELETE FROM affiliate_earnings WHERE id = ${EARNING_ID}`);
  await db.execute(sql`DELETE FROM affiliate_partners WHERE id = ${PARTNER_ID}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ADMIN}, ${USER})`);
});

test("A1: an anonymous POST is refused and matches nothing", async () => {
  const res = await call(null, "POST", { period: "this_month" });
  assert.equal(res.status, 401, JSON.stringify(res.body));
  assert.equal((await earningStatus()).reconciliation_status, "unmatched");
});

test("A2: a signed-in non-admin POST is refused and matches nothing", async () => {
  const res = await call(USER, "POST", { period: "this_month" });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal((await earningStatus()).reconciliation_status, "unmatched");
});

test("A3: an admin POST with an invalid period is refused and matches nothing", async () => {
  const res = await call(ADMIN, "POST", { period: "last_year" });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.match(String(res.body.message), /Invalid period/);
  assert.equal((await earningStatus()).reconciliation_status, "unmatched");
});

test("A4: a GET on the path runs nothing", async () => {
  const res = await call(ADMIN, "GET");
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal((await earningStatus()).reconciliation_status, "unmatched");
  const route = (adminRouter as any).stack.find((l: any) => l.route?.path === PATH);
  assert.ok(route, "the route is registered");
  assert.deepEqual(Object.keys(route.route.methods), ["post"]);
});

test("A5: an admin POST returns the view and runs the matching pass", async () => {
  const res = await call(ADMIN, "POST", { period: "this_month", partner: PARTNER_KEY });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.summary, "the view carries a summary");
  assert.ok(Array.isArray(res.body.matchedPairs));
  assert.ok(Array.isArray(res.body.internalEarnings));
  assert.ok(Array.isArray(res.body.unmatchedExternal));
  const after = await earningStatus();
  assert.equal(after.reconciliation_status, "matched");
  assert.equal(after.partner_reference_id, REPORT_REF);
  assert.ok(res.body.matchedPairs.some((p: any) => p.internal.id === EARNING_ID && p.external.partnerReferenceId === REPORT_REF));
});

test("A6: the admin page calls POST, and the manifest lists POST and no GET", () => {
  const page = fs.readFileSync("client/src/pages/admin/affiliate-partners.tsx", "utf8");
  assert.ok(page.includes(`apiRequest("POST", "${PATH}", body)`));
  assert.equal(page.includes(`fetch(\`${PATH}?`), false);
  const manifest = JSON.parse(fs.readFileSync("generated/security/mutation-auth-manifest.json", "utf8"));
  const rows = (manifest.mutations as { method: string; effectivePath: string }[]).filter((m) => m.effectivePath === PATH);
  assert.deepEqual(rows.map((m) => m.method), ["POST"]);
});
