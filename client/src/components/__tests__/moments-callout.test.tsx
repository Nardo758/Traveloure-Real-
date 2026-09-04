/**
 * MOMENTS — the "Planning your own?" disambiguation callout, and where it is allowed to appear.
 * Ledger `2026-09-04-wedding-landing-moment`; artboard `docs/design/wedding-flow/Main.dc.html`.
 *
 * The callout tells a couple that the Earn page's "Event Planner" track is for people who SELL
 * event services, and that "Plan this moment" is their door. That sentence only makes sense beside
 * the CTA it names, so the thing worth pinning is not the copy alone but its PLACEMENT: it belongs
 * to `MomentsSection` and must never leak into the empty-state fallback (`MomentsSlot` renders
 * `ExperiencesRail` while the live set is empty — there is no "Plan this moment" there to refer to).
 *
 * What these hold:
 *   C1  With ≥1 live moment the callout renders, in full, alongside the moment card and tabs, and
 *       the "Event Planner" phrase links to the existing fork at /start/events.
 *   C2  With an empty live set `MomentsSection` renders NOTHING — so the callout cannot appear.
 *   C3  The empty-state fallback the slot actually shows (`ExperiencesRail`) carries none of the
 *       callout's copy and no callout testid.
 *   C4  The callout adds NO second planning opener: the section still has exactly one
 *       `moment-cta`, and the callout's own "Plan this moment" is text, not a control.
 *
 * Harness: react-dom/server renderToString, the DB-free / no-jsdom posture of
 * trip-strip-lead.test.tsx — real components, real providers, queries seeded into the cache
 * instead of fetched.
 *
 * Run: npx tsx --test client/src/components/__tests__/moments-callout.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignInModalProvider } from "@/contexts/SignInModalContext";
import { PlanningProvider } from "@/contexts/PlanningContext";
import { MomentsSection } from "../landing/moments-section";
import { MomentsSlot } from "../landing/moments-slot";

// tsconfig sets `jsx: "preserve"`, so under `tsx --test` JSX compiles to the CLASSIC
// `React.createElement` transform and every rendered component file needs React in scope.
(globalThis as any).React = React;

// PlanningContext reads the trip context out of sessionStorage; a plain in-memory shim, installed
// before any render. Nothing reads it at import time.
const store = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

/**
 * One live moment, shaped exactly as `GET /api/landing/moments` returns it. The photo URL here is
 * a TEST FIXTURE and nothing else: the real gate (`attributedPhotosForCity`) admits only an
 * expert-curated, non-stock photo, and this lane seeds no photo anywhere in the product.
 */
const LIVE_PAYLOAD = {
  moments: [
    {
      key: "wedding",
      label: "Wedding",
      eyebrow: "A wedding weekend in Kyoto",
      headline: "Three days, one plan.",
      pieces: ["one", "two", "three"],
      experienceType: "wedding",
      experienceSlug: "wedding",
      photos: [{ url: "https://example.test/fixture.jpg", place: "Nanzen-ji", handle: "fixture" }],
      builder: { handle: "fixture", reviews: 0 },
    },
  ],
  roster: [{ key: "wedding", label: "Wedding" }],
};

const EMPTY_PAYLOAD = { moments: [], roster: [{ key: "wedding", label: "Wedding" }] };

function render(node: React.ReactElement, payload: unknown): string {
  const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  qc.setQueryData(["/api/landing/moments"], payload);
  return renderToString(
    <QueryClientProvider client={qc}>
      <Router ssrPath="/">
        <SignInModalProvider>
          <PlanningProvider>{node}</PlanningProvider>
        </SignInModalProvider>
      </Router>
    </QueryClientProvider>,
  );
}

const CALLOUT_TESTID = 'data-testid="moments-planning-callout"';

describe("Moments — the 'Planning your own?' callout", () => {
  it("C1 renders alongside the live moment, with the Event Planner link to /start/events", () => {
    const html = render(<MomentsSection />, LIVE_PAYLOAD);

    assert.ok(html.includes('data-testid="moment-slide-wedding"'), "the live moment card renders");
    assert.ok(html.includes(CALLOUT_TESTID), "the callout renders in the same section");

    assert.ok(html.includes("Planning your own?"), "the callout's mono label");
    assert.ok(html.includes("track is for people who"), "the disambiguation sentence");
    assert.ok(html.includes("<em>sell</em>"), "'sell' carries the emphasis the artboard draws");
    assert.ok(html.includes("Couples start here:"), "the couples half of the disambiguation");
    assert.ok(
      html.includes("opens your plan with the occasion already set."),
      "the sentence about what the CTA does",
    );
    assert.ok(html.includes('href="/start/events"'), "the Event Planner phrase links to the fork page");
  });

  it("C2 renders nothing at all when no moment is live — so the callout cannot appear", () => {
    const html = render(<MomentsSection />, EMPTY_PAYLOAD);
    assert.equal(html, "", "empty state B: the section suppresses entirely");
    assert.ok(!html.includes("Planning your own?"), "and the callout with it");
  });

  it("C3 the empty-state fallback the slot shows carries no callout", () => {
    const html = render(<MomentsSlot />, EMPTY_PAYLOAD);
    assert.ok(html.includes('data-testid="experiences-rail"'), "the rail holds the slot");
    assert.ok(!html.includes(CALLOUT_TESTID), "no callout testid in the fallback");
    assert.ok(!html.includes("Planning your own?"), "no callout copy in the fallback");
    assert.ok(
      !html.includes("Plan this moment"),
      "and no reference to a CTA the fallback does not have",
    );
  });

  it("C4 the callout adds no second planning opener", () => {
    const html = render(<MomentsSection />, LIVE_PAYLOAD);
    const ctas = html.split('data-testid="moment-cta"').length - 1;
    assert.equal(ctas, 1, "exactly one planning opener in the section — the moment CTA");

    // The callout's own "Plan this moment" is TEXT: the phrase appears in the callout, but the
    // only anchor inside the callout is the Event Planner link.
    const callout = html.slice(html.indexOf(CALLOUT_TESTID));
    assert.ok(callout.includes("Plan this moment"), "the callout names the CTA");
    assert.equal(
      (callout.match(/<a /g) || []).length,
      1,
      "one anchor in the callout — the /start/events link and nothing else",
    );
    assert.equal((callout.match(/<button/g) || []).length, 0, "no button in the callout");
  });
});
