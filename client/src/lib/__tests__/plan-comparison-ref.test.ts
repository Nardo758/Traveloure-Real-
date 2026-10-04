/**
 * The plancard's link back to its comparison board (B6/B7). The board's own map —
 * `ProposalComparisonMap` and its `proposal-map-model` — is RETIRED in surface step 5 (ledger
 * `2026-10-04-surface-step5-map-versions`): the comparison screen now uses `MapControlCenter`'s
 * Draft / A / B / C toggle, proven in `versions-board.test.ts` and `map-scene.test.ts`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { planComparisonRef } from "../../../../shared/trip-plan";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const SLIP_VIEW = path.join(ROOT, "client/src/components/plancard/SlipView.tsx");
const PLAN_CARD = path.join(ROOT, "client/src/components/plancard/PlanCard.tsx");
const TRIP_PLAN_SERVICE = path.join(ROOT, "server/services/trip-plan.service.ts");
const PLANCARD_ROUTE = path.join(ROOT, "server/routes/plancard.routes.ts");

const read = (file: string) => fs.readFileSync(file, "utf8");

describe("the comparison board's own map is retired", () => {
  it("ProposalComparisonMap and its model are gone, and the board mounts no map of its own", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "client/src/components/plancard/ProposalComparisonMap.tsx")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "client/src/lib/proposal-map-model.ts")), false);
    const page = read(path.join(ROOT, "client/src/pages/itinerary-comparison.tsx"));
    assert.ok(!/ProposalComparisonMap|LeafletPlanMap|ExperienceMap/.test(page));
  });
});

describe("B6 — the plancard names the board ONLY when a comparison exists", () => {
  it("carries the id when the comparison row is there", () => {
    assert.deepEqual(planComparisonRef({ id: "cmp_1" }), { lastComparisonId: "cmp_1" });
  });

  it("OMITS the key entirely when there is no comparison — never a null-filled fake", () => {
    for (const absent of [null, undefined, {}, { id: null }, { id: "" }]) {
      const ref = planComparisonRef(absent as { id?: string | null } | null | undefined);
      assert.deepEqual(ref, {});
      assert.equal("lastComparisonId" in ref, false);
      // Spreading an absent ref must not put the key on the wire at all.
      assert.equal("lastComparisonId" in { lastOptimizedAt: null, ...ref }, false);
    }
  });
});

describe("B7 — the link back reads the DTO, and no surface fetches comparisons to find it", () => {
  it("the assembler and the route emit the id off the SAME comparison row as lastOptimizedAt", () => {
    const service = read(TRIP_PLAN_SERVICE);
    assert.match(service, /planComparisonRef/);
    // The spread sits directly under lastOptimizedAt — one row read, no second query.
    assert.match(service, /lastOptimizedAt,\n(?:\s*\/\/.*\n)*\s*\.\.\.planComparisonRef\(comparison\),/);
    assert.match(read(PLANCARD_ROUTE), /planComparisonRef\(/);
  });

  it("the slip's link is the DTO field, gated on its presence", () => {
    const slip = read(SLIP_VIEW);
    assert.match(slip, /data-testid="slip-see-what-changed"/);
    assert.match(slip, /hasOptimized && data\.lastComparisonId &&/);
    assert.match(slip, /\/itinerary-comparison\/\$\{data\.lastComparisonId\}/);
    // §14/§18 rule 1: the slip never asks the server for the user's comparisons to work out
    // which board this plan came from — the id arrives on the plancard payload it already has.
    assert.ok(
      !/api\/itinerary-comparisons/.test(slip.replace(/\/itinerary-comparison\/\$\{data\.lastComparisonId\}/g, "")),
      "the slip must not fetch the comparisons list",
    );
  });

  it("the AI Optimized pill points at the same board, and falls back when there is none", () => {
    const planCard = read(PLAN_CARD);
    assert.match(planCard, /lastComparisonId = plancardData\?\.lastComparisonId \?\? null/);
    assert.match(
      planCard,
      /navigate\(lastComparisonId \? `\/itinerary-comparison\/\$\{lastComparisonId\}` : planHref\)/,
    );
  });
});
