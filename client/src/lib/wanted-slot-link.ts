/**
 * wanted-slot-link.ts — the recruitment deep-link a "Wanted here" feed slot points at.
 *
 * Ledger `2026-09-04-earn-contained-fixes` (gap 15 of the Ways-to-Earn audit).
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────
 * The slot's "Offer this" CTA linked to
 *   `/become-expert?city=…&neighborhood=…&offering=<display label>`
 * and every one of those three parts was doing less than it looked like:
 *   • no `type=`, so the wizard fell back to its `travel_expert` default — a Trip
 *     Planner flow — even though the slot is recruiting for a NEIGHBOURHOOD, which is
 *     the Local Expert track's whole subject.
 *   • `offering=` is a param `travel-experts.tsx` never reads. The wizard reads
 *     `offeringTypeKey` (the canonical param, migration-107 column) and `offeringName`.
 *     So the offering the traveller demand was measured against was thrown away at the
 *     door, and `local_expert_forms.offering_type_key` stayed NULL.
 *   • `neighborhood=` was likewise never read, so an applicant sent from Gion arrived
 *     at a claim picker with nothing selected.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────────
 * A param is emitted ONLY when there is a real value behind it (§13). In particular
 * `offeringTypeKey` is emitted only for a key that came from the expert catalog: the
 * feed's own fallback for "the catalog hasn't loaded" is an EMPTY key, and an empty key
 * must produce no param rather than a placeholder the FK cannot hold. Same for a blank
 * city or neighbourhood.
 *
 * `type` is always `local_expert` here — that is what a neighbourhood-scoped wanted slot
 * recruits for, and it is a property of the SLOT, not of the row that filled it.
 *
 * Pure and dependency-free so the mapping is unit-testable without a DOM.
 */

export interface WantedSlotLinkInput {
  /** The market the slot is in. */
  city?: string | null;
  /** The neighbourhood the demand was counted in. */
  neighborhoodName?: string | null;
  /** `expert_offering_types.offering_type_key`, or empty when the catalog gave us none. */
  offeringKey?: string | null;
  /** That row's `display_name` — shown back to the applicant as "You're applying to offer: …". */
  offeringLabel?: string | null;
}

/** The expert track a neighbourhood-scoped wanted slot recruits for. */
export const WANTED_SLOT_EXPERT_TYPE = "local_expert";

/**
 * Build the `/become-expert` href for a wanted slot. Params are emitted in a stable
 * order (`type`, `city`, `neighborhood`, `offeringTypeKey`, `offeringName`) so the link
 * is deterministic and easy to assert on.
 */
export function buildWantedSlotSignupHref(input: WantedSlotLinkInput): string {
  const params = new URLSearchParams();
  params.set("type", WANTED_SLOT_EXPERT_TYPE);
  const add = (key: string, value: string | null | undefined) => {
    const v = (value ?? "").trim();
    if (v) params.set(key, v);
  };
  add("city", input.city);
  add("neighborhood", input.neighborhoodName);
  // Both offering params ride together or not at all: `offeringName` alone would show the
  // applicant a confirmation banner for an offering the row could never record.
  const key = (input.offeringKey ?? "").trim();
  if (key) {
    params.set("offeringTypeKey", key);
    add("offeringName", input.offeringLabel);
  }
  return `/become-expert?${params.toString()}`;
}
