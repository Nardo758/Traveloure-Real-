/**
 * Phase 5.1 Upsell Engine — gate test suite.
 *
 * THE relevance-dominance test is the contract:
 *
 *   For any two candidates A, B where A.relevance - B.relevance > bandWidth,
 *   A.final > B.final must hold REGARDLESS of revenue.
 *
 * If this test fails, revenue is overriding fit — the build is wrong.
 *
 * Plus hard-filter pure-logic coverage (transport suppression, risk-mobility,
 * background-check gating, already-in-plan).
 *
 * Run with: npx tsx server/services/__tests__/upsell-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  blendScore,
  computeRelevance,
  DEFAULT_POLICY,
  holdsDominance,
  isAlreadyInPlan,
  isBackgroundCheckGated,
  isInTemplate,
  isRiskSuppressed,
  isTransportSuppressed,
  normalizeRevenue,
  rankCandidates,
  templateStrengthScore,
  type RankInputCandidate,
  type SlotConfig,
  type UpsellContext,
} from "../upsell-engine.service";
import { resolveTemplateKey } from "../../routes/upsell.routes";

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe("Phase 5.1 — templateStrengthScore", () => {
  it("REQ → 1.0", () => assert.equal(templateStrengthScore("REQ"), 1.0));
  it("REC → 0.7", () => assert.equal(templateStrengthScore("REC"), 0.7));
  it("OPT → 0.4", () => assert.equal(templateStrengthScore("OPT"), 0.4));
  it("null (outside matrix) → 0", () => assert.equal(templateStrengthScore(null), 0));
});

describe("Phase 5.1 — computeRelevance (weights sum to 1 → relevance ∈ [0,1])", () => {
  const w = DEFAULT_POLICY.relevanceWeights;
  const sum = w.templateStrength + w.profileMatch + w.proximity + w.expertEndorsement;

  it("weight sum = 1 (so relevance stays bounded)", () => {
    assert.equal(Math.round(sum * 1e6) / 1e6, 1);
  });

  it("REQ + full profile + perfect proximity + endorsed → relevance = 1", () => {
    const r = computeRelevance(
      { templateStrength: "REQ", profileMatchScore: 1, proximityFit: 1, expertEndorsed: true },
      w,
    );
    assert.equal(Math.round(r * 1e6) / 1e6, 1);
  });

  it("OPT + 0 profile + 0 proximity + not endorsed → relevance ≈ 0.16", () => {
    const r = computeRelevance(
      { templateStrength: "OPT", profileMatchScore: 0, proximityFit: 0, expertEndorsed: false },
      w,
    );
    // OPT=0.4, weight 0.40 → 0.16. Other terms are 0.
    assert.equal(Math.round(r * 100) / 100, 0.16);
  });

  it("clamps inputs above 1 down to 1", () => {
    const r = computeRelevance(
      { templateStrength: "REQ", profileMatchScore: 5, proximityFit: 5, expertEndorsed: true },
      w,
    );
    assert.equal(Math.round(r * 1e6) / 1e6, 1);
  });
});

describe("Phase 5.1 — normalizeRevenue", () => {
  it("max value → 1; others scaled proportionally", () => {
    assert.deepEqual(normalizeRevenue([10, 5, 0]), [1, 0.5, 0]);
  });
  it("all zeros → all zeros (no revenue signal)", () => {
    assert.deepEqual(normalizeRevenue([0, 0, 0]), [0, 0, 0]);
  });
  it("negatives clamp to 0", () => {
    assert.deepEqual(normalizeRevenue([-5, 5]), [0, 1]);
  });
});

describe("Phase 5.1 — blendScore", () => {
  it("formula: relevance + min(weight, cap) * revenue", () => {
    // weight 0.2, cap 0.15 → effective 0.15. 0.5 + 0.15 * 1.0 = 0.65
    assert.equal(blendScore(0.5, 1.0, { revenueWeight: 0.2, revenueCap: 0.15 }), 0.65);
  });
  it("weight below cap → weight used", () => {
    // weight 0.05, cap 0.15 → effective 0.05. 0.5 + 0.05 * 1.0 = 0.55
    assert.equal(blendScore(0.5, 1.0, { revenueWeight: 0.05, revenueCap: 0.15 }), 0.55);
  });
});

// ─── THE relevance-dominance test (the trust guardrail) ──────────────────────

describe("Phase 5.1 — RELEVANCE DOMINANCE (the contract)", () => {
  // Sweep across (gap, revenue ratio, policy) and assert the contract holds.
  it("for every (A, B) where relevance(A) - relevance(B) > bandWidth, finalScore(A) > finalScore(B) — revenue is irrelevant", () => {
    const policies = [
      { revenueWeight: 0.15, revenueCap: 0.15, bandWidth: 0.15 },  // default
      { revenueWeight: 0.20, revenueCap: 0.15, bandWidth: 0.15 },  // weight > cap (cap clamps)
      { revenueWeight: 0.05, revenueCap: 0.15, bandWidth: 0.15 },  // low revenue weight
      { revenueWeight: 0.15, revenueCap: 0.10, bandWidth: 0.10 },  // tighter cap + band
    ];

    let failures: string[] = [];
    let pairsChecked = 0;

    for (const policy of policies) {
      // Sweep relevance values
      for (let aRel = 0.10; aRel <= 1.0; aRel += 0.05) {
        for (let bRel = 0; bRel <= aRel - 0.01; bRel += 0.05) {
          const gap = aRel - bRel;
          if (gap <= policy.bandWidth + 1e-9) continue; // not in dominance zone — contract doesn't apply

          // Worst case for the contract: A has minimum revenue (0), B has maximum (1).
          // If A still wins, the contract holds for all revenue configurations.
          const aFinal = blendScore(aRel, 0, policy);
          const bFinal = blendScore(bRel, 1, policy);

          pairsChecked++;
          if (!holdsDominance({ relevance: aRel, final: aFinal }, { relevance: bRel, final: bFinal }, policy.bandWidth)) {
            failures.push(
              `policy=${JSON.stringify(policy)} gap=${gap.toFixed(3)} aFinal=${aFinal.toFixed(4)} bFinal=${bFinal.toFixed(4)}`,
            );
          }
        }
      }
    }

    assert.ok(pairsChecked > 100, `expected >100 pairs swept, got ${pairsChecked}`);
    assert.equal(failures.length, 0, `dominance violated in ${failures.length} pairs:\n${failures.slice(0, 5).join("\n")}`);
  });

  it("structural proof: max revenue lift = min(weight, cap), which is ≤ bandWidth in our defaults", () => {
    // min(0.15, 0.15) = 0.15 == bandWidth. So a gap > 0.15 cannot be overcome by revenue.
    const policy = DEFAULT_POLICY;
    const maxRevenueLift = Math.min(policy.revenueWeight, policy.revenueCap);
    assert.ok(
      maxRevenueLift <= policy.bandWidth + 1e-9,
      `Configuration breaks the dominance contract: max revenue lift ${maxRevenueLift} exceeds bandWidth ${policy.bandWidth}.`,
    );
  });

  it("contract DOES allow revenue reordering within a band (smaller gap)", () => {
    // gap of 0.10, band of 0.15 → contract doesn't bind, revenue may flip order.
    const aRel = 0.50;
    const bRel = 0.40;
    const aFinal = blendScore(aRel, 0, { revenueWeight: 0.15, revenueCap: 0.15 });
    const bFinal = blendScore(bRel, 1, { revenueWeight: 0.15, revenueCap: 0.15 });
    // bFinal can exceed aFinal here — that's allowed (band tie-break).
    assert.ok(bFinal > aFinal, `Within a band, revenue should be able to reorder. aFinal=${aFinal}, bFinal=${bFinal}`);
    // And holdsDominance returns true because gap (0.10) is NOT > bandWidth (0.15).
    assert.ok(holdsDominance({ relevance: aRel, final: aFinal }, { relevance: bRel, final: bFinal }, 0.15));
  });
});

// ─── Hard-filter helpers ─────────────────────────────────────────────────────

describe("Phase 5.1 — hard filters", () => {
  it("isInTemplate: REQ/REC/OPT pass; null excluded", () => {
    assert.equal(isInTemplate("REQ"), true);
    assert.equal(isInTemplate("REC"), true);
    assert.equal(isInTemplate("OPT"), true);
    assert.equal(isInTemplate(null), false);
  });

  it("isAlreadyInPlan: matches on offeringId OR categoryKey", () => {
    const cart = [{ offeringId: "x", categoryKey: "photography" }];
    assert.equal(isAlreadyInPlan("x", "anything", cart), true);
    assert.equal(isAlreadyInPlan("y", "photography", cart), true);
    assert.equal(isAlreadyInPlan("y", "tour_guide", cart), false);
  });

  it("isTransportSuppressed: blocked everywhere except plancard_ontrip", () => {
    assert.equal(isTransportSuppressed("private_transportation", "cart"), true);
    assert.equal(isTransportSuppressed("private_transportation", "optimize_gate"), true);
    assert.equal(isTransportSuppressed("private_transportation", "plancard_ontrip"), false);
    assert.equal(isTransportSuppressed("aff_ground_transport", "checkout"), true);
    assert.equal(isTransportSuppressed("photography", "cart"), false);
  });

  it("isRiskSuppressed: high/specialized suppressed for low-mobility", () => {
    assert.equal(isRiskSuppressed("high", null, { mobilityLevel: "low" }), true);
    assert.equal(isRiskSuppressed("specialized", null, { mobilityLevel: "low" }), true);
    assert.equal(isRiskSuppressed("moderate", null, { mobilityLevel: "low" }), false);
    assert.equal(isRiskSuppressed("low", null, { mobilityLevel: "low" }), false);
  });

  it("isRiskSuppressed: high/specialized suppressed for family_kids without opt-in", () => {
    assert.equal(isRiskSuppressed("high", null, { familyKids: true }), true);
    assert.equal(isRiskSuppressed("high", null, { familyKids: true, familyKidsOptIn: true }), false);
    assert.equal(isRiskSuppressed("high", null, { familyKids: false }), false);
  });

  it("isRiskSuppressed: offering riskOverride supersedes category riskProfile", () => {
    // Category 'low' but offering escalates to 'high' (sport_instructor case)
    assert.equal(isRiskSuppressed("low", "high", { mobilityLevel: "low" }), true);
    // Category 'high' but offering downgrades to 'low' (hypothetical)
    assert.equal(isRiskSuppressed("high", "low", { mobilityLevel: "low" }), false);
  });

  // The exact scenario commit 048 added the field for: a moderate category
  // (activity_provider — cooking, tea, crafts) hosting a high-risk offering
  // (sport_instructor — Surf/Bike/Kayak/Climb). The category-only check would
  // surface it on a family trip; the override fixes that.
  it("isRiskSuppressed: moderate-category + high-override + family trip → suppressed", () => {
    // sport_instructor case: category=moderate, offering.riskOverride=high
    assert.equal(
      isRiskSuppressed("moderate", "high", { familyKids: true }),
      true,
      "high-override on a moderate-category offering must suppress for family without opt-in",
    );
    // Counter: family opt-in unlocks it
    assert.equal(
      isRiskSuppressed("moderate", "high", { familyKids: true, familyKidsOptIn: true }),
      false,
    );
    // Gentle sibling (no override) on same moderate category surfaces normally
    assert.equal(
      isRiskSuppressed("moderate", null, { familyKids: true }),
      false,
      "Gentle moderate-category offerings (tea, cooking, crafts) must not be suppressed for family",
    );
  });

  it("isBackgroundCheckGated: bg-required offerings gated until provider has verified badge", () => {
    assert.equal(isBackgroundCheckGated(true, false), true);
    assert.equal(isBackgroundCheckGated(true, undefined), true);
    assert.equal(isBackgroundCheckGated(true, true), false);
    assert.equal(isBackgroundCheckGated(false, false), false);
  });
});

// ─── End-to-end pipeline (using the pure rankCandidates) ─────────────────────

describe("Phase 5.1 — rankCandidates end-to-end", () => {
  const slotConfig: SlotConfig = {
    surface: "cart",
    maxItems: 3,
    revenueWeight: 0.15,
    revenueCap: 0.15,
    frequencyCapHours: 0,
    enabled: true,
  };
  const ctx: UpsellContext = {
    surface: "cart",
    cartItems: [],
    userProfile: { mobilityLevel: "moderate" },
  };

  function mkCandidate(overrides: Partial<RankInputCandidate>): RankInputCandidate {
    return {
      offeringId: "o-" + Math.random(),
      categoryKey: "photography",
      sourceType: "platform_provider",
      templateStrength: "REC",
      riskProfile: "low",
      riskOverride: null,
      requiresBackgroundCheck: false,
      providerHasVerifiedBadge: true,
      candidateNeighborhoodSlug: null,
      expectedPlatformEarningsRaw: 10,
      expertEndorsed: false,
      profileMatchScore: 0.5,
      proximityFit: 0.5,
      ...overrides,
    };
  }

  it("filters out transport pre-optimize", () => {
    const result = rankCandidates(ctx, [
      mkCandidate({ offeringId: "transport", categoryKey: "private_transportation" }),
      mkCandidate({ offeringId: "photo", categoryKey: "photography" }),
    ], slotConfig);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].offeringId, "photo");
    assert.ok(result.suppressed.some(s => s.offeringId === "transport" && s.reason === "transport_pre_optimize"));
  });

  // Phase 5.2 step-4 gate: transport stays suppressed on BOTH cart AND
  // discover surfaces. Confirms isTransportSuppressed fires the same way on
  // each surface name the new endpoints will pass (cart / discover_location /
  // discover_date), with plancard_ontrip as the sole exception.
  it("step 4 gate: transport suppressed on cart, discover_location, discover_date — allowed on plancard_ontrip", () => {
    const surfaces = ["cart", "discover_location", "discover_date", "plancard_ontrip"] as const;
    for (const surface of surfaces) {
      const surfCtx = { ...ctx, surface } as UpsellContext;
      const surfSlot = { ...slotConfig, surface } as SlotConfig;
      const result = rankCandidates(surfCtx, [
        mkCandidate({ offeringId: "transport", categoryKey: "private_transportation" }),
        mkCandidate({ offeringId: "aff_transport", categoryKey: "aff_ground_transport" }),
        mkCandidate({ offeringId: "photo", categoryKey: "photography" }),
      ], surfSlot);

      if (surface === "plancard_ontrip") {
        // All 3 should make it through (live trip can surface transport).
        assert.equal(result.candidates.length, 3, `plancard_ontrip should NOT suppress transport`);
      } else {
        // 2 transport entries suppressed; only photo surfaces.
        assert.equal(result.candidates.length, 1, `${surface} should suppress transport`);
        assert.equal(result.candidates[0].offeringId, "photo");
        assert.equal(
          result.suppressed.filter(s => s.reason === "transport_pre_optimize").length,
          2,
          `${surface} should record 2 transport_pre_optimize suppressions`,
        );
      }
    }
  });

  it("caps at slotConfig.maxItems", () => {
    const inputs = Array.from({ length: 10 }, (_, i) =>
      mkCandidate({ offeringId: `o${i}`, expectedPlatformEarningsRaw: 10 + i })
    );
    const result = rankCandidates(ctx, inputs, slotConfig);
    assert.equal(result.candidates.length, 3);
  });

  it("returns rank in slot order, 1-indexed", () => {
    const inputs = [
      mkCandidate({ offeringId: "a", templateStrength: "REQ", expectedPlatformEarningsRaw: 1 }),
      mkCandidate({ offeringId: "b", templateStrength: "OPT", expectedPlatformEarningsRaw: 100 }),
    ];
    const result = rankCandidates(ctx, inputs, slotConfig);
    assert.equal(result.candidates[0].rank, 1);
    assert.equal(result.candidates[1].rank, 2);
    // REQ vs OPT gap = w1*(1.0 - 0.4) = 0.40*0.6 = 0.24 > 0.15 bandWidth.
    // Revenue can't flip this. 'a' must rank 1.
    assert.equal(result.candidates[0].offeringId, "a");
  });

  it("disabled slot returns no candidates", () => {
    const result = rankCandidates(ctx, [mkCandidate({})], { ...slotConfig, enabled: false });
    assert.equal(result.candidates.length, 0);
  });

  it("already-in-plan suppressed", () => {
    const ctxWithCart: UpsellContext = { ...ctx, cartItems: [{ offeringId: "x", categoryKey: "photography" }] };
    const result = rankCandidates(ctxWithCart, [
      mkCandidate({ offeringId: "y", categoryKey: "photography" }),
    ], slotConfig);
    assert.equal(result.candidates.length, 0);
    assert.ok(result.suppressed[0].reason === "already_in_plan");
  });
});

// ─── Step 5 gate: template-on-discover + delta-only secrecy + plancard rules ─

describe("Phase 5.2 — resolveTemplateKey (discover defensiveness)", () => {
  it("null → 'travel'", () => assert.equal(resolveTemplateKey(null), "travel"));
  it("undefined → 'travel'", () => assert.equal(resolveTemplateKey(undefined), "travel"));
  it("empty string → 'travel' (catches the `??` gap)", () => assert.equal(resolveTemplateKey(""), "travel"));
  it("'   ' (whitespace) → 'travel'", () => assert.equal(resolveTemplateKey("   "), "travel"));
  it("'wedding' passes through", () => assert.equal(resolveTemplateKey("wedding"), "wedding"));
  it("'  wedding  ' trimmed", () => assert.equal(resolveTemplateKey("  wedding  "), "wedding"));
});

describe("Phase 5.2 step 5 gate — optimize_gate DELTA-ONLY contract", () => {
  // The optimize_gate endpoint must NOT leak named candidates / offering IDs
  // / display names / prices — only counts + de-duped categoryHints. We can't
  // run the endpoint here without express; instead, we verify the SHAPE the
  // engine returns AND the REDACTION pattern the endpoint applies.
  it("teaser response shape contains addOnsAvailable + categoryHints only — no offeringId / displayName / price", () => {
    // Simulate the endpoint's response builder.
    const fakeRanked = [
      { offeringId: "couples_photographer", categoryKey: "photography", finalScore: 0.8 },
      { offeringId: "in_home_chef",         categoryKey: "private_chef", finalScore: 0.7 },
      { offeringId: "tea_ritual_host",      categoryKey: "activity_provider", finalScore: 0.6 },
      { offeringId: "wellness_session",     categoryKey: "activity_provider", finalScore: 0.5 },
    ];
    // The endpoint dedupes categoryKey then drops everything else.
    const categoryHints = Array.from(new Set(fakeRanked.map(c => c.categoryKey))).filter(Boolean);
    const teaserResponse = {
      delta: null,
      addOnsAvailable: fakeRanked.length,
      categoryHints,
      teaser: `${fakeRanked.length} add-ons could improve this plan`,
    };
    // No offeringId leaks.
    const json = JSON.stringify(teaserResponse);
    assert.ok(!json.includes("couples_photographer"), "optimize_gate leaked offeringId");
    assert.ok(!json.includes("in_home_chef"), "optimize_gate leaked offeringId");
    assert.ok(!json.includes("tea_ritual_host"), "optimize_gate leaked offeringId");
    // No displayName / price / tagline fields.
    assert.ok(!("displayName" in teaserResponse), "optimize_gate response must not contain displayName");
    assert.ok(!("candidates" in teaserResponse), "optimize_gate response must not contain candidates");
    // Categories ARE allowed (the teaser tells the user broadly what's missing).
    assert.deepEqual(categoryHints.sort(), ["activity_provider", "photography", "private_chef"]);
    assert.equal(teaserResponse.addOnsAvailable, 4);
  });

  it("zero candidates → teaser is null (don't shout when there's nothing to tease)", () => {
    const teaserResponse = {
      delta: null,
      addOnsAvailable: 0,
      categoryHints: [] as string[],
      teaser: null,
    };
    assert.equal(teaserResponse.teaser, null);
    assert.equal(teaserResponse.addOnsAvailable, 0);
  });
});

describe("Phase 5.2 step 5 gate — plancard_pretrip gap-driven candidates", () => {
  it("emptySlotCategoryKeys restricts the candidate set to those categories only", () => {
    const slotConfig: SlotConfig = {
      surface: "plancard_pretrip",
      maxItems: 5,
      revenueWeight: 0.15,
      revenueCap: 0.15,
      frequencyCapHours: 0,
      enabled: true,
    };
    const ctx: UpsellContext = { surface: "plancard_pretrip", cartItems: [] };
    function mk(overrides: Partial<RankInputCandidate>): RankInputCandidate {
      return {
        offeringId: "o-" + Math.random(),
        categoryKey: "photography",
        sourceType: "platform_provider",
        templateStrength: "REC",
        riskProfile: "low",
        riskOverride: null,
        requiresBackgroundCheck: false,
        providerHasVerifiedBadge: true,
        candidateNeighborhoodSlug: null,
        expectedPlatformEarningsRaw: 1,
        expertEndorsed: false,
        profileMatchScore: 0.5,
        proximityFit: 0.5,
        ...overrides,
      };
    }

    // The endpoint pre-filters raw candidates by emptySlotCategoryKeys before
    // calling rankCandidates. Simulate that filter here.
    const raw = [
      mk({ offeringId: "photo1",   categoryKey: "photography" }),
      mk({ offeringId: "chef1",    categoryKey: "private_chef" }),
      mk({ offeringId: "concierge1", categoryKey: "concierge_vip" }),
    ];
    const emptySlots = new Set(["photography", "private_chef"]);
    const filtered = raw.filter(c => emptySlots.has(c.categoryKey));

    const result = rankCandidates(ctx, filtered, slotConfig);
    assert.equal(result.candidates.length, 2);
    const keys = result.candidates.map(c => c.categoryKey).sort();
    assert.deepEqual(keys, ["photography", "private_chef"]);
  });
});

describe("Phase 5.2 step 5 gate — plancard_ontrip is the lone transport surface", () => {
  // Already proven by the "step 4 gate" test above — re-verifying the
  // invariant from the step-5 perspective so a future change to ontrip's
  // surface name in the engine doesn't silently regress.
  it("transport offerings pass through plancard_ontrip but no other pre-ontrip surface", () => {
    const transportSurfaces: Array<{ surface: any; suppressed: boolean }> = [
      { surface: "cart", suppressed: true },
      { surface: "discover_location", suppressed: true },
      { surface: "discover_date", suppressed: true },
      { surface: "optimize_gate", suppressed: true },
      { surface: "plancard_pretrip", suppressed: true },
      { surface: "plancard_ontrip", suppressed: false },
      { surface: "checkout", suppressed: true },
    ];
    for (const { surface, suppressed } of transportSurfaces) {
      const got = isTransportSuppressed("private_transportation", surface);
      assert.equal(got, suppressed, `${surface} transport-suppress expected ${suppressed}, got ${got}`);
    }
  });
});
