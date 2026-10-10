/**
 * Held-batch-1 item 28: the navy cover hero's gold eyebrow, "Trip Card · final v{N}" (boards rev 15,
 * TripCard). Said only for a plan that IS final now with a known version — a plan being revised, or
 * one with no final, gets no eyebrow (§13: the card never claims a version it isn't showing).
 */
export function tripCardEyebrow(finalVersion: number | null | undefined, isFinal: boolean): string | null {
  if (!isFinal || finalVersion == null || !Number.isInteger(finalVersion) || finalVersion < 1) return null;
  return `Trip Card · final v${finalVersion}`;
}
