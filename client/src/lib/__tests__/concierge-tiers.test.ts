/**
 * THE CONCIERGE TIER ↔ FINISH MAP, held to its own rules.
 * Ledger `2026-09-07-concierge-door`; CLAUDE.md Locked Decision 45 (2).
 *
 * WHY THIS IS PINNED. "Which finish is this tier?" fails SILENTLY in both directions: a wrong
 * forward answer deep-opens the modal onto a CTA the door never named, and a wrong reverse answer
 * files a tier the traveler never picked into the concierge funnel. Neither throws, neither
 * renders differently enough to notice, and both are exactly the drift the ruling collapsed three
 * choosers into one to prevent.
 *
 *   C1  ai → the AI finish; expert → the local-expert finish.
 *   C2  full maps to NOTHING — it is an engagement, not a way to build a plan (§13, and the
 *       "do not invent a new money path" clause).
 *   C3  the reverse lookup round-trips for the two tiers that have a finish.
 *   C4  `myself` is NOT a tier — the reverse lookup answers null rather than the nearest tier.
 *   C5  an unrecognised / absent / empty `?tier=` hint resolves to nothing and deep-opens nothing.
 *   C6  a recognised hint deep-opens its finish; `full` deep-opens nothing even though it parses.
 *   C7  the map is TOTAL over the tier list — a tier added without a decision fails here rather
 *       than silently resolving to `undefined` at a call site.
 *
 * Pure unit: no DOM, no DB, no fetch.
 * Run: npx tsx --test client/src/lib/__tests__/concierge-tiers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONCIERGE_TIERS,
  CONCIERGE_TIER_FINISH,
  conciergeTierForFinish,
  finishForConciergeTier,
  parseConciergeTierHint,
  planningBranchForTierHint,
} from "../concierge-tiers";

describe("concierge tier → planning finish", () => {
  it("C1 · the two tiers that ARE ways to build map onto the modal's own CTAs", () => {
    assert.equal(finishForConciergeTier("ai"), "ai");
    assert.equal(finishForConciergeTier("expert"), "local");
  });

  it("C2 · full maps to NOTHING — an engagement is not a way to build a plan (§13)", () => {
    assert.equal(finishForConciergeTier("full"), null);
  });

  it("C3 · the reverse lookup round-trips for every tier that has a finish", () => {
    for (const tier of CONCIERGE_TIERS) {
      const finish = finishForConciergeTier(tier);
      if (finish === null) continue;
      assert.equal(conciergeTierForFinish(finish), tier, `${tier} must round-trip`);
    }
  });

  it("C4 · `myself` is not a concierge tier and is never recorded as one", () => {
    assert.equal(conciergeTierForFinish("myself"), null);
    // The Plus occasion CTA is not one either — it is a membership rail, not a delivery tier.
    assert.equal(conciergeTierForFinish("occasion"), null);
  });

  it("C5 · an unrecognised, empty or absent hint resolves to nothing", () => {
    for (const raw of [undefined, null, "", "   ", "platform", "AI tier", "local", "myself"]) {
      assert.equal(parseConciergeTierHint(raw), null, `${JSON.stringify(raw)} must not resolve`);
      assert.equal(planningBranchForTierHint(raw), null, `${JSON.stringify(raw)} must not deep-open`);
    }
  });

  it("C6 · a recognised hint deep-opens its finish; full parses but deep-opens nothing", () => {
    assert.equal(parseConciergeTierHint(" AI "), "ai");
    assert.equal(planningBranchForTierHint("ai"), "ai");
    assert.equal(planningBranchForTierHint("expert"), "local");
    assert.equal(parseConciergeTierHint("full"), "full");
    assert.equal(planningBranchForTierHint("full"), null);
  });

  it("C7 · the map is total over the tier list — a new tier needs a decision, not a default", () => {
    for (const tier of CONCIERGE_TIERS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(CONCIERGE_TIER_FINISH, tier),
        `${tier} has no entry in CONCIERGE_TIER_FINISH`,
      );
    }
    assert.equal(Object.keys(CONCIERGE_TIER_FINISH).length, CONCIERGE_TIERS.length);
  });
});
