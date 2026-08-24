/**
 * Method-aware service fundamentals (decision-maker ratified Aug 10, 2026 — D2 of the
 * service-fundamentals brief). ONE definition of which fundamentals apply to which service
 * shape, shared by the server scorers (provider-listing-health.routes.ts, demand.routes.ts)
 * and the client chips (provider/services.tsx, storefront.tsx) — so "place-anchored" means
 * the same thing everywhere, the advisor-fundamentals `parseCoord`/`isLodgingShaped`
 * extraction precedent applied one lane over.
 *
 * Grounding in the canonical vocabulary (CLAUDE.md §3, deliveryMethodEnum):
 *  - `in_person` / `hybrid` happen at a real-world place → the exact-pin fundamentals apply.
 *  - `call` / `video` are LIVE sessions (the storefront's own labels: "Phone call" /
 *    "Video call") → they need bookable calendar slots but no place.
 *  - `pdf` / `voice_notes` / `async_messaging` are artifact/async delivery → neither a place
 *    nor a calendar is fundamental to them.
 *  - `productShape = 'property'` (migration 153) is place-anchored and scheduled regardless
 *    of its deliveryMethod, which is meaningless for an accommodation listing.
 *  - `productShape = 'bundle'` is classified by the bundle row's OWN deliveryMethod — its
 *    components each carry their own fundamentals on their own rows.
 *
 * A row with no deliveryMethod and no property shape cannot be classified honestly; callers
 * keep the historical all-checks behavior for it rather than guessing an omission (§13).
 */

export const PLACE_ANCHORED_METHODS: ReadonlySet<string> = new Set(["in_person", "hybrid"]);
export const SCHEDULED_METHODS: ReadonlySet<string> = new Set(["in_person", "hybrid", "call", "video"]);

export interface FundamentalsShape {
  deliveryMethod: string | null | undefined;
  productShape: string | null | undefined;
}

/** True when the row carries enough signal to classify at all. */
export function isClassifiable(s: FundamentalsShape): boolean {
  return s.productShape === "property" || !!s.deliveryMethod;
}

/** Happens at a real-world place — the exact-pin / meeting-point fundamentals apply. */
export function isPlaceAnchored(s: FundamentalsShape): boolean {
  if (s.productShape === "property") return true;
  return !!s.deliveryMethod && PLACE_ANCHORED_METHODS.has(s.deliveryMethod);
}

/** Needs bookable calendar slots — the availability fundamental applies. */
export function needsScheduling(s: FundamentalsShape): boolean {
  if (s.productShape === "property") return true;
  return !!s.deliveryMethod && SCHEDULED_METHODS.has(s.deliveryMethod);
}

// D3 (docs/briefs/SERVICE_FUNDAMENTALS_DECISIONS.md, ratified Aug 10 2026): "the first
// fulfillment rail is PDF DELIVERY" — deliberately `pdf` only. `video` is EXCLUDED here on
// purpose: the block comment above (D2, also ratified) classifies `video` as a LIVE session
// ("Video call") that needs `SCHEDULED_METHODS`/availability, not an artifact file — the two
// classifications are mutually exclusive by design, not an oversight. `voice_notes` and
// `async_messaging` are artifact/async delivery too (per the D2 note above) but D3's ratified
// scope names only pdf as this rail's first (and so-far only) fulfillment target; call
// join-link and async SLA are the documented second/third rails, on the same pattern, not yet
// built.
export const ARTIFACT_DELIVERY_METHODS: ReadonlySet<string> = new Set(["pdf"]);

/** Delivers a standing artifact file (the D3 fulfillment rail) rather than a live session. */
export function isArtifactDelivery(s: FundamentalsShape): boolean {
  return !!s.deliveryMethod && ARTIFACT_DELIVERY_METHODS.has(s.deliveryMethod);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// D8 — PER-METHOD COMPLETION RULES (docs/DECISIONS.md ruling 63, decision-maker ratified
// Aug 11 2026). ONE payout machinery, no per-method money forks: every rule below names WHEN a
// booking's completion event fires; WHAT it does is identical for all of them (the shared
// `completeBooking` in server/services/booking-completion.service.ts → the SAME
// `updateServiceBookingStatus('completed')` flip that mints the held earning, then the existing
// escrow window / traveler confirm-completion release).
//
// This lives HERE, beside the D2 predicates, so method resolution has exactly one home — a
// second local method list in a job or a route is the defect this placement prevents.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type CompletionRule =
  /**
   * in_person / hybrid — the BOOKED SERVICE DATE timer (ruling 69 disposition 1, which AMENDS
   * ruling 63's "confirm-completion flip as built" clause).
   *
   * Ruling 66 found that "as built" was a closed loop: nothing could put an in-person booking into
   * `completed`, and `POST /api/bookings/:id/confirm-completion` refuses anything that is not
   * already there — so in-person was the one method with no writer at all. The decision-maker's
   * disposition is the `checkout_date` shape one method over: auto-complete N days after the booked
   * service date has FULLY PASSED, with N reusing `holdWindowDays('service_booking')` so completion
   * lands exactly where the dispute window closes rather than minting a second constant.
   *
   * The traveler's `confirm-completion` is UNCHANGED and is not a D8 rule — it is the EARLY
   * RELEASE of the held earning, which ruling 66 already separated from the completion event.
   * A booking with NO service date is not timer-eligible (§13 — never guess a date); it is skipped
   * with its reason, and in that case ONLY, the owner rail's provider-declared arm opens.
   */
  | "service_date_timer"
  /** productShape property / property_room — the stay's checkout date. */
  | "checkout_date"
  /** pdf — delivered via entitlement; the auto-complete timer (first download, or undownloaded). */
  | "artifact_timer"
  /** call / video / voice_notes — session end per BOOKED SLOT, provider-confirmed. */
  | "session_end"
  /** async_messaging — SLA satisfied + scope delivered, provider-declared, disputable window. */
  | "provider_declared"
  /** productShape bundle — ALL components complete; partial routes to the refund lane. */
  | "bundle_components";

/**
 * Ruling 63's "call/voice" row — LIVE sessions only.
 *
 * `voice_notes` was here until ruling 69 disposition 8 moved it (see below). Ruling 66 shipped it
 * in this set and REPORTED the resulting gap rather than papering over it: D2 above classifies
 * voice_notes as async/artifact delivery and leaves it out of `SCHEDULED_METHODS`, so such a
 * booking carries no `slot_id` and the session-end evidence gate could only ever refuse it with
 * `no_booked_slot`. The decision-maker resolved that filed gap by reclassification, not by
 * inventing a scheduled shape for it.
 */
export const SESSION_END_METHODS: ReadonlySet<string> = new Set(["call", "video"]);

/**
 * Ruling 63's "async" row, PLUS `voice_notes` (ruling 69 disposition 8 — AMENDS ruling 66's
 * table). voice_notes has no booked slot in the D2 vocabulary, and "SLA satisfied + scope
 * delivered, provider-declared, disputable window" is what its delivery actually looks like.
 */
export const PROVIDER_DECLARED_METHODS: ReadonlySet<string> = new Set(["async_messaging", "voice_notes"]);

/**
 * The completion rule for a service shape, or `null` when the row cannot be classified honestly
 * (§13 — an unclassifiable booking is SKIPPED with a stated reason, never auto-completed).
 *
 * productShape is checked FIRST and deliberately outranks deliveryMethod here — ruling 63 gives
 * bundles and properties their own completion rows, and a bundle's own deliveryMethod says
 * nothing about whether its components were delivered. (This is the one place the D8 ordering
 * differs from D2's fundamentals ordering, which classifies a bundle by its own deliveryMethod;
 * the two questions are different, and the divergence is intentional.)
 */
export function completionRuleFor(s: FundamentalsShape): CompletionRule | null {
  if (s.productShape === "bundle") return "bundle_components";
  if (s.productShape === "property" || s.productShape === "property_room") return "checkout_date";
  if (!s.deliveryMethod) return null;
  if (ARTIFACT_DELIVERY_METHODS.has(s.deliveryMethod)) return "artifact_timer";
  if (SESSION_END_METHODS.has(s.deliveryMethod)) return "session_end";
  if (PROVIDER_DECLARED_METHODS.has(s.deliveryMethod)) return "provider_declared";
  if (PLACE_ANCHORED_METHODS.has(s.deliveryMethod)) return "service_date_timer";
  return null;
}

/** Rules a scheduled TIMER may fire on its own (no human in the loop). */
export const TIMER_DRIVEN_COMPLETION_RULES: ReadonlySet<CompletionRule> = new Set<CompletionRule>([
  "artifact_timer",
  "checkout_date",
  // Ruling 69 disposition 1 — in_person/hybrid joins the timer rules. The NORMAL path for an
  // in-person booking is this timer; the owner's provider-declared arm opens ONLY for a booking
  // that carries no service date at all (see `resolveCompletionEligibility`).
  "service_date_timer",
]);

/** Rules the booking OWNER (provider/expert) declares. */
export const OWNER_DECLARED_COMPLETION_RULES: ReadonlySet<CompletionRule> = new Set<CompletionRule>([
  "session_end",
  "provider_declared",
  "bundle_components",
]);
