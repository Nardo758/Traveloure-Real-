/**
 * Row 302a (ledger `2026-10-31-tile-action-map`): every bento card draws its one primary action's
 * label from `tileActionLabel`, and no card types a primary label of its own. Hrefs are unchanged.
 *
 *   T1 each card's primary control reads the label tileActionLabel gives its kind.
 *   T2 the ready-made tile reads "Get this trip" and still links to /ready-made/:id.
 *   T3 no card source writes a retired primary label inside a primary control.
 *
 * Rendered with react-dom/server. No network.
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
import { expertAvailabilityUrl } from "@/lib/expert-availability";
import { tileActionLabel } from "@/lib/bento-action-state";
import {
  CityFeedCardEvent,
  CityFeedCardGem,
  CityFeedCardSupply,
  CityFeedCardVendorService,
} from "../city-feed-card";
import { CityFeedCardExpert } from "../city-feed-card-expert";
import { ExpertCard } from "../expert-card";
import { FeedEarnCard } from "../feed/earn-card";
import { FeedReadyMadeCard } from "../feed/ready-made-card";
import { FeedWantedSlotCard } from "../feed/wanted-slot-card";

(globalThis as any).React = React;

const CITY = "Kyoto";

function render(node: React.ReactNode, opts: { expertAvailable?: boolean } = {}): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["/api/auth/user"], { id: "u", role: "user" });
  if (opts.expertAvailable) qc.setQueryData([expertAvailabilityUrl({ city: CITY })], { available: true });
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/location/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

function clean(s: string): string {
  return s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

/** The text inside the one element carrying data-bento-primary-action. */
function primaryText(html: string): string {
  const at = html.indexOf("data-bento-primary-action");
  assert.ok(at >= 0, "a primary action is drawn");
  const open = html.lastIndexOf("<", at);
  const tag = html.slice(open + 1).match(/^[a-z]+/)![0];
  const start = html.indexOf(">", at) + 1;
  const end = html.indexOf(`</${tag}>`, start);
  return clean(html.slice(start, end));
}

const gem = { id: "g1", placeName: "Philosopher's Path", placeType: "temple", description: "A lane." };
const expert = { id: "ex-1", firstName: "Yuki", lastName: "Tanaka", handle: "yuki", expertForm: { city: CITY } };
const event = { id: "ev-1", title: "Gion Matsuri" };
const supply = { id: "sup-1", name: "A tea house" };
const service = { id: "svc-1", serviceName: "Morning walk" };

describe("row 302a — cards read tileActionLabel", () => {
  it("T1: each card's primary control reads its kind's label", () => {
    assert.equal(primaryText(render(<CityFeedCardGem gem={gem} city={CITY} density="compact" onAdd={() => {}} compactActionState="platform" />)), tileActionLabel("loose-gem"));
    assert.equal(primaryText(render(<CityFeedCardEvent event={event} city={CITY} density="compact" onAdd={() => {}} />)), tileActionLabel("event"));
    assert.equal(primaryText(render(<CityFeedCardSupply item={supply} kind="supply-activity" city={CITY} density="compact" onAdd={() => {}} />)), tileActionLabel("supply-activity"));
    assert.equal(primaryText(render(<CityFeedCardSupply item={supply} kind="supply-hotel" city={CITY} density="compact" onAdd={() => {}} />)), "Check dates");
    assert.equal(primaryText(render(<CityFeedCardVendorService service={service} city={CITY} density="compact" compactActionState="platform" onAdd={() => {}} />)), "Check availability");
    assert.equal(primaryText(render(<CityFeedCardVendorService service={service} city={CITY} density="compact" compactActionState="not-bookable" onAdd={() => {}} />)), tileActionLabel("supply-activity"));
    assert.equal(primaryText(render(<CityFeedCardExpert expert={expert} city={CITY} density="compact" />, { expertAvailable: true })), "Ask this expert");
    assert.equal(primaryText(render(<CityFeedCardExpert expert={expert} city={CITY} density="compact" />)), "View profile");
    assert.equal(primaryText(render(<ExpertCard expert={expert} variant="anchor" />, { expertAvailable: true })), "Ask this expert");
    assert.equal(primaryText(render(<ExpertCard expert={expert} variant="anchor" />)), "View profile");
    assert.equal(primaryText(render(<FeedEarnCard city={CITY} density="compact" />)), "Apply");
    const wanted = { kind: "wanted-slot" as const, id: "w1", data: { offeringLabel: "Local guide", offeringKey: "guide", neighborhoodName: "Gion", neighborhoodSlug: "gion", city: CITY, neighborhoodId: "gion" } };
    assert.equal(primaryText(render(<FeedWantedSlotCard item={wanted} density="compact" />)), "Apply");
  });

  it("T2: the ready-made tile reads Get this trip and links to its detail page", () => {
    const template = { id: "rm-7", title: "Three days in Kyoto", destination: CITY, durationDays: 3 };
    const html = render(<FeedReadyMadeCard template={template as any} density="compact" />);
    assert.equal(primaryText(html), "Get this trip");
    assert.match(html, /href="\/ready-made\/rm-7"[^>]*>Get this trip</);
  });

  it("T3: no card source writes a retired primary label in a primary control", () => {
    const files = [
      "client/src/components/city-feed-card.tsx",
      "client/src/components/city-feed-card-expert.tsx",
      "client/src/components/expert-card.tsx",
      "client/src/components/city-feed-card-recommendation.tsx",
      "client/src/components/feed/ready-made-card.tsx",
      "client/src/components/feed/earn-card.tsx",
      "client/src/components/feed/wanted-slot-card.tsx",
      "client/src/pages/discover-location.tsx",
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const word of [">Become an expert<", ">Get this trip<", "Ways to earn <", "Plan with ${firstName}", "NEIGHBOURHOOD_WANTED_BUTTON"]) {
        assert.equal(src.includes(word), false, `${f}: ${JSON.stringify(word)}`);
      }
    }
  });
});
