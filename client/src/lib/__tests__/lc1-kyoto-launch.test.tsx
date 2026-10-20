/**
 * LC-1 Kyoto launch copy (ledger `2026-10-20-lc1-kyoto-launch-copy`).
 *
 *   LC1  /experts with [] renders the empty line and apply button, and no spinner; the same on error
 *   LC2  /providers with no rows renders its empty line and apply button, and the visible text never has "0"
 *   LC3  public page/component source contains none of the retired launch strings
 *   LC4  a JPY partner amount never renders "$" and is not matched by a dollar price band
 *
 * Run (the css hook lets the page import CityTickerTape's stylesheet under tsx):
 *   node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/lc1-kyoto-launch.test.tsx
 */
import "./lc1-dom-stub";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { PlanningProvider } from "../../contexts/PlanningContext";
import ExpertsPage from "../../pages/experts";
import ProvidersDirectoryPage from "../../pages/providers-directory";
import { kyotoExpertsSectionVisible } from "../../pages/launch-waitlist";
import { kyotoPageEvents } from "../../components/landing/events-strip";
import { formatSourceAmount, partnerActivityPriceLabel } from "../partner-price";
import { priceMatches } from "../tile-price";
import { queryClient as appQueryClient } from "../queryClient";
import type { CityEventCard } from "@shared/city-events";

(globalThis as any).React = React;

const EXPERTS_KEY = ["/api/experts", "", "", "All Destinations", "local_expert", false] as const;
const EMPTY_EXPERTS = "No Kyoto experts are listed yet. Know Kyoto well? Apply to plan trips for travelers.";
const EMPTY_PROVIDERS = "No Kyoto businesses are listed yet. Run a tour, venue or service in Kyoto? Apply to list it.";
const JPY_PLACEHOLDER = 12345;

const text = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const clients: QueryClient[] = [];

function client() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        staleTime: Infinity,
        // The default five-minute gc timer keeps the test process alive.
        gcTime: Infinity,
      },
    },
  });
  clients.push(qc);
  return qc;
}

after(() => {
  for (const qc of clients) qc.clear();
  appQueryClient.clear();
});

function renderExperts(qc: QueryClient) {
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/experts">
        <ExpertsPage />
      </Router>
    </QueryClientProvider>,
  );
}

function renderProviders(qc: QueryClient) {
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/providers">
        <PlanningProvider>
          <ProvidersDirectoryPage />
        </PlanningProvider>
      </Router>
    </QueryClientProvider>,
  );
}

describe("LC1 experts empty", () => {
  it("[] renders the empty line and button, and no spinner", () => {
    const qc = client();
    qc.setQueryData([...EXPERTS_KEY], []);
    const html = renderExperts(qc);
    const t = text(html);
    assert.ok(t.includes(EMPTY_EXPERTS), "empty line");
    assert.ok(t.includes("Apply as a Kyoto expert"), "apply button");
    assert.ok(html.includes('data-testid="button-apply-kyoto-expert"'));
    assert.ok(!t.includes("Loading experts..."), "no spinner copy");
    assert.ok(!html.includes('data-testid="experts-loading"'), "no spinner");
  });

  it("an error ends loading the same way", async () => {
    const qc = client();
    await qc
      .fetchQuery({
        queryKey: [...EXPERTS_KEY],
        queryFn: async () => {
          throw new Error("experts failed");
        },
      })
      .catch(() => undefined);
    const html = renderExperts(qc);
    const t = text(html);
    assert.ok(t.includes(EMPTY_EXPERTS), "empty line on error");
    assert.ok(t.includes("Apply as a Kyoto expert"));
    assert.ok(!t.includes("Loading experts..."));
    assert.ok(!html.includes('data-testid="experts-loading"'));
  });
});

describe("LC2 providers empty", () => {
  it("no rows renders the empty line and never a visible 0", () => {
    const qc = client();
    qc.setQueryData(["/api/provider-storefronts"], []);
    const html = renderProviders(qc);
    const t = text(html);
    assert.ok(t.includes(EMPTY_PROVIDERS), "empty line");
    assert.ok(t.includes("Apply as a Kyoto provider"), "apply button");
    assert.ok(html.includes('href="/become-provider"'));
    assert.ok(!/\b0\b/.test(t), `visible text must not contain 0: ${t}`);
  });
});

describe("LC3 public copy", () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  function pages(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "__tests__" || name === "node_modules") continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx|jsx)$/.test(name)) out.push(p);
      }
    };
    walk("client/src/pages");
    walk("client/src/components");
    return out;
  }

  const FORBIDDEN = [
    "eight cities",
    "no middleman",
    "$3,000",
    "2.9% + $0.30",
    "What's coming",
    "warming up",
    "GOA AT SUNSET",
  ];

  it("no public page source contains the retired strings", () => {
    const hits: string[] = [];
    for (const file of pages()) {
      const copy = stripComments(readFileSync(file, "utf8"));
      for (const phrase of FORBIDDEN) {
        if (copy.toLowerCase().includes(phrase.toLowerCase())) hits.push(`${file}: ${phrase}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it("the Kyoto expert section keeps the live wording and hides when nobody is public", () => {
    const src = readFileSync("client/src/pages/launch-waitlist.tsx", "utf8");
    assert.ok(src.includes("Local experts in Kyoto"));
    assert.ok(src.includes("Kyoto experts on Traveloure can:"));
    assert.equal(kyotoExpertsSectionVisible([], true), false);
    assert.equal(kyotoExpertsSectionVisible(null, false), false);
    assert.equal(kyotoExpertsSectionVisible([{ id: "e1" }], true), true);
  });
});

describe("LC4 partner currency", () => {
  const jpy = {
    kind: "supply-activity",
    data: { price: JPY_PLACEHOLDER, currency: "JPY" },
  };
  const usd = { kind: "supply-activity", data: { price: 40, currency: "USD" } };
  const unstated = { kind: "supply-activity", data: { price: JPY_PLACEHOLDER, currency: null } };

  it("a JPY amount renders in yen and is skipped by dollar bands", () => {
    const label = formatSourceAmount(JPY_PLACEHOLDER, "JPY");
    assert.ok(label, "formatted");
    assert.ok(!label!.includes("$"), label);
    assert.ok(label!.includes("¥") || label!.includes("JPY"), label);
    assert.equal(partnerActivityPriceLabel(JPY_PLACEHOLDER, "JPY", "See current price"), label);
    for (const band of ["under50", "50to150", "over150"]) {
      assert.equal(priceMatches(jpy, band), false, band);
    }
    assert.equal(priceMatches(jpy, "any"), true);
  });

  it("an amount with no currency says See current price and is outside dollar bands", () => {
    assert.equal(partnerActivityPriceLabel(JPY_PLACEHOLDER, null, "See current price"), "See current price");
    assert.equal(formatSourceAmount(JPY_PLACEHOLDER, null), null);
    for (const band of ["under50", "50to150", "over150"]) {
      assert.equal(priceMatches(unstated, band), false, band);
    }
  });

  it("a USD amount still matches its dollar band", () => {
    assert.equal(priceMatches(usd, "under50"), true);
    assert.equal(priceMatches(usd, "over150"), false);
    const label = formatSourceAmount(40, "USD");
    assert.equal(label?.includes("$"), true);
  });
});

describe("Kyoto event strip", () => {
  it("drops a dated event outside the Kyoto market", () => {
    const cards = [
      { id: "in", marketKey: "kyoto", outsideCity: false, title: "In the city" },
      { id: "out", marketKey: "kyoto", outsideCity: true, title: "Max Richter Live" },
      { id: "else", marketKey: "mumbai", outsideCity: false, title: "Elsewhere" },
    ] as CityEventCard[];
    assert.deepEqual(kyotoPageEvents(cards).map((c) => c.id), ["in"]);
  });
});
