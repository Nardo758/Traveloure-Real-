/**
 * Experience theme helpers. No database.
 * Run: npx tsx --test shared/__tests__/experience-themes.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { READY_MADE_PLAN_TYPES } from "../ready-made-plan-types";
import {
  PROPOSED_EXPERIENCE_THEME_SEEDS,
  parseDiscoverThemeParam,
  suggestThemeSlug,
  themeSlugFromLabel,
} from "../experience-themes";

const seeds = [...PROPOSED_EXPERIENCE_THEME_SEEDS];

describe("proposed seeds", () => {
  it("copies ready-made labels except the custom escape", () => {
    const expected = READY_MADE_PLAN_TYPES.filter((row) => row.key !== "custom").map((row) => row.label);
    assert.deepEqual(seeds.map((row) => row.label), expected);
    assert.equal(seeds.some((row) => row.slug === "custom"), false);
    assert.equal(seeds.some((row) => row.label.includes("Create your own")), false);
  });

  it("is the label set the migration inserts", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "server/migrations/409_experience_themes.sql"),
      "utf8",
    );
    const inserted = sql.slice(sql.indexOf("INSERT INTO"));
    for (const row of seeds) {
      assert.match(inserted, new RegExp(row.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(inserted, new RegExp(`'${row.slug}'`));
    }
    assert.equal(inserted.includes("Create your own"), false);
    assert.equal(inserted.includes("'custom'"), false);
  });
});

describe("suggestThemeSlug", () => {
  it("suggests the one theme whose label word is in the name", () => {
    assert.equal(suggestThemeSlug("Morning hiking with friends", seeds), "hiking_itinerary");
  });

  it("suggests nothing when no word matches", () => {
    assert.equal(suggestThemeSlug("hello there", seeds), null);
  });

  it("suggests nothing when two themes match", () => {
    assert.equal(suggestThemeSlug("hiking wedding weekend", seeds), null);
  });

  it("skips generic words", () => {
    assert.equal(suggestThemeSlug("The plan tour", seeds), null);
    assert.equal(themeSlugFromLabel("!!!"), "");
  });
});

describe("parseDiscoverThemeParam", () => {
  it("treats an empty value as no filter", () => {
    assert.deepEqual(parseDiscoverThemeParam(undefined), { ok: true, slugs: [] });
    assert.deepEqual(parseDiscoverThemeParam(""), { ok: true, slugs: [] });
    assert.deepEqual(parseDiscoverThemeParam(["", ""]), { ok: true, slugs: [] });
  });

  it("reads a comma list and repeated keys, without duplicates", () => {
    assert.deepEqual(parseDiscoverThemeParam("hiking_itinerary,wedding_plan"), {
      ok: true,
      slugs: ["hiking_itinerary", "wedding_plan"],
    });
    assert.deepEqual(parseDiscoverThemeParam(["hiking_itinerary", "hiking_itinerary,wedding_plan"]), {
      ok: true,
      slugs: ["hiking_itinerary", "wedding_plan"],
    });
  });

  it("refuses a token that is not a slug", () => {
    const parsed = parseDiscoverThemeParam("Hiking Itinerary");
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.message, "Unknown theme.");
  });
});
