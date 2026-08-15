import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import {
  clearGuestProvenance,
  confirmGuestSession,
  endGuestSession,
  getContextOwner,
  hasGuestProvenance,
  pushTripContextNow,
  setContextOwner,
  wipeLocalTripSession,
} from "@/lib/trip-context";

/**
 * Manages trip context ownership across sign-in and sign-out transitions.
 *
 * ## Logout cleanup (synchronous + defensive)
 * The main cleanup path is in `use-auth.ts` logout() which calls
 * `wipeLocalTripSession()` synchronously before `window.location.href`.
 * This hook's logout branch provides a second line of defense for cases
 * where auth resolves to null without an explicit client-side logout (e.g.
 * server-side session expiry, token invalidation) — scenarios where the
 * pre-navigation synchronous call does not apply.
 *
 * ## Guest provenance
 * `trip-context.ts` maintains two pieces of state:
 *
 * 1. `guestSessionConfirmed` (in-memory) — set to true by `confirmGuestSession()`
 *    called here when auth resolves to confirmed unauthenticated (isLoading=false,
 *    user=null). Only when this flag is true do `updateTripContext` /
 *    `switchTripContext` mark writes with GUEST_PROVENANCE_KEY. This prevents
 *    auth-loading-time effects from marking legacy authenticated contexts as
 *    guest-authored.
 *
 * 2. `GUEST_PROVENANCE_KEY` (sessionStorage) — persists within the tab session
 *    so write-then-reload-then-sign-in flows still deliver the context.
 *    Cleared on sign-in and by `clearTripContext()` on logout.
 *
 * ## Defensive initial-guest bootstrap
 * On the first confirmed-unauthenticated render (prevUserId===null, userId===null),
 * if a stale owner stamp is already present (user navigated away from a prior
 * authenticated session without a clean logout), the stale context is wiped so
 * it cannot be pushed to the next account that signs in on this tab.
 *
 * ## Sign-in transition (isLoading=false, null → userId)
 *   - Cancels any pending debounced push (stale data from previous session).
 *   - Calls `endGuestSession()` so subsequent writes are not marked as guest.
 *   - Reads owner and provenance BEFORE overwriting the stamp.
 *   - Stamps ownership immediately so post-sign-in writes are always attributed.
 *   - Pushes context user-scoped (no ?tripId= param) to avoid racing with
 *     `useClaimGuestTrips`: the guest trip may not be claimed yet, so a
 *     trip-scoped PUT would be rejected; the user's default row is always
 *     accessible once authenticated.
 *   - Skips push for same-user returning, cross-account remnants, or contexts
 *     without explicit guest provenance (legacy markerless contexts).
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
        // Auth resolved to null after being authenticated: server-side session
        // expiry or token invalidation (explicit logout is handled synchronously
        // in use-auth.ts before navigation, but this branch covers other paths).
        wipeLocalTripSession();
      } else if (getContextOwner() !== null) {
        // Initial confirmed-guest bootstrap with a stale owner stamp: the tab
        // was previously used by an authenticated user who navigated away without
        // a clean logout. Wipe the stale context so it cannot be pushed to
        // whoever signs in next.
        wipeLocalTripSession();
      }
      // Auth confirmed unauthenticated — enable provenance marking on writes.
      confirmGuestSession();
      return;
    }

    // userId is non-null. Only act on a sign-in transition.
    if (userId === prevUserId) return;

    // End the guest session immediately so subsequent writes are not marked.
    endGuestSession();

    // Read owner and provenance BEFORE overwriting the stamp below.
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
      // Clear it (stamp already updated above). Do not push.
      wipeLocalTripSession();
      // Re-stamp after wipe — wipeLocalTripSession clears the owner.
      setContextOwner(userId);
      return;
    }

    // owner is null. Only push when the context was explicitly written during a
    // confirmed guest session. Legacy markerless contexts are skipped to avoid
    // leaking prior authenticated planning to a different account.
    if (!guestWroteContext) return;

    // Push user-scoped (no ?tripId= param) so the PUT lands in the user's
    // default context row regardless of guest-trip claim status.
    // useClaimGuestTrips runs concurrently and may not have finished claiming
    // the guest tripId; a trip-scoped PUT would be rejected until claim succeeds.
    pushTripContextNow({ userScoped: true }).catch(() => {
      /* offline — best-effort; stamp already protects post-sign-in writes */
    });
  }, [user?.id, isLoading]);
}
