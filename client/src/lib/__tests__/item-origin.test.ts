/**
 * item-origin — the ONE mapping from `itinerary_items.origin` to the slip's origin chip.
 *
 * Ledger `2026-09-06-item-origin-chip`; CLAUDE.md Locked Decision 12 (migration 181) and Locked
 * Decision 42's addendum. The ratified `slip-canvas` `ItemRow` artboard, callout ②.
 *
 * WHY THIS EXISTS. Every rule here fails SILENTLY and plausibly:
 *
 *  · The column is nullable and carries NO DB CHECK (the publish-trap posture), so `null` is a
 *    real, common value — every item that predates migration 181 holds it. A mapping that fell
 *    back to "you added" would put a confident authorship claim on rows whose author nothing
 *    recorded, and the chip would look correct on every screen (§13).
 *  · Because there is no CHECK, the database can hold a value outside the three. An unrecognised
 *    origin must resolve to NO CHIP, not to an "unknown" pill and not to a crash.
 *  · The three labels are the artboard's exact words. A surface that spelled its own — "added by
 *    you", "AI suggestion" — would be a second authority for the same fact (§18 rule 1), and the
 *    slip and the Trip Card would name one provenance two ways.
 *
 * NEGATIVE SPACE: this suite is PURE. It does not render the chip, does not touch the DOM, the DB
 * or the network, and cannot see whether any surface actually mounts `OriginBadge` — the static
 * pins in `server/__tests__/plancard-origin-exposure.test.ts` answer that half.
 *
 * Run: npx tsx --test client/src/lib/__tests__/item-origin.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { itemOriginChip } from "../item-origin";

describe("itemOriginChip — the three ratified values", () => {
  it("O1 — `traveler` is 'you added'", () => {
    assert.deepEqual(itemOriginChip("traveler"), { label: "you added", tone: "neutral" });
  });

  it("O2 — `ai` is 'AI draft'", () => {
    assert.deepEqual(itemOriginChip("ai"), { label: "AI draft", tone: "neutral" });
  });

  it("O3 — `expert` is 'from your expert', and it is the one tinted tone", () => {
    assert.deepEqual(itemOriginChip("expert"), { label: "from your expert", tone: "expert" });
  });

  it("O4 — the mapping covers EXACTLY three origins and no more", () => {
    // Derived from the mapping itself rather than restated: the assertion is that the set of
    // origins that produce a chip is closed at the artboard's three. A fourth value added without
    // a ruling fails here.
    const candidates = [
      "traveler",
      "ai",
      "expert",
      "user",
      "platform",
      "system",
      "admin",
      "affiliate",
      "dmo",
      "sourced-derived",
    ];
    const chipped = candidates.filter((o) => itemOriginChip(o) !== null);
    assert.deepEqual(chipped.sort(), ["ai", "expert", "traveler"]);
  });

  it("O5 — every chip's label is one of the three ratified strings, and they are distinct", () => {
    const labels = ["traveler", "ai", "expert"].map((o) => itemOriginChip(o)!.label);
    assert.equal(new Set(labels).size, 3);
    for (const l of labels) {
      assert.ok(["you added", "AI draft", "from your expert"].includes(l), `unratified label: ${l}`);
    }
  });
});

describe("itemOriginChip — §13: an absent or unrecognised origin draws NOTHING", () => {
  it("O6 — NULL is not recorded, and is never 'you added'", () => {
    // The pre-181 rows are NULL and stay NULL. Defaulting to the traveler would fabricate an
    // author on every legacy item.
    assert.equal(itemOriginChip(null), null);
  });

  it("O7 — an ABSENT key (undefined) is the same answer as NULL", () => {
    // The DTO carries the field present-only-when-set, so a consumer meets `undefined` far more
    // often than `null`. Both are "not recorded" and must not diverge.
    assert.equal(itemOriginChip(undefined), null);
  });

  it("O8 — an empty string is absent, not a chip with no words", () => {
    assert.equal(itemOriginChip(""), null);
  });

  it("O9 — a value the column can legally hold but the ruling does not name draws no chip", () => {
    // No DB CHECK stands behind this column, so this is reachable, not hypothetical.
    for (const junk of ["Traveler", "AI", "EXPERT", "user", "concierge", "  traveler  "]) {
      assert.equal(itemOriginChip(junk), null, `expected no chip for ${JSON.stringify(junk)}`);
    }
  });

  it("O10 — it never throws on a hostile value, so one bad row cannot blank the slip", () => {
    for (const junk of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      assert.equal(itemOriginChip(junk), null, `expected no chip for ${junk}`);
    }
  });
});
