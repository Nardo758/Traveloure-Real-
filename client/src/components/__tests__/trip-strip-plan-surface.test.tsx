/**
 * Cut-list #1 header fix v2 — the Trip Strip is THE plan surface (decision-maker Leon Dixon, Nov 11, 2026).
 *
 *   V1 a guest chip renders the approved label as a link to /plans/new, never a ProtectedRoute path
 *   V2 a member chip links the date-derived planning route; the label is NOT truncated
 *   V3 "Add dates" is the ONE dates panel's trigger (HeaderDatesPopover), a sibling of the label, never nested
 *   V4 a 0-stop plan reads "Start a plan" and REOPENS that plan (a link, never a modal)
 *   V5 the lock hides Edit, the label link AND the dates popover; the label stays as text
 *   V6 Edit is signed-in-and-bound only; a guest never gets it; "Continue planning ›" and "View plan" are gone
 *   V7 no plan state and no context ⇒ nothing; the pre-v2 context strip still renders its lead
 *   V8 the strip is sticky under the nav on the ONE chrome height variable, and the nav reads the same variable
 *   V9 the nav's "Start a plan" renders only in the start state, on both mounts; HeaderPlanCTA is gone
 *
 * Harness: react-dom/server renderToString (the trip-strip-lead.test.tsx posture).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
(globalThis as any).React = React;

import { TripStrip } from "../trip/trip-strip";
import { PlanningProvider } from "../../contexts/PlanningContext";
import { SignInModalProvider } from "../../contexts/SignInModalContext";
import type { HeaderDatesTarget, HeaderPlanState } from "@/lib/header-plan";

function render(
  props: { planState?: HeaderPlanState; datesTarget?: HeaderDatesTarget | null; signedIn?: boolean },
  opts: { ctx?: Record<string, unknown>; path?: string; cart?: { itemCount: number; total: string } } = {},
): string {
  store.clear();
  if (opts.ctx) store.set("experienceContext", JSON.stringify(opts.ctx));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  if (opts.cart) client.setQueryData(["/api/cart"], opts.cart);
  return renderToString(
    <QueryClientProvider client={client}>
      <Router ssrPath={opts.path ?? "/discover/location/Kyoto"}>
        <SignInModalProvider>
          <PlanningProvider>
            <TripStrip {...props} />
          </PlanningProvider>
        </SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const guestChip: HeaderPlanState = { kind: "chip", planId: "gp-1", city: "Kyoto", stops: 3, dates: null, guest: true };
const memberChip: HeaderPlanState = { kind: "chip", planId: "t1", city: "Kyoto", stops: 2, dates: "Nov 12–15", guest: false };
const target: HeaderDatesTarget = { guest: false, planId: "t1", startDate: "2026-11-12", endDate: "2026-11-15", datesConfirmed: true };

const planLink = (out: string) => out.match(/<a\b[^>]*data-testid="trip-strip-plan-link"[^>]*>([\s\S]*?)<\/a>/);
const label = (out: string) => (out.match(/data-testid="trip-strip-plan-label"[^>]*>([^<]*)<\/span>/) ?? [])[1];

describe("V1/V2 the label is the link", () => {
  it("a guest chip links /plans/new and prints the approved label", () => {
    const out = render({ planState: guestChip });
    const a = planLink(out);
    assert.ok(a, "the label is a link");
    assert.match(a![0], /href="\/plans\/new"/);
    assert.doesNotMatch(a![0], /href="\/plans\/gp-1"/, "never the ProtectedRoute path for a guest");
    assert.equal(label(out), "Your Kyoto plan · 3");
    assert.match(out, /data-testid="trip-strip-plan-dates"[^>]*>Add dates</, "unconfirmed dates ⇒ Add dates");
  });
  it("a member chip links the planning route, with no truncation class on the label", () => {
    const out = render({ planState: memberChip, datesTarget: target, signedIn: true });
    const a = planLink(out);
    assert.ok(a);
    assert.match(a![0], /href="\/plans\/t1"/);
    assert.doesNotMatch(a![0], /truncate|max-w-\[/, "the strip has the row: the label is never cut");
    assert.equal(label(out), "Your Kyoto plan · 2");
    const noCity = render({ planState: { ...memberChip, city: null } });
    assert.equal(label(noCity), "Your plan · 2");
  });
  it("a plan whose end has passed links the Trip Card (ruling 2, date-derived)", () => {
    const past: HeaderDatesTarget = { ...target, endDate: "2020-01-01" };
    const out = render({ planState: memberChip, datesTarget: past, signedIn: true });
    assert.match(planLink(out)![0], /href="\/trip\/t1"/);
  });
});

describe("V3 the dates segment", () => {
  it("is a sibling button opening the one panel, never nested in the label link", () => {
    const out = render({ planState: memberChip, datesTarget: target, signedIn: true });
    assert.match(out, /<button[^>]*data-testid="trip-strip-plan-dates"[^>]*>Nov 12–15<\/button>/);
    for (const body of Array.from(out.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g), (m) => m[1])) assert.doesNotMatch(body, /<(a|button)\b/);
  });
  it("with no target the dates are text", () => {
    const out = render({ planState: { ...memberChip, dates: null } });
    assert.match(out, /<span[^>]*data-testid="trip-strip-plan-dates"[^>]*>Add dates<\/span>/);
  });
});

describe("V4 a 0-stop plan reopens", () => {
  it("reads Start a plan and links the plan, as a link and not a modal", () => {
    const out = render({ planState: { kind: "resume", planId: "gp-1", city: "Kyoto", guest: true } });
    assert.equal(label(out), "Start a plan");
    assert.match(planLink(out)![0], /href="\/plans\/new"/);
    assert.doesNotMatch(out, /trip-strip-plan-dates/, "no dates line on a 0-stop plan");
  });
});

describe("V5 the payment lock", () => {
  it("hides Edit, the label link and the dates popover; the label stays as text", () => {
    const out = render({ planState: memberChip, datesTarget: target, signedIn: true }, { path: "/checkout", ctx: { tripId: "t1", destination: "Kyoto" } });
    assert.match(out, /data-testid="trip-strip-locked"/);
    assert.equal(planLink(out), null, "no link under the lock");
    assert.equal(label(out), "Your Kyoto plan · 2");
    assert.doesNotMatch(out, /<button[^>]*data-testid="trip-strip-plan-dates"/, "no popover under the lock");
    assert.doesNotMatch(out, /trip-strip-edit/);
  });
});

describe("V6 the control set", () => {
  it("Edit only for a signed-in, bound member; never for a guest; the retired controls are gone", () => {
    const bound = render({ planState: memberChip, datesTarget: target, signedIn: true }, { ctx: { tripId: "t1", destination: "Kyoto" } });
    assert.match(bound, /data-testid="trip-strip-edit-plan"[^>]*>Edit</);
    const unbound = render({ planState: memberChip, signedIn: true });
    assert.doesNotMatch(unbound, /trip-strip-edit/);
    const guest = render({ planState: guestChip }, { ctx: { tripId: "gp-1" } });
    assert.doesNotMatch(guest, /trip-strip-edit/);
    // The retired controls never render (the source may still NAME them in a comment).
    assert.doesNotMatch(bound, /Continue planning|View plan/);
    assert.doesNotMatch(readFileSync("client/src/components/trip/trip-strip.tsx", "utf8"), /ADD_COPY|viewPlan/);
  });
});

describe("V7 visibility", () => {
  it("nothing without a plan, a context or a cart; the pre-v2 context strip still renders", () => {
    assert.equal(render({}), "");
    const ctxOnly = render({}, { ctx: { destination: "Kyoto, Japan", startDate: "2026-11-12" } });
    assert.match(ctxOnly, /data-testid="trip-strip-lead-text"/);
    assert.match(ctxOnly, /data-testid="trip-strip-destination"/);
    assert.match(ctxOnly, /data-testid="trip-strip-edit"[^>]*>Edit ›</);
    // A bound pen whose plan state has not resolved links its plan from the lead.
    const boundNoState = render({}, { ctx: { tripId: "11111111-1111-4111-8111-111111111111", destination: "Kyoto, Japan" } });
    assert.match(planLink(boundNoState)![0], /href="\/plans\/11111111-1111-4111-8111-111111111111"/);
  });
  it("a cart alone keeps the strip, with the cart chip", () => {
    const out = render({}, { cart: { itemCount: 2, total: "40" } });
    assert.match(out, /data-testid="trip-strip-cart"/);
  });
});

describe("V8/V9 sticky on one variable; the nav keeps only the start CTA", () => {
  it("the strip sticks under the nav on --chrome-nav-h, which the nav's height also reads", () => {
    const strip = readFileSync("client/src/components/trip/trip-strip.tsx", "utf8");
    assert.match(strip, /className="sticky z-40 w-full border-b"/);
    assert.match(strip, /top: "var\(--chrome-nav-h\)"/);
    const layout = readFileSync("client/src/components/layout.tsx", "utf8");
    assert.match(layout, /style=\{\{ height: "var\(--chrome-nav-h\)" \}\}/, "the nav reads the same variable");
    assert.doesNotMatch(layout, /h-\[60px\]/, "no second copy of the height");
    assert.match(readFileSync("client/src/index.css", "utf8"), /--chrome-nav-h: 60px;/);
    assert.match(layout, /<TripStrip planState=\{headerState\} datesTarget=\{headerDates\} signedIn=\{!!user\} \/>/);
    assert.equal((layout.match(/<TripStrip/g) ?? []).length, 1, "one mount");
  });
  it("the nav and the phone menu draw Start a plan only in the start state; the nav chip is gone", () => {
    const layout = readFileSync("client/src/components/layout.tsx", "utf8");
    assert.doesNotMatch(layout, /HeaderPlanCTA/);
    assert.equal((layout.match(/\{navShowsStart && \(/g) ?? []).length, 2, "desktop nav + phone menu");
    assert.match(layout, /const navShowsStart = headerState\.kind === "start"/);
    assert.match(layout, /data-testid="button-nav-start-plan"/);
    assert.match(layout, /data-testid="button-mobile-start-plan"/);
    assert.doesNotMatch(layout, /chip-nav-plan/);
  });
});
