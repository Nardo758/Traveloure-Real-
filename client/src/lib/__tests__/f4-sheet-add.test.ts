/**
 * F4 (UI batch 1): the sheet a gem or a place card opens offers the add, like the event sheet.
 *
 * A compact tile draws ONE action (R755), so a tile whose one action is not the add - and any card whose reader
 * opened the details first - needs the add on the sheet. Same button, same words, same add path as the card's.
 *
 *   S1 the gem sheets and the place sheets are handed the card's own add (its save intent and its `onAdd`)
 *   S2 the sheet draws that add through PlanActions, in the engine's row, and never a second one on the event sheet
 *   S3 the add is the card's add: no new handler, no new wording
 *
 * Run: npx tsx --test client/src/lib/__tests__/f4-sheet-add.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cardActionSlots, cardContentItem } from "../card-actions";

const feed = readFileSync(join(resolve(import.meta.dirname, "../../../.."), "client/src/components/city-feed-card.tsx"), "utf8");
const sheets = feed.split("<MoreInfoSheet").slice(1).map((chunk) => chunk.slice(0, chunk.indexOf("/>")));
const of = (type: string) => sheets.filter((s) => s.includes(`cardType="${type}"`));

test("S1 the gem and place sheets are handed the card's own add", () => {
  // V31: the gem card opens DetailsView now, so it has no MoreInfoSheet left to hand an add to (0, was 2).
  assert.equal(of("gem").length, 0);
  assert.equal(of("supply").length, 2);
  for (const s of of("supply")) assert.ok(s.includes("action={{ ...supplySave, city, onAdd: onAdd ? () => onAdd(supplyAddPayload()) : undefined }}"));
});

test("S2 the sheet draws the add in the engine's row; the event sheet keeps its one add", () => {
  assert.ok(feed.includes('const sheetAdd = cardType !== "event" && action?.onAdd ? action : null;'), "the event body draws its own add, so the row does not");
  assert.ok(feed.includes("testId: `btn-add-${cardType}-sheet-${data?.id ?? \"\"}`"));
  assert.equal((feed.match(/btn-add-event-sheet-/g) ?? []).length, 1, "one add on the event sheet");
  const slots = (placeable: boolean, hasExpert: boolean) =>
    cardActionSlots(cardContentItem({ type: "gem", id: "g", title: "G", city: "Kyoto", placeable, bookable: false, hasExpert }), { mode: "waitlist", signedIn: false, surface: "sheet", density: "full" });
  assert.deepEqual(slots(true, true), ["add", "ask_expert"]);
  assert.deepEqual(slots(true, false), ["add"]);
  assert.deepEqual(slots(false, true), ["ask_expert"]);
  assert.deepEqual(slots(false, false), []);
});

test("S3 no second add path and no new wording", () => {
  const row = feed.slice(feed.indexOf("const sheetAdd ="), feed.indexOf('{cardType === "gem" && renderGemContent()}'));
  assert.ok(row.includes("onClick: sheetAdd.onAdd"), "the press is the card's own add");
  assert.match(row, /<PlanActions\s+site="bento"/, "drawn by PlanActions, which owns the add's words and its confirmed state");
  assert.doesNotMatch(row, /Add to|Save to|Added/, "no label is written here");
});
