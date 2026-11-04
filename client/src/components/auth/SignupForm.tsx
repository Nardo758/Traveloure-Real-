/**
 * N-1 / N-2 / N-3 (round 2, ledger `2026-11-04-round2-exp-qa`): ONE sign-up form for the home sign-in modal and the
 * /signup page.
 *
 *   · N-2 — the same fields on both: first name, last name, email, password, and ONE required consent box
 *     ("I agree to the Terms of Service and Privacy Policy", both linked). The container adds only what is its own
 *     (the page's provider and QA fields).
 *   · N-3 — in waitlist mode a traveler is sent to the waitlist BEFORE the form renders (`useWaitlistSignupGate`); a
 *     supply sign-up and a QA sign-up are not (the server refuses on submit either way).
 *   · N-1 — the server's register answer stays neutral by ruling (AUTH-1 3b: no session, the same answer for a new and
 *     an existing address). The form then signs in with the email and password the person just typed
 *     (`signInAfterSignup`, POST /api/auth/login — the same rail as the sign-in form) and returns them to where they
 *     came from. An account that must confirm its address lands on the verify page, which says
 *     "Check your email to confirm your account."; the origin is kept so the confirmed account returns there.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Mail, Lock, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { waitlistBlockedPath } from "@shared/launch-signup";
import { readAuthResponse } from "@/lib/auth-response";
import { sanitizeReturnTo } from "@/lib/safe-return-to";

export interface SignupDraft {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  consent: boolean;
}

export const EMPTY_SIGNUP_DRAFT: SignupDraft = { firstName: "", lastName: "", email: "", password: "", consent: false };

/** Pure: may the form be sent? Every field answered and the one consent box ticked. */
export function signupDraftReady(d: SignupDraft): boolean {
  return !!d.firstName.trim() && !!d.lastName.trim() && !!d.email.trim() && d.password.length >= 8 && d.consent;
}

/** The fields both containers draw, in one order. */
export function SignupFields({ draft, onChange }: { draft: SignupDraft; onChange: (next: SignupDraft) => void }) {
  const { t } = useTranslation("auth");
  const set = (patch: Partial<SignupDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="space-y-4" data-testid="signup-fields">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="signup-first-name">{t("fields.firstName")}</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signup-first-name"
              placeholder={t("fields.firstNamePlaceholder")}
              className="pl-9"
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
              required
              data-testid="input-first-name"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-last-name">{t("fields.lastName")}</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="signup-last-name"
              placeholder={t("fields.lastNamePlaceholder")}
              className="pl-9"
              value={draft.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
              required
              data-testid="input-last-name"
            />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-email">{t("fields.email")}</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="signup-email"
            type="email"
            placeholder={t("fields.signupEmailPlaceholder")}
            className="pl-9"
            value={draft.email}
            onChange={(e) => set({ email: e.target.value })}
            required
            data-testid="input-email"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">{t("fields.password")}</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="signup-password"
            type="password"
            placeholder={t("fields.passwordPlaceholderSignup")}
            className="pl-9"
            value={draft.password}
            onChange={(e) => set({ password: e.target.value })}
            required
            minLength={8}
            data-testid="input-password"
          />
        </div>
      </div>
      <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
        <Checkbox
          id="signup-consent"
          checked={draft.consent}
          onCheckedChange={(checked) => set({ consent: checked === true })}
          required
          aria-required="true"
          data-testid="checkbox-signup-consent"
        />
        {/* N-2 (round 2 rulings, Nov 4, 2026): one required box for both agreements. */}
        <label htmlFor="signup-consent" className="cursor-pointer text-xs leading-snug" data-testid="text-signup-consent">
          I agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            Privacy Policy
          </a>
        </label>
      </div>
    </div>
  );
}

/**
 * N-3: in waitlist mode a traveler never sees the form — they are sent to the launch market's waitlist first. `exempt`
 * (a supply or QA sign-up) skips the check. Until the mode answers, "checking" (the caller draws no form); a failed
 * read shows the form (the server still refuses on submit).
 */
export function useWaitlistSignupGate(active: boolean, exempt: boolean, onRedirect?: () => void): "checking" | "form" {
  const [state, setState] = useState<"checking" | "form">(active && !exempt ? "checking" : "form");
  useEffect(() => {
    if (!active || exempt) {
      setState("form");
      return;
    }
    setState("checking");
    let cancelled = false;
    fetch("/api/public/signup-mode", { credentials: "include" })
      .then((r) => readAuthResponse(r))
      .then((read) => {
        if (cancelled) return;
        if (read.kind === "json" && read.ok && read.data.mode === "waitlist") {
          const slug = typeof read.data.launchMarketSlug === "string" ? read.data.launchMarketSlug : null;
          onRedirect?.();
          window.location.replace(waitlistBlockedPath(slug));
          return;
        }
        setState("form");
      })
      .catch(() => {
        if (!cancelled) setState("form");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, exempt]);
  return state;
}

/** Kept in localStorage: the verify link opens in a new tab, which has no sessionStorage of this one. */
export const SIGNUP_RETURN_TO_KEY = "traveloure_signup_return_to";

/** The origin a confirmed account returns to, read once (sanitized). */
export function takeSignupReturnTo(): string | null {
  try {
    const raw = localStorage.getItem(SIGNUP_RETURN_TO_KEY);
    if (raw) localStorage.removeItem(SIGNUP_RETURN_TO_KEY);
    return sanitizeReturnTo(raw ?? undefined) ?? null;
  } catch {
    return null;
  }
}

export type SignInAfterSignup =
  | { kind: "signed_in"; data: Record<string, any> }
  | { kind: "verify"; data: Record<string, any> }
  | { kind: "not_signed_in" };

/**
 * N-1: after the neutral register answer, sign in with the credentials just typed (POST /api/auth/login — no new
 * rail, no change to the register answer). A failure is "not signed in", and the caller falls back to its sign-in
 * screen exactly as before. The origin is stored first, so an account sent to confirm its address can return there.
 */
export async function signInAfterSignup(email: string, password: string, origin: string | null): Promise<SignInAfterSignup> {
  try {
    if (origin) localStorage.setItem(SIGNUP_RETURN_TO_KEY, origin);
  } catch {
    /* no store ⇒ the confirmed account goes to its home */
  }
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const read = await readAuthResponse(res);
    if (!res.ok || read.kind !== "json") return { kind: "not_signed_in" };
    return read.data.emailVerificationRequired === true ? { kind: "verify", data: read.data } : { kind: "signed_in", data: read.data };
  } catch {
    return { kind: "not_signed_in" };
  }
}

/** A container's extra fields (the page's provider and QA fields) sit between the shared fields and its button. */
export function SignupExtras({ children }: { children?: ReactNode }) {
  return children ? <div className="space-y-4">{children}</div> : null;
}
