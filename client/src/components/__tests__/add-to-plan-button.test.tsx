/**
 * Cut-list #1 slice C — THE ONE ADD BUTTON, rendered (react-dom/server, no jsdom).
 *
 *   B1 idle: "Add to plan"; with a known day "Add to Day {n}"
 *   B2 pending: the spinner, `aria-busy`, disabled (a second press cannot double-add); the label stays
 *   B3 the pending state follows the ITEM's key across a remount (module state, the one slot)
 *   B4 added: "Added ✓", inert on the guest rail, still pressable signed in (R4b-3)
 *   B5 375px budget: one line, `whitespace-nowrap`, the longest label fits a phone card column
 *   B6 the header chip carries "View plan" from sm: up, as a sibling link (never nested)
 *   B7 the feedback host is mounted once in App and draws "Change day" / the first-add calendar. QA round 3 PR 1: the
 *      calendar is a popover anchored to the pressed button from sm up and a bottom sheet otherwise; its exits are Save
 *      and "Skip for now" ONLY ("Not now" and the sheet's close button are not drawn); Escape / outside is Skip
 *   B8 /experiences: the page's event cards carry the one add button (beside the row, never inside it); the pop-up's
 *      and a closed market's do not; an event with no source id names no row and draws none; city cards draw none
 *
 * Run: npx tsx --test client/src/components/__tests__/add-to-plan-button.test.tsx
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { AddToPlanButton } from "../plan/AddToPlanButton";
import { InlineDatesPanel } from "../plan/SlipAnchorPanels";
import { __planAddRunner, setAddPending } from "@/lib/plan-add-runner";

(globalThis as any).React = React;

const html = (node: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <Router ssrPath="/">
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </Router>,
  );
};
const label = (out: string) => (out.match(/<span class="whitespace-nowrap">([^<]*)<\/span>/) ?? [])[1];

beforeEach(() => __planAddRunner.reset());

describe("B1 idle", () => {
  it("Add to plan, or Add to Day {n}", () => {
    assert.equal(label(html(<AddToPlanButton testId="a" onClick={() => {}} />)), "Add to plan");
    assert.equal(label(html(<AddToPlanButton testId="a" dayNumber={3} onClick={() => {}} />)), "Add to Day 3");
    const out = html(<AddToPlanButton testId="a" onClick={() => {}} />);
    assert.match(out, /data-add-state="idle"/);
    assert.doesNotMatch(out, /aria-busy|disabled=""/);
  });
});

describe("B2 pending", () => {
  it("spinner, aria-busy, disabled; the words stay", () => {
    const out = html(<AddToPlanButton testId="a" pending onClick={() => {}} />);
    assert.match(out, /data-testid="a-spinner"/);
    assert.match(out, /animate-spin/);
    assert.match(out, /aria-busy="true"/);
    assert.match(out, /disabled=""/);
    assert.match(out, /data-add-state="pending"/);
    assert.equal(label(out), "Add to plan");
  });
});

describe("B3 pending follows the item", () => {
  it("a key in flight spins wherever its button renders", () => {
    setAddPending("gem:g1", true);
    assert.match(html(<AddToPlanButton testId="a" pendingKey="gem:g1" onClick={() => {}} />), /data-testid="a-spinner"/);
    assert.doesNotMatch(html(<AddToPlanButton testId="b" pendingKey="gem:g2" onClick={() => {}} />), /spinner/);
    setAddPending("gem:g1", false);
    assert.doesNotMatch(html(<AddToPlanButton testId="a" pendingKey="gem:g1" onClick={() => {}} />), /spinner/);
  });
});

describe("B4 added", () => {
  it("Added ✓; inert on the guest rail, pressable signed in", () => {
    const guest = html(<AddToPlanButton testId="a" added addedInert onClick={() => {}} />);
    assert.equal(label(guest), "Added ✓");
    assert.match(guest, /data-add-state="added"/);
    assert.match(guest, /data-saved="true"/);
    assert.match(guest, /disabled=""/);
    const signedIn = html(<AddToPlanButton testId="a" added onClick={() => {}} />);
    assert.equal(label(signedIn), "Added ✓");
    assert.doesNotMatch(signedIn, /disabled=""/);
    // Added wins over a stale pending flag: never a spinner beside "Added ✓".
    assert.doesNotMatch(html(<AddToPlanButton testId="a" added pending onClick={() => {}} />), /spinner/);
  });
});

describe("B5 375px budget", () => {
  it("one line; the longest label fits a phone card column", () => {
    const src = readFileSync("client/src/components/plan/AddToPlanButton.tsx", "utf8");
    assert.match(src, /<span className="whitespace-nowrap">\{label\}<\/span>/);
    assert.match(src, /h-3\.5 w-3\.5 shrink-0 animate-spin/, "the spinner is 14px and never squeezes the label");
    // A phone card column at 375px: 375 − 2×16 gutters − 2×14 card padding = 315px; a two-up action row gives each
    // button (315 − 8 gap) / 2 = 153px. "Add to Day 14" at 12px semibold ≈ 7.2px/char × 13 = 94px, + 14px icon + 4px
    // gap + 2×12px padding = 136px ≤ 153px.
    const longest = "Add to Day 14".length * 7.2 + 14 + 4 + 24;
    assert.ok(longest <= (375 - 32 - 28 - 8) / 2, `${longest}px must fit 153px`);
  });
});

describe("B6 View plan lives in the toast only (header fix v2)", () => {
  it("the strip's label is the link to the plan; no View plan control in the chrome", () => {
    const strip = readFileSync("client/src/components/trip/trip-strip.tsx", "utf8");
    assert.doesNotMatch(strip, /ADD_COPY\.viewPlan/);
    assert.match(strip, /data-testid="trip-strip-plan-link"/);
    const layout = readFileSync("client/src/components/layout.tsx", "utf8");
    assert.doesNotMatch(layout, /chip-nav-plan-view|HeaderPlanCTA/);
  });
});

describe("B7 the feedback host", () => {
  it("mounted once; Change day lists the plan's days; the first-add calendar can be skipped", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    assert.equal((app.match(/<PlanAddFeedbackHost \/>/g) ?? []).length, 1);
    const host = readFileSync("client/src/components/plan/PlanAddFeedbackHost.tsx", "utf8");
    assert.match(host, /<DialogTitle>\{ADD_COPY\.changeDay\}<\/DialogTitle>/);
    assert.match(host, /changeDayOptions\(changeDay\.days, current\)/);
    // QA round 3 PR 1: the panel captures the answer (the runner writes after it); Save and Skip are its two exits.
    const panel = host.match(/<InlineDatesPanel[\s\S]*?\/>/)?.[0] ?? "";
    assert.match(panel, /datesConfirmed=\{false\}/);
    assert.match(panel, /submit=\{async \(d\) => onAnswer\(\{ kind: "save"/);
    assert.match(panel, /onSkip=\{\(\) => onAnswer\(\{ kind: "skip" \}\)\}/);
    assert.doesNotMatch(panel, /onCancel/, "no 'Not now' on this mount");
    assert.match(host, /<PopoverPrimitive\.Anchor virtualRef=\{anchor\} \/>/, "the popover anchors to the pressed button");
    assert.match(host, /if \(dates\.anchor && popoverWidth\(\)\)/, "no pressed button ⇒ the sheet at every width");
    assert.match(host, /min-width: 640px/, "the popover starts at sm");
    assert.match(host, /<SheetContent side="bottom"[^>]*\[&>button\]:hidden/, "the sheet's own close button is not a third exit");
    assert.match(host, /if \(!open\) onAnswer\(\{ kind: "skip" \}\)/, "Escape / outside click is Skip");
    assert.match(host, /altText=\{ADD_COPY\.undo\}/);
    assert.match(host, /altText=\{ADD_COPY\.retry\}/);
    assert.match(host, /max-w-\[calc\(100vw-2rem\)\]/, "the Change day dialog fits a phone");
  });
  it("the first-add panel, as the host mounts it, draws exactly two exits: Save and Skip for now", () => {
    const out = html(
      <InlineDatesPanel tripId="" datesConfirmed={false} testId="first-add-dates-panel" submit={async () => {}} onSkip={() => {}} />,
    );
    assert.match(out, /data-testid="button-slip-dates-save"/);
    assert.match(out, /data-testid="first-add-dates-panel-calendar-skip"[^>]*>Skip for now</);
    assert.doesNotMatch(out, /Not now/);
    assert.doesNotMatch(out, /first-add-dates-panel-cancel/);
  });
});

describe("B8 /experiences event cards", () => {
  it("the page container's open-market event rows carry the one add button, beside the row", () => {
    const src = readFileSync("client/src/components/plan/PlanEntry.tsx", "utf8");
    assert.match(src, /inline && \(!e\.marketKey \|\| isOpenMarket\(e\.marketKey\)\) \?/);
    assert.match(src, /\{eventRow\(e\)\}\s*<EventAddButton event=\{e\} \/>/, "a sibling of the row, so no button nests in a button");
    assert.match(src, /<AddToPlanButton\s+testId=\{`plan-entry-event-add-\$\{event\.id\}`\}/);
    assert.match(src, /event\.sourceId\s*\?\s*planItemRefFromFeedItem\(\{ type: "city_event", sourceContentId: event\.sourceId/);
    assert.match(src, /if \(!ref\) return null;/);
    assert.match(src, /onClick=\{\(\) => add\(\{ ref, city: event\.city \}\)\}/);
    // City cards keep their pick for Start a plan (Leon, Nov 11): no add button on the page's Place picker.
    assert.doesNotMatch(readFileSync("client/src/pages/experiences.tsx", "utf8"), /AddToPlanButton/);
    // The direct add takes the same paths as the feed: the slot, the guest rail, the signed-in ref rail, or sign-in.
    const hook = readFileSync("client/src/lib/browse-save.ts", "utf8");
    assert.match(hook, /if \(path === "wait"\) queuePlanAdd\(job\);\s*else if \(path === "guest_save"\) void runGuestAdd\(job\);\s*else if \(user\) void runSignedInRefAdd\(job\);\s*else openSignInModal\(\);/);
  });
});
