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
 * After the sign-in transition the context is always stamped with the current
 * userId — even when nothing was pushed — so that any context the user builds
 * while authenticated is attributed to them. Without this stamp a future sign-in
 * by a different user would see an unowned context and upload the previous user's
 * planning to their account.
 *
 * Delivery safety: pushTripContextNow uses fetch with keepalive:true so the
 * request survives immediate tab close or navigation after sign-in.
 *
 * Call from a top-level component (e.g. Router in App.tsx).
 */
export function useSyncTripContextOnSignIn(): void {
  const { user } = useAuth();
  const handledForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    // Already handled the sign-in transition for this user in this session.
    if (handledForUserIdRef.current === user.id) return;
    handledForUserIdRef.current = user.id;

    const owner = getContextOwner();

    if (owner !== null && owner !== user.id) {
      // Context was left by a different authenticated user — clear it to
      // prevent cross-account contamination, then stamp as owned by the new user.
      clearTripContext();
      setContextOwner(user.id);
      return;
    }

    // owner is null (guest-built / unowned) or already this user.
    // Push whatever planning the user built before signing in; no-op if empty.
    pushTripContextNow();

    // Always stamp ownership regardless of whether we pushed — so that any
    // context writes the user makes AFTER signing in are attributed to them.
    setContextOwner(user.id);
  }, [user?.id]);
}
