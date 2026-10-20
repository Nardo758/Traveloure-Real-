/**
 * M-05 / M-06 launch copy (ledger `2026-10-20-m05-m06-kyoto-copy`).
 *
 *   M05  /earn's headline is the Kyoto sentence; /become-expert does not use it;
 *        the rate sentence is not in the headline block
 *   M06  the manual city-event seed that feeds the home strip names no Mumbai row,
 *        and the strip still selects in-city Kyoto events
 *
 * Run: npx tsx --test client/src/lib/__tests__/m05-m06-copy.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HEADLINE = "Get paid for what you already know about Kyoto";

test("M-05: the /earn headline is the Kyoto sentence and the rate line is below it", () => {
  const earn = readFileSync("client/src/pages/earn.tsx", "utf8");
  assert.ok(earn.includes(`title="${HEADLINE}"`), "exact headline");
  assert.equal(earn.includes('title="Get paid for what you already know"'), false);
  const expert = readFileSync("client/src/pages/travel-experts.tsx", "utf8");
  assert.equal(expert.includes(HEADLINE), false, "/become-expert keeps its own heading");
  const titleAt = earn.indexOf(`title="${HEADLINE}"`);
  const roleAt = earn.indexOf("Which of these is you?", titleAt);
  const keepAt = earn.indexOf("earn-keep-sentence", titleAt);
  assert.ok(titleAt >= 0 && roleAt > titleAt);
  assert.ok(keepAt > roleAt, "the keep-rate sentence is not in the headline block");
});

test("M-06: the home strip's seed lists no Mumbai, and the strip keeps Kyoto only", () => {
  const seed = readFileSync("server/seeds/city-events.manual.ts", "utf8");
  assert.equal(/city:\s*"Mumbai"/.test(seed), false);
  const strip = readFileSync("client/src/components/landing/events-strip.tsx", "utf8");
  assert.match(strip, /kyotoPageEvents\(payload\.events\)/);
  assert.match(strip, /e\.marketKey === "kyoto" && e\.outsideCity !== true/);
});
