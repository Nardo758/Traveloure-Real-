/**
 * Row 267 (F4): itinerary wording. See docs/decisions for provenance.
 * Run: npx tsx --test client/src/lib/__tests__/row267-itinerary-ai-wording.test.tsx
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { ITINERARY_WORDING, stopsPlaced } from "../itinerary-wording";
import { ProposalColumn } from "@/components/plancard/ProposalColumn";

(globalThis as { React?: typeof React }).React = React;

const ROOT = process.cwd();
const stripComments = (src: string) =>
  src.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function productionSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(stripComments(fs.readFileSync(full, "utf8")));
      }
    }
  };
  walk(path.join(ROOT, "client/src"));
  return out;
}

const OLD = [
  "AI itinerary",
  "AI is re-optimizing around your feedback...",
  "AI is creating optimized versions...",
  "No optimized variants were generated",
  "Scoring locations against your stops…",
  "stops located",
] as const;

describe("row 267 itinerary AI wording", () => {
  it("holds the approved strings exactly", () => {
    assert.equal(ITINERARY_WORDING.draftItinerary, "Your draft itinerary");
    assert.equal(ITINERARY_WORDING.buildingPlan, "Building your plan…");
    assert.equal(ITINERARY_WORDING.updatingPlan, "Updating your plan…");
    assert.equal(ITINERARY_WORDING.noDayOptions, "We couldn't build options for this day.");
    assert.equal(ITINERARY_WORDING.checkingPlaces, "Checking places against your stops…");
    assert.equal(stopsPlaced(2, 5), "2 of 5 stops placed");
    assert.equal(stopsPlaced(0, 3), "0 of 3 stops placed");
  });

  it("the old strings are gone from client production code", () => {
    const sources = productionSources();
    assert.ok(sources.length > 20);
    for (const gone of OLD) {
      const hit = sources.find((src) => src.includes(gone));
      assert.equal(hit, undefined, gone);
    }
  });

  it("the comparison page and build-around dialog read the approved strings", () => {
    const page = fs.readFileSync("client/src/pages/itinerary-comparison.tsx", "utf8");
    const dialog = fs.readFileSync("client/src/components/plancard/BuildAroundDialog.tsx", "utf8");
    assert.match(page, /when \{ITINERARY_WORDING\.draftItinerary\} is generated/);
    assert.match(
      page,
      /feedbackChips\.length > 0\s*\?\s*ITINERARY_WORDING\.updatingPlan\s*:\s*ITINERARY_WORDING\.buildingPlan/,
    );
    assert.match(page, /\{ITINERARY_WORDING\.noDayOptions\}/);
    assert.match(dialog, /\{ITINERARY_WORDING\.checkingPlaces\}/);
    const email = fs.readFileSync("server/services/email.service.ts", "utf8");
    assert.match(email, /get a full AI itinerary in seconds/);
    assert.doesNotMatch(email, /ITINERARY_WORDING/);
    for (const file of [
      "client/src/components/plancard/ProposalColumn.tsx",
      "client/src/components/provider/catalog-map-view.tsx",
      "client/src/components/provider/service-map-authoring.tsx",
      "client/src/pages/service-detail.tsx",
    ]) {
      assert.match(fs.readFileSync(file, "utf8"), /stopsPlaced\(/, file);
    }
  });

  it("a proposal column renders the placed count and not the old one", () => {
    const base = {
      variantId: "v1",
      name: "Version A",
      anchoredItems: [],
      items: [],
      applyLabel: "Use this version",
      onApply: () => {},
    };
    const partial = renderToString(
      React.createElement(ProposalColumn, {
        proposal: { ...base, locationCoverage: { locatedStops: 2, totalStops: 5 } },
      }),
    );
    assert.match(partial, /2 of 5 stops placed/);
    assert.match(partial, /travel estimate based on located stops only/);
    assert.doesNotMatch(partial, /stops located/);
    const full = renderToString(
      React.createElement(ProposalColumn, {
        proposal: { ...base, locationCoverage: { locatedStops: 5, totalStops: 5 } },
      }),
    );
    assert.match(full, /5 of 5 stops placed/);
    assert.doesNotMatch(full, /stops located/);
    assert.doesNotMatch(full, /located stops only/);
  });
});
