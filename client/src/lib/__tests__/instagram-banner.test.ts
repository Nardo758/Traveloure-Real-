/**
 * instagram-banner.test.ts
 *
 * Unit tests for the Instagram connection banner view-model helpers exported
 * from client/src/lib/instagram-banner-utils.ts.
 *
 * These helpers are imported by content-studio.tsx to drive the banner's
 * conditional rendering, so testing them here tests the real production logic
 * that determines what users see in each /api/instagram/status state.
 *
 * Three key scenarios (per task spec):
 *   1. { connected: true }                       → no banner shown
 *   2. { connected: false, reason: "token_expired" }  → "session expired" copy + Reconnect CTA
 *   3. { connected: false, reason: "personal_account" } → amber warning + Business account CTA
 *
 * Run with: npx tsx --test client/src/lib/__tests__/instagram-banner.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import the real production helpers — any drift in the production file
// will break these tests.
import {
  shouldShowInstagramBanner,
  getInstagramBannerHeading,
  getInstagramBannerButtonLabel,
  isInstagramBannerAmberVariant,
  getInstagramBannerAction,
  type InstagramStatus,
  type InstagramDisconnectReason,
} from "../instagram-banner-utils.js";

// ── Suite: banner visibility ──────────────────────────────────────────────────

describe("shouldShowInstagramBanner — visibility", () => {
  it("hides banner while status is loading", () => {
    assert.equal(shouldShowInstagramBanner(undefined, true), false);
  });

  it("hides banner when Instagram is connected", () => {
    const status: InstagramStatus = { connected: true, accountType: "BUSINESS" };
    assert.equal(shouldShowInstagramBanner(status, false), false);
  });

  it("hides banner for a connected CREATOR account", () => {
    const status: InstagramStatus = { connected: true, accountType: "CREATOR" };
    assert.equal(shouldShowInstagramBanner(status, false), false);
  });

  it("shows banner when disconnected with no reason (first-time / never connected)", () => {
    const status: InstagramStatus = { connected: false };
    assert.equal(shouldShowInstagramBanner(status, false), true);
  });

  it("shows banner when disconnected with token_expired reason", () => {
    const status: InstagramStatus = { connected: false, reason: "token_expired" };
    assert.equal(shouldShowInstagramBanner(status, false), true);
  });

  it("shows banner when disconnected with personal_account reason", () => {
    const status: InstagramStatus = { connected: false, reason: "personal_account" };
    assert.equal(shouldShowInstagramBanner(status, false), true);
  });

  it("shows banner when disconnected with auth_error reason", () => {
    const status: InstagramStatus = { connected: false, reason: "auth_error" };
    assert.equal(shouldShowInstagramBanner(status, false), true);
  });
});

// ── Suite: banner headings ────────────────────────────────────────────────────

describe("getInstagramBannerHeading — heading text", () => {
  it("shows default connect heading when no reason is set", () => {
    assert.equal(getInstagramBannerHeading(undefined), "Connect your Instagram account");
  });

  it("shows session-expired heading for token_expired", () => {
    assert.equal(getInstagramBannerHeading("token_expired"), "Instagram session expired");
  });

  it("shows business-required heading for personal_account", () => {
    assert.equal(
      getInstagramBannerHeading("personal_account"),
      "Business or Creator account required",
    );
  });

  it("falls back to default heading for auth_error (non-expiry error)", () => {
    assert.equal(getInstagramBannerHeading("auth_error"), "Connect your Instagram account");
  });

  it("shows transient-failure heading for verification_error", () => {
    assert.equal(
      getInstagramBannerHeading("verification_error"),
      "Couldn't reach Instagram — your account may still be connected",
    );
  });
});

// ── Suite: banner button labels ───────────────────────────────────────────────

describe("getInstagramBannerButtonLabel — CTA label", () => {
  it("shows 'Connect Instagram' by default (no reason)", () => {
    assert.equal(getInstagramBannerButtonLabel(undefined), "Connect Instagram");
  });

  it("shows 'Reconnect Instagram' for token_expired", () => {
    assert.equal(getInstagramBannerButtonLabel("token_expired"), "Reconnect Instagram");
  });

  it("shows 'Reconnect with Business Account' for personal_account", () => {
    assert.equal(
      getInstagramBannerButtonLabel("personal_account"),
      "Reconnect with Business Account",
    );
  });

  it("shows default label for auth_error", () => {
    assert.equal(getInstagramBannerButtonLabel("auth_error"), "Connect Instagram");
  });

  it("shows 'Retry' for verification_error (transient network failure)", () => {
    assert.equal(getInstagramBannerButtonLabel("verification_error"), "Retry");
  });
});

// ── Suite: amber styling variant ──────────────────────────────────────────────

describe("isInstagramBannerAmberVariant — amber styling", () => {
  it("does NOT use amber styling when no reason is set", () => {
    assert.equal(isInstagramBannerAmberVariant(undefined), false);
  });

  it("does NOT use amber styling for token_expired (uses pink gradient instead)", () => {
    assert.equal(isInstagramBannerAmberVariant("token_expired"), false);
  });

  it("uses amber styling for personal_account — the warning variant", () => {
    assert.equal(isInstagramBannerAmberVariant("personal_account"), true);
  });

  it("does NOT use amber styling for auth_error", () => {
    assert.equal(isInstagramBannerAmberVariant("auth_error"), false);
  });

  it("does NOT use amber styling for verification_error", () => {
    assert.equal(isInstagramBannerAmberVariant("verification_error"), false);
  });
});

// ── Suite: end-to-end scenario mapping ───────────────────────────────────────

describe("Instagram banner — full scenario matrix", () => {
  type Scenario = {
    label: string;
    status: InstagramStatus;
    expectBanner: boolean;
    expectHeading?: string;
    expectButton?: string;
    expectAmber?: boolean;
  };

  const scenarios: Scenario[] = [
    {
      label: "valid Business token — no banner",
      status: { connected: true, accountType: "BUSINESS" },
      expectBanner: false,
    },
    {
      label: "valid Creator token — no banner",
      status: { connected: true, accountType: "CREATOR" },
      expectBanner: false,
    },
    {
      label: "expired token (code 190) — session expired banner",
      status: { connected: false, reason: "token_expired" },
      expectBanner: true,
      expectHeading: "Instagram session expired",
      expectButton: "Reconnect Instagram",
      expectAmber: false,
    },
    {
      label: "personal account — amber business-required banner",
      status: { connected: false, reason: "personal_account" },
      expectBanner: true,
      expectHeading: "Business or Creator account required",
      expectButton: "Reconnect with Business Account",
      expectAmber: true,
    },
    {
      label: "first-time / never connected — default connect banner",
      status: { connected: false },
      expectBanner: true,
      expectHeading: "Connect your Instagram account",
      expectButton: "Connect Instagram",
      expectAmber: false,
    },
    {
      label: "auth_error — generic connect banner",
      status: { connected: false, reason: "auth_error" },
      expectBanner: true,
      expectHeading: "Connect your Instagram account",
      expectButton: "Connect Instagram",
      expectAmber: false,
    },
    {
      label: "verification_error — transient network failure, distinct heading, Retry CTA",
      status: { connected: false, reason: "verification_error" },
      expectBanner: true,
      expectHeading: "Couldn't reach Instagram — your account may still be connected",
      expectButton: "Retry",
      expectAmber: false,
    },
  ];

  for (const s of scenarios) {
    it(s.label, () => {
      const banner = shouldShowInstagramBanner(s.status, false);
      assert.equal(banner, s.expectBanner, `banner visibility mismatch for "${s.label}"`);

      if (!s.expectBanner) return; // no further checks when banner is hidden

      const reason =
        s.status.connected
          ? undefined
          : (s.status as { connected: false; reason?: InstagramDisconnectReason }).reason;

      if (s.expectHeading !== undefined) {
        assert.equal(
          getInstagramBannerHeading(reason),
          s.expectHeading,
          `heading mismatch for "${s.label}"`,
        );
      }
      if (s.expectButton !== undefined) {
        assert.equal(
          getInstagramBannerButtonLabel(reason),
          s.expectButton,
          `button label mismatch for "${s.label}"`,
        );
      }
      if (s.expectAmber !== undefined) {
        assert.equal(
          isInstagramBannerAmberVariant(reason),
          s.expectAmber,
          `amber variant mismatch for "${s.label}"`,
        );
      }
    });
  }
});

// ── Suite: banner button action routing ───────────────────────────────────────
//
// This is the regression gate for the "Retry vs OAuth" branch in the banner
// button's onClick handler (content-studio.tsx):
//
//   onClick={
//     getInstagramBannerAction(reason) === "retry"
//       ? () => queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] })
//       : handleConnectInstagram   // ← initiates OAuth redirect
//   }
//
// The tests below assert the routing table so any accidental change that sends
// a transient-failure user through OAuth is caught immediately.

describe("getInstagramBannerAction — retry vs OAuth routing", () => {
  it('returns "retry" for verification_error — MUST invalidate, never OAuth', () => {
    assert.equal(
      getInstagramBannerAction("verification_error"),
      "retry",
      "verification_error must route to cache-invalidation, not OAuth",
    );
  });

  it('returns "oauth" when no reason is set (first-time connect)', () => {
    assert.equal(getInstagramBannerAction(undefined), "oauth");
  });

  it('returns "oauth" for token_expired (token fully gone — needs fresh OAuth grant)', () => {
    assert.equal(getInstagramBannerAction("token_expired"), "oauth");
  });

  it('returns "oauth" for personal_account (needs account-type change then reconnect)', () => {
    assert.equal(getInstagramBannerAction("personal_account"), "oauth");
  });

  it('returns "oauth" for auth_error (generic error — not a transient network failure)', () => {
    assert.equal(getInstagramBannerAction("auth_error"), "oauth");
  });

  // Guard: verify that verification_error is the ONLY reason that bypasses OAuth.
  // This prevents a copy-paste error introducing a second "retry" branch.
  it("only verification_error bypasses OAuth — all other known reasons trigger OAuth", () => {
    const oauthReasons: InstagramDisconnectReason[] = [
      undefined,
      "token_expired",
      "personal_account",
      "auth_error",
    ];
    for (const reason of oauthReasons) {
      assert.equal(
        getInstagramBannerAction(reason),
        "oauth",
        `reason "${String(reason)}" should trigger OAuth but getInstagramBannerAction returned "retry"`,
      );
    }
  });
});

// ── Suite: verification_error does not change window.location ─────────────────
//
// Simulates the component's click handler in a pure-JS environment.
// When reason === "verification_error" the handler must call invalidateQueries
// and must NOT assign window.location.href (which would start an OAuth redirect).

describe("verification_error Retry handler — no OAuth navigation", () => {
  it("calls invalidateQueries and leaves window.location.href unchanged", () => {
    // Minimal queryClient stub that records calls.
    const invalidated: Array<{ queryKey: unknown }> = [];
    const stubQueryClient = {
      invalidateQueries(opts: { queryKey: unknown }) {
        invalidated.push(opts);
      },
    };

    // Track whether the OAuth handler was invoked (simulates a location change).
    let oauthInitiated = false;

    // Reconstruct the component's onClick branch using the production routing helper.
    // This mirrors the JSX verbatim:
    //   onClick={
    //     getInstagramBannerAction(reason) === "retry"
    //       ? () => queryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] })
    //       : handleConnectInstagram
    //   }
    const reason: InstagramDisconnectReason = "verification_error";
    const action = getInstagramBannerAction(reason);

    const handleConnectInstagram = () => {
      // Simulates the OAuth initiation path — must NOT be called for verification_error.
      oauthInitiated = true;
    };

    const onClick =
      action === "retry"
        ? () => stubQueryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] })
        : handleConnectInstagram;

    onClick();

    // Assert invalidateQueries was called with the correct status query key.
    assert.equal(invalidated.length, 1, "invalidateQueries must be called exactly once");
    assert.deepEqual(
      invalidated[0].queryKey,
      ["/api/instagram/status"],
      "must invalidate the instagram status query key",
    );

    // Assert the OAuth handler was never invoked (no navigation / redirect).
    assert.equal(oauthInitiated, false, "OAuth must NOT be triggered for verification_error");
  });

  it("calls handleConnectInstagram (OAuth) for any non-retry reason", () => {
    let oauthCalled = false;
    const invalidated: unknown[] = [];

    const stubQueryClient = {
      invalidateQueries(opts: unknown) {
        invalidated.push(opts);
      },
    };

    const handleConnectInstagram = () => {
      oauthCalled = true;
    };

    const reason: InstagramDisconnectReason = "token_expired";
    const action = getInstagramBannerAction(reason);

    const onClick =
      action === "retry"
        ? () => stubQueryClient.invalidateQueries({ queryKey: ["/api/instagram/status"] })
        : handleConnectInstagram;

    onClick();

    assert.equal(oauthCalled, true, "OAuth handler must be called for token_expired");
    assert.equal(invalidated.length, 0, "invalidateQueries must NOT be called for token_expired");
  });
});
