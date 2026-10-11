/**
 * TC-3b — THE TRIP PROFILE OVERLAY (ledger `2026-10-11-tc3b-ride-recommender`; TC-3 brief rev 1 profile rule).
 * A trip-level, opt-in statement that sits OVER the traveler's account profile for this one plan, at
 * `trips.preferences.profileOverlay`. It is never copied to the account profile, never inferred, and never used for
 * nudges or marketing. Kids and mobility are stated here or not at all.
 *
 *   · mobility / pace / budgetBand override the effective profile's own fields (`applyTripProfileOverlay`), merged
 *     at the two profile read sites (Optimize, and leg mode scoring) through this ONE function (§18 rule 1).
 *   · childHeightsCm and scenic feed only the ride recommender (shared/ride-recommender.ts).
 *   · skippedCorridors is written ONLY by the dismiss route ("no suggestion on this leg again this trip",
 *     ruling 3) — never by the overlay body below, which `.strict()`-refuses it (§19).
 *
 * NULL / absent = not stated (§13): an absent field leaves the account profile's answer in place.
 */
import { z } from "zod";
import { BUDGET_BAND_VALUES, MOBILITY_VALUES, PACE_VALUES, type BudgetBand, type Mobility, type Pace } from "./traveler-profile-values";

export const TRIP_PROFILE_OVERLAY_KEY = "profileOverlay" as const;
export const CHILD_HEIGHT_MIN_CM = 30;
export const CHILD_HEIGHT_MAX_CM = 200;
export const CHILD_HEIGHTS_MAX = 10;
export const SKIPPED_CORRIDORS_MAX = 200;

export interface TripProfileOverlay {
  mobility?: Mobility;
  pace?: Pace;
  budgetBand?: BudgetBand;
  scenic?: boolean;
  childHeightsCm?: number[];
  skippedCorridors?: string[];
}

/**
 * THE OWNER'S WRITE BODY (§19 allowlist, `.strict()`): each field optional; `null` clears it. `skippedCorridors`
 * is not admitted — the dismiss route is its one writer.
 */
export const tripProfileOverlayBody = z
  .object({
    mobility: z.enum(MOBILITY_VALUES).nullable().optional(),
    pace: z.enum(PACE_VALUES).nullable().optional(),
    budgetBand: z.enum(BUDGET_BAND_VALUES).nullable().optional(),
    scenic: z.boolean().nullable().optional(),
    childHeightsCm: z.array(z.number().int().min(CHILD_HEIGHT_MIN_CM).max(CHILD_HEIGHT_MAX_CM)).max(CHILD_HEIGHTS_MAX).nullable().optional(),
  })
  .strict();
export type TripProfileOverlayBody = z.infer<typeof tripProfileOverlayBody>;

const isIn = <T extends string>(set: readonly T[], v: unknown): v is T => typeof v === "string" && (set as readonly string[]).includes(v);

/** Read the overlay off a trip's `preferences` jsonb, keeping only well-formed fields (anything else is dropped). */
export function parseTripProfileOverlay(preferences: unknown): TripProfileOverlay {
  const raw = preferences && typeof preferences === "object" ? (preferences as Record<string, unknown>)[TRIP_PROFILE_OVERLAY_KEY] : null;
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: TripProfileOverlay = {};
  if (isIn(MOBILITY_VALUES, o.mobility)) out.mobility = o.mobility;
  if (isIn(PACE_VALUES, o.pace)) out.pace = o.pace;
  if (isIn(BUDGET_BAND_VALUES, o.budgetBand)) out.budgetBand = o.budgetBand;
  if (typeof o.scenic === "boolean") out.scenic = o.scenic;
  if (Array.isArray(o.childHeightsCm)) {
    const h = o.childHeightsCm.filter((n): n is number => Number.isInteger(n) && n >= CHILD_HEIGHT_MIN_CM && n <= CHILD_HEIGHT_MAX_CM);
    if (h.length) out.childHeightsCm = h.slice(0, CHILD_HEIGHTS_MAX);
  }
  if (Array.isArray(o.skippedCorridors)) {
    const k = o.skippedCorridors.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 160);
    if (k.length) out.skippedCorridors = k.slice(0, SKIPPED_CORRIDORS_MAX);
  }
  return out;
}

type ProfileSource = "explicit" | "derived" | "none";
interface OverlayableProfile {
  pace?: Pace;
  budgetBand?: BudgetBand;
  mobility?: Mobility;
  source: Record<string, ProfileSource> & { pace: ProfileSource; budgetBand: ProfileSource; mobility: ProfileSource };
}

/**
 * The trip's own statement wins over the account profile for this plan. A field the overlay does not state is
 * left exactly as it was; a stated field is marked `explicit` (the traveler said it, for this trip).
 */
export function applyTripProfileOverlay<T extends OverlayableProfile>(effective: T, overlay: TripProfileOverlay): T {
  const next: T = { ...effective, source: { ...effective.source } };
  if (overlay.mobility) { next.mobility = overlay.mobility; next.source.mobility = "explicit"; }
  if (overlay.pace) { next.pace = overlay.pace; next.source.pace = "explicit"; }
  if (overlay.budgetBand) { next.budgetBand = overlay.budgetBand; next.source.budgetBand = "explicit"; }
  return next;
}

/** The overlay patch a write body makes: stated fields set, `null` fields removed (jsonb_strip_nulls drops them). */
export function overlayPatchFromBody(body: TripProfileOverlayBody): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of ["mobility", "pace", "budgetBand", "scenic", "childHeightsCm"] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  return patch;
}
