/**
 * Email verification landing page.
 *
 * A token in the URL is posted to /api/auth/verify-email (single-use, expiring,
 * idempotent on the server). A signed-in account that still has to verify stays
 * on this screen: resend, change email, sign out. No other product surface.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useSearch, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getRoleHomePath } from "@/lib/role-utils";
import { readAuthResponse } from "@/lib/auth-response";
import { emailVerificationHoldRequired } from "@/lib/email-verification-hold";

type State = "verifying" | "success" | "invalid" | "unavailable" | "missing-token";

export default function VerifyEmailPage() {
  const { t } = useTranslation("auth");
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const [state, setState] = useState<State>(token ? "verifying" : "missing-token");
  const { user, isLoading, isError, logout } = useAuth();
  const queryClient = useQueryClient();
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "wait" | "error">("idle");
  const [changeEmail, setChangeEmail] = useState("");
  const [changeState, setChangeState] = useState<"idle" | "sending" | "sent" | "wait" | "error">("idle");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        const read = await readAuthResponse(res);
        if (cancelled) return;
        if (res.ok && read.kind === "json") {
          queryClient.setQueryData(["/api/auth/user"], (prev: unknown) => {
            if (!prev || typeof prev !== "object") return prev;
            return { ...(prev as object), emailVerificationRequired: false, nextStep: null };
          });
          setState("success");
        } else if (read.kind === "non-json") {
          setState("unavailable");
        } else {
          setState("invalid");
        }
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, queryClient]);

  const homeHref = user?.role ? getRoleHomePath(user.role) : "/";
  const showHold = !token && !isLoading && emailVerificationHoldRequired(user);
  const email = typeof user?.email === "string" ? user.email : "";

  const resend = async () => {
    setResendState("sending");
    try {
      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 429) {
        setResendState("wait");
        return;
      }
      const read = await readAuthResponse(res);
      if (!res.ok || read.kind === "non-json") setResendState("error");
      else setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  const change = async (event: FormEvent) => {
    event.preventDefault();
    setChangeState("sending");
    try {
      const res = await fetch("/api/auth/change-unverified-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: changeEmail }),
      });
      if (res.status === 429) {
        setChangeState("wait");
        return;
      }
      const read = await readAuthResponse(res);
      if (!res.ok || read.kind === "non-json") setChangeState("error");
      else {
        setChangeState("sent");
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }
    } catch {
      setChangeState("error");
    }
  };

  if (token && state === "verifying") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              Verifying your email…
            </CardTitle>
            <CardDescription>This should only take a moment.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (token && state === "success") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              Email confirmed
            </CardTitle>
            <CardDescription>
              Your email is confirmed. You can close this window or continue to your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={homeHref}>
              <Button className="w-full" data-testid="button-verify-go-home">Go to Traveloure</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (token && state === "unavailable") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2" data-testid="text-verify-unavailable">
              <AlertCircle className="w-5 h-5 text-destructive" />
              {t("signupPage.genericError")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full" data-testid="button-verify-unavailable">Back to sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (token && state === "invalid") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Verification link expired
            </CardTitle>
            <CardDescription>
              This link is invalid, has expired, or has already been used. Verification links are
              valid for 24 hours. Sign in to request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full" data-testid="button-verify-back">Back to sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!token && isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              Verifying your email…
            </CardTitle>
            <CardDescription>This should only take a moment.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!token && isError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("verifyHold.title")}</CardTitle>
            <CardDescription>{t("verifyHold.checkFailed")}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (showHold) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md" data-testid="verify-hold">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              {t("verifyHold.title")}
            </CardTitle>
            <CardDescription>
              {email ? t("verifyHold.body", { email }) : t("verifyHold.bodyNoEmail")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {email && (
              <p className="text-sm font-medium" data-testid="text-verify-email">{email}</p>
            )}
            <Button
              type="button"
              className="w-full"
              onClick={resend}
              disabled={resendState === "sending"}
              data-testid="button-resend-verification"
            >
              {resendState === "sending" ? t("verifyHold.resending") : t("verifyHold.resend")}
            </Button>
            {resendState === "sent" && (
              <p className="text-sm text-muted-foreground" data-testid="text-resend-result">{t("verifyHold.resendResult")}</p>
            )}
            {resendState === "wait" && (
              <p className="text-sm text-muted-foreground" data-testid="text-resend-result">{t("verifyHold.rateLimited")}</p>
            )}
            {resendState === "error" && (
              <p className="text-sm text-muted-foreground" data-testid="text-resend-result">{t("signupPage.genericError")}</p>
            )}
            <form onSubmit={change} className="space-y-2">
              <label className="text-sm font-medium" htmlFor="change-email">{t("verifyHold.changeLabel")}</label>
              <input
                id="change-email"
                type="email"
                required
                value={changeEmail}
                onChange={(e) => setChangeEmail(e.target.value)}
                placeholder={t("fields.emailPlaceholder")}
                data-testid="input-change-email"
                className="w-full border border-input rounded-md px-3 py-2 text-sm"
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={changeState === "sending"}
                data-testid="button-change-email"
              >
                {changeState === "sending" ? t("verifyHold.changing") : t("verifyHold.changeSubmit")}
              </Button>
              {changeState === "sent" && (
                <p className="text-sm text-muted-foreground" data-testid="text-change-result">{t("verifyHold.changeResult")}</p>
              )}
              {changeState === "wait" && (
                <p className="text-sm text-muted-foreground" data-testid="text-change-result">{t("verifyHold.rateLimited")}</p>
              )}
              {changeState === "error" && (
                <p className="text-sm text-muted-foreground" data-testid="text-change-result">{t("signupPage.genericError")}</p>
              )}
            </form>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              data-testid="button-verify-sign-out"
              onClick={() => logout()}
            >
              {t("verifyHold.signOut")}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-destructive" />
            Missing token
          </CardTitle>
          <CardDescription>
            This verification link is missing its token. Open the link from your email exactly
            as we sent it, or request a new one from the sign-in page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/">
            <Button className="w-full" data-testid="button-verify-missing-back">Back to sign in</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
