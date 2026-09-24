/**
 * The 48-hour "no response yet" notice — the pure half. Pure.
 *   N1 the window defaults to 48h and is env-overridable (never below 1h).
 *   N2 the copy states the facts only: no deadline promised, nothing claimed cancelled.
 *   N3 the alternatives link is scoped to the city when there is one.
 * Run: npx tsx --test shared/__tests__/earner-no-response.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alternativeExpertsPath,
  earnerNoResponseCopy,
  earnerNoResponseDedupeKey,
  earnerNoResponseHours,
} from "../earner-no-response";

test("N1: window", () => {
  assert.equal(earnerNoResponseHours({}), 48);
  assert.equal(earnerNoResponseHours({ EARNER_NO_RESPONSE_NOTICE_HOURS: "24" }), 24);
  assert.equal(earnerNoResponseHours({ EARNER_NO_RESPONSE_NOTICE_HOURS: "0" }), 48);
  assert.equal(earnerNoResponseDedupeKey("booking", "b1"), "booking:b1:earner_no_response");
});

test("N2: copy states only what is true", () => {
  const c = earnerNoResponseCopy({ earnerName: "Aiko", subject: "Tea ceremony" });
  assert.match(c.message, /Aiko hasn't responded to your request about "Tea ceremony"/);
  assert.match(c.message, /still open/);
  assert.ok(!/cancel|refund|\d+\s*(h|hour|day)/i.test(c.message));
  assert.match(earnerNoResponseCopy({}).message, /^We see The expert hasn't responded/);
});

test("N3: alternatives link", () => {
  assert.equal(alternativeExpertsPath("Kyoto"), "/experts?destination=Kyoto");
  assert.equal(alternativeExpertsPath(null), "/experts");
});
