/**
 * The free draft's basis — pure rules (ledger `2026-09-29-a5-draft-open-set`; §M5, R126).
 *   B1  held slots: one per open set with a category, day-scoped when the set has a day
 *   B2  a held slot drops drafted items of its category — on its day, or every day when it has none
 *   B3  a lodging-anchored Trip with no stay and no set ASKS; "draft without a hotel" is none_asked
 *   B4  with an open lodging set and nothing ranked, the draft is built around EVERY located option
 *   B5  with a ranked best option, it is built around that one and says so
 *   B6  a plan that is not lodging-anchored, or already has a stay, is not decided here
 *   B7  the prompt names the hotels as a hint, never a choice; the held slot is a constraint
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideDraftBasis,
  draftBasisKey,
  draftBasisLine,
  draftBasisPromptBlock,
  heldSlotsFor,
  withoutHeldItems,
  type DraftOpenSet,
} from "../draft-basis";

const opt = (title: string, lat: number | null, fitRank: number | null = null) => ({
  title,
  neighborhood: lat === null ? null : "Gion",
  latitude: lat,
  longitude: lat === null ? null : 135.77,
  fitRank,
});
const lodging = (options = [opt("Gion Hotel", 35.0), opt("Station Hotel", 34.98), opt("Nowhere Inn", null)]): DraftOpenSet => ({
  id: "set-1",
  categoryKey: "accommodation",
  dayNumber: null,
  anchorRole: "primary",
  options,
});

test("B1: held slots", () => {
  const held = heldSlotsFor([lodging(), { ...lodging(), id: "dup" }, { id: "d", categoryKey: "dining", dayNumber: 2, anchorRole: null, options: [] }, { id: "x", categoryKey: null, dayNumber: 1, anchorRole: null, options: [] }]);
  assert.deepEqual(held, [
    { categoryKey: "accommodation", dayNumber: null },
    { categoryKey: "dining", dayNumber: 2 },
  ]);
});

test("B2: held items are dropped", () => {
  const items = [
    { type: "hotel", dayNumber: 1 },
    { type: "attraction", dayNumber: 1 },
    { type: "dinner", dayNumber: 1 },
    { type: "dinner", dayNumber: 2 },
  ];
  const { kept, dropped } = withoutHeldItems(items, [
    { categoryKey: "accommodation", dayNumber: null },
    { categoryKey: "dining", dayNumber: 2 },
  ]);
  assert.deepEqual(kept, [{ type: "attraction", dayNumber: 1 }, { type: "dinner", dayNumber: 1 }]);
  assert.equal(dropped.length, 2);
});

test("B3: no stay and no set ⇒ ask; the traveler's own answer ⇒ none_asked", () => {
  assert.deepEqual(decideDraftBasis({ lodgingAnchored: true, hasStay: false, openSets: [], withoutAnchor: false }), { ask: true });
  const d = decideDraftBasis({ lodgingAnchored: true, hasStay: false, openSets: [], withoutAnchor: true });
  assert.deepEqual(d, { ask: false, basis: { kind: "none_asked" } });
  assert.equal(draftBasisKey((d as any).basis), "none_asked");
});

test("B4: nothing ranked ⇒ built around every located option, none singled out", () => {
  const d = decideDraftBasis({ lodgingAnchored: true, hasStay: false, openSets: [lodging()], withoutAnchor: false });
  assert.equal(d.ask, false);
  const basis = (d as any).basis;
  assert.equal(basis.kind, "open_anchor_set");
  assert.equal(basis.ranked, false);
  assert.deepEqual(basis.builtAround.map((o: any) => o.title), ["Gion Hotel", "Station Hotel"], "the unlocated one is not a geography");
  assert.equal(draftBasisLine(basis), "Built around the 2 places you're considering. Where you'll stay is still yours to choose.");
});

test("B5: a ranked best option is the one it is built around, and the line says why", () => {
  const d = decideDraftBasis({
    lodgingAnchored: true,
    hasStay: false,
    openSets: [lodging([opt("Gion Hotel", 35.0, 2), opt("Station Hotel", 34.98, 1)])],
    withoutAnchor: false,
  });
  const basis = (d as any).basis;
  assert.deepEqual(basis.builtAround.map((o: any) => o.title), ["Station Hotel"]);
  assert.match(draftBasisLine(basis)!, /^Built around Station Hotel, the place that makes your days easiest/);
});

test("B6: not lodging-anchored, or a stay already chosen ⇒ not decided here", () => {
  for (const input of [
    { lodgingAnchored: false, hasStay: false, openSets: [], withoutAnchor: false },
    { lodgingAnchored: true, hasStay: true, openSets: [], withoutAnchor: false },
  ]) {
    const d = decideDraftBasis(input);
    assert.deepEqual(d, { ask: false, basis: { kind: "not_anchored" } });
    assert.equal(draftBasisKey((d as any).basis), null);
    assert.equal(draftBasisLine((d as any).basis), null);
  }
});

test("B7: the prompt block", () => {
  const d = decideDraftBasis({ lodgingAnchored: true, hasStay: false, openSets: [lodging()], withoutAnchor: false }) as any;
  const block = draftBasisPromptBlock(d.basis, heldSlotsFor([lodging()]));
  assert.match(block, /Do not recommend or choose between these places/);
  assert.match(block, /Gion Hotel \(Gion\)/);
  assert.match(block, /Do not add any accommodation item on any day/);
  assert.equal(draftBasisPromptBlock({ kind: "not_anchored" }, []), "");
});
