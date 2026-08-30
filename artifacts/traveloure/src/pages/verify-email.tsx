/**
 * Email verification landing page.
 *
 * Reads ?token=<raw> from the URL, POSTs { token } to /api/auth/verify-email,
 * and renders one of three states: verifying, success, or expired/invalid.
 * Auto-attempts verification on mount so a click-from-email user sees the
 * result without any additional interaction.
 */
import { useEffect, useState } from "react";
import { useSearch, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";

type State = "verifying" | "success" | "invalid" | "missing-token";

export default function VerifyEmailPage() {
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";
  const [state, setState] = useState<State>(token ? "verifying" : "missing-token");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (res.ok) {
          setState("success");
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
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        {state === "verifying" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                Verifying your email…
              </CardTitle>
              <CardDescription>This should only take a moment.</CardDescription>
            </CardHeader>
          </>
        )}
        {state === "success" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Email verified
              </CardTitle>
              <CardDescription>
                Your email is confirmed. You can close this window or continue to your dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/">
                <Button className="w-full" data-testid="button-verify-go-home">Go to Traveloure</Button>
              </Link>
            </CardContent>
          </>
        )}
        {state === "invalid" && (
          <>
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
          </>
        )}
        {state === "missing-token" && (
          <>
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
          </>
        )}
      </Card>
    </main>
  );
}
