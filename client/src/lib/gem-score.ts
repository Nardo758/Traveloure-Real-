/**
 * TravelPulse gem scores are stored as integer values from 0–100.
 * A zero is the database's unscored default, not a meaningful score.
 */
export function normalizeGemScore(value: unknown): number | null {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return null;
  return Math.round(score);
}

/**
 * §5 meta-line grammar: the gem-score fragment always carries its label
 * (`gem score {N}`) — never a bare number. Omitted (null) on zero, null,
 * or any non-finite input, per the label-goes-with-its-value rule.
 */
export function gemScoreMetaFragment(value: unknown): string | null {
  const score = normalizeGemScore(value);
  return score !== null ? `gem score ${score}` : null;
}