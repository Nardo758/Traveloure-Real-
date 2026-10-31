/**
 * Row 303b: the pure rules of the Discover tile detail panel screen.
 *
 *   D1 a fact missing its source, source URL or checked-on date is not drawn.
 *   D2 a section with no sourced fact is absent; sections keep the ruled order.
 *   D3 a partner item shows no price: a Viator/Klook fact in the cost section is not drawn.
 *   D4 a photo without a credit or a source link is not drawn; a missing license stays absent.
 *   D5 headings are the read's own map (row 303a's approved constants), never restated.
 *   D6 the panel's action is the tile's own primary control: same label, same handler.
 *   D7 the tile body opens the panel; the tile's own controls keep their click.
 *   D8 an absent store draws nothing.
 *   D9 the checked-on date reads as a calendar day.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TILE_PANEL_SECTION_HEADINGS, type TileDetailPanel } from "@shared/tile-detail-panel";
import {
  collectTileActions,
  formatCheckedOn,
  opensTileDetail,
  panelPhotosForDisplay,
  panelSectionsForDisplay,
  tileDisplayName,
  TILE_PRIMARY_ACTION_SELECTOR,
} from "../tile-detail";

const fact = (value: string, extra: Partial<Record<"source" | "sourceUrl" | "checkedOn", string>> = {}) => ({
  value,
  source: "Kyoto City",
  sourceUrl: "https://www.city.kyoto.lg.jp/",
  checkedOn: "2026-10-01",
  ...extra,
});

function panel(over: Partial<TileDetailPanel> = {}): TileDetailPanel {
  return {
    tileId: "gem-1",
    store: "present",
    headings: TILE_PANEL_SECTION_HEADINGS,
    photos: [],
    facts: {},
    ...over,
  };
}

describe("row 303b tile detail panel rules", () => {
  it("D1 a fact missing source, source URL or date is not drawn", () => {
    const sections = panelSectionsForDisplay(
      panel({
        facts: {
          what_it_is: [
            fact("kept"),
            fact("no source", { source: "" }),
            fact("no url", { sourceUrl: "" }),
            fact("http url", { sourceUrl: "http://example.com/" }),
            fact("no date", { checkedOn: "" }),
            fact("bad date", { checkedOn: "2026-02-30" }),
          ],
        },
      }),
    );
    assert.equal(sections.length, 1);
    assert.deepEqual(sections[0].facts.map((f) => f.value), ["kept"]);
  });

  it("D2 an empty section is absent and order is What it is, Where, When, Cost, Expert tips", () => {
    const sections = panelSectionsForDisplay(
      panel({
        facts: {
          expert_tip: [fact("tip")],
          where: [fact("where")],
          when: [],
          what_it_is: [fact("what")],
          cost: [fact("unsourced", { source: "" })],
        },
      }),
    );
    assert.deepEqual(sections.map((s) => s.section), ["what_it_is", "where", "expert_tip"]);
    assert.equal(sections.find((s) => s.section === "when"), undefined);
  });

  it("D3 a partner fact in the cost section is not drawn; a research cost fact is", () => {
    const sections = panelSectionsForDisplay(
      panel({
        facts: {
          cost: [
            fact("¥5,000", { source: "Viator" }),
            fact("¥3,000", { source: "Klook" }),
            fact("Free entry", { source: "Kyoto City" }),
          ],
          what_it_is: [fact("A tour", { source: "Viator" })],
        },
      }),
    );
    const cost = sections.find((s) => s.section === "cost");
    assert.deepEqual(cost?.facts.map((f) => f.value), ["Free entry"]);
    assert.deepEqual(sections.find((s) => s.section === "what_it_is")?.facts.map((f) => f.source), ["Viator"]);

    const partnerOnly = panelSectionsForDisplay(panel({ facts: { cost: [fact("¥5,000", { source: "Viator" })] } }));
    assert.equal(partnerOnly.length, 0, "a cost section holding only partner prices is absent");
  });

  it("D4 a photo without credit or source link is not drawn", () => {
    const photos = panelPhotosForDisplay(
      panel({
        photos: [
          { imageUrl: "https://img.example/a.jpg", credit: "A. Photographer", sourceUrl: "https://src.example/a", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
          { imageUrl: "https://img.example/b.jpg", credit: "", sourceUrl: "https://src.example/b", licenseUrl: null },
          { imageUrl: "https://img.example/c.jpg", credit: "C", sourceUrl: "", licenseUrl: null },
          { imageUrl: "https://img.example/d.jpg", credit: "D", sourceUrl: "https://src.example/d", licenseUrl: null },
        ],
      }),
    );
    assert.deepEqual(photos.map((p) => p.credit), ["A. Photographer", "D"]);
    assert.equal(photos[1].licenseUrl, null);
  });

  it("D5 headings come from the read's map", () => {
    const sections = panelSectionsForDisplay(panel({ facts: { when: [fact("Mornings")] } }));
    assert.equal(sections[0].heading, TILE_PANEL_SECTION_HEADINGS.when);
    assert.equal(sections[0].heading, "When");
  });

  it("D6 the panel action is the tile's own primary control", () => {
    let clicked = 0;
    const seen: string[] = [];
    const root = {
      querySelectorAll(selector: string) {
        seen.push(selector);
        return [{ textContent: "  Add to\n plan ", click: () => { clicked += 1; } }];
      },
    };
    const actions = collectTileActions(root);
    assert.deepEqual(seen, [TILE_PRIMARY_ACTION_SELECTOR]);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].label, "Add to plan");
    actions[0].run();
    assert.equal(clicked, 1, "the tile's own handler runs");

    assert.deepEqual(collectTileActions({ querySelectorAll: () => [] }), [], "no primary control, no panel action");
    assert.deepEqual(collectTileActions(null), []);
    const two = collectTileActions({
      querySelectorAll: () => [
        { textContent: "Apply now", click: () => {} },
        { textContent: "Apply as a provider", click: () => {} },
      ],
    });
    assert.deepEqual(two.map((a) => a.label), ["Apply now", "Apply as a provider"]);
  });

  it("D7 the tile body opens the panel; a control inside the tile does not", () => {
    const tile = { closest: () => null };
    const body = { closest: () => null };
    const button = { closest: () => ({ tag: "button" }) };
    assert.equal(opensTileDetail(body, tile), true);
    assert.equal(opensTileDetail(button, tile), false);
    assert.equal(opensTileDetail(tile, tile), true);
    assert.equal(opensTileDetail(null, tile), false);
  });

  it("D8 an absent store draws nothing", () => {
    const absent = panel({ store: "absent", facts: { what_it_is: [fact("x")] } });
    assert.deepEqual(panelSectionsForDisplay(absent), []);
    assert.deepEqual(panelPhotosForDisplay(absent), []);
    assert.deepEqual(panelSectionsForDisplay(null), []);
  });

  it("D9 checked-on reads as a calendar day; the title is the tile's own name", () => {
    assert.equal(formatCheckedOn("2026-10-01"), "Oct 1, 2026");
    assert.equal(tileDisplayName({ placeName: "Gio-ji" }), "Gio-ji");
    assert.equal(tileDisplayName({ candidate: { title: "Tea walk" } }), "Tea walk");
    assert.equal(tileDisplayName({}), null);
  });
});
