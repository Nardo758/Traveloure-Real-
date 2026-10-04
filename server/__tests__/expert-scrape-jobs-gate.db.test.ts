/**
 * R-bo — expert scrape jobs are gated (work plan L1-19; decision-maker ratified 2026-10-04).
 *
 *   G1  switch off ⇒ every scrape-jobs route answers 404, for an expert AND an admin; nothing queued
 *   G2  switch on ⇒ an expert is refused 403 on all three routes
 *   G3  switch on ⇒ an admin naming free URLs (`targetUrls`, `startUrl`, `query`) is refused 400
 *   G4  switch on ⇒ an admin naming a registry source is refused 400 `source_not_public_ok`, because
 *       `dmo_sources` carries no `public_ok` (the stated limit in `admitScrapeJobSource`); nothing queued
 *   G5  the runner re-checks the switch: a job queued earlier is failed, never run, once it is off
 *   P1  the pure decisions (`scrapeJobsAccess`, `admitScrapeJobSource`)
 *
 * NEGATIVE SPACE (§18d): no proof here shows an admin job SUCCEEDING, because no source can pass the
 * R-bo source rule today (see `admitScrapeJobSource`). P1 proves the admission would pass for a source
 * that states `publicOk: true, transport: false`; wiring a real registry to that is a separate ruling.
 *
 * DISPOSABLE DB ONLY. Run solo:
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:5432/traveloure npx tsx --test server/__tests__/expert-scrape-jobs-gate.db.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { db } from "../db";
import expertWorkspaceRoutes from "../routes/expert-workspace.routes";
import { scrapeJobsAccess, admitScrapeJobSource } from "../config/expert-scrape-jobs.config";

const RUN = crypto.randomUUID().slice(0, 8);
const ids = {
  expert: `rbo-${RUN}-expert`,
  admin: `rbo-${RUN}-admin`,
  source: `rbo-${RUN}-source`,
  job: `rbo-${RUN}-job`,
};
const MARKET = `rbo-market-${RUN}`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);
function assertDisposableDb(): void {
  if (process.env.JOURNEY_DB_WRITES_OK === "1") return;
  let host = "<none>";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    /* fall through to refusal */
  }
  if (!DISPOSABLE_HOSTS.has(host)) {
    throw new Error(`[expert-scrape-jobs-gate] REFUSING to write fixtures to '${host}'. Opt in with JOURNEY_DB_WRITES_OK=1.`);
  }
}

async function call(userId: string, method: "GET" | "POST", url: string, body?: unknown, enabled = false) {
  const prev = process.env.EXPERT_SCRAPE_JOBS_ENABLED;
  if (enabled) process.env.EXPERT_SCRAPE_JOBS_ENABLED = "1";
  else delete process.env.EXPERT_SCRAPE_JOBS_ENABLED;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { claims: { sub: userId } };
    (req as any).isAuthenticated = () => true;
    next();
  });
  app.use("/api/expert-workspace", expertWorkspaceRoutes);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (prev === undefined) delete process.env.EXPERT_SCRAPE_JOBS_ENABLED;
    else process.env.EXPERT_SCRAPE_JOBS_ENABLED = prev;
  }
}

async function jobsForMarket(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM dmo_scrape_jobs WHERE market = ${MARKET}`);
  return (r.rows[0] as any).n;
}

before(async () => {
  assertDisposableDb();
  for (const [id, role] of [[ids.expert, "local_expert"], [ids.admin, "admin"]] as const) {
    await db.execute(sql`INSERT INTO users (id, email, first_name, last_name, role)
      VALUES (${id}, ${`${id}@t.test`}, 'RBO', ${role}, ${role})`);
  }
  await db.execute(sql`INSERT INTO dmo_sources (id, name, domain, market, market_region)
    VALUES (${ids.source}, 'RBO source', ${`rbo-${RUN}.example`}, ${MARKET}, 'apac')`);
});

after(async () => {
  await db.execute(sql`DELETE FROM dmo_scrape_jobs WHERE market = ${MARKET}`);
  await db.execute(sql`DELETE FROM dmo_sources WHERE id = ${ids.source}`);
  await db.execute(sql`DELETE FROM users WHERE id IN (${ids.expert}, ${ids.admin})`);
});

const ROUTES: Array<["GET" | "POST", string, unknown?]> = [
  ["POST", "/api/expert-workspace/scrape-jobs", { market: MARKET, startUrl: "https://example.com/" }],
  ["GET", "/api/expert-workspace/scrape-jobs"],
  ["GET", `/api/expert-workspace/scrape-jobs/${ids.job}`],
];

test("G1: switch off ⇒ 404 for an expert and an admin on every route; nothing queued", async () => {
  for (const who of [ids.expert, ids.admin]) {
    for (const [method, url, body] of ROUTES) {
      const r = await call(who, method, url, body, false);
      assert.equal(r.status, 404, `${who} ${method} ${url}`);
    }
  }
  assert.equal(await jobsForMarket(), 0);
});

test("G2: switch on ⇒ an expert is refused 403", async () => {
  for (const [method, url, body] of ROUTES) {
    const r = await call(ids.expert, method, url, body, true);
    assert.equal(r.status, 403, `${method} ${url}`);
  }
  assert.equal(await jobsForMarket(), 0);
});

test("G3: switch on ⇒ an admin naming free URLs is refused 400", async () => {
  for (const body of [
    { market: MARKET, startUrl: "https://example.com/" },
    { market: MARKET, targetUrls: ["https://example.com/a"] },
    { market: MARKET, query: "kyoto temples" },
    { market: MARKET, sourceId: ids.source, jobType: "batch_scrape" },
  ]) {
    const r = await call(ids.admin, "POST", "/api/expert-workspace/scrape-jobs", body, true);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body?.reason, "free_urls_refused");
  }
  assert.equal(await jobsForMarket(), 0);
});

test("G4: switch on ⇒ an admin naming a DMO registry source is refused (no public_ok exists there)", async () => {
  const known = await call(ids.admin, "POST", "/api/expert-workspace/scrape-jobs", { market: MARKET, sourceId: ids.source }, true);
  assert.equal(known.status, 400);
  assert.equal(known.body?.reason, "source_not_public_ok");
  const unknown = await call(ids.admin, "POST", "/api/expert-workspace/scrape-jobs", { market: MARKET, sourceId: `${ids.source}-nope` }, true);
  assert.equal(unknown.body?.reason, "source_not_found");
  const none = await call(ids.admin, "POST", "/api/expert-workspace/scrape-jobs", { market: MARKET }, true);
  assert.equal(none.body?.reason, "source_required");
  assert.equal(await jobsForMarket(), 0);
  // An admin may still read the (empty) job list with the switch on.
  const list = await call(ids.admin, "GET", `/api/expert-workspace/scrape-jobs?market=${MARKET}`, undefined, true);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, []);
});

test("G5: a job queued before the switch went off is failed by the runner, never run", async () => {
  await db.execute(sql`INSERT INTO dmo_scrape_jobs (id, source_id, job_type, market, start_url, status)
    VALUES (${ids.job}, ${ids.source}, 'crawl', ${MARKET}, 'https://example.com/', 'queued')`);
  delete process.env.EXPERT_SCRAPE_JOBS_ENABLED;
  const { executeScrapeJob } = await import("../routes/expert-workspace.routes");
  await executeScrapeJob(ids.job);
  const r = await db.execute(sql`SELECT status, error_message, started_at FROM dmo_scrape_jobs WHERE id = ${ids.job}`);
  const row = r.rows[0] as any;
  assert.equal(row.status, "failed");
  assert.equal(row.error_message, "expert_scrape_jobs_disabled");
  assert.equal(row.started_at, null, "never marked running");
});

test("P1: the pure decisions", () => {
  assert.deepEqual(scrapeJobsAccess(false, "admin"), { ok: false, status: 404, reason: "disabled" });
  assert.deepEqual(scrapeJobsAccess(true, "local_expert"), { ok: false, status: 403, reason: "admin_only" });
  assert.deepEqual(scrapeJobsAccess(true, null), { ok: false, status: 403, reason: "admin_only" });
  assert.deepEqual(scrapeJobsAccess(true, "admin"), { ok: true });
  assert.deepEqual(admitScrapeJobSource(null, false), { ok: false, reason: "source_required" });
  assert.deepEqual(admitScrapeJobSource(null, true), { ok: false, reason: "source_not_found" });
  assert.deepEqual(admitScrapeJobSource({ id: "s", publicOk: null, transport: null }, true), { ok: false, reason: "source_not_public_ok" });
  assert.deepEqual(admitScrapeJobSource({ id: "s", publicOk: true, transport: true }, true), { ok: false, reason: "source_not_public_ok" });
  assert.deepEqual(admitScrapeJobSource({ id: "s", publicOk: true, transport: false }, true), { ok: true });
});
