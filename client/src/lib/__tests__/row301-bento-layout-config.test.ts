/**
 * Row 301 (ledger `2026-10-31-bento-layout-config`): the bento's composition rules live in one
 * config (`BENTO_LAYOUT_CONFIG`) and the span math moved to `lib/bento-spans.ts` with no behaviour
 * change. Fixtures are synthetic.
 *
 *   L1 snapshot: tile order and spans for each fixture equal what the page produced before this change.
 *   L2 geometry: an expert anchor is 2x2, ready-mades are 2 wide, no tile is wider than 2, and the
 *      grid has no empty cell before its last row.
 *   L3 changing a config value changes the layout, with no other file edited.
 *   L4 the page renders the Wanted hero through the card family and keeps no inline card markup.
 *
 * Run: npx tsx --test client/src/lib/__tests__/row301-bento-layout-config.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildBentoTiles, type PlacedTile } from "../bento-spans";
import { BENTO_LAYOUT_CONFIG, type BentoLayoutConfig } from "../feed-composition-config";

// Synthetic Kyoto-shaped bento fixtures (no real people or providers).
const NB = { slug: "arashiyama", name: "Arashiyama" };
const gem = (id: string) => ({ kind: "loose-gem", id, data: { id, title: `Gem ${id}` } });
const expert = (id: string, role = "local-expert", nbs: string[] = []) => ({ kind: "expert", id, data: { id, role, neighborhoods: nbs, city: "Kyoto" } });
const pkg = (id: string) => ({ kind: "package", id, data: { id, title: `Ready-made ${id}` } });
const event = (id: string) => ({ kind: "event", id, data: { id, title: `Event ${id}` } });
const stub = (id: string) => ({ kind: "external-stub", id, data: { id, provider: "viator" } });
const vendor = (id: string) => ({ kind: "vendor-service", id, data: { id, title: `Service ${id}` } });
const wanted = (id: string) => ({ kind: "wanted-slot", id, data: { id, label: `Wanted ${id}` } });
const tag = (items: any[]) => items.map((item, order) => ({ item, order }));
const FIXTURES: Record<string, { tagged: any[]; floatAnchor: boolean; neighbourhood: any | null }> = {
  expertAnchor: { tagged: tag([gem("g1"), expert("e1", "local-expert", ["arashiyama"]), pkg("p1"), gem("g2"), event("ev1"), vendor("v1"), gem("g3"), stub("x1"), gem("g4")]), floatAnchor: true, neighbourhood: NB },
  readyMadeAnchor: { tagged: tag([gem("g1"), gem("g2"), pkg("p1"), event("ev1"), gem("g3"), stub("x1")]), floatAnchor: true, neighbourhood: NB },
  wantedAnchor: { tagged: tag([gem("g1"), wanted("w1"), gem("g2"), event("ev1")]), floatAnchor: true, neighbourhood: NB },
  noAnchorCandidate: { tagged: tag([gem("g1"), gem("g2"), event("ev1")]), floatAnchor: true, neighbourhood: NB },
  emptyUnstocked: { tagged: [], floatAnchor: true, neighbourhood: NB },
  priceSorted: { tagged: tag([pkg("p1"), gem("g1"), expert("e1"), gem("g2"), gem("g3")]), floatAnchor: false, neighbourhood: NB },
  partnerHeavy: { tagged: tag([stub("x1"), stub("x2"), expert("e1", "trip-planner"), stub("x3"), gem("g1"), pkg("p1"), pkg("p2"), gem("g2")]), floatAnchor: true, neighbourhood: NB },
};

// Captured from the page's span code before row 301 moved it: [id, colSpan, rowSpan, isAnchor].
const BEFORE: Record<string, [string, number, number, boolean][]> = {
  expertAnchor: [["e1", 2, 2, true], ["g1", 2, 1, false], ["p1", 2, 1, false], ["g2", 1, 1, false], ["ev1", 1, 1, false], ["v1", 1, 1, false], ["g3", 1, 1, false], ["x1", 1, 1, false], ["g4", 1, 1, false]],
  readyMadeAnchor: [["p1", 2, 1, true], ["g1", 1, 1, false], ["g2", 1, 1, false], ["ev1", 1, 1, false], ["g3", 1, 1, false], ["x1", 1, 1, false]],
  wantedAnchor: [["w1", 2, 1, true], ["g1", 1, 1, false], ["g2", 1, 1, false], ["ev1", 1, 1, false]],
  noAnchorCandidate: [["neighbourhood-wanted-hero-arashiyama", 2, 1, true], ["g1", 1, 1, false], ["g2", 1, 1, false], ["ev1", 1, 1, false]],
  emptyUnstocked: [["neighbourhood-wanted-hero-arashiyama", 2, 1, true]],
  priceSorted: [["p1", 2, 1, false], ["g1", 1, 1, false], ["e1", 1, 1, false], ["g2", 1, 1, false], ["g3", 1, 1, false]],
  partnerHeavy: [["e1", 2, 2, true], ["x1", 1, 1, false], ["x2", 1, 1, false], ["x3", 1, 1, false], ["g1", 1, 1, false], ["p1", 2, 1, false], ["p2", 2, 1, false], ["g2", 1, 1, false]],
};

const place = (key: string, config: BentoLayoutConfig = BENTO_LAYOUT_CONFIG): PlacedTile[] => {
  const f = FIXTURES[key];
  return buildBentoTiles(f.tagged, f.floatAnchor, f.neighbourhood, "Kyoto", config);
};
const shape = (tiles: PlacedTile[]) => tiles.map((t) => [t.item.id, t.colSpan, t.rowSpan, t.isAnchor]);

/** CSS grid sparse auto-placement over `cols` columns; returns the occupied cell map. */
function gridCells(tiles: PlacedTile[], cols: number): boolean[][] {
  const rows: boolean[][] = [];
  const free = (r: number, c: number, w: number, h: number) => {
    if (c + w > cols) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (rows[y]?.[x]) return false;
    return true;
  };
  let curR = 0;
  let curC = 0;
  for (const t of tiles) {
    let r = curR;
    let c = curC;
    while (!free(r, c, t.colSpan, t.rowSpan)) {
      c += 1;
      if (c >= cols) { c = 0; r += 1; }
    }
    for (let y = r; y < r + t.rowSpan; y++) {
      rows[y] ??= Array(cols).fill(false);
      for (let x = c; x < c + t.colSpan; x++) rows[y][x] = true;
    }
    curR = r;
    curC = c + t.colSpan;
  }
  return rows;
}

test("L1: every fixture places the same tiles, in the same order, with the same spans as before", () => {
  for (const key of Object.keys(FIXTURES)) {
    assert.deepEqual(shape(place(key)), BEFORE[key], key);
  }
});

test("L2: expert anchor 2x2, ready-mades 2 wide, nothing past 2, no hole before the last row", () => {
  for (const key of Object.keys(FIXTURES)) {
    const tiles = place(key);
    for (const t of tiles) {
      assert.ok(t.colSpan >= 1 && t.colSpan <= 2, `${key} ${t.item.id} colSpan ${t.colSpan}`);
      if (t.isAnchor && (t.item.kind === "expert" || t.item.kind === "lead-expert")) {
        assert.deepEqual([t.colSpan, t.rowSpan], [2, 2], `${key} expert anchor`);
      } else if (t.isAnchor) {
        assert.deepEqual([t.colSpan, t.rowSpan], [2, 1], `${key} fallback anchor`);
      } else {
        assert.equal(t.rowSpan, 1, `${key} ${t.item.id} rowSpan`);
      }
      if (t.item.kind === "package") assert.equal(t.colSpan, 2, `${key} ready-made ${t.item.id}`);
      if (t.item.kind === "external-stub") assert.equal(t.colSpan, 1, `${key} partner ${t.item.id}`);
    }
    const cells = gridCells(tiles, BENTO_LAYOUT_CONFIG.gridColumns);
    for (let r = 0; r < cells.length - 1; r++) {
      assert.ok(cells[r].every(Boolean), `${key} row ${r + 1} has an empty cell: ${cells[r]}`);
    }
  }
  assert.deepEqual(shape(place("expertAnchor")).slice(0, 1), [["e1", 2, 2, true]]);
});

test("L3: a config edit changes the layout with no other file edited", () => {
  const narrowReadyMades: BentoLayoutConfig = { ...BENTO_LAYOUT_CONFIG, readyMadeSpan: { colSpan: 1, rowSpan: 1 } };
  const p1 = place("expertAnchor", narrowReadyMades).find((t) => t.item.id === "p1")!;
  assert.equal(p1.colSpan, 1);

  const readyMadeFirst: BentoLayoutConfig = { ...BENTO_LAYOUT_CONFIG, heroOrder: ["ready-made", "expert", "wanted"] };
  const anchor = place("expertAnchor", readyMadeFirst)[0];
  assert.equal(anchor.item.id, "p1");
  assert.equal(anchor.isAnchor, true);

  const plannerFirst: BentoLayoutConfig = { ...BENTO_LAYOUT_CONFIG, anchorPriorityOrder: ["city-local"] };
  // The fixture's trip planner is not in the configured priority list, so it cannot anchor.
  assert.notEqual(place("partnerHeavy", plannerFirst)[0].item.id, "e1");
});

test("L4: the Wanted hero is a family card and the page keeps no inline card markup", () => {
  const page = fs.readFileSync("client/src/pages/discover-location.tsx", "utf8");
  assert.ok(page.includes("<FeedNeighbourhoodWantedCard"), "BentoTile renders the family card");
  assert.equal(page.includes("function NeighbourhoodWantedPanel"), false);
  assert.equal(/function \w+Card\(/.test(page), false, "no inline *Card component in the page");
  assert.equal(page.includes("function assignBentoSpans"), false, "span math lives in lib/bento-spans.ts");
  const card = fs.readFileSync("client/src/components/feed/neighbourhood-wanted-card.tsx", "utf8");
  assert.ok(card.includes("export function FeedNeighbourhoodWantedCard"));
});
