/**
 * PF-1 — the PURE layer of `place_lookup_outcomes` (ledger `2026-10-11-pf1-lookup-outcomes`; rulings 1–4).
 *
 *   L1  the value sets are the ruled ones, and the old merged `unnamed` / `cap` / `none` are gone (ruling 4)
 *   L2  a failed lookup stores a short CODE, never the error message (which may carry query text)
 *   L3  the plan view keeps the LATEST row per item, by run start then insert time
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLACE_LOOKUP_CAP_REASONS,
  PLACE_LOOKUP_OUTCOMES,
  PLACE_LOOKUP_SKIP_REASONS,
  latestOutcomePerItem,
  lookupErrorCode,
} from "../place-lookup-outcomes";

test("L1: the outcome and reason sets are the ruled ones; the merged old words are gone", () => {
  assert.deepEqual([...PLACE_LOOKUP_OUTCOMES], ["attached", "unmatched", "capped", "skipped", "no_place", "error"]);
  assert.deepEqual([...PLACE_LOOKUP_SKIP_REASONS], ["no_named_tokens", "area_title", "no_adapter", "official_fact"]);
  assert.deepEqual([...PLACE_LOOKUP_CAP_REASONS], ["draft_cap", "maps_id_lookup", "maps_details", "plan_day_cap"]);
  const all = new Set<string>([...PLACE_LOOKUP_OUTCOMES, ...PLACE_LOOKUP_SKIP_REASONS, ...PLACE_LOOKUP_CAP_REASONS]);
  for (const old of ["unnamed", "cap", "none"]) assert.equal(all.has(old), false, old);
});

test("L2: an error is stored as its code or name, never its message", () => {
  const withCode = Object.assign(new Error("fetch failed for Okutan, Kyoto"), { code: "ECONNRESET" });
  assert.equal(lookupErrorCode(withCode), "ECONNRESET");
  assert.equal(lookupErrorCode(new TypeError("cannot read Philosopher's Path")), "TypeError");
  assert.equal(lookupErrorCode("a bare string"), "error");
  assert.equal(lookupErrorCode(null), "error");
  assert.equal(lookupErrorCode({ code: "bad code with spaces/and slashes" }), "bad_code_with_spaces_and_slashes");
  assert.equal(lookupErrorCode({ code: "x".repeat(200) }).length, 64);
});

test("L3: the plan view keeps each item's latest row", () => {
  const rows = [
    { itemId: "a", runStartedAt: "2026-10-06T10:00:00Z", createdAt: "2026-10-06T10:00:05Z", outcome: "skipped" },
    { itemId: "a", runStartedAt: "2026-10-08T10:00:00Z", createdAt: "2026-10-08T10:00:05Z", outcome: "attached" },
    { itemId: "b", runStartedAt: "2026-10-08T10:00:00Z", createdAt: "2026-10-08T10:00:01Z", outcome: "unmatched" },
    { itemId: "b", runStartedAt: "2026-10-08T10:00:00Z", createdAt: "2026-10-08T10:00:02Z", outcome: "no_place" },
  ];
  const out = new Map(latestOutcomePerItem(rows).map((r) => [r.itemId, r.outcome]));
  assert.equal(out.get("a"), "attached", "the later run wins");
  assert.equal(out.get("b"), "no_place", "within one run, the later insert wins");
  assert.equal(out.size, 2);
});
