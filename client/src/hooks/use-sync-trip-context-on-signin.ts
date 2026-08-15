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
 * Set whenever the user is not authenticated (initial load or after logout).
 * Cleared when the user signs in.
 *
 * This flag is what distinguishes a genuine guest context (safe to push) from
 * a legacy pre-feature context that has no ownership stamp but was built by an
 * authenticated user before this feature shipped. Legacy contexts must not be
 * pushed to a newly authenticated account.
 */
const GUEST_PROVENANCE_KEY = "trip-context-guest-provenance";

/**
 * Manages trip context ownership across sign-in and sign-out transitions.
 *
 * On sign-in (guest → authenticated):
 *   - Pushes the local trip context to the server if it was explicitly
 *     built during the current guest session (GUEST_PROVENANCE_KEY is set).
 *   - Stamps ownership immediately — before the push — so that planning
 *     the user creates after signing in is attributed to them even if the
 *     context was initially empty or the push failed.
 *   - Clears cross-account remnants (a different user's stamped context)
 *     without pushing them.
 *   - Skips push for same-user returning (already in sync).
 *   - Skips push for markerless legacy contexts (unknown provenance —
 *     conservative to avoid leaking prior authenticated planning).
 *
 * On sign-out (authenticated → guest):
 *   - Clears both the local context and the ownership stamp so the
 *     subsequent guest session starts clean.
 *   - Sets GUEST_PROVENANCE_KEY so any planning built during the new
 *     guest session can later be identified as safely pushable.
 *
 * Retry: prevUserIdRef tracks the previous userId. On logout the ref
 * resets to null, so a subsequent sign-in (by the same or a different
 * user) re-enters the sign-in branch and can retry a failed push.
 *
 * Call from a top-level component (e.g. Router in App.tsx).
 */
export function useSyncTripContextOnSignIn(): void {
  const { user } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (!userId) {
      if (prevUserId !== null) {
        // Explicit logout: wipe the context and ownership stamp so the
        // subsequent guest session starts with a clean slate and is not
        // contaminated by this user's authenticated planning.
        clearTripContext();
        setContextOwner(null);
      }
      // Mark this tab as being in an unauthenticated (guest) session.
      // Writing happens here (and not in updateTripContext) so the flag
      // covers the whole guest session window, including sessions that
      // begin on a fresh tab with no prior sign-in.
      try {
        sessionStorage.setItem(GUEST_PROVENANCE_KEY, "1");
      } catch {
        /* ignore */
      }
      return;
    }

    // userId is non-null. Only act on a sign-in transition.
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

    // Stamp ownership immediately so that any planning the user creates
    // after signing in (even if the context was empty, or the push below
    // fails) is attributed to them. Without this early stamp, a user who
    // signs in with an empty context, writes planning, then logs out would
    // leave an unowned context that a different account's sign-in could push.
    setContextOwner(userId);

    if (owner === userId) {
      // Same user returning on this tab — context already stamped and in
      // sync with the server. No push needed.
      return;
    }

    if (owner !== null) {
      // Cross-account remnant: a different user's stamped context is
      // present. Clear it (stamp already updated above) to prevent
      // their planning from appearing in this session.
      clearTripContext();
      return;
    }

    // owner is null. Decide whether to push based on provenance:
    if (!hasGuestProvenance) {
      // No explicit guest-provenance flag — this is either a legacy
      // pre-feature context (built while authenticated with no stamp) or
      // an edge case we cannot safely classify. Skip the push to avoid
      // leaking prior authenticated planning to this account.
      return;
    }

    // Explicitly guest-built context: push it to the server so the user's
    // pre-sign-in planning is not lost. keepalive:true survives tab close.
    pushTripContextNow().catch(() => {
      /* offline — best-effort; stamp already protects post-sign-in writes */
    });
  }, [user?.id]);
}
