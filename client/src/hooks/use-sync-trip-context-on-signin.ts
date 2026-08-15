import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import {
  cancelPendingPush,
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
 * ## Pending-push cancellation
 * `updateTripContext` schedules a debounced 1.5 s PUT. Every ownership
 * transition (login, logout, cross-account switch) calls `cancelPendingPush()`
 * first so a PUT scheduled by a previous user cannot fire against the new
 * session's credentials and upload their planning to the wrong account.
 * `clearTripContext()` also calls `cancelPendingPush()` for the same reason.
 *
 * ## Guest provenance
 * `trip-context.ts` maintains two pieces of state:
 *
 * 1. `guestSessionConfirmed` (in-memory) — set to true by `confirmGuestSession()`
 *    called here when auth resolves to confirmed unauthenticated (isLoading=false,
 *    user=null). Only when this flag is true do `updateTripContext` /
 *    `switchTripContext` mark writes with GUEST_PROVENANCE_KEY. This prevents
 *    auth-loading-time effects (e.g. template pages mounting before
 *    `/api/auth/user` resolves) from marking legacy authenticated contexts as
 *    guest-authored.
 *
 * 2. `GUEST_PROVENANCE_KEY` (sessionStorage) — persists within the tab session
 *    so write-then-reload-then-sign-in flows still deliver the context.
 *    Cleared on sign-in and by `clearTripContext()` on logout.
 *
 * ## Sign-in transition (isLoading=false, null → userId)
 *   - Cancels any pending debounced push (stale data from previous session).
 *   - Calls `endGuestSession()` so subsequent writes are not marked as guest.
 *   - Stamps ownership immediately (before push) so post-sign-in writes are
 *     attributed even if the context is empty or the push fails.
 *   - Pushes context only when GUEST_PROVENANCE_KEY is set.
 *   - Clears cross-account remnants without pushing.
 *   - Skips push for same-user returning (already in sync).
 *
 * ## Sign-out transition (isLoading=false, userId → null)
 *   - Cancels any pending debounced push.
 *   - Clears context + owner stamp. `clearTripContext()` also cancels push.
 *   - Calls `confirmGuestSession()` so subsequent writes mark provenance.
 *
 * ## Auth-loading gate
 *   All transitions require isLoading=false.
 *
 * ## Retry
 *   prevUserIdRef resets on logout; a re-sign-in re-enters the sign-in branch.
 *
 * Call from a top-level component (e.g. Router in App.tsx).
 */
export function useSyncTripContextOnSignIn(): void {
  const { user, isLoading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const userId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (!userId) {
      if (prevUserId !== null) {
        // Explicit logout. Cancel any pending debounced push so the previous
        // user's scheduled PUT cannot fire against the now-different session.
        cancelPendingPush();
        // Clear context and stamp — clearTripContext also cancels pending push
        // and clears GUEST_PROVENANCE_KEY so fresh writes can re-establish it.
        clearTripContext();
        setContextOwner(null);
      }
      // Auth confirmed unauthenticated — enable provenance marking on writes.
      confirmGuestSession();
      return;
    }

    // userId is non-null. Only act on a sign-in transition.
    if (userId === prevUserId) return;

    // Cancel any pending debounced push before making ownership decisions.
    // A timer armed during the guest session captures the guest's context; it
    // must not fire after sign-in (the immediate push below supersedes it, and
    // the cross-account or same-user branches may not push at all).
    cancelPendingPush();

    // Stop marking new writes as guest-authored.
    endGuestSession();

    // Read owner and provenance BEFORE overwriting the stamp.
    const owner = getContextOwner();
    const guestWroteContext = hasGuestProvenance();

    // Clear provenance flag — session is now authenticated.
    clearGuestProvenance();

    // Stamp ownership immediately so post-sign-in writes are always attributed
    // to this user, even if the context is empty or the push below fails.
    setContextOwner(userId);

    if (owner === userId) {
      // Same user returning — context already in sync. No push needed.
      return;
    }

    if (owner !== null) {
      // Cross-account remnant: a different user's stamped context is present.
      // Clear it (stamp already updated). Do not push.
      clearTripContext();
      return;
    }

    // owner is null. Only push when the context was explicitly written during a
    // confirmed guest session. Markerless legacy contexts are skipped to avoid
    // leaking prior authenticated planning to a different account.
    if (!guestWroteContext) return;

    // Genuine guest context — deliver to server. keepalive survives tab close.
    pushTripContextNow().catch(() => {
      /* offline — best-effort; stamp already protects post-sign-in writes */
    });
  }, [user?.id, isLoading]);
}
