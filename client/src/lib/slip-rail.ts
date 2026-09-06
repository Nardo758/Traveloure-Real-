/**
 * slip-rail — the pure decisions behind the slip's action rail.
 *
 * Ledger `2026-09-05-slip-rail-regroup` (LD 42 build-order row 1.5); the canvas "rail" annotation
 * in `slip-canvas/gen.py`. CLAUDE.md §13, §18 rule 1, Locked Decisions 30, 39, 40, 41.
 *
 * WHY A MODULE AND NOT INLINE JSX. Every one of these answers is a rule the rail must not restate
 * in two places: which AI action a plan is offered, what a share link actually points at, what the
 * calendar route is, and what may be said about an expert with no public address. Each one is the
 * kind of fact that grows a second copy the moment a second surface needs it — the drift class
 * §18 rule 1 names — so they live here, once, and the component reads them.
 *
 * NEGATIVE SPACE (§18d habit, stated for a client module too):
 *  - these decide SHAPE and COPY only. Whether the traveler may run an optimization, whether the
 *    free draft is allowed on this slip, whether a share token exists and whether the calendar
 *    route will answer are all SERVER answers (`resolveOptimizerRunAuthorization`,
 *    `resolveAiDraftEligibility`, `POST /api/trips/:id/share`, the calendar route's own gate).
 *    Nothing here authorizes anything, and no caller may read it as having done so.
 *  - nothing here counts money, resolves a fee or picks a rate (§14/§18).
 */

/** The four cards the rail regroups into, in render order. One name each, used as the testid tail. */
export const SLIP_RAIL_CARDS = ["build", "plan", "share", "finish"] as const;
export type SlipRailCard = (typeof SLIP_RAIL_CARDS)[number];

// ── Build · the ONE AI action ─────────────────────────────────────────────────────────────────

export type SlipBuildAiAction = "draft" | "optimize";

/**
 * WHICH AI ACTION THIS PLAN IS OFFERED — CLAUDE.md Locked Decision 41 (b): "the free AI draft runs
 * only on an EMPTY slip. Any AI action on a slip that already holds items is Optimize, and goes
 * through the existing pay gate. There is no second free rail hiding behind a different button."
 *
 * So the rail offers exactly ONE of the two, decided by the item count and nothing else:
 *   0 items  ⇒ "draft"    — the free sketch; there is nothing to overwrite.
 *   ≥1 item  ⇒ "optimize" — the existing gate, preview line and fee label.
 *
 * "EMPTY" COUNTS EVERY ROW IN EVERY STATUS, exactly as the server's own
 * `decideAiDraftEligibility` does — a purchased row, an expert row and a plain planning row each
 * make the slip non-empty. This is deliberately the same question stated on the same terms, not a
 * looser client approximation: a client that offered Draft on a slip the server would refuse
 * would be promising a free rebuild the traveler cannot have (§13). The SERVER still decides —
 * it re-checks in the route and again inside the snapshot transaction — and a refusal is shown
 * as its own sentence through `readSlipHasItemsRefusal`.
 *
 * A non-finite count is treated as "optimize": the cautious direction is never to offer a free
 * wipe-and-rebuild on a plan we could not count.
 */
export function slipBuildAiAction(itemCount: number): SlipBuildAiAction {
  if (!Number.isFinite(itemCount)) return "optimize";
  return itemCount <= 0 ? "draft" : "optimize";
}

/**
 * Honest disabled state for "Draft it with AI", mirroring `slipOptimizeDisabledReason`'s posture:
 * the generate rail requires a real destination and a real date range and this surface never
 * invents either (§13). Returns the tooltip when the action must be disabled, else null.
 *
 * It deliberately does NOT restate the empty-slip rule — that is `slipBuildAiAction`'s single
 * answer above, and a second statement of it here is exactly the drift §18 rule 1 names.
 */
export function slipDraftDisabledReason(opts: {
  destination: string | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
}): string | null {
  if (!opts.destination) {
    return "This plan has no destination yet — add one before drafting.";
  }
  if (!opts.startDate || !opts.endDate) {
    return "This plan has no dates yet — add them before drafting.";
  }
  return null;
}

// ── Build · hand off to / message an expert ───────────────────────────────────────────────────

/** The subset of `GET /api/trips/:id/expert-advisor`'s advisor row this rail reads. */
export interface SlipRailAdvisor {
  status?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  /** `users.handle` — the PUBLIC address (Locked Decision 40). NULL = none claimed. */
  handle?: string | null;
  /**
   * `users.profile_image_url`, as the owner-gated advisor read already ships it (snake_case, like
   * every other key on that raw row). NULL = this expert has uploaded no photo, and the card then
   * draws their INITIALS rather than a stock face — a placeholder portrait is a picture of a
   * person who does not exist (§13).
   */
  profile_image_url?: string | null;
}

/**
 * ── D22 CLOSED THE HANDLE-LESS ADVISOR (ledger `2026-09-05-slip-decisions-d18-d22`) ───────────
 *
 * This module used to carry a third state and a sentence for it: an advisor who had claimed no
 * storefront handle had NO address, because Locked Decision 40's three kinds (`handle`,
 * `serviceId`, `bookingId`) all address an EARNER from the marketplace and none of them addresses
 * the person on your own plan. That sentence was honest and was not a product, and its own comment
 * said the fix — "giving the start rail an `advisor` kind" — was a separate lane. This is that
 * lane, so the state is GONE rather than kept beside its own replacement.
 *
 * The address is now the PLAN (`{ tripId }`, D22): the server resolves the counterpart from the
 * trip plus the `trip_expert_advisors` row in a §12 access status. A handle is therefore no longer
 * needed to message an advisor at all — it is kept on the state only as the DISPLAY fact it always
 * was (the storefront a name can link to), never as the address.
 */
export type SlipExpertRailState =
  /** No advisor on the plan — offer the ONE plan-level picker. */
  | { kind: "hire" }
  /**
   * An advisor is on this plan — offer the ONE Message control, addressed by the PLAN.
   * `handle` is `null` for an advisor who has claimed none, and that no longer withholds anything:
   * the plan address does not need it (D22).
   */
  | { kind: "message"; name: string; handle: string | null; pending: boolean };

/** "Aya Tanaka" from the row, or null — never a placeholder name (§13). */
export function slipAdvisorName(advisor: SlipRailAdvisor | null | undefined): string | null {
  if (!advisor) return null;
  const name = [advisor.first_name, advisor.last_name].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : null;
}

/**
 * The Build card's expert row, in one decision.
 *
 * TWO states since D22, and they are two different facts: no advisor on the plan at all (offer the
 * ONE picker), or an advisor who can be messaged. A PENDING advisor is still an advisor — the
 * invitation is out — so the rail stops offering the picker and reports the standing instead;
 * that is Locked Decision 12's line read from the traveler's side (a pending advisor may not
 * WRITE; the traveler may still write to them), and it is the SAME set the server's own
 * `TRIP_ADVISOR_READ_ACCESS_STATUSES` admits on the start rail.
 *
 * §13 — WHAT IS STILL NOT INVENTED. A nameless advisor row gets the stated fallback "your expert"
 * (`slipAdvisorName` returns null and the label says so generically) and a handle-less one gets
 * `handle: null`, which the caller must not turn into a profile link. Neither is a placeholder for
 * the ADDRESS, which is the plan and is always known.
 */
export function slipExpertRailState(advisor: SlipRailAdvisor | null | undefined): SlipExpertRailState {
  if (!advisor) return { kind: "hire" };
  const name = slipAdvisorName(advisor) ?? "your expert";
  const pending = advisor.status === "pending";
  const raw = typeof advisor.handle === "string" ? advisor.handle.trim() : "";
  return { kind: "message", name, handle: raw.length > 0 ? raw : null, pending };
}

// ── Share ─────────────────────────────────────────────────────────────────────────────────────

/**
 * THE SHARE LINK, IN ONE PLACE (S10).
 *
 * The slip used to copy `${origin}/itinerary/${trip.id}`, which `App.tsx` redirects to
 * `/trip/:id` — a ProtectedRoute. Every recipient who was not already signed in as the owner met
 * a login wall, so the button "worked" and the link never did. This is the TOKEN link the
 * platform's own share rail already mints: `POST /api/trips/:id/share` (owner-gated, idempotent
 * retrieve-or-create) answers with the token, and `/trips/shared/:token` is the public,
 * trip-shaped read that renders it.
 *
 * ONE builder, so the slip and `trip-details.tsx` (the rail's other caller) can never point at
 * two different URLs for the same token (§18 rule 1). The trip id is deliberately NOT part of
 * this URL: the token IS the address, and appending an internal id would put back exactly the
 * thing the token exists to replace.
 */
export function slipShareUrl(origin: string, shareToken: string): string {
  return `${origin}/trips/shared/${encodeURIComponent(shareToken)}`;
}

/** The trip-keyed `.ics` route (S11). Session-authenticated, gated like the plancard read. */
export function slipCalendarPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/calendar`;
}

/** The trip-keyed printable copy — unchanged, named here so the Share card states no path twice. */
export function slipPdfPath(tripId: string): string {
  return `/api/trips/${encodeURIComponent(tripId)}/pdf`;
}

// ── Finish ────────────────────────────────────────────────────────────────────────────────────

/** Structural subset of `PlanCardActivity` the Finish card counts (kept import-free for tests). */
export interface CheckoutCountableItem {
  routingStatus?: string | null;
  booking?: { id: string } | null;
}

/**
 * How many rows are staged for checkout — the number on "Go to checkout (N)".
 *
 * Counts `ready_for_checkout` rows that are not already booked, which is what the cart projection
 * holds. §13: ZERO means the card does not render the control at all rather than offering a
 * checkout with nothing in it; the caller does that, and this only counts.
 */
export function countCheckoutReadyItems(items: readonly CheckoutCountableItem[]): number {
  return items.filter((i) => !i.booking && i.routingStatus === "ready_for_checkout").length;
}

// ── The advisor's STANDING, in one sentence ───────────────────────────────────────────────────

/** The two spellings, stated once so no surface writes a third. */
export const SLIP_ADVISOR_PENDING_FALLBACK_NAME = "your expert" as const;
export const SLIP_ADVISOR_ADVISING_FALLBACK_NAME = "An expert" as const;

/**
 * WHAT THIS PLAN'S ADVISOR IS, SAID THE SAME WAY EVERYWHERE (ledger `2026-09-06-slip-conformance`).
 *
 * Two surfaces state an advisor's standing — the EVENT HEADER (where the traveler is standing when
 * they think about who is helping) and the RAIL's Expert card (D6's move put the hire control in
 * Build and left the standing where it was). Before this lane the sentence was written inline in
 * `SlipView`'s event affordance and nowhere else; the rail's new card would have been a second
 * copy, which is the derivation-drift class §18 rule 1 names — and the day "pending" gains a third
 * meaning the two would disagree about the same row.
 *
 * The wording is UNCHANGED from the event header's own, fallbacks included:
 *   pending  ⇒ "Request sent — awaiting <name>"   — the invitation is out and nothing has been
 *               accepted, which is Locked Decision 12's line read from the traveler's side.
 *   anything ⇒ "<Name> is advising this plan"
 *   else
 *
 * §13 — NO ETA, ever. Nothing on the platform knows when an expert will answer, so no sentence
 * here promises one. A nameless row keeps the stated generic fallback rather than a blank or an
 * invented name, and the two fallbacks differ because they sit in different grammatical slots.
 *
 * Returns `null` when there is NO advisor: that is not a standing, and a caller must render
 * nothing rather than a sentence about an absence.
 */
export function slipAdvisorStandingLine(advisor: SlipRailAdvisor | null | undefined): string | null {
  if (!advisor) return null;
  const name = slipAdvisorName(advisor);
  if (advisor.status === "pending") {
    return `Request sent — awaiting ${name ?? SLIP_ADVISOR_PENDING_FALLBACK_NAME}`;
  }
  return `${name ?? SLIP_ADVISOR_ADVISING_FALLBACK_NAME} is advising this plan`;
}
