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
import { renderOnepagerPdf } from "../services/demand-onepager.render";
import type { OnepagerModel } from "../services/demand-onepager.compute";

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
  methodology:
    "Based on 27 planned trips (strict count: real travelers, synthetic and authoring trips excluded) · May–Nov · updated monthly. Demand shown only where the sample clears our honesty floor (at least 10 planned trips per market). Stay demand is a trip and night count only — never a dollar figure.",
  monthRange: "May–Nov",
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
