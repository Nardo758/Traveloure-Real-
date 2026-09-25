/**
 * Saved places: the card's saved lookup and the shelf's city grouping (board #328, #330). Pure.
 *   G1 groups by city, case- and space-insensitively, keeping the first spelling.
 *   G2 orders groups by their most recent save; items keep the server's order.
 *   G3 places saved with no city go in one trailing null group — never under a guessed city.
 *   G4 nothing saved ⇒ no groups.
 *   F1 the saved lookup keys on (type, id), not on id alone.
 *   K1 ONE city key: case-, edge- and inner-space-insensitive; blank is null (#329).
 *   B1 the save body is bounded to the server allowlist; no id or no name ⇒ nothing to save (#330).
 *   P1 a plan's saved places match its destination and stops, each read up to its first comma.
 *   P2 no city on the plan or the place ⇒ no match, never a guess.
 *   N1 "a place with this name is on this plan" is a name match only.
 *   U1 a share link's path is the token, encoded.
 * Run: npx tsx --test client/src/lib/__tests__/saved-items.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSaveItem,
  findSavedItem,
  groupSavedByCity,
  planHasItemNamed,
  savedCityKey,
  savedPlacesForPlan,
  sharedSavedPlacesPath,
} from "../saved-items";
import { saveItemBodySchema } from "@shared/saved-items";

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

test("K1: one city key for shelf, slip and share", () => {
  assert.equal(savedCityKey("  Kyoto "), "kyoto");
  assert.equal(savedCityKey("New   York"), savedCityKey("new york"));
  assert.equal(savedCityKey("   "), null);
  assert.equal(savedCityKey(null), null);
});

test("B1: the save body fits the server allowlist, or there is nothing to save", () => {
  const body = buildSaveItem({ contentType: "hotel", contentId: 7, name: "  Ryokan  ", image: "https://x.test/a.jpg", city: " Kyoto " });
  assert.deepEqual(body, { contentType: "hotel", contentId: "7", contentName: "Ryokan", contentImage: "https://x.test/a.jpg", city: "Kyoto" });
  assert.equal(saveItemBodySchema.safeParse(body).success, true);
  assert.equal(buildSaveItem({ contentType: "gem", contentId: "1", name: "   " }), null);
  assert.equal(buildSaveItem({ contentType: "gem", contentId: null, name: "Temple" }), null);
  const unsafe = buildSaveItem({ contentType: "gem", contentId: "1", name: "Temple", image: "javascript:alert(1)", city: "" });
  assert.equal(unsafe?.contentImage, null);
  assert.equal(unsafe?.city, null);
  const long = buildSaveItem({ contentType: "activity", contentId: "x".repeat(400), name: "y".repeat(400) });
  assert.equal(saveItemBodySchema.safeParse(long).success, true);
});

test("P1: a plan's saved places match its destination and stops", () => {
  const rows = [
    { id: "a", city: "Kyoto" },
    { id: "b", city: "osaka" },
    { id: "c", city: "Tokyo" },
    { id: "d", city: null },
  ];
  assert.deepEqual(savedPlacesForPlan(rows, "Kyoto, Japan", []).map((r) => r.id), ["a"]);
  assert.deepEqual(
    savedPlacesForPlan(rows, "Kyoto", [{ name: "Kyoto" }, { name: "Osaka Castle", city: "Osaka" }]).map((r) => r.id),
    ["a", "b"],
  );
});

test("P2: no city means no match", () => {
  const rows = [{ id: "a", city: "Kyoto" }, { id: "d", city: null }];
  assert.deepEqual(savedPlacesForPlan(rows, null, null), []);
  assert.deepEqual(savedPlacesForPlan(rows, "  ", []), []);
  assert.deepEqual(savedPlacesForPlan([{ id: "d", city: null }], "Kyoto", []), []);
  assert.deepEqual(savedPlacesForPlan(undefined, "Kyoto", []), []);
});

test("N1: the on-plan hint is a name match only", () => {
  assert.equal(planHasItemNamed(["Fushimi Inari", "Lunch"], "  fushimi   inari "), true);
  assert.equal(planHasItemNamed(["Lunch"], "Fushimi Inari"), false);
  assert.equal(planHasItemNamed([], "Anything"), false);
});

test("U1: the share path carries the token", () => {
  assert.equal(sharedSavedPlacesPath("abc123"), "/saved/shared/abc123");
});
