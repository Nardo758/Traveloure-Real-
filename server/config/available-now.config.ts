/**
 * How long one press of "Available now" lasts (Locked Decision 54). Config, never a literal at the
 * call site. `AVAILABLE_NOW_WINDOW_MINUTES` overrides; default 120, clamped to 15..720 so a
 * mistyped value can neither blink off at once nor leave an earner "available" overnight.
 */
export function availableNowWindowMinutes(): number {
  const raw = Number(process.env.AVAILABLE_NOW_WINDOW_MINUTES);
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  return Math.min(720, Math.max(15, Math.floor(raw)));
}
