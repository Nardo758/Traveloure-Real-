/**
 * Row 326 (M2) — a stop that names no place is a SLOT TO FILL, and is never treated as a place.
 *
 * The gate is the ONE rule (`shared/place-name-gate.ts:194`); `plan-placeholder.ts` only asks it for a row.
 * The pinned consequences: an area/generic title IS a slot, a named venue is NOT, and a slot row carries
 * `data-placeholder` instead of presenting itself as a mapped stop.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isPlaceholderStop, placeholderStopReason } from "../plan-placeholder";

const KYOTO = ["Shimogyo", "Higashiyama", "Gion"];

test("an area or generic title is a slot, a named venue is not", () => {
  assert.equal(placeholderStopReason({ name: "Late Dinner in Shimogyo" }, "Kyoto", KYOTO), "area_title");
  assert.equal(placeholderStopReason({ name: "Kaiseki Farewell Dinner" }, "Kyoto", KYOTO), "no_named_tokens");
  assert.equal(placeholderStopReason({ name: "Ginkaku-ji Temple" }, "Kyoto", KYOTO), null, "a named temple is a place");
  assert.equal(placeholderStopReason({ name: "" }, "Kyoto", KYOTO), "no_named_tokens", "an untitled stop is a slot");
  assert.equal(isPlaceholderStop({ name: "Welcome Picnic in Higashiyama" }, "Kyoto", KYOTO), true);
  assert.equal(isPlaceholderStop({ name: "Fushimi Inari Shrine" }, "Kyoto", KYOTO), false);
});

test("the row asks the one rule and marks itself, rather than presenting as a place", () => {
  const src = fs.readFileSync("client/src/components/plan/ItemRow.tsx", "utf8");
  assert.match(src, /import \{ placeholderStopReason \} from "@\/lib\/plan-placeholder"/, "the row uses the shared helper");
  assert.match(src, /const isSlot = placeholderReason !== null/, "it derives the slot from the gate's reason");
  assert.match(src, /data-placeholder/, "a slot row says so");
  assert.doesNotMatch(src, /description:\s*"no_named_tokens"/, "the reason is never re-implemented in the row");
});

test("a placeholder is never geocoded: the gate has no tokens for it", () => {
  const gate = fs.readFileSync("shared/place-name-gate.ts", "utf8");
  assert.match(gate, /export function unnamedPlaceReason/, "one home for the decision");
  assert.match(gate, /export function namedPlaceTokens/, "and one home for the lookup tokens");
});
