/**
 * Launch item 12 (ledger `2026-11-09-staging-item12-seeds`): the staging access gate and the staging QA seed's gate.
 * Gate cookie + 401 reason logging: ledger `2026-11-09-staging-gate-cookie` (SC1–SC8).
 * Pure — no database, no server.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGING_GATE_COOKIE_MAX_AGE_SECONDS,
  signStagingGateCookie,
  stagingAccessActive,
  stagingAccessDecision,
  stagingAccessEvaluate,
  stagingAccessExempt,
  stagingAccessGate,
  verifyStagingGateCookie,
} from "../middleware/staging-access";
import { logger } from "../infrastructure/logger";
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

// ── Gate cookie + 401 reasons (ledger `2026-11-09-staging-gate-cookie`) ─────────────────────────────────────────────

const NOW = 1_800_000_000;

type Captured = { status: number; headers: Record<string, string | string[]>; cookies: Array<{ name: string; value: string; opts: any }>; body?: string; nexted: boolean };

/** Run the real middleware against a minimal req/res; captures cookies, status, headers and every logger.warn call. */
function runGate(
  req: { method: string; path: string; headers?: Record<string, string> },
  env: NodeJS.ProcessEnv = STAGING,
  nowSeconds = NOW,
): Captured & { warns: unknown[][] } {
  const out: Captured = { status: 200, headers: {}, cookies: [], nexted: false };
  const res: any = {
    setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
    cookie: (name: string, value: string, opts: any) => { out.cookies.push({ name, value, opts }); return res; },
    status: (c: number) => { out.status = c; return res; },
    type: () => res,
    send: (b: string) => { out.body = b; return res; },
  };
  const warns: unknown[][] = [];
  const original = logger.warn;
  (logger as any).warn = (...a: unknown[]) => { warns.push(a); };
  try {
    stagingAccessGate(env, () => nowSeconds)({ method: req.method, path: req.path, headers: req.headers ?? {} } as any, res, () => { out.nexted = true; });
  } finally {
    (logger as any).warn = original;
  }
  return { ...out, warns };
}

const PAGE = { method: "GET", path: "/plans/new" };

test("SC1 a request that passes basic auth gets the stg_gate cookie, with the ruled attributes", () => {
  const r = runGate({ ...PAGE, headers: { authorization: basic("qa", "s3cret-pass"), accept: "text/html" } });
  assert.equal(r.nexted, true);
  assert.equal(r.cookies.length, 1);
  const c = r.cookies[0];
  assert.equal(c.name, "stg_gate");
  assert.equal(c.value, signStagingGateCookie("s3cret-pass", NOW + STAGING_GATE_COOKIE_MAX_AGE_SECONDS));
  assert.match(c.value, /^\d+\.[0-9a-f]{64}$/);
  assert.deepEqual(
    { httpOnly: c.opts.httpOnly, secure: c.opts.secure, sameSite: c.opts.sameSite, path: c.opts.path, maxAge: c.opts.maxAge },
    { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 * 1000 },
  );
  assert.equal(c.opts.encode("a.b"), "a.b", "the value is set verbatim, not URL-encoded");
  assert.equal(r.headers["x-robots-tag"], "noindex, nofollow");
});

test("SC2 a valid unexpired cookie passes with no Authorization header — on any path, any method", () => {
  const cookie = `other=1; stg_gate=${signStagingGateCookie("s3cret-pass", NOW + 60)}; x=y`;
  for (const req of [{ method: "POST", path: "/api/auth/register" }, { method: "GET", path: "/api/public/signup-mode" }, PAGE]) {
    const r = runGate({ ...req, headers: { cookie } });
    assert.equal(r.nexted, true, req.path);
    assert.equal(r.cookies.length, 0, "a cookie pass does not re-mint the cookie");
    assert.equal(r.warns.length, 0);
  }
  assert.equal(stagingAccessEvaluate({ ...PAGE, cookie }, STAGING, NOW).decision, "pass");
});

test("SC3 tampered, expired, over-long-lived and wrong-key cookies are rejected", () => {
  const good = signStagingGateCookie("s3cret-pass", NOW + 60);
  const [exp, mac] = good.split(".");
  const flipped = mac.slice(0, -1) + (mac.endsWith("0") ? "1" : "0");
  const cases: Array<[string, string]> = [
    [`${exp}.${flipped}`, "invalid"],
    [`${Number(exp) + 1}.${mac}`, "invalid"],
    [signStagingGateCookie("s3cret-pass", NOW - 1), "expired"],
    [signStagingGateCookie("s3cret-pass", NOW), "expired"],
    [signStagingGateCookie("s3cret-pass", NOW + STAGING_GATE_COOKIE_MAX_AGE_SECONDS + 1), "invalid"],
    [signStagingGateCookie("rotated-password", NOW + 60), "invalid"],
    ["garbage", "invalid"],
    ["", "absent"],
  ];
  for (const [value, state] of cases) {
    assert.equal(verifyStagingGateCookie(value, "s3cret-pass", NOW), state, value);
    const r = runGate({ ...PAGE, headers: { cookie: `stg_gate=${value}` } });
    assert.equal(r.nexted, false, value);
    assert.equal(r.status, 401, value);
    assert.match(String(r.headers["www-authenticate"]), /^Basic realm=/);
  }
  assert.equal(verifyStagingGateCookie(good, "s3cret-pass", NOW), "valid");
});

test("SC4 exempt paths and the non-browser GET / probe pass and get no cookie, even with valid basic auth", () => {
  const auth = basic("qa", "s3cret-pass");
  for (const req of [
    { method: "POST", path: "/api/webhooks/stripe" },
    { method: "POST", path: "/api/bookings/webhooks/stripe" },
    { method: "GET", path: "/health" },
    { method: "GET", path: "/api/ready" },
    { method: "GET", path: "/", headers: { accept: "*/*", authorization: auth } },
  ]) {
    const r = runGate({ ...req, headers: { authorization: auth, ...(req as any).headers } });
    assert.equal(r.nexted, true, req.path);
    assert.equal(r.cookies.length, 0, req.path);
  }
});

test("SC5 each 401 logs one warn with the instance, path and the right reason — never a header, cookie or Secret value", () => {
  const cases: Array<[Record<string, string>, string, string]> = [
    [{}, "no_authorization_header", "absent"],
    [{ authorization: basic("qa", "wrong") }, "credentials_mismatch", "absent"],
    [{ authorization: basic("someone", "s3cret-pass") }, "credentials_mismatch", "absent"],
    [{ authorization: "Bearer abc.def" }, "malformed_or_wrong_scheme", "absent"],
    [{ authorization: `Basic ${Buffer.from("no-colon").toString("base64")}` }, "malformed_or_wrong_scheme", "absent"],
    [{ cookie: `stg_gate=${signStagingGateCookie("s3cret-pass", NOW - 5)}` }, "no_authorization_header", "expired"],
    [{ cookie: `stg_gate=${signStagingGateCookie("old-pass", NOW + 5)}` }, "no_authorization_header", "invalid"],
  ];
  for (const [headers, reason, gateCookie] of cases) {
    const r = runGate({ method: "POST", path: "/api/auth/register", headers });
    assert.equal(r.status, 401);
    assert.equal(r.warns.length, 1, reason);
    const [fields, msg] = r.warns[0] as [Record<string, unknown>, string];
    assert.equal(msg, "staging gate 401");
    assert.deepEqual(Object.keys(fields).sort(), ["gateCookie", "instance", "method", "path", "reason"]);
    assert.equal(fields.reason, reason);
    assert.equal(fields.gateCookie, gateCookie);
    assert.equal(fields.path, "/api/auth/register");
    assert.match(String(fields.instance), /^.+:\d+$/);
    const logged = JSON.stringify(r.warns);
    for (const secret of ["s3cret-pass", "qa:", ...Object.values(headers)]) assert.equal(logged.includes(secret), false, secret);
  }
});

test("SC6 valid basic auth still passes with a bad cookie beside it, and is the path that mints a fresh one", () => {
  const r = runGate({ ...PAGE, headers: { authorization: basic("qa", "s3cret-pass"), cookie: "stg_gate=garbage" } });
  assert.equal(r.nexted, true);
  assert.equal(r.cookies.length, 1);
  assert.equal(r.warns.length, 0);
});

test("SC7 unchanged: robots.txt, fail-closed 503 (a cookie cannot open it), and a no-op outside staging", () => {
  const robots = runGate({ method: "GET", path: "/robots.txt" });
  assert.equal(robots.body, "User-agent: *\nDisallow: /\n");
  assert.equal(robots.headers["x-robots-tag"], "noindex, nofollow");

  const half = { ENVIRONMENT: "staging", STAGING_BASIC_AUTH_USER: "qa" } as NodeJS.ProcessEnv;
  const mis = runGate({ ...PAGE, headers: { cookie: `stg_gate=${signStagingGateCookie("", NOW + 60)}` } }, half);
  assert.equal(mis.status, 503);
  assert.equal(mis.nexted, false);
  assert.equal(mis.warns.length, 0);

  for (const env of [{ ENVIRONMENT: "PROD" }, {}] as NodeJS.ProcessEnv[]) {
    const r = runGate({ ...PAGE, headers: { authorization: basic("qa", "s3cret-pass") } }, { ...STAGING, ...env, ENVIRONMENT: env.ENVIRONMENT });
    assert.equal(r.nexted, true);
    assert.equal(r.cookies.length, 0);
    assert.equal(r.headers["x-robots-tag"], undefined);
    assert.equal(r.warns.length, 0);
  }
});

test("SC8 rotating the password invalidates every cookie the old one signed", () => {
  const minted = signStagingGateCookie("s3cret-pass", NOW + 600);
  const rotated = { ...STAGING, STAGING_BASIC_AUTH_PASSWORD: "new-pass" } as NodeJS.ProcessEnv;
  assert.equal(stagingAccessDecision({ ...PAGE, cookie: `stg_gate=${minted}` }, STAGING, NOW), "pass");
  assert.equal(stagingAccessDecision({ ...PAGE, cookie: `stg_gate=${minted}` }, rotated, NOW), "challenge");
});
