import { useState } from "react";
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
  title = "Sign in to continue",
  description = "Create an account or sign in to access this feature and personalize your travel experience.",
  returnTo,
}: SignInModalProps) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      sessionStorage.removeItem("guestConciergeRequestId");
      await fetch(`/api/concierge/requests/${requestId}/claim`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.warn("[concierge] Guest concierge claim failed", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup" && (!acceptTerms || !acceptPrivacy)) {
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
      window.location.href = returnTo ?? sessionReturnTo ?? getRoleHomePath(role);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) return;
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
            {mode === "reset" ? "Reset your password" : mode === "signin" ? title : "Create your account"}
          </DialogTitle>
          <DialogDescription className="text-center" data-testid="text-sign-in-description">
            {mode === "reset" ? "Enter your email and we'll send you a reset link." : mode === "signin" ? description : "Join Traveloure to start planning your perfect trip."}
          </DialogDescription>
        </DialogHeader>

        {mode === "reset" && resetSent ? (
          <div className="py-6 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium text-gray-900">Check your inbox</p>
            <p className="text-sm text-muted-foreground">
              If that email is registered, we've sent a reset link. It expires in 60 minutes.
            </p>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => { setResetSent(false); setMode("signin"); }}
              data-testid="link-back-signin-sent"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={mode === "reset" ? handleForgotPassword : handleSubmit} className="space-y-4 py-4">
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="firstName"
                      placeholder="John"
                      className="pl-9"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                      data-testid="input-first-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      className="pl-9"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
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
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={mode === "signup" ? "Min 8 characters" : "••••••••"}
                    className="pl-9"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                    Forgot password?
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
                    I have read and agree to the{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      Terms of Service
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
                    I have read and agree to the{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                      Privacy Policy
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
                  {mode === "reset" ? "Sending link..." : mode === "signin" ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  {mode === "reset" ? "Send reset link" : mode === "signin" ? "Sign In" : "Create Account"}
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleReplitSignIn}
              data-testid="button-social-login"
            >
              Continue with Social Login
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              {mode === "reset" ? (
                <>
                  Remember your password?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("signin")}
                    data-testid="link-back-signin"
                  >
                    Back to Sign In
                  </button>
                </>
              ) : mode === "signin" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("signup")}
                    data-testid="link-switch-signup"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setMode("signin")}
                    data-testid="link-switch-signin"
                  >
                    Sign in
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
