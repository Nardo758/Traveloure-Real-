/**
 * FU-S1-2 (R393) on the card: the stay card draws S1's ONE `stayLink` (ledger `2026-10-09-stay-card-link`).
 *
 *   CL1 pure: own ⇒ "View on hotel's site", no attribution; google ⇒ the same label WITH "Google Maps";
 *       maps ⇒ "View on map" with "Google Maps"; none ⇒ the Maps fallback, attributed
 *   CL2 render, free: each card links where its own stayLink points, attribution beside google/maps only
 *   CL3 render, routed: the link fetched when the pick's card was shown wins over the list link
 *   CL4 source: the container asks `/stay-pick/link` once per pick, only on a routed pick, never retried
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/stay-card-link.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import type { WhereToStayView } from "@shared/where-to-stay";
import { AnchorPanelView, type AnchorPanelViewProps } from "../../plan/AnchorPanel";
import { GOOGLE_MAPS_ATTRIBUTION, STAY_MAP_LINK_LABEL, STAY_SITE_LINK_LABEL, stayLinkView } from "../../../lib/stay-card";

(globalThis as any).React = React;

const render = (p: Partial<AnchorPanelViewProps>) =>
  renderToString(
    React.createElement(AnchorPanelView, { stage: "drafted", question: "Where are you staying?", anchorKind: "lodging", canChoose: true, ...p } as AnchorPanelViewProps),
  );
const hotel = (id: string, name: string, kind: "platform" | "hotel_cache" = "hotel_cache") => ({ kind, id, name, starRating: 4 });
const base = (stay: WhereToStayView["stay"]): WhereToStayView => ({ eligible: true, city: "Kyoto", basis: "travel_time", hotelsAvailable: true, neighborhoods: [], stay });
const anchor = (html: string, id: string) => html.match(new RegExp(`<a[^>]*data-testid="stay-pick-map-[a-z_]+-${id}"[^>]*>`))?.[0] ?? "";

describe("FU-S1-2 on the stay card", () => {
  it("CL1 the label and the attribution follow the link's kind", () => {
    assert.deepEqual(stayLinkView({ kind: "own", url: "https://ryokan.example/" }, "fb"), { href: "https://ryokan.example/", label: STAY_SITE_LINK_LABEL, kind: "own", attributed: false });
    assert.deepEqual(stayLinkView({ kind: "google", url: "https://hotel.example/" }, "fb"), { href: "https://hotel.example/", label: STAY_SITE_LINK_LABEL, kind: "google", attributed: true });
    assert.deepEqual(stayLinkView({ kind: "maps", url: "https://maps-link.example/x" }, "fb"), { href: "https://maps-link.example/x", label: STAY_MAP_LINK_LABEL, kind: "maps", attributed: true });
    assert.deepEqual(stayLinkView(undefined, "fb"), { href: "fb", label: STAY_MAP_LINK_LABEL, kind: "maps", attributed: true });
  });

  it("CL2 free: each card follows its own link; attribution only beside Google", () => {
    const html = render({
      view: base({
        tier: "straight_line",
        hotels: [
          { ...hotel("p1", "Ryokan Own", "platform"), stayLink: { kind: "own", url: "https://ryokan.example/" } },
          { ...hotel("m1", "Map Hotel"), stayLink: { kind: "maps", url: "https://maps-link.example/map-hotel" } },
        ],
      }),
    });
    assert.match(anchor(html, "p1"), /href="https:\/\/ryokan\.example\/"/);
    assert.match(anchor(html, "p1"), /data-link-kind="own"/);
    assert.doesNotMatch(html, /data-testid="stay-pick-map-attribution-p1"/, "a provider's own site is not Google's");
    assert.match(anchor(html, "m1"), /data-link-kind="maps"/);
    assert.match(html, new RegExp(`data-testid="stay-pick-map-attribution-m1"[^>]*>· (<!-- -->)?${GOOGLE_MAPS_ATTRIBUTION}`));
    assert.ok(html.includes(STAY_SITE_LINK_LABEL.replace("'", "&#x27;")));
  });

  it("CL3 routed: the opened link wins over the list link, with Google's attribution", () => {
    const view = base({ tier: "routed", pick: { ...hotel("h1", "Hotel Kanra"), stayLink: { kind: "maps", url: "https://maps-link.example/hotel-kanra" } }, scoredCount: 9, candidateCount: 12, changed: false, computedAt: "t", closeness: null });
    const before = render({ view });
    assert.match(anchor(before, "h1"), /data-link-kind="maps"/);
    const after = render({ view, openedStayLink: { kind: "google", url: "https://hotelkanra.example/" } });
    assert.match(anchor(after, "h1"), /href="https:\/\/hotelkanra\.example\/"/);
    assert.match(anchor(after, "h1"), /data-link-kind="google"/);
    assert.match(after, /data-testid="stay-pick-map-attribution-h1"/);
  });

  it("CL4 the container asks once per pick, only for a routed pick", () => {
    const src = readFileSync(new URL("../../plan/AnchorPanel.tsx", import.meta.url), "utf8");
    assert.match(src, /queryKey: \[`\/api\/trips\/\$\{tripId\}\/stay-pick\/link`, pickedAt\]/);
    assert.match(src, /stay\.tier === "routed" && stay\.pick \? stay\.computedAt/);
    assert.match(src, /staleTime: Infinity,\n\s+retry: false/);
  });
});
