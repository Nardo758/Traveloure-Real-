/**
 * Row 303a — the tile detail panel returns a fact only with a source and a checked-on date,
 * a research photo only with the rights tick, and a partner fact only inside the recorded
 * cache window.
 *
 * Pure. No database and no network.
 *
 * Run: npx tsx --test shared/__tests__/tile-detail-panel.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARTNER_PANEL_TERMS,
  TILE_PANEL_SECTION_HEADINGS,
  admitPanelFact,
  assembleTileDetailPanel,
  isTilePanelId,
  withinPartnerCacheWindow,
  type PanelFactInput,
  type PanelPhotoInput,
  type PartnerPanelTerms,
} from "../tile-detail-panel";

const NOW = new Date("2026-10-31T12:00:00.000Z");
const DAY = 86_400_000;

const sourced = (over: Partial<PanelFactInput> = {}): PanelFactInput => ({
  subjectKind: "place",
  section: "what_it_is",
  value: "A stone path beside the canal",
  source: "Kyoto City Tourism",
  sourceUrl: "https://example.com/path",
  checkedOn: "2026-10-20",
  reviewedAt: NOW,
  fetchedAt: null,
  attribution: null,
  ...over,
});

const photo = (over: Partial<PanelPhotoInput> = {}): PanelPhotoInput => ({
  subjectKind: "place",
  imageUrl: "https://example.com/path.jpg",
  credit: "Example Photographer",
  sourceUrl: "https://example.com/file",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  photoRightsTicked: true,
  fetchedAt: null,
  attribution: null,
  ...over,
});

const partner = (over: Partial<PanelFactInput> = {}): PanelFactInput => ({
  subjectKind: "viator",
  section: "what_it_is",
  value: "A morning walk",
  source: "Viator",
  sourceUrl: "https://www.viator.com/tours/Kyoto/walk",
  checkedOn: "2026-10-31",
  reviewedAt: null,
  fetchedAt: NOW,
  attribution: "Viator",
  ...over,
});

function panel(facts: PanelFactInput[], photos: PanelPhotoInput[] = [], now = NOW) {
  return assembleTileDetailPanel({ tileId: "gem-1", facts, photos, now });
}

test("an unsourced fact is not returned", () => {
  const missingSource = sourced({ source: "  " });
  const missingDate = sourced({ checkedOn: null });
  const missingUrl = sourced({ sourceUrl: null });
  const httpUrl = sourced({ sourceUrl: "http://example.com/path" });
  const complete = sourced();
  assert.equal(admitPanelFact(missingSource), null);
  assert.equal(admitPanelFact(missingDate), null);
  assert.equal(admitPanelFact(missingUrl), null);
  const out = panel([missingSource, missingDate, missingUrl, httpUrl, complete]);
  assert.deepEqual(out.facts.what_it_is, [{
    value: "A stone path beside the canal",
    source: "Kyoto City Tourism",
    sourceUrl: "https://example.com/path",
    checkedOn: "2026-10-20",
  }]);
  assert.equal(JSON.stringify(out).includes("http://example.com"), false);
});

test("a research fact is not returned until it has been reviewed", () => {
  const out = panel([
    sourced({ value: "unreviewed", reviewedAt: null }),
    sourced({ value: "reviewed" }),
  ]);
  assert.deepEqual(out.facts.what_it_is?.map((f) => f.value), ["reviewed"]);
});

test("a photo without the rights tick is not returned", () => {
  const out = panel([], [
    photo({ imageUrl: "https://example.com/unticked.jpg", photoRightsTicked: false }),
    photo({ imageUrl: "https://example.com/unset.jpg", photoRightsTicked: null }),
    photo({ imageUrl: "https://example.com/nocredit.jpg", credit: "  " }),
    photo({ imageUrl: "https://example.com/ticked.jpg" }),
  ]);
  assert.deepEqual(out.photos.map((p) => p.imageUrl), ["https://example.com/ticked.jpg"]);
  assert.equal(out.photos[0].credit, "Example Photographer");
  assert.equal(out.photos[0].licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
});

test("a partner fact respects the cache window", () => {
  assert.equal(PARTNER_PANEL_TERMS.viator.cacheMs, 0);
  assert.equal(PARTNER_PANEL_TERMS.klook.cacheMs, null);
  const fresh = panel([partner({ value: "fresh", fetchedAt: NOW })]);
  assert.equal(fresh.facts.what_it_is?.[0].value, "fresh");
  assert.equal(fresh.facts.what_it_is?.[0].source, "Viator");
  const stale = panel([partner({ value: "stale", fetchedAt: new Date(NOW.getTime() - 1) })]);
  assert.equal(stale.facts.what_it_is, undefined);
  const week: Record<"viator" | "klook", PartnerPanelTerms> = {
    viator: { ...PARTNER_PANEL_TERMS.viator, cacheMs: 7 * DAY },
    klook: PARTNER_PANEL_TERMS.klook,
  };
  const inside = assembleTileDetailPanel(
    { tileId: "v-1", facts: [partner({ value: "inside", fetchedAt: new Date(NOW.getTime() - 6 * DAY) })], photos: [], now: NOW },
    week,
  );
  const outside = assembleTileDetailPanel(
    { tileId: "v-1", facts: [partner({ value: "outside", fetchedAt: new Date(NOW.getTime() - 8 * DAY) })], photos: [], now: NOW },
    week,
  );
  assert.equal(inside.facts.what_it_is?.[0].value, "inside");
  assert.equal(outside.facts.what_it_is, undefined);
  assert.equal(withinPartnerCacheWindow(new Date(NOW.getTime() - 6 * DAY), NOW, 7 * DAY), true);
  assert.equal(withinPartnerCacheWindow(new Date(NOW.getTime() - 8 * DAY), NOW, 7 * DAY), false);
});

test("a partner fact outside the recorded terms is not returned", () => {
  const out = panel([
    partner({ subjectKind: "klook", source: "Klook", attribution: "Klook", value: "klook-stored" }),
    partner({ subjectKind: "getyourguide", source: "GetYourGuide", attribution: "GetYourGuide", value: "gyg" }),
    partner({ attribution: "Someone else", value: "wrong-attribution" }),
    partner({ section: "expert_tip", value: "partner tip" }),
    partner({ source: "A blog", value: "source-mismatch" }),
  ]);
  assert.deepEqual(out.facts, {});
});

test("a partner photo follows the cache window and does not use the research tick", () => {
  const shown = panel([], [photo({
    subjectKind: "viator",
    imageUrl: "https://example.com/viator.jpg",
    credit: "Viator",
    sourceUrl: "https://www.viator.com/tours/Kyoto/walk",
    licenseUrl: null,
    photoRightsTicked: false,
    fetchedAt: NOW,
    attribution: "Viator",
  })]);
  assert.equal(shown.photos.length, 1);
  const stale = panel([], [photo({
    subjectKind: "viator",
    credit: "Viator",
    photoRightsTicked: true,
    fetchedAt: new Date(NOW.getTime() - 1),
    attribution: "Viator",
  })]);
  assert.deepEqual(stale.photos, []);
});

test("a feed tile id is accepted and a path segment is not", () => {
  assert.equal(isTilePanelId("gem-3f1a0c2e-1111-4222-8333-444444444444"), true);
  assert.equal(isTilePanelId("event-0.42"), true);
  assert.equal(isTilePanelId("viator-5766P10"), true);
  assert.equal(isTilePanelId("_nope"), false);
  assert.equal(isTilePanelId("../x"), false);
  assert.equal(isTilePanelId("a/b"), false);
  assert.equal(isTilePanelId(""), false);
});

test("headings are the held map and the module carries no migration approval sentence", () => {
  assert.deepEqual(TILE_PANEL_SECTION_HEADINGS, {
    what_it_is: "What it is",
    where: "Where",
    when: "When",
    cost: "Cost",
    expert_tip: "Expert tips",
  });
  const dir = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(dir, "../tile-detail-panel.ts"), "utf8");
  const held = readFileSync(join(dir, "../../server/services/tile-detail-panel.held-sql.ts"), "utf8");
  assert.doesNotMatch(src, /SQL approved/);
  assert.doesNotMatch(held, /SQL approved/);
  assert.match(held, /HELD for Leon's comment/);
  for (const phrase of ["best in", "high demand", "founding", "PayPal", "traveler fee", "queuing"]) {
    assert.equal(src.toLowerCase().includes(phrase), false, phrase);
  }
});
