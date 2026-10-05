/**
 * Slice B2 — Ready Made Trip share images, pure template mapping (ledger `2026-10-05-rmt-share-images`).
 *   I1 the cover carries the logo, the real photo, title, expert badge, day chips, the price line,
 *      "Get this trip", the /t/ link and the photo's credit — each from the data object, nothing else
 *   I2 an absent fact draws nothing: no photo ⇒ no image and no credit; no price ⇒ no price; not
 *      verified ⇒ never "verified"
 *   I3 never a Google photo: Google hosts are refused, a photo with no credit is not used
 *   I4 the map slide is a schematic (dashed lines, pins, numbers drawn as text), captioned with
 *      CONFIRMED minutes only where a day has them; the normaliser stays inside the box
 *   I5 the Story's three proof lines are facts the listing carries
 *   I6 every format renders at its size (PNG IHDR), and the version moves only with what the image says
 *   I7 the cover-photo fetch is typed and bounded (JPEG/PNG only, Unsplash asked for JPEG)
 *
 * Run: npx tsx --test server/__tests__/ready-made-share-image.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/traveloure";
const svc = await import("../services/ready-made-share-image.service");
const dataSvc = await import("../services/ready-made-share-data.service");

const PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function sample(over: Record<string, unknown> = {}): any {
  return {
    title: "Kyoto, Slowly",
    market: "Kyoto",
    durationDays: 3,
    stopCount: 9,
    confirmedLegCount: 6,
    priceLine: "From $49 · fees included",
    expertName: "Aiko",
    localVerified: true,
    shareUrl: "traveloure.com/t/kyoto-slowly-7d3e2a105b",
    hero: { dataUri: PIXEL_PNG, credit: "Photo: Ann Lee / Unsplash" },
    dayChips: [{ dayNumber: 1, label: "Fushimi Inari" }, { dayNumber: 2, label: "Arashiyama" }, { dayNumber: 3, label: "Kinkaku-ji" }],
    map: [
      { dayNumber: 1, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.5 }], confirmedMinutes: 67 },
      { dayNumber: 2, points: [{ x: 0.6, y: 0.1 }, { x: 0.8, y: 0.2 }], confirmedMinutes: null },
      { dayNumber: 3, points: [{ x: 0.9, y: 0.9 }], confirmedMinutes: null },
    ],
    ...over,
  };
}

/** Every string and every img src in an element tree. */
function walk(el: any, texts: string[] = [], imgs: string[] = []): { texts: string[]; imgs: string[] } {
  if (el == null) return { texts, imgs };
  if (typeof el === "string") { texts.push(el); return { texts, imgs }; }
  if (Array.isArray(el)) { el.forEach((c) => walk(c, texts, imgs)); return { texts, imgs }; }
  if (el.type === "img") imgs.push(String(el.props?.src ?? ""));
  walk(el.props?.children, texts, imgs);
  return { texts, imgs };
}

describe("I1 the cover", () => {
  it("draws every field from the data object", () => {
    const { texts, imgs } = walk(svc.buildCover(sample()));
    for (const t of ["Kyoto, Slowly", "by Aiko · Local · verified in Kyoto", "DAY 1", "Fushimi Inari", "DAY 3", "From $49 · fees included", "Get this trip", "traveloure.com/t/kyoto-slowly-7d3e2a105b", "Photo: Ann Lee / Unsplash"]) {
      assert.ok(texts.includes(t), t);
    }
    assert.ok(imgs.includes(PIXEL_PNG), "the real photo");
    assert.ok(imgs.some((s) => s.startsWith("data:image/svg+xml")), "the logo");
    assert.equal(texts.filter((t) => t.includes("$")).length, 1, "the only price is the server's line");
  });
});

describe("I2 absent facts draw nothing", () => {
  it("no photo, no price, not verified", () => {
    for (const build of [svc.buildCover, svc.buildMapSlide, svc.buildStory, svc.buildOg]) {
      const { texts, imgs } = walk(build(sample({ hero: null, priceLine: null, localVerified: false })));
      assert.ok(!imgs.includes(PIXEL_PNG));
      assert.ok(!texts.some((t) => /Photo|photo:/.test(t)), "no credit without a photo");
      assert.ok(!texts.some((t) => t.includes("$")), "no price");
      assert.ok(!texts.some((t) => /verified/i.test(t)), "never verified when not");
    }
  });
});

describe("I3 never a Google photo", () => {
  it("refuses Google hosts, accepts the photo hosts the store uses", () => {
    for (const bad of ["https://lh3.googleusercontent.com/p/abc", "https://maps.googleapis.com/maps/api/place/photo?x=1", "https://places.googleapis.com/v1/x/media", "", null]) {
      assert.equal(svc.isAllowedHeroUrl(bad as any), false, String(bad));
    }
    for (const ok of ["https://images.unsplash.com/photo-1", "https://upload.wikimedia.org/a.jpg"]) assert.equal(svc.isAllowedHeroUrl(ok), true, ok);
  });
  it("a photo needs its credit", () => {
    assert.equal(svc.heroCreditLine({ photographer: "Ann Lee" }), "Photo: Ann Lee / Unsplash");
    assert.equal(svc.heroCreditLine({ photographer: "  " }), null);
    assert.equal(svc.heroCreditLine(null), null);
  });
});

describe("I4 the map slide", () => {
  it("is a captioned schematic", () => {
    const { texts, imgs } = walk(svc.buildMapSlide(sample()));
    assert.ok(texts.includes("Your route at a glance"));
    assert.ok(texts.includes("Day 1 · 3 stops · 67 min of confirmed travel"));
    assert.ok(texts.includes("Day 2 · 2 stops"), "no minutes claimed without confirmed legs");
    assert.ok(texts.includes("Schematic, not to scale · stops shown approximately"));
    const svgs = imgs.filter((s) => s.startsWith("data:image/svg+xml")).map((s) => Buffer.from(s.split(",")[1], "base64").toString());
    const route = svgs.find((s) => s.includes("<polyline"))!;
    assert.ok(route, "the schematic is drawn");
    assert.equal((route.match(/<polyline/g) ?? []).length, 2, "a line per day with ≥ 2 stops");
    assert.equal((route.match(/stroke-dasharray/g) ?? []).length, 2);
    assert.equal((route.match(/<circle/g) ?? []).length, 6);
    assert.equal(svc.schematicPinLabels(sample().map, 968, 760).length, 6);
  });
  it("the normaliser keeps every point in the box", () => {
    const norm = dataSvc.normaliseSchematic([
      { dayNumber: 1, lon: 135.77, lat: 34.96 }, { dayNumber: 1, lon: 135.78, lat: 35.0 }, { dayNumber: 2, lon: 135.67, lat: 35.02 },
    ], dataSvc.SCHEMATIC_ASPECT);
    for (const pts of norm.values()) for (const p of pts) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, JSON.stringify(p));
    assert.deepEqual(Array.from(norm.keys()).sort(), [1, 2]);
    assert.equal(dataSvc.normaliseSchematic([], 1).size, 0);
  });
});

describe("I5 the Story's proof lines", () => {
  it("are facts the listing carries", () => {
    assert.deepEqual(svc.storyProofLines(sample()), ["3 days · 9 stops in Kyoto", "6 travel times confirmed by Aiko", "Built by Aiko, a verified local"]);
    assert.deepEqual(svc.storyProofLines(sample({ confirmedLegCount: 0, localVerified: false, durationDays: 1, stopCount: 1 })), ["1 day · 1 stop in Kyoto", "Built by Aiko, a Traveloure expert"]);
  });
});

describe("I6 sizes and version", () => {
  it("every format renders at its size", async () => {
    for (const f of svc.READY_MADE_SHARE_FORMATS) {
      const png = await svc.renderReadyMadeShareImage(f, sample());
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [svc.READY_MADE_SHARE_SIZES[f].width, svc.READY_MADE_SHARE_SIZES[f].height], f);
    }
    assert.deepEqual(svc.READY_MADE_SHARE_SIZES, { cover: { width: 1080, height: 1350 }, map: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 }, og: { width: 1200, height: 630 } });
  });
  it("the version moves with what the image says", () => {
    const base = { data: (({ hero, ...rest }) => rest)(sample()), heroUrl: "https://images.unsplash.com/p", heroCredit: "Photo: A / Unsplash" };
    const v = dataSvc.shareVersion(base);
    assert.equal(dataSvc.shareVersion({ ...base }), v);
    assert.notEqual(dataSvc.shareVersion({ ...base, data: { ...base.data, title: "Kyoto, Faster" } }), v);
    assert.notEqual(dataSvc.shareVersion({ ...base, data: { ...base.data, map: [] } }), v);
    assert.notEqual(dataSvc.shareVersion({ ...base, heroUrl: "https://images.unsplash.com/q" }), v);
  });
});

describe("I7 the cover-photo fetch", () => {
  it("asks Unsplash for a JPEG and accepts only JPEG/PNG", async () => {
    assert.match(dataSvc.heroFetchUrl("https://images.unsplash.com/photo-1?ixid=x"), /fm=jpg/);
    assert.equal(dataSvc.heroFetchUrl("https://upload.wikimedia.org/a.jpg"), "https://upload.wikimedia.org/a.jpg");
    dataSvc._clearReadyMadeShareCaches();
    const fake = (type: string, ok = true) => (async () => new Response(Buffer.from("abc"), { status: ok ? 200 : 404, headers: { "content-type": type } })) as any;
    assert.equal(await dataSvc.fetchHeroDataUri("https://images.unsplash.com/a", fake("image/webp")), null);
    assert.equal(await dataSvc.fetchHeroDataUri("https://images.unsplash.com/b", fake("image/jpeg", false)), null);
    assert.equal(await dataSvc.fetchHeroDataUri("https://images.unsplash.com/c", fake("image/jpeg")), `data:image/jpeg;base64,${Buffer.from("abc").toString("base64")}`);
    let called = false;
    assert.equal(await dataSvc.fetchHeroDataUri("https://lh3.googleusercontent.com/x", (async () => { called = true; }) as any), null);
    assert.equal(called, false, "a Google photo is never even fetched");
  });
});
