/**
 * THE SERVER'S OWN REFUSAL, RECOVERED — proofs (ledger `2026-09-17-surfaces-quotes-settlement`).
 *
 * `apiRequest` throws `new Error("<status>: <raw body>")`. Every named refusal LD 49 and LD 50 are
 * careful to emit — `validity_exceeds_ceiling` with its `ceilingDays`, `component_not_pending` with
 * the current status — therefore arrives as a string with JSON inside it. Printing that string
 * shows the user a status code and a brace; replacing it throws away WHICH fact refused. This
 * module recovers the body so the surface can word the server's own answer (§13).
 *
 * R1-R3  the prefix is stripped and the body parsed.
 * R4-R6  a non-JSON body, an empty error and a non-Error throw all degrade to a message and never
 *        to an invented code.
 * R7     the named fields the rails emit survive the round trip.
 * M1-M2  the message helper prefers the server's sentence and falls back only when there is none.
 *
 * Run: npx tsx --test client/src/lib/__tests__/api-refusal.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { apiRefusalMessage, parseApiRefusal } from "../api-refusal";

test("R1-R3: the status prefix is stripped and the JSON body is parsed", () => {
  const body = parseApiRefusal(new Error('409: {"message":"This quote expired.","code":"quote_expired"}'));
  assert.equal(body.message, "This quote expired.");
  assert.equal(body.code, "quote_expired");
  // No prefix at all still parses.
  assert.equal(parseApiRefusal(new Error('{"message":"x"}')).message, "x");
  // A three-digit status with extra whitespace.
  assert.equal(parseApiRefusal(new Error('  400:   {"message":"y"}')).message, "y");
});

test("R4-R6: a non-JSON body degrades to a message and never to an invented code", () => {
  const plain = parseApiRefusal(new Error("500: Internal Server Error"));
  assert.equal(plain.message, "Internal Server Error");
  assert.equal(plain.code, undefined);
  assert.equal(plain.reason, undefined);
  // Malformed JSON: handed back as text, not swallowed.
  const broken = parseApiRefusal(new Error('409: {"message":'));
  assert.equal(broken.message, '{"message":');
  assert.deepEqual(parseApiRefusal(new Error("")), {});
  assert.deepEqual(parseApiRefusal(undefined), {});
  assert.deepEqual(parseApiRefusal({ not: "an error" }), {});
  // A JSON array is not a refusal body — it is not read as one.
  assert.equal(parseApiRefusal(new Error("400: [1,2]")).message, "[1,2]");
});

test("R7: the named fields the rails emit survive the round trip", () => {
  const validity = parseApiRefusal(
    new Error('400: {"message":"Too long","code":"validity_exceeds_ceiling","ceilingDays":30,"requestedDays":45}'),
  );
  assert.equal(validity.ceilingDays, 30);
  assert.equal(validity.requestedDays, 45);
  const component = parseApiRefusal(
    new Error('409: {"message":"No longer outstanding","reason":"component_not_pending","currentStatus":"completed"}'),
  );
  assert.equal(component.reason, "component_not_pending");
  assert.equal(component.currentStatus, "completed");
});

test("M1-M2: the message helper prefers the server's sentence", () => {
  assert.equal(
    apiRefusalMessage(new Error('409: {"message":"This quote expired."}'), "fallback"),
    "This quote expired.",
  );
  assert.equal(apiRefusalMessage(new Error(""), "fallback"), "fallback");
  assert.equal(apiRefusalMessage(new Error('409: {"reason":"x"}'), "fallback"), "fallback");
});
