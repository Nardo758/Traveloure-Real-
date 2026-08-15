import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import {
  clearGuestProvenance,
  clearTripContext,
  confirmGuestSession,
  endGuestSession,
  getContextOwner,
  hasGuestProvenance,
  pushTripContextNow,
  setContextOwner,
} from "@/lib/trip-context";

/**
 * Manages trip context ownership across sign-in and sign-out transitions.
 *
 * ## How guest provenance works
 * `trip-context.ts` maintains two pieces of state:
 *
 * 1. `guestSessionConfirmed` (in-memory) — set to true by this hook when auth
 *    has *resolved* to unauthenticated (isLoading=false, user=null). Only when
 *    this flag is true do `updateTripContext`/`switchTripContext` mark writes
 *    with the sessionStorage GUEST_PROVENANCE_KEY. This prevents auth-loading-
 *    time writes (e.g. template pages mounting effects before `/api/auth/user`
 *    resolves) from marking a legacy authenticated context as guest-authored.
 *
 * 2. `GUEST_PROVENANCE_KEY` (sessionStorage) — persists within the tab session
 *    so that a write-then-reload-then-sign-in flow still delivers the context.
 *    Cleared by this hook on sign-in and by `clearTripContext` on logout.
 *
 * ## Sign-in transition (isLoading=false, null → userId)
 *   - Calls `endGuestSession()` so subsequent writes are no longer marked.
 *   - Stamps ownership immediately (before push) so post-sign-in writes are
 *     always attributed even if the context is empty or the push fails.
 *   - Pushes context only when GUEST_PROVENANCE_KEY is set (written during a
 *     confirmed guest session). Markerless legacy contexts are skipped.
 *   - Clears cross-account remnants (different owner stamp) without pushing.
 *   - Skips push for same-user returning (already in sync).
 *
 * ## Sign-out transition (isLoading=false, userId → null)
 *   - Clears context + owner stamp via clearTripContext + setContextOwner(null).
 *   - Calls `confirmGuestSession()` so subsequent writes mark provenance.
 *
 * ## Auth-loading gate
 *   All transitions require isLoading=false. The transient null during the
 *   initial fetch is never misclassified as a guest session or logout.
 *
 * ## Retry
 *   prevUserIdRef resets to null on logout, so a re-sign-in re-enters the
 *   sign-in branch and can retry a failed push without any explicit reset.
 *
 * Call from a top-level component (e.g. Router in App.tsx).
 */
export function useSyncTripContextOnSignIn(): void {
  const { user, isLoading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Do nothing while auth is still resolving — cannot distinguish
    // "genuinely unauthenticated" from "still loading".
    if (isLoading) return;

    const userId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (!userId) {
      if (prevUserId !== null) {
        // Explicit logout (auth resolved to null after being authenticated).
        // Clear context + stamp so the subsequent guest session starts clean.
        // clearTripContext() also clears GUEST_PROVENANCE_KEY so fresh writes
        // can re-establish it.
        clearTripContext();
        setContextOwner(null);
      }
      // Auth has now confirmed unauthenticated — enable provenance marking for
      // subsequent writes via updateTripContext/switchTripContext.
      confirmGuestSession();
      return;
    }

    // userId is non-null. Only act on a sign-in transition.
    if (userId === prevUserId) return;

    // Stop marking new writes as guest-authored.
    endGuestSession();

    // Capture provenance and read owner stamp BEFORE overwriting.
    const guestWroteContext = hasGuestProvenance();
    const owner = getContextOwner();

    // Clear provenance flag — session is now authenticated.
    clearGuestProvenance();

    // Stamp ownership immediately — before any push — so planning built after
    // sign-in is attributed to this user even if the context is empty or the
    // network push fails.
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

    // owner is null. Only push if provenance was explicitly established during
    // a confirmed guest session. Without the flag we cannot distinguish a
    // genuine guest write from a legacy pre-feature context created by an
    // authenticated user — pushing the latter would leak their planning.
    if (!guestWroteContext) return;

    // Genuine guest context: deliver to server. keepalive survives tab close.
    pushTripContextNow().catch(() => {
      /* offline — best-effort; stamp already protects post-sign-in writes */
    });
  }, [user?.id, isLoading]);
}
