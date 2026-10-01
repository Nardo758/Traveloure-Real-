/**
 * draft-party-and-honest-stats.test.ts — ledger `2026-09-30-occasion-party-and-honest-stats`:
 * an occasion draft states a party only when the occasion itself names one, the AI stats card
 * shows no invented "time saved", and a Places lookup logs one info line on success.
 * Run: npx tsx --test shared/__tests__/draft-party-and-honest-stats.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OCCASION_TEMPLATES, GENERIC_OCCASION_TEMPLATE } from "../../server/services/occasion-templates";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

test("Q1: only the couple occasions state a party of 2; the rest state none", () => {
  const stated = Object.values(OCCASION_TEMPLATES).filter((t) => t.partySize != null).map((t) => t.key).sort();
  assert.deepEqual(stated, ["anniversary", "date_night", "proposal"]);
  assert.equal(GENERIC_OCCASION_TEMPLATE.partySize, undefined);
});

test("Q2: the draft no longer hard-codes a party of 2", () => {
  const src = read("server/services/occasion-drafts.service.ts");
  assert.doesNotMatch(src, /travelers: 2|numberOfTravelers: 2/);
  assert.match(src, /template\.partySize \?\? null/);
});

test("Q3: AI stats carry no assumed time saved, and the card omits the row when it is null", () => {
  assert.doesNotMatch(read("server/routes.ts"), /completed \* 10/);
  assert.match(read("client/src/pages/expert/ai-assistant.tsx"), /aiStats\?\.timeSaved != null &&/);
});

test("Q4: a Places lookup logs place_id, cache and latency on success", () => {
  const src = read("server/services/content-facts/place-facts.service.ts");
  assert.match(src, /lookup ok place_id=\$\{placeId\} cache=\$\{cache\} latency_ms=/);
  assert.equal((src.match(/logLookup\(/g) ?? []).length, 3, "declared once, called on hit and on miss");
});
