/**
 * TB2.6 (round 2, Leon Nov 10, 2026): a value that settles `delayMs` after it last changed. The Kyoto feed's theme
 * chips update the URL on every press (the chip is instant), but the `/api/discover` request keys on the DEBOUNCED
 * slugs, so a run of presses is one request — paired with the server's own `discoverReadRateLimiter`.
 */
import { useEffect, useState } from "react";

/** The theme filter's settle time. Named once; the server comment that sizes the limiter cites it. */
export const DISCOVER_THEME_DEBOUNCE_MS = 300;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);
  return settled;
}
