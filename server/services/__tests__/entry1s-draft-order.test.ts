/**
 * ENTRY-1s (ledger `2026-11-03-entry1s-presets-and-draft-order`) — preset labels and the Quick draft's insert order.
 *
 *   T3 every Reservation preset label passes siteNeverSayHits(). It fails today on "Secret Photographer" until the copy
 *      PR renames it, so the assertion runs as `todo` while any label has a hit and becomes a real assertion — with no
 *      edit here — the moment none does. A banned label already never reaches the plancard (`presetAnchorLabel`
 *      returns null for it) and a banned description is never written (`generatePresetsForTrip`).
 *   T4 one day, times [09:00, 14:00, 11:00] → inserted 09:00, 11:00, 14:00; untimed items after, in model order.
 *   T5 two days interleaved in the model's output → day 1 before day 2 regardless of array order.
 *
 * Pure: no database. Run: npx tsx --test server/services/__tests__/entry1s-draft-order.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { siteNeverSayHits } from "@shared/banned-copy";
import { orderDraftItems } from "../../utils/itinerary-time";
import { allPresetAnchors, PRESET_ANCHOR_TYPES, presetAnchorLabel } from "../logistics-presets.service";

const labelHits = allPresetAnchors()
  .map((p) => ({ where: `${p.template}/${p.anchor.anchorType}`, label: p.anchor.label, hits: siteNeverSayHits(p.anchor.label) }))
  .filter((x) => x.hits.length > 0);

describe("ENTRY-1s — preset labels and draft order", () => {
  // COPY-1 renamed "Secret Photographer" to "Photographer": the check is live.
  it("T3 every preset label passes the never-say list", () => {
    assert.deepEqual(labelHits, []);
  });

  it("T3 a banned label never reaches a stop name; every preset description is clean", () => {
    for (const p of allPresetAnchors()) {
      assert.deepEqual(siteNeverSayHits(p.anchor.description), [], `${p.template}/${p.anchor.anchorType} description`);
      const name = presetAnchorLabel(p.anchor.anchorType, p.anchor.description);
      if (name !== null) assert.deepEqual(siteNeverSayHits(name), [], name);
    }
    // COPY-1: the preset label is now "Photographer" (no banned word), so its own stop name is used.
    assert.equal(presetAnchorLabel("photographer_arrival", "Hidden photographer positioning"), "Photographer");
    assert.equal(presetAnchorLabel("photographer_arrival", "Photographer arrives for pre-ceremony shots"), "Photographer Arrival");
    assert.equal(presetAnchorLabel("photographer_arrival", "edited by the traveler"), null);
    assert.ok(PRESET_ANCHOR_TYPES.has("photographer_arrival") && PRESET_ANCHOR_TYPES.has("ceremony_time") && PRESET_ANCHOR_TYPES.has("dinner_reservation"));
  });

  it("T4 one day's times in clock order; untimed items after, in model order", () => {
    const items = [
      { title: "A", dayNumber: 1, time: "09:00" },
      { title: "U1", dayNumber: 1, time: "" },
      { title: "B", dayNumber: 1, time: "14:00" },
      { title: "U2", dayNumber: 1, time: "sometime" },
      { title: "C", dayNumber: 1, time: "11:00" },
    ];
    const ordered = orderDraftItems(items);
    assert.deepEqual(ordered.map((i) => i.title), ["A", "C", "B", "U1", "U2"]);
    assert.deepEqual(ordered.map((_, sortOrder) => sortOrder), [0, 1, 2, 3, 4]);
    assert.deepEqual(items.map((i) => i.title), ["A", "U1", "B", "U2", "C"], "the input is not touched");
    // The 12-hour form the stored convention uses sorts the same way.
    assert.deepEqual(orderDraftItems([{ t: 1, dayNumber: 1, time: "2:00 PM" }, { t: 2, dayNumber: 1, time: "9:30 AM" }]).map((i) => i.t), [2, 1]);
  });

  it("T5 day 1 before day 2 regardless of array order", () => {
    const items = [
      { title: "d2-am", dayNumber: 2, time: "08:00" },
      { title: "d1-pm", dayNumber: 1, time: "18:00" },
      { title: "d2-pm", dayNumber: 2, time: "17:00" },
      { title: "d1-am", dayNumber: 1, time: "10:00" },
    ];
    assert.deepEqual(orderDraftItems(items).map((i) => i.title), ["d1-am", "d1-pm", "d2-am", "d2-pm"]);
  });
});
