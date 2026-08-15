/**
 * Instagram Banner — all four states for designer review.
 *
 * States:
 *   1. never_connected  — no reason, default pink gradient
 *   2. token_expired    — session expired, pink gradient, "Reconnect Instagram"
 *   3. personal_account — amber warning, "Reconnect with Business Account"
 *   4. verification_error — pink gradient, "Retry" button (NEW — task 1071)
 *
 * Copy and button labels are kept in sync with
 *   client/src/lib/instagram-banner-utils.ts  and
 *   client/src/pages/expert/content-studio.tsx (~line 795–863).
 */

import { AlertCircle, Instagram, RefreshCw } from "lucide-react";

// ─── types ────────────────────────────────────────────────────────────────────

type Reason =
  | "personal_account"
  | "token_expired"
  | "verification_error"
  | undefined;

// ─── pure helpers (mirrors instagram-banner-utils.ts) ─────────────────────────

function heading(reason: Reason): string {
  if (reason === "personal_account") return "Business or Creator account required";
  if (reason === "token_expired") return "Instagram session expired";
  if (reason === "verification_error")
    return "Couldn't reach Instagram — your account may still be connected";
  return "Connect your Instagram account";
}

function buttonLabel(reason: Reason): string {
  if (reason === "token_expired") return "Reconnect Instagram";
  if (reason === "personal_account") return "Reconnect with Business Account";
  if (reason === "verification_error") return "Retry";
  return "Connect Instagram";
}

function isAmber(reason: Reason): boolean {
  return reason === "personal_account";
}

function bodyText(reason: Reason): string {
  if (reason === "personal_account")
    return "Instagram only allows publishing from Business and Creator accounts. Switch your account type in the Instagram app under Settings → Account → Switch to Professional Account, then reconnect here.";
  if (reason === "token_expired")
    return "Your Instagram connection has expired. Reconnect to continue publishing directly from Content Studio.";
  if (reason === "verification_error")
    return "We couldn't reach Instagram to verify your connection. Your account is likely still connected — try again in a moment.";
  return "Link your Business or Creator Instagram account to publish content directly from Content Studio.";
}

// ─── single banner ─────────────────────────────────────────────────────────────

function Banner({ reason, label }: { reason: Reason; label: string }) {
  const amber = isAmber(reason);

  return (
    <div
      style={{
        border: `1px solid ${amber ? "#FCD34D" : "#FBCFE8"}`,
        borderRadius: 12,
        background: amber
          ? "#FFFBEB"
          : "linear-gradient(135deg,rgba(168,85,247,.05),rgba(236,72,153,.05),rgba(249,115,22,.05))",
        padding: "20px 20px",
        marginBottom: 0,
      }}
    >
      {/* state label pill */}
      <div style={{ marginBottom: 12 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: amber ? "#B45309" : "#BE185D",
            background: amber ? "#FEF3C7" : "#FCE7F3",
            padding: "2px 8px",
            borderRadius: 99,
          }}
        >
          {label}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {/* icon */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: amber
              ? "#FEF3C7"
              : "linear-gradient(135deg,#9333EA,#EC4899,#F97316)",
          }}
        >
          {amber ? (
            <AlertCircle size={20} color="#D97706" />
          ) : (
            <Instagram size={20} color="white" />
          )}
        </div>

        {/* text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 14,
              color: amber ? "#92400E" : "#111827",
            }}
          >
            {heading(reason)}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: amber ? "#B45309" : "#6B7280",
              lineHeight: 1.5,
            }}
          >
            {bodyText(reason)}
          </p>
        </div>

        {/* CTA button */}
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            flexShrink: 0,
            background: amber
              ? "#D97706"
              : "linear-gradient(135deg,#9333EA,#EC4899)",
            color: "white",
          }}
        >
          {reason === "verification_error" ? (
            <RefreshCw size={14} />
          ) : (
            <Instagram size={14} />
          )}
          {buttonLabel(reason)}
        </button>
      </div>
    </div>
  );
}

// ─── default export: all four states ──────────────────────────────────────────

export default function InstagramBanner() {
  const variants: { reason: Reason; label: string }[] = [
    { reason: undefined,            label: "State 1 · never_connected" },
    { reason: "token_expired",      label: "State 2 · token_expired" },
    { reason: "personal_account",   label: "State 3 · personal_account (amber)" },
    { reason: "verification_error", label: "State 4 · verification_error  ✦ NEW" },
  ];

  return (
    <div
      style={{
        fontFamily:
          "Inter,system-ui,-apple-system,BlinkMacSystemFont,sans-serif",
        minHeight: "100vh",
        background: "#F9FAFB",
        padding: "40px 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 4,
          }}
        >
          Instagram Connection Banner — All States
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#6B7280",
            marginBottom: 32,
          }}
        >
          Copy and button labels are read from{" "}
          <code style={{ background: "#F3F4F6", padding: "1px 4px", borderRadius: 4 }}>
            instagram-banner-utils.ts
          </code>
          . State 4 (<strong>verification_error</strong>) shows the Retry
          button and a transient-error message so users know their account is
          likely still connected.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {variants.map((v) => (
            <Banner key={v.label} reason={v.reason} label={v.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
