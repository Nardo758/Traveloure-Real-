import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "./use-auth";

/**
 * Automatically claims an orphaned guest concierge request after any auth
 * method (email/password OR OAuth/social login).
 *
 * On every auth-state change, if the user just became authenticated and
 * sessionStorage holds a pending request + claim token, this hook fires the
 * claim and then navigates to /my-events (or the stored returnTo path).
 *
 * Call from a top-level component (App Router) so it runs regardless of
 * which page the user lands on after sign-in.
 */
export function useClaimGuestConcierge() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const claimedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    if (claimedRef.current) return;

    const requestId = sessionStorage.getItem("guestConciergeRequestId");
    if (!requestId) return;

    claimedRef.current = true;

    const claimToken = sessionStorage.getItem("guestConciergeClaimToken") ?? undefined;
    const returnTo = sessionStorage.getItem("traveloure_return_to");

    (async () => {
      try {
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
          console.warn("[concierge] Post-auth claim returned", res.status);
          claimedRef.current = false;
          return;
        }
      } catch (err) {
        console.warn("[concierge] Post-auth claim failed", err);
        claimedRef.current = false;
        return;
      }

      // Navigate to the intended destination after a successful claim.
      const destination = returnTo === "/my-events" ? "/my-events" : null;
      if (destination) {
        sessionStorage.removeItem("traveloure_return_to");
        navigate(destination);
      }
    })();
  }, [user?.id, navigate]);
}
