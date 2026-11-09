/**
 * Launch item 12 (ledger `2026-11-09-staging-item12-seeds`): the staging access gate and the staging QA seed's gate.
 * Pure — no database, no server.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stagingAccessActive, stagingAccessDecision, stagingAccessExempt } from "../middleware/staging-access";
import { stagingQaSeedGate } from "../seeds/staging-qa.gate";

const STAGING = { ENVIRONMENT: "staging", STAGING_BASIC_AUTH_USER: "qa", STAGING_BASIC_AUTH_PASSWORD: "s3cret-pass" } as NodeJS.ProcessEnv;
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;

test("SA1 the gate is active only on ENVIRONMENT=staging — never on PROD or unset", () => {
  assert.equal(stagingAccessActive({ ENVIRONMENT: "staging" } as any), true);
  assert.equal(stagingAccessActive({ ENVIRONMENT: "Staging" } as any), true);
  for (const v of [undefined, "", "PROD", "prod", "development"]) assert.equal(stagingAccessActive({ ENVIRONMENT: v } as any), false, String(v));
  assert.equal(stagingAccessDecision({ method: "GET", path: "/plans/new" }, { ENVIRONMENT: "PROD" } as any), "pass");
});

test("SA2 on staging every page needs the credentials; a wrong pair is challenged", () => {
  const req = { method: "GET", path: "/plans/new", accept: "text/html" };
  assert.equal(stagingAccessDecision(req, STAGING), "challenge");
  assert.equal(stagingAccessDecision({ ...req, authorization: basic("qa", "wrong") }, STAGING), "challenge");
  assert.equal(stagingAccessDecision({ ...req, authorization: basic("other", "s3cret-pass") }, STAGING), "challenge");
  assert.equal(stagingAccessDecision({ ...req, authorization: basic("qa", "s3cret-pass") }, STAGING), "pass");
  assert.equal(stagingAccessDecision({ method: "POST", path: "/api/auth/login" }, STAGING), "challenge");
});

test("SA3 fail closed: staging with a credential unset answers misconfigured, not open", () => {
  assert.equal(stagingAccessDecision({ method: "GET", path: "/" , accept: "text/html" }, { ENVIRONMENT: "staging" } as any), "misconfigured");
  assert.equal(stagingAccessDecision({ method: "GET", path: "/api/trips" }, { ENVIRONMENT: "staging", STAGING_BASIC_AUTH_USER: "qa" } as any), "misconfigured");
});

test("SA4 the exempt list is the probes, the webhooks and a non-browser GET / — and nothing else", () => {
  for (const path of ["/health", "/health/ready", "/health/live", "/api/health", "/api/ready", "/api/webhooks", "/api/webhooks/stripe", "/api/webhooks/resend", "/api/bookings/webhooks/stripe"]) {
    assert.equal(stagingAccessExempt({ method: "POST", path }), true, path);
  }
  assert.equal(stagingAccessExempt({ method: "GET", path: "/", accept: "*/*" }), true, "the startup probe");
  assert.equal(stagingAccessExempt({ method: "GET", path: "/", accept: "text/html,application/xhtml+xml" }), false, "a browser");
  for (const path of ["/api/version", "/api/admin/stats", "/api/trips", "/plans/new", "/api/auth/login", "/api/webhooksx"]) {
    assert.equal(stagingAccessExempt({ method: "GET", path }), false, path);
  }
});

test("SQ1 the QA seed refuses ENVIRONMENT=PROD, production without the opt-in, and a missing or short password", () => {
  const pw = { STAGING_QA_PASSWORD: "long-enough-password" };
  assert.deepEqual(stagingQaSeedGate({ ...pw, ENVIRONMENT: "PROD", ALLOW_TEST_ACCOUNTS: "1" } as any), { run: false, reason: "ENVIRONMENT=PROD" });
  assert.deepEqual(stagingQaSeedGate({ ...pw, ENVIRONMENT: "prod", ALLOW_TEST_ACCOUNTS: "1" } as any), { run: false, reason: "ENVIRONMENT=PROD" });
  assert.equal(stagingQaSeedGate({ ...pw, NODE_ENV: "production" } as any).run, false);
  assert.equal(stagingQaSeedGate({ NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1", ENVIRONMENT: "staging" } as any).run, false);
  assert.equal(stagingQaSeedGate({ STAGING_QA_PASSWORD: "short", ALLOW_TEST_ACCOUNTS: "1" } as any).run, false);
  assert.deepEqual(stagingQaSeedGate({ ...pw, NODE_ENV: "production", ALLOW_TEST_ACCOUNTS: "1", ENVIRONMENT: "staging" } as any), { run: true });
});
