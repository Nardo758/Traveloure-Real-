/**
 * Traveler profile — WP-A (docs/briefs/OPTIMIZER_SOURCING_BUILD_SPEC.md).
 *
 * Durable per-traveler profile living in the EXISTING `users.preferences` jsonb namespace
 * (migration 150) under a new `travelerProfile` key — NO new migration, NO new table, exactly
 * the same "namespaced jsonb, shallow-merge your own key" posture `/api/me/preferences`
 * (`settings`) and `/api/me/travel-preferences` (`travelPreferences`) already use
 * (server/routes/storefront.routes.ts).
 *
 * ── SHAPE ─────────────────────────────────────────────────────────────────────────────────────
 * `preferences.travelerProfile.explicit` — traveler-stated fields, PATCHed via the allow-list
 *   route in server/routes/traveler-profile.routes.ts. Never touched by anything in this file
 *   except `updateExplicitTravelerProfile`.
 * `preferences.travelerProfile.derived.dislikeThemeCounts` — the ONLY derived signal that needs
 *   durable storage, because the dislike-feedback chips a traveler submits on a regenerate
 *   (trips.routes.ts / routes.ts `/generate`) are otherwise a one-shot request payload with no
 *   history anywhere. `recordDislikeFeedback` is called from itinerary-optimizer.ts (the one
 *   integration point this work package owns) with the REAL chips a traveler just submitted —
 *   never synthesized. Everything else derived (past transport mode picks) is recomputed live
 *   from real booked rows on every read, never cached/staled here.
 *
 * ── MERGE RULE (governs every effective field) ───────────────────────────────────────────────
 * Explicit beats derived. A field the traveler explicitly set always wins; a derived signal only
 * ever fills a gap the traveler left unset. Neither field ever gets a fabricated default — an
 * unset explicit value with no real derived signal behind it stays `undefined` (§13: never
 * present a guess as a fact). See `mergeTravelerProfile` — pure, unit-tested,
 * server/services/__tests__/traveler-profile.service.test.ts.
 *
 * ── §8/§18 BOUNDARY ───────────────────────────────────────────────────────────────────────────
 * Every function in this file touches CHOICE — which mode is scored highest, which platform
 * service sorts first, what the optimizer prompt nudges toward — and NEVER an amount, a fee, or
 * a rate. `effectiveProfileToTransportPrefs` only ever sets `prioritize` / `accessibility` /
 * `maxWalkMinutes` / `budgetTier` on the EXISTING `UserTransportPrefs` scoring knobs
 * (transport-leg-calculator.ts, untouched) — never a cost figure. No fee/commission/margin
 * literal appears here (grep-gated by scripts/check-money-endpoints.cjs).
 */

import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import type { UserTransportPrefs } from "./transport-leg-calculator";

// ─── Vocabularies (single source — reused by the PATCH route's zod schema) ─────────────────────

export const TRANSPORT_PREFERENCE_VALUES = ["time", "cost", "comfort", "scenic"] as const;
export type TransportPreference = (typeof TRANSPORT_PREFERENCE_VALUES)[number];

export const PACE_VALUES = ["relaxed", "moderate", "packed"] as const;
export type Pace = (typeof PACE_VALUES)[number];

export const BUDGET_BAND_VALUES = ["budget", "moderate", "luxury"] as const;
export type BudgetBand = (typeof BUDGET_BAND_VALUES)[number];

export const DIETARY_VALUES = [
  "vegetarian", "vegan", "halal", "kosher", "gluten_free", "dairy_free", "nut_free",
] as const;
export type DietaryTag = (typeof DIETARY_VALUES)[number];

export const MOBILITY_VALUES = ["standard", "limited", "wheelchair"] as const;
export type Mobility = (typeof MOBILITY_VALUES)[number];

/** Mirrors trips.routes.ts / routes.ts's FEEDBACK_CHIPS allow-list exactly (kept in sync by hand
 *  — those routes are outside this work package's file ownership). */
export const DISLIKE_FEEDBACK_CHIPS = [
  "too_expensive", "too_packed", "wrong_areas", "wrong_vibe",
] as const;
export type DislikeFeedbackChip = (typeof DISLIKE_FEEDBACK_CHIPS)[number];

export interface TravelerProfileExplicit {
  transportPreference?: TransportPreference;
  pace?: Pace;
  budgetBand?: BudgetBand;
  dietary?: DietaryTag[];
  mobility?: Mobility;
  updatedAt?: string;
}

export interface TravelerProfileDerived {
  /** Most-picked mode across the traveler's own BOOKED/CONFIRMED transport_booking_options rows.
   *  Null when no purchased transport history exists — never guessed. */
  preferredTransportMode: string | null;
  /** Full histogram behind `preferredTransportMode`, for transparency in the GET response. */
  transportModeCounts: Record<string, number>;
  /** Running counts of dislike-feedback chips actually submitted on past re-runs (real data,
   *  accumulated by `recordDislikeFeedback`). Empty when the traveler has never submitted one. */
  dislikeThemeCounts: Record<string, number>;
}

export type FieldSource = "explicit" | "derived" | "none";

export interface EffectiveTravelerProfile {
  transportPreference?: TransportPreference;
  pace?: Pace;
  budgetBand?: BudgetBand;
  dietary: DietaryTag[];
  mobility?: Mobility;
  source: Record<"transportPreference" | "pace" | "budgetBand" | "dietary" | "mobility", FieldSource>;
}

export interface TravelerProfile {
  explicit: TravelerProfileExplicit;
  derived: TravelerProfileDerived;
  effective: EffectiveTravelerProfile;
}

// ─── Pure derivation helpers (no DB — the unit-tested core) ────────────────────────────────────

/**
 * A real historical mode name → the `UserTransportPrefs.prioritize` dimension it best serves.
 * Hand-authored classification (same convention as itinerary-optimizer.ts's MARQUEE_KEYWORDS /
 * COMMODITY_TYPES tables) over the mode vocabulary the engine actually produces
 * (server/data/transport-profiles.ts, server/services/trip-transport-legs.service.ts's
 * SELECTABLE_TRANSPORT_MODES). An unrecognized mode returns null — no guess for a mode this
 * table doesn't know, never a fabricated "default" dimension.
 */
const COMFORT_MODES = new Set([
  "taxi", "rideshare", "private_car", "car", "chauffeur", "private_transfer", "limousine",
]);
const SCENIC_MODES = new Set([
  "walk", "bike", "cycle", "ferry", "boat", "cable_car", "gondola",
]);
const COST_MODES = new Set([
  "bus", "metro", "subway", "train", "tram", "public_transit", "shuttle",
]);

export function classifyModeToPrioritize(mode: string): TransportPreference | null {
  const m = mode.trim().toLowerCase();
  if (COMFORT_MODES.has(m)) return "comfort";
  if (SCENIC_MODES.has(m)) return "scenic";
  if (COST_MODES.has(m)) return "cost";
  return null;
}

/**
 * "too_packed" repeated at least twice is the only theme with a direct pace mapping (a single
 * complaint could be about one specific day, not a general pace preference; a repeated one is a
 * real pattern). Other themes (too_expensive/wrong_areas/wrong_vibe) have no honest pace mapping
 * and are surfaced as-is in the prompt section instead of forced into a field they don't fit.
 */
export function derivePaceFromDislikeThemes(counts: Record<string, number>): Pace | null {
  if ((counts.too_packed ?? 0) >= 2) return "relaxed";
  return null;
}

/** THE merge rule: explicit beats derived; neither is ever backfilled with a fabricated default. */
export function mergeTravelerProfile(
  explicit: TravelerProfileExplicit,
  derived: TravelerProfileDerived,
): EffectiveTravelerProfile {
  const derivedTransportPreference = derived.preferredTransportMode
    ? classifyModeToPrioritize(derived.preferredTransportMode)
    : null;
  const derivedPace = derivePaceFromDislikeThemes(derived.dislikeThemeCounts);

  function pick<T>(explicitVal: T | undefined, derivedVal: T | null): { value: T | undefined; source: FieldSource } {
    if (explicitVal !== undefined) return { value: explicitVal, source: "explicit" };
    if (derivedVal !== null) return { value: derivedVal, source: "derived" };
    return { value: undefined, source: "none" };
  }

  const transportPreference = pick(explicit.transportPreference, derivedTransportPreference);
  const pace = pick(explicit.pace, derivedPace);
  // budgetBand/dietary/mobility have no real derived source in this work package's scope —
  // explicit-only fields, documented rather than silently backfilled with a guess.
  const budgetBand = pick(explicit.budgetBand, null);
  const mobility = pick(explicit.mobility, null);
  const dietary = explicit.dietary ?? [];

  return {
    transportPreference: transportPreference.value,
    pace: pace.value,
    budgetBand: budgetBand.value,
    dietary,
    mobility: mobility.value,
    source: {
      transportPreference: transportPreference.source,
      pace: pace.source,
      budgetBand: budgetBand.source,
      dietary: dietary.length > 0 ? "explicit" : "none",
      mobility: mobility.source,
    },
  };
}

/**
 * Effective profile → the ONLY `UserTransportPrefs` knobs it ever touches: `prioritize`,
 * `accessibility`, `maxWalkMinutes`, `budgetTier`. Never `avoidModes` (no honest source for it
 * yet) and never anything cost-shaped beyond the engine's own existing `budgetTier` scoring
 * weight — this modulates which mode SCORES highest, not what anything COSTS (§8/§18).
 */
export function effectiveProfileToTransportPrefs(effective: EffectiveTravelerProfile): Partial<UserTransportPrefs> {
  const prefs: Partial<UserTransportPrefs> = {};
  if (effective.transportPreference) prefs.prioritize = effective.transportPreference;
  if (effective.budgetBand) prefs.budgetTier = effective.budgetBand;
  if (effective.mobility === "wheelchair" || effective.mobility === "limited") {
    prefs.accessibility = true;
    // A real consequence of the traveler's OWN stated mobility field, not an invented number —
    // the engine's own DEFAULT_PREFS.maxWalkMinutes (15) is the "no signal" case; this narrows it
    // only when the traveler (or the derived-pace-adjacent mobility field) says to.
    prefs.maxWalkMinutes = 5;
  }
  return prefs;
}

const DIETARY_KEYWORDS: Record<DietaryTag, string[]> = {
  vegetarian: ["vegetarian"],
  vegan: ["vegan", "plant-based", "plant based"],
  halal: ["halal"],
  kosher: ["kosher"],
  gluten_free: ["gluten-free", "gluten free"],
  dairy_free: ["dairy-free", "dairy free"],
  nut_free: ["nut-free", "nut free"],
};

/** Real keyword match against a service's own text — never a fabricated "matches" verdict. */
export function matchesDietary(text: string, dietary: DietaryTag[]): boolean {
  if (!dietary || dietary.length === 0 || !text) return false;
  const lower = text.toLowerCase();
  return dietary.some((tag) => (DIETARY_KEYWORDS[tag] || []).some((kw) => lower.includes(kw)));
}

/** Compact prompt section, same style as buildCityIntelligenceSection — every line is
 *  conditional on a REAL value being present; nothing is printed as a placeholder/default. */
export function buildTravelerProfilePromptSection(profile: TravelerProfile): string {
  const { effective, derived } = profile;
  const lines: string[] = [];

  if (effective.transportPreference) {
    lines.push(`- Transport preference: prioritize ${effective.transportPreference} (${effective.source.transportPreference})`);
  }
  if (effective.pace) {
    lines.push(`- Pace: ${effective.pace} (${effective.source.pace})`);
  }
  if (effective.budgetBand) {
    lines.push(`- Budget band (steers WHICH tier of listing to surface, never the price itself): ${effective.budgetBand}`);
  }
  if (effective.dietary.length > 0) {
    lines.push(`- Dietary: ${effective.dietary.join(", ")}`);
  }
  if (effective.mobility) {
    lines.push(`- Mobility: ${effective.mobility}`);
  }
  const modeEntries = Object.entries(derived.transportModeCounts).sort((a, b) => b[1] - a[1]);
  if (modeEntries.length > 0) {
    lines.push(`- Historically booked transport modes: ${modeEntries.map(([m, c]) => `${m} (${c})`).join(", ")}`);
  }
  const themeEntries = Object.entries(derived.dislikeThemeCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  if (themeEntries.length > 0) {
    lines.push(`- Repeated feedback themes from past re-runs: ${themeEntries.map(([t, c]) => `${t} (${c})`).join(", ")}`);
  }

  if (lines.length === 0) return "";
  return `\n\nTRAVELER PROFILE (use to steer WHICH platform service/activity fits best and HOW transport legs should be chosen — never to change any price):\n${lines.join("\n")}`;
}

// ─── DB-backed reads/writes ─────────────────────────────────────────────────────────────────────

async function readPreferences(userId: string): Promise<Record<string, any>> {
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return (row?.preferences as Record<string, any>) ?? {};
}

function sanitizeExplicit(raw: any): TravelerProfileExplicit {
  const out: TravelerProfileExplicit = {};
  if (raw && typeof raw === "object") {
    if (TRANSPORT_PREFERENCE_VALUES.includes(raw.transportPreference)) out.transportPreference = raw.transportPreference;
    if (PACE_VALUES.includes(raw.pace)) out.pace = raw.pace;
    if (BUDGET_BAND_VALUES.includes(raw.budgetBand)) out.budgetBand = raw.budgetBand;
    if (Array.isArray(raw.dietary)) {
      const tags = raw.dietary.filter((d: any) => DIETARY_VALUES.includes(d));
      if (tags.length > 0) out.dietary = tags;
    }
    if (MOBILITY_VALUES.includes(raw.mobility)) out.mobility = raw.mobility;
    if (typeof raw.updatedAt === "string") out.updatedAt = raw.updatedAt;
  }
  return out;
}

function sanitizeDislikeCounts(raw: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const chip of DISLIKE_FEEDBACK_CHIPS) {
      const v = raw[chip];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[chip] = Math.floor(v);
    }
  }
  return out;
}

/**
 * Real purchased/booked transport picks (§13: never fabricated). Sourced from
 * `transport_booking_options.booking_status IN ('booked','confirmed')` — the table's own
 * lifecycle for an actual reservation, not merely an engine-proposed or expert-confirmed
 * SUGGESTION — joined to its leg's owner via EITHER the trip-scoped home (`transport_legs.trip_id`
 * → `trips.user_id`) OR the variant-scoped home (`transport_legs.variant_id` →
 * `itinerary_variants.comparison_id` → `itinerary_comparisons.user_id`), covering both leg
 * lifecycles this codebase carries (CLAUDE.md's transport_legs scope note).
 */
async function getPurchasedTransportModeCounts(userId: string): Promise<Record<string, number>> {
  try {
    const result = await db.execute(sql`
      SELECT tbo.mode_type AS mode, COUNT(*)::int AS cnt
      FROM transport_booking_options tbo
      JOIN transport_legs tl ON tl.id = tbo.transport_leg_id
      LEFT JOIN trips t ON t.id = tl.trip_id
      LEFT JOIN itinerary_variants iv ON iv.id = tl.variant_id
      LEFT JOIN itinerary_comparisons ic ON ic.id = iv.comparison_id
      WHERE tbo.booking_status IN ('booked', 'confirmed')
        AND (t.user_id = ${userId} OR ic.user_id = ${userId})
        AND tbo.mode_type IS NOT NULL
      GROUP BY tbo.mode_type
      ORDER BY cnt DESC
    `);
    const counts: Record<string, number> = {};
    for (const row of (result.rows as any[]) ?? []) {
      if (row?.mode) counts[String(row.mode)] = Number(row.cnt) || 0;
    }
    return counts;
  } catch (err) {
    // Non-critical signal: a query failure degrades to "no derived transport signal", never a
    // thrown error that would break optimization or the profile GET.
    console.warn("[traveler-profile] purchased transport mode query failed (non-critical):", (err as Error).message);
    return {};
  }
}

/** Full profile: explicit (stored) + derived (live-computed) + effective (merged). */
export async function getTravelerProfile(userId: string): Promise<TravelerProfile> {
  const prefs = await readPreferences(userId);
  const stored = (prefs.travelerProfile as Record<string, any>) ?? {};
  const explicit = sanitizeExplicit(stored.explicit);
  const dislikeThemeCounts = sanitizeDislikeCounts(stored.derived?.dislikeThemeCounts);
  const transportModeCounts = await getPurchasedTransportModeCounts(userId);
  const topMode = Object.entries(transportModeCounts).sort((a, b) => b[1] - a[1])[0];

  const derived: TravelerProfileDerived = {
    preferredTransportMode: topMode ? topMode[0] : null,
    transportModeCounts,
    dislikeThemeCounts,
  };

  return { explicit, derived, effective: mergeTravelerProfile(explicit, derived) };
}

/** The PATCH route's tri-state contract, per field: present+value → set; present+null → clear;
 *  absent (key never appears in the object passed in) → leave untouched. Exactly the three-state
 *  contract `/api/me/storefront`'s `coverImageUrl` uses (storefront.routes.ts). */
export interface TravelerProfileExplicitPatch {
  transportPreference?: TransportPreference | null;
  pace?: Pace | null;
  budgetBand?: BudgetBand | null;
  dietary?: DietaryTag[] | null;
  mobility?: Mobility | null;
}

/**
 * Allow-list PATCH write — mirrors `/api/me/preferences`'s shallow-merge-your-own-key posture
 * EXACTLY, including storing an explicit `null` clear as a literal `null` in the jsonb (never
 * deleting the key) — `sanitizeExplicit` already treats a non-enum-member value (null included)
 * as "not set" on every read, so a cleared field reads back identically to one that was never
 * set. Only the FIVE named explicit fields are ever written; everything else on
 * `travelerProfile` (derived.*) is left completely untouched. Called from the PATCH route file
 * only.
 */
export async function updateExplicitTravelerProfile(
  userId: string,
  patch: TravelerProfileExplicitPatch,
): Promise<TravelerProfileExplicit> {
  const prefs = await readPreferences(userId);
  const current = (prefs.travelerProfile as Record<string, any>) ?? {};
  const currentExplicit = sanitizeExplicit(current.explicit);

  const nextExplicitRaw: Record<string, any> = {
    ...currentExplicit,
    ...(patch.transportPreference !== undefined ? { transportPreference: patch.transportPreference } : {}),
    ...(patch.pace !== undefined ? { pace: patch.pace } : {}),
    ...(patch.budgetBand !== undefined ? { budgetBand: patch.budgetBand } : {}),
    ...(patch.dietary !== undefined ? { dietary: patch.dietary } : {}),
    ...(patch.mobility !== undefined ? { mobility: patch.mobility } : {}),
    updatedAt: new Date().toISOString(),
  };

  await db
    .update(users)
    .set({ preferences: { ...prefs, travelerProfile: { ...current, explicit: nextExplicitRaw } } })
    .where(eq(users.id, userId));

  // Return the SANITIZED view (nulls/clears dropped) so the caller sees exactly what a
  // subsequent GET would — never an intermediate raw-with-nulls shape.
  return sanitizeExplicit(nextExplicitRaw);
}

/**
 * Records REAL dislike-feedback chips a traveler just submitted on a regenerate (called from
 * itinerary-optimizer.ts's `generateOptimizedItineraries`, which already receives them via
 * `TripPreferences.feedback`). Increments running counts under `travelerProfile.derived` —
 * shallow-merged so `explicit` is never touched. Best-effort: a failure here must never fail the
 * optimization it was called from.
 */
export async function recordDislikeFeedback(userId: string, chips: readonly string[]): Promise<void> {
  const real = chips.filter((c): c is DislikeFeedbackChip => (DISLIKE_FEEDBACK_CHIPS as readonly string[]).includes(c));
  if (real.length === 0) return;
  try {
    const prefs = await readPreferences(userId);
    const current = (prefs.travelerProfile as Record<string, any>) ?? {};
    const currentCounts = sanitizeDislikeCounts(current.derived?.dislikeThemeCounts);
    const nextCounts = { ...currentCounts };
    for (const chip of real) nextCounts[chip] = (nextCounts[chip] ?? 0) + 1;

    await db
      .update(users)
      .set({
        preferences: {
          ...prefs,
          travelerProfile: {
            ...current,
            derived: { ...(current.derived ?? {}), dislikeThemeCounts: nextCounts },
          },
        },
      })
      .where(eq(users.id, userId));
  } catch (err) {
    console.warn("[traveler-profile] recordDislikeFeedback failed (non-critical):", (err as Error).message);
  }
}
