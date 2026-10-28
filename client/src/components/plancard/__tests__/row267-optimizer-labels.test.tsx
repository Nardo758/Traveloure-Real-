/**
 * Row 267 (F2; approved by Leon Oct 27, 2026; gate ruled by the Architect the same night): the plan
 * card says "Optimized" (not "AI Optimized") behind the unchanged lastOptimizedAt gate, and the score
 * badge says "Plan score" and "N out of 100". Renders with react-dom/server and reads source with fs;
 * runs no git and compares to no ref.
 */
import "./node-navigator-stub";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { OPTIMIZER_BADGE_COPY } from "@/lib/optimizer-badge-copy";
import { siteNeverSayHits } from "@shared/banned-copy";
import { OptimizerMetrics } from "../StatsRow";

(globalThis as any).React = React;

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const PLAN_CARD = fs.readFileSync("client/src/components/plancard/PlanCard.tsx", "utf8");
const metrics = (traveloureScore: number | null) =>
  renderToString(React.createElement(OptimizerMetrics, {
    tripId: "t", traveloureScore, savings: null, savingsPercent: null, wellnessTime: null, starDelta: null, totalCost: null, perPerson: null,
  } as any));

describe("row 267 optimizer labels", () => {
  it("OL1 the approved strings", () => {
    assert.equal(OPTIMIZER_BADGE_COPY.optimized, "Optimized");
    assert.equal(OPTIMIZER_BADGE_COPY.planScore, "Plan score");
    assert.equal(OPTIMIZER_BADGE_COPY.outOf100(80), "80 out of 100");
  });

  it("OL2 the score badge reads Plan score and N out of 100, same gate and testid", () => {
    const html = metrics(80);
    const t = text(html);
    assert.match(t, /Plan score/);
    assert.match(t, /80 out of 100/);
    assert.doesNotMatch(t, /\d\s*Score/);
    assert.match(html, /data-testid="badge-traveloure-score-t"/);
    assert.equal(metrics(null), "");
  });

  it("OL3 PlanCard reads Optimized from the constants behind the unchanged gates", () => {
    assert.ok(!PLAN_CARD.includes("AI Optimized"));
    assert.equal((PLAN_CARD.match(/OPTIMIZER_BADGE_COPY\.optimized/g) ?? []).length, 2);
    assert.ok(PLAN_CARD.includes('"Re-optimize?"'));
    assert.ok(PLAN_CARD.includes("{lastOptimizedAt && (() =>"));
    assert.ok(PLAN_CARD.includes("{lastOptimizedAt && ("));
    for (const id of ["pill-ai-optimized-", "banner-ai-optimized-", "text-ai-savings-"]) assert.ok(PLAN_CARD.includes(id), id);
    const pillGate = PLAN_CARD.slice(PLAN_CARD.indexOf("{lastOptimizedAt && (() =>"), PLAN_CARD.indexOf("pill-ai-optimized-"));
    const bannerStart = PLAN_CARD.indexOf("{lastOptimizedAt && (\n");
    const bannerGate = PLAN_CARD.slice(bannerStart, PLAN_CARD.indexOf("banner-ai-optimized-"));
    assert.ok(bannerStart > 0);
    assert.doesNotMatch(pillGate, /selectedVariantId/);
    assert.doesNotMatch(bannerGate, /selectedVariantId/);
  });

  it("OL4 never-say sweep over the new values", () => {
    for (const v of [OPTIMIZER_BADGE_COPY.optimized, OPTIMIZER_BADGE_COPY.planScore, OPTIMIZER_BADGE_COPY.outOf100(80)]) {
      assert.deepEqual(siteNeverSayHits(v), [], v);
      assert.doesNotMatch(v, /\bAI\b|best|recommended|quality/i, v);
    }
  });
});
