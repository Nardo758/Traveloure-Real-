/**
 * Smoke 7 item 2 (ledger `2026-10-03-no-ward-pins`): the slip's 2 s plancard poll has its own
 * budget and never spends the general per-client limit; a 429 on the plan load is named as a
 * rate limit, never as "not found".
 *   P1  isPlancardRead matches only GET /trips/:id/plancard (relative to the /api mount)
 *   P2  200 plancard reads leave the general budget untouched; another route still gets its 100
 *   P3  the plancard budget itself refuses past its own cap (a runaway poll is still bounded)
 *   P4  planLoadErrorKind: "429: …" ⇒ rate_limited; 404 / anything else ⇒ unavailable
 *   P5  the slip page renders the rate-limit copy with a retry, and the not-found copy otherwise
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generalRateLimiter, isPlancardRead, plancardReadRateLimiter } from "../../infrastructure/rate-limiter";
import { PLAN_LOAD_RATE_LIMITED, planLoadErrorKind } from "../../../client/src/lib/plancard-refetch";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function run(mw: any, req: { method: string; path: string; ip: string }): number {
  let status = 200;
  const res: any = { setHeader() {}, status(s: number) { status = s; return { json() {} }; } };
  mw(req, res, () => {});
  return status;
}

test("P1: isPlancardRead", () => {
  assert.equal(isPlancardRead({ method: "GET", path: "/trips/abc/plancard" } as any), true);
  assert.equal(isPlancardRead({ method: "GET", path: "/trips/abc/plancard/" } as any), true);
  assert.equal(isPlancardRead({ method: "POST", path: "/trips/abc/plancard" } as any), false);
  assert.equal(isPlancardRead({ method: "GET", path: "/trips/abc" } as any), false);
  assert.equal(isPlancardRead({ method: "GET", path: "/trips/abc/plancard/x" } as any), false);
});

test("P2: plancard reads never spend the general budget", () => {
  const ip = "203.0.113.7";
  for (let i = 0; i < 150; i++) {
    assert.equal(run(generalRateLimiter, { method: "GET", path: "/trips/t1/plancard", ip }), 200);
  }
  for (let i = 0; i < 100; i++) {
    assert.equal(run(generalRateLimiter, { method: "GET", path: "/trips/t1", ip }), 200, `general read ${i}`);
  }
  assert.equal(run(generalRateLimiter, { method: "GET", path: "/trips/t1", ip }), 429);
});

test("P3: the plancard budget is bounded on its own", () => {
  const ip = "203.0.113.8";
  for (let i = 0; i < 180; i++) {
    assert.equal(run(plancardReadRateLimiter, { method: "GET", path: "/trips/t1/plancard", ip }), 200);
  }
  assert.equal(run(plancardReadRateLimiter, { method: "GET", path: "/trips/t1/plancard", ip }), 429);
  // Other routes pass straight through it.
  assert.equal(run(plancardReadRateLimiter, { method: "GET", path: "/trips/t1", ip }), 200);
});

test("P4: planLoadErrorKind", () => {
  assert.equal(planLoadErrorKind(new Error("429: Too Many Requests")), "rate_limited");
  assert.equal(planLoadErrorKind(new Error("404: Not found")), "unavailable");
  assert.equal(planLoadErrorKind(new Error("boom")), "unavailable");
  assert.equal(planLoadErrorKind(null), "unavailable");
  assert.equal(PLAN_LOAD_RATE_LIMITED, "Too many requests — give it a moment");
});

test("P5: the slip page names a rate limit and offers a retry", () => {
  const src = readFileSync(path.join(repo, "client/src/pages/slip-view.tsx"), "utf8");
  assert.match(src, /planLoadErrorKind\(error\)/);
  assert.match(src, /slip-load-rate-limited/);
  assert.match(src, /slip-load-retry/);
  assert.match(src, /PLAN_LOAD_RATE_LIMITED/);
  assert.match(src, /slip-load-unavailable/);
  const mount = readFileSync(path.join(repo, "server/index.ts"), "utf8");
  assert.match(mount, /app\.use\("\/api", plancardReadRateLimiter/);
});
