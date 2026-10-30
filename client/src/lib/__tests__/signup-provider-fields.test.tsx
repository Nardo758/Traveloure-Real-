/**
 * WL-B screen (ledger `2026-10-30-wlb-provider-signup-screen`): the provider sign-up fields, the expert refusal and the
 * waitlist's expert form. DB-free: pages under react-dom/server, sources read with readFileSync. No git.
 *
 *   S1  the provider intent draws business name, category and city (with the account email); submit stays disabled
 *       until they are in
 *   S2  website and languages are optional
 *   S3  the traveler intent draws no provider field and no WL-B words
 *   S4  the register body carries `supplyRole` and `provider` under the WL-B server contract's names
 *   S5  no PayPal or traveler-fee text on either page
 *   S6/S7/S9  the expert refusal draws the server's message and ONE "Apply Now" link to applyPath ("/kyoto#experts")
 *   S8  a provider or traveler answer draws no refusal
 *   S10 /kyoto has section#experts holding form-expert-waitlist
 *   S11 the expert body: role expert with contactName, email and the picked market ("City you know best" is the
 *       market picker); submit disabled until those are in
 *   S13 the keep sentence is the server's rate; no literal percent in the components
 *   S14 the after-send words carry the name and email and end with the approved payouts sentence
 *   S15 no "founding", PayPal, traveler fee, launch date or reply-time text on the expert surfaces
 *   S12 the traveler and provider waitlist forms still draw
 *   E   a door that states a supply role stays on the account form; other supply doors continue as before
 *
 * Run: node --import ./client/src/lib/__tests__/lc1-css-register.mjs --import tsx --test client/src/lib/__tests__/signup-provider-fields.test.tsx
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { EXPERT_APPLY_NOW, EXPERT_APPLY_NOW_MESSAGE, PROVIDER_FIELDS_REQUIRED, TRAVELER_WAITLIST, providerSignupFieldsSchema } from "@shared/launch-signup";
import { WAITLIST_EXPERT_FORM_PATH, waitlistJoinBodySchema } from "@shared/launch-waitlist";
import { supplySignupContinuation } from "@shared/supply-entry";
import {
  EMPTY_EXPERT_DRAFT,
  EMPTY_PROVIDER_DRAFT,
  WLB_SIGNUP_COPY,
  expertApplicationBody,
  expertApplicationReady,
  expertKeepLine,
  expertRefusalFrom,
  providerKeepLine,
  providerSignupBody,
  providerSignupReady,
} from "../wlb-signup-copy";
import { ExpertForm } from "../../components/waitlist/ExpertWaitlistForm";

(globalThis as any).React = React;
const origWindow = (globalThis as any).window;

async function renderSignup(search: string): Promise<string> {
  (globalThis as any).window = { location: { search, replace() {}, assign() {} } };
  const { SignupPage } = await import("../../pages/Signup");
  return renderToString(<SignupPage />);
}
function renderPage(node: React.ReactElement): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, enabled: false } } });
  return renderToString(<Router ssrPath="/kyoto"><QueryClientProvider client={client}>{node}</QueryClientProvider></Router>);
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
const SIGNUP_SRC = fs.readFileSync("client/src/pages/Signup.tsx", "utf8");
const WAITLIST_SRC = fs.readFileSync("client/src/pages/launch-waitlist.tsx", "utf8");
const COPY_SRC = fs.readFileSync("client/src/lib/wlb-signup-copy.ts", "utf8");
const FORM_SRC = fs.readFileSync("client/src/components/waitlist/ExpertWaitlistForm.tsx", "utf8");

before(() => { (globalThis as any).window = { location: { search: "", replace() {}, assign() {} } }; });
after(() => { (globalThis as any).window = origWindow; });

describe("WL-B screen: provider sign-up", () => {
  it("S1/S2 the provider fields draw; the button waits for the required ones", async () => {
    const html = await renderSignup("?intent=supply&supplyRole=provider");
    for (const id of ["input-provider-business", "input-provider-category", "input-provider-city", "input-provider-website", "input-provider-languages"]) {
      assert.ok(html.includes(`data-testid="${id}"`), id);
    }
    for (const label of [WLB_SIGNUP_COPY.businessName, WLB_SIGNUP_COPY.category, WLB_SIGNUP_COPY.city, WLB_SIGNUP_COPY.website, WLB_SIGNUP_COPY.languages, WLB_SIGNUP_COPY.finishProfileLater]) {
      assert.ok(html.includes(label.replace(/'/g, "&#x27;")), label);
    }
    assert.ok(html.includes('value="venue"'), "venue is a category");
    assert.match(html, /data-testid="button-create-account"[^>]*disabled=""/);
    assert.equal(providerSignupReady(EMPTY_PROVIDER_DRAFT, "a@example.com"), false);
    const full = { ...EMPTY_PROVIDER_DRAFT, businessName: "Fixture Tours", category: "venue", city: "Kyoto" };
    assert.equal(providerSignupReady(full, "a@example.com"), true, "website and languages are optional");
    assert.equal(providerSignupReady(full, ""), false, "the email is required");
  });

  it("S3 the traveler page draws no provider field", async () => {
    const html = await renderSignup("");
    assert.equal(html.includes("signup-provider-fields"), false);
    assert.equal(html.includes(WLB_SIGNUP_COPY.finishProfileLater), false);
    assert.doesNotMatch(html, /data-testid="button-create-account"[^>]*disabled=""/);
  });

  it("S4 the body matches the server contract", () => {
    const body = providerSignupBody({ businessName: " Fixture Tours ", category: "venue", city: "Kyoto", website: "", languages: "Japanese" });
    assert.deepEqual(body, { businessName: "Fixture Tours", category: "venue", city: "Kyoto", languages: "Japanese" });
    assert.ok(providerSignupFieldsSchema.safeParse(body).success);
    assert.match(SIGNUP_SRC, /\.\.\.\(supplyRole \? \{ supplyRole \} : \{\}\)/);
    assert.match(SIGNUP_SRC, /provider: providerSignupBody\(provider\)/);
  });

  it("S13 keep lines are the server's rates, never literals", () => {
    assert.equal(providerKeepLine({ providerPlatformRate: 0.1 }), "Providers keep 90%. Paid through Stripe.");
    assert.equal(providerKeepLine({ providerPlatformRate: null }), null);
    assert.equal(expertKeepLine({ expertPlatformRate: 0.15 }), "You keep 85% of what you earn.");
    assert.equal(expertKeepLine({}), null);
    for (const src of [SIGNUP_SRC, WAITLIST_SRC, COPY_SRC, FORM_SRC]) assert.doesNotMatch(strip(src), /\b(85|90)%/);
  });
});

describe("WL-B screen: the expert refusal", () => {
  it("S6/S7/S9 the server's message and one Apply Now link to applyPath", () => {
    const refusal = expertRefusalFrom(403, { allowed: false, reason: EXPERT_APPLY_NOW, message: EXPERT_APPLY_NOW_MESSAGE, applyPath: WAITLIST_EXPERT_FORM_PATH });
    assert.deepEqual(refusal, { message: EXPERT_APPLY_NOW_MESSAGE, applyPath: "/kyoto#experts" });
    assert.ok(WAITLIST_EXPERT_FORM_PATH.length > 0);
    assert.equal(WLB_SIGNUP_COPY.applyNow, "Apply Now");
    const block = SIGNUP_SRC.slice(SIGNUP_SRC.indexOf("if (expertRefusal) {"), SIGNUP_SRC.indexOf("const providerKeep"));
    assert.match(block, /href=\{expertRefusal\.applyPath\}/);
    assert.equal((block.match(/<a\b/g) ?? []).length, 1, "one button");
    assert.doesNotMatch(block, /<input|<button|handleSubmit/, "no sign-up form stays submittable");
  });

  it("S8 other answers draw no refusal", () => {
    assert.equal(expertRefusalFrom(403, { allowed: false, reason: PROVIDER_FIELDS_REQUIRED }), null);
    assert.equal(expertRefusalFrom(403, { code: TRAVELER_WAITLIST }), null);
    assert.equal(expertRefusalFrom(202, { reason: EXPERT_APPLY_NOW, message: "x" }), null);
  });

  it("E a stated supply role stays on the account form", () => {
    assert.deepEqual(supplySignupContinuation("?intent=supply&supplyRole=provider"), { kind: "account" });
    assert.deepEqual(supplySignupContinuation("?intent=supply&supplyRole=expert"), { kind: "account" });
    assert.equal(supplySignupContinuation("?intent=supply").kind, "chooser");
    assert.equal(supplySignupContinuation("?intent=supply&role=service_provider").kind, "application");
  });
});

describe("WL-B screen: the waitlist expert form", () => {
  it("S10 /kyoto carries section#experts with the form after #providers", () => {
    const providers = WAITLIST_SRC.indexOf('id="providers"');
    const experts = WAITLIST_SRC.indexOf('id="experts"');
    assert.ok(providers > 0 && experts > providers);
    assert.match(WAITLIST_SRC.slice(experts), /<ExpertWaitlistForm /);
    assert.match(WAITLIST_SRC, /href="#experts"/);
    const html = renderPage(<ExpertForm source={null} launchMarket="kyoto" keepRates={{ expertPlatformRate: 0.15 }} />);
    assert.ok(html.includes('data-testid="form-expert-waitlist"'));
    assert.ok(html.includes("You keep 85% of what you earn."), "the server's rate");
    assert.ok(html.includes(WLB_SIGNUP_COPY.expertSublineLead("Kyoto")));
    assert.match(html, /<select[^>]*data-testid="input-expert-city"/, "the city is the market picker");
    assert.ok(html.includes(WLB_SIGNUP_COPY.expertCity));
    assert.match(html, /<button[^>]*disabled=""[^>]*data-testid="button-expert-waitlist-send"|<button[^>]*data-testid="button-expert-waitlist-send"[^>]*disabled=""/);
    const noRate = renderPage(<ExpertForm source={null} launchMarket="kyoto" keepRates={null} />);
    assert.equal(noRate.includes("You keep"), false, "an unreadable rate leaves the sentence out");
  });

  it("S11 the expert body", () => {
    assert.equal(expertApplicationReady(EMPTY_EXPERT_DRAFT), false);
    const d = { ...EMPTY_EXPERT_DRAFT, contactName: "Fixture Expert", email: "expert@example.com", market: "kyoto" };
    assert.equal(expertApplicationReady(d), true);
    const body = expertApplicationBody(d);
    assert.deepEqual(body, { role: "expert", contactName: "Fixture Expert", email: "expert@example.com", market: "kyoto" });
    assert.ok(waitlistJoinBodySchema.safeParse({ ...body, consent: true }).success);
    assert.ok(waitlistJoinBodySchema.safeParse({ ...expertApplicationBody({ ...d, languages: "Japanese", link: "https://example.com" }), consent: true }).success);
  });

  it("S14 the after-send words", () => {
    assert.equal(WLB_SIGNUP_COPY.expertDoneHeading, "Application received");
    assert.equal(
      WLB_SIGNUP_COPY.expertDoneBody("Aki", "aki@example.com"),
      "Thanks, Aki. We review every application by hand and will email you at aki@example.com with next steps.",
    );
    assert.equal(WLB_SIGNUP_COPY.expertPayouts, "Payouts go to your bank through Stripe.");
    assert.match(FORM_SRC, /expertDoneBody\(sent\.name, sent\.email\)\} \{WLB_SIGNUP_COPY\.expertPayouts\}/);
  });

  it("S5/S15 no PayPal, traveler fee, founding, launch date or reply-time text", () => {
    const words = Object.values(WLB_SIGNUP_COPY).map((v) => (typeof v === "function" ? (v as any)("X", "Y") : v)).join(" ") + EXPERT_APPLY_NOW_MESSAGE;
    assert.doesNotMatch(words, /paypal|traveler fee|service fee|founding|within \d|hours?\b|days?\b|202\d|launch date/i);
    for (const src of [SIGNUP_SRC, WAITLIST_SRC, FORM_SRC]) assert.doesNotMatch(strip(src), /PayPal/i);
  });

  it("S12 the traveler and provider waitlist forms still draw", () => {
    assert.match(WAITLIST_SRC, /<TravelerForm /);
    assert.match(WAITLIST_SRC, /<ProviderForm /);
    assert.match(WAITLIST_SRC, /data-testid="form-provider-waitlist"/);
  });
});
