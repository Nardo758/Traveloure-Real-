/**
 * Row 302b. Every bento tile kind renders one primary action. The Kyoto discover
 * page has no "More info" control. The Arashiyama itinerary wanted tile keeps the
 * two cleared lines from 299b; a signed-in traveler on that tile still has one.
 *
 * Rendered with react-dom/server. No network.
 */
import "./node-navigator";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { SignInModalProvider } from "../../contexts/SignInModalContext";
import { expertAvailabilityUrl } from "@/lib/expert-availability";
import {
  CityFeedCardEvent,
  CityFeedCardGem,
  CityFeedCardSupply,
  CityFeedCardVendorService,
} from "../city-feed-card";
import { CityFeedCardExpert } from "../city-feed-card-expert";
import { CityFeedCardRecommendation } from "../city-feed-card-recommendation";
import { CityFeedCardExternalStub, type ExternalStubData } from "../city-feed-card-external-stub";
import { ExpertCard } from "../expert-card";
import { FeedEarnCard } from "../feed/earn-card";
import { FeedReadyMadeCard } from "../feed/ready-made-card";
import { FeedWantedSlotCard } from "../feed/wanted-slot-card";
import type { FeedItem } from "@/lib/feed-stream";
import {
  ARASHIYAMA_ITINERARY_EXPERT_LINK,
  ARASHIYAMA_ITINERARY_PROVIDER_LINK,
  ARASHIYAMA_PLAN_YOUR_DAY,
} from "@/lib/arashiyama-wanted-copy";

(globalThis as any).React = React;

const CITY = "Kyoto";

function render(node: React.ReactNode, opts: { expertAvailable?: boolean; user?: { id: string; role: string } | null } = {}): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["/api/auth/user"], opts.user ?? null);
  if (opts.expertAvailable) {
    qc.setQueryData([expertAvailabilityUrl({ city: CITY })], { available: true });
  }
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/discover/location/kyoto">
        <SignInModalProvider>{node}</SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

function text(html: string): string {
  return html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function primaryCount(html: string): number {
  return html.match(/data-bento-primary-action=/g)?.length ?? 0;
}

function assertOnePrimary(html: string, label: string) {
  assert.equal(primaryCount(html), 1, `${label}: one primary action`);
  assert.equal(text(html).includes("More info"), false, `${label}: no More info`);
}

const fillerKinds = (() => {
  const src = fs.readFileSync(path.join(process.cwd(), "client/src/pages/discover-location.tsx"), "utf8");
  const block = src.match(/const FILLER_KINDS = new Set<FeedItem\["kind"\]>\(\[([\s\S]*?)\]\)/);
  assert.ok(block, "FILLER_KINDS block");
  return (block[1].match(/"([^"]+)"/g) ?? []).map((quoted) => quoted.slice(1, -1));
})();

const gem = { id: "g1", placeName: "Philosopher's Path", placeType: "temple", description: "A lane." };
const expert = { id: "ex-1", firstName: "Yuki", lastName: "Tanaka", handle: "yuki", expertForm: { city: CITY } };
const event = { id: "ev-1", title: "Gion Matsuri", bookingToken: "tok-1" };
const supply = { id: "sup-1", name: "A tea house" };
const service = { id: "svc-1", serviceName: "Morning walk" };
const candidate = {
  offeringId: "tea",
  categoryKey: "cultural_experiences",
  displayName: "Tea Ceremony",
  tagline: "A private tea",
  reason: "for this plan",
  sourceType: "platform_provider" as const,
};

function wanted(over: Record<string, unknown> = {}): FeedItem {
  return {
    kind: "wanted-slot",
    id: "wanted-1",
    data: {
      offeringLabel: "Local guide",
      offeringKey: "guide",
      neighborhoodName: "Gion",
      neighborhoodSlug: "gion",
      city: CITY,
      neighborhoodId: "gion",
      demandCount: 12,
      ...over,
    },
  };
}

function stub(over: Partial<ExternalStubData> = {}): ExternalStubData {
  return {
    id: "s1",
    inventoryClass: "external",
    name: "Camellia Tea Ceremony",
    city: CITY,
    country: "Japan",
    neighborhood: "Gion",
    contentType: "attraction",
    shortDescription: "A tea ceremony.",
    primaryImageUrl: null,
    sourceUrl: "https://example.org/tea",
    sourcePageTitle: "Example",
    license: "osm",
    places: [],
    placeCount: 0,
    ...over,
  };
}

describe("row 302b — one primary action per bento kind", () => {
  it("covers every kind the bento can render", () => {
    assert.deepEqual(fillerKinds.sort(), [
      "earn-card",
      "event",
      "expert",
      "external-stub",
      "lead-expert",
      "loose-gem",
      "package",
      "recommendation",
      "supply-activity",
      "supply-hotel",
      "vendor-service",
      "wanted-slot",
    ]);
  });

  it("loose-gem is Add, with or without an expert to ask", () => {
    for (const expertAvailable of [false, true]) {
      const html = render(
        <CityFeedCardGem gem={gem} city={CITY} density="compact" onAdd={() => {}} compactActionState="platform" />,
        { expertAvailable },
      );
      assertOnePrimary(html, `gem ${expertAvailable}`);
      assert.match(html, /data-testid="btn-add-gem-g1"/);
      assert.equal(html.includes("btn-ask-gem-"), false);
    }
  });

  it("event is Add, including when a partner token is present", () => {
    for (const expertAvailable of [false, true]) {
      const html = render(
        <CityFeedCardEvent event={event} city={CITY} density="compact" onAdd={() => {}} />,
        { expertAvailable },
      );
      assertOnePrimary(html, `event ${expertAvailable}`);
      assert.match(html, /data-testid="btn-add-event-ev-1"/);
      assert.equal(html.includes("btn-event-partner-price-"), false);
      assert.equal(html.includes("btn-ask-event-"), false);
    }
  });

  it("supply activity and supply hotel each have one Add", () => {
    for (const kind of ["supply-activity", "supply-hotel"] as const) {
      for (const expertAvailable of [false, true]) {
        const html = render(
          <CityFeedCardSupply item={supply} kind={kind} city={CITY} density="compact" onAdd={() => {}} />,
          { expertAvailable },
        );
        assertOnePrimary(html, `${kind} ${expertAvailable}`);
        assert.match(html, /data-testid="btn-add-supply-sup-1"/);
        assert.equal(html.includes("btn-ask-supply-"), false);
      }
    }
  });

  it("vendor-service is Book when the platform rail is bookable, otherwise Add", () => {
    const book = render(
      <CityFeedCardVendorService service={service} city={CITY} density="compact" compactActionState="platform" onAdd={() => {}} />,
    );
    assertOnePrimary(book, "vendor book");
    assert.match(book, /data-testid="btn-book-svc-svc-1"/);
    assert.equal(book.includes("btn-add-svc-"), false);

    const add = render(
      <CityFeedCardVendorService service={service} city={CITY} density="compact" compactActionState="not-bookable" onAdd={() => {}} />,
    );
    assertOnePrimary(add, "vendor add");
    assert.match(add, /data-testid="btn-add-svc-svc-1"/);
    assert.equal(add.includes("btn-book-svc-"), false);
  });

  it("recommendation is Book when that control is bookable, otherwise Add", () => {
    const book = render(
      <CityFeedCardRecommendation
        candidate={candidate}
        city={CITY}
        position={0}
        density="compact"
        compactActionState="platform"
        onAdd={() => {}}
        onBook={() => {}}
      />,
      { expertAvailable: true },
    );
    assertOnePrimary(book, "rec book");
    assert.match(book, /data-testid="btn-book-rec-0"/);
    assert.equal(book.includes("btn-add-rec-"), false);
    assert.equal(book.includes("btn-ask-rec-"), false);

    const add = render(
      <CityFeedCardRecommendation
        candidate={candidate}
        city={CITY}
        position={1}
        density="compact"
        compactActionState="not-bookable"
        onAdd={() => {}}
        onBook={() => {}}
      />,
      { expertAvailable: true },
    );
    assertOnePrimary(add, "rec add");
    assert.match(add, /data-testid="btn-add-rec-1"/);
    assert.equal(add.includes("btn-book-rec-"), false);
  });

  it("expert is Ask when the city has an expert to ask, otherwise View profile", () => {
    const ask = render(<CityFeedCardExpert expert={expert} city={CITY} density="compact" />, { expertAvailable: true });
    assertOnePrimary(ask, "expert ask");
    assert.match(ask, /data-testid="btn-ask-expert-ex-1"/);
    assert.equal(ask.includes("btn-contact-expert-"), false);

    const view = render(<CityFeedCardExpert expert={expert} city={CITY} density="compact" />);
    assertOnePrimary(view, "expert view");
    assert.match(view, /data-testid="btn-contact-expert-ex-1"/);
    assert.equal(view.includes("btn-ask-expert-"), false);
  });

  it("lead-expert anchor is Plan with when the city has an expert to ask, otherwise View profile", () => {
    const plan = render(<ExpertCard expert={expert} variant="anchor" />, { expertAvailable: true });
    assertOnePrimary(plan, "anchor plan");
    assert.match(plan, /data-testid="button-plan-with-expert"/);
    assert.equal(plan.includes("button-view-profile"), false);

    const view = render(<ExpertCard expert={expert} variant="anchor" />);
    assertOnePrimary(view, "anchor view");
    assert.match(view, /data-testid="button-view-profile"/);
    assert.equal(view.includes("button-plan-with-expert"), false);
  });

  it("a generic wanted tile is Ways to earn, with no More info and no Ask", () => {
    const html = render(<FeedWantedSlotCard item={wanted()} density="compact" />, {
      expertAvailable: true,
      user: { id: "u", role: "user" },
    });
    assertOnePrimary(html, "wanted");
    assert.match(html, /data-testid="link-wanted-apply"/);
    assert.equal(html.includes("link-wanted-ask-"), false);
    assert.equal(html.includes("link-wanted-more-info-"), false);
  });

  it("the Arashiyama itinerary tile keeps its two lines, and a traveler sees one", () => {
    const pair = render(
      <FeedWantedSlotCard
        item={wanted({
          offeringKey: "local_city_itinerary",
          neighborhoodSlug: "arashiyama",
          neighborhoodName: "Arashiyama",
          neighborhoodId: "arashiyama",
        })}
      />,
    );
    assert.equal(primaryCount(pair), 2, "299b pair");
    assert.equal(text(pair).includes("More info"), false);
    assert.ok(text(pair).includes(ARASHIYAMA_ITINERARY_EXPERT_LINK));
    assert.ok(text(pair).includes(ARASHIYAMA_ITINERARY_PROVIDER_LINK));

    const traveler = render(
      <FeedWantedSlotCard
        item={wanted({
          offeringKey: "local_city_itinerary",
          neighborhoodSlug: "arashiyama",
          neighborhoodName: "Arashiyama",
          neighborhoodId: "arashiyama",
        })}
      />,
      { user: { id: "traveler", role: "user" } },
    );
    assertOnePrimary(traveler, "arashiyama traveler");
    assert.equal(text(traveler), ARASHIYAMA_PLAN_YOUR_DAY);
  });

  it("earn, ready-made and external-stub each have one primary and no More info", () => {
    const earn = render(<FeedEarnCard city={CITY} density="compact" />);
    assertOnePrimary(earn, "earn");
    assert.match(earn, /data-testid="btn-earn-expert"/);
    assert.equal(earn.includes("btn-earn-provider"), false);
    assert.equal(earn.includes("link-earn-more-info"), false);

    const ready = render(
      <FeedReadyMadeCard template={{ id: "rm-1", title: "A day in Gion", destination: "Kyoto", duration: 1 }} density="compact" embedded />,
    );
    assertOnePrimary(ready, "package");
    assert.match(ready, /data-testid="btn-view-package-rm-1"/);

    for (const [label, data] of [
      ["external", stub()],
      ["provider", stub({ resolutionClass: "provider", resolutionRef: "svc-9" })],
      ["affiliate", stub({ resolutionClass: "affiliate", resolutionRef: "viator:v-9" })],
    ] as const) {
      const html = render(<CityFeedCardExternalStub stub={data} city={CITY} density="compact" />);
      assertOnePrimary(html, label);
    }
  });

  it("the neighbourhood wanted panel's join link is the one primary action", () => {
    // Row 301 moved the panel out of the page into its own card file; the assertions are unchanged.
    const panel = fs.readFileSync(path.join(process.cwd(), "client/src/components/feed/neighbourhood-wanted-card.tsx"), "utf8");
    assert.match(panel, /data-bento-primary-action/);
    assert.equal(panel.includes("More info"), false);
    const marked = panel.match(/data-bento-primary-action/g) ?? [];
    assert.equal(marked.length, 1);
  });
});
