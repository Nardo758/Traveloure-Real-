import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import {
  clearTripContext,
  getContextOwner,
  pushTripContextNow,
  setContextOwner,
} from "@/lib/trip-context";

/**
 * Pushes the local trip context to the server immediately after a guest becomes
 * authenticated (guest → signed-in transition). This closes the gap where a
 * guest who builds up a trip and then signs in could lose their planning if they
 * close the tab before the next local-context write fires the debounced push.
 *
 * Ownership safety: sessionStorage survives same-tab page reloads, so a context
 * left by a previous user (user A logs out → user B signs in on same tab) must
 * not be uploaded to B's account. An OWNER_KEY stamp tracks which identity the
 * context belongs to:
 *   - No stamp / null  → built while unauthenticated (guest-owned) → safe to push
 *   - Stamp = current userId → same user returning → no duplicate push needed
 *   - Stamp = different userId → cross-account remnant → clear it, don't push
 *
 * Stamp-before-push: ownership is stamped at the moment of sign-in, BEFORE the
 * push attempt completes. This ensures that any planning the user creates while
 * authenticated (even if the initial push failed or there was nothing to push)
 * is immediately attributed to them. Without this, a user who signs in with an
 * empty context, writes new planning, then logs out would leave an unowned
 * context behind that a different sign-in could upload to the wrong account.
 *
 * Retry on re-sign-in: the tracking ref observes the previous userId value, not
 * a "handled" flag. On logout (user → null) the previous value resets, so if
 * the same user signs in again (e.g. after a network failure on the first push)
 * the effect re-fires and retries the delivery.
 *
 * Delivery safety: pushTripContextNow uses fetch with keepalive:true so the
 * request survives immediate tab close or navigation after sign-in.
 *
 * Call from a top-level component (e.g. Router in App.tsx).
 */
export function useSyncTripContextOnSignIn(): void {
  const { user } = useAuth();
  // Track the previous userId so we can detect sign-in transitions AND
  // automatically reset when the user logs out (userId → null), enabling
  // retry on a subsequent sign-in without any explicit "reset" step.
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    // Not a sign-in transition — either still logged out or same user continuing.
    if (!userId || userId === prevUserId) return;

    const owner = getContextOwner();

    if (owner === userId) {
      // Same user returning on this tab — context already stamped and in sync.
      // No push needed.
      return;
    }

    if (owner !== null) {
      // Cross-account remnant: a different user's stamped context is present.
      // Clear it, stamp the new owner, and do not push (it's not their data).
      clearTripContext();
      setContextOwner(userId);
      return;
    }

    // owner is null: context was built while unauthenticated (guest-built).
    //
    // Stamp ownership FIRST — before the push attempt — so that any planning
    // the user creates after signing in (including when the context was empty
    // and pushTripContextNow() is a no-op) is immediately attributed to them.
    // A failed push leaves the stamp set, protecting authenticated writes; the
    // retry window is the next sign-in transition (prevUserIdRef resets on
    // logout, so signing in again will re-enter this branch).
    setContextOwner(userId);

    // Best-effort delivery of whatever guest planning existed before sign-in.
    pushTripContextNow().catch(() => {
      /* offline — best-effort; stamp already protects post-sign-in writes */
    });
  }, [user?.id]);
}
