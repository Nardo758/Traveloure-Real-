/**
 * Row 266 (ledger `2026-11-01-row266-free-retime-copy`): the Optimize card's re-run line states the free
 * re-time count the SERVER allows (`freeRetimesPerVersion` on the fee quote), reads the Trip Pass line when
 * the server says the pass covers the run, and falls back to the count-free line otherwise.
 *
 *   RT1  the four strings equal the approved table
 *   RT2  a count of 2 or more is read from the quote (5 reads 5, 2 reads 2); no literal
 *   RT2b a count of exactly 1 reads the "one free re-time" line, never "1 free re-times"
 *   RT3  null, undefined, no quote, NaN, -1 and 2.5 read the count-free line
 *   RT4  a count of 0 returns null and the card draws no re-run line
 *   RT5  coveredByTripPass true reads the Trip Pass line whatever the count
 *   RT6  OPTIMIZE_RERUN_RULE is the count-free line (the cart reads no quote)
 *   RT7  no env read and no literal count in the client files
 *   RT8  no banned copy, and no "AI", "unlimited" or "slip" in the four strings
 *   RT9  the board's own line is untouched
 *
 * Rendered with react-dom/server. No network, no git.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  OPTIMIZE_RERUN_COPY,
  OPTIMIZE_RERUN_RULE,
  optimizeRerunRule,
  type OptimizationFeeQuote,
} from "@/lib/optimization-preview";
import { siteNeverSayHits } from "@shared/banned-copy";
import { retimeLine } from "@shared/version-board";
import { OptimizerLead, type OptimizerLeadProps } from "../../plan/OptimizerLead";

(globalThis as any).React = React;

const base: OptimizationFeeQuote = {
  complexityTier: "standard",
  feeCents: 599,
  currency: "USD",
  aiDisabled: false,
  coveredByTripPass: false,
};
const quote = (over: Partial<OptimizationFeeQuote>): OptimizationFeeQuote => ({ ...base, ...over });
const render = (fee: OptimizationFeeQuote | null) =>
  renderToString(
    React.createElement(OptimizerLead, { findings: [], hasPricedItems: false, fee, onClick: () => {} } as OptimizerLeadProps),
  );
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("row 266: the free re-time line reads the server's count", () => {
  it("RT1 the four strings equal the approved table", () => {
    assert.equal(OPTIMIZE_RERUN_COPY.free, "Re-timing a day is free for 24 hours.");
    assert.equal(OPTIMIZE_RERUN_COPY.freeOne, "Re-timing a day is free for 24 hours, with one free re-time for each version.");
    assert.equal(
      OPTIMIZE_RERUN_COPY.freeWithCount(4),
      "Re-timing a day is free for 24 hours, with 4 free re-times for each version.",
    );
    assert.equal(OPTIMIZE_RERUN_COPY.tripPass, "Re-timing a day is included with your Trip Pass, for 24 hours after each run.");
  });

  it("RT2 a count of 2 or more is the server's own number", () => {
    assert.equal(
      optimizeRerunRule(quote({ freeRetimesPerVersion: 5 })),
      "Re-timing a day is free for 24 hours, with 5 free re-times for each version.",
    );
    assert.equal(
      optimizeRerunRule(quote({ freeRetimesPerVersion: 2 })),
      "Re-timing a day is free for 24 hours, with 2 free re-times for each version.",
    );
    assert.match(text(render(quote({ freeRetimesPerVersion: 5 }))), /with 5 free re-times for each version\./);
  });

  it("RT2b a count of exactly 1 reads the one-re-time line", () => {
    const one = optimizeRerunRule(quote({ freeRetimesPerVersion: 1 }));
    assert.equal(one, "Re-timing a day is free for 24 hours, with one free re-time for each version.");
    assert.doesNotMatch(one!, /1 free re-times/);
    assert.doesNotMatch(one!.replace("24", ""), /1/);
    for (const n of [2, 3, 7]) {
      assert.doesNotMatch(optimizeRerunRule(quote({ freeRetimesPerVersion: n }))!, /\bone\b/);
    }
  });

  it("RT3 an unusable count reads the count-free line", () => {
    for (const fee of [
      quote({ freeRetimesPerVersion: null }),
      quote({}),
      null,
      undefined,
      quote({ freeRetimesPerVersion: Number.NaN }),
      quote({ freeRetimesPerVersion: -1 }),
      quote({ freeRetimesPerVersion: 2.5 }),
    ]) {
      assert.equal(optimizeRerunRule(fee), "Re-timing a day is free for 24 hours.");
    }
  });

  it("RT4 a count of 0 shows no line", () => {
    assert.equal(optimizeRerunRule(quote({ freeRetimesPerVersion: 0 })), null);
    assert.doesNotMatch(render(quote({ freeRetimesPerVersion: 0 })), /optimizer-lead-rerun/);
    assert.match(render(quote({ freeRetimesPerVersion: 3 })), /optimizer-lead-rerun/);
  });

  it("RT5 the Trip Pass line follows the server's coveredByTripPass, whatever the count", () => {
    for (const n of [null, 0, 1, 4]) {
      assert.equal(
        optimizeRerunRule(quote({ coveredByTripPass: true, freeRetimesPerVersion: n })),
        "Re-timing a day is included with your Trip Pass, for 24 hours after each run.",
      );
    }
  });

  it("RT6 the cart's bullet is the count-free line", () => {
    assert.equal(OPTIMIZE_RERUN_RULE, OPTIMIZE_RERUN_COPY.free);
    const cart = readFileSync("client/src/pages/cart.tsx", "utf8");
    assert.match(cart, /\{OPTIMIZE_RERUN_RULE\}/);
    assert.doesNotMatch(cart, /optimization-fee/);
  });

  it("RT7 no env read and no literal count in the client files", () => {
    for (const f of [
      "client/src/lib/optimization-preview.ts",
      "client/src/components/plan/OptimizerLead.tsx",
      "client/src/pages/cart.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /process\.env|import\.meta\.env|OPTIMIZER_FREE_RETIMES/, f);
    }
    const src = readFileSync("client/src/lib/optimization-preview.ts", "utf8");
    const start = src.indexOf("export const OPTIMIZE_RERUN_COPY");
    const body = src.slice(start, src.indexOf("} as const;", start));
    const code = body.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/24 hours/g, "");
    assert.doesNotMatch(code, /\d/, "the constants object holds no count digit");
  });

  it("RT8 no banned copy in the four strings", () => {
    for (const s of [
      OPTIMIZE_RERUN_COPY.free,
      OPTIMIZE_RERUN_COPY.freeOne,
      OPTIMIZE_RERUN_COPY.freeWithCount(3),
      OPTIMIZE_RERUN_COPY.tripPass,
    ]) {
      assert.deepEqual(siteNeverSayHits(s), [], s);
      assert.doesNotMatch(s, /\bAI\b|unlimited|slip/i, s);
    }
  });

  it("RT9 the board's line is untouched", () => {
    assert.equal(retimeLine({ free: true, remaining: 2, feeLabel: "<fee>" }), "Re-timing a day is free · 2 left");
  });
});
