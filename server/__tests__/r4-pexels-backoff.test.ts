/**
 * QA round 4 R4-10 (Leon, Nov 13, 2026): Pexels 429 backoff and a per-query cache. No migration, no new string.
 *
 *   P1 `rateLimitWaitMs` reads Retry-After (seconds / HTTP date), then X-Ratelimit-Reset; null when neither names a wait
 *   P2 a 429 opens a window: no Pexels request until it ends; searches inside it answer [] with no call
 *   P3 the window honours Pexels's Retry-After; with no header it doubles from config and stops at the max
 *   P4 after the window the next search calls again; a success resets the backoff
 *   P5 a cached query makes no request (results and empty answers alike); a different query does
 *   P6 the same query asked twice at once makes one request
 *   P7 a non-429 failure is cached as [] for the empty TTL, then asked again
 *
 * Run: npx tsx --test server/__tests__/r4-pexels-backoff.test.ts
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PexelsService, rateLimitWaitMs } from "../services/pexels.service";
import {
  pexelsBackoffMaxMs,
  pexelsBackoffMinMs,
  pexelsCacheTtlMs,
  pexelsEmptyTtlMs,
} from "../config/pexels.config";

const realFetch = globalThis.fetch;
let calls: string[] = [];
let replies: Array<() => Response> = [];
let clock = 1_800_000_000_000;

const photo = (id: number) => ({
  id,
  width: 10,
  height: 10,
  url: `https://www.pexels.com/photo/${id}/`,
  photographer: "P",
  photographer_url: "https://www.pexels.com/@p",
  photographer_id: 1,
  avg_color: "#000",
  src: { original: "o", large2x: "l2", large: `https://images.pexels.com/${id}.jpg`, medium: "m", small: "s", portrait: "p", landscape: "l", tiny: "t" },
  alt: "a",
});
const ok = (n = 1) => () =>
  new Response(JSON.stringify({ total_results: n, page: 1, per_page: 1, photos: Array.from({ length: n }, (_, i) => photo(i + 1)) }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const limited = (headers: Record<string, string> = {}) => () => new Response("Too Many Requests", { status: 429, headers });
const broken = () => () => new Response("oops", { status: 500 });

function service() {
  return new PexelsService({ now: () => clock });
}

beforeEach(() => {
  process.env.PEXELS_API_KEY = "test-key";
  calls = [];
  replies = [];
  globalThis.fetch = (async (url: any) => {
    calls.push(String(url));
    const next = replies.shift();
    if (!next) throw new Error(`unexpected Pexels call ${url}`);
    return next();
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const headers = (h: Record<string, string>) => new Headers(h);

describe("QA round 4 R4-10 — Pexels backoff and cache", () => {
  it("P1 rateLimitWaitMs reads Pexels's own wait", () => {
    const now = 1_800_000_000_000;
    assert.equal(rateLimitWaitMs(headers({ "retry-after": "120" }), now), 120_000);
    assert.equal(rateLimitWaitMs(headers({ "retry-after": new Date(now + 30_000).toUTCString() }), now), 30_000);
    assert.equal(rateLimitWaitMs(headers({ "x-ratelimit-reset": String(now / 1000 + 600) }), now), 600_000);
    assert.equal(rateLimitWaitMs(headers({ "retry-after": "60", "x-ratelimit-reset": String(now / 1000 + 600) }), now), 60_000, "Retry-After first");
    assert.equal(rateLimitWaitMs(headers({}), now), null);
    assert.equal(rateLimitWaitMs(headers({ "x-ratelimit-reset": String(now / 1000 - 5) }), now), null, "a reset in the past names no wait");
    assert.equal(rateLimitWaitMs(headers({ "retry-after": "0" }), now), null);
  });

  it("P2 a 429 opens a window: no request inside it", async () => {
    const s = service();
    replies.push(limited({ "retry-after": "120" }));
    assert.deepEqual(await s.searchPhotos("Kinkaku-ji Kyoto"), []);
    assert.equal(calls.length, 1);
    assert.equal(s.isRateLimited(), true);
    for (const q of ["Kinkaku-ji Kyoto", "Ginkaku-ji Kyoto", "Nishiki Market Kyoto"]) assert.deepEqual(await s.searchPhotos(q), []);
    assert.deepEqual(await s.searchVideos("Kyoto travel"), []);
    assert.equal(calls.length, 1, "nothing sent while the wait runs");
  });

  it("P3 the window is Pexels's Retry-After; without one it doubles from config up to the max", async () => {
    const s = service();
    replies.push(limited({ "retry-after": "120" }));
    await s.searchPhotos("a");
    clock += 119_000;
    assert.equal(s.isRateLimited(), true);
    clock += 1_001;
    assert.equal(s.isRateLimited(), false, "the window ends when Pexels said");

    const t = service();
    let wait = pexelsBackoffMinMs();
    for (let i = 0; i < 12; i++) {
      replies.push(limited());
      await t.searchPhotos(`q${i}`);
      clock += wait - 1;
      assert.equal(t.isRateLimited(), true, `attempt ${i}: still waiting`);
      clock += 2;
      assert.equal(t.isRateLimited(), false, `attempt ${i}: the wait was ${wait}`);
      wait = Math.min(wait * 2, pexelsBackoffMaxMs());
    }
    assert.equal(wait, pexelsBackoffMaxMs(), "the backoff reached its cap");
  });

  it("P4 after the window the next search calls; a success resets the backoff", async () => {
    const s = service();
    replies.push(limited());
    await s.searchPhotos("a");
    clock += pexelsBackoffMinMs() + 1;
    replies.push(ok());
    assert.equal((await s.searchPhotos("b")).length, 1);
    assert.equal(calls.length, 2);
    replies.push(limited());
    await s.searchPhotos("c");
    clock += pexelsBackoffMinMs() + 1;
    assert.equal(s.isRateLimited(), false, "after a success the backoff starts again from the minimum");
  });

  it("P5 a cached query makes no request; a different one does", async () => {
    const s = service();
    replies.push(ok(2));
    const first = await s.searchPhotos("Fushimi Inari Kyoto", { perPage: 1 });
    const again = await s.searchPhotos("Fushimi Inari Kyoto", { perPage: 1 });
    assert.deepEqual(again, first);
    assert.equal(calls.length, 1);
    clock += pexelsCacheTtlMs() - 1;
    await s.searchPhotos("Fushimi Inari Kyoto", { perPage: 1 });
    assert.equal(calls.length, 1, "still inside the TTL");
    replies.push(ok(0));
    assert.deepEqual(await s.searchPhotos("Nowhere Kyoto", { perPage: 1 }), []);
    assert.deepEqual(await s.searchPhotos("Nowhere Kyoto", { perPage: 1 }), []);
    assert.equal(calls.length, 2, "an empty answer is cached too");
    clock += pexelsEmptyTtlMs() + 1;
    replies.push(ok(1));
    assert.equal((await s.searchPhotos("Nowhere Kyoto", { perPage: 1 })).length, 1, "asked again after the empty TTL");
    assert.equal(calls.length, 3);
    replies.push(ok(1));
    await s.searchPhotos("Fushimi Inari Kyoto", { perPage: 2 });
    assert.equal(calls.length, 4, "a different page size is a different query");
  });

  it("P6 the same query asked twice at once makes one request", async () => {
    const s = service();
    replies.push(ok(1));
    const [a, b] = await Promise.all([s.searchPhotos("Gion Kyoto"), s.searchPhotos("Gion Kyoto")]);
    assert.equal(calls.length, 1);
    assert.deepEqual(a, b);
  });

  it("P7 a non-429 failure is kept as [] for the empty TTL, then asked again", async () => {
    const s = service();
    replies.push(broken());
    assert.deepEqual(await s.searchPhotos("Pontocho Kyoto"), []);
    assert.deepEqual(await s.searchPhotos("Pontocho Kyoto"), []);
    assert.equal(calls.length, 1);
    assert.equal(s.isRateLimited(), false, "a 500 opens no rate-limit window");
    clock += pexelsEmptyTtlMs() + 1;
    replies.push(ok(1));
    assert.equal((await s.searchPhotos("Pontocho Kyoto")).length, 1);
  });
});
