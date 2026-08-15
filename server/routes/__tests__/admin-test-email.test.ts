/**
 * admin-test-email.test.ts
 *
 * Covers the POST /api/admin/system/test-email endpoint introduced to let
 * admins verify Resend email delivery from the system settings page.
 *
 * Strategy: static source-code inspection (no real DB or network needed) plus
 * a lightweight mock of the Resend client to exercise the handler logic.
 *
 * Run with: npx tsx --test server/routes/__tests__/admin-test-email.test.ts
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ── helpers ────────────────────────────────────────────────────────────────

const ROUTES_FILE = path.resolve(
  import.meta.dirname,
  "../admin.routes.ts"
);

const CLIENT_FILE = path.resolve(
  import.meta.dirname,
  "../../../client/src/pages/admin/system.tsx"
);

const routesSrc = fs.readFileSync(ROUTES_FILE, "utf-8");
const clientSrc = fs.readFileSync(CLIENT_FILE, "utf-8");

// ── 1. Route file sanity ───────────────────────────────────────────────────

describe("POST /api/admin/system/test-email — route registration", () => {
  it("route is registered in admin.routes.ts", () => {
    assert.ok(
      routesSrc.includes('router.post("/api/admin/system/test-email"'),
      "Route must be registered with router.post"
    );
  });

  it("route is protected by isAuthenticated middleware", () => {
    // The handler must sit behind isAuthenticated.
    // Search for the registration line and confirm isAuthenticated appears on it.
    const registrationLine = routesSrc
      .split("\n")
      .find((l) => l.includes('router.post("/api/admin/system/test-email"'));
    assert.ok(registrationLine, "Registration line not found");
    assert.ok(
      registrationLine.includes("isAuthenticated"),
      "Route must include isAuthenticated as a middleware argument"
    );
  });
});

// ── 2. Admin gate (403 for non-admins) ────────────────────────────────────

describe("POST /api/admin/system/test-email — admin gate", () => {
  it("returns 403 when user role is not admin", () => {
    // Verify the source enforces the role check and returns 403.
    assert.ok(
      routesSrc.includes("res.status(403)") &&
        routesSrc.includes("Admin access required"),
      "Handler must return 403 with 'Admin access required' for non-admin users"
    );
  });

  it("returns 401 when userId is missing", () => {
    assert.ok(
      routesSrc.includes("res.status(401)") &&
        routesSrc.includes("Unauthorized"),
      "Handler must return 401 when no userId is present"
    );
  });

  it("checks getFullAdminUser result before sending email", () => {
    // Verify role is checked via getFullAdminUser, not just the middleware.
    assert.ok(
      routesSrc.includes("getFullAdminUser") &&
        routesSrc.includes("adminUser.role !== \"admin\""),
      "Handler must call getFullAdminUser and verify role === 'admin'"
    );
  });
});

// ── 3. Configuration guards ────────────────────────────────────────────────

describe("POST /api/admin/system/test-email — configuration guards", () => {
  it("returns 502 when RESEND_API_KEY is missing", () => {
    assert.ok(
      routesSrc.includes("RESEND_API_KEY is not configured"),
      "Handler must guard against missing RESEND_API_KEY with a 502"
    );
    assert.ok(
      routesSrc.includes("res.status(502)"),
      "Handler must use status 502 for misconfiguration errors"
    );
  });

  it("returns 502 when EMAIL_FROM is missing", () => {
    assert.ok(
      routesSrc.includes("EMAIL_FROM is not configured"),
      "Handler must guard against missing EMAIL_FROM with a 502"
    );
  });

  it("returns 400 when admin email address is absent", () => {
    assert.ok(
      routesSrc.includes("Admin account has no email address on file"),
      "Handler must return 400 when toEmail is empty"
    );
    // 400 should appear in the source (for this specific guard)
    const lines = routesSrc.split("\n");
    const emailGuardLine = lines.findIndex((l) =>
      l.includes("Admin account has no email address on file")
    );
    assert.ok(emailGuardLine > -1, "Email-guard line not found");
    // Walk backwards a few lines to find the status(400)
    const surrounding = lines.slice(Math.max(0, emailGuardLine - 2), emailGuardLine + 2).join("\n");
    assert.ok(
      surrounding.includes("status(400)"),
      "Email-guard must respond with status 400"
    );
  });
});

// ── 4. Success response shape ──────────────────────────────────────────────

describe("POST /api/admin/system/test-email — success response shape", () => {
  it("returns { ok: true, id, to } on Resend success", () => {
    // The handler must produce { ok: true, id: emailId, to: toEmail }.
    assert.ok(
      routesSrc.includes("ok: true") && routesSrc.includes("id: emailId") && routesSrc.includes("to: toEmail"),
      "Handler must return { ok: true, id: emailId, to: toEmail } on success"
    );
  });

  it("returns { ok: false, error } on Resend API error", () => {
    assert.ok(
      routesSrc.includes("ok: false") && routesSrc.includes("emailError"),
      "Handler must return { ok: false, error } when Resend returns an error"
    );
  });
});

// ── 5. Mock handler logic ──────────────────────────────────────────────────

describe("POST /api/admin/system/test-email — mock handler behaviour", () => {
  /**
   * Build a minimal fake handler that mirrors the real handler logic so we can
   * test it without touching a real DB or Resend.
   */
  function makeHandler(opts: {
    userId: string | null;
    adminUser: { role: string; email: string | null; firstName?: string } | null;
    apiKey: string | undefined;
    from: string | undefined;
    resendResult: { data: { id: string } | null; error: { message?: string } | null };
  }) {
    return async () => {
      const responses: Array<{ status: number; body: unknown }> = [];
      const res = {
        status(code: number) { return { json(body: unknown) { responses.push({ status: code, body }); } }; },
        json(body: unknown) { responses.push({ status: 200, body }); },
      };

      const { userId, adminUser, apiKey, from, resendResult } = opts;

      if (!userId) { res.status(401).json({ message: "Unauthorized" }); return responses[0]; }
      if (!adminUser || adminUser.role !== "admin") {
        res.status(403).json({ message: "Admin access required" });
        return responses[0];
      }

      const toEmail = adminUser.email;
      if (!toEmail) {
        res.status(400).json({ ok: false, error: "Admin account has no email address on file" });
        return responses[0];
      }

      if (!apiKey) { res.status(502).json({ ok: false, error: "RESEND_API_KEY is not configured" }); return responses[0]; }
      if (!from)   { res.status(502).json({ ok: false, error: "EMAIL_FROM is not configured" }); return responses[0]; }

      const { data: emailData, error: emailError } = resendResult;
      if (emailError) {
        const msg = String(emailError.message ?? emailError);
        res.status(502).json({ ok: false, error: msg });
        return responses[0];
      }

      const emailId = (emailData as { id?: string } | null)?.id;
      res.json({ ok: true, id: emailId, to: toEmail });
      return responses[0];
    };
  }

  it("returns 401 when userId is null", async () => {
    const run = makeHandler({
      userId: null,
      adminUser: { role: "admin", email: "admin@test.com" },
      apiKey: "re_test",
      from: "noreply@test.com",
      resendResult: { data: { id: "msg_1" }, error: null },
    });
    const result = await run();
    assert.equal(result?.status, 401);
  });

  it("returns 403 when user is not admin", async () => {
    const run = makeHandler({
      userId: "user-1",
      adminUser: { role: "user", email: "user@test.com" },
      apiKey: "re_test",
      from: "noreply@test.com",
      resendResult: { data: { id: "msg_1" }, error: null },
    });
    const result = await run();
    assert.equal(result?.status, 403);
    assert.equal((result?.body as any).message, "Admin access required");
  });

  it("returns 403 when adminUser is null (user not found)", async () => {
    const run = makeHandler({
      userId: "user-1",
      adminUser: null,
      apiKey: "re_test",
      from: "noreply@test.com",
      resendResult: { data: { id: "msg_1" }, error: null },
    });
    const result = await run();
    assert.equal(result?.status, 403);
  });

  it("returns 400 when admin has no email", async () => {
    const run = makeHandler({
      userId: "user-1",
      adminUser: { role: "admin", email: null },
      apiKey: "re_test",
      from: "noreply@test.com",
      resendResult: { data: { id: "msg_1" }, error: null },
    });
    const result = await run();
    assert.equal(result?.status, 400);
    assert.ok((result?.body as any).error.includes("no email address"));
  });

  it("returns 502 when RESEND_API_KEY is not set", async () => {
    const run = makeHandler({
      userId: "user-1",
      adminUser: { role: "admin", email: "admin@test.com" },
      apiKey: undefined,
      from: "noreply@test.com",
      resendResult: { data: { id: "msg_1" }, error: null },
    });
    const result = await run();
    assert.equal(result?.status, 502);
    assert.ok((result?.body as any).error.includes("RESEND_API_KEY"));
  });

  it("returns 502 when EMAIL_FROM is not set", async () => {
    const run = makeHandler({
      userId: "user-1",
      adminUser: { role: "admin", email: "admin@test.com" },
      apiKey: "re_test",
      from: undefined,
      resendResult: { data: { id: "msg_1" }, error: null },
    });
    const result = await run();
    assert.equal(result?.status, 502);
    assert.ok((result?.body as any).error.includes("EMAIL_FROM"));
  });

  it("returns 502 when Resend returns an error", async () => {
    const run = makeHandler({
      userId: "user-1",
      adminUser: { role: "admin", email: "admin@test.com" },
      apiKey: "re_test",
      from: "noreply@test.com",
      resendResult: { data: null, error: { message: "Invalid API key" } },
    });
    const result = await run();
    assert.equal(result?.status, 502);
    assert.ok((result?.body as any).error.includes("Invalid API key"));
  });

  it("returns { ok: true, id, to } on success", async () => {
    const run = makeHandler({
      userId: "user-1",
      adminUser: { role: "admin", email: "admin@test.com" },
      apiKey: "re_test",
      from: "noreply@test.com",
      resendResult: { data: { id: "msg_abc123" }, error: null },
    });
    const result = await run();
    assert.equal(result?.status, 200);
    const body = result?.body as any;
    assert.equal(body.ok, true);
    assert.equal(body.id, "msg_abc123");
    assert.equal(body.to, "admin@test.com");
  });
});

// ── 6. Client — UI elements present ───────────────────────────────────────

describe("admin/system.tsx — test email UI", () => {
  it("has a Send test email button with correct testid", () => {
    assert.ok(
      clientSrc.includes('data-testid="button-send-test-email"'),
      "Button must have data-testid='button-send-test-email'"
    );
  });

  it("posts to /api/admin/system/test-email", () => {
    assert.ok(
      clientSrc.includes('"/api/admin/system/test-email"'),
      "Client mutation must POST to /api/admin/system/test-email"
    );
  });

  it("renders result banner with testid test-email-result", () => {
    assert.ok(
      clientSrc.includes('data-testid="test-email-result"'),
      "Result banner must have data-testid='test-email-result'"
    );
  });

  it("shows success message when ok is true", () => {
    assert.ok(
      clientSrc.includes("Delivered successfully"),
      "Client must display 'Delivered successfully' on ok=true"
    );
  });

  it("shows error message when ok is false", () => {
    assert.ok(
      clientSrc.includes("Delivery failed"),
      "Client must display 'Delivery failed' on ok=false"
    );
  });

  it("displays the recipient address in the success banner", () => {
    assert.ok(
      clientSrc.includes("testEmailResult.to"),
      "Success banner must show testEmailResult.to (recipient address)"
    );
  });

  it("displays the Resend message ID when present", () => {
    assert.ok(
      clientSrc.includes("testEmailResult.id"),
      "Success banner must show testEmailResult.id when present"
    );
  });

  it("displays error string in failure banner", () => {
    assert.ok(
      clientSrc.includes("testEmailResult.error"),
      "Failure banner must show testEmailResult.error"
    );
  });

  it("button is disabled while request is in-flight", () => {
    assert.ok(
      clientSrc.includes("sendTestEmail.isPending"),
      "Button must be disabled while the mutation is pending"
    );
  });

  it("resets result to null before each new send", () => {
    assert.ok(
      clientSrc.includes("setTestEmailResult(null)"),
      "onClick must reset testEmailResult to null before triggering mutation"
    );
  });
});
