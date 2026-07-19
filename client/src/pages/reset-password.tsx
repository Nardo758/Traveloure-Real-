/**
 * Reset password page (LB-P1).
 * Reads ?token= from the URL, collects new password, posts { token, newPassword } to server.
 */
import { useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const { toast } = useToast();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Invalid reset link
            </CardTitle>
            <CardDescription>
              This reset link is missing its token. Request a new one from the sign-in page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full" data-testid="button-reset-back-home">Back to sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              Password reset
            </CardTitle>
            <CardDescription>
              Your password has been updated and any active sessions have been signed out. Sign in with your new password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full" data-testid="button-reset-done-signin">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (invalidToken) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Reset link expired
            </CardTitle>
            <CardDescription>
              This reset link is invalid, has expired, or has already been used. The link is only valid for 60 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full" data-testid="button-reset-request-new">Request a new link</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Please choose a password of at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Make sure both fields are the same.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (res.ok) { setDone(true); return; }
      if (res.status === 400) { setInvalidToken(true); return; }
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `Reset failed (${res.status})`);
    } catch (err: any) {
      toast({ title: "Couldn't reset password", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Reset your password
          </CardTitle>
          <CardDescription>
            Choose a new password. This link expires 60 minutes after it was requested.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-new-password">New password</Label>
              <Input id="reset-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} autoComplete="new-password" data-testid="input-reset-new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password">Confirm new password</Label>
              <Input id="reset-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password" required minLength={8} autoComplete="new-password" data-testid="input-reset-confirm-password" />
            </div>
            <Button type="submit" className="w-full" disabled={submitting} data-testid="button-reset-submit">
              {submitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating password…</>) : (<><Lock className="mr-2 h-4 w-4" />Update password</>)}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
