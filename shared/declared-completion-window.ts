/**
 * D-7 DECLARED COMPLETION — the ONE derivation of when a seller-declared window closes, which
 * instant a dispute is bounded by, and how the admin queue tells a declared-window dispute from a
 * post-completion one.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-36 / D-37 / D-38 / D-39, all option A; ledger
 * `2026-09-15-d36-d39-completion-declared`). Content of record:
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part II §11-§14.
 *
 * WHY IT IS PURE AND WHY IT IS SHARED. It computes and it never writes: no `db`, no `storage`, no
 * request. That is what lets a CI test prove it with no database, and it is what keeps a second
 * "when does this traveler's window close?" from being written beside the first (§18 rule 1 — the
 * derivation-drift class). The WINDOW'S NUMBER is not here: it lives in
 * `server/config/completion-windows.config.ts` (`declaredCompletionWindowDays()`, a DELEGATION to
 * `holdWindowDays('service_booking')`), the §8 posture, and is passed IN — a literal in this file
 * would be exactly the parallel constant that file's header forbids.
 *
 * THE DEADLINE IS DERIVED, NEVER STORED (D-36) — the same answer `shared/acceptance-window.ts`
 * gives for the acceptance deadline, for the same reason: a stored end date is a second authority
 * that disagrees with the config the moment the config moves.
 */

/**
 * The `service_bookings.status` value this lane adds, and the `coordination_states.status` value the
 * coordination rail takes (D-39). App-enforced, NO DB CHECK — both columns are `varchar(30)` and no
 * CHECK exists on either in any migration, so a new value is a code change and not a publish trap
 * (the LD 44(e) posture). NO BACKFILL: a booking completed under the old immediate flip WAS
 * completed, and rewriting it would invent a fact.
 *
 * WHAT IT MEANS, in the traveler's words: "your expert says this is done — tell us if it isn't by
 * <date>". It is NOT completed (nothing has minted), it is NOT disputed (nobody has objected), and
 * every surface must say so with a word that is neither (brief §14).
 */
export const COMPLETION_DECLARED_STATUS = "completion_declared";

/**
 * D-39: a coordination engagement's traveler may OBJECT inside the declared window. The word is
 * the same one `service_bookings` uses because it means the same thing — a QUESTION nobody has
 * answered yet, never a refund (which is an admin's ANSWER, brief §14). App-enforced, no CHECK.
 */
export const COORDINATION_DISPUTED_STATUS = "disputed";

export const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * WHEN THE DECLARED WINDOW CLOSES — derived, never stored (D-36).
 *
 * §13, and it is the reason this returns `null` rather than a date: a booking whose declaration
 * instant the server does not hold is NOT put on a clock. It is omitted with its reason the way
 * `no_delivery_timestamp` and `no_service_date` already are, never anchored on `confirmed_at`, on
 * the service date, or on "now".
 *
 * `windowDays` is passed in from `declaredCompletionWindowDays()` so this file states no number of
 * its own. A negative or non-finite window is refused rather than clamped: a window the config
 * cannot state is not a window anyone may stand behind.
 */
export function declaredCompletionDeadline(
  declaredAt: Date | string | null | undefined,
  windowDays: number,
): string | null {
  const ms = toMs(declaredAt);
  if (ms === null) return null;
  if (!Number.isFinite(windowDays) || windowDays < 0) return null;
  return new Date(ms + windowDays * DAY_MS).toISOString();
}

/** TRUE once the derived deadline has passed. `false` for a window that cannot be dated (§13). */
export function declaredWindowElapsed(
  declaredAt: Date | string | null | undefined,
  windowDays: number,
  now: Date,
): boolean {
  const deadline = declaredCompletionDeadline(declaredAt, windowDays);
  if (deadline === null) return false;
  return now.getTime() >= Date.parse(deadline);
}

export interface DisputeWindowShape {
  completionDeclaredAt: Date | string | null | undefined;
  completedAt: Date | string | null | undefined;
}

/**
 * THE INSTANT A TRAVELER'S DISPUTE IS BOUNDED BY — ONE anchor for ONE window.
 *
 * Before D-7 the dispute cutoff was `completed_at + holdWindowDays('service_booking')`, and it
 * coincided with the earning's `availableAt` because both were stamped at the same flip. D-37
 * moves the mint to the window's CLOSE and anchors `availableAt` to the DECLARATION, so the window
 * now begins at the declaration for a declared booking — and the dispute cutoff must begin there
 * too, or the traveler would be told they may still dispute a booking whose money has already
 * released (the exact mismatch one window exists to prevent).
 *
 * So: the declaration instant when there is one, else `completed_at` (a booking completed WITHOUT a
 * declaration — a traveler's own confirm, an artifact acceptance, an admin's dispute-reject — keeps
 * today's cutoff verbatim), else `null` — an un-completed, un-declared booking is bounded in STATE by
 * `DISPUTABLE_FROM_STATUSES`, not in time.
 */
export function disputeWindowAnchor(row: DisputeWindowShape): Date | null {
  const declared = toMs(row.completionDeclaredAt);
  if (declared !== null) return new Date(declared);
  const completed = toMs(row.completedAt);
  if (completed !== null) return new Date(completed);
  return null;
}

/**
 * D-38: HOW THE ADMIN QUEUE TELLS THE TWO DISPUTES APART — BY DERIVATION, NEVER A SECOND STATUS.
 *
 *   `post_completion`  the booking had completed (money minted, held) when the dispute arrived —
 *                      today's ordinary case; `setBookingEarningsDispute` found rows to hold.
 *   `declared_window`  the seller had declared and the window was open — NOTHING has minted, so
 *                      the earnings flag touched ZERO rows and zero must never be read as "cleared":
 *                      the block is the status itself (the booking never reaches `completed`).
 *   `pre_completion`   neither — a dispute on a `confirmed`/`deposit_paid` booking, or the D-27
 *                      escalation of an unanswered acceptance window. Likewise nothing has minted.
 *
 * `completed_at` outranks `completion_declared_at` on purpose: an admin's dispute-REJECT re-completes
 * a declared booking (stamping `completed_at`), and a second dispute inside the hold window is then a
 * post-completion one — the money exists and is held.
 */
export type DisputeStage = "post_completion" | "declared_window" | "pre_completion";

export function disputeStageFor(row: DisputeWindowShape): DisputeStage {
  if (toMs(row.completedAt) !== null) return "post_completion";
  if (toMs(row.completionDeclaredAt) !== null) return "declared_window";
  return "pre_completion";
}

/**
 * D-39: WHEN A COORDINATION ENGAGEMENT WAS DECLARED COMPLETE — read from the engagement's own
 * `state_history`, the ONE record of who advanced what (V-25b made its append atomic).
 *
 * `coordination_states` deliberately grows NO `completion_declared_at` column in this lane: D-39
 * ruled the status value in with "no migration", and the history entry the guarded writer appends
 * on that transition already carries the instant. The FIRST entry that reached the declared status
 * is the anchor — a coordinator cannot re-declare (the coordinator arm only moves forward), so
 * "first" and "only" coincide, and choosing first rather than last keeps a hypothetical later
 * append from moving a window the traveler was already told about.
 *
 * §13: a history that carries no such entry — a legacy engagement completed under the old direct
 * flip, or one still in progress — returns `null`, and NO window exists for it. The refund gate
 * then does not apply, because a window the server cannot date does not start.
 */
export function coordinationDeclaredAt(stateHistory: unknown): Date | null {
  if (!Array.isArray(stateHistory)) return null;
  for (const entry of stateHistory) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { status?: unknown; timestamp?: unknown };
    if (e.status !== COMPLETION_DECLARED_STATUS) continue;
    const ms = toMs(typeof e.timestamp === "string" || e.timestamp instanceof Date ? e.timestamp : null);
    if (ms !== null) return new Date(ms);
  }
  return null;
}
