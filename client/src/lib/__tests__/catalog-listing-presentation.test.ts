/**
 * CATALOG REBUILD — pure unit proof for client/src/lib/catalog-listing-presentation.ts.
 *
 * Negatives first: the risk in a status-bucket/search/chip derivation is always the same
 * shape — inventing a state the data doesn't support, or silently dropping a row/chip
 * that should be visible (§13). These are proven before the happy paths.
 *
 * Run: npx tsx --test client/src/lib/__tests__/catalog-listing-presentation.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogStatusBucket,
  catalogPillDisplay,
  matchesCatalogSearch,
  deriveAvailabilityChips,
} from "../catalog-listing-presentation";

// ── NEGATIVES ───────────────────────────────────────────────────────────────────────────

test("N1: approved-but-paused is NOT the Live bucket (mirrors the Preview honesty filter)", () => {
  assert.equal(catalogStatusBucket({ approvalStatus: "approved", status: "paused" }), "other");
});

test("N2: a rejected listing is never silently reclassified as Draft", () => {
  assert.equal(catalogStatusBucket({ approvalStatus: "rejected", status: "paused" }), "in_review");
  assert.equal(catalogPillDisplay({ approvalStatus: "rejected", status: "paused" }).label, "Rejected");
});

test("N3: an empty/whitespace search query matches everything (never an accidental empty result)", () => {
  assert.equal(matchesCatalogSearch("", "Anything", "Any category"), true);
  assert.equal(matchesCatalogSearch("   ", "Anything", null), true);
});

test("N4: deriveAvailabilityChips never invents a chip for a slot the caller didn't pass", () => {
  assert.deepEqual(deriveAvailabilityChips([]), []);
});

test("N5: a past slot is excluded — never shown as upcoming availability", () => {
  const chips = deriveAvailabilityChips(
    [{ date: "2020-01-01", startTime: "09:00", capacity: 4, bookedCount: 0, status: "available" }],
    { today: "2026-08-14" },
  );
  assert.deepEqual(chips, []);
});

// ── POSITIVES ───────────────────────────────────────────────────────────────────────────

test("P1: Live bucket = approved AND active (the single shared definition)", () => {
  assert.equal(catalogStatusBucket({ approvalStatus: "approved", status: "active" }), "live");
  assert.equal(catalogPillDisplay({ approvalStatus: "approved", status: "active" }).cls, "live");
});

test("P2: Draft and submitted bucket correctly", () => {
  assert.equal(catalogStatusBucket({ approvalStatus: "draft", status: "active" }), "draft");
  assert.equal(catalogStatusBucket({ approvalStatus: "submitted", status: "active" }), "in_review");
});

test("P3: search matches on name OR category, case-insensitively", () => {
  assert.equal(matchesCatalogSearch("gion", "Kimono Dressing & Gion Photo Walk", null), true);
  assert.equal(matchesCatalogSearch("ARTS", "Pottery class", "Arts & Crafts Instruction"), true);
  assert.equal(matchesCatalogSearch("xyz", "Pottery class", "Arts & Crafts Instruction"), false);
});

test("P4: a blocked slot renders the mock's exact 'Tue — blocked' shape", () => {
  const chips = deriveAvailabilityChips(
    [{ date: "2026-08-18", startTime: null, capacity: 4, bookedCount: 0, status: "blocked" }],
    { today: "2026-08-14" },
  );
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, "Tue — blocked");
  assert.equal(chips[0].blocked, true);
});

test("P5: an available slot with remaining capacity renders 'Weekday HH:MM · N left', soonest first, capped", () => {
  const chips = deriveAvailabilityChips(
    [
      { date: "2026-08-19", startTime: "14:00", capacity: 6, bookedCount: 2, status: "available" },
      { date: "2026-08-17", startTime: "09:00", capacity: 6, bookedCount: 4, status: "available" },
      { date: "2026-08-20", startTime: "09:00", capacity: 2, bookedCount: 2, status: "available" },
    ],
    { today: "2026-08-14", limit: 2 },
  );
  assert.equal(chips.length, 2);
  assert.equal(chips[0].label, "Mon 09:00 · 2 left"); // 2026-08-17 is a Monday
  assert.equal(chips[1].label, "Wed 14:00 · 4 left"); // 2026-08-19 is a Wednesday
});

test("P6: a fully-booked (not blocked) slot is honestly 'full', not silently omitted or shown as available", () => {
  const chips = deriveAvailabilityChips(
    [{ date: "2026-08-20", startTime: "09:00", capacity: 2, bookedCount: 2, status: "available" }],
    { today: "2026-08-14" },
  );
  assert.equal(chips[0].full, true);
  assert.ok(chips[0].label.includes("full"));
});
