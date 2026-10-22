import { useEffect, useLayoutEffect, useState } from "react";
import { TRAVELER_WAITLIST, normalizeSignupIntent, waitlistBlockedPath } from "@shared/launch-signup";
import { isRegistrationNeutral } from "@shared/registration-neutral";
import { supplySignupContinuation } from "@shared/supply-entry";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { resendVerificationEmail } from "@/lib/email-verification-hold";
import { useTranslation } from "react-i18next";

export function SignupPage() {
  const { t } = useTranslation("auth");
  // S-01: intent=supply continues into the role's application (or /earn when no role
  // is named). The account form stays for travelers and for ?qa=1.
  const [supplyContinuation] = useState(() => supplySignupContinuation(window.location.search));
  useLayoutEffect(() => {
    if (supplyContinuation.kind === "account") return;
    window.location.replace(supplyContinuation.href);
  }, [supplyContinuation]);

  const params = new URLSearchParams(window.location.search);
  const refToken = params.get("ref") || "";
  const source = params.get("source") || "direct";
  // LW-1b: `?intent=supply` marks a sign-up from a door for people offering services; `?qa=1` shows the QA code
  // field (the code itself is a server secret the tester types — it is never in this bundle).
  const intent = normalizeSignupIntent(params.get("intent"));
  const showQaCode = params.get("qa") === "1";
  const [qaCode, setQaCode] = useState("");

  // LW-1b: in waitlist mode a traveler has nothing to sign up for here — go to the launch market's waitlist.
  useEffect(() => {
    if (supplyContinuation.kind !== "account" || intent === "supply" || showQaCode) return;
    let cancelled = false;
    fetch("/api/public/signup-mode", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!cancelled && m?.mode === "waitlist") window.location.replace(waitlistBlockedPath(m.launchMarketSlug));
      })
      .catch(() => { /* the server still refuses on submit */ });
    return () => { cancelled = true; };
  }, [intent, showQaCode, supplyContinuation]);

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // AUTH-1 fix 3b: the server answers a new and an existing address the same way and signs nobody in, so a
  // completed sign-up shows one neutral state — never the dashboard, never "account created".
  const [submitted, setSubmitted] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "wait" | "error">("idle");

  if (supplyContinuation.kind !== "account") return null;

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      // Split "Full name" into firstName / lastName for the server schema
      const nameParts = form.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName,
          lastName,
          email: form.email,
          password: form.password,
          refToken,
          source,
          ...(intent === "supply" ? { intent } : {}),
          // LW-1d: the raw `?source=` tag of a supply sign-up (never the "direct" default above).
          ...(intent === "supply" && params.get("source") ? { signupSource: params.get("source") } : {}),
          ...(showQaCode && qaCode ? { qaCode } : {}),
          // NOTE: NO role field — server always assigns "user"
        }),
      });
      const data = await res.json();
      if (isRegistrationNeutral(res.status, data)) {
        setSubmitted(true);
        return;
      }
      if (!res.ok) {
        if (res.status === 403 && data?.code === TRAVELER_WAITLIST) {
          window.location.replace(sanitizeReturnTo(data.redirectTo) ?? "/");
          return;
        }
        setError(data.message || t("signupPage.failed"));
        return;
      }
      // Any other 2xx is not the contract this page knows; say so rather than claim an account exists.
      setError(t("signupPage.failed"));
    } catch {
      setError(t("signupPage.genericError"));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-md" data-testid="signup-neutral-result">
          <h1 className="text-xl font-semibold text-gray-900 mb-3">{t("registered.title")}</h1>
          <p className="text-sm text-gray-600 mb-3" data-testid="text-signup-neutral">{t("registered.body")}</p>
          <p className="text-sm text-gray-600 mb-6" data-testid="text-signup-payment-step">{t("registered.paymentStep")}</p>
          {/* The sign-in window also holds "Forgot password?", so one link serves both paths. */}
          <div className="flex flex-col gap-2 text-sm">
            <button
              type="button"
              className="text-gray-900 underline text-left disabled:opacity-60"
              disabled={resendState === "sending"}
              data-testid="button-resend-verification"
              onClick={async () => {
                setResendState("sending");
                const outcome = await resendVerificationEmail(form.email);
                setResendState(outcome === "sent" ? "sent" : outcome === "rate_limited" ? "wait" : "error");
              }}
            >
              {resendState === "sending" ? t("registered.resending") : t("registered.resend")}
            </button>
            {resendState === "sent" && (
              <p className="text-gray-600" data-testid="text-resend-result">{t("registered.resendResult")}</p>
            )}
            {resendState === "wait" && (
              <p className="text-gray-600" data-testid="text-resend-result">{t("registered.resendWait")}</p>
            )}
            {resendState === "error" && (
              <p className="text-gray-600" data-testid="text-resend-result">{t("signupPage.genericError")}</p>
            )}
            <a href="/login" className="text-gray-900 underline" data-testid="link-neutral-sign-in">
              {t("registered.signIn")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">
          {t("signupPage.title")}
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              {t("fields.fullName")}
            </label>
            <input
              data-testid="input-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder={t("fields.namePlaceholder")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              {t("fields.email")}
            </label>
            <input
              data-testid="input-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder={t("fields.signupEmailPlaceholder")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              {t("fields.password")}
            </label>
            <input
              data-testid="input-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder={t("fields.passwordPlaceholderSignup")}
            />
          </div>

          {showQaCode && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="input-qa-code">
                QA code
              </label>
              <input
                id="input-qa-code"
                data-testid="input-qa-code"
                type="password"
                autoComplete="off"
                value={qaCode}
                onChange={(e) => setQaCode(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}

          <button
            data-testid="button-create-account"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? t("signupPage.creating") : t("signupPage.createAccount")}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          {t("signupPage.haveAccount")}{" "}
          <a href="/" className="text-gray-700 underline">
            {t("signupPage.signIn")}
          </a>
        </p>

        {refToken && (
          <p className="text-xs text-gray-300 text-center mt-2">
            {t("signupPage.referral", { token: refToken })}
          </p>
        )}
      </div>
    </div>
  );
}
