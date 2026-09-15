/**
 * D-6 ACCEPTANCE — the ONE derivation of who takes acceptance, when the window closes, and how
 * many revisions are left.
 *
 * Decision-maker ruling 2026-09-15 (punchlist D-24 / D-25 / D-26 / D-40, all option A; ledger
 * `2026-09-15-d24-d26-acceptance-columns`). Content of record:
 * `docs/design/EXPERT_ACCEPTANCE_BRIEF.md` Part I §3-§7 and Part II §10.
 *
 * WHY IT IS PURE AND WHY IT IS SHARED. It computes and it never writes: no `db`, no `storage`, no
 * request. That is what lets a CI test prove it with no database, and it is what keeps a second
 * "is this an artifact the traveler must accept?" test from being written beside the first
 * (§18 rule 1 — the derivation-drift class). The WINDOW'S NUMBER is not here: it lives in
 * `server/config/completion-windows.config.ts` (`acceptanceWindowDays()`), the §8 posture, and is
 * passed IN — a literal in this file would be exactly the parallel constant that file's header
 * forbids.
 *
 * THE ESCALATION JOB IS NOT HERE EITHER. Moving an unanswered window to admin review is D-27's
 * lane; this module only says WHEN the window closes. Until D-27 lands, an artifact booking still
 * auto-completes under the existing `artifact_timer` — a stated, sequenced gap, not a claim this
 * module makes.
 */

/**
 * `service_bookings.status` values this lane adds. App-enforced, NO DB CHECK — the column is
 * `varchar(30)` and no `service_bookings_status_check` exists in any migration, so a new value is a
 * code change and not a publish trap (the LD 44(e) posture). NO BACKFILL: a booking completed under
 * the old timer WAS completed, and rewriting it would invent a fact.
 */
export const AWAITING_ACCEPTANCE_STATUS = "awaiting_acceptance";
export const REVISION_REQUESTED_STATUS = "revision_requested";

/**
 * Which booking statuses may SERVE the artifact to its traveler. The pre-existing gate was
 * `status === 'confirmed'` alone; an accepting traveler must still be able to read the thing they
 * are being asked to accept, and a traveler waiting on a revision must still hold what they were
 * sent. Stated once here and read by both the download rail and its metadata probe (§18 rule 1).
 *
 * NEGATIVE SPACE: this is a READ list, not a from-state list. It says which statuses may see the
 * file; it says nothing about WHO may ask (the route's own `traveler_id` gate) and nothing about
 * any transition (`server/utils/booking-from-states.ts` owns those).
 */
export const DELIVERABLE_READABLE_STATUSES: readonly string[] = [
  "confirmed",
  AWAITING_ACCEPTANCE_STATUS,
  REVISION_REQUESTED_STATUS,
];

export interface ArtifactAcceptanceShape {
  deliveryMethod: string | null | undefined;
  productShape: string | null | undefined;
  /** `provider_services.declared_artifact_deliverable` — D-40. NULL = not declared. */
  declaredArtifactDeliverable?: string | null;
}

/**
 * WHAT ACCEPTANCE DOES ON THIS LISTING — the whole of D-40 in one discriminator.
 *
 *   `gates_completion`  the D-6 artifact case (`pdf`). Acceptance IS what completes the booking and
 *                       mints the held earning; the booking sits in `awaiting_acceptance` until the
 *                       traveler answers.
 *   `records_only`      a `hybrid` listing that DECLARED an artifact (D-40). Accepting or revising
 *                       it records `accepted_at` and `booking_revision_requests` rows and GATES
 *                       NOTHING about completion or the mint — the booking keeps D-7's
 *                       `service_date_timer`, and no money timing moves. Withholding a provider's
 *                       fee for a day they worked behind acceptance of a document is precisely what
 *                       D-7 ruled against.
 *   `null`              no acceptance affordance exists at all, and §13 binds hardest here: a
 *                       hybrid listing with NULL `declaredArtifactDeliverable` never renders "no
 *                       artifact", which is a claim only the seller can make — it renders nothing.
 *
 * `productShape` outranks the delivery method the way `completionRuleFor` already has it: a bundle
 * or a property keeps `bundle_components` / `checkout_date` and is out of scope for both lanes.
 */
export type AcceptanceMode = "gates_completion" | "records_only";

export function acceptanceModeFor(s: ArtifactAcceptanceShape): AcceptanceMode | null {
  if (s.productShape === "bundle") return null;
  if (s.productShape === "property" || s.productShape === "property_room") return null;
  if (s.deliveryMethod === "pdf") return "gates_completion";
  if (s.deliveryMethod === "hybrid" && (s.declaredArtifactDeliverable ?? "").trim()) {
    return "records_only";
  }
  return null;
}

/** Convenience for the surfaces that only need "is there an acceptance affordance at all". */
export function takesArtifactAcceptance(s: ArtifactAcceptanceShape): boolean {
  return acceptanceModeFor(s) !== null;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * WHERE A DELIVERY INSTANT CAME FROM (D-27; ledger
 * `2026-09-15-d27-artifact-timer-acceptance-prompt`). There are exactly two, and telling them apart
 * is the honest half of putting a booking on an acceptance clock:
 *
 *   `per_booking`    `service_bookings.delivered_at` — THIS traveler's own delivery, stamped by the
 *                    deliver rail and MOVED by every re-delivery (D-26).
 *   `listing_clock`  the pre-D-26 derivation the `artifact_timer` arms already used — the first
 *                    `deliverable_downloads` row for this booking, else
 *                    `max(confirmed_at, provider_services.deliverable_uploaded_at)`. It is a
 *                    LISTING-level clock shared by every buyer, which is exactly why it is named
 *                    rather than presented as the traveler's own delivery.
 *
 * NEITHER IS EVER WRITTEN BACK TO `delivered_at` — D-26's rule. A listing-clock instant is a
 * derivation, and stamping it on the row would turn "we inferred this" into "the seller delivered
 * on this date".
 */
export const DELIVERY_INSTANT_SOURCES = ["per_booking", "listing_clock"] as const;
export type DeliveryInstantSource = (typeof DELIVERY_INSTANT_SOURCES)[number];

export interface DeliveryInstant {
  at: Date | string;
  source: DeliveryInstantSource;
}

/**
 * WHEN THE ACCEPTANCE WINDOW CLOSES — derived, never stored (D-24).
 *
 * §13, and it is the reason this returns `null` rather than a date: a booking whose delivery
 * instant the server does not hold is NOT put on an acceptance clock. It is omitted with its reason
 * the way `no_delivery_timestamp` already is, never anchored on `confirmed_at`, on the listing's
 * `deliverable_uploaded_at` (a LISTING-level clock shared by every buyer — the mismatch D-26
 * exists for) or on "now".
 *
 * `windowDays` is passed in from `acceptanceWindowDays()` so this file states no number of its own.
 *
 * D-27 EXTENDED THE INPUT, NOT THE COUNT OF DEADLINE HELPERS. It now also accepts a SOURCED
 * instant (`DeliveryInstant`), so the escalation arm cannot compute a window without also saying
 * what it measured from — and so no caller ever forks a second deadline helper beside this one
 * (§18 rule 1). The bare `Date | string` form is unchanged for every existing caller.
 */
export function acceptanceDeadline(
  deliveredAt: Date | string | DeliveryInstant | null | undefined,
  windowDays: number,
): string | null {
  if (deliveredAt === null || deliveredAt === undefined) return null;
  let at: Date | string;
  if (typeof deliveredAt === "object" && !(deliveredAt instanceof Date)) {
    // D-27: the SOURCED form. An instant whose provenance is not one this module knows is not a
    // deadline anyone may stand behind — refused rather than silently measured (§13).
    if (!DELIVERY_INSTANT_SOURCES.includes(deliveredAt.source)) return null;
    at = deliveredAt.at;
  } else {
    at = deliveredAt;
  }
  const ms = at instanceof Date ? at.getTime() : Date.parse(String(at));
  if (!Number.isFinite(ms)) return null;
  if (!Number.isFinite(windowDays) || windowDays < 0) return null;
  return new Date(ms + windowDays * DAY_MS).toISOString();
}

export interface RevisionAllowance {
  /** The listing's own `revisions_included`. `null` = the listing never stated one. */
  included: number | null;
  /** How many `booking_revision_requests` rows this booking already carries. */
  used: number;
  /** `null` when nothing was stated; otherwise `max(0, included - used)`. */
  remaining: number | null;
  /**
   * The affordance's gate. TRUE only when the listing states a POSITIVE allowance — §13's rule
   * that a listing with `revisions_included` NULL or 0 shows NO revision affordance at all, never
   * "0 revisions remaining" beside a button that refuses.
   */
  offered: boolean;
}

/**
 * THE ONE READING OF THE ALLOWANCE. It is the listing's `provider_services.revisions_included`,
 * resolved on EVERY decision and never copied onto the booking row (§18 rule 1, §19): a copied
 * allowance is a second authority, and a seller who lowers it must not be bound by a number stamped
 * on a row months ago — nor may a traveler be, if it goes up.
 *
 * `used` is COUNTED from the child rows (D-25); there is no `revisions_used` column to disagree
 * with them.
 */
export function resolveRevisionAllowance(
  included: number | null | undefined,
  used: number,
): RevisionAllowance {
  const stated = typeof included === "number" && Number.isFinite(included) ? Math.trunc(included) : null;
  const usedRows = Number.isFinite(used) && used > 0 ? Math.trunc(used) : 0;
  return {
    included: stated,
    used: usedRows,
    remaining: stated === null ? null : Math.max(0, stated - usedRows),
    offered: stated !== null && stated > 0,
  };
}

/** Whether one more revision may be asked for. A refusal states the number (§13); it is never a dispute. */
export function mayRequestRevision(allowance: RevisionAllowance): boolean {
  return allowance.offered && (allowance.remaining ?? 0) > 0;
}

/** Which file a reader was actually served — the honest half of D-26's fallback. */
export type DeliverableSource = "booking" | "listing";

export interface ResolvedDeliverable {
  value: string;
  source: DeliverableSource;
}

/**
 * THE PER-BOOKING FILE WHEN SET, ELSE THE LISTING'S — and the caller is TOLD which (D-26).
 *
 * §13: the fallback is honest, not silent. A booking with no per-booking artifact reads the
 * listing's file and the response says so, because "the file your expert made for you" and "the
 * file this listing ships to everyone" are different facts, and after a revision they are different
 * documents.
 */
export function resolveDeliverable(
  bookingFile: string | null | undefined,
  listingFile: string | null | undefined,
): ResolvedDeliverable | null {
  const perBooking = (bookingFile ?? "").trim();
  if (perBooking) return { value: perBooking, source: "booking" };
  const listing = (listingFile ?? "").trim();
  if (listing) return { value: listing, source: "listing" };
  return null;
}
