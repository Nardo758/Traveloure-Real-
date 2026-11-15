/**
 * QA round 4 R4-10: the gem cards ask for a stock photo ONCE per (place, city) for the page's life.
 *
 *   D1 two cards for the same place at once: one request, the same answer
 *   D2 the same place later (a remount): no request
 *   D3 another place, or the same name in another city: its own request
 *   D4 a failed request is not kept: the next mount asks again
 *   D5 the hook asks through the shared answer, never its own fetch
 *
 * Run: npx tsx --test client/src/hooks/__tests__/r4-stock-photo-dedupe.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { _resetStockPhotoAnswers, fetchStockPhoto } from "../use-gem-photo";

const credit = { name: "P", source: "Pexels", licenseUrl: "https://www.pexels.com/license/", link: "https://www.pexels.com/photo/1/" };
let calls: string[] = [];
const fetcher = (async (url: any) => {
  calls.push(String(url));
  return new Response(JSON.stringify({ photoUrl: "https://images.pexels.com/1.jpg", credit }), { status: 200 });
}) as typeof fetch;

beforeEach(() => {
  _resetStockPhotoAnswers();
  calls = [];
});

describe("QA round 4 R4-10 — one stock-photo request per place", () => {
  it("D1 two cards at once share one request", async () => {
    const [a, b] = await Promise.all([fetchStockPhoto("Kinkaku-ji", "Kyoto", fetcher), fetchStockPhoto("Kinkaku-ji", "Kyoto", fetcher)]);
    assert.equal(calls.length, 1);
    assert.deepEqual(a, b);
    assert.equal(a.photoUrl, "https://images.pexels.com/1.jpg");
    assert.deepEqual(a.credit, credit);
  });

  it("D2 a later mount for the same place sends nothing", async () => {
    await fetchStockPhoto("Kinkaku-ji", "Kyoto", fetcher);
    await fetchStockPhoto("Kinkaku-ji", "Kyoto", fetcher);
    assert.equal(calls.length, 1);
  });

  it("D3 another place, or another city, is its own request", async () => {
    await fetchStockPhoto("Kinkaku-ji", "Kyoto", fetcher);
    await fetchStockPhoto("Ginkaku-ji", "Kyoto", fetcher);
    await fetchStockPhoto("Kinkaku-ji", "Osaka", fetcher);
    assert.equal(calls.length, 3);
  });

  it("D4 a failed request is not kept", async () => {
    let fail = true;
    const flaky = (async (url: any) => {
      calls.push(String(url));
      if (fail) throw new Error("offline");
      return new Response(JSON.stringify({ photoUrl: null }), { status: 200 });
    }) as typeof fetch;
    await assert.rejects(fetchStockPhoto("Gion", "Kyoto", flaky));
    fail = false;
    assert.deepEqual(await fetchStockPhoto("Gion", "Kyoto", flaky), { photoUrl: null, credit: null });
    assert.equal(calls.length, 2);
  });

  it("D5 the hook reads the shared answer", () => {
    const src = fs.readFileSync("client/src/hooks/use-gem-photo.ts", "utf8");
    assert.match(src, /const answer = await fetchStockPhoto\(placeName, city\);/);
    assert.equal((src.match(/fetcher\(`\/api\/media\/place-photo/g) ?? []).length, 1, "one request site");
    assert.doesNotMatch(src, /[^r]fetch\(`\/api\/media\/place-photo/, "the hook sends no request of its own");
  });
});
