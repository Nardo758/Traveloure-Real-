/**
 * WAIT-1 (ledger `2026-11-04-wait1-all-markets`): one waitlist for every operating market.
 *
 *   T4 /kyoto redirects to /waitlist/kyoto (query and hash kept); /waitlist is the marquee; /waitlist/porto is Porto
 *      with its status ("Join the waitlist") and both apply links, and no listings or sample items
 *   T5 the sign-up row draws three columns; experts and providers show the keep line from the rates; travelers have
 *      no "%" and no "$"
 *   T6 the hero pill reads the live-markets answer: beta ⇒ "Now in beta in Kyoto"; live ⇒ "Now live in Kyoto"
 *   T7 every new string: no never-say phrase, no "coming", no "founding", no PayPal, no fee line
 *
 * Harness: react-dom/server renderToString and pure helpers; source asserts where a route or a page would need a
 * browser.
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/row-wait1.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { siteNeverSayHits } from "@shared/banned-copy";
import { HERO_PILL_COPY, MARKET_STATUS_COPY, heroMarketPill } from "@shared/ticker";
import { WAITLIST_EXPERT_FORM_PATH } from "@shared/launch-waitlist";
import {
  WAITLIST_JOIN_ANY,
  WAITLIST_SIGNUP_ROW_COPY,
  becomeProviderHref,
  kyotoWaitlistTarget,
  statusSettingsFrom,
  toggleWaitlistMarket,
  waitlistJoinButtonLabel,
  waitlistPageMarket,
} from "@/lib/waitlist-markets";
import { OtherMarketWaitlistHeader, WaitlistSignupRow } from "@/components/waitlist/WaitlistMarkets";

(globalThis as any).React = React;

const src = (p: string) => fs.readFileSync(p, "utf8");
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const render = (node: React.ReactElement) => renderToString(<Router ssrPath="/waitlist/porto">{node}</Router>);
const SETTINGS = statusSettingsFrom({ marketKeys: ["kyoto"], launch: "kyoto", live: [], beta: ["kyoto"], dates: {} });
const RATES = { expertPlatformRate: 0.15, providerPlatformRate: 0.1 };

describe("T4 the waitlist routes", () => {
  it("/kyoto redirects, /waitlist is the marquee, /waitlist/porto is Porto with no listings", () => {
    assert.equal(kyotoWaitlistTarget("", ""), "/waitlist/kyoto");
    assert.equal(kyotoWaitlistTarget("?blocked=1", "#join"), "/waitlist/kyoto?blocked=1#join");
    assert.equal(kyotoWaitlistTarget("", "#experts"), "/waitlist/kyoto#experts");
    assert.equal(WAITLIST_EXPERT_FORM_PATH, "/waitlist/kyoto#experts");
    const app = src("client/src/App.tsx");
    assert.match(app, /<Route path="\/waitlist">/);
    assert.match(app, /<Route path="\/waitlist\/:market">/);
    assert.match(app, /<Route path="\/kyoto">\s*<KyotoWaitlistRedirect \/>/);
    assert.ok(src("shared/client-routes.generated.ts").includes('"/waitlist/:market"'));

    assert.equal(waitlistPageMarket(undefined, "kyoto"), "kyoto", "/waitlist is the marquee");
    assert.equal(waitlistPageMarket("porto", "kyoto"), "porto");
    assert.equal(waitlistPageMarket("atlantis", "kyoto"), null, "an unknown market is never guessed");

    const html = render(<OtherMarketWaitlistHeader market="porto" cityName="Porto" settings={SETTINGS} keepRates={RATES} />);
    assert.match(html, /data-testid="heading-waitlist-market"[^>]*>Porto</);
    assert.match(html, /data-testid="text-waitlist-market-status"[^>]*data-status="waitlist"[^>]*>Join the waitlist</);
    assert.match(html, /href="#experts"/, "the expert apply link");
    assert.match(html, new RegExp(`href="${becomeProviderHref("porto").replace(/[?]/g, "\\?")}"`), "the provider apply link");
    assert.doesNotMatch(html, /listing|sample|data-testid="(card|tile|bento)-/i, "no listings or sample items");
  });
});

describe("T5 the sign-up row", () => {
  it("three columns; keep lines for experts and providers only", () => {
    const html = render(<WaitlistSignupRow market="kyoto" cityName="Kyoto" keepRates={RATES} />);
    for (const id of ["signup-col-traveler", "signup-col-expert", "signup-col-provider"]) assert.match(html, new RegExp(`data-testid="${id}"`), id);
    assert.match(html, /sm:grid-cols-3/, "side by side, stacking under 640px");
    assert.match(html, /data-testid="text-signup-expert-keep"[^>]*>Experts and planners keep 85% of your planning fee\.</);
    assert.match(html, /data-testid="text-signup-provider-keep"[^>]*>Providers keep 90% \(10%\)\.</);
    const traveler = html.slice(html.indexOf('data-testid="signup-col-traveler"'), html.indexOf('data-testid="signup-col-expert"'));
    assert.doesNotMatch(traveler, /[%$]/, "no money line for travelers");
    assert.match(html, /href="\/become-provider\?market=kyoto"/);
    const noRates = render(<WaitlistSignupRow market="kyoto" cityName="Kyoto" keepRates={null} />);
    assert.doesNotMatch(noRates, /text-signup-(expert|provider)-keep/, "an unreadable rate shows no number");
  });
});

describe("T6 the hero pill", () => {
  it("reads the live-markets answer", () => {
    assert.equal(heroMarketPill(statusSettingsFrom({ launch: "kyoto", live: [], beta: ["kyoto"], dates: {} })), "Now in beta in Kyoto");
    assert.equal(heroMarketPill(statusSettingsFrom({ launch: "kyoto", live: ["kyoto"], beta: ["kyoto"], dates: {} })), "Now live in Kyoto");
    assert.equal(heroMarketPill(statusSettingsFrom(undefined)), null, "no answer, no pill");
    const hero = src("client/src/components/landing/landing-hero.tsx");
    assert.match(hero, /heroMarketPill\(marketSettings\)/);
    assert.doesNotMatch(hero, />\s*Now in beta in Kyoto\s*</, "the pill is no longer a literal");
    assert.match(hero, /href="\/destinations"[\s\S]{0,200}HERO_PILL_COPY\.elsewhere/);
    assert.doesNotMatch(hero, /marketKey === "kyoto"/, "the ticker follows the marquee, not a hard-coded city");
  });
});

describe("T7 the new strings", () => {
  it("clear of the never-say list, 'coming', 'founding', PayPal and fees", () => {
    const strings = [
      ...Object.values(MARKET_STATUS_COPY).map((v) => (typeof v === "function" ? v("March 2027") : v)),
      HERO_PILL_COPY.live("Kyoto"),
      HERO_PILL_COPY.beta("Kyoto"),
      HERO_PILL_COPY.elsewhere,
      WAITLIST_JOIN_ANY,
      ...Object.values(WAITLIST_SIGNUP_ROW_COPY).map((v) => (typeof v === "function" ? v("Kyoto") : v)),
    ];
    for (const s of strings) {
      assert.deepEqual(siteNeverSayHits(s), [], s);
      assert.doesNotMatch(s, /coming|founding|paypal|fee|\$|%/i, s);
    }
    assert.equal(waitlistJoinButtonLabel(["kyoto"]), "Join the Kyoto list");
    assert.equal(waitlistJoinButtonLabel(["kyoto", "porto"]), WAITLIST_JOIN_ANY);
    assert.deepEqual(toggleWaitlistMarket(["kyoto"], "kyoto"), ["kyoto"], "the last market stays ticked");
    assert.deepEqual(toggleWaitlistMarket(["kyoto"], "porto"), ["kyoto", "porto"]);
  });
});
