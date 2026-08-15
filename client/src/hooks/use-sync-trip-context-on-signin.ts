import { useEffect, useRef } from "react";
import { useAuth } from "./use-auth";
import {
  clearGuestProvenance,
  clearTripContext,
  getContextOwner,
  hasGuestProvenance,
  pushTripContextNow,
  setContextOwner,
} from "@/lib/trip-context";

/**
 * Manages trip context ownership across sign-in and sign-out transitions.
 *
 * ## Guest provenance
 * The flag that determines whether an unowned context is safe to push is set
 * inside `updateTripContext` / `switchTripContext` at write time — whenever
 * content is written while no owner stamp is present. This is the ONLY correct
 * place to set it. Setting it on auth resolve (i.e. "auth is null therefore
 * this is a guest session") would mark pre-existing legacy authenticated
 * contexts as guest-authored and push them to the wrong account.
 *
 * ## Sign-in transition (confirmed unauthenticated → authenticated)
 * - Stamps ownership immediately so post-sign-in writes are attributed even if
 *   the context was empty or the push below fails.
 * - Pushes context only when the guest-provenance flag is present (set at write
 *   time), skipping markerless legacy contexts conservatively.
 * - Clears cross-account remnants without pushing.
 * - Skips push for same-user returning (already in sync).
 *
 * ## Sign-out transition (authenticated → confirmed unauthenticated)
 * - Clears the local context and ownership stamp so the subsequent guest session
 *   starts clean. Guest provenance is reset via clearTripContext.
 *
 * ## Auth-loading gate
 * All transitions are gated on `isLoading === false`. The transient null/undefined
 * user during the initial auth fetch is never misclassified as a logout or guest.
 *
 * ## Retry on re-sign-in
 * prevUserIdRef resets to null on logout, so a subsequent sign-in re-enters the
 * sign-in branch and can retry a failed push without any explicit reset step.
 *
 * Call from a top-level component (e.g. Router in App.tsx).
 */
export function useSyncTripContextOnSignIn(): void {
  const { user, isLoading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Do nothing while auth is still fetching — cannot yet distinguish
    // "genuinely unauthenticated" from "still loading".
    if (isLoading) return;

    const userId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (!userId) {
      if (prevUserId !== null) {
        // Explicit logout (auth resolved to null after being authenticated).
        // Wipe context + stamp so the subsequent guest session starts clean.
        // clearTripContext() also clears the guest-provenance flag so fresh
        // guest writes can re-establish it via updateTripContext.
        clearTripContext();
        setContextOwner(null);
      }
      // No provenance flag is set here. The flag is set by updateTripContext /
      // switchTripContext at write time, ensuring only genuine writes during
      // a no-owner session are marked — never just because auth resolved null.
      return;
    }

    // userId is non-null. Only act on a sign-in transition.
    if (userId === prevUserId) return;

    // Capture and clear the guest-provenance flag before stamping ownership,
    // so the flag state reflects the pre-sign-in guest session.
    const guestWroteContext = hasGuestProvenance();
    clearGuestProvenance();

    // Read the owner stamp before overwriting it below.
    const owner = getContextOwner();

    // Stamp ownership immediately — before any push — so that planning the
    // user creates after signing in is attributed to them even if the context
    // was empty or the network push below fails.
    setContextOwner(userId);

    if (owner === userId) {
      // Same user returning (page reload while already authenticated).
      // Context already stamped and in sync — no push needed.
      return;
    }

    if (owner !== null) {
      // Cross-account remnant: a different user's stamped context is present.
      // Clear it (stamp already updated above). Do not push.
      clearTripContext();
      return;
    }

    // owner is null. Only push if the context was explicitly written during a
    // guest session (flag set at write time by updateTripContext). Without the
    // flag we cannot rule out a legacy pre-feature context created by an
    // authenticated user — pushing it would leak their planning.
    if (!guestWroteContext) return;

    // Genuine guest context: deliver to the server. keepalive survives tab close.
    pushTripContextNow().catch(() => {
      /* offline — best-effort; ownership stamp already protects post-sign-in writes */
    });
  }, [user?.id, isLoading]);
}
