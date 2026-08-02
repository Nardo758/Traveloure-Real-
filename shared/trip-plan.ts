/**
 * TripPlan v1 — the ONE circulating plan interchange object.
 *
 * Governing contract: `docs/EXECUTION_MAP.md` §3 (ratified Jul 30, 2026; amendments are
 * decision-maker calls) + CLAUDE.md §18. The Trip Card is the final product; the plan must move
 * around the platform — expert → traveler, traveler surface → traveler surface, Trip Card → outward
 * channels — as ONE object in ONE format instead of the ~5 ad-hoc shapes that exist today
 * (`trips` + `itinerary_items`, `generated_itineraries` JSON, `itinerary_variants` + `transport_legs`,
 * the assembled plancard response, the ready-made snapshot).
 *
 * THREE RULES THIS FILE ENCODES
 *
 * 1. **Versioned envelope.** Every assembled/circulated/snapshotted plan carries
 *    `meta.tripPlanVersion` so a snapshot survives schema evolution.
 *
 * 2. **Circulate by REFERENCE.** What moves between surfaces is a `tripId` (authed surfaces) or a
 *    share token — never a copied JSON blob. Snapshots happen ONLY at money events (ready-made
 *    purchase, bundle booking). That is why there is no "copy" helper in this file.
 *
 * 3. **Channel = redaction level, applied by the assembler** (the §10 `redactTemplateContent`
 *    content-gate, generalized). See `RedactionLevel`.
 *
 * §13 (no fabrication): every optional field here is `T | null` on purpose. A missing vendor phone,
 * confirmation number, meeting point, expert note, transport leg or booking is emitted as `null` /
 * omitted — NEVER as a placeholder string. Producer adapters that structurally cannot supply a field
 * (e.g. `generated_itineraries` has no vendor linkage) expose that capability gap as `null`.
 *
 * §14: the assembler derives every field from server-side rows. Nothing here is client-supplied.
 *
 * NOTE ON LEGACY ALIASES: the live `GET /api/trips/:tripId/plancard` response (consumed by the
 * PlanCard family) predates this envelope and names some fields differently (`name`/`time`/`dayNum`/
 * `transports`). Per the L3a compatibility rule those names are KEPT and the §3 names are added
 * alongside as documented aliases, so ONE object satisfies both contracts. Fields marked
 * "LEGACY ALIAS" and "§3 NAME" are the same value.
 */

import type { ContentOrigin } from "./content-origin";
import type { RoutingStatus } from "./schema";

/** Bump only with a decision-maker-ratified envelope change; snapshots carry this number. */
export const TRIP_PLAN_VERSION = 1 as const;
export type TripPlanVersion = typeof TRIP_PLAN_VERSION;

/**
 * Channel → redaction level (§3 "Channel = redaction level, applied by the assembler").
 *
 *  • `full`    — owner / delivered traveler / assigned expert / admin. Everything.
 *  • `teaser`  — store lane (Ready Made Trip product page). Day + title ONLY, the exact §10
 *                `redactTemplateContent` posture: the itinerary body IS the paid product.
 *  • `preview` — Direct/OG link cards (WhatsApp, share links). Meta-only: title, dates, day count,
 *                hero, expert attribution. NO itinerary body at all.
 *  • `social`  — the §17 story/carousel pack. TYPE-DEFINED ONLY IN v1: there is no renderer and the
 *                assembler refuses this level rather than emit a half-built pack (§13).
 *
 * The redaction level is the CHANNEL contract, not an authorization check. Callers MUST still gate
 * access (route-level ownership/role checks); asking for `full` does not grant it.
 */
export type RedactionLevel = "full" | "teaser" | "preview" | "social";

/** Levels the v1 assembler can actually produce. `social` is type-only in v1. */
export type AssembledRedactionLevel = Exclude<RedactionLevel, "social">;

/**
 * Where an activity came from. Extends the central content-origin taxonomy
 * (`shared/content-origin.ts`) with the two plan-specific origins §3 names.
 *
 * v1 CAPABILITY GAP (honest, not fabricated): `itinerary_items` carries no affiliate-product link
 * and no DMO-lineage column, so the v1 assembler can only ever emit `expert` or `platform`.
 * `affiliate` / `sourced-derived` are reserved for when that lineage lands (the Add-panel source
 * pills already know it at write time) — the assembler never guesses them.
 */
export type TripPlanActivitySource = "platform" | "expert" | "sourced-derived" | "affiliate";

/**
 * Which data home a plan was assembled FROM (L3b′). Two producers exist today:
 *
 *  • `trip`    — `trips` + `itinerary_items` (+ the selected variant's legs). LIVE by reference:
 *                re-assembling always reflects the current trip.
 *  • `variant` — `itinerary_variants` + `itinerary_variant_items` + `transport_legs`. A SNAPSHOT:
 *                the adapter reads the variant's own rows and NEVER the live trip, so a shared
 *                variant keeps rendering exactly what was shared, forever. This is the whole point
 *                of keying share links on `variantId` (`shared_itineraries.variant_id`).
 *
 * `id` is the producer's own primary key (`trips.id` / `itinerary_variants.id`) — the reference that
 * circulates (§3 "circulate by REFERENCE").
 */
export type TripPlanSourceKind = "trip" | "variant";

export interface TripPlanSourceRef {
  kind: TripPlanSourceKind;
  id: string;
}

/** Expert attribution — "delivered by". Emitted only when a real expert row exists. */
export interface TripPlanExpertAttribution {
  expertId: string;
  name: string | null;
  avatar: string | null;
}

/**
 * The delivery handshake (migration 164; QA_PUNCH_LIST W2-A items 11+13). Read off the trip's
 * advisor row — `null` when the trip has no expert advisor at all (self-planned). `status` mirrors
 * `PLAN_APPROVAL_STATUSES` in shared/schema.ts (`null` = delivered-but-undecided, when
 * `workspaceStatus === "delivered"`).
 */
export interface TripPlanPlanApproval {
  workspaceStatus: string | null; // draft | in_review | delivered
  status: "approved" | "changes_requested" | null;
  approvedAt: string | null;
  reviewNote: string | null;
}

export interface TripPlanDates {
  start: string | null;
  end: string | null;
}

/**
 * Envelope header. Safe at EVERY redaction level — it holds no itinerary body, no vendor contact,
 * no confirmation number. `teaser` and `preview` carry it whole.
 */
export interface TripPlanMeta {
  tripPlanVersion: TripPlanVersion;
  /**
   * Which data home this plan came from (L3b′). Always present — a circulated plan must be able to
   * say what it is a plan OF, independently of whether a `trips` row backs it.
   */
  sourceRef: TripPlanSourceRef;
  /**
   * The `trips` row this plan belongs to, when one does.
   *
   * NULLABLE (widened by L3b′): a **variant-produced** plan may have no trip at all —
   * `itinerary_comparisons.trip_id` is nullable, so an optimizer comparison created straight off a
   * `user_experiences` flow (never applied to a trip) has none. `null` is the honest value; the plan
   * is still fully identified by `meta.sourceRef`. Trip-produced plans always carry it.
   */
  tripId: string | null;
  title: string | null;
  /**
   * Plan-level description (`itinerary_variants.description` on the variant producer). Null when the
   * producer has none — never a generated blurb (§13).
   */
  description: string | null;
  destination: string | null;
  dates: TripPlanDates;
  status: string | null;
  /** Central taxonomy (`contentOriginFor`) — a trip is platform-originated content. */
  origin: ContentOrigin;
  /** Null when no expert is attached to the trip (self-planned). Never invented. */
  deliveredBy: TripPlanExpertAttribution | null;
  /**
   * The delivery handshake (migration 164). Null when the trip has no expert advisor row at all
   * — the Trip Card's "Approve plan / Request changes" banner reads this, never a client guess.
   */
  planApproval: TripPlanPlanApproval | null;
  /** Real day count from the assembled day list — the link-card / store "N days". */
  dayCount: number;
  /**
   * v1 CAPABILITY GAP: `trips` has no hero-image column, so this is always `null` today. The field
   * exists because §3's `preview` contract names a hero; it is emitted null rather than filled with
   * a stock image (§13).
   */
  heroImageUrl: string | null;
}

/**
 * A REAL `service_bookings` row on this trip (Trip-Canon Lane 1, W4 — "purchases reach the plan").
 *
 * Emitted at the `full` level ONLY: `teaser` (store) and `preview` (link card) return before the
 * assembler ever reads bookings, so no redaction branch is needed — a purchase is owner-and-expert
 * information and never rides a public channel.
 *
 * Every field is read straight off the booking row (§13 — no derived "probably booked" state):
 * an item is booked when `itinerary_items.booking_id` points at one of these, and nothing else.
 */
export interface TripPlanBooking {
  /** `service_bookings.id`. */
  id: string;
  /** `service_bookings.service_id` — NULL for transport-commerce bookings (CLAUDE.md exception). */
  serviceId: string | null;
  /** RAW booking status (`payment_pending` | `confirmed` | `completed` | `refunded` | …). */
  status: string | null;
  /** `provider_services.service_name` when the booking links one; null otherwise. Never a guess. */
  serviceName: string | null;
  /** RAW `service_bookings.total_amount` as stored (decimal string). */
  totalAmount: string | null;
}

export interface TripPlanActivityChange {
  who: string;
  what: string;
  when: string;
}

export interface TripPlanActivity {
  id: string;

  /** §3 NAME. Same value as `name`. */
  title: string;
  /** LEGACY ALIAS of `title` (PlanCardActivity.name). */
  name: string;

  /** §3 NAME. `null` when the item has no start time. */
  startTime: string | null;
  /** §3 NAME. `null` when the item has no end time (most rows). */
  endTime: string | null;
  /** LEGACY ALIAS of `startTime`, empty-string when absent (PlanCardActivity.time). */
  time: string;

  /**
   * NULLABLE (widened by L3b′): the variant producer passes `itinerary_variant_items.location`
   * through RAW so "no location recorded" stays `null` instead of becoming an empty string. The trip
   * producer still normalizes to `""`, as before — its output is unchanged.
   */
  location: string | null;
  lat: number | null;
  lng: number | null;

  /** Provider-canonical Maps link derived from `itinerary_items.googlePlaceId`; null without one. */
  mapsUrl: string | null;
  /** From the linked `provider_services.meeting_point`; null for free-text/place items. */
  meetingPoint: string | null;
  /** `itinerary_items.confirmationNumber` (falls back to bookingReference); null until a real booking. */
  confirmationNumber: string | null;
  /** `vendor_contracts.vendor_phone` via `itinerary_items.vendorContractId`; null without a contract. */
  vendorPhone: string | null;
  /** Expert's voice on the item (`expert_note`, migration 152; legacy fallback to `notes`). */
  expertNote: string | null;

  /** Derived from the RAW `itinerary_items.status === 'completed'` — no dedicated column exists. */
  visited: boolean;
  source: TripPlanActivitySource;

  // ── OPTIONAL producer-native fields (L3b′, additive) ──────────────────────────────────────
  // Emitted only by producers whose rows actually carry them, so a producer that does not is
  // byte-identical to before this addition (an absent key, not a null one).
  /** Free-text activity description (`itinerary_variant_items.description`). */
  description?: string | null;
  /** Planned duration in minutes (`itinerary_variant_items.duration`). */
  durationMinutes?: number | null;
  /**
   * The producer's RAW category string (`itinerary_variant_items.service_type` /
   * `itinerary_items.item_type`), unmapped. `type` above is the MAPPED display value; this is the
   * source vocabulary, for consumers that need to re-map it themselves.
   */
  category?: string | null;

  /**
   * ADDITIVE (Lane 1 W4 / H2) — the REAL booking this plan item was bought through, resolved by
   * `itinerary_items.booking_id` (migration 159). PRESENT ONLY WHEN THE ITEM IS REALLY BOOKED, so a
   * producer/level that carries no bookings is byte-identical to before this field existed (an
   * absent key, not a null one). The variant snapshot producer never emits it — nothing is booked
   * on a proposal.
   *
   * PRESENCE IS THE BOOKED STATE. There is no separate boolean to disagree with it, and it is never
   * inferred from `routing_status` alone: an item reads as bought only when a booking row backs it.
   */
  booking?: TripPlanBooking;

  /**
   * ADDITIVE (Trip-Canon Lane 1, Phase 1d / W7) — `itinerary_items.routing_status` (migration 159:
   * `in_planning | with_expert | ready_for_checkout | purchased`, ROUTING_STATE_CONTRACT §1). PRESENT
   * ONLY on the TRIP producer (the variant snapshot has no such column — a proposal is not routable,
   * ROUTING_STATE_CONTRACT §2 "Logistics family" / capability-gap posture), so an absent key means
   * "this item is not on the routing state machine," never "in_planning" by default-guessing (§13).
   * READ-ONLY here: this assembler never writes it — the routing.routes.ts transition endpoint and the
   * checkout/refund paths are the sole writers (contract §2). The Trip Card (W7) reads this to render
   * the per-item badge and to decide which routing actions to offer the owner.
   */
  routingStatus?: RoutingStatus;

  // ── Existing plancard contract fields (kept — live consumers read them) ────────────────
  /** Display type, via the plancard `mapItemType` mapping. */
  type: string;
  /** Display status, via the plancard `mapItemStatus` mapping (NOT the raw row status). */
  status: string;
  cost: number;
  comments: number;
  suggestedBy: string | null;
  changes: TripPlanActivityChange[];
}

/** Real booking data for a chauffeured leg. Emitted only when a booked/confirmed option exists. */
export interface TripPlanLegBooking {
  /**
   * The leg's real origin point: the expert-written `transport_legs.pickup_point` when they stated
   * one (§18 L4), else the leg's own origin name. Never invented.
   */
  pickupPoint: string | null;
  /**
   * The expert-written `transport_legs.pickup_time` (a DISPLAY STRING — no tz math), or `null`.
   * `transport_booking_options` still has no pickup-time column, so a booked leg whose expert never
   * stated a time stays `null`. §13 — a pickup time is never invented from the activity's start time.
   */
  pickupTime: string | null;
  /** `transport_booking_options.confirmationRef`. */
  rideRef: string | null;
}

export interface TripPlanLegAlternativeMode {
  mode: string;
  durationMinutes: number;
  costUsd: number | null;
  energyCost?: number;
  reason?: string;
}

export interface TripPlanLeg {
  id: string;
  dayNumber: number;

  fromActivityId: string | null;
  toActivityId: string | null;
  mode: string;
  /** §3 NAME. Same value as `duration`. */
  durationMin: number;
  /** §3 NAME — human display distance (`transport_legs.distanceDisplay`). */
  distance: string | null;

  /** Present ONLY with a real booked/confirmed booking option (§13). */
  booked: TripPlanLegBooking | null;
  /**
   * §16 marker: a chauffeured mode that is recommended but NOT booked must be booked through the
   * in-platform booking-agent rail. `'agent-rail'` or null — this object NEVER carries an affiliate
   * URL, by design (the URL stays server-side).
   */
  bookVia: "agent-rail" | null;

  // ── Existing plancard contract fields (kept — live consumers read them) ────────────────
  /** LEGACY ALIAS of `fromActivityId` ("" when absent) (PlanCardTransport.from). */
  from: string;
  /** LEGACY ALIAS of `toActivityId` ("" when absent) (PlanCardTransport.to). */
  to: string;
  fromName: string;
  toName: string;
  /** LEGACY ALIAS of `durationMin`. */
  duration: number;
  cost: number;
  line: string | null;
  status: string;
  suggestedBy: string | null;
  bookingSource: "platform" | "affiliate" | null;
  partnerName: string | null;
  legOrder: number;
  recommendedMode: string;
  userSelectedMode: string | null;
  /**
   * NULLABLE (widened by L3b′): the variant producer passes `transport_legs.alternative_modes`
   * through RAW, preserving the honest difference between NULL (the optimizer never computed
   * alternatives for this leg) and `[]` (it computed none). The trip producer normalizes to `[]`, as
   * before — its output is unchanged.
   */
  alternativeModes: TripPlanLegAlternativeMode[] | null;
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  /** LEGACY ALIAS of `distance`. */
  distanceDisplay: string;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;

  // ── OPTIONAL producer-native fields (L3b′, additive — absent, not null, on producers that
  //    do not emit them) ────────────────────────────────────────────────────────────────────────
  /** Machine distance (`transport_legs.distance_meters`); `distance`/`distanceDisplay` is the label. */
  distanceMeters?: number | null;
  /** Optimizer energy cost for the chosen mode (`transport_legs.energy_cost`). */
  energyCost?: number | null;
  /**
   * §18 L4 (migration 154) — the expert's stated pickup arrangement for a chauffeured leg. PRESENT
   * ONLY when the expert actually wrote one of the two fields, so a leg with no arrangement (every
   * legacy variant leg) carries neither key rather than a pair of nulls. These are arrangement
   * facts, NOT a booking record: `booked` still reflects real `transport_booking_options` state.
   */
  pickupPoint?: string | null;
  /** Display string (no timezone math in v1) — see `pickupPoint`. */
  pickupTime?: string | null;
}

export interface TripPlanDay {
  /** §3 NAME. Same value as `dayNum`. */
  dayNumber: number;
  /** LEGACY ALIAS of `dayNumber` (PlanCardDay.dayNum). */
  dayNum: number;
  /** Formatted day label ("Mon, Oct 6") — the existing plancard contract. */
  date: string;
  /**
   * OPTIONAL (L3b′, additive): the same day as a machine `YYYY-MM-DD` string, for consumers that
   * need to compute rather than display (`date` above is locale-formatted). `null` when the producer
   * has no start date to count from — never a guessed date (§13). Absent on producers that do not
   * emit it, so their output is unchanged.
   */
  dateIso?: string | null;
  /** Derived day headline; the `teaser` level's `title`. */
  label: string;
  activities: TripPlanActivity[];
  /** LEGACY placement of this day's legs; the same objects also appear in `TripPlan.legs`. */
  transports: TripPlanLeg[];
}

export interface TripPlanBudgetCategory {
  category: string;
  amount: number;
}

export interface TripPlanBudget {
  /** Single platform currency today (see CLAUDE.md §10 "Currency"); multi-currency is Stage-2. */
  currency: string;
  /** `trips.budget` — the planned total. Null when the trip has no budget set. */
  planned: number | null;
  /** Real PAID `trip_transactions` grouped by category. Empty array when nothing is recorded. */
  spentBreakdown: TripPlanBudgetCategory[];
}

/**
 * §3: the change log is tripId-scoped and heavy, so the envelope carries a REFERENCE, not the rows.
 * (The plancard extras block below still carries the 10 most recent entries for the existing
 * consumers — that is the legacy contract, not the envelope.)
 */
export interface TripPlanChangeLogRef {
  tripId: string;
  endpoint: string;
}

export interface TripPlanChange {
  id: string;
  who: string;
  what: string;
  when: string;
  type: string;
  role: string;
}

export interface TripPlanMetrics {
  traveloureScore?: number;
  optimizationScore?: number;
  totalCost?: number;
  perPersonCost?: number;
  savings?: number;
  savingsPercent?: number;
  wellnessMinutes?: number;
  travelDistanceMinutes?: number;
  starRatingDelta?: number;
}

export interface TripPlanStats {
  totalDays: number;
  totalActivities: number;
  totalLegs: number;
  totalTransitMinutes: number;
  confirmedActivities: number;
  pendingExpertChanges: number;
}

/**
 * The pre-existing `GET /api/trips/:tripId/plancard` response blocks that are NOT part of the §3
 * envelope. They are produced by the same assembler so the route stays a thin caller and no live
 * consumer breaks. New consumers should read the envelope (`meta`/`days`/`legs`/…), not this block.
 */
export interface TripPlanPlancardExtras {
  tripRole: string;
  trip: {
    id: string;
    title: string | null;
    destination: string | null;
    status: string | null;
    eventType: string | null;
    startDate: string | null;
    endDate: string | null;
    travelers: number;
    /** Pre-formatted display string, e.g. "$4,500" — the existing contract. */
    budget: string | null;
    /** Lane S §3 (ruling 10): the slip's identity — the existing TRV- scheme. NULL on
     *  pre-Lane-S rows (no backfill was ratified); render nothing for NULL, never invent. */
    trackingNumber?: string | null;
    /** Lane S §3: version = `item_transition_log` row count for this trip. Display-only,
     *  computed per read — never a stored column. 0 for trips predating the log (honest). */
    planVersion?: number;
  };
  changeLog: TripPlanChange[];
  metrics: TripPlanMetrics;
  optimizationDelta: unknown;
  lastOptimizedAt: Date | string | null;
  stats: TripPlanStats;
}

/**
 * Producer-native plan-level figures, passed through **RAW** — the same LEGACY ALIAS precedent as
 * `name`/`time`/`dayNum` above. `itinerary_variants.total_cost` is a SQL decimal, so the row value
 * is a string like `"1240.50"`; parsing it to a number would silently change every pre-envelope
 * consumer's rendering (`"$1240.50"` → `"$1240.5"`). New consumers should parse defensively.
 * Absent on producers that have no plan-level figures.
 */
export interface TripPlanSourceFigures {
  /** RAW as stored (decimal string on `itinerary_variants`). */
  totalCost: string | number | null;
  optimizationScore: number | null;
}

/** `full` — owner / delivered traveler / assigned expert / admin. */
export interface FullTripPlan {
  redactionLevel: "full";
  meta: TripPlanMeta;
  days: TripPlanDay[];
  /**
   * Flat leg list (§3). The trip producer emits exactly the legs placed on `days[].transports`; the
   * variant producer emits EVERY leg row of the snapshot (a leg whose day carries no items is still
   * part of the plan's transport totals), so `legs` is a superset of the day-placed legs there.
   */
  legs: TripPlanLeg[];
  /** Trip-level expert note (`trips.expertNotes`); null when the expert wrote none. */
  tripNote: string | null;
  budget: TripPlanBudget | null;
  /**
   * NULLABLE (widened by L3b′): the change log is tripId-scoped, so a variant-produced plan with no
   * linked trip (`itinerary_comparisons.trip_id` null) has no log to point at. Null rather than a
   * reference to an endpoint that cannot answer.
   */
  changeLogRef: TripPlanChangeLogRef | null;
  /** OPTIONAL (L3b′, additive) — see `TripPlanSourceFigures`. */
  sourceFigures?: TripPlanSourceFigures | null;
  /**
   * ADDITIVE (Lane 1 W4 / H2) — EVERY real `service_bookings` row on this trip, whether or not a
   * plan item points at it. The per-item `activity.booking` covers items that ARE linked; this list
   * is why the field exists at all: a booking made before the item↔booking key existed, or bought
   * outside the plan entirely, would otherwise be invisible on the Trip Card — which is H2 itself
   * ("purchases never reach the plan"). Emitted only by the TRIP producer at `full`; absent
   * elsewhere, so every pre-existing consumer is unaffected.
   */
  bookings?: TripPlanBooking[];
  plancard: TripPlanPlancardExtras;
}

/**
 * The `full` plan as produced by the VARIANT adapter (`assembleTripPlanFromVariant`).
 *
 * It is the same §3 envelope, minus the `plancard` block — and that is deliberate, not a gap: the
 * `plancard` extras are the pre-envelope `/api/trips/:tripId/plancard` route contract (explicitly
 * "NOT part of the §3 envelope" above), and a variant snapshot has no trip role, no change log and
 * no `trips` row to fill them with. §13 says omit what you cannot honestly supply rather than invent
 * a `tripRole` or an empty `trip` block. Every §3 field — `meta`/`days`/`legs`/`tripNote`/`budget`/
 * `changeLogRef` — is present, so a consumer written against the envelope renders both producers.
 */
export type VariantFullTripPlan = Omit<FullTripPlan, "plancard">;

/** A `teaser` day: day + title ONLY — the §10 `redactTemplateContent` shape. */
export interface TeaserTripPlanDay {
  dayNumber: number;
  title: string | null;
}

/**
 * `teaser` — the store lane. Day + title only: NO activities array, no legs, no vendor contact,
 * no confirmation numbers, no notes, no budget. The itinerary body is the paid product.
 */
export interface TeaserTripPlan {
  redactionLevel: "teaser";
  meta: TripPlanMeta;
  days: TeaserTripPlanDay[];
}

/** `preview` — Direct/OG link cards. Meta only: NO itinerary body of any kind. */
export interface PreviewTripPlan {
  redactionLevel: "preview";
  meta: TripPlanMeta;
}

/**
 * `social` — the §17 story/carousel pack. TYPE-DEFINED ONLY in v1 (no renderer, no assembler
 * branch). Declared so the L3 payload/renderer split has a named target; the assembler refuses the
 * level rather than emit a partial pack (§13).
 */
export interface SocialTripPlan {
  redactionLevel: "social";
  meta: TripPlanMeta;
  /** Reserved for the §17 story/carousel slots — real content only, never placeholder slides. */
  slides: never[];
}

export type AnyTripPlan = FullTripPlan | TeaserTripPlan | PreviewTripPlan | SocialTripPlan;

/** Maps a redaction level to the plan shape the assembler returns for it. */
export type TripPlanFor<L extends AssembledRedactionLevel> = L extends "full"
  ? FullTripPlan
  : L extends "teaser"
    ? TeaserTripPlan
    : PreviewTripPlan;

/** Type guard — the only way to read the itinerary body off an assembled plan. */
export function isFullTripPlan(plan: AnyTripPlan): plan is FullTripPlan {
  return plan.redactionLevel === "full";
}

/**
 * Chauffeured modes — a ride someone else drives. §18's mode-aware primary action and the §16
 * `bookVia` marker both key off this set: a chauffeured leg that is not really booked must route
 * through the booking-agent rail, never a raw affiliate deep link.
 */
export const CHAUFFEURED_MODES: readonly string[] = [
  "taxi",
  "rideshare",
  "private_driver",
  "car_service",
  "chauffeur",
];

export function isChauffeuredMode(mode: string | null | undefined): boolean {
  return !!mode && CHAUFFEURED_MODES.includes(mode.toLowerCase());
}
