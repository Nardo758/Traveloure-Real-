/**
 * instagram-status.test.ts
 *
 * Tests for the resolveInstagramVerifyStatus helper exported from
 * server/routes/instagram.ts, which drives the GET /api/instagram/status
 * response. This function is the single source of truth for how a Graph API
 * response is mapped to the connected/disconnected payload — the route handler
 * delegates entirely to it.
 *
 * Three key scenarios (per task spec):
 *   1. Valid Business/Creator token   → { connected: true, accountType }
 *   2. Expired/revoked token (190)    → { connected: false, reason: "token_expired" }
 *   3. Personal account               → { connected: false, reason: "personal_account" }
 *
 * Run with: npx tsx --test server/routes/__tests__/instagram-status.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Set DATABASE_URL before importing the route module so the db import
// doesn't throw at module init time (no real connection is made here).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

// Import the real exported helper from the production route file.
const { resolveInstagramVerifyStatus } = await import("../instagram.js");

// ── Suite 1: connected Business / Creator account ─────────────────────────────

describe("resolveInstagramVerifyStatus — connected Business account", () => {
  it("returns connected:true with accountType for a valid BUSINESS token", () => {
    const result = resolveInstagramVerifyStatus(true, {
      id: "123",
      account_type: "BUSINESS",
    });
    assert.deepEqual(result, { connected: true, accountType: "BUSINESS" });
  });

  it("returns connected:true with accountType for a valid CREATOR token", () => {
    const result = resolveInstagramVerifyStatus(true, {
      id: "456",
      account_type: "CREATOR",
    });
    assert.deepEqual(result, { connected: true, accountType: "CREATOR" });
  });
});

// ── Suite 2: expired / revoked token ─────────────────────────────────────────

describe("resolveInstagramVerifyStatus — expired / revoked token", () => {
  it("maps OAuthException code 190 (HTTP 400) to token_expired", () => {
    const result = resolveInstagramVerifyStatus(false, {
      error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." },
    });
    assert.equal(result.connected, false);
    assert.equal(result.reason, "token_expired");
  });

  it("maps error code 102 to token_expired", () => {
    const result = resolveInstagramVerifyStatus(false, {
      error: { code: 102, type: "OAuthException", message: "Session key invalid." },
    });
    assert.equal(result.connected, false);
    assert.equal(result.reason, "token_expired");
  });

  it("maps error code 104 to token_expired", () => {
    const result = resolveInstagramVerifyStatus(false, {
      error: { code: 104, type: "OAuthException", message: "Incorrect signature." },
    });
    assert.equal(result.connected, false);
    assert.equal(result.reason, "token_expired");
  });

  it("maps a 200-ok response body with embedded error code 190 to token_expired", () => {
    // Graph API occasionally returns HTTP 200 with an error body
    const result = resolveInstagramVerifyStatus(true, {
      error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." },
    });
    assert.equal(result.connected, false);
    assert.equal(result.reason, "token_expired");
  });

  it("maps an unknown error code to auth_error (not token_expired)", () => {
    const result = resolveInstagramVerifyStatus(false, {
      error: { code: 200, type: "OAuthException", message: "Permission denied." },
    });
    assert.equal(result.connected, false);
    assert.equal(result.reason, "auth_error");
  });

  it("maps a non-expiry HTTP error with no code to auth_error", () => {
    const result = resolveInstagramVerifyStatus(false, {
      error: { message: "Unknown error" },
    });
    assert.equal(result.connected, false);
    assert.equal(result.reason, "auth_error");
  });
});

// ── Suite 3: personal account ─────────────────────────────────────────────────

describe("resolveInstagramVerifyStatus — personal account", () => {
  it("returns personal_account when account_type is PERSONAL", () => {
    const result = resolveInstagramVerifyStatus(true, {
      id: "789",
      account_type: "PERSONAL",
    });
    assert.equal(result.connected, false);
    assert.equal(result.reason, "personal_account");
  });

  it("does not leak accountType into the disconnected personal_account payload", () => {
    const result = resolveInstagramVerifyStatus(true, {
      id: "789",
      account_type: "PERSONAL",
    });
    // accountType must not be present (or must not be "PERSONAL") — the caller
    // should not treat a personal account as a connected account type.
    assert.ok(
      !("accountType" in result) || result.accountType === "",
      "accountType must not appear in a personal_account disconnected payload",
    );
  });
});

// ── Suite 4: full scenario integration ────────────────────────────────────────

describe("resolveInstagramVerifyStatus — scenario matrix", () => {
  type Scenario = {
    label: string;
    verifyOk: boolean;
    body: Record<string, unknown>;
    expectConnected: boolean;
    expectReason?: string;
    expectAccountType?: string;
  };

  const scenarios: Scenario[] = [
    {
      label: "valid BUSINESS token",
      verifyOk: true,
      body: { id: "1", account_type: "BUSINESS" },
      expectConnected: true,
      expectAccountType: "BUSINESS",
    },
    {
      label: "valid CREATOR token",
      verifyOk: true,
      body: { id: "2", account_type: "CREATOR" },
      expectConnected: true,
      expectAccountType: "CREATOR",
    },
    {
      label: "expired token — code 190",
      verifyOk: false,
      body: { error: { code: 190, message: "Invalid OAuth access token" } },
      expectConnected: false,
      expectReason: "token_expired",
    },
    {
      label: "expired token — code 102",
      verifyOk: false,
      body: { error: { code: 102, message: "Session key invalid" } },
      expectConnected: false,
      expectReason: "token_expired",
    },
    {
      label: "expired token — code 104",
      verifyOk: false,
      body: { error: { code: 104, message: "Incorrect signature" } },
      expectConnected: false,
      expectReason: "token_expired",
    },
    {
      label: "permission error — non-expiry code",
      verifyOk: false,
      body: { error: { code: 200, message: "Permission denied" } },
      expectConnected: false,
      expectReason: "auth_error",
    },
    {
      label: "personal account",
      verifyOk: true,
      body: { id: "3", account_type: "PERSONAL" },
      expectConnected: false,
      expectReason: "personal_account",
    },
  ];

  for (const s of scenarios) {
    it(s.label, () => {
      const result = resolveInstagramVerifyStatus(s.verifyOk, s.body);
      assert.equal(result.connected, s.expectConnected, `connected mismatch for "${s.label}"`);
      if (s.expectReason !== undefined) {
        assert.equal(result.reason, s.expectReason, `reason mismatch for "${s.label}"`);
      }
      if (s.expectAccountType !== undefined) {
        assert.equal(result.accountType, s.expectAccountType, `accountType mismatch for "${s.label}"`);
      }
    });
  }
});
