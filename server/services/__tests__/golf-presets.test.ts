/**
 * GOLF PRESETS — the sixth chip the ratified board draws.
 * Ledger `2026-09-04-step4-variants-fields`; `docs/design/wedding-flow/TravelEvents.dc.html`.
 *
 * WHY THIS EXISTS. The plan modal's step 5 renders the SERVER's presets for the chosen occasion —
 * "a chip can never name something the platform does not otherwise know about". That makes this
 * table the ONLY thing standing between the ratified board and what a traveler can tick: a chip the
 * board draws and this table omits is not a missing pixel, it is a plan a traveler cannot describe.
 * `TravelEvents` draws six golf chips; five landed with the tee-time lane and "Driver between
 * links" — the transfer a multi-course trip actually turns on — did not.
 *
 * What these hold:
 *   G1  all six board chips exist, by LABEL, because the label is what step 5 renders and what
 *       becomes the event's title.
 *   G2  the sixth carries its OWN `anchorType`. Folding a transfer into `tee_time_round_*` or
 *       `whisky_bar` would make an anchor's type lie about what it is, and the anchor type is what
 *       the optimizer and the schedule validator branch on.
 *   G3  anchor types are UNIQUE within the occasion — two anchors sharing a type is how a preset
 *       silently overwrites its sibling.
 *   G4  §13 — the transfer is MOVABLE. `isImmovable` means "the day is arranged around this", and
 *       only a booked tee time earns that; a car between courses is arranged around the rounds.
 *   G5  the chip labels step 5 would render are all non-empty and distinct — the modal dedupes by
 *       label, so two chips with one label would silently become one.
 *
 * Pure unit: reads the committed preset table, no DB and no network.
 * Run: npx tsx --test server/services/__tests__/golf-presets.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPresetsForTemplate } from "../logistics-presets.service";

const GOLF = getPresetsForTemplate("golf-trip");

/** The ratified board's six chips, in its own words. */
const BOARD_CHIPS = [
  "Round 1",
  "Round 2",
  "Round 3",
  "Round 4",
  "Whisky bar",
  "Driver between links",
] as const;

describe("G1 — every chip the ratified board draws exists as a preset", () => {
  it("the golf occasion has presets at all", () => {
    assert.ok(GOLF, "golf-trip must resolve to a preset table");
  });

  for (const label of BOARD_CHIPS) {
    it(`"${label}" is offered`, () => {
      const found = (GOLF?.anchors ?? []).some((a) => a.label === label);
      assert.equal(found, true, `the board draws "${label}" and step 5 can only render what this table names`);
    });
  }
});

describe("G2 — the transfer carries its own anchor type", () => {
  const driver = (GOLF?.anchors ?? []).find((a) => a.label === "Driver between links");

  it("exists", () => {
    assert.ok(driver);
  });

  it("has its OWN anchorType, not a round's and not the whisky bar's", () => {
    assert.equal(driver?.anchorType, "driver_between_links");
  });

  it("is not one of the tee-time types", () => {
    assert.equal(String(driver?.anchorType).startsWith("tee_time"), false);
  });
});

describe("G3 — anchor types are unique within the occasion", () => {
  it("no two golf anchors share a type", () => {
    const types = (GOLF?.anchors ?? []).map((a) => a.anchorType);
    assert.equal(new Set(types).size, types.length);
  });
});

describe("G4 — §13: only a booked tee time is immovable", () => {
  it("the transfer is movable — it is arranged around the rounds, not the other way round", () => {
    const driver = (GOLF?.anchors ?? []).find((a) => a.label === "Driver between links");
    assert.equal(driver?.isImmovable, false);
  });

  it("the four rounds stay immovable", () => {
    for (const a of GOLF?.anchors ?? []) {
      if (String(a.anchorType).startsWith("tee_time")) assert.equal(a.isImmovable, true);
    }
  });
});

describe("G5 — the labels step 5 renders are usable as chips", () => {
  it("every label is non-empty and distinct", () => {
    const labels = (GOLF?.anchors ?? []).map((a) => (a.label || "").trim());
    assert.equal(labels.every((l) => l.length > 0), true);
    // The modal builds its chip list with `Array.from(new Set(labels))`, so a duplicate label would
    // silently collapse two presets into one chip and one of them would be unreachable.
    assert.equal(new Set(labels).size, labels.length);
  });
});
