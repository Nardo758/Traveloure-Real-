/**
 * Row 306: the selection profile's tunables. Price bands are a planning signal (how this traveler tends to spend
 * on a stop), never a fee, rate or charge. A cost in another currency gets no band (it is not converted).
 */
import type { PriceBandBounds } from "@shared/selection-profile";

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function selectionPriceBandBounds(env: NodeJS.ProcessEnv = process.env): PriceBandBounds {
  return {
    currency: (env.SELECTION_PRICE_BAND_CURRENCY || "USD").toUpperCase(),
    lowMax: num(env.SELECTION_PRICE_BAND_LOW_MAX, 30),
    midMax: num(env.SELECTION_PRICE_BAND_MID_MAX, 120),
  };
}

/** A value picked fewer times than this is not a trait. */
export function selectionTraitMinCount(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(1, Math.floor(num(env.SELECTION_TRAIT_MIN_COUNT, 3)));
}

/** The profile reads at most this many of the traveler's newest rows. */
export function selectionProfileReadLimit(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(1, Math.floor(num(env.SELECTION_PROFILE_READ_LIMIT, 500)));
}
