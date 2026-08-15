import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import {
  clearTripContext,
  getContextOwner,
  pushTripContextNow,
  setContextOwner,
} from "@/lib/trip-context";

/**
 * sessionStorage key that marks the current session as guest-authored.
 *
 * Set ONLY when auth has finished loading and we know the user is genuinely
 * unauthenticated (not just still fetching). This prevents the initial
 * loading state (user=null, isLoading=true) from being misclassified as a
 * guest session, which would cause legacy markerless authenticated contexts
 * to be pushed to the wrong account once auth resolves.
 *
 * Cleared on sign-in. Retained across guest writes so the sign-in handler
 * can distinguish fresh guest content from pre-feature legacy contexts that
 * have no ownership stamp.
 */
const GUEST_PROVENANCE_KEY = "trip-context-guest-provenance";

/**
 * Manages trip context ownership across sign-in and sign-out transitions.
 *
 * On sign-in (confirmed-unauthenticated → authenticated):
 *   - Stamps ownership immediately so post-sign-in writes are always attributed.
 *   - Pushes guest context to the server only when GUEST_PROVENANCE_KEY is set
 *     (i.e., explicitly built during a confirmed-unauthenticated session).
 *   - Skips push for same-user returning (already in sync).
 *   - Clears cross-account remnants without pushing.
 *   - Skips push for markerless legacy contexts (unknown provenance — safe no-op).
 *
 * On sign-out (authenticated → confirmed-unauthenticated, isLoading=false):
 *   - Clears both the local context and the ownership stamp so subsequent
 *     guest writes start clean.
 *   - Sets GUEST_PROVENANCE_KEY so those writes are later identifiable as
 *     safe to push.
 *
 * Auth loading gate: all state transitions are gated on isLoading===false so
 * the transient null/undefined user during the initial auth fetch is never
 * misclassified as a guest session or logout.
 *
 * Retry: prevUserIdRef tracks the previous resolved userId. On logout it
 * resets to null so a subsequent sign-in re-enters the sign-in branch.
 *
 * Call from a top-level component (e.g. Router in App.tsx).
 */
export function useSyncTripContextOnSignIn(): void {
  const { user, isLoading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Do nothing while auth is still fetching — we cannot yet distinguish
    // "genuinely unauthenticated" from "still loading".
    if (isLoading) return;

    const userId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (!userId) {
      if (prevUserId !== null) {
        // Explicit logout (confirmed: auth resolved to null after being set).
        // Clear context and stamp so the subsequent guest session starts clean.
        clearTripContext();
        setContextOwner(null);
      }
      // Auth is resolved and user is definitely unauthenticated — mark this
      // as a guest session so planning built now is identifiable as safe to
      // push on a future sign-in.
      try {
        sessionStorage.setItem(GUEST_PROVENANCE_KEY, "1");
      } catch {
        /* ignore storage errors (private browsing, quota) */
      }
      return;
    }

    // Auth resolved to an authenticated user. Only act on a sign-in transition.
    if (userId === prevUserId) return;

    const owner = getContextOwner();
    const hasGuestProvenance =
      sessionStorage.getItem(GUEST_PROVENANCE_KEY) === "1";

    // Clear the guest-provenance flag — the session is now authenticated.
    try {
      sessionStorage.removeItem(GUEST_PROVENANCE_KEY);
    } catch {
      /* ignore */
    }

    // Stamp ownership immediately — before the push attempt — so any planning
    // the user creates after signing in is attributed to them even if the
    // context was empty or the push below fails.
    setContextOwner(userId);

    if (owner === userId) {
      // Same user returning (e.g. page reload while authenticated).
      // Context already stamped and in sync — no push needed.
      return;
    }

    if (owner !== null) {
      // Cross-account remnant: a different user's stamped context is present.
      // Clear it (stamp already updated above). Do not push.
      clearTripContext();
      return;
    }

    // owner is null: unowned context. Only push if it was explicitly built
    // during a confirmed guest session (provenance flag is set). Without
    // the flag we cannot rule out a legacy pre-feature context that was
    // created by an authenticated user — pushing it would leak their data.
    if (!hasGuestProvenance) return;

    // Genuine guest context: deliver to the server so pre-sign-in planning
    // is not lost. keepalive:true survives immediate tab close after sign-in.
    pushTripContextNow().catch(() => {
      /* offline — best-effort; ownership stamp already protects post-sign-in writes */
    });
  }, [user?.id, isLoading]);
}
