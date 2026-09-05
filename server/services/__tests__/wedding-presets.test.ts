/**
 * WEDDING PRESETS — the seven chips the ratified board draws.
 * Ledger `2026-09-04-reaudit-fixes` (re-audit A6); `docs/design/wedding-flow/Step5Events.dc.html`.
 *
 * WHY THIS EXISTS — the same reason `golf-presets.test.ts` does, one occasion over. The plan
 * modal's step 5 renders the SERVER's presets for the chosen occasion and never a client list, so
 * this table is the ONLY thing standing between a ratified board and what a traveler can tick: a
 * chip the board draws and this table omits is not a missing pixel, it is a part of the weekend a
 * couple cannot describe. `Step5Events` draws seven wedding chips; five landed with the original
 * preset table, and **Welcome drinks** and **Farewell brunch** — the two ends of the weekend, both
 * also named in the ratified landing-Moment copy (`Main.dc.html`) and used as an event heading on
 * `Slip.dc.html` — did not.
 *
 * What these hold:
 *   W1  all seven board chips exist, by LABEL, because the label is what step 5 renders and what
 *       becomes the event's title.
 *   W2  the two added anchors carry their OWN `anchorType`s. `generatePresetsForTrip` de-duplicates
 *       by type, so folding either into `ceremony_time` or `reception_start` would make one anchor
 *       silently overwrite another — and the anchor type is also what the optimizer and the
 *       schedule validator branch on.
 *   W3  anchor types are UNIQUE within the occasion.
 *   W4  §13 — only what the day is genuinely arranged around is IMMOVABLE. The ceremony and the
 *       reception are; a drinks gathering the night before and a send-off brunch the morning after
 *       are arranged around THEM, and marking them immovable would tell the schedule validator a
 *       constraint nobody stated.
 *   W5  the two additions sit on the days their names claim — welcome drinks BEFORE the wedding
 *       day, farewell brunch AFTER it. A dayOffset of 0 for either would file them on the wedding
 *       day itself, which is the one thing both are defined as not being.
 *   W6  the chip labels step 5 would render are all non-empty and distinct — the modal dedupes by
 *       label, so two chips with one label would silently become one.
 *
 * Pure unit: reads the committed preset table, no DB and no network.
 * Run: npx tsx --test server/services/__tests__/wedding-presets.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPresetsForTemplate } from "../logistics-presets.service";

const WEDDING = getPresetsForTemplate("wedding");

/** The ratified board's seven chips, in its own words. */
const BOARD_CHIPS = [
  "Welcome drinks",
  "Rehearsal Dinner",
  "Hair & Makeup",
  "Ceremony",
  "Reception",
  "Farewell brunch",
  "Photographer Arrival",
] as const;

describe("W1 — every chip the ratified board draws exists as a preset", () => {
  it("the wedding occasion has presets at all", () => {
    assert.ok(WEDDING, "wedding must resolve to a preset table");
  });

  for (const label of BOARD_CHIPS) {
    it(`"${label}" is offered`, () => {
      const found = (WEDDING?.anchors ?? []).some((a) => a.label === label);
      assert.equal(
        found,
        true,
        `the board draws "${label}" and step 5 can only render what this table names`,
      );
    });
  }
});

describe("W2 — the two additions carry their own anchor types", () => {
  it("welcome drinks", () => {
    const a = (WEDDING?.anchors ?? []).find((x) => x.label === "Welcome drinks");
    assert.ok(a);
    assert.equal(a?.anchorType, "welcome_drinks");
  });

  it("farewell brunch", () => {
    const a = (WEDDING?.anchors ?? []).find((x) => x.label === "Farewell brunch");
    assert.ok(a);
    assert.equal(a?.anchorType, "farewell_brunch");
  });

  it("neither borrows the ceremony's or the reception's type", () => {
    for (const label of ["Welcome drinks", "Farewell brunch"]) {
      const a = (WEDDING?.anchors ?? []).find((x) => x.label === label);
      assert.notEqual(a?.anchorType, "ceremony_time");
      assert.notEqual(a?.anchorType, "reception_start");
    }
  });
});

describe("W3 — anchor types are unique within the occasion", () => {
  it("no two wedding anchors share a type", () => {
    const types = (WEDDING?.anchors ?? []).map((a) => a.anchorType);
    assert.equal(
      new Set(types).size,
      types.length,
      "generatePresetsForTrip de-duplicates by type — a shared type silently drops an anchor",
    );
  });
});

describe("W4 — §13: only what the day is arranged around is immovable", () => {
  it("the ceremony and the reception are", () => {
    for (const label of ["Ceremony", "Reception"]) {
      const a = (WEDDING?.anchors ?? []).find((x) => x.label === label);
      assert.equal(a?.isImmovable, true);
    }
  });

  it("the drinks and the brunch are NOT — they are arranged around those two", () => {
    for (const label of ["Welcome drinks", "Farewell brunch"]) {
      const a = (WEDDING?.anchors ?? []).find((x) => x.label === label);
      assert.equal(
        a?.isImmovable,
        false,
        `"${label}" is not a fixed point the weekend is built around; saying it is would hand the ` +
          "schedule validator a constraint nobody stated",
      );
    }
  });
});

describe("W5 — the two additions sit on the days their names claim", () => {
  it("welcome drinks fall BEFORE the wedding day", () => {
    const a = (WEDDING?.anchors ?? []).find((x) => x.label === "Welcome drinks");
    assert.ok(typeof a?.dayOffset === "number" && a.dayOffset < 0);
  });

  it("the farewell brunch falls AFTER it", () => {
    const a = (WEDDING?.anchors ?? []).find((x) => x.label === "Farewell brunch");
    assert.ok(typeof a?.dayOffset === "number" && a.dayOffset > 0);
  });
});

describe("W6 — the labels step 5 renders are all real and all distinct", () => {
  it("no empty label, and no two anchors share one", () => {
    const labels = (WEDDING?.anchors ?? []).map((a) => (a.label || "").trim());
    assert.equal(labels.some((l) => l === ""), false, "an empty label renders as an unnameable chip");
    assert.equal(
      new Set(labels).size,
      labels.length,
      "step 5 dedupes chips by label — two anchors with one label become one chip",
    );
  });
});
