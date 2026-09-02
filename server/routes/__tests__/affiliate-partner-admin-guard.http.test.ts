/**
 * affiliate-partner-admin-guard.http.test.ts — the affiliate partner WRITES are admin-only.
 *
 * FINDING (security audit, as-of 4644af6): `POST /api/affiliate/partners`,
 * `PATCH|DELETE /api/affiliate/partners/:id` and `POST /api/affiliate/partners/:id/scrape` were
 * gated on `isAuthenticated` ALONE. Any authenticated account could rewrite a platform affiliate
 * partner's `commission_rate` — read by `affiliate.service.ts` `resolveCommission` as the
 * platform's affiliate commission, i.e. a §18 rate-bearing field — or its `affiliate_tracking_id` /
 * `website_url` (the outbound target), or delete the row. Their only client callers are the admin
 * page. This is the same shape §2 records for the world-writable `POST /api/admin/fee-config`.
 *
 * Fixed STRUCTURALLY: the four writes moved under `/api/admin`, which `app.use("/api/admin",
 * adminApiGuard)` covers by prefix with a fail-closed DB role lookup. §2 forbids re-introducing
 * per-endpoint opt-in, so an inline check would have rebuilt the pattern that leaked.
 *
 *   A1 the OLD ungated paths no longer exist on the router (runtime)
 *   A2 the four writes are registered under /api/admin (source contract)
 *   A3 the blanket guard is mounted BEFORE this router — which is what makes A2 sufficient
 *   A4 the public READS are unchanged (no collateral damage)
 *
 * A2/A3 are source contracts by the same reasoning as vendors-export.test.ts: "the full route
 * registration starts the real session store and database", so route-wiring assertions inspect the
 * source. A1 and A4 are real runtime assertions against the mounted router.
 *
 * RUN WITH `--test-force-exit`: importing content.routes.ts starts the TravelPulse scheduler at
 * module load, whose timer keeps the process alive after the assertions finish. No query is ever
 * issued here, so DATABASE_URL only has to be SET, not reachable.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import contentRoutes from "../content.routes";

const OLD_WRITE_PATHS: Array<[string, string]> = [
  ["POST", "/api/affiliate/partners"],
  ["PATCH", "/api/affiliate/partners/some-id"],
  ["DELETE", "/api/affiliate/partners/some-id"],
  ["POST", "/api/affiliate/partners/some-id/scrape"],
];

const UNMATCHED = 404;

async function withRouter<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use(contentRoutes);
  // Anything the router does not claim lands here — the router is mounted bare, exactly as it is
  // in server/routes.ts, so "unmatched" here means "unmatched in production too".
  app.use((_req, res) => { res.status(UNMATCHED).json({ unmatched: true }); });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("A1: the old ungated /api/affiliate/partners write paths are gone", async () => {
  await withRouter(async (base) => {
    for (const [method, path] of OLD_WRITE_PATHS) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ name: "x", websiteUrl: "http://x", category: "y", commissionRate: 0.01 }),
      });
      assert.equal(
        res.status,
        UNMATCHED,
        `${method} ${path} must no longer be served outside /api/admin (got ${res.status}) — an authenticated non-admin reaching this is the whole finding`,
      );
    }
  });
});

test("A2: the four writes are registered under /api/admin", () => {
  const src = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  for (const decl of [
    'router.post("/api/admin/affiliate/partners"',
    'router.patch("/api/admin/affiliate/partners/:id"',
    'router.delete("/api/admin/affiliate/partners/:id"',
    'router.post("/api/admin/affiliate/partners/:id/scrape"',
  ]) {
    assert.ok(src.includes(decl), `${decl} must be registered under the admin prefix`);
  }
  // And no write verb may creep back onto the unguarded prefix.
  assert.doesNotMatch(
    src,
    /router\.(post|patch|delete)\(\s*["'`]\/api\/affiliate\/partners/,
    "no affiliate-partner write may register outside /api/admin",
  );
});

test("A3: the blanket admin guard is mounted before this router — what makes A2 sufficient", () => {
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  const guardAt = routes.indexOf('app.use("/api/admin", adminApiGuard)');
  const routerAt = routes.indexOf("app.use(contentRoutes)");
  assert.ok(guardAt > -1, "the /api/admin blanket guard must exist (§2 default-deny)");
  assert.ok(routerAt > -1, "contentRoutes must be mounted");
  assert.ok(
    guardAt < routerAt,
    "the blanket guard must be registered BEFORE contentRoutes, or the moved routes are unguarded",
  );
  // The guard's role must come from the DB, never a request-supplied or session-cached value (§2).
  assert.match(
    routes.slice(guardAt - 2000, guardAt),
    /db\s*\n?\s*\.select\(\)\s*\n?\s*\.from\(users\)|from\(users\)/,
    "adminApiGuard must read the role from the database",
  );
});

test("A4: the public affiliate-partner READS are unchanged", () => {
  const src = fs.readFileSync("server/routes/content.routes.ts", "utf8");
  assert.ok(src.includes('router.get("/api/affiliate/partners"'), "the public list read must stay put");
  assert.ok(src.includes('router.get("/api/affiliate/partners/:id"'), "the public detail read must stay put");
});
