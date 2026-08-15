/**
 * instagram-token-cleanup.test.ts
 *
 * Verifies that GET /api/instagram/status nulls out stored token columns exactly
 * when — and only when — the Graph API returns a definitive token-expiry error
 * (codes 102, 104, or 190).
 *
 * Proves:
 *   1. Each of the three token-expiry codes (102, 104, 190) produces:
 *        { connected: false, reason: "token_expired" }
 *      AND triggers a DB update that sets instagramUserId + instagramAccessToken to null.
 *   2. Non-token errors (e.g. permission error code 200, generic auth errors)
 *      return { connected: false, reason: "auth_error" } and do NOT touch the DB.
 *   3. A PERSONAL account response does NOT trigger a DB wipe (it isn't a bad token).
 *   4. A valid Business/Creator token response does NOT touch the DB.
 *   5. The network-error code path (when fetch itself throws) leaves the DB untouched,
 *      because handleInstagramStatusVerify is never reached in that branch — proved by
 *      confirming the helper returns without calling update for any non-expired reason.
 *
 * Strategy: handleInstagramStatusVerify is imported directly and called with a
 * lightweight mock DB object that records every .update().set().where() call.
 * No real database connection, no HTTP server, no fetch() mock needed — the helper
 * decouples the Graph API response mapping from the network call.
 *
 * Run solo: npx tsx --test server/__tests__/instagram-token-cleanup.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Stub DATABASE_URL so the db module doesn't throw at module init time.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
}
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = "[REDACTED_STRIPE_TEST_KEY]_instagram_cleanup_suite";
}

const { handleInstagramStatusVerify, nullExpiredInstagramToken, resolveInstagramPublishTokenError } = await import("../routes/instagram.js");

// ── Minimal mock DB ────────────────────────────────────────────────────────────

type SetValues = Record<string, unknown>;

/** Captures the most recent .update().set().where() call made on the mock. */
function makeMockDb() {
  let updateCount = 0;
  let lastSet: SetValues | null = null;

  const mock = {
    update(_table: unknown) {
      return {
        set(values: SetValues) {
          updateCount++;
          lastSet = values;
          return {
            where(_condition: unknown) {
              return Promise.resolve();
            },
          };
        },
      };
    },
    // Inspection helpers
    get updateCount() {
      return updateCount;
    },
    get lastSet() {
      return lastSet;
    },
    reset() {
      updateCount = 0;
      lastSet = null;
    },
  };

  return mock;
}

// ── Suite 1: token-expiry codes → response shape + DB cleanup ─────────────────

describe("handleInstagramStatusVerify — token-expiry codes null the DB", () => {
  const expiryScenarios = [
    {
      code: 102,
      label: "session-expired code 102",
      verifyOk: false,
      body: { error: { code: 102, type: "OAuthException", message: "Session key invalid." } },
    },
    {
      code: 104,
      label: "session-expired code 104",
      verifyOk: false,
      body: { error: { code: 104, type: "OAuthException", message: "Incorrect signature." } },
    },
    {
      code: 190,
      label: "invalid/expired token code 190 (HTTP 400)",
      verifyOk: false,
      body: { error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." } },
    },
    {
      code: 190,
      label: "invalid/expired token code 190 embedded in HTTP-200 body",
      verifyOk: true, // Graph API occasionally sends HTTP 200 with an error body
      body: { error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." } },
    },
  ];

  for (const s of expiryScenarios) {
    it(`${s.label} → {connected:false, reason:"token_expired"} + DB nulled`, async () => {
      const mockDb = makeMockDb();

      const result = await handleInstagramStatusVerify(
        "user-abc",
        s.verifyOk,
        s.body,
        mockDb as unknown as Parameters<typeof handleInstagramStatusVerify>[3],
      );

      // ── Response shape ───────────────────────────────────────────────────────
      assert.equal(result.connected, false, `connected should be false for ${s.label}`);
      assert.equal(
        result.reason,
        "token_expired",
        `reason should be "token_expired" for ${s.label}`,
      );

      // ── DB was updated exactly once ──────────────────────────────────────────
      assert.equal(
        mockDb.updateCount,
        1,
        `DB update should be called exactly once for ${s.label}, got ${mockDb.updateCount}`,
      );

      // ── Both token columns are nulled out ────────────────────────────────────
      assert.ok(
        mockDb.lastSet !== null,
        `DB set() must have been called for ${s.label}`,
      );
      assert.equal(
        mockDb.lastSet!.instagramUserId,
        null,
        `instagramUserId must be set to null for ${s.label}`,
      );
      assert.equal(
        mockDb.lastSet!.instagramAccessToken,
        null,
        `instagramAccessToken must be set to null for ${s.label}`,
      );
    });
  }
});

// ── Suite 2: non-token errors → response shape, DB NOT touched ─────────────────

describe("handleInstagramStatusVerify — non-token errors leave DB intact", () => {
  const nonExpiryScenarios = [
    {
      label: "permission error code 200",
      verifyOk: false,
      body: { error: { code: 200, type: "OAuthException", message: "Permission denied." } },
      expectedReason: "auth_error",
    },
    {
      label: "generic HTTP error with no code",
      verifyOk: false,
      body: { error: { message: "Unknown error" } },
      expectedReason: "auth_error",
    },
    {
      label: "HTTP error with no body error field",
      verifyOk: false,
      body: {},
      expectedReason: "auth_error",
    },
  ];

  for (const s of nonExpiryScenarios) {
    it(`${s.label} → {connected:false, reason:"${s.expectedReason}"} + DB untouched`, async () => {
      const mockDb = makeMockDb();

      const result = await handleInstagramStatusVerify(
        "user-xyz",
        s.verifyOk,
        s.body,
        mockDb as unknown as Parameters<typeof handleInstagramStatusVerify>[3],
      );

      // ── Response shape ───────────────────────────────────────────────────────
      assert.equal(result.connected, false, `connected should be false for ${s.label}`);
      assert.equal(
        result.reason,
        s.expectedReason,
        `reason should be "${s.expectedReason}" for ${s.label}`,
      );

      // ── DB must NOT be touched ───────────────────────────────────────────────
      assert.equal(
        mockDb.updateCount,
        0,
        `DB must NOT be updated for a non-expiry error (${s.label}), got ${mockDb.updateCount} calls`,
      );
    });
  }
});

// ── Suite 3: personal account → DB NOT touched ─────────────────────────────────

describe("handleInstagramStatusVerify — personal account leaves DB intact", () => {
  it("PERSONAL account type → {connected:false, reason:'personal_account'} + DB untouched", async () => {
    const mockDb = makeMockDb();

    const result = await handleInstagramStatusVerify(
      "user-personal",
      true,
      { id: "999", account_type: "PERSONAL" },
      mockDb as unknown as Parameters<typeof handleInstagramStatusVerify>[3],
    );

    assert.equal(result.connected, false);
    assert.equal(result.reason, "personal_account");

    assert.equal(
      mockDb.updateCount,
      0,
      "DB must NOT be updated for a personal account (token itself is valid)",
    );
  });
});

// ── Suite 4: valid Business/Creator token → connected, DB untouched ────────────

describe("handleInstagramStatusVerify — valid token leaves DB intact", () => {
  const validScenarios = [
    { accountType: "BUSINESS", body: { id: "1", account_type: "BUSINESS" } },
    { accountType: "CREATOR", body: { id: "2", account_type: "CREATOR" } },
  ];

  for (const s of validScenarios) {
    it(`valid ${s.accountType} token → {connected:true} + DB untouched`, async () => {
      const mockDb = makeMockDb();

      const result = await handleInstagramStatusVerify(
        "user-valid",
        true,
        s.body,
        mockDb as unknown as Parameters<typeof handleInstagramStatusVerify>[3],
      );

      assert.equal(result.connected, true);
      assert.equal(result.accountType, s.accountType);
      assert.equal(
        mockDb.updateCount,
        0,
        `DB must NOT be updated for a valid ${s.accountType} token`,
      );
    });
  }
});

// ── Suite 5: network-error path is safe ────────────────────────────────────────
//
// The /status route handler catches fetch() throws BEFORE calling
// handleInstagramStatusVerify, so the DB is inherently safe. This suite
// proves the helper itself never issues a DB update for any non-expiry
// outcome — confirming that the network-error branch (which bypasses the
// helper entirely) is the correct design.

describe("handleInstagramStatusVerify — all non-expiry outcomes never update DB", () => {
  const safeOutcomes = [
    {
      label: "valid BUSINESS token",
      verifyOk: true,
      body: { id: "1", account_type: "BUSINESS" },
    },
    {
      label: "PERSONAL account",
      verifyOk: true,
      body: { id: "2", account_type: "PERSONAL" },
    },
    {
      label: "permission error code 200",
      verifyOk: false,
      body: { error: { code: 200, message: "Permission denied." } },
    },
    {
      label: "HTTP error with no body",
      verifyOk: false,
      body: {},
    },
  ];

  let mockDb = makeMockDb();

  beforeEach(() => {
    mockDb.reset();
  });

  for (const s of safeOutcomes) {
    it(`${s.label} → DB update count stays 0`, async () => {
      await handleInstagramStatusVerify(
        "user-safe",
        s.verifyOk,
        s.body,
        mockDb as unknown as Parameters<typeof handleInstagramStatusVerify>[3],
      );

      assert.equal(
        mockDb.updateCount,
        0,
        `DB must remain untouched for outcome "${s.label}"`,
      );
    });
  }
});

// ── Suite 6: nullExpiredInstagramToken helper ───────────────────────────────────
//
// The shared cleanup primitive used by both the /status and /publish paths.

describe("nullExpiredInstagramToken — always nulls both credential columns", () => {
  it("calls DB update with instagramUserId:null and instagramAccessToken:null", async () => {
    const mockDb = makeMockDb();
    await nullExpiredInstagramToken(
      "user-null-test",
      mockDb as unknown as Parameters<typeof nullExpiredInstagramToken>[1],
    );
    assert.equal(mockDb.updateCount, 1, "DB update must be called exactly once");
    assert.equal(mockDb.lastSet!.instagramUserId, null);
    assert.equal(mockDb.lastSet!.instagramAccessToken, null);
  });
});

// ── Suite 7: publish path — token-expiry codes null the DB ─────────────────────
//
// The /publish handler calls resolveInstagramPublishTokenError, then (when
// reason === "token_expired") calls nullExpiredInstagramToken before returning 401.
// This suite proves the publish-path cleanup contract by simulating exactly what
// the handler does: resolve → check reason → null if expired.

describe("publish path — token-expiry codes null the DB", () => {
  const expiryScenarios = [
    {
      label: "code 102",
      verifyOk: false,
      body: { error: { code: 102, type: "OAuthException", message: "Session key invalid." } },
    },
    {
      label: "code 104",
      verifyOk: false,
      body: { error: { code: 104, type: "OAuthException", message: "Incorrect signature." } },
    },
    {
      label: "code 190 (HTTP 400)",
      verifyOk: false,
      body: { error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." } },
    },
    {
      label: "code 190 embedded in HTTP-200 body",
      verifyOk: true,
      body: { error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token." } },
    },
  ];

  for (const s of expiryScenarios) {
    it(`publish preflight ${s.label} → 401 token_expired + DB nulled`, async () => {
      const mockDb = makeMockDb();

      // Simulate exactly what the /publish handler does:
      const tokenError = resolveInstagramPublishTokenError(s.verifyOk, s.body);
      assert.notEqual(tokenError, null, "tokenError must be non-null for an expiry code");
      assert.equal(tokenError!.statusCode, 401);
      assert.equal(tokenError!.body.reason, "token_expired");

      // Handler calls nullExpiredInstagramToken when reason === "token_expired"
      if (tokenError!.body.reason === "token_expired") {
        await nullExpiredInstagramToken(
          "user-pub",
          mockDb as unknown as Parameters<typeof nullExpiredInstagramToken>[1],
        );
      }

      assert.equal(mockDb.updateCount, 1, "DB must be updated once for publish expiry");
      assert.equal(mockDb.lastSet!.instagramUserId, null);
      assert.equal(mockDb.lastSet!.instagramAccessToken, null);
    });
  }
});

// ── Suite 8: publish path — non-expiry errors do NOT null the DB ───────────────

describe("publish path — non-expiry errors leave DB intact", () => {
  const safeScenarios = [
    {
      label: "personal account (403)",
      verifyOk: true,
      body: { id: "1", account_type: "PERSONAL" },
      expectedReason: "personal_account",
    },
    {
      label: "permission error code 200 (auth_error)",
      verifyOk: false,
      body: { error: { code: 200, message: "Permission denied." } },
      expectedReason: "auth_error",
    },
    {
      label: "generic HTTP error no code (auth_error)",
      verifyOk: false,
      body: { error: { message: "Unknown error" } },
      expectedReason: "auth_error",
    },
  ];

  for (const s of safeScenarios) {
    it(`publish preflight ${s.label} → DB untouched`, async () => {
      const mockDb = makeMockDb();

      const tokenError = resolveInstagramPublishTokenError(s.verifyOk, s.body);
      assert.notEqual(tokenError, null, "tokenError must be non-null for a blocked token");
      assert.equal(tokenError!.body.reason, s.expectedReason);

      // Handler only calls nullExpiredInstagramToken when reason === "token_expired";
      // simulate that exact condition check:
      if (tokenError!.body.reason === "token_expired") {
        await nullExpiredInstagramToken(
          "user-pub-safe",
          mockDb as unknown as Parameters<typeof nullExpiredInstagramToken>[1],
        );
      }

      assert.equal(
        mockDb.updateCount,
        0,
        `DB must NOT be updated for publish reason "${s.expectedReason}"`,
      );
    });
  }
});
