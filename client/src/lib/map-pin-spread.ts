/**
 * R3 pin spreading (Leon, Nov 23 2026).
 *
 * In R3 mode only, a pin whose point lands within ~220 m of an already-placed pin is nudged onto a deterministic
 * 8-point ring around its own point: stable order (the scene's stop order), no leader lines, the same result on every
 * render. Anchors (the stay ring) and browse dots are never moved.
 */
export const PIN_SPREAD_DEGREES = 0.0018;
export const PIN_SPREAD_THRESHOLD = 0.002;

export function spreadPins<T extends { kind: string; lat: number; lng: number }>(markers: readonly T[]): T[] {
  const placed: Array<{ lat: number; lng: number }> = [];
  return markers.map((m) => {
    if (m.kind !== "pin") return m;
    const tooClose = (p: { lat: number; lng: number }) => Math.hypot(p.lat - m.lat, p.lng - m.lng) < PIN_SPREAD_THRESHOLD;
    let lat = m.lat;
    let lng = m.lng;
    let step = 0;
    while (placed.some(tooClose) && step < 8) {
      step += 1;
      const angle = (Math.PI * 2 * step) / 8;
      lat = m.lat + Math.sin(angle) * PIN_SPREAD_DEGREES;
      lng = m.lng + Math.cos(angle) * PIN_SPREAD_DEGREES;
    }
    placed.push({ lat, lng });
    return { ...m, lat, lng };
  });
}
