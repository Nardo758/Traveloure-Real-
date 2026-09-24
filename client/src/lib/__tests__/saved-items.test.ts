/**
 * Saved places: the card's saved lookup and the shelf's city grouping (board #328, #330). Pure.
 *   G1 groups by city, case- and space-insensitively, keeping the first spelling.
 *   G2 orders groups by their most recent save; items keep the server's order.
 *   G3 places saved with no city go in one trailing null group — never under a guessed city.
 *   G4 nothing saved ⇒ no groups.
 *   F1 the saved lookup keys on (type, id), not on id alone.
 * Run: npx tsx --test client/src/lib/__tests__/saved-items.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSavedItem, groupSavedByCity } from "../saved-items";

const row = (id: string, city: string | null, createdAt: string) => ({ id, city, createdAt });

test("G1: groups by city regardless of case and spacing", () => {
  const groups = groupSavedByCity([row("a", "Kyoto", "2026-09-01"), row("b", " kyoto ", "2026-09-02")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].city, "Kyoto");
  assert.deepEqual(groups[0].items.map((i) => i.id), ["a", "b"]);
});

test("G2: the most recently saved-to city comes first", () => {
  const groups = groupSavedByCity([
    row("a", "Kyoto", "2026-09-01"),
    row("b", "Osaka", "2026-09-03"),
    row("c", "Kyoto", "2026-09-02"),
  ]);
  assert.deepEqual(groups.map((g) => g.city), ["Osaka", "Kyoto"]);
  assert.deepEqual(groups[1].items.map((i) => i.id), ["a", "c"]);
});

test("G3: no-city places are one trailing group and never guessed into a city", () => {
  const groups = groupSavedByCity([row("a", null, "2026-09-05"), row("b", "Kyoto", "2026-09-01"), row("c", "  ", "2026-09-06")]);
  assert.deepEqual(groups.map((g) => g.city), ["Kyoto", null]);
  assert.deepEqual(groups[1].items.map((i) => i.id), ["a", "c"]);
});

test("G4: nothing saved means no groups", () => {
  assert.deepEqual(groupSavedByCity([]), []);
  assert.deepEqual(groupSavedByCity(undefined), []);
});

test("F1: saved lookup keys on type and id together", () => {
  const rows = [{ id: "s1", contentType: "gem", contentId: "42" }];
  assert.equal(findSavedItem(rows, "gem", "42")?.id, "s1");
  assert.equal(findSavedItem(rows, "service", "42"), undefined);
  assert.equal(findSavedItem(undefined, "gem", "42"), undefined);
});
