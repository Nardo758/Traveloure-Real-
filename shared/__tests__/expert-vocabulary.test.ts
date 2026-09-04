/**
 * Expert vocabulary label map — gaps 7 and 8 of the Ways-to-Earn audit
 * (ledger `2026-09-04-earn-contained-fixes`).
 *
 * The rule under test is the three-step resolution in `shared/expert-vocabulary.ts`:
 * an enum slug wins, then an `expert_offering_types.display_name` supplied by the
 * caller, then the raw string UNCHANGED. The third step is the one that matters most
 * for §13: `POST /api/expert/specializations` accepts any sanitized string, so a value
 * this module does not know is the expert's own words — it may never be relabelled and
 * may never be dropped.
 *
 * Run: npx tsx --test shared/__tests__/expert-vocabulary.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expertSpecializationEnum } from "../schema";
import {
  EXPERT_SPECIALIZATION_LABELS,
  LOCAL_SPECIALTY_OPTIONS,
  labelForExpertSpecialization,
  labelForLocalSpecialty,
  emojiForLocalSpecialty,
} from "../expert-vocabulary";

describe("specialization labels", () => {
  it("covers every expertSpecializationEnum member", () => {
    for (const slug of expertSpecializationEnum) {
      const label = EXPERT_SPECIALIZATION_LABELS[slug];
      assert.ok(label && label.trim().length > 0, `no label for enum member "${slug}"`);
    }
  });

  it("carries no label for a value the enum does not hold", () => {
    // A stale label would keep rendering after the enum member is removed — the same
    // "looks live, is dead" shape the taxonomy guards exist for.
    for (const key of Object.keys(EXPERT_SPECIALIZATION_LABELS)) {
      assert.ok(
        (expertSpecializationEnum as readonly string[]).includes(key),
        `label map holds "${key}", which expertSpecializationEnum does not`,
      );
    }
  });

  it("renders an enum slug as its human label", () => {
    assert.equal(labelForExpertSpecialization("food_wine"), "Food & Wine");
    assert.equal(labelForExpertSpecialization("adventure_outdoor"), "Adventure & Outdoor");
  });

  it("renders an offering key through the caller's display-name lookup", () => {
    const names = { wedding_planner: "Wedding Planner" };
    assert.equal(labelForExpertSpecialization("wedding_planner", names), "Wedding Planner");
    assert.equal(
      labelForExpertSpecialization("wedding_planner", new Map([["wedding_planner", "Wedding Planner"]])),
      "Wedding Planner",
    );
  });

  it("prefers the enum label over an offering row of the same key", () => {
    // The two catalogs have separate key namespaces (§4). If they ever collide, the
    // wizard's own vocabulary — the thing that actually wrote the row — wins.
    assert.equal(labelForExpertSpecialization("food_wine", { food_wine: "Something Else" }), "Food & Wine");
  });

  it("renders an unknown string as-is, trimmed — never relabelled, never dropped", () => {
    assert.equal(labelForExpertSpecialization("Slow travel in the Alps"), "Slow travel in the Alps");
    assert.equal(labelForExpertSpecialization("  Kyoto tea ceremonies  "), "Kyoto tea ceremonies");
    assert.equal(labelForExpertSpecialization("unknown_key", { other: "Other" }), "unknown_key");
  });

  it("renders an empty or missing value as empty (nothing to say)", () => {
    assert.equal(labelForExpertSpecialization(""), "");
    assert.equal(labelForExpertSpecialization("   "), "");
    assert.equal(labelForExpertSpecialization(undefined as unknown as string), "");
  });

  it("ignores an offering lookup that maps to blank", () => {
    assert.equal(labelForExpertSpecialization("some_key", { some_key: "   " }), "some_key");
  });
});

describe("local specialty vocabulary", () => {
  it("has unique values and non-empty labels", () => {
    const seen = new Set<string>();
    for (const opt of LOCAL_SPECIALTY_OPTIONS) {
      assert.ok(!seen.has(opt.value), `duplicate local specialty value "${opt.value}"`);
      seen.add(opt.value);
      assert.ok(opt.label.trim().length > 0, `no label for "${opt.value}"`);
      assert.ok(opt.emoji.length > 0, `no emoji for "${opt.value}"`);
    }
  });

  it("renders a known slug as its label and emoji", () => {
    assert.equal(labelForLocalSpecialty("safety_navigation"), "Safety & Navigation");
    assert.equal(emojiForLocalSpecialty("safety_navigation"), "🧭");
  });

  it("renders an unknown slug as-is and offers no emoji for it (§13)", () => {
    assert.equal(labelForLocalSpecialty("moon_landings"), "moon_landings");
    assert.equal(emojiForLocalSpecialty("moon_landings"), null);
  });

  it("renders an empty value as empty", () => {
    assert.equal(labelForLocalSpecialty(""), "");
    assert.equal(emojiForLocalSpecialty(""), null);
  });
});
