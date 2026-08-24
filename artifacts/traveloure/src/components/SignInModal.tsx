import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { LogIn, Mail, Lock, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getRoleHomePath } from "@/lib/role-utils";
import { sanitizeReturnTo } from "@/lib/safe-return-to";

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  returnTo?: string;
}

export function SignInModal({
  open,
  onOpenChange,
  title: titleProp,
  description: descriptionProp,
  returnTo,
}: SignInModalProps) {
  const { t } = useTranslation("auth");
  // Ruling 60 Phase A: the sign-in title/description are OVERRIDABLE by the caller (a
  // context-specific prompt like "Sign in to save this trip"). Only the DEFAULTS are chrome and
  // therefore translated — a caller-supplied string is passed through untouched, because the
  // platform cannot translate copy it did not author.
  const title = titleProp ?? t("modal.titleSignInDefault");
  const description = descriptionProp ?? t("modal.descSignInDefault");
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
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

  const showValidationError = (message: string, fieldId: string) => {
    setAuthError(message);
    requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
  };

  const validateForm = (): boolean => {
    const email = formData.email;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showValidationError("Enter a valid email address.", "email");
      return false;
    }
    if (mode !== "reset" && formData.password.length < (mode === "signup" ? 8 : 1)) {
      showValidationError(
        mode === "signup" ? "Password must be at least 8 characters." : "Enter your password.",
        "password",
      );
      return false;
    }
    if (mode === "signup" && !formData.firstName.trim()) {
      showValidationError("Enter your first name.", "firstName");
      return false;
    }
    if (mode === "signup" && !formData.lastName.trim()) {
      showValidationError("Enter your last name.", "lastName");
      return false;
    }
    return true;
  };

  const migrateGuestCart = async () => {
    try {
      const guestSessionId = localStorage.getItem("traveloure_guest_session");
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

  const claimGuestConcierge = async () => {
    try {
      const requestId = sessionStorage.getItem("guestConciergeRequestId");
      if (!requestId) return;
      const claimToken = sessionStorage.getItem("guestConciergeClaimToken") ?? undefined;
      const res = await fetch(`/api/concierge/requests/${requestId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ claimToken }),
      });
      if (res.ok) {
        sessionStorage.removeItem("guestConciergeRequestId");
        sessionStorage.removeItem("guestConciergeClaimToken");
      } else {
        console.warn("[concierge] Guest concierge claim returned", res.status);
      }
    } catch (err) {
      console.warn("[concierge] Guest concierge claim failed", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    if (mode === "signup" && (!acceptTerms || !acceptPrivacy)) {
      setAuthError("You must accept the Terms of Service and Privacy Policy to create an account.");
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
        : formData;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Authentication failed");
      }

      await Promise.all([migrateGuestCart(), claimGuestConcierge()]);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: mode === "signin" ? "Welcome back!" : "Account created!",
        description: data.message,
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
      const msg = error.message || "Something went wrong";
      // TEST 10 — set in-DOM error for aria-live announcement; also toast for visual users
      setAuthError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });
      setResetSent(true);
    } catch {
      setResetSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReplitSignIn = () => {
    if (returnTo) {
      sessionStorage.setItem("traveloure_return_to", returnTo);
    }
    window.location.href = "/api/login";
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
            noValidate
          >
            {/* TEST 10 — aria-live="assertive" announces auth errors to screen readers immediately */}
            {authError && (
              <div
                id="auth-form-error"
                role="alert"
                aria-live="assertive"
                className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2"
                data-testid="text-auth-error"
              >
                {authError}
              </div>
            )}

            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("fields.firstName")}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="firstName"
                      placeholder={t("fields.firstNamePlaceholder")}
                      className="pl-9"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      aria-invalid={authError?.includes("first name") || undefined}
                      aria-describedby={authError ? "auth-form-error" : undefined}
                      required
                      data-testid="input-first-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("fields.lastName")}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lastName"
                      placeholder={t("fields.lastNamePlaceholder")}
                      className="pl-9"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      aria-invalid={authError?.includes("last name") || undefined}
                      aria-describedby={authError ? "auth-form-error" : undefined}
                      required
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t("fields.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t("fields.emailPlaceholder")}
                  className="pl-9"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  aria-invalid={authError?.toLowerCase().includes("email") || undefined}
                  aria-describedby={authError ? "auth-form-error" : undefined}
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
                    type="password"
                    placeholder={mode === "signup" ? t("fields.passwordPlaceholderSignup") : t("fields.passwordPlaceholderSignin")}
                    className="pl-9"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    aria-invalid={authError?.toLowerCase().includes("password") || undefined}
                    aria-describedby={authError ? "auth-form-error" : undefined}
                    required
                    minLength={mode === "signup" ? 8 : 1}
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

            {mode === "signup" && (
              <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="signup-terms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                    data-testid="checkbox-signup-terms"
                  />
                  <label htmlFor="signup-terms" className="text-xs leading-snug cursor-pointer">
                    {t("consent.agreePrefix")}{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      {t("consent.terms")}
                    </a>
                  </label>
                </div>
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="signup-privacy"
                    checked={acceptPrivacy}
                    onCheckedChange={(checked) => setAcceptPrivacy(checked === true)}
                    data-testid="checkbox-signup-privacy"
                  />
                  <label htmlFor="signup-privacy" className="text-xs leading-snug cursor-pointer">
                    {t("consent.agreePrefix")}{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      {t("consent.privacy")}
                    </a>
                  </label>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading || (mode === "signup" && (!acceptTerms || !acceptPrivacy))}
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
                <>
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
      </DialogContent>
    </Dialog>
  );
}
