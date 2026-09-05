/**
 * save-payment-prompt.ts — the ONE decision about whether the soft "save a payment method"
 * prompt may render (CLAUDE.md Locked Decision 43(d); ledger `2026-09-05-payment-method-posture`).
 *
 * The ruling gives the prompt exactly two mounts — after a Trip Pass purchase, and at Finalize
 * when the plan holds bookable rows — and one shape: soft, dismissible, never blocking, and
 * NEVER at signup. This module holds the predicate so both mounts read the same answer rather
 * than each re-deriving it (§18 rule 1); a second copy is how one surface starts nagging a user
 * who already has a card on file.
 *
 * §13 — the states are distinct and none of them is guessed:
 *   • `available: false`  — Stripe is unconfigured or the list read degraded. We do NOT know
 *                           whether the user has a card, so we ask for nothing. Absence of an
 *                           answer is not "no card".
 *   • still loading       — same: no answer yet, so no prompt. It appears when the read lands,
 *                           never as a flash before it.
 *   • methodCount > 0     — the user already has a vaulted method. Nothing to offer.
 *   • dismissed           — the traveler answered. We do not ask again for that scope.
 *
 * Dismissal is remembered per SCOPE (a trip id, or the Trip Pass purchase on that trip) in
 * localStorage, which is a per-viewer convenience and is allowed to be missing: every read and
 * write is wrapped, and a throwing/absent store means "not dismissed" — the prompt is soft, so
 * showing it once more is the harmless failure and suppressing it forever is not.
 */

export interface SavePromptState {
  /** `available` from GET /api/me/payment-methods — false = we could not read the vault. */
  available: boolean;
  /** The list read is still in flight. */
  isLoading: boolean;
  /** How many vaulted methods the read reported. */
  methodCount: number;
  /** The traveler already dismissed this prompt for this scope. */
  dismissed: boolean;
}

/**
 * The whole rule, in one place: offer only on a KNOWN-EMPTY vault that the traveler has not
 * already waved away.
 */
export function shouldOfferSavePayment(state: SavePromptState): boolean {
  if (state.isLoading) return false;
  if (!state.available) return false;
  if (state.methodCount > 0) return false;
  if (state.dismissed) return false;
  return true;
}

const DISMISS_PREFIX = "traveloure.savePaymentPrompt.dismissed";

/** localStorage key for one prompt scope (e.g. `trip:abc123`, `trip-pass:abc123`). */
export function savePromptDismissKey(scope: string): string {
  return `${DISMISS_PREFIX}:${scope}`;
}

/** Reads the per-scope dismissal. A missing/throwing store reads as NOT dismissed. */
export function readSavePromptDismissed(scope: string): boolean {
  try {
    return globalThis.localStorage?.getItem(savePromptDismissKey(scope)) === "1";
  } catch {
    return false;
  }
}

/** Records the per-scope dismissal. A throwing store is swallowed — never breaks the page. */
export function writeSavePromptDismissed(scope: string): void {
  try {
    globalThis.localStorage?.setItem(savePromptDismissKey(scope), "1");
  } catch {
    /* private mode / blocked site data — the prompt simply reappears next time. */
  }
}
