/**
 * R-T1-a — taxonomy crosswalk DRIFT test (pure, no DB).
 * Run: tsx --test server/services/__tests__/trailhead-crosswalk.test.ts
 *
 * Asserts the ONE `category_key → content_type` crosswalk stays coherent with BOTH taxonomies:
 *   - every mapped content_type is a real `dmoContentTypeEnum` member (value-side drift);
 *   - every category_key the template-matrix references is mapped (key-side drift);
 *   - `accommodation` maps to the affiliate rung, never a DMO content type (R-T1-a explicit).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dmoContentTypeEnum } from "@shared/schema";
import {
  CATEGORY_TO_CONTENT_TYPE,
  AFFILIATE_RUNG,
  SERVICE_ONLY,
  crosswalk,
  isDmoContentType,
  TEMPLATE_CATEGORY_MATRIX,
} from "../content-gap-taxonomy";

const CONTENT_TYPES = new Set<string>(dmoContentTypeEnum);
const NON_DMO_RUNGS = new Set<string>([AFFILIATE_RUNG, SERVICE_ONLY]);

test("R-T1-a: every mapped content_type is a real dmoContentTypeEnum member (or a named non-DMO rung)", () => {
  for (const [categoryKey, target] of Object.entries(CATEGORY_TO_CONTENT_TYPE)) {
    if (NON_DMO_RUNGS.has(target)) continue;
    assert.ok(
      CONTENT_TYPES.has(target),
      `crosswalk[${categoryKey}] = "${target}" is not a dmoContentTypeEnum member`,
    );
  }
});

test("R-T1-a: every category_key the template-matrix references is mapped in the crosswalk", () => {
  for (const row of TEMPLATE_CATEGORY_MATRIX) {
    assert.ok(
      crosswalk(row.categoryKey) !== undefined,
      `template-matrix category_key "${row.categoryKey}" (template ${row.templateKey}) has no crosswalk entry`,
    );
  }
});

test("R-T1-a: accommodation is the affiliate rung — NEVER a DMO content type (stays excluded from scraping)", () => {
  assert.equal(crosswalk("accommodation"), AFFILIATE_RUNG);
  assert.equal(isDmoContentType(AFFILIATE_RUNG), false);
});

test("R-T1-a: isDmoContentType is true only for real content types, false for both rungs", () => {
  assert.equal(isDmoContentType("venue"), true);
  assert.equal(isDmoContentType("restaurant"), true);
  assert.equal(isDmoContentType(AFFILIATE_RUNG), false);
  assert.equal(isDmoContentType(SERVICE_ONLY), false);
});

test("R-T1-a: crosswalk returns undefined for a key outside the vocabulary (no silent guess)", () => {
  assert.equal(crosswalk("not_a_real_category"), undefined);
});
