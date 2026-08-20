/**
 * Partner Demand Phase 4 — PDF render smoke tests (no DB). Imports ONLY demand-onepager.render.ts,
 * which is DB-free, so this proves the pdfkit path produces a valid, content-stable PDF Buffer
 * without a database. The full pixel/visual conformance pass against the brief layout is lane item
 * 4.2/4.4 (the 3.7 gate pattern reused).
 *
 * Run: tsx --test server/__tests__/demand-onepager-render.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import {
  contextMapBoxForOptionalBlocks,
  renderOnepagerPdf,
  type OnepagerGeoInput,
} from "../services/demand-onepager.render";
import type { OnepagerModel } from "../services/demand-onepager.compute";

// 4.2c — a small synthetic geo (a few water/road polylines, a park ring, two neighborhoods; one
// neighborhood sits outside the bbox to exercise the off-frame skip). Orientation only, no demand.
const GEO: OnepagerGeoInput = {
  geography: {
    market: "kyoto",
    bbox: [135.72, 34.975, 135.8, 35.045],
    water: [
      [
        [135.73, 34.99],
        [135.75, 35.0],
        [135.77, 35.02],
      ],
    ],
    parks: [
      [
        [135.74, 34.99],
        [135.75, 34.995],
        [135.745, 35.0],
        [135.74, 34.99],
      ],
    ],
    roads: [
      [
        [135.73, 34.98],
        [135.78, 35.03],
      ],
    ],
  },
  neighborhoods: [
    { name: "Gion", lat: 35.003, lng: 135.775, radiusKm: 1.2 },
    { name: "Arashiyama", lat: 35.01, lng: 135.67, radiusKm: 1.5 }, // west of bbox → off-frame skip
  ],
};

const MODEL: OnepagerModel = {
  marketSlug: "kyoto",
  marketName: "Kyoto",
  variant: "property-led",
  hero: {
    variant: "property-led",
    headline: "27 trips · 135 nights",
    subline: "travelers seeking a stay in Kyoto with none anchored — add a property to capture them",
    strictCount: 27,
    stayTrips: 27,
    stayNights: 135,
    stayTravelers: 41,
  },
  windows: [
    { date: "2026-10-01", n: 20, trips: 20, nights: 90 },
    { date: "2026-08-22", n: 12, trips: 12, nights: 30 },
  ],
  windowsTotal: 2,
  eventSpotlight: null,
  trendBlock: null,
  gapPairing: null,
  methodology:
    "Based on 27 planned trips (strict count: real travelers, synthetic and authoring trips excluded) · May–Nov · updated monthly. Demand shown only where the sample clears our honesty floor (at least 10 planned trips per market). Stay demand is a trip and night count only — never a dollar figure.",
  monthRange: "May–Nov",
  windowCaption: null,
  window: { from: "2026-05-22", to: "2026-11-18" },
};

test("render: produces a valid, non-trivial PDF buffer", async () => {
  const pdf = await renderOnepagerPdf(MODEL);
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-", "starts with the PDF magic bytes");
  assert.ok(pdf.length > 1000, "a real page, not an empty document");
});

test("render: content-stable — same model renders identical bytes (CreationDate pinned)", async () => {
  const a = await renderOnepagerPdf(MODEL);
  const b = await renderOnepagerPdf(MODEL);
  assert.ok(a.equals(b), "byte-identical across renders of the same model");
});

test("render: DRAFT watermark is the default and toggles off with watermark:null", async () => {
  const draft = await renderOnepagerPdf(MODEL); // default DRAFT
  const clean = await renderOnepagerPdf(MODEL, { watermark: null });
  assert.ok(!draft.equals(clean), "the watermark changes the output");
  // The watermarked draft carries more drawing ops, so it is the larger document.
  assert.ok(draft.length > clean.length, "the DRAFT stamp adds content");
});

// 4.2c.3 — R34 lock: a locked model (trendBlock null, MODEL's default) renders NO trend content.
// A literal "Demand trend" text-layer grep is defeated by font subsetting (pdfkit encodes embedded-
// Inter text as glyph indices, not ASCII — empirically the string is absent from the buffer even
// when the header IS drawn), and no PDF text extractor is available. So this proves the intent by
// CONSTRUCTION: the trend header/sparkline is inside `if (model.trendBlock ...)`, so a null-trend
// render is strictly smaller than an identical populated-trend render, and unconditional trend
// content (a regression) would erase that difference.
test("R34 render: locked (trendBlock null) emits no trend content — strictly smaller than unlocked", async () => {
  const unlocked: OnepagerModel = {
    ...MODEL,
    trendBlock: {
      weeks: 12,
      points: [
        { weekStart: "2026-06-01", value: 20 },
        { weekStart: "2026-06-08", value: 30 },
        { weekStart: "2026-06-15", value: 44 },
      ],
    },
  };
  const lockedPdf = await renderOnepagerPdf(MODEL); // MODEL.trendBlock === null
  const unlockedPdf = await renderOnepagerPdf(unlocked);
  assert.equal(MODEL.trendBlock, null, "fixture is locked");
  assert.ok(lockedPdf.length < unlockedPdf.length, "the trend block adds content only when unlocked");
  assert.ok(lockedPdf.equals(await renderOnepagerPdf(MODEL)), "locked render is deterministic");
});

// ── 4.2c context map (R36/R37) ───────────────────────────────────────────────────────────────────
test("R37: no geo (or geography null) ⇒ panel omitted, byte-identical to no-geo render", async () => {
  const noGeo = await renderOnepagerPdf(MODEL); // no opts.geo
  const nullGeo = await renderOnepagerPdf(MODEL, { geo: { geography: null, neighborhoods: [] } });
  assert.ok(noGeo.equals(nullGeo), "geography null renders exactly as no geo — no placeholder frame");
});

test("R36: geography present ⇒ the panel adds content (strictly larger than no-geo)", async () => {
  const withGeo = await renderOnepagerPdf(MODEL, { geo: GEO });
  const noGeo = await renderOnepagerPdf(MODEL);
  assert.ok(withGeo.length > noGeo.length, "the map panel adds drawing content");
});

test("R36 determinism: same geo ⇒ byte-identical render", async () => {
  const a = await renderOnepagerPdf(MODEL, { geo: GEO });
  const b = await renderOnepagerPdf(MODEL, { geo: GEO });
  assert.ok(a.equals(b), "geo render is byte-stable");
});

test("R37 map layout: all-dark receives half-page prominence; all-lit returns to compact letterhead", () => {
  assert.deepEqual(contextMapBoxForOptionalBlocks(499, 0), { w: 250, h: 175 });
  assert.deepEqual(contextMapBoxForOptionalBlocks(499, 3), { w: 168, h: 118 });
});

// 4.2c.4 — no-demand-encoding by CONSTRUCTION: the panel function takes only geo shapes. Assert the
// drawContextMap signature references no model/summary/rollup type, so it cannot encode a metric.
test("R36 no-demand-encoding: the map's render path accepts no demand types", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "server/services/demand-onepager.render.ts"), "utf8");
  const sig = src.slice(src.indexOf("function drawContextMap"), src.indexOf("function drawContextMap") + 400);
  assert.doesNotMatch(sig, /OnepagerModel|summary|MarketSummary|rollup|demand/i, "panel signature is demand-blind");
});
