import { useEffect, useLayoutEffect, useState } from "react";
import { TRAVELER_WAITLIST, normalizeSignupIntent, normalizeSupplyRole, waitlistBlockedPath } from "@shared/launch-signup";
import { WAITLIST_SERVICE_TYPES } from "@shared/launch-waitlist";
import { KEEP_RATES_ENDPOINT, type PublicKeepRates } from "@/lib/fee-keep-copy";
import {
  EMPTY_PROVIDER_DRAFT,
  WLB_SIGNUP_COPY,
  expertRefusalFrom,
  providerKeepLine,
  providerSignupBody,
  providerSignupReady,
  type ProviderSignupDraft,
} from "@/lib/wlb-signup-copy";
import { isRegistrationNeutral } from "@shared/registration-neutral";
import { supplySignupContinuation } from "@shared/supply-entry";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { authFailureMessage, readAuthResponse } from "@/lib/auth-response";
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
  // WL-B: the supply role a door states. A provider answers its light fields here; an expert is refused by the server.
  const supplyRole = intent === "supply" ? normalizeSupplyRole(params.get("supplyRole")) : null;
  const isProvider = supplyRole === "provider";
  const [provider, setProvider] = useState<ProviderSignupDraft>(EMPTY_PROVIDER_DRAFT);
  const [expertRefusal, setExpertRefusal] = useState<{ message: string; applyPath: string } | null>(null);
  const [keepRates, setKeepRates] = useState<PublicKeepRates | null>(null);
  useEffect(() => {
    if (!isProvider) return;
    let cancelled = false;
    fetch(KEEP_RATES_ENDPOINT)
      .then((r) => readAuthResponse(r))
      .then((read) => { if (!cancelled && read.kind === "json" && read.ok) setKeepRates(read.data as PublicKeepRates); })
      .catch(() => { /* no rate ⇒ no keep line */ });
    return () => { cancelled = true; };
  }, [isProvider]);

  // LW-1b: in waitlist mode a traveler has nothing to sign up for here — go to the launch market's waitlist.
  useEffect(() => {
    if (supplyContinuation.kind !== "account" || intent === "supply" || showQaCode) return;
    let cancelled = false;
    fetch("/api/public/signup-mode", { credentials: "include" })
      .then((r) => readAuthResponse(r))
      .then((read) => {
        if (cancelled || read.kind !== "json" || !read.ok || read.data.mode !== "waitlist") return;
        const slug = typeof read.data.launchMarketSlug === "string" ? read.data.launchMarketSlug : null;
        window.location.replace(waitlistBlockedPath(slug));
      })
      .catch(() => { /* the server still refuses on submit */ });
    return () => { cancelled = true; };
  }, [intent, showQaCode, supplyContinuation]);

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeZone, setTimeZone] = useState("");
  const [suggestedTimeZone, setSuggestedTimeZone] = useState("");
  useEffect(() => {
    try {
      setSuggestedTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch {
      // No suggestion is safer than guessing; the optional field stays empty.
    }
  }, []);

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
          ...(timeZone.trim() ? { timeZone: timeZone.trim() } : {}),
          refToken,
          source,
          ...(intent === "supply" ? { intent } : {}),
          ...(supplyRole ? { supplyRole } : {}),
          ...(isProvider ? { provider: providerSignupBody(provider) } : {}),
          // LW-1d: the raw `?source=` tag of a supply sign-up (never the "direct" default above).
          ...(intent === "supply" && params.get("source") ? { signupSource: params.get("source") } : {}),
          ...(showQaCode && qaCode ? { qaCode } : {}),
          // NOTE: NO role field — server always assigns "user"
        }),
      });
      const read = await readAuthResponse(res);
      if (read.kind === "json" && res.status === 400 && "errors" in read.data && Array.isArray(read.data.errors) &&
          read.data.errors.some((issue: { path?: unknown[] }) => issue.path?.[0] === "timeZone")) {
        setError(t("fields.timeZoneInvalid"));
        return;
      }
      // Ledger `2026-10-23-drop-check-email`: the 202 still signs nobody in. The
      // check-email screen is not shown. Sign-in is the next step.
      if (read.kind === "json" && isRegistrationNeutral(res.status, read.data)) {
        window.location.assign("/login");
        return;
      }
      // WL-B: an expert is told to apply on the waitlist — the server's message and its form, nothing else.
      const refusal = read.kind === "json" ? expertRefusalFrom(res.status, read.data) : null;
      if (refusal) {
        setExpertRefusal(refusal);
        return;
      }
      if (read.kind === "json" && res.status === 403 && read.data.code === TRAVELER_WAITLIST) {
        const redirectTo = typeof read.data.redirectTo === "string" ? read.data.redirectTo : undefined;
        window.location.replace(sanitizeReturnTo(redirectTo) ?? "/");
        return;
      }
      if (read.kind === "non-json" || !res.ok) {
        setError(authFailureMessage(read, t("signupPage.genericError"), t("signupPage.failed")));
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

  if (expertRefusal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-md" data-testid="signup-expert-refusal">
          <p className="text-sm text-gray-700" data-testid="text-expert-refusal">{expertRefusal.message}</p>
          <a
            href={expertRefusal.applyPath}
            data-testid="button-expert-apply-now"
            className="mt-4 block w-full bg-gray-900 text-white rounded-lg py-2.5 text-center text-sm font-semibold hover:bg-gray-700"
          >
            {WLB_SIGNUP_COPY.applyNow}
          </a>
        </div>
      </div>
    );
  }

  const providerKeep = isProvider ? providerKeepLine(keepRates) : null;
  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900";

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
              {isProvider ? WLB_SIGNUP_COPY.email : t("fields.email")}
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

          <div>
            <label htmlFor="signup-time-zone" className="text-sm font-medium text-gray-700 block mb-1">
              {t("fields.timeZone")}
            </label>
            <input
              id="signup-time-zone"
              data-testid="input-signup-time-zone"
              type="text"
              maxLength={100}
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              aria-describedby="signup-time-zone-help"
              className={inputClass}
              placeholder={t("fields.timeZonePlaceholder")}
            />
            <p id="signup-time-zone-help" className="mt-1 text-xs text-gray-600">{t("fields.timeZoneHelp")}</p>
            {suggestedTimeZone && (
              <button
                type="button"
                data-testid="button-use-browser-time-zone"
                className="mt-1 text-xs underline"
                onClick={() => setTimeZone(suggestedTimeZone)}
              >
                {t("fields.useBrowserTimeZone", { zone: suggestedTimeZone })}
              </button>
            )}
          </div>

          {isProvider && (
            <div className="space-y-4" data-testid="signup-provider-fields">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="input-provider-business">{WLB_SIGNUP_COPY.businessName}</label>
                <input id="input-provider-business" data-testid="input-provider-business" type="text" required value={provider.businessName}
                  onChange={(e) => setProvider((p) => ({ ...p, businessName: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="input-provider-category">{WLB_SIGNUP_COPY.category}</label>
                <select id="input-provider-category" data-testid="input-provider-category" required value={provider.category}
                  onChange={(e) => setProvider((p) => ({ ...p, category: e.target.value }))} className={inputClass}>
                  <option value="" />
                  {WAITLIST_SERVICE_TYPES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="input-provider-city">{WLB_SIGNUP_COPY.city}</label>
                <input id="input-provider-city" data-testid="input-provider-city" type="text" required value={provider.city}
                  onChange={(e) => setProvider((p) => ({ ...p, city: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="input-provider-website">{WLB_SIGNUP_COPY.website}</label>
                <input id="input-provider-website" data-testid="input-provider-website" type="url" value={provider.website}
                  onChange={(e) => setProvider((p) => ({ ...p, website: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1" htmlFor="input-provider-languages">{WLB_SIGNUP_COPY.languages}</label>
                <input id="input-provider-languages" data-testid="input-provider-languages" type="text" value={provider.languages}
                  onChange={(e) => setProvider((p) => ({ ...p, languages: e.target.value }))} className={inputClass} />
              </div>
              {providerKeep && <p className="text-sm text-gray-600" data-testid="text-provider-keep">{providerKeep}</p>}
              <p className="text-sm text-gray-600" data-testid="text-provider-finish-later">{WLB_SIGNUP_COPY.finishProfileLater}</p>
            </div>
          )}

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

          <p className="text-sm text-gray-600" data-testid="text-signup-payment-step">{t("registered.paymentStep")}</p>

          <button
            data-testid="button-create-account"
            onClick={handleSubmit}
            disabled={loading || (isProvider && !providerSignupReady(provider, form.email))}
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
