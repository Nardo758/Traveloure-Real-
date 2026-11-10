/**
 * discover-read-rate-limit.test.ts — TB2.6 (round 2, Leon Nov 10, 2026; PR A).
 *
 * THE DEFECT: `GET /api/discover` (the Kyoto feed's theme filter) had no budget of its own and sat under the general
 * 100/min per-IP limiter with every other read the location page makes, so a few theme presses answered 429 on a
 * public page. The fix is the `plancardReadRateLimiter` shape, one read over: the discover read is SKIPPED by the
 * general limiter and counted by `discoverReadRateLimiter` alone (60/min, sized against the client's 300 ms debounce).
 *
 *   D1 `isDiscoverRead` names exactly `GET /discover` (relative to the `/api` mount) — not the location payload,
 *      not the tile panel, not a POST
 *   D2 the general limiter skips the discover read; the discover limiter skips everything else
 *   D3 the discover limiter answers 429 on the 61st discover read in a minute, from its OWN key, and that spend
 *      leaves the general budget untouched
 *   D4 `server/index.ts` mounts the discover limiter on `/api` beside the plancard one
 *
 * STATED NEGATIVE SPACE (§18d): the limiters are executed in-process with a stubbed req/res; middleware ORDER in the
 * live app is proven only as the mount LINE (D4). The 60/min figure was sized from the debounce, not from a measured
 * per-load request count on staging (no staging credentials in the building session) — the number is a ceiling for
 * toggling, and a measured count may move it.
 *
 * Run: npx tsx --test server/__tests__/discover-read-rate-limit.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isDiscoverRead,
  isPlancardRead,
  discoverReadRateLimiter,
  generalRateLimiter,
  DISCOVER_READ_MAX_PER_MINUTE,
} from "../infrastructure/rate-limiter";

type Res = { status: number | null; headers: Record<string, string>; body: unknown };
function run(limiter: (req: any, res: any, next: () => void) => void, req: { method: string; path: string; ip: string }): { nexted: boolean; res: Res } {
  const res: Res = { status: null, headers: {}, body: null };
  let nexted = false;
  limiter(
    req,
    {
      setHeader: (k: string, v: string) => { res.headers[k] = v; },
      status: (s: number) => { res.status = s; return { json: (b: unknown) => { res.body = b; } }; },
    },
    () => { nexted = true; },
  );
  return { nexted, res };
}

test("D1 isDiscoverRead names exactly GET /discover", () => {
  assert.equal(isDiscoverRead({ method: "GET", path: "/discover" }), true);
  assert.equal(isDiscoverRead({ method: "GET", path: "/discover/" }), true);
  assert.equal(isDiscoverRead({ method: "GET", path: "/discover/location/Kyoto" }), false, "the location payload stays general");
  assert.equal(isDiscoverRead({ method: "GET", path: "/discover/tiles/x/panel" }), false, "the tile panel stays general");
  assert.equal(isDiscoverRead({ method: "POST", path: "/discover" }), false);
  assert.equal(isDiscoverRead({ method: "GET", path: "/trips/t1/plancard" }), false);
  assert.equal(isPlancardRead({ method: "GET", path: "/discover" }), false, "the two predicates are disjoint");
});

test("D2 + D3 the discover read spends its own budget and never the general one", () => {
  delete process.env.RATE_LIMIT_LOOPBACK_SKIP;
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`; // a fresh key per run
  const discover = { method: "GET", path: "/discover", ip };
  const other = { method: "GET", path: "/discover/location/Kyoto", ip };

  // The discover limiter ignores a non-discover read entirely (no header, straight through).
  const o = run(discoverReadRateLimiter, other);
  assert.equal(o.nexted, true);
  assert.equal(o.res.headers["X-RateLimit-Limit"], undefined);

  // The general limiter skips the discover read entirely.
  const g = run(generalRateLimiter, discover);
  assert.equal(g.nexted, true);
  assert.equal(g.res.headers["X-RateLimit-Limit"], undefined);

  // 60 discover reads pass on the discover budget; the 61st is a 429 from THAT limiter.
  for (let i = 1; i <= DISCOVER_READ_MAX_PER_MINUTE; i++) {
    const r = run(discoverReadRateLimiter, discover);
    assert.equal(r.nexted, true, `read ${i} passes`);
    assert.equal(r.res.headers["X-RateLimit-Limit"], String(DISCOVER_READ_MAX_PER_MINUTE));
  }
  const over = run(discoverReadRateLimiter, discover);
  assert.equal(over.nexted, false);
  assert.equal(over.res.status, 429);

  // That spend left the general budget untouched: the same IP's first general read is remaining = 99.
  const after = run(generalRateLimiter, other);
  assert.equal(after.nexted, true);
  assert.equal(after.res.headers["X-RateLimit-Remaining"], "99");
});

test("D4 server/index.ts mounts the discover limiter on /api beside the plancard one", () => {
  const index = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(index, /app\.use\("\/api", plancardReadRateLimiter as RequestHandler\);\s*\n\s*\/\/ TB2\.6[^\n]*\n\s*app\.use\("\/api", discoverReadRateLimiter as RequestHandler\);/);
});
