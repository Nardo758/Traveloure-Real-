/**
 * COPY-1 (ledger `2026-11-04-copy1-exp-qa-swaps`): Marketing's EXP-QA swaps and the lines the group review flagged.
 *
 *   T1 each swap: the new text is at its cite and the old text is gone; no new string hits the never-say list
 *   T2 waitlist mode: the billboard's "Book on Traveloure" slot label and how-it-works step 3 are absent; open: present
 *   T3 expertsLive false ⇒ the footer tagline and the how-it-works "someone who lives there" sentence are omitted;
 *      true ⇒ present (the signup-mode answer is mocked)
 *
 * Harness: renderToString with a seeded query cache, pure helpers, and source asserts where a page needs a browser.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-copy1.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { siteNeverSayHits } from "@shared/banned-copy";
import { HowItWorks } from "@/components/landing/how-it-works";
import { homeHowItWorksSteps } from "@/lib/how-it-works-steps";
import { SIGNUP_MODE_QUERY_KEY, expertsLiveFrom } from "@/lib/signup-mode";
import { WLB_SIGNUP_COPY } from "@/lib/wlb-signup-copy";

(globalThis as any).React = React;

const src = (p: string) => fs.readFileSync(p, "utf8");

const SWAPS: Array<{ file: string; now: string; was: string }> = [
  { file: "server/services/landing-moments.ts", now: "The spot, the photographer, the dinner after — planned privately.", was: "the ring stays your secret" },
  { file: "server/services/landing-moments.ts", now: "A photographer out of sight; dinner planned for after.", was: "kaiseki booked for after" },
  { file: "server/services/logistics-presets.service.ts", now: 'label: "Photographer",', was: "Secret Photographer" },
  { file: "server/seed-experience-types.ts", now: "Plan the proposal: the place, the moment, the dinner after.", was: "Plan the perfect proposal" },
  { file: "client/src/locales/en/nav.json", now: '"subhead": "Tell us the occasion and the city. We build the plan around it."', was: "someone who lives there does the rest" },
  { file: "client/src/components/landing/landing-hero.tsx", now: '"Tell us the occasion and the city. We build the plan around it."', was: "someone who lives there does the rest" },
  { file: "client/src/pages/discover.tsx", now: 'subtitle: "Itineraries built by local experts.",', was: "Buy the plan and travel it your way" },
  { file: "client/src/lib/wlb-signup-copy.ts", now: 'expertCity: "City you know",', was: 'expertCity: "City you know best"' },
];

function client(answer: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData([...SIGNUP_MODE_QUERY_KEY], answer);
  return qc;
}

describe("T1 the swaps", () => {
  for (const s of SWAPS) {
    it(`${s.file}: ${s.now}`, () => {
      const text = src(s.file);
      assert.ok(text.includes(s.now), "the new text is at its cite");
      assert.ok(!text.includes(s.was), "the old text is gone");
      assert.deepEqual(siteNeverSayHits(s.now), [], "no never-say hit");
    });
  }
  it("the Japanese subhead drops the same clause (Leon may reword it)", () => {
    const ja = JSON.parse(src("client/src/locales/ja/nav.json"));
    assert.equal(ja.hero.subhead, "目的と都市を教えてください。私たちがそれに合わせてプランを作ります。");
    assert.ok(!src("client/src/locales/ja/nav.json").includes("現地に住む人が残りを引き受けます"));
  });
  it("the expert form label is the new one", () => {
    assert.equal(WLB_SIGNUP_COPY.expertCity, "City you know");
  });
  it("the guest map line (row 11, ENTRY-1) is unchanged", () => {
    assert.ok(src("client/src/lib/guest-map.ts").includes("Your answers are kept."));
  });
});

describe("T2 waitlist mode hides the booking promises", () => {
  const render = (mode: "waitlist" | "open") =>
    renderToString(
      <QueryClientProvider client={client({ mode, launchMarketSlug: "kyoto", expertsLive: false })}>
        <Router ssrPath="/">
          <HowItWorks />
        </Router>
      </QueryClientProvider>,
    );

  it("how-it-works: waitlist reads 1 Pick → 2 Plan; open adds 3 Hand off or book", () => {
    assert.deepEqual(homeHowItWorksSteps("waitlist").map((s) => s.title), ["Pick", "Plan"]);
    assert.deepEqual(homeHowItWorksSteps("open").map((s) => s.title), ["Pick", "Plan", "Hand off or book"]);
    assert.doesNotMatch(render("waitlist"), /Hand off or book/);
    assert.match(render("open"), /Hand off or book/);
  });

  it("the billboard's third slot has no label in waitlist mode, and keeps its line", () => {
    const hero = src("client/src/components/landing/landing-hero.tsx");
    assert.match(hero, /mode === "open" \? t\("hero\.billboard\.slotBookOnTraveloure", "Book on Traveloure"\)\.toUpperCase\(\) : null/);
    assert.match(hero, /\{label \?\? "\\u00a0"\}/, "an absent label keeps the line's height");
  });
});

describe("T3 local-expert lines need an approved expert in the launch market", () => {
  it("only an explicit true lights them", () => {
    assert.equal(expertsLiveFrom({ mode: "waitlist", launchMarketSlug: "kyoto", expertsLive: true }), true);
    assert.equal(expertsLiveFrom({ mode: "waitlist", launchMarketSlug: "kyoto", expertsLive: false }), false);
    assert.equal(expertsLiveFrom({ mode: "waitlist", launchMarketSlug: "kyoto" }), false, "absent ⇒ omitted");
    assert.equal(expertsLiveFrom(undefined), false, "unread ⇒ omitted");
  });

  it("the footer tagline and the how-it-works sentence are gated, and omitted (not replaced) when false", () => {
    const layout = src("client/src/components/layout.tsx");
    assert.match(layout, /\{expertsLive && \(\s*<p[^>]*data-testid="footer-tagline">\s*\{t\("footer\.tagline"\)\}/);
    const page = src("client/src/pages/how-it-works.tsx");
    assert.match(page, /expertsLive\s*\?\s*"From an idea to a plan you can use, in four steps\. Build it yourself, sharpen it with Optimize, or hand it to someone who lives there\."\s*:\s*"From an idea to a plan you can use, in four steps\."/);
    assert.ok(JSON.parse(src("client/src/locales/en/nav.json")).footer.tagline.includes("someone who lives there"), "F1 kept as written");
  });
});
