/**
 * handle-claim-prompt — the ONE predicate deciding when a console asks an earner for a handle.
 *
 * Ledger `2026-09-05-handles-are-claimed` (CLAUDE.md Locked Decision 40). Pure, and separate from
 * the banner component, because "did the prompt show?" is a rule that fails SILENTLY and in the
 * invisible direction: a banner that stops rendering breaks nothing, logs nothing, and the funnel
 * simply goes quiet again — which is exactly how 0 of 12 public experts ended up with no handle
 * while a working claim form sat in Settings.
 */
import { isEarnerRole } from "@shared/roles";

export interface HandleClaimViewer {
  role?: string | null;
  handle?: string | null;
}

/**
 * True iff this viewer should be asked to claim a handle. Every clause is load-bearing:
 *   • an EARNER only — an EA, admin or traveler has no storefront to name, and
 *     `PATCH /api/me/handle` refuses them with a 403 anyway;
 *   • no handle yet — a claimed handle is the finished state and the ask disappears for good;
 *   • an ABSENT viewer is NOT a viewer without a handle (§13, the `shouldShowUnreadDot` posture
 *     in the same shell): a loading or 401 render must ask nobody.
 */
export function shouldPromptHandleClaim(viewer: HandleClaimViewer | null | undefined): boolean {
  if (!viewer) return false;
  if (!isEarnerRole(viewer.role)) return false;
  return typeof viewer.handle !== "string" || viewer.handle.trim().length === 0;
}
