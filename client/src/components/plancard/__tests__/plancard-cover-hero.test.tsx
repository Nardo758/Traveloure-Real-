/**
 * Held-batch-1 item 28: the navy cover hero on BOTH cards (the shared `PlanCardHeader`).
 *
 *   CH1 pure: "Trip Card · final vN" only for a plan final now with a known version
 *   CH2 render: navy cover, gold eyebrow above the title when passed
 *   CH3 render: no eyebrow ⇒ no eyebrow node (a draft or a plan being revised claims no version)
 *   CH4 source: both callers pass the ONE helper's answer
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/plancard-cover-hero.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { PlanCardHeader } from "../PlanCardHeader";
import { tripCardEyebrow } from "../../../lib/trip-card-eyebrow";

(globalThis as any).React = React;

const render = (eyebrow: string | null) =>
  renderToString(
    React.createElement(PlanCardHeader, {
      title: "Kyoto smoke test 5",
      destination: "Nowhere-in-particular",
      dateRange: "Nov 11 – Nov 15",
      statusLabel: null,
      metrics: { days: 5, activities: 12, legs: 4, transitTime: "-" },
      testId: "h",
      eyebrow,
    }),
  );

describe("plan card cover hero", () => {
  it("CH1 the eyebrow is said only for a final plan with a version", () => {
    assert.equal(tripCardEyebrow(1, true), "Trip Card · final v1");
    assert.equal(tripCardEyebrow(3, true), "Trip Card · final v3");
    assert.equal(tripCardEyebrow(2, false), null);
    assert.equal(tripCardEyebrow(null, true), null);
    assert.equal(tripCardEyebrow(undefined, true), null);
    assert.equal(tripCardEyebrow(0, true), null);
  });

  it("CH2 navy cover with the gold eyebrow before the title", () => {
    const html = render("Trip Card · final v1");
    assert.match(html, /bg-\[#0D2137\]/);
    assert.match(html, /data-testid="h-eyebrow"[^>]*>Trip Card · final v1</);
    assert.match(html, /text-\[#E8B339\]/);
    assert.ok(html.indexOf("h-eyebrow") < html.indexOf("h-title"));
  });

  it("CH3 no eyebrow, no node", () => {
    assert.doesNotMatch(render(null), /h-eyebrow/);
  });

  it("CH4 both cards pass the one helper", () => {
    for (const f of ["../PlanCard.tsx", "../HeroSection.tsx"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      assert.match(src, /eyebrow=\{tripCardEyebrow\(/, f);
    }
  });
});
