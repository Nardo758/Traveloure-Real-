/**
 * OptimizerLead render (surface step 4, spec v1.2 §8; R-f, R-l, R-v).
 *   R1 three findings: the eyebrow, three lines in order, the versions line, the re-run rule
 *   R2 one finding, with its R-v caveat under it
 *   R3 zero findings: "This draft already works · …", no versions line, the fee still on the CTA
 *   R4 the CTA's fee is the SERVER's quote ("Optimize · $5.99"), the Trip Pass label when covered, and
 *      a bare "Optimize" with no quote — never a literal
 *   R5 no price line before a run, nor after one without a priced item; the realised line otherwise
 *   R6 the card's source holds no fee literal and no "/100" score
 *
 * Run: npx tsx --test client/src/components/plancard/__tests__/optimizer-lead.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { OptimizerLead, optimizeCtaLabel, type OptimizerLeadProps } from "../../plan/OptimizerLead";
import { HOURS_CAVEAT, LEAD_ZERO, type Finding } from "@shared/optimizer-lead";

(globalThis as any).React = React;
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const FEE = { complexityTier: "standard", feeCents: 599, currency: "USD", aiDisabled: false, coveredByTripPass: false };
const render = (p: Partial<OptimizerLeadProps>) =>
  renderToString(React.createElement(OptimizerLead, { findings: [], hasPricedItems: false, fee: FEE, onClick: () => {}, ...p } as OptimizerLeadProps));

const THREE: Finding[] = [
  { kind: "closed_on_arrival", count: 3, days: [2, 4, 5] },
  { kind: "city_crossing", count: 1, days: [3], est: true },
  { kind: "walking_saved_km", count: 4, days: [1], est: true },
];

describe("OptimizerLead", () => {
  it("R1 three findings", () => {
    const html = render({ findings: THREE });
    const t = text(html);
    assert.match(t, /What Optimize found in this draft/);
    assert.ok(t.indexOf("closed") < t.indexOf("crosses") && t.indexOf("crosses") < t.indexOf("walking"));
    assert.equal((html.match(/data-testid="optimizer-finding-/g) ?? []).length, 3);
    assert.match(t, /three versions built around where you stay/);
    assert.match(t, /After a run, re-timing a day on the versions board is free for 24 hours\./);
  });

  it("R2 one finding with its caveat", () => {
    const html = render({ findings: [{ kind: "closed_on_arrival", count: 1, days: [2], caveat: HOURS_CAVEAT }] });
    assert.match(text(html), /1 stop is reached when it's closed/);
    assert.match(html, /optimizer-finding-caveat-closed_on_arrival/);
    assert.match(text(html), /based on current hours · re-checked 3 days before your trip/);
  });

  it("R3 zero findings", () => {
    const html = render({ findings: [] });
    assert.match(text(html), new RegExp(LEAD_ZERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(html, /optimizer-lead-versions/);
    assert.match(text(html), /Optimize · \$5\.99/);
  });

  it("R4 the CTA's fee is the server's", () => {
    assert.equal(optimizeCtaLabel(FEE), "Optimize · $5.99");
    assert.equal(optimizeCtaLabel({ ...FEE, feeCents: 1299 }), "Optimize · $12.99");
    assert.equal(optimizeCtaLabel({ ...FEE, coveredByTripPass: true }), "Optimize · Included in your Trip Pass");
    assert.equal(optimizeCtaLabel(null), "Optimize");
    assert.equal(optimizeCtaLabel({ ...FEE, aiDisabled: true }), "Optimize");
  });

  it("R5 the price line", () => {
    assert.doesNotMatch(render({ findings: THREE, hasPricedItems: true }), /optimizer-lead-delta/, "no delta before a run");
    assert.doesNotMatch(render({ findings: THREE, hasPricedItems: false, realised: { savings: 40 } }), /optimizer-lead-delta/);
    const after = render({ findings: THREE, hasPricedItems: true, realised: { savings: 40, savingsPercent: 10 } });
    assert.match(text(after), /After Optimize: \$40\.00 less than the draft \(10%\)/);
    assert.doesNotMatch(text(after), /\$\d+\s*[–-]\s*\$?\d+/, "never a range");
  });

  it("R6 no fee literal and no score in the card", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(path.join(here, "../../plan/OptimizerLead.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\$\s?\d/);
    assert.doesNotMatch(src, /\b\d+\s*\/\s*100\b/);
    assert.doesNotMatch(src, /\b(599|5\.99|1299)\b/);
  });
});
