/**
 * LW-1g (ledger `2026-10-16-lw1g-earn-calculator`; hand-off Part A "/earn Ready-Made Trip calculator" tests, F2 2b):
 * the /earn Ready-Made calculator. DB-free: the arithmetic, and the component under react-dom/server.
 *
 *   C1  the inputs start EMPTY — no preset value and no placeholder number — and no result line is drawn.
 *   C2  the kept amount follows the rate it is given (the fee setting), never a typed number.
 *   C3  an empty or non-numeric box shows NOTHING — never $0 — and the monthly line needs both boxes.
 *   C4  no "typical", "average", "top experts", "passive income" or "make $" wording, in the copy module, the
 *       component, or the /earn page source.
 *   C5  the calculator is hidden when the launch market has no Ready-Made Trip on sale, or no rate is usable.
 *
 * Run: npx tsx --test client/src/lib/__tests__/ready-made-calculator.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { ReadyMadeCalculator } from "../../components/earn/ReadyMadeCalculator";
import {
  RM_CALC_ESTIMATE_LABEL,
  marketHasReadyMade,
  parsePrice,
  parseSales,
  readyMadeEstimate,
  usableRate,
} from "../ready-made-calculator";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("C1 — the boxes start empty", () => {
  it("renders two empty inputs, no placeholder, no result, and the estimate label", () => {
    const html = renderToString(<ReadyMadeCalculator rate={0.25} />);
    for (const id of ["earn-rm-price", "earn-rm-sales"]) {
      const input = html.match(new RegExp(`<input[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";
      assert.ok(input, id);
      assert.match(input, /value=""/, `${id} starts empty`);
      assert.doesNotMatch(input, /placeholder=/, `${id} has no placeholder`);
    }
    assert.doesNotMatch(html, /earn-rm-keep|earn-rm-month/);
    assert.ok(html.includes(RM_CALC_ESTIMATE_LABEL));
    assert.equal(RM_CALC_ESTIMATE_LABEL, "Your estimate, based on the numbers you entered. Not a prediction.");
  });
});

describe("C2 — the kept amount follows the rate", () => {
  it("states what the expert keeps per sale and at their guess", () => {
    assert.deepEqual(readyMadeEstimate("20", "10", 0.15), { keepLine: "You keep $17.00 per sale", monthLine: "At your guess: $170.00 a month" });
    assert.deepEqual(readyMadeEstimate("20", "10", 0.25), { keepLine: "You keep $15.00 per sale", monthLine: "At your guess: $150.00 a month" });
    assert.equal(readyMadeEstimate("19.99", "", 0.25).keepLine, "You keep $14.99 per sale");
    const html = renderToString(<ReadyMadeCalculator rate={0.15} initialPrice="20" initialSales="3" />);
    assert.ok(html.includes("You keep $17.00 per sale"));
    assert.ok(html.includes("At your guess: $51.00 a month"));
  });
  it("has no rate of its own: an unusable rate gives nothing", () => {
    for (const r of [null, undefined, NaN, -0.1, 1, 1.5]) {
      assert.equal(usableRate(r as any), null, String(r));
      assert.deepEqual(readyMadeEstimate("20", "10", r as any), { keepLine: null, monthLine: null });
    }
  });
});

describe("C3 — empty or non-numeric shows nothing", () => {
  it("refuses what is not a number", () => {
    for (const bad of ["", "abc", "20abc", "-5", "0", "1e3", "20.555", " ", "$20"]) assert.equal(parsePrice(bad), null, bad);
    for (const bad of ["", "two", "1.5", "-1", "1e2"]) assert.equal(parseSales(bad), null, bad);
    assert.equal(parseSales("0"), 0);
    assert.deepEqual(readyMadeEstimate("abc", "10", 0.25), { keepLine: null, monthLine: null });
    assert.deepEqual(readyMadeEstimate("20", "lots", 0.25), { keepLine: "You keep $15.00 per sale", monthLine: null });
    const html = renderToString(<ReadyMadeCalculator rate={0.25} initialPrice="twenty" initialSales="5" />);
    assert.doesNotMatch(html, /earn-rm-keep|earn-rm-month|\$0/);
  });
});

describe("C4 — no average, typical or earnings-claim wording", () => {
  it("in the copy, the component and the /earn page", () => {
    const banned = /\btypical|\baverage|top experts|passive income|make \$/i;
    for (const file of ["client/src/lib/ready-made-calculator.ts", "client/src/components/earn/ReadyMadeCalculator.tsx", "client/src/pages/earn.tsx"]) {
      const text = read(file)
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)) // comments describe the rule; the rule binds what renders
        .join("\n");
      assert.doesNotMatch(text, banned, file);
    }
  });
});

describe("C5 — hidden without Ready-Made Trips in the launch market", () => {
  it("matches the launch market by slug or city name, and nothing else", () => {
    assert.equal(marketHasReadyMade([{ market: "Kyoto" }], "kyoto"), true);
    assert.equal(marketHasReadyMade([{ market: "kyoto" }], "kyoto"), true);
    assert.equal(marketHasReadyMade([{ market: "Osaka" }], "kyoto"), false);
    assert.equal(marketHasReadyMade([], "kyoto"), false);
    assert.equal(marketHasReadyMade(undefined, "kyoto"), false);
    assert.equal(marketHasReadyMade([{ market: "Kyoto" }], null), false);
  });
  it("the page mounts it only with a usable rate and a match", () => {
    const src = read("client/src/pages/earn.tsx");
    assert.ok(src.includes("const readyMadeRate = usableRate(keepRates?.readyMadePlatformRate);"));
    assert.ok(src.includes("readyMadeRate !== null &&\n    marketHasReadyMade(readyMadeFeed?.listings, signupMode?.launchMarketSlug)"));
    assert.ok(src.includes("{showReadyMadeCalculator && readyMadeRate !== null && <ReadyMadeCalculator rate={readyMadeRate} />}"));
    assert.doesNotMatch(src, /<ReadyMadeCalculator[^>]*initial(Price|Sales)/, "the page never pre-fills a box");
  });
});
