/**
 * SignInModal — Clerk migration.
 *
 * Auth UI (sign-in, sign-up, password reset, social login) is now owned by Clerk.
 * This shell preserves the exact same prop interface so no call-site needs to change.
 * When opened, it redirects the user to the Clerk-hosted /sign-in page, optionally
 * carrying a returnTo path so they land back on the right page after authenticating.
 */
import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
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
  title = "Sign in to continue",
  description = "Create an account or sign in to access this feature and personalize your travel experience.",
  returnTo,
}: SignInModalProps) {
  const safeReturn = returnTo ? sanitizeReturnTo(returnTo) : null;

  // Optionally auto-redirect when opened programmatically.
  useEffect(() => {
    if (open && safeReturn) {
      // Store return path so /sign-in can redirect back after auth.
      try {
        sessionStorage.setItem("clerk_return_to", safeReturn);
      } catch {
        // sessionStorage not available (unlikely but defensive)
      }
    }
  }, [open, safeReturn]);

  function handleSignIn() {
    onOpenChange(false);
    const dest = safeReturn
      ? `/sign-in?redirect_url=${encodeURIComponent(safeReturn)}`
      : "/sign-in";
    window.location.href = dest;
  }

  function handleSignUp() {
    onOpenChange(false);
    const dest = safeReturn
      ? `/sign-up?redirect_url=${encodeURIComponent(safeReturn)}`
      : "/sign-up";
    window.location.href = dest;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5 text-primary" aria-hidden="true" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleSignIn} className="w-full">
            Sign in
          </Button>
          <Button variant="outline" onClick={handleSignUp} className="w-full">
            Create an account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
