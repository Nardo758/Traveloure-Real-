/**
 * THE FREE DRAFT'S JSON PARSER — what it recovers, and what it refuses to invent.
 *
 * CLAUDE.md Locked Decision 41 (c) / ledger `2026-09-05-draft-cost-tracking-and-tier`.
 *
 * WHY IT MATTERS HERE. The free draft's tier is now a COST decision (`ai-draft-model.ts`), and a
 * cheaper tier is marginally likelier to wrap its JSON in a fence or a sentence of preamble. Three
 * draft call sites each carried their own one-line recovery and each failed on the shapes the
 * others handled; `server/utils/ai-json.ts` is the one implementation (§18 rule 1).
 *
 * THE HALF THAT MATTERS MOST IS THE REFUSAL. §13: there is no repair step. A truncated response is
 * an INCOMPLETE answer, and completing it would hand the traveler a plan the model never produced.
 *
 * Pure — no DATABASE_URL, no network, no model.
 * Run: npx tsx --test server/__tests__/ai-json-parse.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAiJsonObject, parseAiJsonObjectOrThrow } from "../utils/ai-json";

describe("LD 41 (c) — ai-json recovers real model output", () => {
  it("R1 bare JSON parses", () => {
    assert.deepEqual(parseAiJsonObject('{"days":[{"day":1}]}'), { days: [{ day: 1 }] });
  });

  it("R2 a ```json fence is stripped", () => {
    const raw = '```json\n{"title":"Kyoto in 3 days","days":[]}\n```';
    assert.deepEqual(parseAiJsonObject(raw), { title: "Kyoto in 3 days", days: [] });
  });

  it("R3 a bare ``` fence is stripped too", () => {
    assert.deepEqual(parseAiJsonObject('```\n{"a":1}\n```'), { a: 1 });
  });

  it("R4 a sentence of preamble before the object is skipped", () => {
    const raw = 'Here is your itinerary:\n{"days":[{"day":1,"title":"Arrival"}]}';
    assert.deepEqual(parseAiJsonObject(raw), { days: [{ day: 1, title: "Arrival" }] });
  });

  it("R5 TRAILING PROSE CONTAINING A BRACE parses — the greedy regex's failure", () => {
    // `/\{[\s\S]*\}/` runs to the LAST `}` in the response, so this shape failed at every call
    // site this module replaces. Brace matching is why it now succeeds.
    const raw = '{"days":[{"day":1}]}\n\nEnjoy your trip! Reply with {feedback} if you want changes}';
    assert.deepEqual(parseAiJsonObject(raw), { days: [{ day: 1 }] });
  });

  it("R6 a brace INSIDE a string literal does not end the object", () => {
    const raw = '{"title":"Dinner at }Brace{ Bistro","days":[]}';
    assert.deepEqual(parseAiJsonObject(raw), { title: "Dinner at }Brace{ Bistro", days: [] });
  });

  it("R7 an escaped quote inside a string does not break the scan", () => {
    const raw = '{"note":"the chef said \\"welcome\\" — {not a brace}","days":[]}';
    const parsed = parseAiJsonObject<{ note: string }>(raw);
    assert.equal(parsed?.note, 'the chef said "welcome" — {not a brace}');
  });

  it("R8 nested objects and arrays survive", () => {
    const raw = '```json\n{"days":[{"day":1,"activities":[{"t":"09:00","meta":{"x":{"y":1}}}]}]}\n```';
    const parsed = parseAiJsonObject<any>(raw);
    assert.equal(parsed.days[0].activities[0].meta.x.y, 1);
  });
});

describe("LD 41 (c) — ai-json refuses to invent (§13)", () => {
  it("N1 a TRUNCATED object returns null — never a repaired half-plan", () => {
    const raw = '{"days":[{"day":1,"title":"Arrival","activities":[{"title":"Walk"';
    assert.equal(parseAiJsonObject(raw), null);
  });

  it("N2 an unterminated string returns null", () => {
    assert.equal(parseAiJsonObject('{"title":"Kyoto'), null);
  });

  it("N3 a trailing comma is NOT silently repaired", () => {
    assert.equal(parseAiJsonObject('{"a":1,}'), null);
  });

  it("N4 prose with no object at all returns null", () => {
    assert.equal(parseAiJsonObject("I'm sorry, I can't help with that."), null);
  });

  it("N5 empty / non-string input returns null rather than throwing", () => {
    assert.equal(parseAiJsonObject(""), null);
    assert.equal(parseAiJsonObject("   "), null);
    assert.equal(parseAiJsonObject(null), null);
    assert.equal(parseAiJsonObject(undefined), null);
  });

  it("N6 a top-level ARRAY is not an object — the draft's contract is an object", () => {
    assert.equal(parseAiJsonObject('[{"day":1}]'), null);
  });

  it("N7 the orThrow form throws with a stated reason, so a bad response is an error not a plan", () => {
    assert.throws(
      () => parseAiJsonObjectOrThrow("nothing parseable here", "AI itinerary draft"),
      /AI itinerary draft: the model response contained no parseable JSON object/,
    );
    assert.deepEqual(parseAiJsonObjectOrThrow('{"ok":true}', "x"), { ok: true });
  });
});
