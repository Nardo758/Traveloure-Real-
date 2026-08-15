/**
 * admin-test-email.test.ts
 *
 * Integration tests for POST /api/admin/system/test-email.
 *
 * Strategy:
 * – Env vars (STRIPE_SECRET_KEY, DATABASE_URL) are set before any module that
 *   validates them at import time (Stripe service checks the key at module
 *   evaluation; setting it beforehand prevents the startup throw).
 * – db and adminRouter are loaded via dynamic `await import()` so the env is
 *   already in place when those modules initialise.
 * – db.select is monkey-patched so getFullAdminUser returns controlled data
 *   without touching the real database.
 * – _adminTestEmailHooks.resendSend is set per-test to intercept the Resend
 *   call without touching the real API (same seam pattern as _emailTestHooks
 *   in email.service.ts).
 * – process.env.RESEND_API_KEY / EMAIL_FROM are set / cleared per-test.
 *
 * Run with: npx tsx --test server/routes/__tests__/admin-test-email.test.ts
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";

// ── env bootstrap — must come before any import that reads these at init time ──
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy_admin_test_email";
}

// ── dynamic imports so env is already set when modules evaluate ───────────────
const { db } = await import("../../db.js");
const { default: adminRouter, _adminTestEmailHooks } = await import("../admin.routes.js");

// ── helpers ────────────────────────────────────────────────────────────────────

/** Chainable thenable drizzle-orm mock that resolves to `value`. */
function makeChain(value: unknown = null): any {
  const chain: any = {};
  const p = Promise.resolve(value);
  for (const m of ["from", "where", "set", "values", "limit", "orderBy", "returning"]) {
    chain[m] = (..._: unknown[]) => chain;
  }
  chain.then = (resolve: any, reject?: any) => p.then(resolve, reject);
  chain.catch = (reject: any) => p.catch(reject);
  chain[Symbol.toStringTag] = "Promise";
  return chain;
}

/** Find the real handler (last in stack) for POST /api/admin/system/test-email. */
function getHandler(): (req: any, res: any, next: any) => Promise<void> {
  const targetPath = "/api/admin/system/test-email";
  const layer = (adminRouter as any).stack.find(
    (l: any) => l.route?.path === targetPath && l.route?.methods?.post,
  );
  assert.ok(layer, `Could not find POST ${targetPath} in adminRouter`);
  const handlers: any[] = layer.route.stack;
  // handlers[0] = isAuthenticated middleware, handlers[last] = real handler
  return handlers[handlers.length - 1].handle;
}

/** Minimal mock req for a logged-in user (passport/email-auth shape). */
function makeReq(userId: string | null = "admin-1"): any {
  return {
    user: userId ? { id: userId } : undefined,
    isAuthenticated: () => Boolean(userId),
    body: {},
    params: {},
  };
}

/** Minimal mock res that captures status + body. */
function makeRes() {
  const captured = { status: 200, body: null as any };
  const res = {
    status(code: number) {
      captured.status = code;
      return { json(data: any) { captured.body = data; } };
    },
    json(data: any) { captured.body = data; },
  };
  return { captured, res };
}

// ── fixtures ───────────────────────────────────────────────────────────────────

const FAKE_ADMIN = {
  id: "admin-1",
  role: "admin",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
};

// ── saved originals ────────────────────────────────────────────────────────────

let origDbSelect: typeof db.select;
let savedResendApiKey: string | undefined;
let savedEmailFrom: string | undefined;
let savedEmailFromNoreply: string | undefined;

before(() => {
  origDbSelect = db.select.bind(db);
  savedResendApiKey     = process.env.RESEND_API_KEY;
  savedEmailFrom        = process.env.EMAIL_FROM;
  savedEmailFromNoreply = process.env.EMAIL_FROM_NOREPLY;
});

after(() => {
  (db as any).select = origDbSelect;
  delete _adminTestEmailHooks.resendSend;

  const restore = (key: string, saved: string | undefined) => {
    if (saved !== undefined) { process.env[key] = saved; } else { delete process.env[key]; }
  };
  restore("RESEND_API_KEY",     savedResendApiKey);
  restore("EMAIL_FROM",         savedEmailFrom);
  restore("EMAIL_FROM_NOREPLY", savedEmailFromNoreply);
});

afterEach(() => {
  (db as any).select = origDbSelect;
  delete _adminTestEmailHooks.resendSend;
});

/** Set email-related env vars for one test. Omit a key to delete it. */
function setEmailEnv(opts: { apiKey?: string; from?: string; fromNoreply?: string } = {}) {
  if (opts.apiKey !== undefined)      { process.env.RESEND_API_KEY     = opts.apiKey; }
  else                                { delete process.env.RESEND_API_KEY; }
  if (opts.from !== undefined)        { process.env.EMAIL_FROM         = opts.from; }
  else                                { delete process.env.EMAIL_FROM; }
  if (opts.fromNoreply !== undefined) { process.env.EMAIL_FROM_NOREPLY = opts.fromNoreply; }
  else                                { delete process.env.EMAIL_FROM_NOREPLY; }
}

// ── 1. Auth / admin gate ───────────────────────────────────────────────────────

describe("POST /api/admin/system/test-email — auth & admin gate", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();
    await handler(makeReq(null), res, () => {});
    assert.equal(captured.status, 401);
  });

  it("returns 403 when user exists but is not admin", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([{ ...FAKE_ADMIN, role: "user" }]);
    setEmailEnv({ apiKey: "re_test", from: "noreply@example.com" });

    await handler(makeReq("user-1"), res, () => {});

    assert.equal(captured.status, 403);
    assert.ok(
      String(captured.body?.message ?? "").toLowerCase().includes("admin"),
      `Expected 'admin' in message, got: ${JSON.stringify(captured.body)}`,
    );
  });

  it("returns 403 when getFullAdminUser returns null (user not found)", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([]);
    setEmailEnv({ apiKey: "re_test", from: "noreply@example.com" });

    await handler(makeReq("ghost-user"), res, () => {});

    assert.equal(captured.status, 403);
  });
});

// ── 2. Configuration guards ────────────────────────────────────────────────────

describe("POST /api/admin/system/test-email — configuration guards", () => {
  it("returns 400 when admin account has no email address", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([{ ...FAKE_ADMIN, email: null }]);
    setEmailEnv({ apiKey: "re_test", from: "noreply@example.com" });

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 400);
    assert.equal(captured.body?.ok, false);
    assert.ok(
      String(captured.body?.error ?? "").toLowerCase().includes("email"),
      `Expected email-related error, got: ${JSON.stringify(captured.body)}`,
    );
  });

  it("returns 502 when RESEND_API_KEY is not set", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ from: "noreply@example.com" }); // no apiKey

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 502);
    assert.equal(captured.body?.ok, false);
    assert.ok(
      String(captured.body?.error ?? "").includes("RESEND_API_KEY"),
      `Expected RESEND_API_KEY in error, got: ${JSON.stringify(captured.body)}`,
    );
  });

  it("returns 502 when EMAIL_FROM is not set", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test" }); // no from

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 502);
    assert.equal(captured.body?.ok, false);
    assert.ok(
      String(captured.body?.error ?? "").includes("EMAIL_FROM"),
      `Expected EMAIL_FROM in error, got: ${JSON.stringify(captured.body)}`,
    );
  });
});

// ── 3. Resend integration (via _adminTestEmailHooks seam) ─────────────────────

describe("POST /api/admin/system/test-email — Resend integration", () => {
  it("returns { ok: true, id, to } when Resend succeeds", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });
    _adminTestEmailHooks.resendSend = async () => ({ data: { id: "msg_abc123" }, error: null });

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 200);
    assert.equal(captured.body?.ok,  true);
    assert.equal(captured.body?.id,  "msg_abc123");
    assert.equal(captured.body?.to,  FAKE_ADMIN.email);
  });

  it("returns { ok: true, to } when Resend returns no message id", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });
    _adminTestEmailHooks.resendSend = async () => ({ data: null, error: null });

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 200);
    assert.equal(captured.body?.ok, true);
    assert.equal(captured.body?.to, FAKE_ADMIN.email);
  });

  it("returns 502 { ok: false, error } when Resend returns an API error", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });
    _adminTestEmailHooks.resendSend = async () => ({
      data: null,
      error: { message: "Invalid API key" },
    });

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 502);
    assert.equal(captured.body?.ok, false);
    assert.ok(
      String(captured.body?.error ?? "").includes("Invalid API key"),
      `Expected Resend error message, got: ${JSON.stringify(captured.body)}`,
    );
  });

  it("sends to the admin's own email address (not a hardcoded value)", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    const customAdmin = { ...FAKE_ADMIN, email: "cto@myplatform.io" };
    (db as any).select = () => makeChain([customAdmin]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });

    const capturedPayloads: any[] = [];
    _adminTestEmailHooks.resendSend = async (payload) => {
      capturedPayloads.push(payload);
      return { data: { id: "msg_xyz" }, error: null };
    };

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 200);
    assert.equal(capturedPayloads.length, 1, "resendSend must be called exactly once");
    assert.equal(capturedPayloads[0].to, "cto@myplatform.io");
    assert.equal(captured.body?.to,       "cto@myplatform.io");
  });

  it("prefers EMAIL_FROM_NOREPLY over EMAIL_FROM as the sender", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({
      apiKey:      "re_test_key",
      from:        "general@example.com",
      fromNoreply: "noreply-specific@example.com",
    });

    const capturedPayloads: any[] = [];
    _adminTestEmailHooks.resendSend = async (payload) => {
      capturedPayloads.push(payload);
      return { data: { id: "msg_noreply" }, error: null };
    };

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 200);
    assert.equal(capturedPayloads.length, 1);
    assert.equal(
      capturedPayloads[0].from,
      "noreply-specific@example.com",
      "Should prefer EMAIL_FROM_NOREPLY over EMAIL_FROM",
    );
  });
});

// ── 4. Resend timeout ─────────────────────────────────────────────────────────

describe("POST /api/admin/system/test-email — Resend timeout", () => {
  it("returns 504 { ok: false, error } when Resend does not respond within the timeout", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });

    // Hook: a promise that never resolves, simulating a hung Resend API.
    _adminTestEmailHooks.resendSend = () => new Promise(() => {/* intentionally hangs */});
    // Use a very short timeout so the test completes quickly.
    _adminTestEmailHooks.resendTimeoutMs = 50;

    await handler(makeReq("admin-1"), res, () => {});

    assert.equal(captured.status, 504, `Expected 504, got ${captured.status}`);
    assert.equal(captured.body?.ok, false, "ok must be false on timeout");
    assert.ok(
      typeof captured.body?.error === "string" && captured.body.error.length > 0,
      `Expected a non-empty error string, got: ${JSON.stringify(captured.body)}`,
    );
  });

  afterEach(() => {
    delete _adminTestEmailHooks.resendTimeoutMs;
  });
});

// ── 5. Client UI contract (narrow static checks) ───────────────────────────────

describe("admin/system.tsx — test email UI contract", () => {
  const clientPath = new URL(
    "../../../client/src/pages/admin/system.tsx",
    import.meta.url,
  ).pathname;

  let src: string;
  before(async () => {
    const { readFileSync } = await import("node:fs");
    src = readFileSync(clientPath, "utf-8");
  });

  it("mutation POSTs to /api/admin/system/test-email", () => {
    assert.ok(
      src.includes('"/api/admin/system/test-email"'),
      "sendTestEmail mutation must target /api/admin/system/test-email",
    );
  });

  it("send button has data-testid='button-send-test-email'", () => {
    assert.ok(
      src.includes('data-testid="button-send-test-email"'),
      "Button must have data-testid='button-send-test-email' for automation",
    );
  });

  it("result banner has data-testid='test-email-result'", () => {
    assert.ok(
      src.includes('data-testid="test-email-result"'),
      "Result banner must have data-testid='test-email-result'",
    );
  });

  it("success branch reads ok field and displays recipient address", () => {
    assert.ok(
      src.includes("testEmailResult.ok") && src.includes("testEmailResult.to"),
      "Success branch must reference testEmailResult.ok and display testEmailResult.to",
    );
  });

  it("failure branch displays error string from server", () => {
    assert.ok(
      src.includes("testEmailResult.error"),
      "Failure branch must render testEmailResult.error",
    );
  });

  it("result is reset to null before each new send", () => {
    assert.ok(
      src.includes("setTestEmailResult(null)"),
      "onClick must call setTestEmailResult(null) before triggering the mutation",
    );
  });

  it("input field for custom recipient has data-testid='input-test-email-to'", () => {
    assert.ok(
      src.includes('data-testid="input-test-email-to"'),
      "The 'to' input must have data-testid='input-test-email-to' for automation",
    );
  });

  it("mutation body sends 'to' when the field has a value", () => {
    assert.ok(
      src.includes("testEmailTo.trim()") && src.includes("{ to: testEmailTo.trim() }"),
      "mutationFn must include { to: testEmailTo.trim() } in the request body when the field is non-empty",
    );
  });

  it("mutationFn races the fetch against a client-side timeout", () => {
    assert.ok(
      src.includes("Promise.race"),
      "mutationFn must use Promise.race to enforce a client-side timeout",
    );
    assert.ok(
      src.includes("SEND_TIMEOUT_MS") || src.includes("15_000") || src.includes("15000"),
      "mutationFn must define a numeric timeout constant (15 s)",
    );
  });
});

// ── 5. Custom recipient address ────────────────────────────────────────────────

describe("POST /api/admin/system/test-email — custom 'to' address", () => {
  it("sends to the custom address when a valid 'to' is supplied in the body", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });

    const capturedPayloads: any[] = [];
    _adminTestEmailHooks.resendSend = async (payload) => {
      capturedPayloads.push(payload);
      return { data: { id: "msg_custom" }, error: null };
    };

    const req = makeReq("admin-1");
    req.body = { to: "ops-inbox@company.org" };

    await handler(req, res, () => {});

    assert.equal(captured.status, 200);
    assert.equal(captured.body?.ok, true);
    assert.equal(captured.body?.to, "ops-inbox@company.org", "Response 'to' must reflect the custom address");
    assert.equal(capturedPayloads.length, 1, "resendSend must be called exactly once");
    assert.equal(capturedPayloads[0].to, "ops-inbox@company.org", "Email must be sent to the custom address");
  });

  it("falls back to admin email when 'to' is an empty string", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });

    const capturedPayloads: any[] = [];
    _adminTestEmailHooks.resendSend = async (payload) => {
      capturedPayloads.push(payload);
      return { data: { id: "msg_fallback" }, error: null };
    };

    const req = makeReq("admin-1");
    req.body = { to: "" };

    await handler(req, res, () => {});

    assert.equal(captured.status, 200);
    assert.equal(captured.body?.to, FAKE_ADMIN.email, "Should fall back to admin's own email");
    assert.equal(capturedPayloads[0].to, FAKE_ADMIN.email);
  });

  it("falls back to admin email when 'to' is whitespace only", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });

    _adminTestEmailHooks.resendSend = async () => ({ data: { id: "msg_ws" }, error: null });

    const req = makeReq("admin-1");
    req.body = { to: "   " };

    await handler(req, res, () => {});

    assert.equal(captured.status, 200);
    assert.equal(captured.body?.to, FAKE_ADMIN.email);
  });

  it("returns 400 when 'to' is supplied but not a valid email format", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });

    const req = makeReq("admin-1");
    req.body = { to: "not-an-email" };

    await handler(req, res, () => {});

    assert.equal(captured.status, 400);
    assert.equal(captured.body?.ok, false);
    assert.ok(
      String(captured.body?.error ?? "").toLowerCase().includes("email"),
      `Expected email-related error, got: ${JSON.stringify(captured.body)}`,
    );
  });

  it("returns 400 for an address missing the domain part", async () => {
    const handler = getHandler();
    const { captured, res } = makeRes();

    (db as any).select = () => makeChain([FAKE_ADMIN]);
    setEmailEnv({ apiKey: "re_test_key", from: "noreply@example.com" });

    const req = makeReq("admin-1");
    req.body = { to: "user@" };

    await handler(req, res, () => {});

    assert.equal(captured.status, 400);
    assert.equal(captured.body?.ok, false);
  });
});
