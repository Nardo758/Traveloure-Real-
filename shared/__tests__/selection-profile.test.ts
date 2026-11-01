/**
 * Row 306 (CS-3 brief 10, E): the selection profile's pure rules.
 *
 *   P1 a row is the action and four coarse fields, nothing more
 *   P2 stop types are the item's coarse type only; none names or implies religion or health
 *   P3 times of day, price bands (another currency is no band) and neighbourhood slugs
 *   P4 traits are plain counts: kept picks minus removals and skips, below the minimum is no trait
 *   P5 no trait ⇒ no prompt line, so the planner's and Optimize's prompts are unchanged
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildSelectionTraits,
  SELECTION_ACTIONS,
  SELECTION_PROFILE_FLAG,
  SELECTION_STOP_TYPES,
  selectionNeighbourhood,
  selectionPriceBand,
  selectionStopType,
  selectionTimeOfDay,
  selectionTraitsPromptLine,
  type SelectionRow,
} from "../selection-profile";

const SENSITIVE = /relig|church|temple|shrine|mosque|synagog|worship|pray|faith|health|medic|clinic|hospital|pharma|therap|diet|disab|pregnan/i;

test("P1 a row is the action and four coarse fields only", () => {
  const src = fs.readFileSync("shared/selection-profile.ts", "utf8");
  const shape = src.slice(src.indexOf("export interface SelectionRow"), src.indexOf("}", src.indexOf("export interface SelectionRow")));
  const fields = [...shape.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(fields, ["action", "stopType", "neighbourhood", "timeOfDay", "priceBand"]);
  assert.equal(SELECTION_PROFILE_FLAG, "selection_profile");
  assert.deepEqual([...SELECTION_ACTIONS], ["add", "remove", "swap", "move", "skip", "version_kept", "search"]);
});

test("P2 stop types never name or imply religion or health", () => {
  for (const t of SELECTION_STOP_TYPES) assert.doesNotMatch(t, SENSITIVE, t);
  assert.equal(selectionStopType("meal"), "meal");
  assert.equal(selectionStopType("temple"), null, "a finer category is never logged");
  assert.equal(selectionStopType("meeting"), null);
  const schema = fs.readFileSync("shared/schema.ts", "utf8");
  const table = schema.slice(schema.indexOf('export const selectionEvents = pgTable("selection_events"'), schema.indexOf("export type SelectionEvent"));
  assert.doesNotMatch(table.replace(/\/\/.*$/gm, ""), SENSITIVE);
  assert.doesNotMatch(table, /title|name:|note|latitude|longitude|trip_id/i);
});

test("P3 time of day, price band and neighbourhood", () => {
  assert.equal(selectionTimeOfDay("09:30"), "morning");
  assert.equal(selectionTimeOfDay("13:00"), "afternoon");
  assert.equal(selectionTimeOfDay("19:15"), "evening");
  assert.equal(selectionTimeOfDay("23:00"), "night");
  assert.equal(selectionTimeOfDay("soon"), null);
  const bounds = { currency: "USD", lowMax: 30, midMax: 120 };
  assert.equal(selectionPriceBand("0", "USD", bounds), "free");
  assert.equal(selectionPriceBand(25, "USD", bounds), "low");
  assert.equal(selectionPriceBand("80.00", "usd", bounds), "mid");
  assert.equal(selectionPriceBand(500, "USD", bounds), "high");
  assert.equal(selectionPriceBand(5000, "JPY", bounds), null, "never converted");
  assert.equal(selectionPriceBand(null, "USD", bounds), null);
  assert.equal(selectionNeighbourhood("Gion"), "gion");
  assert.equal(selectionNeighbourhood("gion-shirakawa"), "gion-shirakawa");
  assert.equal(selectionNeighbourhood("My hotel, room 4"), null, "free text is dropped");
});

test("P4 traits are plain counts", () => {
  const row = (action: SelectionRow["action"], over: Partial<SelectionRow> = {}): SelectionRow => ({
    action, stopType: null, neighbourhood: null, timeOfDay: null, priceBand: null, ...over,
  });
  const rows: SelectionRow[] = [
    row("add", { neighbourhood: "gion", timeOfDay: "evening", stopType: "meal" }),
    row("add", { neighbourhood: "gion", timeOfDay: "evening", stopType: "meal" }),
    row("version_kept"),
    row("add", { neighbourhood: "gion", stopType: "activity" }),
    row("add", { neighbourhood: "arashiyama" }),
    row("remove", { stopType: "meal" }),
    row("skip", { timeOfDay: "evening" }),
    row("move", { neighbourhood: "arashiyama" }),
    row("search"),
  ];
  const traits = buildSelectionTraits(rows, 2);
  assert.deepEqual(traits, [{ field: "neighbourhood", value: "gion", count: 3 }]);
  assert.deepEqual(buildSelectionTraits(rows, 1).map((t) => `${t.field}=${t.value}`), [
    "stopType=meal",
    "neighbourhood=gion",
    "timeOfDay=evening",
  ]);
  assert.deepEqual(buildSelectionTraits([], 1), []);
});

test("P5 no trait, no prompt line", () => {
  assert.equal(selectionTraitsPromptLine([]), "");
  assert.match(selectionTraitsPromptLine([{ field: "neighbourhood", value: "gion", count: 3 }]), /neighbourhood=gion/);
});
