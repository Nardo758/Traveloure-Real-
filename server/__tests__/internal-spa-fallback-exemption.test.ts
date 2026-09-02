/**
 * internal-spa-fallback-exemption.test.ts — the SPA fallback must never answer /internal/*.
 *
 * Lane: internal-jobs-hardening, L3. The /internal/jobs/* MONEY runners are fired by an external
 * cron whose ONLY health signal is the response. Before this, an unmatched /internal path fell
 * through to `mountSpaFallback` and was answered with **HTTP 200 text/html** — so a renamed or
 * deleted job route reported green forever while the job never ran (§9: a dead endpoint returns
 * 200-HTML, NOT 404).
 *
 * E1/E2 prove the prefix falls THROUGH the fallback (so `app.use("/internal", notFoundHandler)`
 * can answer it), E3 proves a genuine SPA path is still served, and E4 pins that the boot-window
 * catch-all in `serveStatic` shares the same predicate — a cron pass can land while
 * `routesReady` is still false, and that window must not answer 200-HTML either.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
// `server/static.ts` resolves its dist path with `__dirname`, which exists in the CommonJS bundle
// the app actually ships (`dist/index.cjs`) but not under the ESM loader the test runner uses.
// Shim it so the REAL middleware can run: what is under test is the routing decision (which paths
// fall through), not path resolution — and the shimmed value is only ever used for a file the SPA
// cases never need to exist.
import express from "express";
import type { AddressInfo } from "node:net";
(globalThis as any).__dirname ??= path.resolve(process.cwd(), "server");
const { mountSpaFallback } = await import("../static");

const TERMINAL = 299; // "the request fell through the SPA fallback"

async function withApp<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  mountSpaFallback(app);
  // Anything the fallback lets through lands here. In the real app this is where
  // `app.use("/internal", notFoundHandler)` / the API 404 sit.
  app.use((_req, res) => { res.status(TERMINAL).json({ fellThrough: true }); });
  // The fallback's sendFile targets the built client, which is absent in a unit test. That ENOENT
  // is itself the signal "the fallback OWNED this request" — catch it so E3 can assert on a status
  // instead of an unhandled rejection.
  app.use((_err: any, _req: any, res: any, _next: any) => { res.status(500).json({ spaFileMissing: true }); });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("E1: /internal/* falls through the SPA fallback (never answered 200-HTML)", async () => {
  await withApp(async (base) => {
    for (const p of [
      "/internal/jobs/earnings-release",
      "/internal/jobs/nonexistent",
      "/internal/run-occasion-drafts",
      "/internal",
    ]) {
      const res = await fetch(`${base}${p}`, { method: "POST" });
      assert.equal(res.status, TERMINAL, `${p} must fall through the SPA fallback, got ${res.status}`);
    }
  });
});

test("E2: /api/* still falls through (no regression to the original exemption)", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/api/definitely-not-a-route`, { method: "POST" });
    assert.equal(res.status, TERMINAL);
  });
});

test("E3: a genuine SPA path is still owned by the fallback (not fallen through)", async () => {
  await withApp(async (base) => {
    const res = await fetch(`${base}/discover`);
    assert.notEqual(res.status, TERMINAL, "an ordinary client route must be served by the SPA fallback");
  });
});

test("E4: the boot-window catch-all shares the same predicate", () => {
  // A source contract (same shape as affiliate-booking-trip-link.contract.test.ts): serveStatic's
  // pre-routesReady catch-all must gate on isServerPath, not on a second hand-rolled
  // startsWith("/api") — two copies is how one of them drifts and the window reopens.
  // Repo-root-relative, matching affiliate-booking-trip-link.contract.test.ts.
  const src = fs.readFileSync("server/static.ts", "utf8");
  const serveStaticBody = src.slice(src.indexOf("export function serveStatic"), src.indexOf("export function mountSpaFallback"));
  assert.match(serveStaticBody, /isServerPath\(req\.originalUrl\)/,
    "serveStatic's boot-window catch-all must use the shared isServerPath predicate");
  assert.doesNotMatch(src, /startsWith\("\/api"\)/,
    "no hand-rolled /api-only exemption may remain in static.ts");
});
