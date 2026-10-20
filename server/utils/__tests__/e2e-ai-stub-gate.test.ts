/**
 * JS-1: the E2E itinerary stub is the happy path only.
 *   S1 the gate is off unless E2E_AI_STUB=1, and production never serves it
 *   S2 the trip-route stub is a days[] payload the share page can render
 *   S3 the trip generate route still answers a real failure with aiFailureResponse;
 *      the stub sits in front of the model call and does not replace the catch
 *   S4 the autonomous generator reads the same gate (no second env check)
 *
 * Run: npx tsx --test server/utils/__tests__/e2e-ai-stub-gate.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStubTripItinerary, isE2eAiStubEnabled } from "../../services/ai-draft-stub";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const routes = readFileSync(path.join(repo, "server/routes.ts"), "utf8");
const generator = readFileSync(path.join(repo, "server/services/ai-generation.service.ts"), "utf8");

function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(patch)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("S1 the stub gate is the happy-path stand-in, and production cannot turn it on", () => {
  withEnv({ E2E_AI_STUB: undefined, NODE_ENV: "test", ALLOW_TEST_ACCOUNTS: undefined, ENVIRONMENT: undefined }, () => {
    assert.equal(isE2eAiStubEnabled(), false);
  });
  withEnv({ E2E_AI_STUB: "1", NODE_ENV: "test", ALLOW_TEST_ACCOUNTS: undefined, ENVIRONMENT: undefined }, () => {
    assert.equal(isE2eAiStubEnabled(), true);
  });
  withEnv({ E2E_AI_STUB: "1", NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: undefined, ENVIRONMENT: undefined }, () => {
    assert.equal(isE2eAiStubEnabled(), false);
  });
  withEnv({ E2E_AI_STUB: "1", NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1", ENVIRONMENT: "PROD" }, () => {
    assert.equal(isE2eAiStubEnabled(), false);
  });
  withEnv({ E2E_AI_STUB: "1", NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1", ENVIRONMENT: undefined }, () => {
    assert.equal(isE2eAiStubEnabled(), true);
  });
});

test("S2 the trip stub is one located activity per day, in the days[] shape", () => {
  const plan = buildStubTripItinerary({ destination: "Kyoto, Japan", durationDays: 3 });
  assert.equal(plan.days.length, 3);
  assert.deepEqual(
    plan.days.map((d) => d.day),
    [1, 2, 3],
  );
  const activity = plan.days[0].activities[0];
  assert.equal(activity.title, "Walk through Kyoto, Japan");
  assert.equal(activity.locationName, "Kyoto, Japan");
  assert.ok(activity.description.length > 0);
  const empty = buildStubTripItinerary({ destination: "  ", durationDays: 0 });
  assert.equal(empty.days.length, 1);
  assert.equal(empty.days[0].activities[0].locationName, "the destination");
});

test("S3 a real model failure on the trip route is still aiFailureResponse, after the stub branch", () => {
  const start = routes.indexOf('app.post(api.trips.generateItinerary.path');
  const end = routes.indexOf("app.post(\"/api/expert-booking-requests\"");
  assert.ok(start > 0 && end > start, "generate-itinerary handler not found");
  const handler = routes.slice(start, end);
  const stubAt = handler.indexOf("isE2eAiStubEnabled()");
  const modelAt = handler.indexOf("anthropic.messages.create");
  const failureAt = handler.lastIndexOf("aiFailureResponse");
  assert.ok(stubAt > 0 && modelAt > stubAt, "the stub stands in front of the model call");
  assert.ok(failureAt > modelAt, "the failure answer stays after the model call");
  assert.match(handler, /buildStubTripItinerary\(\{ destination, durationDays: duration \}\)/);
  assert.equal(handler.split("await aiFailureResponse").length - 1, 2);
});

test("S4 the autonomous generator uses the same gate and does not restate the env check", () => {
  assert.match(generator, /if \(isE2eAiStubEnabled\(\)\)/);
  assert.doesNotMatch(generator, /process\.env\.E2E_AI_STUB/);
});
