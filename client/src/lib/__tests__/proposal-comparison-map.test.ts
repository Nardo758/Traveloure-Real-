import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_BASELINE_TAB_LABEL,
  baselineTabLabel,
  buildComparisonMapModel,
  buildProposalMapModel,
  buildProposalMapSeries,
  buildProposalMapTabs,
  canCompareWithBaseline,
  defaultFocusedProposalId,
  findBaselineSource,
  locatedCountLine,
  type ProposalMapSource,
} from "../proposal-map-model";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const COMPONENT = path.join(ROOT, "client/src/components/plancard/ProposalComparisonMap.tsx");
const PAGE = path.join(ROOT, "client/src/pages/itinerary-comparison.tsx");
const MAP_CONTROL_CENTER = path.join(ROOT, "client/src/components/plancard/MapControlCenter.tsx");
const LEAFLET = path.join(ROOT, "client/src/components/expert/leaflet-plan-map.tsx");

const read = (file: string) => fs.readFileSync(file, "utf8");

/** Two located stops, one unlocated — a stable §13 shape reused across the compare proofs. */
function source(
  id: string,
  name: string,
  located: number,
  unlocated: number,
  isBaseline = false,
): ProposalMapSource {
  const items = [
    ...Array.from({ length: located }, (_, i) => ({
      id: `${id}-loc-${i}`,
      dayNumber: 1,
      name: `${name} located ${i}`,
      latitude: 35 + i / 100,
      longitude: 135 + i / 100,
    })),
    ...Array.from({ length: unlocated }, (_, i) => ({
      id: `${id}-unloc-${i}`,
      dayNumber: 1,
      name: `${name} unlocated ${i}`,
      latitude: null,
      longitude: null,
    })),
  ];
  return { id, name, items, ...(isBaseline ? { isBaseline: true } : {}) };
}

describe("proposal comparison map honesty boundary", () => {
  it("renders only stops with complete, valid persisted coordinates", () => {
    const model = buildProposalMapModel([
      { id: "located", dayNumber: 1, name: "Gion", latitude: "35.0037", longitude: "135.7788" },
      { id: "missing-lng", dayNumber: 1, name: "Temple", latitude: "35.01", longitude: null },
      { id: "invalid", dayNumber: 2, name: "Invalid", latitude: 95, longitude: 135 },
      { id: "zero", dayNumber: 3, name: "Prime meridian", latitude: 0, longitude: 0 },
    ]);

    assert.equal(model.total, 4);
    assert.deepEqual(model.located.map((item) => item.id), ["located", "zero"]);
    assert.deepEqual(
      model.located.map(({ lat, lng }) => ({ lat, lng })),
      [{ lat: 35.0037, lng: 135.7788 }, { lat: 0, lng: 0 }],
    );
  });

  it("returns an empty located set instead of inventing a city-center fallback", () => {
    const model = buildProposalMapModel([
      { id: "one", dayNumber: 1, name: "Unlocated stop", latitude: null, longitude: null },
      { id: "two", dayNumber: 2, name: "Text-only stop" },
    ]);

    assert.equal(model.total, 2);
    assert.deepEqual(model.located, []);
  });
});

/* ── LD 41 (ledger 2026-09-05-comparison-map-baseline-compare) ─────────────────────────────── */

describe("B1 — the baseline is the map's FIRST tab", () => {
  const sources = [
    source("v1", "Variant A", 2, 0),
    source("v2", "Variant B", 1, 1),
    source("base", "Your Plan", 3, 0, true),
  ];

  it("puts the baseline in front however the board hands the sources over", () => {
    const tabs = buildProposalMapTabs(sources);
    assert.deepEqual(tabs.map((tab) => tab.source.id), ["base", "v1", "v2"]);
    assert.equal(tabs[0].source.isBaseline, true);
    assert.equal(findBaselineSource(sources)?.id, "base");
  });

  it("keeps the baseline's own server-authored name and never renumbers the proposals", () => {
    const tabs = buildProposalMapTabs(sources);
    assert.deepEqual(tabs.map((tab) => tab.label), ["Your Plan", "Variant A", "Variant B"]);

    const nameless = buildProposalMapTabs([
      { id: "base", name: "", items: [], isBaseline: true },
      { id: "a", name: "", items: [] },
      { id: "b", name: "", items: [] },
    ]);
    // Proposal numbering counts PROPOSALS — sitting behind the baseline does not make the first
    // proposal "Proposal 2".
    assert.deepEqual(nameless.map((tab) => tab.label), [
      DEFAULT_BASELINE_TAB_LABEL,
      "Proposal 1",
      "Proposal 2",
    ]);
    assert.equal(baselineTabLabel("  "), DEFAULT_BASELINE_TAB_LABEL);
    assert.equal(baselineTabLabel("Your Plan"), "Your Plan");
  });

  it("still OPENS on a proposal — adding the tab does not change what the traveler lands on", () => {
    assert.equal(defaultFocusedProposalId(sources), "v1");
    // A board carrying nothing but the baseline focuses the baseline rather than nothing.
    assert.equal(defaultFocusedProposalId([sources[2]]), "base");
    assert.equal(defaultFocusedProposalId([]), "");
  });
});

describe("B2 — the compare toggle is OMITTED where there is nothing to compare", () => {
  const baseline = source("base", "Your Plan", 2, 0, true);
  const proposal = source("v1", "Variant A", 2, 0);

  it("is unavailable on the baseline tab (a plan is never compared with itself)", () => {
    assert.equal(canCompareWithBaseline([baseline, proposal], "base"), false);
  });

  it("is available on a proposal tab when a baseline exists", () => {
    assert.equal(canCompareWithBaseline([baseline, proposal], "v1"), true);
  });

  it("is unavailable when the comparison carries no baseline variant at all", () => {
    assert.equal(canCompareWithBaseline([proposal], "v1"), false);
  });

  it("is unavailable for a focus id no tab owns", () => {
    assert.equal(canCompareWithBaseline([baseline, proposal], "ghost"), false);
  });
});

describe("B3 — TWO located-count lines, each computed from its OWN variant", () => {
  const tabs = buildProposalMapTabs([
    source("base", "Your Plan", 3, 2, true),
    source("v1", "Variant A", 1, 3),
  ]);
  const baselineSeries = buildProposalMapSeries(tabs[0]);
  const proposalSeries = buildProposalMapSeries(tabs[1]);

  it("states each series' own X of Y and never sums the two", () => {
    assert.equal(locatedCountLine(baselineSeries), "Your Plan: 3 of 5 located");
    assert.equal(locatedCountLine(proposalSeries), "Variant A: 1 of 4 located");
    assert.equal(baselineSeries.isBaseline, true);
    assert.equal(proposalSeries.isBaseline, false);
  });

  it("draws the second series only while compare is on", () => {
    const off = buildComparisonMapModel(proposalSeries, baselineSeries, false);
    assert.equal(off.secondary, null);
    assert.equal(off.primary.id, "v1");

    const on = buildComparisonMapModel(proposalSeries, baselineSeries, true);
    assert.equal(on.secondary?.id, "base");
    assert.equal(on.primary.id, "v1");
  });

  it("never draws the baseline twice when the baseline itself is focused", () => {
    const model = buildComparisonMapModel(baselineSeries, baselineSeries, true);
    assert.equal(model.secondary, null);
  });

  it("draws nothing extra when the board has no baseline", () => {
    assert.equal(buildComparisonMapModel(proposalSeries, null, true).secondary, null);
  });
});

describe("B4 — zero located stops renders NO map, on either side", () => {
  const emptyBaseline = buildProposalMapSeries(
    buildProposalMapTabs([source("base", "Your Plan", 0, 4, true)])[0],
  );
  const emptyProposal = buildProposalMapSeries(
    buildProposalMapTabs([source("v1", "Variant A", 0, 3)])[0],
  );
  const locatedProposal = buildProposalMapSeries(
    buildProposalMapTabs([source("v2", "Variant B", 2, 1)])[0],
  );

  it("has no map when neither side located a single stop", () => {
    const model = buildComparisonMapModel(emptyProposal, emptyBaseline, true);
    assert.equal(model.hasAnyLocated, false);
    // The counts are still stated — "0 of 3 located" is the honest answer, not silence.
    assert.equal(locatedCountLine(model.primary), "Variant A: 0 of 3 located");
    assert.equal(locatedCountLine(model.secondary!), "Your Plan: 0 of 4 located");
  });

  it("has no map for an unlocated proposal viewed on its own", () => {
    assert.equal(buildComparisonMapModel(emptyProposal, emptyBaseline, false).hasAnyLocated, false);
  });

  it("still draws when only ONE of the two series located anything", () => {
    assert.equal(buildComparisonMapModel(locatedProposal, emptyBaseline, true).hasAnyLocated, true);
    assert.equal(buildComparisonMapModel(emptyProposal, locatedProposal, true).hasAnyLocated, true);
  });
});

describe("B5 — the shipped wiring (a gate the call site can reach past is the defect)", () => {
  it("the board hands the baseline variant to the map, marked as the baseline", () => {
    const page = read(PAGE);
    assert.match(page, /<ProposalComparisonMap/);
    assert.match(page, /isBaseline: true/);
    // The map's baseline is the SAME variant the baseline COLUMN renders — one source.
    assert.match(page, /id: userVariant\.id/);
  });

  it("the component carries the ratified testids", () => {
    const component = read(COMPONENT);
    for (const testId of [
      "proposal-map-tab-baseline",
      "proposal-map-compare-toggle",
      "proposal-map-located-baseline",
      "proposal-map-located-proposal",
    ]) {
      assert.ok(component.includes(testId), `missing data-testid ${testId}`);
    }
  });

  it("both renderers draw the second series — no compare-only fork (§18 rule 1)", () => {
    const component = read(COMPONENT);
    assert.match(component, /secondarySeries=\{/);
    assert.match(component, /secondaryItems=\{/);
    assert.match(read(MAP_CONTROL_CENTER), /secondarySeries\?: SecondaryMapSeries \| null;/);
    assert.match(read(LEAFLET), /dashArray\?: string;/);
    assert.match(read(LEAFLET), /muted\?: boolean;/);
  });

  it("never claims a route: the caption says sequence, and no distance helper is reachable", () => {
    const component = read(COMPONENT);
    assert.match(component, /they are not travel routes, and no distance or duration is implied/);
    // §13 / LD 22c: the surface may LABEL its connectors, never measure them. No distance or
    // duration helper is imported, and nothing here does coordinate arithmetic.
    assert.ok(
      !/haversine|distanceKm|distanceBetween|sumLegMinutes|Math\.sqrt/i.test(component),
      "the map component must not derive a distance or duration",
    );
  });
});
