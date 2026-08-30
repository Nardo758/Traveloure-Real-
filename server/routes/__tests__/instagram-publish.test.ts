/**
 * instagram-publish.test.ts
 *
 * Tests for the resolveInstagramPublishTokenError helper exported from
 * server/routes/instagram.ts, which gates POST /api/instagram/publish.
 *
 * The publish endpoint calls this helper after reading the stored token from
 * the DB. If the token is expired or the account is disconnected, the helper
 * returns a structured error payload that the route returns directly — so the
 * client always receives a { error, reason } JSON body instead of a raw Graph
 * API error message.
 *
 * Key scenarios:
 *   1. Valid Business/Creator token   → null (proceed with publish)
 *   2. Expired token (code 190/102/104) → 401 { error: "...", reason: "token_expired" }
 *   3. Personal account               → 403 { error: "...", reason: "personal_account" }
 *   4. Generic auth error             → 401 { error: "...", reason: "auth_error" }
 *
 * Run with: npx tsx --test server/routes/__tests__/instagram-publish.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Stub DATABASE_URL so the db module doesn't throw at import time.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}

const { resolveInstagramPublishTokenError } = await import("../instagram.js");

// ── Suite 1: valid tokens → null (publish allowed) ───────────────────────────

describe("resolveInstagramPublishTokenError — valid token (publish allowed)", () => {
  it("returns null for a valid BUSINESS token", () => {
    const result = resolveInstagramPublishTokenError(true, {
      id: "123",
      account_type: "BUSINESS",
    });
    assert.equal(result, null, "Expected null (proceed) for a valid BUSINESS token");
  });

  it("returns null for a valid CREATOR token", () => {
    const result = resolveInstagramPublishTokenError(true, {
      id: "456",
      account_type: "CREATOR",
    });
    assert.equal(result, null, "Expected null (proceed) for a valid CREATOR token");
  });
});

// ── Suite 2: expired / revoked token → 401 token_expired ─────────────────────

describe("resolveInstagramPublishTokenError — expired token (publish blocked)", () => {
  it("blocks publish with 401 + token_expired for OAuthException code 190", () => {
    const result = resolveInstagramPublishTokenError(false, {
      error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." },
    });
    assert.notEqual(result, null);
    assert.equal(result!.statusCode, 401);
    assert.equal(result!.body.reason, "token_expired");
    // Message must be user-friendly — not a raw Graph API error string.
    assert.ok(
      result!.body.error.toLowerCase().includes("reconnect"),
      `Expected reconnect prompt in error message, got: "${result!.body.error}"`,
    );
  });

  it("blocks publish with 401 + token_expired for session-expired code 102", () => {
    const result = resolveInstagramPublishTokenError(false, {
      error: { code: 102, type: "OAuthException", message: "Session key invalid or no longer valid." },
    });
    assert.notEqual(result, null);
    assert.equal(result!.statusCode, 401);
    assert.equal(result!.body.reason, "token_expired");
  });

  it("blocks publish with 401 + token_expired for session-expired code 104", () => {
    const result = resolveInstagramPublishTokenError(false, {
      error: { code: 104, type: "OAuthException", message: "Incorrect signature." },
    });
    assert.notEqual(result, null);
    assert.equal(result!.statusCode, 401);
    assert.equal(result!.body.reason, "token_expired");
  });

  it("blocks publish for HTTP-200 response body with embedded token_expired error (code 190)", () => {
    // Graph API occasionally returns HTTP 200 with an error body.
    const result = resolveInstagramPublishTokenError(true, {
      error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." },
    });
    assert.notEqual(result, null);
    assert.equal(result!.statusCode, 401);
    assert.equal(result!.body.reason, "token_expired");
  });
});

// ── Suite 3: personal account → 403 personal_account ─────────────────────────

describe("resolveInstagramPublishTokenError — personal account (publish blocked)", () => {
  it("blocks publish with 403 + personal_account reason", () => {
    const result = resolveInstagramPublishTokenError(true, {
      id: "789",
      account_type: "PERSONAL",
    });
    assert.notEqual(result, null);
    assert.equal(result!.statusCode, 403);
    assert.equal(result!.body.reason, "personal_account");
    // Must mention Business or Creator in the message.
    assert.ok(
      result!.body.error.toLowerCase().includes("business") ||
        result!.body.error.toLowerCase().includes("creator"),
      `Expected business/creator mention in error message, got: "${result!.body.error}"`,
    );
  });
});

// ── Suite 4: generic auth error → 401 auth_error ─────────────────────────────

describe("resolveInstagramPublishTokenError — generic auth error (publish blocked)", () => {
  it("blocks publish with 401 + auth_error for an unknown error code", () => {
    const result = resolveInstagramPublishTokenError(false, {
      error: { code: 200, type: "OAuthException", message: "Permission denied." },
    });
    assert.notEqual(result, null);
    assert.equal(result!.statusCode, 401);
    assert.equal(result!.body.reason, "auth_error");
  });

  it("blocks publish with 401 for an HTTP error with no error code", () => {
    const result = resolveInstagramPublishTokenError(false, {
      error: { message: "Unknown error" },
    });
    assert.notEqual(result, null);
    assert.equal(result!.statusCode, 401);
    // reason should be auth_error or similar — not undefined
    assert.ok(
      typeof result!.body.reason === "string" && result!.body.reason.length > 0,
      "reason must be a non-empty string",
    );
  });
});

// ── Suite 5: full scenario matrix ─────────────────────────────────────────────

describe("resolveInstagramPublishTokenError — full scenario matrix", () => {
  type Scenario = {
    label: string;
    verifyOk: boolean;
    body: Record<string, unknown>;
    expectNull: boolean; // true = proceed, false = blocked
    expectStatus?: number;
    expectReason?: string;
    expectReconnectPrompt?: boolean; // error message should prompt reconnection
  };

  const scenarios: Scenario[] = [
    {
      label: "valid BUSINESS token → publish allowed",
      verifyOk: true,
      body: { id: "1", account_type: "BUSINESS" },
      expectNull: true,
    },
    {
      label: "valid CREATOR token → publish allowed",
      verifyOk: true,
      body: { id: "2", account_type: "CREATOR" },
      expectNull: true,
    },
    {
      label: "expired token code 190 → blocked, token_expired, reconnect prompt",
      verifyOk: false,
      body: { error: { code: 190, message: "Invalid OAuth access token" } },
      expectNull: false,
      expectStatus: 401,
      expectReason: "token_expired",
      expectReconnectPrompt: true,
    },
    {
      label: "expired token code 102 → blocked, token_expired",
      verifyOk: false,
      body: { error: { code: 102, message: "Session key invalid" } },
      expectNull: false,
      expectStatus: 401,
      expectReason: "token_expired",
    },
    {
      label: "expired token code 104 → blocked, token_expired",
      verifyOk: false,
      body: { error: { code: 104, message: "Incorrect signature" } },
      expectNull: false,
      expectStatus: 401,
      expectReason: "token_expired",
    },
    {
      label: "personal account → blocked, personal_account, 403",
      verifyOk: true,
      body: { id: "3", account_type: "PERSONAL" },
      expectNull: false,
      expectStatus: 403,
      expectReason: "personal_account",
    },
    {
      label: "permission error (non-expiry code 200) → blocked, auth_error",
      verifyOk: false,
      body: { error: { code: 200, message: "Permission denied" } },
      expectNull: false,
      expectStatus: 401,
      expectReason: "auth_error",
    },
    {
      label: "HTTP-200 body with embedded code 190 → blocked, token_expired",
      verifyOk: true,
      body: { error: { code: 190, message: "Invalid OAuth access token" } },
      expectNull: false,
      expectStatus: 401,
      expectReason: "token_expired",
    },
  ];

  for (const s of scenarios) {
    it(s.label, () => {
      const result = resolveInstagramPublishTokenError(s.verifyOk, s.body);

      if (s.expectNull) {
        assert.equal(result, null, `Expected null (proceed) for "${s.label}"`);
        return;
      }

      assert.notEqual(result, null, `Expected error payload for "${s.label}"`);

      if (s.expectStatus !== undefined) {
        assert.equal(
          result!.statusCode,
          s.expectStatus,
          `statusCode mismatch for "${s.label}"`,
        );
      }
      if (s.expectReason !== undefined) {
        assert.equal(
          result!.body.reason,
          s.expectReason,
          `reason mismatch for "${s.label}"`,
        );
      }
      if (s.expectReconnectPrompt) {
        assert.ok(
          result!.body.error.toLowerCase().includes("reconnect"),
          `Expected reconnect prompt in error message for "${s.label}", got: "${result!.body.error}"`,
        );
      }
    });
  }
});
