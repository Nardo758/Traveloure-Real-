/**
 * Signup.tsx — Acquisition signup page (paid/affiliate traffic).
 *
 * Clerk owns registration now. This page redirects to /sign-up so acquisition
 * attribution (?ref=, ?source=) is forwarded and Clerk handles the full
 * registration flow. After sign-up, Clerk redirects to /dashboard.
 *
 * The ref/source tokens are stored in sessionStorage so the server can pick
 * them up on the first authenticated /api/auth/user call if needed.
 */
import { useEffect } from "react";

export function SignupPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refToken = params.get("ref");
    const source = params.get("source");

    // Preserve acquisition attribution across the Clerk sign-up flow.
    if (refToken) {
      try {
        sessionStorage.setItem("acquisition_ref", refToken);
      } catch {
        // best-effort
      }
    }
    if (source) {
      try {
        sessionStorage.setItem("acquisition_source", source);
      } catch {
        // best-effort
      }
    }

    const dest = `/sign-up${window.location.search ? window.location.search : ""}`;
    window.location.replace(dest);
  }, []);

  return null;
}

export default SignupPage;
