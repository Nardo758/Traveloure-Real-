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
 *   D5 `GET /api/media/place-photo` (21 of a cold load's 38 calls, measured on prod 4ad1eaa) is skipped by the general
 *      limiter and counted by `placePhotoReadRateLimiter` alone — 300/min, at least fourteen cold loads of photos;
 *      the 301st is a 429 from that limiter and the general budget is untouched
 *
 * STATED NEGATIVE SPACE (§18d): the limiters are executed in-process with a stubbed req/res; middleware ORDER in the
 * live app is proven only as the mount LINE (D4). Sizing (Coding Bot, prod 4ad1eaa, Nov 10, 2026): a cold load of
 * /discover/location/Kyoto is 38 /api calls (36 at 375px) — place-photo ×21, the location payload ×1, 15 others ×1 —
 * and three quick theme presses are 2 GET /api/discover. 60/min for discover is a ceiling for toggling; 300/min for
 * place-photo is ~14 cold loads. The general bucket is no longer drained by either.
 *
 * Run: npx tsx --test server/__tests__/discover-read-rate-limit.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isDiscoverRead,
  isPlacePhotoRead,
  isPlancardRead,
  discoverReadRateLimiter,
  placePhotoReadRateLimiter,
  generalRateLimiter,
  DISCOVER_READ_MAX_PER_MINUTE,
  PLACE_PHOTO_READ_MAX_PER_MINUTE,
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

test("D5 the place-photo read spends its own 300/min budget and never the general one", () => {
  delete process.env.RATE_LIMIT_LOOPBACK_SKIP;
  assert.equal(isPlacePhotoRead({ method: "GET", path: "/media/place-photo" }), true);
  assert.equal(isPlacePhotoRead({ method: "GET", path: "/media/place-photo/" }), true);
  assert.equal(isPlacePhotoRead({ method: "POST", path: "/media/place-photo" }), false);
  assert.equal(isPlacePhotoRead({ method: "GET", path: "/media/other" }), false);
  assert.equal(isDiscoverRead({ method: "GET", path: "/media/place-photo" }), false, "disjoint from the discover read");
  const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
  const photo = { method: "GET", path: "/media/place-photo", ip };
  const other = { method: "GET", path: "/discover/location/Kyoto", ip };
  const g = run(generalRateLimiter, photo);
  assert.equal(g.nexted, true);
  assert.equal(g.res.headers["X-RateLimit-Limit"], undefined, "the general limiter skips it");
  assert.equal(run(placePhotoReadRateLimiter, other).res.headers["X-RateLimit-Limit"], undefined, "and the photo limiter ignores everything else");
  assert.equal(PLACE_PHOTO_READ_MAX_PER_MINUTE, 300);
  assert.ok(PLACE_PHOTO_READ_MAX_PER_MINUTE >= 21 * 10, "at least ten cold loads of photos per minute");
  for (let i = 1; i <= PLACE_PHOTO_READ_MAX_PER_MINUTE; i++) assert.equal(run(placePhotoReadRateLimiter, photo).nexted, true, `read ${i}`);
  const over = run(placePhotoReadRateLimiter, photo);
  assert.equal(over.nexted, false);
  assert.equal(over.res.status, 429);
  assert.equal(run(generalRateLimiter, other).res.headers["X-RateLimit-Remaining"], "99", "the general budget is untouched");
  const index = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert.match(index, /app\.use\("\/api", discoverReadRateLimiter as RequestHandler\);\s*\n\s*\/\/ TB2\.6[^\n]*\n\s*app\.use\("\/api", placePhotoReadRateLimiter as RequestHandler\);/);
});
