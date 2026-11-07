import { useState, useEffect } from "react";
import { useTravelerSignupShown } from "@/lib/signup-mode";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import { isRegistrationNeutral } from "@shared/registration-neutral";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { authFailureMessage, readAuthResponse } from "@/lib/auth-response";
import { getRoleHomePath } from "@/lib/role-utils";
import { sanitizeReturnTo } from "@/lib/safe-return-to";
import { TRAVELER_WAITLIST, type SignupIntent } from "@shared/launch-signup";
import { socialSignInHref, supplySourceTag } from "@/lib/social-sign-in";
import {
  EMPTY_SIGNUP_DRAFT,
  SignupFields,
  signInAfterSignup,
  signupDraftReady,
  takeSignupReturnTo,
  useWaitlistSignupGate,
  type SignupDraft,
} from "@/components/auth/SignupForm";
import { GUEST_SESSION_STORAGE_KEY } from "@/lib/guest-session-key";

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  returnTo?: string;
  /**
   * Step 8d: an optional plain way out ("Keep browsing" on the guest map's gate). It only closes the
   * modal; it signs nothing in and writes nothing. Absent ⇒ the modal is exactly as before.
   */
  dismissLabel?: string;
  /** LW-1b: `supply` when opened from a door for people offering services (passes the traveler waitlist). */
  intent?: SignupIntent;
}

export function SignInModal({
  open,
  onOpenChange,
  title: titleProp,
  description: descriptionProp,
  returnTo,
  dismissLabel,
  intent,
}: SignInModalProps) {
  const { t } = useTranslation("auth");
  // A-7 (Lane 2): a traveler is not offered sign-up in waitlist mode; a supply sign-up (provider / expert) still is.
  const travelerSignupShown = useTravelerSignupShown() || intent === "supply";
  // Ruling 60 Phase A: the sign-in title/description are OVERRIDABLE by the caller (a
  // context-specific prompt like "Sign in to save this trip"). Only the DEFAULTS are chrome and
  // therefore translated — a caller-supplied string is passed through untouched, because the
  // platform cannot translate copy it did not author.
  const title = titleProp ?? t("modal.titleSignInDefault");
  // R3-27: in waitlist mode the default line offers no account creation (A-7) — "Sign in to continue." only.
  const description = descriptionProp ?? t(travelerSignupShown ? "modal.descSignInDefault" : "modal.descSignInWaitlist");
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // AUTH-1 fix 3b: a sign-up gets the server's neutral answer — no session, so no guest claim, no navigation and
  // no "Account created". Guest state and the return destination wait for an actual sign-in.
  // N-2 (round 2): the sign-up fields are the shared form's (one consent box), the same as /signup.
  const [signupDraft, setSignupDraft] = useState<SignupDraft>(EMPTY_SIGNUP_DRAFT);
  // N-3 (round 2): in waitlist mode a traveler is sent to the waitlist before the sign-up form renders.
  const signupGate = useWaitlistSignupGate(open && mode === "signup", intent === "supply", () => onOpenChange(false));
  // TEST 10 — aria-live error: screen readers need an in-DOM alert, not just a toast
  const [authError, setAuthError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Clear inline error whenever the user switches sign-in mode
  useEffect(() => { setAuthError(null); }, [mode]);

  const migrateGuestCart = async () => {
    try {
      const guestSessionId = localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
      if (!guestSessionId) return;
      const res = await fetch("/api/cart/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestSessionId }),
        credentials: "include",
      });
      if (!res.ok) {
        console.warn("[cart] Guest cart migration returned", res.status);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    } catch (err) {
      console.warn("[cart] Guest cart migration failed", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup" && !signupDraft.consent) {
      toast({
        title: "Please accept the agreements",
        description: "You must accept the Terms of Service and Privacy Policy to create an account.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "signin"
        ? { email: formData.email, password: formData.password }
        : {
            firstName: signupDraft.firstName,
            lastName: signupDraft.lastName,
            email: signupDraft.email,
            password: signupDraft.password,
            consent: signupDraft.consent,
            ...(intent === "supply" ? { intent } : {}),
            // LW-1d: the supply door's `?source=` tag, stored once on the new account by the server.
            ...(intent === "supply" && supplySourceTag(window.location.search)
              ? { signupSource: supplySourceTag(window.location.search) }
              : {}),
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const read = await readAuthResponse(response);
      const genericError = t("signupPage.genericError");

      // N-1 (round 2): the register answer stays neutral (AUTH-1 3b). The form then signs in with the credentials
      // just typed and returns the person to where they came from; an address to confirm goes to the verify page.
      // A sign-in that fails falls back to the sign-in screen, as before.
      if (mode === "signup" && read.kind === "json" && isRegistrationNeutral(response.status, read.data)) {
        const sessionOrigin = sessionStorage.getItem("traveloure_return_to");
        const origin =
          sanitizeReturnTo(returnTo) ?? sanitizeReturnTo(sessionOrigin ?? undefined) ?? sanitizeReturnTo(`${window.location.pathname}${window.location.search}`) ?? null;
        const after = await signInAfterSignup(signupDraft.email, signupDraft.password, origin);
        if (after.kind === "not_signed_in") {
          setFormData((f) => ({ ...f, email: signupDraft.email, password: "" }));
          setMode("signin");
          return;
        }
        if (sessionOrigin) sessionStorage.removeItem("traveloure_return_to");
        if (after.kind === "verify") {
          queryClient.setQueryData(["/api/auth/user"], {
            ...(after.data.user ?? {}),
            emailVerificationRequired: true,
            nextStep: typeof after.data.nextStep === "string" ? after.data.nextStep : "verify_email",
          });
          onOpenChange(false);
          window.location.href = "/verify-email";
          return;
        }
        await migrateGuestCart();
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        onOpenChange(false);
        window.location.href = takeSignupReturnTo() ?? origin ?? getRoleHomePath(after.data.user?.role ?? "user");
        return;
      }

      if (read.kind === "non-json" || !response.ok) {
        // LW-1b: traveler sign-up is waitlist-only — go to the waitlist page the server named. No email in the URL.
        if (read.kind === "json" && response.status === 403 && read.data.code === TRAVELER_WAITLIST) {
          const redirectTo = typeof read.data.redirectTo === "string" ? read.data.redirectTo : undefined;
          onOpenChange(false);
          window.location.href = sanitizeReturnTo(redirectTo) ?? "/";
          return;
        }
        throw new Error(authFailureMessage(read, genericError, "Authentication failed"));
      }
      // Only a sign-in reaches here with a session. A sign-up answered with anything but the neutral contract is
      // not treated as signed in.
      if (mode !== "signin" || read.kind !== "json") throw new Error("Authentication failed");
      const data = read.data;

      if (data.emailVerificationRequired === true) {
        queryClient.setQueryData(["/api/auth/user"], {
          ...(data.user ?? {}),
          emailVerificationRequired: true,
          nextStep: typeof data.nextStep === "string" ? data.nextStep : "verify_email",
        });
        onOpenChange(false);
        window.location.href = "/verify-email";
        return;
      }

      await migrateGuestCart();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: "Welcome back!",
        description: typeof data.message === "string" ? data.message : undefined,
      });

      onOpenChange(false);

      const sessionReturnTo = sessionStorage.getItem("traveloure_return_to");
      if (sessionReturnTo) sessionStorage.removeItem("traveloure_return_to");

      const role = data.user?.role ?? "user";
      // Sanitize at redirect time so a crafted returnTo (e.g. "/\evil.com")
      // can never navigate off-site, regardless of where the value came from.
      const safeDest =
        sanitizeReturnTo(returnTo) ?? sanitizeReturnTo(sessionReturnTo);
      window.location.href = safeDest ?? getRoleHomePath(role);
    } catch (error: any) {
      const msg = error.message || t("signupPage.genericError");
      // TEST 10 — set in-DOM error for aria-live announcement; also toast for visual users
      setAuthError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });
      const read = await readAuthResponse(response);
      if (read.kind === "non-json") {
        const msg = t("signupPage.genericError");
        setAuthError(msg);
        toast({ title: "Error", description: msg, variant: "destructive" });
        return;
      }
      setResetSent(true);
    } catch {
      setResetSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplitSignIn = () => {
    // Every role returns to the door's path, or to the page the guest is on when the door
    // names none. A bare /api/login drops that path and the callback falls through to /dashboard.
    const here = `${window.location.pathname}${window.location.search}`;
    const dest = sanitizeReturnTo(returnTo) ?? sanitizeReturnTo(here);
    if (dest) sessionStorage.setItem("traveloure_return_to", dest);
    window.location.href = socialSignInHref("/api/login", {
      intent,
      returnTo: dest,
      source: supplySourceTag(window.location.search),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-sign-in">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <LogIn className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl" data-testid="text-sign-in-title">
            {mode === "reset" ? t("modal.titleReset") : mode === "signin" ? title : t("modal.titleSignup")}
          </DialogTitle>
          <DialogDescription className="text-center" data-testid="text-sign-in-description">
            {mode === "reset" ? t("modal.descReset") : mode === "signin" ? description : t("modal.descSignup")}
          </DialogDescription>
          <p className="text-center text-xs text-muted-foreground" data-testid="text-signin-provider-guidance">
            If you normally use a sign-in provider, use its sign-in button.
          </p>
        </DialogHeader>

        {mode === "reset" && resetSent ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium text-gray-900">{t("modal.resetSentTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("modal.resetSentBody")}</p>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => { setResetSent(false); setMode("signin"); }}
              data-testid="link-back-signin-sent"
            >
              {t("modal.backToSignIn")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={mode === "reset" ? handleForgotPassword : handleSubmit}
            className="space-y-4 py-4"
            onChange={() => setAuthError(null)}
          >
            {/* TEST 10 — aria-live="assertive" announces auth errors to screen readers immediately */}
            {authError && (
              <div
                role="alert"
                aria-live="assertive"
                className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2"
                data-testid="text-auth-error"
              >
                {authError}
              </div>
            )}

            {mode === "signup" && signupGate === "checking" ? (
              <div className="flex justify-center py-6" data-testid="signup-gate-checking">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : null}
            {mode === "signup" && signupGate === "form" ? <SignupFields draft={signupDraft} onChange={setSignupDraft} /> : null}

            {mode !== "signup" && (
            <>
            <div className="space-y-2">
              <Label htmlFor="email">{t("fields.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder={t("fields.emailPlaceholder")}
                  className="pl-9"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  data-testid="input-email"
                />
              </div>
            </div>

            {mode !== "reset" && (
              <div className="space-y-2">
                <Label htmlFor="password">{t("fields.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("fields.passwordPlaceholderSignin")}
                    className="pl-9"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={1}
                    data-testid="input-password"
                  />
                </div>
                {mode === "signin" && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setMode("reset")}
                    data-testid="link-forgot-password"
                  >
                    {t("fields.forgotPassword")}
                  </button>
                )}
              </div>
            )}
            </>
            )}

            {mode === "signup" && signupGate === "form" && (
              <p className="text-sm text-muted-foreground" data-testid="text-signup-payment-step">{t("registered.paymentStep")}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading || (mode === "signup" && (signupGate !== "form" || !signupDraftReady(signupDraft)))}
              data-testid="button-auth-submit"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === "reset" ? t("submit.sendingLink") : mode === "signin" ? t("submit.signingIn") : t("submit.creatingAccount")}
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  {mode === "reset" ? t("submit.sendResetLink") : mode === "signin" ? t("submit.signIn") : t("submit.createAccount")}
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("modal.or")}</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleReplitSignIn}
              data-testid="button-social-login"
            >
              {t("modal.socialLogin")}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              {mode === "reset" ? (
                <>
                  {t("modal.rememberPassword")}{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("signin")}
                    data-testid="link-back-signin"
                  >
                    {t("modal.backToSignIn")}
                  </button>
                </>
              ) : mode === "signin" ? (
                // A-7 (Lane 2): no traveler sign-up offer in waitlist mode (`useTravelerSignupShown`).
                !travelerSignupShown ? null : <>
                  {t("modal.noAccount")}{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("signup")}
                    data-testid="link-switch-signup"
                  >
                    {t("modal.switchToSignUp")}
                  </button>
                </>
              ) : (
                <>
                  {t("modal.haveAccount")}{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("signin")}
                    data-testid="link-switch-signin"
                  >
                    {t("modal.switchToSignIn")}
                  </button>
                </>
              )}
            </p>
          </form>
        )}
        {dismissLabel ? (
          <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)} data-testid="button-signin-dismiss">
            {dismissLabel}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
