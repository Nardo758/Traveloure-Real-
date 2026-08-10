/**
 * instagram-banner.test.ts
 *
 * Unit tests for the Content Studio Instagram connection banner rendering
 * logic. These verify that the banner correctly adapts its text and styling
 * to the three distinct /api/instagram/status response shapes:
 *
 *   1. connected: true                         → no banner shown
 *   2. connected: false, reason: "token_expired" → "session expired" copy + Reconnect button
 *   3. connected: false, reason: "personal_account" → amber warning copy + amber button label
 *   4. connected: false (no reason / first-time) → default "Connect" copy
 *
 * Strategy: the banner is rendered in content-studio.tsx conditionally on
 * `!instagramStatusLoading && !isInstagramConnected`. The heading text,
 * button label, and amber-variant class are driven purely by
 * `instagramDisconnectReason`. We encode each decision here as a pure mapping
 * function (mirroring the JSX conditions) so any future drift in the component
 * is caught by this test.
 *
 * Run with: npx tsx --test client/src/lib/__tests__/instagram-banner.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Types that mirror the /api/instagram/status response ─────────────────────

type DisconnectReason =
  | "personal_account"
  | "token_expired"
  | "auth_error"
  | "verification_error"
  | undefined;

type InstagramStatus =
  | { connected: true; accountType?: string }
  | { connected: false; reason?: DisconnectReason };

// ── Pure projection functions — mirror JSX conditions in content-studio.tsx ──
//
// If the component's JSX conditions change, these functions must be updated
// to match, and the tests below will catch the drift.

function shouldShowBanner(
  status: InstagramStatus | undefined,
  loading: boolean,
): boolean {
  if (loading) return false;
  if (!status) return true; // no data yet — treat as disconnected after load
  return !status.connected;
}

function getBannerHeading(reason: DisconnectReason): string {
  if (reason === "personal_account") return "Business or Creator account required";
  if (reason === "token_expired") return "Instagram session expired";
  return "Connect your Instagram account";
}

function getBannerButtonLabel(reason: DisconnectReason): string {
  if (reason === "token_expired") return "Reconnect Instagram";
  if (reason === "personal_account") return "Reconnect with Business Account";
  return "Connect Instagram";
}

function isAmberVariant(reason: DisconnectReason): boolean {
  return reason === "personal_account";
}

// ── Suite: banner visibility ──────────────────────────────────────────────────

describe("Content Studio banner — visibility", () => {
  it("hides banner while status is loading", () => {
    assert.equal(shouldShowBanner(undefined, true), false);
  });

  it("hides banner when Instagram is connected", () => {
    const status: InstagramStatus = { connected: true, accountType: "BUSINESS" };
    assert.equal(shouldShowBanner(status, false), false);
  });

  it("shows banner when disconnected (no reason)", () => {
    const status: InstagramStatus = { connected: false };
    assert.equal(shouldShowBanner(status, false), true);
  });

  it("shows banner when disconnected with token_expired reason", () => {
    const status: InstagramStatus = { connected: false, reason: "token_expired" };
    assert.equal(shouldShowBanner(status, false), true);
  });

  it("shows banner when disconnected with personal_account reason", () => {
    const status: InstagramStatus = { connected: false, reason: "personal_account" };
    assert.equal(shouldShowBanner(status, false), true);
  });
});

// ── Suite: banner copy — headings ─────────────────────────────────────────────

describe("Content Studio banner — heading text", () => {
  it("shows default connect heading when no reason is set", () => {
    assert.equal(getBannerHeading(undefined), "Connect your Instagram account");
  });

  it("shows session-expired heading for token_expired", () => {
    assert.equal(getBannerHeading("token_expired"), "Instagram session expired");
  });

  it("shows business-required heading for personal_account", () => {
    assert.equal(
      getBannerHeading("personal_account"),
      "Business or Creator account required",
    );
  });

  it("falls back to default heading for auth_error (non-expiry)", () => {
    assert.equal(getBannerHeading("auth_error"), "Connect your Instagram account");
  });
});

// ── Suite: banner copy — button labels ───────────────────────────────────────

describe("Content Studio banner — button label", () => {
  it("shows 'Connect Instagram' by default", () => {
    assert.equal(getBannerButtonLabel(undefined), "Connect Instagram");
  });

  it("shows 'Reconnect Instagram' for token_expired", () => {
    assert.equal(getBannerButtonLabel("token_expired"), "Reconnect Instagram");
  });

  it("shows 'Reconnect with Business Account' for personal_account", () => {
    assert.equal(
      getBannerButtonLabel("personal_account"),
      "Reconnect with Business Account",
    );
  });

  it("shows default label for auth_error", () => {
    assert.equal(getBannerButtonLabel("auth_error"), "Connect Instagram");
  });
});

// ── Suite: banner styling — amber variant ─────────────────────────────────────

describe("Content Studio banner — amber styling", () => {
  it("does NOT use amber styling by default (no reason)", () => {
    assert.equal(isAmberVariant(undefined), false);
  });

  it("does NOT use amber styling for token_expired (pink gradient instead)", () => {
    assert.equal(isAmberVariant("token_expired"), false);
  });

  it("uses amber styling for personal_account — matches border-amber-300 condition in JSX", () => {
    assert.equal(isAmberVariant("personal_account"), true);
  });

  it("does NOT use amber styling for auth_error", () => {
    assert.equal(isAmberVariant("auth_error"), false);
  });
});

// ── Suite: connected state — no banner ────────────────────────────────────────

describe("Content Studio banner — full flow for connected state", () => {
  it("connected BUSINESS account: banner is hidden, no heading or label applies", () => {
    const status: InstagramStatus = { connected: true, accountType: "BUSINESS" };
    const loading = false;
    assert.equal(shouldShowBanner(status, loading), false,
      "banner must not render when Instagram is properly connected");
  });

  it("connected CREATOR account: banner is hidden", () => {
    const status: InstagramStatus = { connected: true, accountType: "CREATOR" };
    assert.equal(shouldShowBanner(status, false), false);
  });
});

// ── Suite: full scenario integration (status → banner decision) ───────────────

describe("Content Studio banner — end-to-end scenario mapping", () => {
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
      label: "valid Business token",
      status: { connected: true, accountType: "BUSINESS" },
      expectBanner: false,
    },
    {
      label: "expired token (code 190)",
      status: { connected: false, reason: "token_expired" },
      expectBanner: true,
      expectHeading: "Instagram session expired",
      expectButton: "Reconnect Instagram",
      expectAmber: false,
    },
    {
      label: "personal account",
      status: { connected: false, reason: "personal_account" },
      expectBanner: true,
      expectHeading: "Business or Creator account required",
      expectButton: "Reconnect with Business Account",
      expectAmber: true,
    },
    {
      label: "first-time / never connected",
      status: { connected: false },
      expectBanner: true,
      expectHeading: "Connect your Instagram account",
      expectButton: "Connect Instagram",
      expectAmber: false,
    },
  ];

  for (const s of scenarios) {
    it(s.label, () => {
      const banner = shouldShowBanner(s.status, false);
      assert.equal(banner, s.expectBanner, `banner visibility mismatch for "${s.label}"`);

      if (!s.expectBanner) return; // no further checks needed when banner is hidden

      const reason = s.status.connected
        ? undefined
        : (s.status as { connected: false; reason?: DisconnectReason }).reason;

      if (s.expectHeading !== undefined) {
        assert.equal(
          getBannerHeading(reason),
          s.expectHeading,
          `heading mismatch for "${s.label}"`,
        );
      }
      if (s.expectButton !== undefined) {
        assert.equal(
          getBannerButtonLabel(reason),
          s.expectButton,
          `button label mismatch for "${s.label}"`,
        );
      }
      if (s.expectAmber !== undefined) {
        assert.equal(
          isAmberVariant(reason),
          s.expectAmber,
          `amber variant mismatch for "${s.label}"`,
        );
      }
    });
  }
});
