/**
 * JS-1: a real model failure still shows the traveler-facing error.
 * The E2E stub makes the generate happy path deterministic. It does not answer 502/503.
 * These bodies are what `aiFailureResponse` already returns:
 *   F1 502 ai_unavailable → the server's "Planning is temporarily unavailable."
 *   F2 503 high demand (retryable, and the circuit-breaker shape with only retryAfterSeconds)
 *   F3 a non-failure is not this notice
 *   F4 runFreeDraft throws that notice, and the alert renders it
 *   F5 both draft doors mount the alert
 *
 * Run: npx tsx --test client/src/lib/__tests__/ai-draft-failure.test.tsx
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { AiDraftFailureAlert } from "../ai-draft-failure";
import { FreeDraftFailure, readAiDraftFailure, runFreeDraft } from "../slip-free-draft";

(globalThis as any).React = React;

const UNAVAILABLE = {
  message: "Planning is temporarily unavailable.",
  retryable: false as const,
  code: "ai_unavailable" as const,
};
const HIGH_DEMAND = {
  message: "Our AI is experiencing high demand. Please try again in a moment.",
  retryable: true as const,
  retryAfterSeconds: 4,
};
const CIRCUIT = {
  message: "Our AI is experiencing high demand. Please try again in a moment.",
  retryAfterSeconds: 4,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function shows(notice: { title: string; description: string }, sentence: string) {
  const html = renderToString(<AiDraftFailureAlert notice={notice} />).replace(/&#x27;|&#39;/g, "'");
  assert.match(html, /data-testid="ai-draft-failure"/);
  assert.match(html, /role="alert"/);
  assert.ok(html.includes(notice.title), html);
  assert.ok(html.includes(sentence), html);
}

describe("a real model failure still shows on the draft", () => {
  it("F1 502 ai_unavailable shows the server's unavailable sentence", () => {
    const notice = readAiDraftFailure(502, UNAVAILABLE);
    assert.ok(notice);
    assert.equal(notice.description, UNAVAILABLE.message);
    shows(notice, UNAVAILABLE.message);
  });

  it("F2 503 high demand shows the server's retry sentence, both body shapes", () => {
    for (const body of [HIGH_DEMAND, CIRCUIT]) {
      const notice = readAiDraftFailure(503, body);
      assert.ok(notice, JSON.stringify(body));
      assert.equal(notice.description, body.message);
      shows(notice, body.message);
    }
  });

  it("F3 a refusal, a 500, and a 503 with no message are not this notice", () => {
    assert.equal(readAiDraftFailure(409, { error: "slip_has_items", message: "already has items" }), null);
    assert.equal(readAiDraftFailure(500, { message: "Failed to generate itinerary" }), null);
    assert.equal(readAiDraftFailure(502, { message: "Planning is temporarily unavailable.", retryable: false }), null);
    assert.equal(readAiDraftFailure(503, {}), null);
    assert.equal(readAiDraftFailure(503, null), null);
  });

  it("F4 runFreeDraft throws the notice, and the alert is that error state", async () => {
    const trip = {
      id: "trip-1",
      destination: "Kyoto, Japan",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
    };
    for (const [status, body] of [
      [502, UNAVAILABLE],
      [503, HIGH_DEMAND],
    ] as const) {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;
      await assert.rejects(runFreeDraft(trip), (err: unknown) => {
        assert.ok(err instanceof FreeDraftFailure);
        assert.equal(err.notice.description, body.message);
        shows(err.notice, body.message);
        return true;
      });
    }
  });

  it("F5 the slip's draft doors mount the alert the hook returns", () => {
    const hook = fs.readFileSync(new URL("../../components/plan/useSlipFreeDraft.tsx", import.meta.url), "utf8");
    const rail = fs.readFileSync(new URL("../../components/plancard/SlipRail.tsx", import.meta.url), "utf8");
    const empty = fs.readFileSync(new URL("../../components/plan/SlipEmptyStart.tsx", import.meta.url), "utf8");
    assert.match(hook, /failureAlert: failure \? <AiDraftFailureAlert notice=\{failure\} \/> : null/);
    assert.match(rail, /\{draft\.failureAlert\}/);
    assert.match(empty, /\{draft\.failureAlert\}/);
  });
});
