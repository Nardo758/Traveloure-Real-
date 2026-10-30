/**
 * Row 270 (Architect, Oct 28 and Oct 29, 2026; ledger `2026-10-29-reconciliation-run-now-post`): the
 * Stripe reconciliation run-now trigger is a POST. A GET that changes state is a bug: the detector's
 * narrow repair can promote a paid checkout. DB-backed (`reconciliation_runs`, `users`).
 *
 *   R1  anonymous POST ⇒ 401 and nothing runs.
 *   R2  a signed-in non-admin POST ⇒ 403 and nothing runs.
 *   R3  an admin POST runs the detector ONCE, recorded as one `reconciliation_runs` row triggered_by
 *       'manual' (skipped here: no Stripe key, so nothing reaches Stripe).
 *   R4  a GET on the path runs nothing: the router has no GET for it, so it falls through (404).
 *   R5  the admin page calls POST, and the mutation-auth manifest lists POST run-now (and no GET).
 *
 * Run: DATABASE_URL=… npx tsx --test --test-force-exit server/routes/__tests__/row270-reconciliation-run-now-post.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/traveloure";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) process.env.STRIPE_SECRET_KEY = "sk_test_row270_import_only";

const { sql } = await import("drizzle-orm");
const { db } = await import("../../db.js");
const { default: adminRouter } = await import("../admin.routes.js");

const PATH = "/api/admin/reconciliation/run-now";
const RUN = crypto.randomBytes(4).toString("hex");
const ADMIN = `r270-admin-${RUN}`;
const USER = `r270-user-${RUN}`;
const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);
const savedKeys = { live: process.env.STRIPE_SECRET_KEY, test: process.env.STRIPE_SECRET_KEY_TEST };
let since = new Date();

function assertDisposableDb(): void {
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* refuse below */
  }
  if (!DISPOSABLE_HOSTS.has(host)) throw new Error(`[row270] REFUSING to write fixtures to '${host}'.`);
}

async function call(userId: string | null, method: "GET" | "POST") {
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
    const res = await fetch(`http://127.0.0.1:${port}${PATH}`, { method, headers: { "content-type": "application/json" } });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function manualRuns(): Promise<{ status: string }[]> {
  const r = await db.execute(sql`
    SELECT status FROM reconciliation_runs
    WHERE triggered_by = 'manual' AND started_at >= ${since.toISOString()}
    ORDER BY started_at
  `);
  return (r.rows ?? []) as { status: string }[];
}

before(async () => {
  assertDisposableDb();
  await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role) VALUES
    (${ADMIN}, ${`${ADMIN}@t.test`}, 'Recon', 'Admin', 'admin'),
    (${USER}, ${`${USER}@t.test`}, 'Recon', 'User', 'user')`);
  // A run row's started_at comes from the database clock; take "since" from the same clock.
  const now = await db.execute(sql`SELECT NOW() AS now`);
  since = new Date((now.rows?.[0] as { now: string | Date }).now);
});

after(async () => {
  if (savedKeys.live === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = savedKeys.live;
  if (savedKeys.test === undefined) delete process.env.STRIPE_SECRET_KEY_TEST;
  else process.env.STRIPE_SECRET_KEY_TEST = savedKeys.test;
  await db.execute(sql`DELETE FROM reconciliation_runs WHERE triggered_by = 'manual' AND started_at >= ${since.toISOString()}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ADMIN}, ${USER})`);
});

test("R1: an anonymous POST is refused and runs nothing", async () => {
  const res = await call(null, "POST");
  assert.equal(res.status, 401, JSON.stringify(res.body));
  assert.deepEqual(await manualRuns(), []);
});

test("R2: a signed-in non-admin POST is refused and runs nothing", async () => {
  const res = await call(USER, "POST");
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.deepEqual(await manualRuns(), []);
});

test("R3: an admin POST runs the detector once, recorded triggered_by manual", async () => {
  // No Stripe key: the run is recorded as skipped and nothing reaches Stripe.
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY_TEST;
  const res = await call(ADMIN, "POST");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, "skipped");
  assert.match(String(res.body.note), /Skipped/);
  const runs = await manualRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "skipped");
});

test("R4: a GET on the path runs nothing", async () => {
  const before = (await manualRuns()).length;
  const res = await call(ADMIN, "GET");
  assert.equal(res.status, 404, JSON.stringify(res.body));
  assert.equal((await manualRuns()).length, before);
  const route = (adminRouter as any).stack.find((l: any) => l.route?.path === PATH);
  assert.ok(route, "the route is registered");
  assert.deepEqual(Object.keys(route.route.methods), ["post"]);
});

test("R5: the admin page calls POST, and the manifest lists POST run-now and no GET", () => {
  const page = fs.readFileSync("client/src/pages/admin/reconciliation.tsx", "utf8");
  assert.ok(page.includes(`apiRequest("POST", "${PATH}")`));
  assert.equal(page.includes(`apiRequest("GET", "${PATH}")`), false);
  const manifest = JSON.parse(fs.readFileSync("generated/security/mutation-auth-manifest.json", "utf8"));
  const rows = (manifest.mutations as { method: string; effectivePath: string }[]).filter((m) => m.effectivePath === PATH);
  assert.deepEqual(rows.map((m) => m.method), ["POST"]);
});
