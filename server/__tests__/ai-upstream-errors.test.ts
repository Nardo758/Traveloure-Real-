/**
 * Ledger `2026-10-01-ai-upstream-error-classes` — the 2026-09-30 incident, pinned.
 *
 * An Anthropic 400 invalid_request_error "Your credit balance is too low" was answered to travelers
 * as the retryable 503 "high demand" copy and alerted nobody. These proofs drive the ONE module
 * (`server/services/ai-upstream-errors.ts`) with injected record/alert deps — no database, no
 * network — and pin:
 *   U1  a 400 credit error → non-retryable path: distinct 502, no retry prompt, ONE alert, one record
 *   U2  a 429 → retryable path: the existing 503 + retry-after, NO alert, one record
 *   U3  a second 400 within the hour → recorded, but NO second alert
 *   U4  the alert carries type/route/request id and never the key or the prompt
 *   U5  the provider error is still classified through a wrapping `cause` (the generator wraps it)
 *   U6  non-upstream errors (parse failures, our own breaker) are not classified and not recorded
 *   U7  an hour later the gate re-opens
 */
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  aiFailureResponse,
  classifyAiUpstreamError,
  _resetAiUpstreamAlertGate,
  AI_ALERT_WINDOW_MS,
  AI_NONRETRYABLE_MESSAGE,
  AI_NONRETRYABLE_STATUS,
  type AiUpstreamAlert,
  type AiUpstreamFailureRecord,
  type AiUpstreamReportDeps,
} from "../services/ai-upstream-errors";

/** Shaped like the Anthropic SDK's APIError: status, parsed body, request id. */
function providerError(status: number, type: string, message: string, requestId = "req_test_123"): Error {
  const e: any = new Error(`${status} ${JSON.stringify({ type: "error", error: { type, message } })}`);
  e.name = "BadRequestError";
  e.status = status;
  e.error = { type: "error", error: { type, message } };
  e.request_id = requestId;
  e.headers = { "request-id": requestId };
  return e;
}

const creditError = () =>
  providerError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.");

function harness(start = Date.UTC(2026, 9, 1, 12, 0, 0)) {
  const records: AiUpstreamFailureRecord[] = [];
  const alerts: AiUpstreamAlert[] = [];
  let now = start;
  const deps: AiUpstreamReportDeps = {
    async recordFailure(row) { records.push(row); },
    async sendAlert(alert) { alerts.push(alert); },
    now: () => now,
  };
  return { deps, records, alerts, advance: (ms: number) => { now += ms; } };
}

const ctx = { route: "POST /api/ai/generate-itinerary", sourceType: "ai_itinerary", userId: "user-1" };

beforeEach(() => _resetAiUpstreamAlertGate());

test("U1: a 400 credit error takes the non-retryable path — distinct 502, no retry prompt, one alert", async () => {
  const h = harness();
  const out = await aiFailureResponse(creditError(), ctx, h.deps);
  assert.equal(out.status, AI_NONRETRYABLE_STATUS);
  assert.notEqual(out.status, 503);
  assert.equal(out.body.message, AI_NONRETRYABLE_MESSAGE);
  assert.equal(out.body.retryable, false);
  assert.equal("retryAfterSeconds" in out.body, false, "no retry-after on a failure no retry fixes");
  assert.doesNotMatch(String(out.body.message), /try again/i);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.alerts[0].errorType, "credit_balance");
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0].errorClass, "non_retryable");
});

test("U2: a 429 takes the retryable path — the existing 503 + retry copy, and no alert", async () => {
  const h = harness();
  const out = await aiFailureResponse(providerError(429, "rate_limit_error", "Rate limited"), ctx, h.deps);
  assert.equal(out.status, 503);
  assert.match(String(out.body.message), /try again in a moment/);
  assert.equal(out.body.retryable, true);
  assert.equal(typeof out.body.retryAfterSeconds, "number");
  assert.equal(h.alerts.length, 0);
  assert.equal(h.records.length, 1, "a retryable failure is still recorded as a failed call");
  assert.equal(h.records[0].errorClass, "retryable");
  assert.equal(h.records[0].errorType, "rate_limited");
});

test("U3: a second 400 within the hour is recorded but sends no second alert", async () => {
  const h = harness();
  await aiFailureResponse(creditError(), ctx, h.deps);
  h.advance(AI_ALERT_WINDOW_MS - 60_000);
  const second = await aiFailureResponse(creditError(), ctx, h.deps);
  assert.equal(second.status, AI_NONRETRYABLE_STATUS);
  assert.equal(h.alerts.length, 1, "only the first non-retryable error in the hour alerts");
  assert.equal(h.records.length, 2, "both failures are counted");
});

test("U4: the alert names the type, route and request id — never a key or the prompt", async () => {
  const h = harness();
  process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-key-never-sent";
  await aiFailureResponse(creditError(), ctx, h.deps);
  const a = h.alerts[0];
  assert.deepEqual(Object.keys(a).sort(), ["at", "errorType", "requestId", "route", "status"]);
  assert.equal(a.route, ctx.route);
  assert.equal(a.requestId, "req_test_123");
  assert.equal(a.status, 400);
  const serialized = JSON.stringify(a);
  assert.doesNotMatch(serialized, /sk-ant/);
  assert.doesNotMatch(serialized, /credit balance is too low/, "the provider's text stays server-side");
});

test("U5: a provider error wrapped in a cause (the itinerary generator's shape) is still classified", () => {
  const wrapped = new Error("Autonomous itinerary generation failed: 400 ...", { cause: creditError() });
  const c = classifyAiUpstreamError(wrapped);
  assert.equal(c?.errorClass, "non_retryable");
  assert.equal(c?.errorType, "credit_balance");
});

test("U6: non-upstream failures are not classified, recorded or alerted, and keep the 503", async () => {
  const h = harness();
  const parse = new Error("Anthropic itinerary: no JSON object found");
  assert.equal(classifyAiUpstreamError(parse), null);
  const breaker: any = new Error("AI_SERVICE_TEMPORARILY_UNAVAILABLE");
  breaker.code = "AI_SERVICE_TEMPORARILY_UNAVAILABLE";
  breaker.retryAfterSeconds = 17;
  const out = await aiFailureResponse(breaker, ctx, h.deps);
  assert.equal(out.status, 503);
  assert.equal(out.body.retryAfterSeconds, 17);
  assert.equal(h.records.length, 0);
  assert.equal(h.alerts.length, 0);
});

test("U7: classification table — retryable vs non-retryable statuses", () => {
  const cls = (s: number, t = "x", m = "m") => classifyAiUpstreamError(providerError(s, t, m))?.errorClass;
  assert.equal(cls(529, "overloaded_error"), "retryable");
  assert.equal(cls(500, "api_error"), "retryable");
  assert.equal(cls(408), "retryable");
  assert.equal(cls(401, "authentication_error"), "non_retryable");
  assert.equal(cls(403, "permission_error"), "non_retryable");
  assert.equal(cls(404, "not_found_error", "model: claude-x"), "non_retryable");
  assert.equal(classifyAiUpstreamError(providerError(404, "not_found_error", "model: claude-x"))?.errorType, "invalid_model");
  const timeout: any = new Error("Request timed out."); timeout.name = "APIConnectionTimeoutError";
  assert.equal(classifyAiUpstreamError(timeout)?.errorClass, "retryable");
});

test("U8: an hour after the first alert, the next non-retryable error alerts again", async () => {
  const h = harness();
  await aiFailureResponse(creditError(), ctx, h.deps);
  h.advance(AI_ALERT_WINDOW_MS);
  await aiFailureResponse(creditError(), ctx, h.deps);
  assert.equal(h.alerts.length, 2);
});

test("U9: the same error object caught twice (completeJson, then the route) is recorded once", async () => {
  const h = harness();
  const err = creditError();
  await aiFailureResponse(err, { route: "completeJson:label" }, h.deps);
  await aiFailureResponse(err, ctx, h.deps);
  assert.equal(h.records.length, 1);
  assert.equal(h.alerts.length, 1);
});
