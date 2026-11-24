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

/**
 * Screen-space pass (Leon, Nov 23 2026): pins whose 26px icons would overlap are nudged apart ON SCREEN, which is what a
 * reader needs. Anchors (the stay ring) never move - pins move around them - and the order is the scene's stop order, so
 * the result is the same on every render at the same zoom.
 */
export const PIN_ICON_PX = 26;
export const PIN_GAP_PX = PIN_ICON_PX;

export function spreadPinsPx<T extends { kind: string; x: number; y: number }>(
  items: readonly T[],
  gapPx: number = PIN_GAP_PX,
): T[] {
  const fixed = items.filter((i) => i.kind !== "pin").map((i) => ({ x: i.x, y: i.y }));
  const placed = [...fixed];
  return items.map((item) => {
    if (item.kind !== "pin") return item;
    let { x, y } = item;
    let step = 0;
    const clashes = () => placed.some((q) => Math.hypot(q.x - x, q.y - y) < gapPx);
    while (clashes() && step < 12) {
      step += 1;
      const angle = (Math.PI * 2 * step) / 12;
      x = item.x + Math.cos(angle) * gapPx;
      y = item.y + Math.sin(angle) * gapPx;
    }
    placed.push({ x, y });
    return { ...item, x, y };
  });
}
