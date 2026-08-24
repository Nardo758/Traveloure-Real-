/**
 * Behavioral proof for server/services/traveler-profile.service.ts — WP-A
 * (docs/briefs/OPTIMIZER_SOURCING_BUILD_SPEC.md).
 *
 * Pure-function coverage only: `mergeTravelerProfile` and its helpers never touch the DB, so
 * these tests exercise them directly with synthetic explicit/derived inputs. The module also
 * exports DB-backed functions (getTravelerProfile, recordDislikeFeedback, ...) which import
 * "../db" at module load — that import only THROWS if DATABASE_URL is completely unset (the Pool
 * itself connects lazily), so this file needs a DATABASE_URL present in the environment (a real
 * one in CI's disposable-DB posture, any placeholder value locally) purely to satisfy that
 * import-time guard. No query is ever issued by these tests.
 *
 * Run with: DATABASE_URL=<any value> npx tsx --test server/services/__tests__/traveler-profile.service.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("mergeTravelerProfile — explicit beats derived (the merge rule)", () => {
  it("explicit transportPreference wins over a conflicting derived signal", async () => {
    const { mergeTravelerProfile } = await import("../traveler-profile.service.js");

    const explicit = { transportPreference: "time" as const };
    // Derived signal points the OTHER way (comfort, from a taxi-heavy purchase history) —
    // explicit must still win.
    const derived = {
      preferredTransportMode: "taxi",
      transportModeCounts: { taxi: 5 },
      dislikeThemeCounts: {},
    };

    const effective = mergeTravelerProfile(explicit, derived);
    assert.equal(effective.transportPreference, "time");
    assert.equal(effective.source.transportPreference, "explicit");
  });

  it("derived transportPreference surfaces when explicit is unset", async () => {
    const { mergeTravelerProfile } = await import("../traveler-profile.service.js");

    const explicit = {};
    const derived = {
      preferredTransportMode: "taxi",
      transportModeCounts: { taxi: 5 },
      dislikeThemeCounts: {},
    };

    const effective = mergeTravelerProfile(explicit, derived);
    assert.equal(effective.transportPreference, "comfort"); // taxi classifies to "comfort"
    assert.equal(effective.source.transportPreference, "derived");
  });

  it("explicit pace wins over a conflicting derived too_packed signal", async () => {
    const { mergeTravelerProfile } = await import("../traveler-profile.service.js");

    const explicit = { pace: "packed" as const };
    const derived = {
      preferredTransportMode: null,
      transportModeCounts: {},
      dislikeThemeCounts: { too_packed: 4 }, // would derive "relaxed" on its own
    };

    const effective = mergeTravelerProfile(explicit, derived);
    assert.equal(effective.pace, "packed");
    assert.equal(effective.source.pace, "explicit");
  });

  it("derived pace ('relaxed') surfaces from repeated too_packed feedback when explicit is unset", async () => {
    const { mergeTravelerProfile } = await import("../traveler-profile.service.js");

    const explicit = {};
    const derived = {
      preferredTransportMode: null,
      transportModeCounts: {},
      dislikeThemeCounts: { too_packed: 2 },
    };

    const effective = mergeTravelerProfile(explicit, derived);
    assert.equal(effective.pace, "relaxed");
    assert.equal(effective.source.pace, "derived");
  });

  it("a single too_packed occurrence does NOT derive a pace (needs a repeated pattern, >=2)", async () => {
    const { mergeTravelerProfile } = await import("../traveler-profile.service.js");

    const effective = mergeTravelerProfile(
      {},
      { preferredTransportMode: null, transportModeCounts: {}, dislikeThemeCounts: { too_packed: 1 } },
    );
    assert.equal(effective.pace, undefined);
    assert.equal(effective.source.pace, "none");
  });

  it("no explicit and no derived signal leaves a field genuinely unset (never a fabricated default)", async () => {
    const { mergeTravelerProfile } = await import("../traveler-profile.service.js");

    const effective = mergeTravelerProfile(
      {},
      { preferredTransportMode: null, transportModeCounts: {}, dislikeThemeCounts: {} },
    );
    assert.equal(effective.transportPreference, undefined);
    assert.equal(effective.pace, undefined);
    assert.equal(effective.budgetBand, undefined);
    assert.equal(effective.mobility, undefined);
    assert.deepEqual(effective.dietary, []);
    assert.equal(effective.source.transportPreference, "none");
    assert.equal(effective.source.budgetBand, "none");
    assert.equal(effective.source.mobility, "none");
    assert.equal(effective.source.dietary, "none");
  });

  it("budgetBand, mobility and dietary have no derived source in this work package — explicit-only, but still merge cleanly", async () => {
    const { mergeTravelerProfile } = await import("../traveler-profile.service.js");

    const explicit = { budgetBand: "luxury" as const, mobility: "wheelchair" as const, dietary: ["vegan" as const] };
    const effective = mergeTravelerProfile(explicit, {
      preferredTransportMode: null,
      transportModeCounts: {},
      dislikeThemeCounts: {},
    });
    assert.equal(effective.budgetBand, "luxury");
    assert.equal(effective.source.budgetBand, "explicit");
    assert.equal(effective.mobility, "wheelchair");
    assert.deepEqual(effective.dietary, ["vegan"]);
    assert.equal(effective.source.dietary, "explicit");
  });
});

describe("classifyModeToPrioritize — real mode name -> prioritize dimension", () => {
  it("classifies known comfort/scenic/cost modes correctly", async () => {
    const { classifyModeToPrioritize } = await import("../traveler-profile.service.js");
    assert.equal(classifyModeToPrioritize("taxi"), "comfort");
    assert.equal(classifyModeToPrioritize("Rideshare"), "comfort"); // case-insensitive
    assert.equal(classifyModeToPrioritize("walk"), "scenic");
    assert.equal(classifyModeToPrioritize("train"), "cost");
  });

  it("returns null for an unrecognized mode — never a fabricated guess", async () => {
    const { classifyModeToPrioritize } = await import("../traveler-profile.service.js");
    assert.equal(classifyModeToPrioritize("teleporter"), null);
  });
});

describe("effectiveProfileToTransportPrefs — only touches CHOICE knobs, never price", () => {
  it("maps transportPreference/budgetBand straight through and mobility into accessibility+maxWalkMinutes", async () => {
    const { effectiveProfileToTransportPrefs } = await import("../traveler-profile.service.js");
    const prefs = effectiveProfileToTransportPrefs({
      transportPreference: "comfort",
      pace: undefined,
      budgetBand: "luxury",
      dietary: [],
      mobility: "wheelchair",
      source: { transportPreference: "explicit", pace: "none", budgetBand: "explicit", dietary: "none", mobility: "explicit" },
    });
    assert.equal(prefs.prioritize, "comfort");
    assert.equal(prefs.budgetTier, "luxury");
    assert.equal(prefs.accessibility, true);
    assert.equal(prefs.maxWalkMinutes, 5);
    // Never sets a cost/price field — the object has exactly the documented knobs.
    assert.deepEqual(Object.keys(prefs).sort(), ["accessibility", "budgetTier", "maxWalkMinutes", "prioritize"]);
  });

  it("returns an empty object when the effective profile carries no signal at all", async () => {
    const { effectiveProfileToTransportPrefs } = await import("../traveler-profile.service.js");
    const prefs = effectiveProfileToTransportPrefs({
      transportPreference: undefined,
      pace: undefined,
      budgetBand: undefined,
      dietary: [],
      mobility: undefined,
      source: { transportPreference: "none", pace: "none", budgetBand: "none", dietary: "none", mobility: "none" },
    });
    assert.deepEqual(prefs, {});
  });
});

describe("matchesDietary — real keyword match, never a fabricated verdict", () => {
  it("matches a dietary tag's keyword in service text", async () => {
    const { matchesDietary } = await import("../traveler-profile.service.js");
    assert.equal(matchesDietary("A cozy vegan tasting menu", ["vegan"]), true);
    assert.equal(matchesDietary("Gluten-Free pasta night", ["gluten_free"]), true);
  });

  it("does not match when no keyword is present, and returns false for empty dietary list", async () => {
    const { matchesDietary } = await import("../traveler-profile.service.js");
    assert.equal(matchesDietary("A steakhouse dinner", ["vegan"]), false);
    assert.equal(matchesDietary("A steakhouse dinner", []), false);
  });
});

describe("buildTravelerProfilePromptSection — honest, conditional prompt text", () => {
  it("returns an empty string when there is nothing real to say", async () => {
    const { buildTravelerProfilePromptSection } = await import("../traveler-profile.service.js");
    const section = buildTravelerProfilePromptSection({
      explicit: {},
      derived: { preferredTransportMode: null, transportModeCounts: {}, dislikeThemeCounts: {} },
      effective: {
        transportPreference: undefined, pace: undefined, budgetBand: undefined, dietary: [], mobility: undefined,
        source: { transportPreference: "none", pace: "none", budgetBand: "none", dietary: "none", mobility: "none" },
      },
    });
    assert.equal(section, "");
  });

  it("includes only the lines backed by a real value", async () => {
    const { buildTravelerProfilePromptSection, mergeTravelerProfile } = await import("../traveler-profile.service.js");
    const explicit = { transportPreference: "scenic" as const };
    const derived = { preferredTransportMode: null, transportModeCounts: { train: 3 }, dislikeThemeCounts: {} };
    const section = buildTravelerProfilePromptSection({
      explicit,
      derived,
      effective: mergeTravelerProfile(explicit, derived),
    });
    assert.match(section, /Transport preference: prioritize scenic \(explicit\)/);
    assert.match(section, /Historically booked transport modes: train \(3\)/);
    assert.doesNotMatch(section, /Pace:/);
    assert.doesNotMatch(section, /Dietary:/);
  });
});
