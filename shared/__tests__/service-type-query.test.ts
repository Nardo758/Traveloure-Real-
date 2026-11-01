import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseServiceTypeQuery, UNKNOWN_SERVICE_TYPE_MESSAGE } from "../service-type-query";

const BANNED = [
  /paypal/i,
  /traveler fee/i,
  /\bcrowd\b/i,
  /trending/i,
  /\bfounding\b/i,
  /\bbest\b/i,
  /\btop\b/i,
  /ultimate/i,
  /premier/i,
  /world-class/i,
  /#1/,
  /most popular/i,
  /ranking/i,
];

test("an absent serviceType means every listing type", () => {
  assert.deepEqual(parseServiceTypeQuery(undefined), { ok: true, serviceType: null });
  assert.deepEqual(parseServiceTypeQuery(null), { ok: true, serviceType: null });
  assert.deepEqual(parseServiceTypeQuery(""), { ok: true, serviceType: null });
  assert.deepEqual(parseServiceTypeQuery("   "), { ok: true, serviceType: null });
});

test("concierge is accepted; an unknown or repeated value is refused", () => {
  assert.deepEqual(parseServiceTypeQuery("concierge"), { ok: true, serviceType: "concierge" });
  assert.deepEqual(parseServiceTypeQuery(" planning "), { ok: true, serviceType: "planning" });
  assert.deepEqual(parseServiceTypeQuery("Concierge"), { ok: false });
  assert.deepEqual(parseServiceTypeQuery("top"), { ok: false });
  assert.deepEqual(parseServiceTypeQuery(["concierge"]), { ok: false });
  assert.equal(UNKNOWN_SERVICE_TYPE_MESSAGE, "Unknown service type.");
});

test("the serviceType query module adds no ranking or top claim", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "../service-type-query.ts"), "utf8");
  const literals = [...src.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g)].map((match) => match[0]);
  assert.ok(literals.length > 0);
  for (const literal of literals) {
    for (const banned of BANNED) assert.doesNotMatch(literal, banned, literal);
  }
  assert.doesNotMatch(src, /orderBy|sortBy|isFeatured/);
});
