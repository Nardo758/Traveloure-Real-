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

/** Expert attribution — "delivered by". Emitted only when a real expert row exists. */
export interface TripPlanExpertAttribution {
  expertId: string;
  name: string | null;
  avatar: string | null;
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
  tripId: string;
  title: string | null;
  destination: string | null;
  dates: TripPlanDates;
  status: string | null;
  /** Central taxonomy (`contentOriginFor`) — a trip is platform-originated content. */
  origin: ContentOrigin;
  /** Null when no expert is attached to the trip (self-planned). Never invented. */
  deliveredBy: TripPlanExpertAttribution | null;
  /** Real day count from the assembled day list — the link-card / store "N days". */
  dayCount: number;
  /**
   * v1 CAPABILITY GAP: `trips` has no hero-image column, so this is always `null` today. The field
   * exists because §3's `preview` contract names a hero; it is emitted null rather than filled with
   * a stock image (§13).
   */
  heroImageUrl: string | null;
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

  location: string;
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
  /** The leg's real origin point. */
  pickupPoint: string | null;
  /**
   * v1 CAPABILITY GAP: no pickup-time column exists on `transport_booking_options`, so this is
   * always `null`. §13 — a pickup time is never invented from the activity's start time.
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
  alternativeModes: TripPlanLegAlternativeMode[];
  fromLat: number | null;
  fromLng: number | null;
  toLat: number | null;
  toLng: number | null;
  /** LEGACY ALIAS of `distance`. */
  distanceDisplay: string;
  estimatedDurationMinutes: number;
  estimatedCostUsd: number | null;
}

export interface TripPlanDay {
  /** §3 NAME. Same value as `dayNum`. */
  dayNumber: number;
  /** LEGACY ALIAS of `dayNumber` (PlanCardDay.dayNum). */
  dayNum: number;
  /** Formatted day label ("Mon, Oct 6") — the existing plancard contract. */
  date: string;
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
  };
  changeLog: TripPlanChange[];
  metrics: TripPlanMetrics;
  optimizationDelta: unknown;
  lastOptimizedAt: Date | string | null;
  stats: TripPlanStats;
}

/** `full` — owner / delivered traveler / assigned expert / admin. */
export interface FullTripPlan {
  redactionLevel: "full";
  meta: TripPlanMeta;
  days: TripPlanDay[];
  /** Flat leg list (§3). Same leg objects as `days[].transports`. */
  legs: TripPlanLeg[];
  /** Trip-level expert note (`trips.expertNotes`); null when the expert wrote none. */
  tripNote: string | null;
  budget: TripPlanBudget | null;
  changeLogRef: TripPlanChangeLogRef;
  plancard: TripPlanPlancardExtras;
}

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
