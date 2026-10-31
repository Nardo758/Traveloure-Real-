/**
 * Row 303b: the Discover tile detail panel screen, rendered with react-dom/server. No network.
 *
 *   P1 a fact missing its source is absent; a drawn fact shows its linked source and checked-on date.
 *   P2 with no "when" facts, the When section is absent; drawn sections keep the ruled order.
 *   P3 every drawn photo carries its credit link to the source, and its license link when it has one;
 *      a photo without a credit is absent.
 *   P4 the panel's action equals the tile's: the label the card draws on its primary control,
 *      which is tileAction(item).
 *   P5 a partner item's price is not drawn.
 *   P6 nothing checked: the HELD placeholder, and no section.
 *   P7 wiring: the bento tile opens the panel; headings are read, never restated on the client.
 */
import "./node-navigator";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SignInModalProvider } from "../../contexts/SignInModalContext";
import { TILE_PANEL_SECTION_HEADINGS, type TileDetailPanel } from "@shared/tile-detail-panel";
import { tileAction } from "@/lib/bento-action-state";
import type { FeedItem } from "@/lib/feed-stream";
import { TILE_DETAIL_COPY } from "@/lib/tile-detail-copy";
import { CityFeedCardGem } from "../city-feed-card";
import { TileDetailPanelBody } from "../feed/tile-detail-panel";

(globalThis as any).React = React;

const CITY = "Kyoto";

function render(node: React.ReactNode): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["/api/auth/user"], { id: "u", role: "user" });
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/location/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

function clean(s: string): string {
  return s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
}

function primaryText(html: string): string {
  const at = html.indexOf("data-bento-primary-action");
  assert.ok(at >= 0, "a primary action is drawn");
  const open = html.lastIndexOf("<", at);
  const tag = html.slice(open + 1).match(/^[a-z]+/)![0];
  const start = html.indexOf(">", at) + 1;
  const end = html.indexOf(`</${tag}>`, start);
  return clean(html.slice(start, end));
}

const src = (source: string, url = "https://www.city.kyoto.lg.jp/") => ({ source, sourceUrl: url, checkedOn: "2026-10-01" });

function panel(over: Partial<TileDetailPanel> = {}): TileDetailPanel {
  return { tileId: "gem-g1", store: "present", headings: TILE_PANEL_SECTION_HEADINGS, photos: [], facts: {}, ...over };
}

function body(p: TileDetailPanel, labels: string[] = []): string {
  return render(
    <TileDetailPanelBody
      tileId={p.tileId}
      panel={p}
      status="ready"
      actions={labels.map((label) => ({ label, run: () => {} }))}
    />,
  );
}

describe("row 303b — tile detail panel screen", () => {
  it("P1 a fact without a source is absent; a drawn fact shows linked source and date", () => {
    const html = body(
      panel({
        facts: {
          what_it_is: [
            { value: "A moss garden temple.", ...src("Kyoto City") },
            { value: "UNSOURCED-FACT", source: "", sourceUrl: "https://x.example/", checkedOn: "2026-10-01" },
          ],
        },
      }),
    );
    assert.match(html, /A moss garden temple\./);
    assert.doesNotMatch(html, /UNSOURCED-FACT/);
    assert.match(html, /<a[^>]*href="https:\/\/www\.city\.kyoto\.lg\.jp\/"[^>]*data-testid="tile-detail-fact-source-what_it_is-0"[^>]*>Kyoto City<\/a>/);
    assert.match(clean(html), new RegExp(`${TILE_DETAIL_COPY.checkedOn.replace(/[[\]]/g, "\\$&")} Oct 1, 2026`));
  });

  it("P2 with no when facts the When section is absent; order is ruled", () => {
    const html = body(
      panel({
        facts: {
          expert_tip: [{ value: "Go early.", ...src("Yuki Tanaka") }],
          where: [{ value: "Sagano.", ...src("Kyoto City") }],
          what_it_is: [{ value: "A temple.", ...src("Kyoto City") }],
        },
      }),
    );
    assert.doesNotMatch(html, /tile-detail-section-when/);
    assert.doesNotMatch(html, />When</);
    const order = ["what_it_is", "where", "expert_tip"].map((s) => html.indexOf(`tile-detail-section-${s}`));
    assert.ok(order.every((i) => i >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(html, />What it is</);
    assert.match(html, />Expert tips</);
  });

  it("P3 every drawn photo carries its credit and license links; an uncredited photo is absent", () => {
    const html = body(
      panel({
        facts: { what_it_is: [{ value: "A temple.", ...src("Kyoto City") }] },
        photos: [
          { imageUrl: "https://img.example/a.jpg", credit: "A. Photographer", sourceUrl: "https://src.example/a", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
          { imageUrl: "https://img.example/b.jpg", credit: "", sourceUrl: "https://src.example/b", licenseUrl: null },
        ],
      }),
    );
    assert.match(html, /<a[^>]*href="https:\/\/src\.example\/a"[^>]*data-testid="tile-detail-photo-credit-0"[^>]*>A\. Photographer<\/a>/);
    assert.match(html, /<a[^>]*href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"[^>]*data-testid="tile-detail-photo-license-0"/);
    assert.doesNotMatch(html, /img\.example\/b\.jpg/);
    assert.equal(html.match(/<img /g)?.length ?? 0, 1);
    assert.ok(html.indexOf("tile-detail-photos") < html.indexOf("tile-detail-section-what_it_is"), "photos come first");
  });

  it("P4 the panel action equals the tile's action", () => {
    const gem = { id: "g1", placeName: "Gio-ji", placeType: "temple", description: "A moss garden." };
    const item: FeedItem = { kind: "loose-gem", id: "gem-g1", data: gem } as FeedItem;
    const tileHtml = render(<CityFeedCardGem gem={gem} city={CITY} density="compact" onAdd={() => {}} compactActionState="platform" />);
    const drawn = primaryText(tileHtml);
    assert.equal(drawn, tileAction(item)?.label, "the card draws tileAction(item)");

    const html = body(panel({ facts: { what_it_is: [{ value: "A temple.", ...src("Kyoto City") }] } }), [drawn]);
    const at = html.indexOf('data-testid="tile-detail-action-0"');
    assert.ok(at >= 0);
    assert.equal(clean(html.slice(html.indexOf(">", at) + 1, html.indexOf("</button>", at))), tileAction(item)?.label);
    assert.equal(html.match(/tile-detail-action-/g)?.length, 1, "one action for a one-action tile");
    assert.ok(html.indexOf("tile-detail-action-0") > html.indexOf("tile-detail-section-what_it_is"), "the action comes last");
  });

  it("P5 a partner item's price is not drawn", () => {
    const html = body(
      panel({
        tileId: "external-stub-v1",
        facts: {
          what_it_is: [{ value: "A night tour.", ...src("Viator", "https://www.viator.com/tours/x") }],
          cost: [{ value: "PARTNER-PRICE ¥9,000", ...src("Viator", "https://www.viator.com/tours/x") }],
        },
      }),
    );
    assert.doesNotMatch(html, /PARTNER-PRICE/);
    assert.doesNotMatch(html, /tile-detail-section-cost/);
    assert.match(html, /A night tour\./);
  });

  it("P6 nothing checked shows the placeholder and no section", () => {
    const html = body(panel({ facts: { when: [{ value: "x", source: "", sourceUrl: "", checkedOn: "" }] } }));
    assert.match(html, /tile-detail-nothing-checked/);
    assert.doesNotMatch(html, /tile-detail-section-/);
  });

  it("P7 the bento tile opens the panel; headings are not restated on the client", () => {
    const page = fs.readFileSync("client/src/pages/discover-location.tsx", "utf8");
    assert.match(page, /<TileDetailPanel\b/);
    assert.match(page, /tileDetailHandlers\(tile\.item/);
    for (const f of [
      "client/src/components/feed/tile-detail-panel.tsx",
      "client/src/lib/tile-detail.ts",
      "client/src/lib/tile-detail-copy.ts",
    ]) {
      const text = fs.readFileSync(f, "utf8");
      for (const heading of Object.values(TILE_PANEL_SECTION_HEADINGS)) {
        assert.equal(text.includes(`"${heading}"`), false, `${f} restates ${heading}`);
      }
    }
    for (const [key, value] of Object.entries(TILE_DETAIL_COPY)) {
      assert.equal(value, "[HELD for Leon]", `${key} is HELD`);
    }
  });
});
