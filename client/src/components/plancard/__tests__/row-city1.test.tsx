/**
 * CITY-1 (ledger `2026-11-04-city1-marquee-defaults`): the marquee market is the default city on every traveler
 * surface; a market that is not open shows its status and links to its waitlist, with no listings.
 *
 *   T2 the picker: the marquee is first and pre-selected; Porto (not open) renders as a link to /waitlist/porto with
 *      its status, not a selectable chip; a typed non-open city links to its waitlist
 *   T3 /destinations cards: no "Hot", no "%"; each card shows a status label; Porto's card goes to its waitlist
 *   T4 the closed-market city page: header + status + waitlist CTA + apply links, and no feed section
 *   T5 the moments section draws the waitlist CTA for a non-open city's moment, "Start a plan" otherwise
 *   T6 none of the §4h files contains the literal "Kyoto" outside comments
 *   +  the 409 market_not_open refusal maps to the waitlist link; /deals lists open-market deals only
 *
 * Harness: react-dom/server renderToString and pure helpers; source asserts where a page needs a browser.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-city1.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { LIVE_MARKETS_ROUTE } from "@shared/live-markets";
import { MARKET_STATUS_COPY, marketIsOpen, marketPickerOrder } from "@shared/ticker";
import { statusSettingsFrom } from "@/lib/waitlist-markets";
import { typedCity, withMarqueeCity, initialPlanEntry } from "@/lib/plan-entry";
import { marketNotOpenFrom, mintTripSlip } from "@/lib/trip-slip";
import { PlanEntryPanel } from "@/components/plan/PlanEntry";
import { CityCard } from "@/components/travelpulse/CityCard";
import { ClosedMarketCityView } from "@/components/waitlist/WaitlistMarkets";
import { dealsForMarkets } from "@/lib/deals-markets";
import { marketsInDisplayOrder } from "@/lib/company-facts";
import { readyMadeWaitlistLabel } from "@/lib/ready-made-waitlist";
import { WAITLIST_JOIN_ANY, waitlistJoinButtonLabel } from "@/lib/waitlist-markets";

(globalThis as any).React = React;

const src = (p: string) => fs.readFileSync(p, "utf8");
/** The opening tag carrying `data-testid="<id>"`, whatever the attribute order. */
const tagOf = (html: string, id: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
const ANSWER = { marketKeys: ["kyoto"], launch: "kyoto", live: [], beta: ["kyoto"], dates: {} };
const SETTINGS = statusSettingsFrom(ANSWER);

function client(answer: unknown = ANSWER) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData([LIVE_MARKETS_ROUTE], answer);
  qc.setQueryData(["/api/experience-types"], []);
  qc.setQueryData(["/api/city-events/upcoming"], []);
  return qc;
}

function renderPanel(source: any, qc = client()) {
  return renderToString(
    <Router ssrPath="/experiences">
      <QueryClientProvider client={qc}>
        <PlanEntryPanel active source={source} onStart={async () => ({ ok: true })} container="page" />
      </QueryClientProvider>
    </Router>,
  );
}

describe("T2 the city picker", () => {
  it("orders the marquee first, then live and beta, then the rest", () => {
    assert.deepEqual(marketPickerOrder(SETTINGS)[0], "kyoto");
    const withLive = statusSettingsFrom({ ...ANSWER, launch: "goa", live: ["porto"] });
    const order = marketPickerOrder(withLive);
    assert.equal(order[0], "goa", "the marquee leads even when it is only beta");
    assert.ok(order.indexOf("porto") < order.indexOf("mumbai"), "live before the rest");
    assert.ok(order.indexOf("kyoto") < order.indexOf("mumbai"), "beta before the rest");
    assert.equal(order.length, 8);
    assert.equal(marketIsOpen("kyoto", SETTINGS), true, "the marquee is open");
    assert.equal(marketIsOpen("porto", SETTINGS), false);
    assert.equal(marketIsOpen("porto", withLive), true, "a live market is open");
    assert.equal(marketIsOpen("kyoto", withLive), false, "beta alone does not open a market");
  });

  it("renders the marquee pre-selected first; Porto is a link to its waitlist, not a selection", () => {
    const html = renderPanel({ newPlan: true });
    const kyotoAt = html.indexOf('data-testid="plan-entry-city-kyoto"');
    const portoAt = html.indexOf('data-testid="plan-entry-city-porto"');
    assert.ok(kyotoAt >= 0 && portoAt > kyotoAt, "Kyoto first");
    const firstChip = html.indexOf('data-testid="plan-entry-city-');
    assert.equal(firstChip, kyotoAt, "the first chip is the marquee");
    assert.match(html, /<button[^>]*aria-pressed="true"[^>]*data-testid="plan-entry-city-kyoto"/, "the marquee is pre-selected");
    const porto = tagOf(html, "plan-entry-city-porto");
    assert.match(porto, /^<a /, "a link");
    assert.match(porto, /href="\/waitlist\/porto"/);
    assert.match(html, /Porto · Join the waitlist/);
    assert.doesNotMatch(html, /<button[^>]*data-testid="plan-entry-city-porto"/, "never a selectable chip");
  });

  it("a door's city is kept; with no answer yet every market stays selectable", () => {
    const state = initialPlanEntry({ city: "Goa", country: "India", newPlan: true } as any).state;
    assert.equal(withMarqueeCity(state, "kyoto").market?.marketKey, "goa");
    assert.equal(withMarqueeCity(initialPlanEntry({ newPlan: true } as any).state, "kyoto").market?.marketKey, "kyoto");
    assert.equal(withMarqueeCity(initialPlanEntry({ newPlan: true } as any).state, null).market, null);
    const unread = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    unread.setQueryData(["/api/experience-types"], []);
    const html = renderPanel({ newPlan: true }, unread);
    assert.match(html, /<button[^>]*data-testid="plan-entry-city-porto"/);
  });

  it("a typed non-open city links to its waitlist, not 'not planning there yet'", () => {
    const open = (k: string) => marketIsOpen(k, SETTINGS);
    const porto = typedCity("Porto", open);
    assert.ok(porto && "waitlist" in porto && porto.waitlist.marketKey === "porto");
    const kyoto = typedCity("Kyoto", open);
    assert.ok(kyoto && "market" in kyoto);
    const paris = typedCity("Paris", open);
    assert.ok(paris && "notYet" in paris, "a city we do not operate in is still 'not yet'");
  });

  it("the server's 409 market_not_open maps to the waitlist, with WAIT-1's label", async () => {
    const err = new Error(`409: ${JSON.stringify({ code: "market_not_open", market: "porto" })}`);
    assert.deepEqual(marketNotOpenFrom(err), { market: "porto" });
    assert.equal(marketNotOpenFrom(new Error("409: {\"code\":\"event_ended\"}")), null);
    const out = await mintTripSlip({ destination: "Porto, Portugal" } as any, async () => { throw err; }, { datesOptional: true });
    assert.deepEqual(out, { ok: false, reason: "market_not_open", message: MARKET_STATUS_COPY.waitlist, market: "porto" });
    // A city outside the operating markets (market null): the existing "not planning there" sentence, no waitlist.
    const paris = new Error(`409: ${JSON.stringify({ code: "market_not_open", market: null })}`);
    assert.deepEqual(marketNotOpenFrom(paris), { market: null });
    const outParis = await mintTripSlip({ destination: "Paris, France" } as any, async () => { throw paris; }, { datesOptional: true });
    assert.deepEqual(outParis, { ok: false, reason: "market_not_open", message: "We're not planning in Paris yet." });
    assert.match(src("client/src/contexts/PlanningContext.tsx"), /outcome\.reason === "market_not_open" && outcome\.market\) return \{ ok: false, waitlistMarket: outcome\.market \}/);
    assert.match(src("client/src/components/plan/PlanEntry.tsx"), /data-testid="plan-entry-waitlist-link"/);
  });
});

describe("T3 /destinations cards", () => {
  const render = (props: Partial<React.ComponentProps<typeof CityCard>>) =>
    renderToString(
      <Router ssrPath="/destinations">
        <QueryClientProvider client={client()}>
          <CityCard variant="pulse" cityName="Porto" country="Portugal" score={80} avgPrice="120" primaryLabel="Take me Here" testId="card-city-porto" {...props} />
        </QueryClientProvider>
      </Router>,
    );

  it("no 'Hot' and no '%' on a card; the status label is drawn", () => {
    const html = render({ statusLabel: "Join the waitlist", primaryLabel: MARKET_STATUS_COPY.waitlist });
    assert.doesNotMatch(html, />Hot</);
    assert.doesNotMatch(html.replace(/<style[\s\S]*?<\/style>|style="[^"]*"|class="[^"]*"/g, ""), /%/);
    assert.match(html, /data-testid="card-city-porto-status"[^>]*>Join the waitlist</);
    const grid = src("client/src/components/travelpulse/CityGrid.tsx");
    assert.doesNotMatch(grid, /isHot|priceChangePct|trendingScore > 70/);
    assert.doesNotMatch(src("client/src/components/travelpulse/CityCard.tsx"), /isHot|priceChangePct|>Hot</);
  });

  it("a non-open market's card goes to its waitlist; an open one keeps its link", () => {
    const grid = src("client/src/components/travelpulse/CityGrid.tsx");
    assert.match(grid, /primaryLabel=\{waitlistOnly \? MARKET_STATUS_COPY\.waitlist : "Take me Here"\}/);
    assert.match(grid, /onCardClick=\{waitlistOnly && marketKey \? \(\) => navigate\(waitlistMarketPath\(marketKey\)\) : onClick\}/);
    assert.match(grid, /statusLabel=\{statusLabel\}/);
  });
});

describe("T4 the closed-market city page", () => {
  it("renders header, status, waitlist CTA and apply links, and no feed", () => {
    const html = renderToString(
      <Router ssrPath="/discover/location/Porto">
        <QueryClientProvider client={client()}>
          <ClosedMarketCityView market="porto" cityName="Porto" settings={SETTINGS} />
        </QueryClientProvider>
      </Router>,
    );
    assert.match(html, /data-testid="heading-waitlist-market"[^>]*>Porto</);
    assert.match(html, /data-testid="text-waitlist-market-status"[^>]*>Join the waitlist</);
    assert.match(tagOf(html, "link-city-market-waitlist"), /href="\/waitlist\/porto"/);
    assert.match(tagOf(html, "link-signup-expert"), /href="\/waitlist\/porto#experts"/);
    assert.match(tagOf(html, "link-signup-provider"), /href="\/become-provider\?market=porto"/);
    for (const feed of ["section-gems", "neighborhood", "city-events", "service-card", "wanted"]) {
      assert.doesNotMatch(html, new RegExp(`data-testid="[^"]*${feed}`), feed);
    }
    const page = src("client/src/pages/discover-location.tsx");
    assert.match(page, /if \(data && data\.marketOpen === false && data\.market\) \{/, "one branch at the top of the render");
  });
});

describe("T5 the moments section", () => {
  it("a non-open city's moment links to its waitlist", () => {
    const sec = src("client/src/components/landing/moments-section.tsx");
    assert.match(sec, /moment\.cta === "waitlist" && moment\.market \?/);
    assert.match(sec, /href=\{waitlistMarketPath\(moment\.market\)\}/);
    assert.match(sec, /\{MARKET_STATUS_COPY\.waitlist\}/);
  });
});

describe("T6 no typed Kyoto in the §4h files", () => {
  const FILES = [
    "client/src/components/events/EventsCalendar.tsx",
    "client/src/components/landing/events-strip.tsx",
    "client/src/pages/experts.tsx",
    "client/src/pages/providers-directory.tsx",
    "client/src/pages/earn.tsx",
    "client/src/lib/ready-made-waitlist.ts",
    "client/src/pages/blog-post.tsx",
    "client/src/components/intake-panel.tsx",
    "client/src/lib/company-facts.ts",
    "client/src/lib/waitlist-markets.ts",
  ];
  const code = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .split("\n")
      .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
      .join("\n");
  for (const f of FILES) {
    it(f, () => {
      assert.doesNotMatch(code(src(f)), /Kyoto/, `${f} names Kyoto in code`);
    });
  }
  it("the replacements read the marquee from settings", () => {
    assert.equal(readyMadeWaitlistLabel("kyoto"), "Join the Kyoto waitlist");
    assert.equal(readyMadeWaitlistLabel("porto"), "Join the Porto waitlist");
    assert.equal(readyMadeWaitlistLabel(null), MARKET_STATUS_COPY.waitlist);
    assert.equal(marketsInDisplayOrder(undefined, "goa")[0].marketKey, "goa");
    assert.equal(marketsInDisplayOrder()[0].marketKey, "kyoto", "the copy's order without a marquee");
    assert.equal(waitlistJoinButtonLabel([]), WAITLIST_JOIN_ANY, "no named market ⇒ the approved generic label");
    assert.equal(WAITLIST_JOIN_ANY, "Join the list");
    assert.equal(waitlistJoinButtonLabel(["porto"]), "Join the Porto list");
  });
});

describe("/deals", () => {
  it("lists open-market deals only; a non-open operating city shows its status; other cities are dropped", () => {
    const deals = [
      { id: "1", destination: "Kyoto, Japan" },
      { id: "2", destination: "Porto" },
      { id: "3", destination: "Paris, France" },
      { id: "4", destination: "Porto, Portugal" },
    ];
    const out = dealsForMarkets(deals, SETTINGS);
    assert.deepEqual(out.shown.map((d) => d.id), ["1"]);
    assert.deepEqual(out.closedMarkets, ["porto"]);
  });
});
