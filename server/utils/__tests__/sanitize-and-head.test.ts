/**
 * Board #1318: apostrophes and quotes survive the write-time sanitizer, and the shared-itinerary
 * page escapes at render instead. Pure.
 *   Q1 sanitizeInput keeps ' and " as written — they used to be stored as &#39; / &quot;.
 *   Q2 sanitizeInput still strips tags and encodes a stray < or >.
 *   H1 a destination carrying " < > & is escaped in every tag — no attribute breakout, no markup.
 *   H2 injectIntoHead does not expand $& / $' from user text.
 * Run: npx tsx --test server/utils/__tests__/sanitize-and-head.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeInput } from "../sanitize";
import { buildItineraryViewOgTags, injectIntoHead } from "../html-head";

test("Q1: apostrophes and quotes are stored as typed", () => {
  assert.equal(sanitizeInput(`I've guided "slow" walks in Kyoto's Gion`), `I've guided "slow" walks in Kyoto's Gion`);
});

test("Q2: tags are still stripped and stray brackets encoded", () => {
  assert.equal(sanitizeInput(`<script>alert(1)</script>Hi`), "alert(1)Hi");
  assert.equal(sanitizeInput(`<img src=x onerror=alert(1)>ok`), "ok");
  assert.equal(sanitizeInput(`a < b`), "a &lt; b");
});

test("H1: a hostile destination cannot break out of an attribute or inject markup", () => {
  const html = buildItineraryViewOgTags({
    destination: `Kyoto" onload="x()"><script>alert(1)</script> & co`,
    variantName: `Chef's pick`,
    shareUrl: `https://traveloure.com/itinerary-view/t"x`,
  });
  assert.ok(!html.includes("<script>"), "no markup survives");
  assert.ok(!html.includes(`" onload="`), "no attribute breakout");
  assert.ok(html.includes("Kyoto&quot; onload=&quot;x()&quot;&gt;&lt;script&gt;"));
  assert.ok(html.includes("Chef&#39;s pick"));
  assert.ok(html.includes("&amp; co"));
  for (const m of html.matchAll(/content="([^"]*)"/g)) assert.ok(!m[1].includes("<"), `attribute value is escaped: ${m[1]}`);
});

test("H2: $-patterns in user text stay literal when injected", () => {
  const out = injectIntoHead("<html><head></head></html>", "<title>$& $' $`</title>");
  assert.equal(out, "<html><head>\n    <title>$& $' $`</title></head></html>");
});
