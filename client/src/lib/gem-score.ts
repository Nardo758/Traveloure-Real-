/**
 * TravelPulse gem scores are stored as integer values from 0–100.
 * A zero is the database's unscored default, not a meaningful score.
 */
export function normalizeGemScore(value: unknown): number | null {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return null;
  return Math.round(score);
}