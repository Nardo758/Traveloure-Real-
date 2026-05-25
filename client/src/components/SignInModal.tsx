import { useState, useEffect } from "react";
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
import { LogIn, Shield, Sparkles, Heart, Mail, Lock, User, Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export const RETURN_TO_KEY = "signInReturnTo";

interface SignInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  defaultMode?: "signin" | "signup";
  returnTo?: string;
}

export function SignInModal({
  open,
  onOpenChange,
  title,
  description,
  defaultMode = "signin",
  returnTo,
}: SignInModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);

  const resolvedTitle = title ?? (mode === "signup" ? "Create your account" : "Sign in to continue");
  const resolvedDescription = description ?? (mode === "signup"
    ? "Join Traveloure and start planning unforgettable experiences."
    : "Create an account or sign in to access this feature and personalize your travel experience.");
  const [isLoading, setIsLoading] = useState(false);
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

  // Reset mode to defaultMode every time the modal opens
  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setAcceptTerms(false);
      setAcceptPrivacy(false);
      setFormData({ email: "", password: "", firstName: "", lastName: "" });
    }
  }, [open, defaultMode]);

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

      let data: any = {};
      try { data = await response.json(); } catch { /* non-JSON body (e.g. 502/rate-limit) */ }

      if (!response.ok) {
        throw new Error(data.message || (response.status === 429 ? "Too many attempts — please wait and try again" : "Authentication failed"));
      }

      // Invalidate user query to refresh auth state
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: mode === "signin" ? "Welcome back!" : "Account created!",
        description: data.message,
      });

      onOpenChange(false);

      // Save returnTo in sessionStorage so ReturnToHandler can recover it
      // even if the user passes through /accept-terms before landing
      const dest = returnTo || "/dashboard";
      if (dest !== "/dashboard") {
        sessionStorage.setItem(RETURN_TO_KEY, dest);
      }
      window.location.href = dest;
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

  const handleReplitSignIn = () => {
    const dest = returnTo || window.location.pathname + window.location.search;
    if (dest && dest !== "/dashboard") {
      sessionStorage.setItem(RETURN_TO_KEY, dest);
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
            {resolvedTitle}
          </DialogTitle>
          <DialogDescription className="text-center" data-testid="text-sign-in-description">
            {resolvedDescription}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
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
          </div>

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
                {mode === "signin" ? "Signing in..." : "Creating account..."}
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                {mode === "signin" ? "Sign In" : "Create Account"}
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
            {mode === "signin" ? (
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
      </DialogContent>
    </Dialog>
  );
}
