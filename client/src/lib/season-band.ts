/**
 * Season bands (ledger `2026-10-23-season-band-haswindow-badge`). Architect ruling, Oct 22: a band reuses
 * `season_windows_<market>`; with no window it still shows for the whole month, without the "In season" badge,
 * and it is never hidden. `hasWindow` false or missing (an older payload) both mean no window.
 */
export function bandInSeason(band: { hasWindow?: boolean | null }): boolean {
  return band.hasWindow === true;
}

/** Splits bands for display: windowed ones carry the "In season" badge; the rest render without it. Never drops one. */
export function splitBandsBySeason<T extends { hasWindow?: boolean | null }>(bands: readonly T[]): { inSeason: T[]; noWindow: T[] } {
  const inSeason: T[] = [];
  const noWindow: T[] = [];
  for (const b of bands) (bandInSeason(b) ? inSeason : noWindow).push(b);
  return { inSeason, noWindow };
}
